import { PluginSettingTab, Setting, type App, type Plugin, type SettingDefinitionItem } from "obsidian";
import { isSafeVaultPath } from "@orbitkit/shared";
import { countByStatus } from "../domain/papers";
import { DEFAULT_PAPERS_FOLDER } from "../domain/settings";
import { PAPER_STATUSES } from "../domain/taxonomy";
import type { PaperService } from "../services/paper-service";

const FOLDER_NAME = "Papers folder";
const FOLDER_DESC = "Where paper notes are saved, relative to the vault root.";

function folderProblem(value: string): string | undefined {
  return value.trim() === "" || isSafeVaultPath(value)
    ? undefined
    : "Please choose a folder inside this vault (no \"..\" and no hidden folders).";
}

export class LiteratureSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly service: PaperService,
    private readonly save: () => Promise<void>,
  ) {
    super(app, plugin);
  }

  /** Obsidian 1.13+ renders these and includes them in settings search. */
  override getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: FOLDER_NAME,
        desc: FOLDER_DESC,
        control: { type: "folder", key: "papersFolderPath", placeholder: DEFAULT_PAPERS_FOLDER, validate: folderProblem },
      },
      {
        type: "group",
        heading: "Statistics",
        items: [{ name: "Your papers", searchable: false, render: (setting) => { setting.setDesc(this.summary()); } }],
      },
    ];
  }

  override getControlValue(key: string): unknown {
    return key === "papersFolderPath" ? this.service.settings.papersFolderPath : undefined;
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    if (key !== "papersFolderPath" || typeof value !== "string") return;
    this.service.settings.papersFolderPath = value;
    await this.save();
  }

  /** Settings screen for Obsidian versions before 1.13. */
  override display(): void {
    const { containerEl, service } = this;
    containerEl.empty();

    const folderSetting = new Setting(containerEl).setName(FOLDER_NAME).setDesc(FOLDER_DESC);
    const warning = containerEl.createDiv({ cls: "orbitkit-field-hint mod-warning" });
    folderSetting.addText((text) =>
      text
        .setPlaceholder(DEFAULT_PAPERS_FOLDER)
        .setValue(service.settings.papersFolderPath)
        .onChange(async (value) => {
          const problem = folderProblem(value);
          warning.setText(problem ?? "");
          if (problem) return;
          service.settings.papersFolderPath = value;
          await this.save();
        }),
    );

    new Setting(containerEl).setName("Statistics").setHeading();
    new Setting(containerEl).setName("Your papers").setDesc(this.summary());
  }

  private summary(): string {
    const counts = countByStatus(this.service.papers);
    const parts = PAPER_STATUSES.map((status) => `${counts[status.id]} ${status.name.toLowerCase()}`);
    return `${this.service.papers.length} in total: ${parts.join(", ")}.`;
  }
}
