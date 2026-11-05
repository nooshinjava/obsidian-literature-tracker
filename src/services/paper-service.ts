import {
  createId,
  createUniqueNote,
  errorMessage,
  mergeFrontmatter,
  noteOwnership,
  parseTags,
  resolveFolderSetting,
  type NoteStore,
  type NoteSync,
  type Ownership,
} from "@orbitkit/shared";
import { buildPaperNote, changedFrontmatter, ID_KEY, syncPaperNote } from "../domain/markdown";
import { findDuplicate, suggestFileName } from "../domain/papers";
import { isValidZoteroKey, normalizeYear } from "../domain/references";
import { DEFAULT_PAPERS_FOLDER, type LiteratureTrackerSettings, type Paper } from "../domain/settings";
import { DEFAULT_CATEGORY, DEFAULT_STATUS, MAX_RATING, type PaperCategoryId, type PaperStatusId } from "../domain/taxonomy";

/** Editable paper fields as they come from the form. */
export interface PaperInput {
  title: string;
  authors?: string;
  year?: string;
  journal?: string;
  doi?: string;
  category?: PaperCategoryId;
  status?: PaperStatusId;
  rating?: number;
  comment?: string;
  tags?: string | readonly string[];
}

export interface NewPaperInput extends PaperInput {
  /** Note name without extension; defaults to "<year>-<slug>". */
  fileName?: string;
  zoteroKey?: string;
}

export interface UpdateResult {
  paper: Paper;
  note: NoteSync;
}

export interface DeleteResult {
  noteTrashed: boolean;
  /** The note was left in place because it couldn't be confirmed as this paper's note. */
  noteKept: boolean;
}

export interface PaperServiceDeps {
  store: NoteStore;
  save: () => Promise<void>;
  onChange?: () => void;
  now?: () => Date;
}

function clampRating(rating: number | undefined): number {
  return Math.round(Math.min(MAX_RATING, Math.max(0, rating ?? 0)));
}

function copyPaper(paper: Paper): Paper {
  return { ...paper, tags: [...paper.tags] };
}

const EDITABLE_FIELDS = ["title", "authors", "year", "journal", "doi", "category", "status", "rating", "comment"] as const;

function sameContent(a: Paper, b: Paper): boolean {
  return EDITABLE_FIELDS.every((field) => a[field] === b[field]) && a.tags.join("\n") === b.tags.join("\n");
}

export class PaperService {
  private readonly now: () => Date;

