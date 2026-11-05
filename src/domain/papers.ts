import { slugify } from "@orbitkit/shared";
import { parseReferenceLink } from "./references";
import type { Paper } from "./settings";
import { PAPER_CATEGORIES, PAPER_STATUSES, type PaperCategoryId, type PaperStatusId } from "./taxonomy";

export type PaperFilter = "all" | PaperStatusId | PaperCategoryId;

export interface FilterOption {
  id: PaperFilter;
  label: string;
}

export const STATUS_FILTERS: readonly FilterOption[] = [
  { id: "all", label: "All" },
  ...PAPER_STATUSES.map((status) => ({ id: status.id, label: `${status.icon} ${status.name}` })),
];

export const CATEGORY_FILTERS: readonly FilterOption[] = PAPER_CATEGORIES.map((category) => ({
  id: category.id,
  label: `${category.icon} ${category.name}`,
}));

export function matchesFilter(paper: Paper, filter: PaperFilter): boolean {
  return filter === "all" || paper.status === filter || paper.category === filter;
}

export function matchesQuery(paper: Paper, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [paper.title, paper.authors, paper.journal, paper.comment, paper.year, ...paper.tags].some((field) =>
    field.toLowerCase().includes(needle),
  );
}

/** Papers matching the filter and search: currently reading first, then most recently added. */
export function visiblePapers(papers: readonly Paper[], filter: PaperFilter, query: string): Paper[] {
  return papers
    .filter((paper) => matchesFilter(paper, filter) && matchesQuery(paper, query))
    .sort((a, b) => {
      const reading = Number(b.status === "reading") - Number(a.status === "reading");
      return reading !== 0 ? reading : b.added.localeCompare(a.added);
    });
}

export function countByStatus(papers: readonly Paper[]): Record<PaperStatusId, number> {
  const counts = Object.fromEntries(PAPER_STATUSES.map((status) => [status.id, 0])) as Record<PaperStatusId, number>;
  for (const paper of papers) counts[paper.status] += 1;
  return counts;
}

/** Default note name: "<year>-<slug>" (current year when the paper has none). */
export function suggestFileName(title: string, year: string, now: Date): string {
  return `${year || now.getFullYear()}-${slugify(title) || "paper"}`;
}

/** An already tracked paper with the same Zotero item or DOI, if any. */
export function findDuplicate(
  papers: readonly Paper[],
  candidate: { zoteroKey?: string; doi?: string },
  excludeId?: string,
): Paper | undefined {
  const doi = parseReferenceLink(candidate.doi ?? "").doi?.toLowerCase();
  return papers.find(
    (paper) =>
      paper.id !== excludeId &&
      ((candidate.zoteroKey && paper.zoteroKey === candidate.zoteroKey) ||
        (doi && parseReferenceLink(paper.doi).doi?.toLowerCase() === doi)),
  );
}
