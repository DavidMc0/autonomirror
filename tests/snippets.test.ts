import { describe, expect, it } from "vitest";
import { BUTTON_STYLES, escapeHtml, escapeMarkdown, htmlSnippet, markdownSnippet, shortenName } from "../src/lib/snippets";
import { buildDownloadUrl } from "../src/lib/params";

const A = "711c7e20006ff3e0ac6c1f3063286a0c1a3e4c409642e8c526173fa60bb7078a";
const URL_ = buildDownloadUrl("https://example.github.io/autonomirror/", { address: A, name: "lucky.jpg", size: 312_400_000 });

describe("htmlSnippet", () => {
  it.each(BUTTON_STYLES)("%s matches snapshot", (style) => {
    expect(htmlSnippet(style, URL_, { size: 312_400_000 })).toMatchSnapshot();
  });

  it("escapes & in the href and omits the size when unknown", () => {
    const html = htmlSnippet("light", URL_);
    expect(html).toContain(`?a=${A}&amp;n=lucky.jpg`);
    expect(html).not.toContain("·");
    expect(htmlSnippet("minimal", URL_)).toContain(">Download from Autonomi</a>");
  });

  it("uses inline styles only: no script, class or stylesheet", () => {
    for (const style of BUTTON_STYLES) {
      const html = htmlSnippet(style, URL_, { size: 1 });
      expect(html).not.toMatch(/<script|<style|<link|class=/i);
      expect(html).toContain('target="_blank" rel="noopener"');
      expect(html).toContain('title="Free to download. Served by the Autonomi network, not this site."');
    }
  });

  it("parses back to one link with the original URL", () => {
    const doc = new DOMParser().parseFromString(htmlSnippet("dark", URL_, { size: 5 }), "text/html");
    const links = doc.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe(URL_);
  });
});

describe("markdownSnippet", () => {
  it("includes the compact size", () => {
    expect(markdownSnippet(URL_, { size: 312_400_000 })).toBe(`[⬇ Download from Autonomi (312 MB)](${URL_})`);
    expect(markdownSnippet(URL_)).toBe(`[⬇ Download from Autonomi](${URL_})`);
  });
});

describe("file name in the label", () => {
  it.each(BUTTON_STYLES)("%s shows the name", (style) => {
    expect(htmlSnippet(style, URL_, { size: 138_931, fileName: "lucky.jpg" })).toMatchSnapshot();
  });

  it("escapes the name in HTML", () => {
    const html = htmlSnippet("light", URL_, { fileName: 'a<b>&"c".zip' });
    expect(html).toContain("Download a&lt;b&gt;&amp;&quot;c&quot;.zip from Autonomi");
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("a")!.textContent).toContain('Download a<b>&"c".zip from Autonomi');
  });

  it("escapes the name in Markdown", () => {
    expect(markdownSnippet(URL_, { size: 138_931, fileName: "my_mod [v2].zip" })).toBe(
      String.raw`[⬇ Download my\_mod \[v2\].zip from Autonomi (139 KB)](` + URL_ + ")",
    );
    expect(escapeMarkdown("a*b`c")).toBe("a\\*b\\`c");
  });

  it("shortens long names in the middle and keeps the full name in the tooltip", () => {
    const name = "a-very-long-file-name-for-my-favourite-mod-v1.2.zip";
    expect(shortenName(name)).toBe("a-very-long-file-na…vourite-mod-v1.2.zip");
    expect(Array.from(shortenName(name))).toHaveLength(40);
    expect(shortenName("short.zip")).toBe("short.zip");
    const html = htmlSnippet("dark", URL_, { fileName: name });
    expect(html).toContain(">Download a-very-long-file-na…vourite-mod-v1.2.zip from Autonomi<");
    expect(html).toContain(`title="${name}. Free to download.`);
  });
});

describe("escapeHtml", () => {
  it("escapes all five characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});
