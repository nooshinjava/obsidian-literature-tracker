import { Notice, Plugin, type TAbstractFile } from "obsidian";
import { noteSyncMessage, SaveQueue, VIEW_TYPES } from "@orbitkit/shared";
import {
  confirmAction,
  forEachView,
  handleAsync,
  ObsidianNoteStore,
  openNote,
  PluginDataStore,
  revealSiblingView,
  revealView,
} from "@orbitkit/shared/obsidian";
import { zoteroPrefill, type PaperPrefill } from "./domain/references";
import { migrateSettings, SCHEMA_VERSION, type Paper } from "./domain/settings";
import { PaperService, type PaperInput } from "./services/paper-service";
import type { LiteratureController } from "./ui/controller";
import { LiteratureView } from "./ui/literature-view";
import { PaperModal } from "./ui/paper-modal";
import { LiteratureSettingTab } from "./ui/settings-tab";
import { getZoteroBridge, pickZoteroItem } from "./ui/zotero";

export default class LiteratureTrackerPlugin extends Plugin implements LiteratureController {
  service!: PaperService;

  override async onload(): Promise<void> {
    const data = new PluginDataStore(this, SCHEMA_VERSION, "Literature Tracker");
    const settings = migrateSettings(await data.load());
    const queue = new SaveQueue(data);
    const save = () => queue.save(settings);
    this.service = new PaperService(settings, {
      store: new ObsidianNoteStore(this.app),
      save,
      onChange: () => this.refreshViews(),
    });
    if (data.loadedStatus === "outdated") await save();

    this.registerView(VIEW_TYPES.literatureTracker, (leaf) => new LiteratureView(leaf, this));
    this.addRibbonIcon(
      "book-open",
      "Open Literature Tracker",
      handleAsync("Could not open Literature Tracker", () => this.openPanel()),
    );

    this.addCommand({ id: "add-paper", name: "Add paper", callback: () => this.openAddPaper() });
    this.addCommand({
      id: "import-from-zotero",
      name: "Import paper from Zotero",
      callback: handleAsync("Zotero import failed", () => this.importFromZotero()),
    });
    this.addCommand({
      id: "open-panel",
      name: "Open panel",
      callback: handleAsync("Could not open Literature Tracker", () => this.openPanel()),
    });

    this.addSettingTab(new LiteratureSettingTab(this.app, this, this.service, save));

    // Data from a newer plugin version is read-only, so background link updates are skipped.
    if (data.readOnly) return;
    this.registerEvent(
      this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) =>
        handleAsync("Could not update a moved paper note", () => this.service.handleRename(oldPath, file.path))(),
      ),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file: TAbstractFile) =>
        handleAsync("Could not update a deleted paper note", () => this.service.handleDelete(file.path))(),
      ),
    );
  }

  async openPanel(): Promise<void> {
    await revealView(this.app, VIEW_TYPES.literatureTracker);
  }

  openAddPaper(prefill: Partial<PaperPrefill> = {}): void {
    new PaperModal(this.app, this, { kind: "add", prefill }).open();
  }

  openEditPaper(paper: Paper): void {
    new PaperModal(this.app, this, { kind: "edit", paper }).open();
  }

  async openPaperNote(paper: Paper): Promise<void> {
    await openNote(this.app, await this.service.ensurePaperNote(paper.id));
  }

  async updatePaper(id: string, changes: Partial<PaperInput>): Promise<void> {
    const { note } = await this.service.updatePaper(id, changes);
    new Notice(noteSyncMessage("Paper", note) ?? "Paper updated");
  }

  async deletePaper(paper: Paper): Promise<boolean> {
    const confirmed = await confirmAction(this.app, {
      title: "Delete paper?",
      message: `"${paper.title}" will be removed from Literature Tracker and its note moved to the trash.`,
    });
    if (!confirmed) return false;
    const { noteKept } = await this.service.deletePaper(paper.id, { trashNote: true });
    new Notice(noteKept ? "Paper deleted. Its note was kept because it couldn't be confirmed as this paper's note." : "Paper deleted");
    return true;
  }

  isZoteroAvailable(): boolean {
    return getZoteroBridge() !== null;
  }

  async importFromZotero(): Promise<void> {
    const api = getZoteroBridge();
    if (!api) {
      new Notice("Install and enable the Zotero Bridge plugin to import from Zotero.");
      return;
    }
    let values: unknown;
    try {
      values = await pickZoteroItem(api);
    } catch (error) {
      console.error("[OrbitKit] Zotero import failed", error);
      new Notice("Could not reach Zotero. Make sure Zotero is running.");
      return;
    }
    if (values === null || values === undefined) return;

    const prefill = zoteroPrefill(values);
    const existing = this.service.findDuplicate({ zoteroKey: prefill.zoteroKey, doi: prefill.doi });
    if (existing) {
      new Notice(`"${existing.title}" is already in your tracker.`);
      this.openEditPaper(existing);
      return;
    }
    this.openAddPaper(prefill);
  }

  async openIdeaVault(): Promise<void> {
    await revealSiblingView(this.app, VIEW_TYPES.ideaVault, "Idea Vault");
  }

  async openMindfulFocus(): Promise<void> {
    await revealSiblingView(this.app, VIEW_TYPES.mindfulFocus, "Mindful Focus");
  }

  private refreshViews(): void {
    forEachView(
      this.app,
      VIEW_TYPES.literatureTracker,
      (view): view is LiteratureView => view instanceof LiteratureView,
      (view) => view.render(),
    );
  }
}
