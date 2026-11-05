import { setIcon } from "obsidian";
import { truncate } from "@orbitkit/shared";
import { handleAsync } from "@orbitkit/shared/obsidian";
import type { Paper } from "../domain/settings";
import { categoryOf, statusOf } from "../domain/taxonomy";
import type { LiteratureController } from "./controller";

function addIconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): void {
  const button = parent.createEl("button", { cls: "clickable-icon", attr: { type: "button", "aria-label": label } });
  setIcon(button, icon);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
}

export function renderPaperCard(parent: HTMLElement, paper: Paper, controller: LiteratureController): void {
  const status = statusOf(paper.status);
  const category = categoryOf(paper.category);
  const card = parent.createDiv({
    cls: `orbitkit-card literature-tracker-card is-${paper.status}`,
    attr: { tabindex: "0", role: "button", "aria-label": `Edit paper: ${paper.title}` },
  });

  card.createDiv({ cls: "orbitkit-card-title", text: paper.title });
  if (paper.authors) card.createDiv({ cls: "literature-tracker-authors", text: paper.authors });

  const meta = [`${status.icon} ${status.name}`, paper.year, paper.journal].filter(Boolean).join(" · ");
  card.createDiv({ cls: "orbitkit-card-meta literature-tracker-meta", text: meta });

  if (paper.comment) {
    card.createDiv({ cls: "literature-tracker-comment", text: `💬 ${truncate(paper.comment, 150)}` });
  }

  const footer = card.createDiv({ cls: "orbitkit-card-footer" });
  const pills = footer.createDiv({ cls: "orbitkit-pills" });
  pills.createSpan({ cls: "orbitkit-pill", text: `${category.icon} ${category.name}` });
  if (paper.rating > 0) {
    pills.createSpan({ cls: "orbitkit-pill", text: "⭐".repeat(paper.rating), attr: { "aria-label": `Rated ${paper.rating} of 5` } });
  }

  const actions = footer.createDiv({ cls: "orbitkit-icon-buttons" });
  addIconButton(actions, "file-text", "Open note", handleAsync("Could not open the note", () => controller.openPaperNote(paper)));
  addIconButton(actions, "pencil", "Edit paper", () => controller.openEditPaper(paper));
  addIconButton(
    actions,
    "trash-2",
    "Delete paper",
    handleAsync("Could not delete the paper", async () => {
      await controller.deletePaper(paper);
    }),
  );

  card.addEventListener("click", () => controller.openEditPaper(paper));
  card.addEventListener("keydown", (event) => {
    if (event.target === card && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      controller.openEditPaper(paper);
    }
  });
}
