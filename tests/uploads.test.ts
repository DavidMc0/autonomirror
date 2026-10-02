import { beforeEach, describe, expect, it } from "vitest";
import { loadUploads, saveUpload, type SavedUpload } from "../src/lib/uploads";

const upload = (n: number): SavedUpload => ({ address: n.toString(16).padStart(64, "0"), name: `file-${n}.zip`, size: n, date: "2026-10-02T12:00:00.000Z" });

describe("saved uploads", () => {
  beforeEach(() => localStorage.clear());

  it("starts empty and keeps the newest first", () => {
    expect(loadUploads()).toEqual([]);
    saveUpload(upload(1));
    saveUpload({ ...upload(2), tx: "0xabc" });
    expect(loadUploads().map((u) => u.size)).toEqual([2, 1]);
    expect(loadUploads()[0].tx).toBe("0xabc");
  });

  it("replaces an earlier entry for the same address and caps the list", () => {
    for (let i = 1; i <= 25; i++) saveUpload(upload(i));
    saveUpload({ ...upload(3), name: "renamed.zip" });
    const list = loadUploads();
    expect(list).toHaveLength(20);
    expect(list[0].name).toBe("renamed.zip");
    expect(list.filter((u) => u.size === 3)).toHaveLength(1);
  });

  it("ignores corrupt or malformed storage", () => {
    localStorage.setItem("autonomirror.uploads", "{not json");
    expect(loadUploads()).toEqual([]);
    localStorage.setItem("autonomirror.uploads", JSON.stringify([upload(1), { address: "nope" }, null]));
    expect(loadUploads()).toEqual([upload(1)]);
  });
});
