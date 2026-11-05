import { describe, expect, it } from "vitest";
import { MemoryNoteStore } from "@orbitkit/shared/testing";
import { migrateSettings } from "../src/domain/settings";
import { PaperService } from "../src/services/paper-service";

function setup(files: Record<string, string> = {}) {
  const store = new MemoryNoteStore(files);
  const settings = migrateSettings(null);
  let saves = 0;
  const service = new PaperService(settings, {
    store,
    save: () => {
      saves += 1;
      return Promise.resolve();
    },
    now: () => new Date(2026, 10, 4, 9, 0),
  });
  return { store, service, saves: () => saves };
}

describe("PaperService", () => {
  it("adds a paper with a note", async () => {
    const { store, service, saves } = setup();
    const paper = await service.addPaper({ title: "Attention Is All You Need", year: "2017", rating: 7, tags: "nlp" });
    expect(paper.filePath).toBe("Literature Tracker/2017-attention-is-all-you-need.md");
    expect(paper.rating).toBe(5);
    expect(store.frontmatterOf(paper.filePath ?? "")).toMatchObject({ title: "Attention Is All You Need", year: 2017, tags: ["nlp"] });
    expect(saves()).toBe(1);
  });

  it("never overwrites an unrelated note with the same name (v1 bug)", async () => {
    const existing = "# My own note\n\n---\n\nimportant text";
    const { store, service } = setup({ "Literature Tracker/2017-paper.md": existing });
    const paper = await service.addPaper({ title: "Paper", year: "2017" });
    expect(store.files.get("Literature Tracker/2017-paper.md")).toBe(existing);
    expect(paper.filePath).toBe("Literature Tracker/2017-paper 1.md");
  });

  it("gives two papers with the same title separate notes", async () => {
    const { service } = setup();
    const first = await service.addPaper({ title: "Same", year: "2020" });
    const second = await service.addPaper({ title: "Same", year: "2020" });
    expect(first.filePath).not.toBe(second.filePath);
    await service.deletePaper(second.id, { trashNote: true });
    expect(service.find(first.id)).toBeDefined();
  });

  it("updates frontmatter, reference and comment while keeping user notes and properties", async () => {
    const { store, service } = setup();
    const paper = await service.addPaper({ title: "Draft", journal: "J", doi: "10.1/x" });
    const path = paper.filePath ?? "";
    await store.process(path, (content) => content.replace("### Key findings\n\n- ", "### Key findings\n\n- my finding"));
    await store.updateFrontmatter(path, (fm) => (fm.aliases = ["custom"]));

    const result = await service.updatePaper(paper.id, { title: "Final", journal: "", doi: "", comment: "Worth it", status: "read" });
    expect(result.note).toEqual({ status: "updated" });

    const fm = store.frontmatterOf(path);
    expect(fm).toMatchObject({ title: "Final", status: "read", aliases: ["custom"] });
    expect(fm).not.toHaveProperty("journal");
    expect(fm).not.toHaveProperty("doi");
    const content = store.files.get(path) ?? "";
    expect(content).toContain("- my finding");
    expect(content).toContain("Worth it");
    expect(content).not.toContain("**DOI / link:**");
  });

  it("rejects empty titles and unknown papers", async () => {
    const { service } = setup();
    await expect(service.addPaper({ title: "" })).rejects.toThrow();
    await expect(service.updatePaper("nope", { title: "x" })).rejects.toThrow();
  });

  it("recreates a deleted note when opened and follows renames", async () => {
    const { store, service } = setup();
    const paper = await service.addPaper({ title: "Moving" });
    await service.handleRename(paper.filePath ?? "", "Reading/moving.md");
    expect(service.find(paper.id)?.filePath).toBe("Reading/moving.md");
    await service.handleDelete("Reading/moving.md");
    expect(service.find(paper.id)?.filePath).toBeNull();
    const path = await service.ensurePaperNote(paper.id);
    expect(store.exists(path)).toBe(true);
  });

  it("drops invalid Zotero keys", async () => {
    const { service } = setup();
    const paper = await service.addPaper({ title: "Z", zoteroKey: "../../x" });
    expect(paper.zoteroKey).toBe("");
  });
});

describe("review regressions", () => {
  it("keeps tags added in the note when only the status changes (finding 3)", async () => {
    const { store, service } = setup();
    const paper = await service.addPaper({ title: "Tagged" });
    const path = paper.filePath ?? "";
    await store.updateFrontmatter(path, (fm) => (fm.tags = ["added-in-note"]));
    await service.updatePaper(paper.id, { status: "reading" });
    expect(store.frontmatterOf(path)).toMatchObject({ status: "reading", tags: ["added-in-note"] });
  });

  it("doesn't wipe the user's notes when the comment contains stray fences (finding 1)", async () => {
    const { store, service } = setup();
    const paper = await service.addPaper({ title: "Fenced", comment: "```pip install foo``` worked\n```python\nx = 1" });
    const path = paper.filePath ?? "";
    await store.process(path, (content) => content.replace("### Key findings\n\n- ", "### Key findings\n\n- my finding"));
    await service.updatePaper(paper.id, { status: "read", comment: "short" });
    const content = store.files.get(path) ?? "";
    expect(content).toContain("- my finding");
    expect(content).toContain("## 📎 Related");
    expect(content).toContain("## 💬 Quick comment\n\nshort\n\n## 📝 Notes");
  });

  it("never trashes another paper's note (finding 2)", async () => {
    const shared = "Literature Tracker/2017-paper.md";
    const { store, service } = setup({ [shared]: "# v1 note" });
    service.settings.papers.push(
      { ...(await service.addPaper({ title: "A" })), id: "x1", filePath: shared },
    );
    const other = await service.addPaper({ title: "B" });
    other.filePath = shared;
    const result = await service.deletePaper(other.id, { trashNote: true });
    expect(result).toEqual({ noteTrashed: false, noteKept: true });
    expect(store.exists(shared)).toBe(true);
  });
});
