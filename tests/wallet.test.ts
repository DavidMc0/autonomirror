import { describe, expect, it } from "vitest";
import { AutonomiError } from "@withautonomi/ant-browser-sdk";
import { isUserRejection } from "../src/lib/wallet";

describe("isUserRejection", () => {
  it("spots a declined prompt from the wallet or from ethers", () => {
    expect(isUserRejection({ code: 4001, message: "User rejected the request." })).toBe(true);
    expect(isUserRejection(Object.assign(new Error("user rejected action"), { code: "ACTION_REJECTED" }))).toBe(true);
  });

  it("looks through SDK wrapping", () => {
    const declined = Object.assign(new Error("user rejected action"), { code: "ACTION_REJECTED" });
    expect(isUserRejection(new AutonomiError("PAYMENT_FAILED", "Storage payment failed", declined))).toBe(true);
    expect(isUserRejection(new Error("outer", { cause: { error: { code: 4001 } } }))).toBe(true);
  });

  it("ignores other failures", () => {
    expect(isUserRejection(new AutonomiError("UPLOAD_FAILED", "Not enough peers"))).toBe(false);
    expect(isUserRejection({ code: -32603, message: "Internal JSON-RPC error" })).toBe(false);
    expect(isUserRejection(undefined)).toBe(false);
    expect(isUserRejection("4001")).toBe(false);
  });
});
