/** Fixed paper categories and reading statuses. Ids are stored in data.json and note frontmatter. */

export const PAPER_CATEGORIES = [
  { id: "theory", name: "Theory/Background", icon: "🧠" },
  { id: "empirical", name: "Empirical study", icon: "🔬" },
  { id: "methods", name: "Methods/Analysis", icon: "📊" },
  { id: "data", name: "Data/Resources", icon: "🗂️" },
  { id: "review", name: "Review/Meta", icon: "📚" },
  { id: "other", name: "Other", icon: "📄" },
] as const;

export const PAPER_STATUSES = [
  { id: "toread", name: "To read", icon: "📥" },
  { id: "reading", name: "Reading", icon: "📖" },
  { id: "read", name: "Read", icon: "✅" },
  { id: "reviewed", name: "Reviewed", icon: "⭐" },
] as const;

export type PaperCategoryId = (typeof PAPER_CATEGORIES)[number]["id"];
export type PaperStatusId = (typeof PAPER_STATUSES)[number]["id"];

export const CATEGORY_IDS: readonly PaperCategoryId[] = PAPER_CATEGORIES.map((category) => category.id);
export const STATUS_IDS: readonly PaperStatusId[] = PAPER_STATUSES.map((status) => status.id);

export const DEFAULT_CATEGORY: PaperCategoryId = "other";
export const DEFAULT_STATUS: PaperStatusId = "toread";
export const MAX_RATING = 5;

export function categoryOf(id: PaperCategoryId): (typeof PAPER_CATEGORIES)[number] {
  return PAPER_CATEGORIES.find((category) => category.id === id) ?? PAPER_CATEGORIES[5];
}

export function statusOf(id: PaperStatusId): (typeof PAPER_STATUSES)[number] {
  return PAPER_STATUSES.find((status) => status.id === id) ?? PAPER_STATUSES[0];
}
