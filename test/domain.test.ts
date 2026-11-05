import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { buildPaperNote, changedFrontmatter, COMMENT_HEADING, REFERENCE_HEADING, syncPaperNote } from "../src/domain/markdown";
import { countByStatus, findDuplicate, suggestFileName, visiblePapers } from "../src/domain/papers";
import {
  formatAuthors,
  isValidZoteroKey,
  normalizeYear,
  parseReferenceLink,
  referenceLinkMarkdown,
  zoteroPrefill,
} from "../src/domain/references";
import { migrateSettings, type Paper } from "../src/domain/settings";

function paper(overrides: Partial<Paper> = {}): Paper {
  return {
    id: "p1",
    title: "A study",
    authors: "Smith et al.",
    year: "2024",
    journal: "Journal of Tests",
    doi: "10.1000/xyz",
    category: "empirical",
    status: "toread",
    rating: 3,
    comment: "",
    tags: [],
    added: "2026-11-01T10:00:00.000Z",
    updated: "2026-11-01T10:00:00.000Z",
    filePath: "Literature Tracker/2024-a-study.md",
    zoteroKey: "",
    ...overrides,
  };
}

describe("references", () => {
  it.each([
    ["10.1038/nn.4504", "10.1038/nn.4504", "https://doi.org/10.1038/nn.4504"],
    ["doi: 10.1038/nn.4504", "10.1038/nn.4504", "https://doi.org/10.1038/nn.4504"],
    ["https://doi.org/10.1038/nn.4504", "10.1038/nn.4504", "https://doi.org/10.1038/nn.4504"],
    ["10.1002/(SICI)1097-0258", "10.1002/(SICI)1097-0258", "https://doi.org/10.1002/(SICI)1097-0258"],
    ["10.1000/a#b", "10.1000/a#b", "https://doi.org/10.1000/a%23b"],
  ])("parses DOI %j", (input, doi, url) => {
    expect(parseReferenceLink(input)).toEqual({ doi, url });
  });

  it("accepts http(s) links and rejects other schemes", () => {
    expect(parseReferenceLink("https://arxiv.org/abs/1706.03762").url).toBe("https://arxiv.org/abs/1706.03762");
    expect(parseReferenceLink("javascript:alert(1)")).toEqual({ doi: null, url: null });
    expect(parseReferenceLink("file:///etc/passwd")).toEqual({ doi: null, url: null });
  });

  it("escapes DOI link text so it can't inject another link (review finding 7)", () => {
    const evil = "10.1000/x](obsidian://open?file=x)[y";
    const markdown = referenceLinkMarkdown(evil);
    expect(markdown.startsWith("[10.1000/x\\](obsidian://open?file=x)\\[y](<https://doi.org/")).toBe(true);
    // Every "](" before the real link is escaped, so only the doi.org link is clickable.
    expect(markdown).not.toMatch(/[^\\]\]\(obsidian/);
  });

  it("renders links that survive parentheses and strips markup from plain text", () => {
    expect(referenceLinkMarkdown("10.1002/(SICI)1097")).toBe("[10.1002/(SICI)1097](<https://doi.org/10.1002/(SICI)1097>)");
    expect(referenceLinkMarkdown("javascript:alert(1)")).toBe("javascript:alert1");
  });

  it("normalizes years and Zotero keys", () => {
    expect(normalizeYear("2025")).toBe("2025");
    expect(normalizeYear(1999)).toBe("1999");
    expect(normalizeYear("20a5")).toBe("");
    expect(normalizeYear("year: 1")).toBe("");
    expect(isValidZoteroKey("ABCD1234")).toBe(true);
    expect(isValidZoteroKey("a/../b")).toBe(false);
  });

  it("formats author lists", () => {
    expect(formatAuthors([{ fullName: "Ada Lovelace", lastName: "Lovelace" }])).toBe("Ada Lovelace");
    expect(formatAuthors([{ lastName: "Lovelace" }, { lastName: "Babbage" }])).toBe("Lovelace & Babbage");
    expect(formatAuthors([{ lastName: "A" }, { lastName: "B" }, { lastName: "C" }])).toBe("A et al.");
    expect(formatAuthors(undefined)).toBe("");
  });

  it("maps Zotero items defensively", () => {
    expect(zoteroPrefill({ title: " T ", key: "ABCD1234", date: { year: 2021 }, authors: [{ fullName: "X Y" }] })).toEqual({
      title: "T",
      authors: "X Y",
      year: "2021",
      journal: "",
      doi: "",
      zoteroKey: "ABCD1234",
    });
    expect(zoteroPrefill(null)).toMatchObject({ title: "", zoteroKey: "" });
    expect(zoteroPrefill({ key: "../evil" }).zoteroKey).toBe("");
  });
});

describe("migrateSettings", () => {
  it("upgrades v1 papers and repairs bad values", () => {
    const settings = migrateSettings({
      papersFolderPath: "Reading",
      categories: [],
      statuses: [],
      papers: [
        { id: "1", title: "Good", year: "2020", rating: 9, status: "reading", category: "methods", zoteroKey: "ABCD1234" },
        { id: "2", title: "Bad", year: "abc: def", rating: "x", status: "??", zoteroKey: "a b" },
        { title: "" },
      ],
    });
    expect(settings.papersFolderPath).toBe("Reading");
    expect(settings.papers).toHaveLength(2);
    expect(settings.papers[0]).toMatchObject({ year: "2020", rating: 5, status: "reading", category: "methods", zoteroKey: "ABCD1234" });
    expect(settings.papers[1]).toMatchObject({ year: "", rating: 0, status: "toread", category: "other", zoteroKey: "" });
    expect(settings).not.toHaveProperty("categories");
  });

  it("unlinks papers that shared one note in version 1 (review finding 2)", () => {
    const settings = migrateSettings({
      papers: [
        { id: "1", title: "A", filePath: "Lit/2020-paper.md" },
        { id: "2", title: "B", filePath: "Lit/2020-paper.md" },
      ],
    });
    expect(settings.papers.map((p) => p.filePath)).toEqual(["Lit/2020-paper.md", null]);
  });
});

