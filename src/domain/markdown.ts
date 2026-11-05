import {
  escapeMarkdownInline,
  replaceExactLine,
  replaceOwnedSection,
  serializeFrontmatter,
  transformHeader,
  type FrontmatterValue,
} from "@orbitkit/shared";
import { isValidZoteroKey, referenceLinkMarkdown } from "./references";
import type { Paper } from "./settings";
import { categoryOf, statusOf } from "./taxonomy";

export const REFERENCE_HEADING = "## 📄 Reference";
export const COMMENT_HEADING = "## 💬 Quick comment";
/** Frontmatter key that ties a note to its paper. */
export const ID_KEY = "paper-id";
/** Heading and placeholder used by version 1 notes. */
const LEGACY_COMMENT_HEADING = "## 💬 Quick Comment";
const LEGACY_NO_COMMENT = "*No comment yet.*";
const NO_COMMENT = "_No comment yet._";

/** Frontmatter fields the plugin owns. `undefined` means "remove this key". */
export function paperFrontmatter(paper: Paper): Record<string, FrontmatterValue | undefined> {
  return {
    title: paper.title,
    authors: paper.authors || undefined,
    year: paper.year ? Number(paper.year) : undefined,
    journal: paper.journal || undefined,
    doi: paper.doi || undefined,
    category: paper.category,
    status: paper.status,
    rating: paper.rating,
    tags: paper.tags.length > 0 ? paper.tags : undefined,
    zoteroKey: paper.zoteroKey || undefined,
    added: paper.added,
    updated: paper.updated,
    [ID_KEY]: paper.id,
  };
}

/**
 * The owned fields that differ between two versions of a paper (plus
 * `updated` and the id). Unchanged fields — tags in particular — aren't
 * written, so a status change can't undo edits made directly in the note.
 */
export function changedFrontmatter(before: Paper, after: Paper): Record<string, FrontmatterValue | undefined> {
  const previous = paperFrontmatter(before);
  const fields: Record<string, FrontmatterValue | undefined> = {};
  for (const [key, value] of Object.entries(paperFrontmatter(after))) {
    if (JSON.stringify(previous[key]) !== JSON.stringify(value)) fields[key] = value;
  }
  fields.updated = after.updated;
  fields[ID_KEY] = after.id;
  return fields;
}

export function ratingStars(rating: number): string {
  return rating > 0 ? "⭐".repeat(rating) : "Not rated";
}

/** Titles, authors and journals often come from Zotero, so they are shown literally. */
function titleLine(paper: Paper): string {
  return `# ${escapeMarkdownInline(paper.title)}`;
}

function referenceBody(paper: Paper): string {
  const lines = [
    `- **Authors:** ${escapeMarkdownInline(paper.authors) || "—"}`,
    `- **Year:** ${paper.year || "—"}`,
    `- **Journal:** ${escapeMarkdownInline(paper.journal) || "—"}`,
  ];
  if (paper.doi) lines.push(`- **DOI / link:** ${referenceLinkMarkdown(paper.doi)}`);
  if (paper.zoteroKey && isValidZoteroKey(paper.zoteroKey)) {
    lines.push(`- **Zotero:** [Open in Zotero](zotero://select/library/items/${paper.zoteroKey})`);
  }
  return lines.join("\n");
}

function commentBody(paper: Paper): string {
  return paper.comment.trim() || NO_COMMENT;
}

export function buildPaperNote(paper: Paper): string {
  return [
    serializeFrontmatter(paperFrontmatter(paper)).trimEnd(),
    "",
    titleLine(paper),
    "",
    REFERENCE_HEADING,
    "",
    referenceBody(paper),
    "",
    COMMENT_HEADING,
    "",
    commentBody(paper),
    "",
    "## 📝 Notes",
    "",
    "### Key findings",
    "",
    "- ",
    "",
    "### Methods",
    "",
    "- ",
    "",
    "### Relevance to my work",
    "",
    "- ",
    "",
    "## 📎 Related",
    "",
    "- Related papers: ",
    "- Related projects: ",
    "- Related ideas: ",
    "",
  ].join("\n");
}

/** Version 1 notes kept the metadata as bold lines under the title; keep those in sync too. */
function updateLegacyLines(header: string, paper: Paper): string {
  const category = categoryOf(paper.category);
  const status = statusOf(paper.status);
  const replacements: Array<[RegExp, string]> = [
    [/^\*\*Authors:\*\* .*$/m, `**Authors:** ${escapeMarkdownInline(paper.authors) || "N/A"}`],
    [/^\*\*Year:\*\* .*$/m, `**Year:** ${paper.year || "N/A"}`],
    [/^\*\*Journal:\*\* .*$/m, `**Journal:** ${escapeMarkdownInline(paper.journal) || "N/A"}`],
    [/^\*\*Category:\*\* .*$/m, `**Category:** ${category.icon} ${category.name}`],
    [/^\*\*Status:\*\* .*$/m, `**Status:** ${status.icon} ${status.name}`],
    [/^\*\*Importance:\*\* .*$/m, `**Importance:** ${ratingStars(paper.rating)}`],
  ];
  if (paper.doi) replacements.push([/^\*\*DOI:\*\* .*$/m, `**DOI:** ${referenceLinkMarkdown(paper.doi)}`]);
  return replacements.reduce((text, [pattern, line]) => text.replace(pattern, () => line), header);
}

function hasHeading(content: string, heading: string): boolean {
  return content.split("\n").some((line) => line.trim() === heading);
}

export interface NoteUpdate {
  content: string;
  /** True when a part the plugin wanted to change had been edited by the user and was kept. */
  keptEdits: boolean;
}

/**
 * Brings the note body in line with an edited paper. The title, reference
 * block and quick comment are only rewritten when they still contain exactly
 * what the plugin wrote for the previous version; the user's edits are kept.
 */
export function syncPaperNote(content: string, before: Paper, after: Paper): NoteUpdate {
  let next = content;
  let keptEdits = false;

  if (titleLine(before) !== titleLine(after)) {
    let replaced = false;
    next = transformHeader(next, (header) => {
      const result = replaceExactLine(header, [titleLine(before), `# ${before.title}`], titleLine(after));
      replaced = result !== null;
      return result ?? header;
    });
    if (!replaced) keptEdits = true;
  }

  if (hasHeading(next, REFERENCE_HEADING)) {
    if (referenceBody(before) !== referenceBody(after)) {
      const replaced = replaceOwnedSection(next, REFERENCE_HEADING, [referenceBody(before)], referenceBody(after));
      if (replaced === null) keptEdits = true;
      else next = replaced;
    }
  } else {
    next = transformHeader(next, (header) => updateLegacyLines(header, after));
  }

  if (commentBody(before) !== commentBody(after)) {
    const heading = hasHeading(next, COMMENT_HEADING) ? COMMENT_HEADING : LEGACY_COMMENT_HEADING;
    const previous = before.comment.trim() ? [commentBody(before)] : [NO_COMMENT, LEGACY_NO_COMMENT];
    const replaced = replaceOwnedSection(next, heading, previous, commentBody(after));
    if (replaced === null) keptEdits = true;
    else next = replaced;
  }

  return { content: next, keptEdits };
}
