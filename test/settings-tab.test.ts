import type { App, Plugin } from "obsidian";
import { describe, expect, it } from "vitest";
import { collectControls, MemoryNoteStore } from "@orbitkit/shared/testing";
import { migrateSettings } from "../src/domain/settings";
import { PaperService } from "../src/services/paper-service";
import { LiteratureSettingTab } from "../src/ui/settings-tab";

describe("Literature Tracker settings definitions (Obsidian 1.13+)", () => {
  it("reads, saves and validates the papers folder", async () => {
    const settings = migrateSettings(null);
    let saves = 0;
    const save = () => {
      saves += 1;
      return Promise.resolve();
    };
    const tab = new LiteratureSettingTab({} as App, {} as Plugin, new PaperService(settings, { store: new MemoryNoteStore(), save }), save);
    const controls = collectControls(tab.getSettingDefinitions());
    expect(controls.map((control) => control.key)).toEqual(["papersFolderPath"]);
    expect(tab.getControlValue("papersFolderPath")).toBe("Literature Tracker");

    await tab.setControlValue("papersFolderPath", "Reading");
    await tab.setControlValue("papersFolderPath", 42);
    expect(settings.papersFolderPath).toBe("Reading");
    expect(saves).toBe(1);

    const validate = controls[0]?.validate as (value: string) => string | undefined;
    expect(validate(".obsidian/x")).toMatch(/^Please choose a folder inside this vault/);
  });
});
