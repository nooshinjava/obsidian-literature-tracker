import { ItemView, type WorkspaceLeaf } from "obsidian";
import { VIEW_TYPES } from "@orbitkit/shared";
import { handleAsync } from "@orbitkit/shared/obsidian";
import { CATEGORY_FILTERS, countByStatus, STATUS_FILTERS, visiblePapers, type FilterOption, type PaperFilter } from "../domain/papers";
import type { LiteratureController } from "./controller";
import { renderPaperCard } from "./paper-card";

export class LiteratureView extends ItemView {
  private filter: PaperFilter = "all";
  private query = "";
  private listEl: HTMLElement | null = null;
  private filterButtons: Array<{ id: PaperFilter; button: HTMLButtonElement }> = [];

  constructor(
    leaf: WorkspaceLeaf,
    private readonly controller: LiteratureController,
  ) {
    super(leaf);
  }

  override getViewType(): string {
    return VIEW_TYPES.literatureTracker;
  }

  override getDisplayText(): string {
    return "Literature Tracker";
  }

  override getIcon(): string {
    return "book-open";
  }

  override onOpen(): Promise<void> {
    this.render();
    return Promise.resolve();
  }

  override onClose(): Promise<void> {
    this.contentEl.empty();
    return Promise.resolve();
  }

  render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("orbitkit-view", "literature-tracker-view");

    const actions = root.createDiv({ cls: "orbitkit-actions" });
    this.addActionButton(actions, "📄 Add paper", () => this.controller.openAddPaper(), "mod-cta");
    if (this.controller.isZoteroAvailable()) {
      this.addActionButton(
        actions,
        "📚 Import from Zotero",
        handleAsync("Zotero import failed", () => this.controller.importFromZotero()),
        "literature-tracker-zotero",
      );
    }
    this.addActionButton(actions, "💡 Ideas", handleAsync("Could not open Idea Vault", () => this.controller.openIdeaVault()));
    this.addActionButton(actions, "🎯 Focus", handleAsync("Could not open Mindful Focus", () => this.controller.openMindfulFocus()));

    const papers = this.controller.service.papers;
    const counts = countByStatus(papers);
    const stats = root.createDiv({ cls: "orbitkit-stats" });
    for (const [value, label] of [
      [papers.length, "Total"],
      [counts.toread, "📥 To read"],
      [counts.reading, "📖 Reading"],
      [counts.read + counts.reviewed, "✅ Done"],
    ] as const) {
      const stat = stats.createDiv({ cls: "orbitkit-stat" });
      stat.createDiv({ cls: "orbitkit-stat-value", text: String(value) });
      stat.createDiv({ cls: "orbitkit-stat-label", text: label });
    }

    const search = root.createEl("input", {
      type: "search",
      attr: { placeholder: "Search papers…", "aria-label": "Search papers" },
    });
    search.value = this.query;
    search.addEventListener("input", () => {
      this.query = search.value;
      this.renderList();
    });

    // Status and category filters form one single-choice group split over two rows.
    this.filterButtons = [];
    this.renderFilterRow(root, STATUS_FILTERS, "Filter by status");
    this.renderFilterRow(root, CATEGORY_FILTERS, "Filter by category");

    const section = root.createDiv({ cls: "orbitkit-section" });
    section.createEl("h3", { cls: "orbitkit-section-title", text: "📚 Papers" });
    this.listEl = section.createDiv();
    this.renderList();
  }

  private renderFilterRow(parent: HTMLElement, options: readonly FilterOption[], label: string): void {
    const row = parent.createDiv({ cls: "orbitkit-chips", attr: { role: "group", "aria-label": label } });
    for (const option of options) {
      const button = row.createEl("button", { cls: "orbitkit-chip", text: option.label, attr: { type: "button" } });
      button.addEventListener("click", () => {
        this.filter = option.id;
        this.syncFilterButtons();
        this.renderList();
      });
      this.filterButtons.push({ id: option.id, button });
    }
    this.syncFilterButtons();
  }

  private syncFilterButtons(): void {
    for (const { id, button } of this.filterButtons) {
      const selected = id === this.filter;
      button.toggleClass("is-selected", selected);
      button.setAttr("aria-pressed", String(selected));
    }
  }

  private renderList(): void {
    const list = this.listEl;
    if (!list) return;
    list.empty();
    const papers = visiblePapers(this.controller.service.papers, this.filter, this.query);
    if (papers.length === 0) {
      const empty = list.createDiv({ cls: "orbitkit-empty-state" });
      empty.createDiv({ cls: "orbitkit-empty-state-icon", text: "📚" });
      const filtered = this.query.trim() !== "" || this.filter !== "all";
      empty.createEl("p", { text: filtered ? "No papers match." : "No papers yet. Add your first one!" });
      return;
    }
    for (const paper of papers) renderPaperCard(list, paper, this.controller);
  }

  private addActionButton(parent: HTMLElement, text: string, onClick: () => void, cls?: string): void {
    const button = parent.createEl("button", { text, attr: { type: "button" } });
    if (cls) button.addClass(cls);
    button.addEventListener("click", onClick);
  }
}
