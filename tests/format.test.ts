import { describe, expect, it } from "vitest";
import { formatBytes, formatExactBytes } from "../src/lib/format";

describe("formatBytes", () => {
  it.each([
    [0, "0 bytes"],
    [1, "1 byte"],
    [574, "574 bytes"],
    [999, "999 bytes"],
    [1000, "1 KB"],
    [138_931, "138.9 KB"],
    [312_400_000, "312.4 MB"],
    [999_960, "1 MB"],
    [1_000_000_000, "1 GB"],
    [3_200_000_000, "3.2 GB"],
  ])("%d → %s", (n, s) => expect(formatBytes(n)).toBe(s));

  it.each([
    [312_400_000, "312 MB"],
    [11_572_127, "12 MB"],
    [3_249_000_000, "3.2 GB"],
    [574, "574 bytes"],
  ])("compact %d → %s", (n, s) => expect(formatBytes(n, { compact: true })).toBe(s));

  it("ignores invalid input", () => {
    expect(formatBytes(-1)).toBe("");
    expect(formatBytes(NaN)).toBe("");
  });

  it("formats exact bytes", () => {
    expect(formatExactBytes(67_108_864)).toBe("67,108,864 bytes");
  });
});