describe("papers", () => {
  const papers = [
    paper({ id: "a", status: "read", added: "2026-11-03T00:00:00Z" }),
    paper({ id: "b", status: "reading", added: "2026-11-01T00:00:00Z", title: "Graph theory" }),
    paper({ id: "c", status: "toread", added: "2026-11-02T00:00:00Z", category: "review", doi: "https://doi.org/10.5555/ABC" }),
  ];

  it("sorts papers being read first, then newest", () => {
    expect(visiblePapers(papers, "all", "").map((p) => p.id)).toEqual(["b", "a", "c"]);
    expect(visiblePapers(papers, "review", "").map((p) => p.id)).toEqual(["c"]);
    expect(visiblePapers(papers, "all", "graph").map((p) => p.id)).toEqual(["b"]);
  });

  it("counts statuses and suggests file names", () => {
    expect(countByStatus(papers)).toEqual({ toread: 1, reading: 1, read: 1, reviewed: 0 });
    expect(suggestFileName("Deep Learning: A Review", "2015", new Date(2026, 0, 1))).toBe("2015-deep-learning-a-review");
    expect(suggestFileName("???", "", new Date(2026, 0, 1))).toBe("2026-paper");
  });

  it("finds duplicates by DOI (any spelling) or Zotero key", () => {
    expect(findDuplicate(papers, { doi: "doi:10.5555/abc" })?.id).toBe("c");
    expect(findDuplicate(papers, { doi: "10.5555/abc" }, "c")).toBeUndefined();
    expect(findDuplicate([paper({ zoteroKey: "K1" })], { zoteroKey: "K1" })?.id).toBe("p1");
    expect(findDuplicate(papers, { doi: "" })).toBeUndefined();
  });
});

describe("paper notes", () => {
  it("writes valid frontmatter and omits empty fields", () => {
    const note = buildPaperNote(paper({ title: 'Title: with "quotes"', journal: "", zoteroKey: "ABCD1234" }));
    const fm = parse(/^---\n([\s\S]*?)\n---/.exec(note)?.[1] ?? "") as Record<string, unknown>;
    expect(fm).toMatchObject({ title: 'Title: with "quotes"', year: 2024, rating: 3, zoteroKey: "ABCD1234", "paper-id": "p1" });
    expect(fm).not.toHaveProperty("journal");
    expect(note).toContain("[Open in Zotero](zotero://select/library/items/ABCD1234)");
    expect(note).toContain("[10.1000/xyz](<https://doi.org/10.1000/xyz>)");
  });

  it("updates the reference block and comment but keeps notes", () => {
    const original = `${buildPaperNote(paper())}\nMy detailed notes $& stay\n`;
    const { content: updated, keptEdits } = syncPaperNote(original, paper(), paper({ title: "Renamed", authors: "Doe", comment: "Great paper" }));
    expect(keptEdits).toBe(false);
    expect(updated).toContain("# Renamed");
    expect(updated).toContain(`${REFERENCE_HEADING}\n\n- **Authors:** Doe`);
    expect(updated).toContain(`${COMMENT_HEADING}\n\nGreat paper\n\n## 📝 Notes`);
    expect(updated).toContain("My detailed notes $& stay");
  });

  it("keeps version 1 notes in sync", () => {
    const v1 = [
      "---",
      'title: "Old"',
      "---",
      "# Old",
      "",
      "**Authors:** A",
      "**Status:** 📥 To Read",
      "**Importance:** Not rated",
      "",
      "---",
      "",
      "## 💬 Quick Comment",
      "",
      "old comment",
      "",
      "---",
      "",
      "## 📝 Notes",
      "",
      "mine",
    ].join("\n");
    const before = paper({ title: "Old", authors: "A", comment: "old comment" });
    const { content: updated } = syncPaperNote(v1, before, paper({ title: "Old", authors: "B", status: "read", rating: 2, comment: "new comment" }));
    expect(updated).toContain("**Authors:** B");
    expect(updated).toContain("**Status:** ✅ Read");
    expect(updated).toContain("**Importance:** ⭐⭐");
    expect(updated).toContain("## 💬 Quick Comment\n\nnew comment\n\n---");
    expect(updated).toContain("mine");
  });

  it("shows Zotero titles and authors literally", () => {
    const note = buildPaperNote(paper({ title: "Bad [x](obsidian://y)", authors: "<img src=x>" }));
    expect(note).toContain("# Bad \\[x\\](obsidian://y)");
    expect(note).toContain("- **Authors:** \\<img src=x\\>");
  });

  it("keeps edits the user made to generated sections", () => {
    const before = paper({ comment: "first" });
    const edited = buildPaperNote(before).replace("first", "first, plus my thoughts");
    const result = syncPaperNote(edited, before, paper({ comment: "second" }));
    expect(result.keptEdits).toBe(true);
    expect(result.content).toContain("first, plus my thoughts");
  });

  it("writes only changed frontmatter fields, so tags survive a status change (review finding 3)", () => {
    const before = paper({ tags: [] });
    const fields = changedFrontmatter(before, paper({ tags: [], status: "read", updated: "2026-11-05T00:00:00.000Z" }));
    expect(fields).toEqual({ status: "read", updated: "2026-11-05T00:00:00.000Z", "paper-id": "p1" });
    expect(fields).not.toHaveProperty("tags");
  });
});
