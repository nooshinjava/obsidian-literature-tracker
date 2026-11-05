import type { PaperPrefill } from "../domain/references";
import type { Paper } from "../domain/settings";
import type { PaperInput, PaperService } from "../services/paper-service";

/** What the views and modals need from the plugin. Implemented by LiteratureTrackerPlugin. */
export interface LiteratureController {
  readonly service: PaperService;
  openAddPaper(prefill?: Partial<PaperPrefill>): void;
  openEditPaper(paper: Paper): void;
  openPaperNote(paper: Paper): Promise<void>;
  /** Saves changes and tells the user if the note couldn't be fully updated. */
  updatePaper(id: string, changes: Partial<PaperInput>): Promise<void>;
  /** Asks for confirmation, then deletes. Resolves to true when the paper was deleted. */
  deletePaper(paper: Paper): Promise<boolean>;
  importFromZotero(): Promise<void>;
  isZoteroAvailable(): boolean;
  openIdeaVault(): Promise<void>;
  openMindfulFocus(): Promise<void>;
}
