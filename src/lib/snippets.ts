import { formatBytes } from "./format";

export type ButtonStyle = "light" | "dark" | "minimal";
export const BUTTON_STYLES: readonly ButtonStyle[] = ["light", "dark", "minimal"];

export const BUTTON_LABEL = "Download from Autonomi";
export const BUTTON_TITLE = "Free to download. Served by the Autonomi network, not this site.";

// Colours from Autonomi's public palette: navy #131c32, indigo #232a59, red #e91337, mint #97ffa0.
const BASE =
  "display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:8px;" +
  "font:600 15px/1.2 system-ui,-apple-system,'Segoe UI',sans-serif;text-decoration:none";
const THEMES = {
  light: { box: "background:#ffffff;color:#131c32;border:1px solid #c5cdd7", arrow: "#e91337" },
  dark: { box: "background:#131c32;color:#ffffff;border:1px solid #232a59", arrow: "#97ffa0" },
} as const;

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

const sizeLabel = (size?: number) => (size === undefined ? "" : formatBytes(size, { compact: true }));

export function htmlSnippet(style: ButtonStyle, url: string, size?: number): string {
  const href = escapeHtml(url);
  const label = sizeLabel(size);
  const attrs = `href="${href}" target="_blank" rel="noopener" title="${escapeHtml(BUTTON_TITLE)}"`;

  if (style === "minimal") {
    return `<a ${attrs} style="text-decoration:underline">${BUTTON_LABEL}${label ? ` (${label})` : ""}</a>`;
  }

  const theme = THEMES[style];
  const lines = [
    `<a ${attrs}`,
    `   style="${BASE};${theme.box}">`,
    `  <span aria-hidden="true" style="color:${theme.arrow}">⬇</span>`,
    `  <span>${BUTTON_LABEL}</span>`,
  ];
  if (label) lines.push(`  <span style="font-weight:400;opacity:.7">· ${label}</span>`);
  lines.push(`</a>`);
  return lines.join("\n");
}

export function markdownSnippet(url: string, size?: number): string {
  const label = sizeLabel(size);
  return `[⬇ ${BUTTON_LABEL}${label ? ` (${label})` : ""}](${url})`;
}