  constructor(
    readonly settings: LiteratureTrackerSettings,
    private readonly deps: PaperServiceDeps,
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  get papers(): readonly Paper[] {
    return this.settings.papers;
  }

  get folder(): string {
    return resolveFolderSetting(this.settings.papersFolderPath, DEFAULT_PAPERS_FOLDER);
  }

  find(id: string): Paper | undefined {
    return this.settings.papers.find((paper) => paper.id === id);
  }

  suggestFileName(title: string, year: string): string {
    return suggestFileName(title, normalizeYear(year), this.now());
  }

  findDuplicate(candidate: { zoteroKey?: string; doi?: string }, excludeId?: string): Paper | undefined {
    return findDuplicate(this.settings.papers, candidate, excludeId);
  }

  /** Records the paper and creates its note; an existing note is never overwritten. */
  async addPaper(input: NewPaperInput): Promise<Paper> {
    const title = input.title.trim();
    if (!title) throw new Error("A paper needs a title.");
    const now = this.now();
    const timestamp = now.toISOString();
    const zoteroKey = (input.zoteroKey ?? "").trim();
    const paper: Paper = {
      id: createId(now.getTime()),
      title,
      authors: (input.authors ?? "").trim(),
      year: normalizeYear(input.year),
      journal: (input.journal ?? "").trim(),
      doi: (input.doi ?? "").trim(),
      category: input.category ?? DEFAULT_CATEGORY,
      status: input.status ?? DEFAULT_STATUS,
      rating: clampRating(input.rating),
      comment: (input.comment ?? "").trim(),
      tags: parseTags(input.tags ?? []),
      added: timestamp,
      updated: timestamp,
      filePath: null,
      zoteroKey: isValidZoteroKey(zoteroKey) ? zoteroKey : "",
    };
    const fileName = input.fileName?.trim() || suggestFileName(title, paper.year, now);
    paper.filePath = await createUniqueNote(this.deps.store, this.folder, fileName, buildPaperNote(paper), (path) =>
      this.isClaimed(path, paper.id),
    );
    this.settings.papers.push(paper);
    await this.commit();
    return paper;
  }

  /**
   * Saves the changes, then brings the note in line: only changed frontmatter
   * fields are written, and generated sections only if the user hasn't edited
   * them in the note. A note problem never loses the saved changes.
   */
  async updatePaper(id: string, changes: Partial<PaperInput>): Promise<UpdateResult> {
    const paper = this.require(id);
    const before = copyPaper(paper);
    const after = copyPaper(paper);
    if (changes.title !== undefined) {
      after.title = changes.title.trim();
      if (!after.title) throw new Error("A paper needs a title.");
    }
    if (changes.authors !== undefined) after.authors = changes.authors.trim();
    if (changes.year !== undefined) after.year = normalizeYear(changes.year);
    if (changes.journal !== undefined) after.journal = changes.journal.trim();
    if (changes.doi !== undefined) after.doi = changes.doi.trim();
    if (changes.category !== undefined) after.category = changes.category;
    if (changes.status !== undefined) after.status = changes.status;
    if (changes.rating !== undefined) after.rating = clampRating(changes.rating);
    if (changes.comment !== undefined) after.comment = changes.comment.trim();
    if (changes.tags !== undefined) after.tags = parseTags(changes.tags);
    if (sameContent(before, after)) return { paper, note: { status: "unchanged" } };

    after.updated = this.now().toISOString();
    Object.assign(paper, after);
    await this.commit();
    return { paper, note: await this.syncNote(paper, before) };
  }

  /** Removes the paper. Its note is trashed only when it is verifiably this paper's note. */
  async deletePaper(id: string, { trashNote }: { trashNote: boolean }): Promise<DeleteResult> {
    const paper = this.require(id);
    const result: DeleteResult = { noteTrashed: false, noteKept: false };
    const path = paper.filePath;
    if (trashNote && path && this.deps.store.exists(path)) {
      if ((await this.ownership(paper, path)) === "owned") {
        await this.deps.store.trash(path);
        result.noteTrashed = true;
      } else {
        result.noteKept = true;
      }
    }
    this.settings.papers = this.settings.papers.filter((candidate) => candidate.id !== id);
    await this.commit();
    return result;
  }

  /**
   * Returns the paper's note path: the linked note if it is still this paper's,
   * else a note carrying this paper's id (e.g. moved outside Obsidian), else a
   * newly created note.
   */
  async ensurePaperNote(id: string): Promise<string> {
    const paper = this.require(id);
    const { store } = this.deps;
    if (paper.filePath && store.exists(paper.filePath)) {
      if ((await this.ownership(paper, paper.filePath)) !== "not-owned") return paper.filePath;
      paper.filePath = null;
    }
    const found = await store.findNoteByFrontmatter(ID_KEY, paper.id);
    if (found && !this.isClaimed(found, paper.id)) {
      paper.filePath = found;
    } else {
      paper.filePath = await createUniqueNote(
        store,
        this.folder,
        suggestFileName(paper.title, paper.year, this.now()),
        buildPaperNote(paper),
        (path) => this.isClaimed(path, paper.id),
      );
    }
    await this.commit();
    return paper.filePath;
  }

  async handleRename(oldPath: string, newPath: string): Promise<void> {
    let changed = false;
    for (const paper of this.settings.papers) {
      if (!paper.filePath) continue;
      if (paper.filePath === oldPath) {
        paper.filePath = newPath;
        changed = true;
      } else if (paper.filePath.startsWith(`${oldPath}/`)) {
        paper.filePath = newPath + paper.filePath.slice(oldPath.length);
        changed = true;
      }
    }
    if (changed) await this.commit();
  }

  async handleDelete(path: string): Promise<void> {
    let changed = false;
    for (const paper of this.settings.papers) {
      if (paper.filePath === path) {
        paper.filePath = null;
        changed = true;
      }
    }
    if (changed) await this.commit();
  }

  private async syncNote(paper: Paper, before: Paper): Promise<NoteSync> {
    const { store } = this.deps;
    const path = paper.filePath;
    if (!path || !store.exists(path)) return { status: "no-note" };
    try {
      if ((await this.ownership(paper, path)) === "not-owned") {
        paper.filePath = null;
        await this.commit();
        return { status: "unlinked" };
      }
      const fields = changedFrontmatter(before, paper);
      await store.updateFrontmatter(path, (frontmatter) => mergeFrontmatter(frontmatter, fields));
      let keptEdits = false;
      await store.process(path, (content) => {
        const update = syncPaperNote(content, before, paper);
        keptEdits = update.keptEdits;
        return update.content;
      });
      return { status: keptEdits ? "kept-edits" : "updated" };
    } catch (error) {
      return { status: "failed", error: errorMessage(error) };
    }
  }

  private ownership(paper: Paper, path: string): Promise<Ownership> {
    return noteOwnership(this.deps.store, path, ID_KEY, paper.id, this.isClaimed(path, paper.id));
  }

  /** True when another paper links to `path` (compared case-insensitively). */
  private isClaimed(path: string, exceptId: string): boolean {
    const key = path.toLowerCase();
    return this.settings.papers.some((other) => other.id !== exceptId && other.filePath?.toLowerCase() === key);
  }

  private require(id: string): Paper {
    const paper = this.find(id);
    if (!paper) throw new Error("That paper no longer exists.");
    return paper;
  }

  private async commit(): Promise<void> {
    await this.deps.save();
    this.deps.onChange?.();
  }
}
