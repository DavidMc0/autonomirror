import { describe, expect, it } from "vitest";
import { BUTTON_STYLES, escapeHtml, htmlSnippet, markdownSnippet } from "../src/lib/snippets";
import { buildDownloadUrl } from "../src/lib/params";

const A = "711c7e20006ff3e0ac6c1f3063286a0c1a3e4c409642e8c526173fa60bb7078a";
const URL_ = buildDownloadUrl("https://example.github.io/autonomirror/", { address: A, name: "lucky.jpg", size: 312_400_000 });

describe("htmlSnippet", () => {
  it.each(BUTTON_STYLES)("%s matches snapshot", (style) => {
    expect(htmlSnippet(style, URL_, 312_400_000)).toMatchSnapshot();
  });

  it("escapes & in the href and omits the size when unknown", () => {
    const html = htmlSnippet("light", URL_);
    expect(html).toContain(`?a=${A}&amp;n=lucky.jpg`);
    expect(html).not.toContain("·");
    expect(htmlSnippet("minimal", URL_)).toContain(">Download from Autonomi</a>");
  });

  it("uses inline styles only: no script, class or stylesheet", () => {
    for (const style of BUTTON_STYLES) {
      const html = htmlSnippet(style, URL_, 1);
      expect(html).not.toMatch(/<script|<style|<link|class=/i);
      expect(html).toContain('target="_blank" rel="noopener"');
      expect(html).toContain('title="Free to download. Served by the Autonomi network, not this site."');
    }
  });

  it("parses back to one link with the original URL", () => {
    const doc = new DOMParser().parseFromString(htmlSnippet("dark", URL_, 5), "text/html");
    const links = doc.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe(URL_);
  });
});

describe("markdownSnippet", () => {
  it("includes the compact size", () => {
    expect(markdownSnippet(URL_, 312_400_000)).toBe(`[⬇ Download from Autonomi (312 MB)](${URL_})`);
    expect(markdownSnippet(URL_)).toBe(`[⬇ Download from Autonomi](${URL_})`);
  });
});

describe("escapeHtml", () => {
  it("escapes all five characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});
