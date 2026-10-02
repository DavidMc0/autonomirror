/**
 * Files this browser has uploaded, so a paid upload isn't lost if the tab closes.
 * Kept in localStorage only: it never leaves this browser.
 */
export interface SavedUpload {
  address: string;
  name: string;
  size: number;
  /** ISO date of the upload. */
  date: string;
  /** Final storage payment transaction, when there was one. */
  tx?: string;
}

const KEY = "autonomirror.uploads";
const MAX_SAVED = 20;

const isSavedUpload = (u: unknown): u is SavedUpload => {
  const v = u as SavedUpload;
  return (
    typeof v === "object" &&
    v !== null &&
    typeof v.address === "string" &&
    /^[0-9a-f]{64}$/.test(v.address) &&
    typeof v.name === "string" &&
    Number.isSafeInteger(v.size) &&
    typeof v.date === "string" &&
    (v.tx === undefined || typeof v.tx === "string")
  );
};

/** Newest first. Unreadable or malformed storage reads as empty. */
export function loadUploads(): SavedUpload[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list.filter(isSavedUpload) : [];
  } catch {
    return [];
  }
}

/** Add an upload to the front, replacing an earlier entry for the same address. */
export function saveUpload(upload: SavedUpload): SavedUpload[] {
  const list = [upload, ...loadUploads().filter((u) => u.address !== upload.address)].slice(0, MAX_SAVED);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full or blocked: the upload still worked, it just isn't remembered.
  }
  return list;
}
