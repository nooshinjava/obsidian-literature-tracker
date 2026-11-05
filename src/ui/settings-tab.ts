import { PluginSettingTab, Setting, type App, type Plugin } from "obsidian";
import { isSafeVaultPath } from "@orbitkit/shared";
import { countByStatus } from "../domain/papers";
import { DEFAULT_PAPERS_FOLDER } from "../domain/settings";
import { PAPER_STATUSES } from "../domain/taxonomy";
import type { PaperService } from "../services/paper-service";

export class LiteratureSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly service: PaperService,
    private readonly save: () => Promise<void>,
  ) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl, service } = this;
    containerEl.empty();

    const folderSetting = new Setting(containerEl)
      .setName("Papers folder")
      .setDesc("Where paper notes are saved, relative to the vault root.");
    const warning = containerEl.createDiv({ cls: "orbitkit-field-hint mod-warning" });
    const showWarning = (value: string) => {
      const valid = value.trim() === "" || isSafeVaultPath(value);
      warning.setText(valid ? "" : `That path can't be used, so "${DEFAULT_PAPERS_FOLDER}" will be used instead.`);
    };
    folderSetting.addText((text) =>
      text
        .setPlaceholder(DEFAULT_PAPERS_FOLDER)
        .setValue(service.settings.papersFolderPath)
        .onChange(async (value) => {
          service.settings.papersFolderPath = value;
          showWarning(value);
          await this.save();
        }),
    );
    showWarning(service.settings.papersFolderPath);

    new Setting(containerEl).setName("Statistics").setHeading();
    const counts = countByStatus(service.papers);
    const list = containerEl.createEl("ul");
    list.createEl("li", { text: `Total papers: ${service.papers.length}` });
    for (const status of PAPER_STATUSES) list.createEl("li", { text: `${status.name}: ${counts[status.id]}` });
  }
}
