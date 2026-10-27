import { describe, expect, it, vi } from "vitest";
import { MAX_BUFFERED_DOWNLOAD_BYTES, MAX_UPLOAD_BYTES, tooLargeHere } from "../src/lib/client";

let streamable = false;
vi.mock("@withautonomi/ant-browser-sdk", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getBrowserCapabilities: () => ({ operations: { streamAndSave: { available: streamable, missing: [] } } }),
}));

describe("size limits", () => {
  it("keeps the 1 GB caps for uploads and in-memory downloads", () => {
    expect(MAX_UPLOAD_BYTES).toBe(1_000_000_000);
    expect(MAX_BUFFERED_DOWNLOAD_BYTES).toBe(1_000_000_000);
  });

  it("refuses files over 1 GB where the browser can't stream to disk", () => {
    streamable = false;
    expect(tooLargeHere(1_000_000_000)).toBe(false);
    expect(tooLargeHere(1_000_000_001)).toBe(true);
  });

  it("allows any size where the browser can stream to disk", () => {
    streamable = true;
    expect(tooLargeHere(4_300_000_000)).toBe(false);
  });
});
