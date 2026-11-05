/** Parsing of bibliographic input: years, DOIs/links, Zotero keys and Zotero items. Pure. */

import { escapeMarkdownInline, isRecord, readString } from "@orbitkit/shared";

const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/;
const DOI_PREFIX = /^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)/i;
const ZOTERO_KEY = /^[A-Za-z0-9_-]{1,64}$/;

/** A four-digit year, or "" when the input isn't one. */
export function normalizeYear(input: unknown): string {
  const text = typeof input === "number" ? String(input) : readString(input).trim();
  return /^[12]\d{3}$/.test(text) ? text : "";
}

export interface ReferenceLink {
  /** Bare DOI ("10.1000/xyz") when the input is a DOI. */
  doi: string | null;
  /** Safe http(s) URL to link to, or null when the input isn't linkable. */
  url: string | null;
}

/** Accepts "10.x/y", "doi:10.x/y", "https://doi.org/10.x/y" or any http(s) URL. */
export function parseReferenceLink(input: string): ReferenceLink {
  const text = input.trim();
  if (!text) return { doi: null, url: null };

  const doi = text.replace(DOI_PREFIX, "");
  if (DOI_PATTERN.test(doi)) {
    const path = doi.split("/").map(encodeURIComponent).join("/");
    return { doi, url: `https://doi.org/${path}` };
  }

  try {
    const url = new URL(text);
    if (url.protocol === "https:" || url.protocol === "http:") return { doi: null, url: url.href };
  } catch {
    // Not a URL; shown as plain text.
  }
  return { doi: null, url: null };
}

/** Markdown for the DOI/link line. Angle brackets keep parentheses in URLs from breaking the link. */
export function referenceLinkMarkdown(input: string): string {
  const { doi, url } = parseReferenceLink(input);
  if (!url) return input.trim().replace(/[[\]()<>]/g, "");
  // Escape the link text so a crafted DOI can't close the link early and inject another one.
  return `[${escapeMarkdownInline(doi ?? "Link")}](<${url}>)`;
}

export function isValidZoteroKey(key: string): boolean {
  return ZOTERO_KEY.test(key);
}

interface Creator {
  fullName?: unknown;
  lastName?: unknown;
  firstName?: unknown;
}

function creatorName(creator: Creator, short: boolean): string {
  const last = readString(creator.lastName).trim();
  const full = readString(creator.fullName).trim();
  const first = readString(creator.firstName).trim();
  if (short && last) return last;
  return full || [first, last].filter(Boolean).join(" ");
}

/** "Ada Lovelace", "Lovelace & Babbage" or "Lovelace et al." */
export function formatAuthors(creators: unknown): string {
  if (!Array.isArray(creators)) return "";
  const list = creators.filter(isRecord) as Creator[];
  const [first, second] = list;
  if (!first) return "";
  if (list.length === 1) return creatorName(first, false);
  if (list.length === 2 && second) return `${creatorName(first, true)} & ${creatorName(second, true)}`;
  return `${creatorName(first, true)} et al.`;
}

export interface PaperPrefill {
  title: string;
  authors: string;
  year: string;
  journal: string;
  doi: string;
  zoteroKey: string;
}

/** Maps the values of a Zotero Bridge item to form defaults, tolerating missing fields. */
export function zoteroPrefill(values: unknown): PaperPrefill {
  const data = isRecord(values) ? values : {};
  const date = isRecord(data.date) ? data.date : {};
  const key = readString(data.key).trim();
  return {
    title: readString(data.title).trim(),
    authors: formatAuthors(data.authors),
    year: normalizeYear(date.year),
    journal: readString(data.publicationTitle).trim(),
    doi: readString(data.DOI).trim(),
    zoteroKey: isValidZoteroKey(key) ? key : "",
  };
}
