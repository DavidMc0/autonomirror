import { formatBytes } from "./format";

export type ButtonStyle = "light" | "dark" | "minimal";
export const BUTTON_STYLES: readonly ButtonStyle[] = ["light", "dark", "minimal"];

export const BUTTON_LABEL = "Download from Autonomi";
export const BUTTON_TITLE = "Free to download. Served by the Autonomi network, not this site.";
/** Longer names are shortened in the middle so the version and extension stay visible. */
export const MAX_LABEL_NAME = 40;

export interface SnippetOptions {
  size?: number;
  /** When set, the label reads "Download <name> from Autonomi". */
  fileName?: string;
}

// Colours from Autonomi's public palette: navy #131c32, indigo #232a59, red #e91337, mint #97ffa0.
const BASE =
  "display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:8px;" +
  "font:600 15px/1.2 system-ui,-apple-system,'Segoe UI',sans-serif;text-decoration:none;white-space:nowrap";
const THEMES = {
  light: { box: "background:#ffffff;color:#131c32;border:1px solid #c5cdd7", arrow: "#e91337" },
  dark: { box: "background:#131c32;color:#ffffff;border:1px solid #232a59", arrow: "#97ffa0" },
} as const;

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

/** Backslash-escape characters that Markdown would treat as formatting inside link text. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]<>]/g, (c) => `\\${c}`);
}

/** "a-very-long-file-name-for-my-mod-v1.2.zip" → "a-very-long-file-na…my-mod-v1.2.zip" */
export function shortenName(name: string, max = MAX_LABEL_NAME): string {
  const chars = Array.from(name);
  if (chars.length <= max) return name;
  const tail = Math.ceil((max - 1) / 2);
  const head = max - 1 - tail;
  return `${chars.slice(0, head).join("")}…${chars.slice(-tail).join("")}`;
}

export function buttonLabel(fileName?: string): string {
  return fileName ? `Download ${shortenName(fileName)} from Autonomi` : BUTTON_LABEL;
}

const sizeLabel = (size?: number) => (size === undefined ? "" : formatBytes(size, { compact: true }));

export function htmlSnippet(style: ButtonStyle, url: string, { size, fileName }: SnippetOptions = {}): string {
  const href = escapeHtml(url);
  const sizeText = sizeLabel(size);
  const label = escapeHtml(buttonLabel(fileName));
  // A shortened name is still readable in full on hover.
  const title = fileName && shortenName(fileName) !== fileName ? `${fileName}. ${BUTTON_TITLE}` : BUTTON_TITLE;
  const attrs = `href="${href}" target="_blank" rel="noopener" title="${escapeHtml(title)}"`;

  if (style === "minimal") {
    return `<a ${attrs} style="text-decoration:underline">${label}${sizeText ? ` (${sizeText})` : ""}</a>`;
  }

  const theme = THEMES[style];
  const lines = [
    `<a ${attrs}`,
    `   style="${BASE};${theme.box}">`,
    `  <span aria-hidden="true" style="color:${theme.arrow}">⬇</span>`,
    `  <span>${label}</span>`,
  ];
  if (sizeText) lines.push(`  <span style="font-weight:400;opacity:.7">· ${sizeText}</span>`);
  lines.push(`</a>`);
  return lines.join("\n");
}

export function markdownSnippet(url: string, { size, fileName }: SnippetOptions = {}): string {
  const sizeText = sizeLabel(size);
  return `[⬇ ${escapeMarkdown(buttonLabel(fileName))}${sizeText ? ` (${sizeText})` : ""}](${url})`;
}
