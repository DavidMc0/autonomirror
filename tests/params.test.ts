import { describe, expect, it } from "vitest";
import {
  buildDownloadUrl,
  buildGeneratorUrl,
  defaultName,
  parseDownloadParams,
  sanitizeName,
  siteBaseUrl,
} from "../src/lib/params";

const A = "711c7e20006ff3e0ac6c1f3063286a0c1a3e4c409642e8c526173fa60bb7078a";
const BASE = "https://example.github.io/autonomirror/";

describe("sanitizeName", () => {
  it.each([
    ["my-mod-v1.2.zip", "my-mod-v1.2.zip"],
    ["../../etc/passwd", "etcpasswd"],
    ['a/b\c:d*e?f"g<h>i|j.txt', "abcdefghij.txt"],
    ["  spaced name.pdf  ", "spaced name.pdf"],
    ["tab\there\n.txt", "tabhere.txt"],
    ["evil‮txt.exe", "eviltxt.exe"],
    ["trailing dots...", "trailing dots"],
    [".hidden", "hidden"],
    ["Mandelbrot zoom.mp4", "Mandelbrot zoom.mp4"],
    ["日本語 (final).zip", "日本語 (final).zip"],
    ["///", ""],
  ])("%j → %j", (input, out) => expect(sanitizeName(input)).toBe(out));

  it("caps at 200 characters without splitting surrogate pairs", () => {
    expect(sanitizeName("x".repeat(500))).toHaveLength(200);
    const emoji = sanitizeName("😀".repeat(300));
    expect(Array.from(emoji)).toHaveLength(200);
  });
});

describe("parseDownloadParams", () => {
  it("parses a full link", () => {
    expect(parseDownloadParams(`?a=${A}&n=lucky.jpg&s=138931`)).toEqual({
      ok: true,
      params: { address: A, name: "lucky.jpg", nameProvided: true, size: 138931 },
    });
  });

  it("defaults the name and ignores a bad size", () => {
    const r = parseDownloadParams(`?a=${A}&s=12abc`);
    expect(r).toEqual({ ok: true, params: { address: A, name: defaultName(A), nameProvided: false, size: undefined } });
    expect(defaultName(A)).toBe("autonomi-711c7e20.bin");
  });

  it("treats a name that sanitises to nothing as missing", () => {
    const r = parseDownloadParams(`?a=${A}&n=%2F%2F`);
    expect(r.ok && r.params.nameProvided).toBe(false);
  });

  it.each([
    ["", "missing-address"],
    ["?n=x.zip", "missing-address"],
    [`?a=${A.toUpperCase()}`, "invalid-address"],
    [`?a=${A.slice(1)}`, "invalid-address"],
    [`?a=${A}<script>`, "invalid-address"],
  ])("rejects %j", (search, reason) => {
    expect(parseDownloadParams(search)).toEqual({ ok: false, reason });
  });
});

describe("buildDownloadUrl", () => {
  it("builds a compact URL", () => {
    expect(buildDownloadUrl(BASE, { address: A, name: "lucky.jpg", size: 138931 })).toBe(
      `${BASE}d/?a=${A}&n=lucky.jpg&s=138931`,
    );
  });

  it("encodes characters that would break Markdown or HTML", () => {
    const url = buildDownloadUrl(BASE, { address: A, name: "Mod (v2) & 'extras'!.zip" });
    expect(url).toBe(`${BASE}d/?a=${A}&n=Mod%20%28v2%29%20%26%20%27extras%27%21.zip`);
    expect(url).not.toMatch(/[ ()'!]/);
  });

  it.each(["Mandelbrot zoom.mp4", "日本語 (final).zip", "a+b=c#d?.tar.gz", "😀.png"])(
    "round-trips %j",
    (name) => {
      const url = new URL(buildDownloadUrl(BASE, { address: A, name, size: 42 }));
      const r = parseDownloadParams(url.search);
      expect(r).toEqual({ ok: true, params: { address: A, name: sanitizeName(name), nameProvided: true, size: 42 } });
    },
  );

  it("omits empty name and size, and adds a missing trailing slash", () => {
    expect(buildDownloadUrl("https://x.test", { address: A, name: "" })).toBe(`https://x.test/d/?a=${A}`);
  });

  it("builds a pre-filled generator link", () => {
    expect(buildGeneratorUrl(BASE, { address: A, name: "a b.zip" })).toBe(`${BASE}?a=${A}&n=a%20b.zip`);
  });
});

describe("siteBaseUrl", () => {
  it("uses the page origin by default", () => {
    expect(siteBaseUrl({ BASE_URL: "/" }, "http://localhost:5173")).toBe("http://localhost:5173/");
  });
  it("prefers VITE_PUBLIC_ORIGIN and respects a sub-path base", () => {
    expect(
      siteBaseUrl({ VITE_PUBLIC_ORIGIN: "https://davidmc0.github.io/", BASE_URL: "/autonomirror/" }, "http://localhost"),
    ).toBe("https://davidmc0.github.io/autonomirror/");
  });
});
