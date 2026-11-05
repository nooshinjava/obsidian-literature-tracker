import { Modal, Notice, type App } from "obsidian";
import {
  addButtonRow,
  addTextArea,
  addTextInput,
  confirmAction,
  createChipGroup,
  createField,
  handleAsync,
  onModEnter,
  type ButtonSpec,
} from "@orbitkit/shared/obsidian";
import type { PaperPrefill } from "../domain/references";
import type { Paper } from "../domain/settings";
import {
  DEFAULT_CATEGORY,
  DEFAULT_STATUS,
  MAX_RATING,
  PAPER_CATEGORIES,
  PAPER_STATUSES,
  type PaperCategoryId,
  type PaperStatusId,
} from "../domain/taxonomy";
import type { LiteratureController } from "./controller";

const CATEGORY_OPTIONS = PAPER_CATEGORIES.map((category) => ({ id: category.id, label: `${category.icon} ${category.name}` }));
const STATUS_OPTIONS = PAPER_STATUSES.map((status) => ({ id: status.id, label: `${status.icon} ${status.name}` }));

export type PaperModalMode = { kind: "add"; prefill: Partial<PaperPrefill> } | { kind: "edit"; paper: Paper };

/** Star rating where clicking the current rating again clears it. */
function createRatingInput(parent: HTMLElement, initial: number, onChange: (rating: number) => void): void {
  let rating = initial;
  const group = parent.createDiv({ cls: "literature-tracker-rating", attr: { role: "group", "aria-label": "Importance" } });
  const stars: HTMLButtonElement[] = [];
  const sync = () =>
    stars.forEach((star, index) => {
      star.toggleClass("is-filled", index < rating);
      star.setAttr("aria-pressed", String(index < rating));
    });
  for (let value = 1; value <= MAX_RATING; value++) {
    const star = group.createEl("button", {
      cls: "clickable-icon literature-tracker-star",
      text: "★",
      attr: { type: "button", "aria-label": `${value} of ${MAX_RATING}` },
    });
    star.addEventListener("click", () => {
      rating = rating === value ? 0 : value;
      sync();
      onChange(rating);
    });
    stars.push(star);
  }
  sync();
}

export class PaperModal extends Modal {
  private saving = false;

  constructor(
    app: App,
    private readonly controller: LiteratureController,
    private readonly mode: PaperModalMode,
  ) {
    super(app);
  }

  override onOpen(): void {
    const { mode, controller } = this;
    const paper = mode.kind === "edit" ? mode.paper : undefined;
    const prefill = mode.kind === "add" ? mode.prefill : {};
    let category: PaperCategoryId = paper?.category ?? DEFAULT_CATEGORY;
    let status: PaperStatusId = paper?.status ?? DEFAULT_STATUS;
    let rating = paper?.rating ?? 0;

    this.setTitle(paper ? "✏️ Edit paper" : prefill.zoteroKey ? "📚 Import from Zotero" : "📄 Add paper");
    this.contentEl.addClass("literature-tracker-modal");
    const form = this.contentEl.createDiv({ cls: "orbitkit-form" });

    const title = addTextInput(form, { label: "Title", value: paper?.title ?? prefill.title ?? "", placeholder: "Paper title" });
    const authors = addTextInput(form, {
      label: "Authors",
      value: paper?.authors ?? prefill.authors ?? "",
      placeholder: "e.g. Smith et al.",
    });
    const row = form.createDiv({ cls: "orbitkit-field-row" });
    const year = addTextInput(row, { label: "Year", value: paper?.year ?? prefill.year ?? "", placeholder: "2025" });
    year.inputMode = "numeric";
    const journal = addTextInput(row, {
      label: "Journal",
      value: paper?.journal ?? prefill.journal ?? "",
      placeholder: "e.g. Nature Neuroscience",
    });
    journal.parentElement?.addClass("is-wide");
    const doi = addTextInput(form, {
      label: "DOI or link",
      value: paper?.doi ?? prefill.doi ?? "",
      placeholder: "10.1000/xyz123 or https://…",
    });

    createChipGroup(createField(form, "Category").field, CATEGORY_OPTIONS, category, (id) => (category = id), "Category");
    createChipGroup(createField(form, "Status").field, STATUS_OPTIONS, status, (id) => (status = id), "Status");
    createRatingInput(createField(form, "Importance").field, rating, (value) => (rating = value));

    const comment = addTextArea(form, {
      label: "Quick comment",
      value: paper?.comment ?? "",
      placeholder: "Key takeaways, why it's relevant…",
      rows: paper ? 4 : 3,
    });
    const tags = addTextInput(form, { label: "Tags (optional)", value: paper?.tags.join(", ") ?? "", hint: "Separate tags with commas." });

    let fileName: HTMLInputElement | null = null;
    if (!paper) {
      const fileNameInput = addTextInput(form, {
        label: "Note name",
        value: controller.service.suggestFileName(title.value, year.value),
        hint: "Saved in your papers folder. Existing notes are never overwritten.",
      });
      let edited = false;
      fileNameInput.addEventListener("input", () => (edited = true));
      const sync = () => {
        if (!edited) fileNameInput.value = controller.service.suggestFileName(title.value, year.value);
      };
      title.addEventListener("input", sync);
      year.addEventListener("input", sync);
      fileName = fileNameInput;
    } else {
      form.createDiv({ cls: "orbitkit-field-hint", text: `Added ${new Date(paper.added).toLocaleDateString()}` });
    }

    const save = handleAsync("Could not save the paper", async () => {
      if (this.saving) return;
      if (!title.value.trim()) {
        new Notice("Enter a title first.");
        title.focus();
        return;
      }
      this.saving = true;
      try {
        const input = {
          title: title.value,
          authors: authors.value,
          year: year.value,
          journal: journal.value,
          doi: doi.value,
          category,
          status,
          rating,
          comment: comment.value,
          tags: tags.value,
        };
        const duplicate = controller.service.findDuplicate({ doi: doi.value, zoteroKey: prefill.zoteroKey }, paper?.id);
        if (duplicate) {
          const proceed = await confirmAction(this.app, {
            title: "Already tracked",
            message: `"${duplicate.title}" has the same DOI or Zotero item. Save this one anyway?`,
            confirmText: "Save anyway",
            destructive: false,
          });
          if (!proceed) return;
        }
        if (paper) {
          await controller.updatePaper(paper.id, input);
        } else {
          const added = await controller.service.addPaper({ ...input, fileName: fileName?.value, zoteroKey: prefill.zoteroKey });
          new Notice(`📚 Added "${added.title}"`);
        }
        this.close();
      } finally {
        this.saving = false;
      }
    });

    const buttons: ButtonSpec[] = [];
    if (paper) {
      buttons.push(
        {
          text: "Delete",
          variant: "warning",
          onClick: handleAsync("Could not delete the paper", async () => {
            if (await controller.deletePaper(paper)) this.close();
          }),
        },
        {
          text: "Open note",
          onClick: handleAsync("Could not open the note", async () => {
            this.close();
            await controller.openPaperNote(paper);
          }),
        },
      );
    }
    buttons.push({ text: "Cancel", onClick: () => this.close() }, { text: paper ? "Save" : "Save paper", variant: "cta", onClick: save });
    addButtonRow(this.contentEl, buttons);
    onModEnter(this.contentEl, save);
    title.focus();
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
