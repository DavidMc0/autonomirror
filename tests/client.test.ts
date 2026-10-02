import { describe, expect, it } from "vitest";
import { AutonomiError } from "@withautonomi/ant-browser-sdk";
import { oversizedFileBytes } from "../src/lib/client";

describe("oversizedFileBytes", () => {
  it("reads the size from the SDK's open-file error", () => {
    // openFile wraps the core's string error like this.
    const err = new AutonomiError("OPEN_FILE_FAILED", "Could not open the public file: invalid public file size 3200000000", "invalid public file size 3200000000");
    expect(oversizedFileBytes(err)).toBe(3_200_000_000);
  });

  it("finds the size in a wrapped cause", () => {
    const err = new Error("Download failed", { cause: new Error("invalid public file size 1000000001") });
    expect(oversizedFileBytes(err)).toBe(1_000_000_001);
  });

  it("ignores other errors and sizes within the limit", () => {
    expect(oversizedFileBytes(new AutonomiError("OPEN_FILE_FAILED", "Could not open the public file: record not found"))).toBeUndefined();
    expect(oversizedFileBytes(new Error("invalid public file size 2"))).toBeUndefined();
    expect(oversizedFileBytes(new Error("invalid public file size 1000000000"))).toBeUndefined();
    expect(oversizedFileBytes("invalid public file size 3200000000")).toBeUndefined();
    expect(oversizedFileBytes(undefined)).toBeUndefined();
  });
});
