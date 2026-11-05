import {
  createId,
  isMarkdownPath,
  isRecord,
  isSafeVaultPath,
  normalizeVaultPath,
  parseTags,
  readEnum,
  readIsoTimestamp,
  readNumber,
  readString,
  readStringArray,
} from "@orbitkit/shared";
import { isValidZoteroKey, normalizeYear } from "./references";
import {
  CATEGORY_IDS,
  DEFAULT_CATEGORY,
  DEFAULT_STATUS,
  MAX_RATING,
  STATUS_IDS,
  type PaperCategoryId,
  type PaperStatusId,
} from "./taxonomy";

export const SCHEMA_VERSION = 2;
export const DEFAULT_PAPERS_FOLDER = "Literature Tracker";

export interface Paper {
  id: string;
  title: string;
  authors: string;
  /** Four-digit year or "". */
  year: string;
  journal: string;
  /** DOI, DOI URL or any link, as entered. */
  doi: string;
  category: PaperCategoryId;
  status: PaperStatusId;
  /** 0 (unrated) to 5. */
  rating: number;
  comment: string;
  tags: string[];
  /** ISO timestamps. */
  added: string;
  updated: string;
  filePath: string | null;
  zoteroKey: string;
}

export interface LiteratureTrackerSettings {
  schemaVersion: typeof SCHEMA_VERSION;
  papersFolderPath: string;
  papers: Paper[];
}

export function defaultSettings(): LiteratureTrackerSettings {
  return { schemaVersion: SCHEMA_VERSION, papersFolderPath: DEFAULT_PAPERS_FOLDER, papers: [] };
}

function readNotePath(value: unknown): string | null {
  const path = normalizeVaultPath(readString(value));
  return path && isSafeVaultPath(path) && isMarkdownPath(path) ? path : null;
}

function migratePaper(raw: unknown, fallbackTime: string): Paper | null {
  if (!isRecord(raw)) return null;
  const title = readString(raw.title).trim();
  if (!title) return null;
  const added = readIsoTimestamp(raw.added, fallbackTime);
  const zoteroKey = readString(raw.zoteroKey).trim();
  return {
    id: readString(raw.id).trim() || createId(),
    title,
    authors: readString(raw.authors).trim(),
    year: normalizeYear(raw.year),
    journal: readString(raw.journal).trim(),
    doi: readString(raw.doi).trim(),
    category: readEnum(raw.category, CATEGORY_IDS, DEFAULT_CATEGORY),
    status: readEnum(raw.status, STATUS_IDS, DEFAULT_STATUS),
    rating: Math.round(readNumber(raw.rating, 0, { min: 0, max: MAX_RATING })),
    comment: readString(raw.comment),
    tags: parseTags(readStringArray(raw.tags)),
    added,
    updated: readIsoTimestamp(raw.updated, added),
    filePath: readNotePath(raw.filePath),
    zoteroKey: isValidZoteroKey(zoteroKey) ? zoteroKey : "",
  };
}

/**
 * Turns whatever is in data.json (v1, v2, hand-edited or corrupt) into valid
 * v2 settings. Never throws. v1 stored copies of the categories and statuses;
 * those are now constants and are dropped.
 */
export function migrateSettings(raw: unknown, now: Date = new Date()): LiteratureTrackerSettings {
  const data = isRecord(raw) ? raw : {};
  const settings = defaultSettings();
  settings.papersFolderPath = readString(data.papersFolderPath, DEFAULT_PAPERS_FOLDER);

  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  const rawPapers: unknown[] = Array.isArray(data.papers) ? data.papers : [];
  for (const rawPaper of rawPapers) {
    const paper = migratePaper(rawPaper, now.toISOString());
    if (!paper) continue;
    if (seenIds.has(paper.id)) paper.id = createId();
    seenIds.add(paper.id);
    // Version 1 let two papers share one note; only the first keeps the link, so
    // editing or deleting one paper can never touch another paper's note.
    if (paper.filePath) {
      const key = paper.filePath.toLowerCase();
      if (seenPaths.has(key)) paper.filePath = null;
      else seenPaths.add(key);
    }
    settings.papers.push(paper);
  }
  return settings;
}
