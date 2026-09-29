import { isAddress } from "./address";

export const MAX_NAME_LENGTH = 200;

/** Download page size, chosen by the publisher. "full" is the default and is omitted from URLs. */
export type PageView = "full" | "medium" | "compact";
export const PAGE_VIEWS: readonly PageView[] = ["full", "medium", "compact"];

export function parseView(raw: string | null): PageView {
  return PAGE_VIEWS.includes(raw as PageView) ? (raw as PageView) : "full";
}

export interface DownloadParams {
  address: string;
  name: string;
  /** False when `n` was missing or sanitised to nothing, so `name` is the generated default. */
  nameProvided: boolean;
  size?: number;
  view: PageView;
}

export type ParseResult =
  | { ok: true; params: DownloadParams }
  | { ok: false; reason: "missing-address" | "invalid-address" };

export function defaultName(address: string): string {
  return `autonomi-${address.slice(0, 8)}.bin`;
}

/**
 * Make a file name safe to display and save: drop path/reserved characters,
 * control and bidi-override characters, trim, and cap the length.
 */
export function sanitizeName(raw: string): string {
  const cleaned = raw
    .normalize("NFC")
    .replace(/[/\:*?"<>|]/g, "")
    // C0/C1 controls and bidi overrides (which can disguise extensions, e.g. "exe.txt").
    .replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, "")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "");
  return Array.from(cleaned).slice(0, MAX_NAME_LENGTH).join("").trim();
}

export function parseSize(raw: string | null): number | undefined {
  if (!raw || !/^\d{1,16}$/.test(raw)) return undefined;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : undefined;
}

export function parseDownloadParams(search: string | URLSearchParams): ParseResult {
  const q = typeof search === "string" ? new URLSearchParams(search) : search;
  const rawAddress = (q.get("a") ?? "").trim();
  if (!rawAddress) return { ok: false, reason: "missing-address" };
  if (!isAddress(rawAddress)) return { ok: false, reason: "invalid-address" };
  const name = sanitizeName(q.get("n") ?? "");
  return {
    ok: true,
    params: {
      address: rawAddress,
      name: name || defaultName(rawAddress),
      nameProvided: name.length > 0,
      size: parseSize(q.get("s")),
      view: parseView(q.get("v")),
    },
  };
}

/**
 * Stricter than encodeURIComponent: also encodes ( ) ' ! * so the URL
 * survives inside Markdown links and HTML attributes untouched.
 */
export function encodeParam(value: string): string {
  return encodeURIComponent(value).replace(/[()'!*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** `siteBase` is the absolute URL of the site root, ending in "/". */
export function buildDownloadUrl(
  siteBase: string,
  p: { address: string; name?: string; size?: number; view?: PageView },
): string {
  const parts = [`a=${p.address}`];
  const name = p.name ? sanitizeName(p.name) : "";
  if (name) parts.push(`n=${encodeParam(name)}`);
  if (p.size !== undefined && Number.isSafeInteger(p.size) && p.size >= 0) parts.push(`s=${p.size}`);
  if (p.view && p.view !== "full") parts.push(`v=${p.view}`);
  return `${withSlash(siteBase)}d/?${parts.join("&")}`;
}

export function buildGeneratorUrl(siteBase: string, p: { address: string; name?: string }): string {
  const parts = [`a=${p.address}`];
  if (p.name) parts.push(`n=${encodeParam(sanitizeName(p.name))}`);
  return `${withSlash(siteBase)}?${parts.join("&")}`;
}

/**
 * Absolute site root for links that leave this site (embed snippets).
 * VITE_PUBLIC_ORIGIN pins the host at build time; otherwise the current origin.
 */
export function siteBaseUrl(
  env: { VITE_PUBLIC_ORIGIN?: string; BASE_URL: string } = import.meta.env,
  origin: string = location.origin,
): string {
  const host = (env.VITE_PUBLIC_ORIGIN || origin).replace(/\/+$/, "");
  return withSlash(host + withLeadingSlash(env.BASE_URL || "/"));
}

const withSlash = (s: string) => (s.endsWith("/") ? s : `${s}/`);
const withLeadingSlash = (s: string) => (s.startsWith("/") ? s : `/${s}`);
