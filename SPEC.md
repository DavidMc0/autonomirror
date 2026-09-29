# Autonomi Download Button — demo spec

A minimal tech demo for the Autonomi community: paste an Autonomi address, get a download button you can embed on any site. Clicking the button opens a download page that fetches the file **directly from Autonomi nodes over WebRTC, in the browser**, with no server in the middle.

Hand this file to Claude Code as the build brief. Target: a static site, buildable in a day.

---

## 1. Scope

**In scope**

- A **generator page**: enter an address (plus a file name), check it exists, preview the button, copy embed code.
- A **download page**: opened by the button; downloads, verifies and saves the file in the browser.
- Embed outputs: an HTML button snippet, a Markdown link for READMEs, and a plain URL.
- A visible "Powered by Autonomi" credit linking to autonomi.com.

**Out of scope (do not build)**

- Uploading, payments, wallets, accounts, databases, analytics.
- Files over 1 GB (the browser SDK refuses them; show a clear message).
- Private files / DataMaps, archives (directory uploads), media streaming.
- Any backend. Everything is static files.

---

## 2. Verified facts the build depends on (checked 2026-09-29)

| Fact | Detail |
| --- | --- |
| Package | `@withautonomi/ant-browser-sdk`, version **0.1.0** on npm. Pin it exactly. The GitHub README sometimes says `@withautonomi/browser-sdk`; that name is **not** on npm. |
| Licence | MIT or Apache-2.0 |
| Module format | ESM only; loads a WASM file and (for uploads only) a worker via `new URL(..., import.meta.url)`. Vite handles this. |
| Mainnet seeds | Bundled: `AutonomiClient.connect()` with **no arguments** connects to mainnet via 7 certificate-pinned WebRTC seeds. No RPC, wallet or config needed for downloads. |
| Size limit | Downloads are refused above **1,000,000,000 bytes**, enforced in the Rust core. |
| File names | **Not stored on the network.** A public address resolves to a DataMap only; the SDK falls back to a generated name. The button URL must carry the file name. |
| Address type | A public file's **DataMap address**: 64 hex characters, as printed by `ant file upload --public`. Archive (directory) addresses won't work. |
| Integrity | `download()` verifies every chunk and the whole file (BLAKE3) before returning. |
| Save flow | `client.downloadAndSave(address, { suggestedName })` opens `showSaveFilePicker()` first **if called directly in a click handler**, then downloads and writes. Browsers without the picker fall back to an `<a download>` save. The whole file is held in memory. |
| Metadata | `client.openFile(address)` returns a reader with `.size` (from the verified DataMap) without downloading the file; call `.close()` after. |
| Progress | `onProgress` events carry `phase`, `message`, and optionally `completed` / `total` / `unit` (`bytes`, `records`). |
| Requirements | Secure context (HTTPS or localhost), WebAssembly, `RTCPeerConnection`. Networks that block UDP will fail to connect. |

Source: [ant-browser-sdk](https://github.com/WithAutonomi/ant-browser-sdk) at commit `8cbf5a7`, and the published 0.1.0 tarball.

---

## 3. Architecture

```
Publisher's site                     Demo site (static, HTTPS)                 Autonomi
┌──────────────┐   click   ┌───────────────────────────────┐  WebRTC  ┌────────────────┐
│ <a> button   │ ────────► │ /d/?a=<addr>&n=<name>&s=<size>│ ◄──────► │ storage nodes  │
└──────────────┘  new tab  │ download page + SDK (WASM)    │  chunks  └────────────────┘
                           └───────────────────────────────┘
                           ┌───────────────────────────────┐
                           │ /  generator page             │ (also uses SDK to check address)
                           └───────────────────────────────┘
```

- Vite + TypeScript, **no framework**. Two HTML entry points (multi-page build).
- Host on any static host with HTTPS: GitHub Pages, Cloudflare Pages or Netlify.
- The button is a plain link that opens the download page. It never loads the SDK on the host site. That keeps the embed tiny, works in READMEs and forums, and avoids cross-origin iframe limits on the save picker.

---

## 4. The download URL

```
https://<demo-host>/d/?a=<address>&n=<file name>&s=<size in bytes>
```

| Param | Required | Notes |
| --- | --- | --- |
| `a` | yes | 64 lowercase hex characters |
| `n` | recommended | File name for saving and display; URL-encoded. Default `autonomi-<first 8 hex>.bin` |
| `s` | optional | Size in bytes, for display before connecting. The page replaces it with the verified size from the DataMap. |

Validate everything read from the URL: `a` must match `^[0-9a-f]{64}$`. Sanitise `n` (strip `/ \ : * ? " < > |` and control characters, cap at 200 chars). Insert text with `textContent` only, never `innerHTML`.

---

## 5. Generator page (`/`)

**Layout, top to bottom:**

1. Title "Autonomi Download Button" and one line: "Turn any public Autonomi file into a download button for your site. Downloads come straight from the network, not from a server."
2. Form:
   - **Address**: text input. Accept pasted text with spaces, `0x`, or a link, and extract the first 64-hex run. Show a live counter ("64 of 64").
   - **File name**: text input, required, placeholder `my-mod-v1.2.zip`, with the hint "The network doesn't store names, so the button carries it."
   - **Check address** button.
3. Check result:
   - Connect (reuse one client for the page), call `openFile(address)`, read `.size`, then `close()`.
   - Success: "Found · 312.4 MB · verified DataMap". Store the size.
   - Over 1 GB: "This file is 3.2 GB. The browser download limit is 1 GB, so it can't be used in this demo."
   - Not found or failed: show the SDK error code and message, and suggest checking it's a **public file** address, not an archive.
   - While connecting: "Connecting to Autonomi…" The first connect can take several seconds.
4. **Style** radio: Light / Dark / Minimal (text link). Live preview of the button beneath, rendered from the exact snippet that will be copied.
5. **Embed code** (shown once the check passes; allow "Generate anyway" if the check fails, with a warning):
   - HTML snippet (textarea + Copy button)
   - Markdown for READMEs (textarea + Copy button)
   - Direct link (input + Copy + Open)
6. Footer: "Demo · Downloads are free and come from the Autonomi network · Powered by [Autonomi](https://autonomi.com/?ref=download-button-demo)".

Optional nicety: fill the form from query params (`/?a=…&n=…`) so people can share a pre-filled generator.

---

## 6. Embed outputs

All snippets use **inline styles only** (no external CSS, no script), so they paste into most CMSs.

**HTML — Light:**

```html
<a href="https://<demo-host>/d/?a=<addr>&n=<name>&s=<size>" target="_blank" rel="noopener"
   style="display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:8px;
          background:#ffffff;color:#0b1f33;border:1px solid #c9d6e2;font:600 15px/1.2 system-ui,sans-serif;
          text-decoration:none">
  <span aria-hidden="true">⬇</span>
  <span>Download from Autonomi</span>
  <span style="font-weight:400;opacity:.7">· 312 MB</span>
</a>
```

- **Dark** uses the same markup with a dark background and light text.
- **Minimal** is a plain underlined link: `Download from Autonomi (312 MB)`.
- Add `title="Free to download. Served by the Autonomi network, not this site."` to each variant.
- Omit the size span if the size is unknown.
- Pick the final colours from Autonomi's public branding. Use text, not their logo, unless brand guidelines allow it.

**Markdown:**

```markdown
[⬇ Download from Autonomi (312 MB)](https://<demo-host>/d/?a=<addr>&n=<name>&s=<size>)
```

**Wording rules:** "free" only ever describes the download ("Free to download"). Don't say "free mirror", "forever", or "can't be taken down".

---

## 7. Download page (`/d/`)

**On load:**

1. Parse and validate the params (section 4). Invalid address → error state with a link back to the generator.
2. Render the file card: name, size (from `s` if present), a shortened address with a copy button, and the line "This file will be fetched directly from Autonomi nodes by your browser."
3. Run a capability check with `getBrowserCapabilities()`. If `operations.download` isn't available, show which features are missing.
4. **Start connecting immediately** (`AutonomiClient.connect()`). Keep the Download button disabled with the label "Connecting…" until the connection is ready.
5. Once connected, call `openFile()` to fetch the verified size, update the card, and close the reader. Size over 1 GB → blocked state. On a phone (`navigator.deviceMemory <= 4` or a mobile user agent) with a file over 300 MB, show a memory warning without blocking.

**Why connect first:** `downloadAndSave()` must be the first `await` in the click handler, so the browser still counts it as a user action and opens the save dialog. If the handler awaits `connect()` first, the picker is lost and the save silently falls back to the anchor download.

**Click handler (sketch):**

```ts
button.addEventListener("click", async () => {
  if (!client) return;
  const controller = new AbortController();
  setState("downloading");
  try {
    const { download, save } = await client.downloadAndSave(address, {
      suggestedName: fileName,
      signal: controller.signal,
      onProgress: (e) => renderProgress(e),
    });
    setState("done", { hash: download.hash, method: save.method, bytes: download.bytes.byteLength });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return setState("ready"); // picker cancelled
    setState("error", err); // AutonomiError: show err.code + err.message
  }
});
```

Expose `controller.abort()` as a Cancel button while downloading.

**States:**

| State | UI |
| --- | --- |
| `connecting` | Spinner, "Connecting to the Autonomi network…" |
| `ready` | Enabled "Download" button |
| `downloading` | Progress bar + text. Use `completed/total` when `unit === "records"` ("Fetched 142 of 310 chunks") or `bytes`; otherwise show `message` in an indeterminate bar. Cancel button. |
| `done` | "Saved and verified. Every chunk was checked against its Autonomi address." Show the BLAKE3 hash (copyable) and a "Download again" button. |
| `blocked` | Over 1 GB, or a missing browser capability; explain which. |
| `error` | Friendly message, the SDK `code` in small text, and Retry (reconnect if needed). If the connection failed, add: "Some networks block the connections this uses. Try another network or use the publisher's other mirrors." |

**Other content on the page:**

- A short "How this works" box: files on Autonomi are split into encrypted chunks spread across nodes. Your browser finds the nodes holding this file, fetches the chunks directly, verifies them and reassembles the file. No server sends you the file, and downloading is free.
- A privacy line: "The nodes serving the file can see your IP address, like any peer-to-peer download."
- Links: "Make your own button" (generator), "Powered by Autonomi" (`https://autonomi.com/?ref=download-button-demo`).
- Optional flourish: a live count of nodes connected, taken from progress messages, to echo try.autonomi.com's node view.

Close the client on `pagehide`.

---

## 8. Project layout

```
autonomi-download-button/
├─ package.json            # vite, typescript, @withautonomi/ant-browser-sdk (exact 0.1.0)
├─ vite.config.ts          # multi-page: index.html + d/index.html
├─ index.html              # generator
├─ d/index.html            # download page
├─ src/
│  ├─ generator.ts
│  ├─ download.ts
│  ├─ lib/address.ts       # extract + validate 64-hex, shorten for display
│  ├─ lib/params.ts        # parse/sanitise URL params, build download URLs
│  ├─ lib/format.ts        # bytes → "312.4 MB"
│  ├─ lib/snippets.ts      # HTML / Markdown / link generators (pure functions)
│  ├─ lib/client.ts        # single shared connect() promise + error helpers
│  └─ styles.css
├─ tests/                  # vitest unit tests for lib/*
└─ README.md
```

**vite.config.ts:**

```ts
import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        download: resolve(__dirname, "d/index.html"),
      },
    },
  },
  // If the WASM 404s in dev, add: optimizeDeps: { exclude: ["@withautonomi/ant-browser-sdk"] }
});
```

If the demo is deployed under a sub-path (for example GitHub Pages at `/<repo>/`), set `base` and build URLs from `import.meta.env.BASE_URL`.

---

## 9. Build order for Claude Code

1. Scaffold Vite + TS, install the SDK at exactly `0.1.0`, and get a bare page that calls `AutonomiClient.connect()` and logs `client.connection`. **Stop here if connecting fails.** Nothing else matters until this works in a real browser.
2. Download page with a hard-coded test address: connect, `openFile` size, `downloadAndSave`, progress, done/error states.
3. URL params and validation for the download page.
4. `lib/*` helpers with unit tests.
5. Generator page: form, check, style picker, preview, snippets, copy buttons.
6. Styling, copy, footer credits, mobile layout.
7. Deploy to a static host with HTTPS; test end to end from a separate test page that embeds each snippet.

---

## 10. Testing and acceptance

**Test data:** use the sample addresses listed on [try.autonomi.com](https://try.autonomi.com) ("Try one of these"), plus one file you've uploaded yourself with `ant file upload --public`. Keep one small file (under 5 MB) and one large one (200–900 MB).

**Unit tests (vitest):** address extraction (spaces, `0x`, embedded in a URL, upper case, wrong lengths); name sanitising; URL building round-trips; byte formatting; snippet output snapshots.

**Manual matrix:** Chrome, Edge, Firefox and Safari on desktop; Chrome on Android; Safari on iOS. Check the save dialog appears on Chromium, the fallback download works elsewhere, and the saved file's hash matches the original.

**Acceptance criteria:**

- [ ] Pasting an address and name produces a working HTML snippet, Markdown and link in under 30 seconds.
- [ ] A snippet pasted into a blank HTML page on another origin opens the download page in a new tab.
- [ ] The download page downloads and saves the small test file in Chrome, Firefox and Safari, and the saved file is byte-identical to the original.
- [ ] Cancelling the save dialog returns to `ready` without an error.
- [ ] A file over 1 GB is refused with a clear message on both pages.
- [ ] A malformed or unknown address shows a friendly error, not a stack trace.
- [ ] With UDP blocked (or offline), the page shows the "some networks block this" message.
- [ ] No request other than static assets goes to the demo host during a download (check the browser's Network tab).
- [ ] Every page credits Autonomi with a link to autonomi.com.

---

## 11. Known limits to state in the README

- Experimental SDK and protocol: pin the version; a network upgrade may require updating it.
- 1 GB maximum; the whole file is held in memory while downloading.
- Public files only; the file name comes from the link, not the network.
- Download speed depends on the network and the visitor's connection.

## 12. Stretch goals (only after the acceptance criteria pass)

- A self-contained script button that downloads on the publisher's own page. See section 13.
- An SVG badge for READMEs.
- Streamed saving on Chromium (`openFile().stream()` into a `FileSystemWritableFileStream`) to avoid holding large files in memory.
- A "copy SHA-256" line computed after download, for sites that publish SHA-256 checksums.

---

## 13. Possible future addition: self-contained script button

**Status:** not built. It was proposed after the demo went live (2026-09-29) and is recorded here for a later decision.

### The problem it solves

Every link button depends on the demo site. The button is a plain link to `https://<demo-host>/d/?…`, and that page serves the download code (HTML, JS and the ~5 MB WASM engine). The file itself lives on Autonomi, but visitors can't reach it through the button if the demo host is unavailable. That can happen if:

- the host is down, or the site is moved, renamed or taken offline;
- a free host's bandwidth limit is reached (each download-page visit loads about 2 MB);
- the demo host's domain changes.

A custom domain reduces this risk but doesn't remove it: someone still has to keep the page hosted.

### The idea

A web component that the publisher adds to their own page. It downloads, verifies and saves the file right there, without sending the visitor to the demo site.

```html
<script type="module" src="https://<wherever>/autonomi-button.js"></script>
<autonomi-download address="<64 hex>" name="my-mod-v1.2.zip" size="312400000" theme="light">
  <!-- Fallback when scripts are blocked: the ordinary link button from section 6. -->
  <a href="https://<demo-host>/d/?a=…&n=…">Download from Autonomi</a>
</autonomi-download>
```

### Why it may make sense

- **No dependency on the demo host.** If the publisher self-hosts the script, buttons keep working even if the demo site disappears. The only remaining dependency is the Autonomi network.
- **Visitors stay on the publisher's page.** There's no extra tab or unfamiliar domain, which feels more trustworthy.
- **Better privacy.** Nothing touches a third-party site. Visitors who don't click load nothing and connect to no nodes (see the lazy loading below).
- **No hosting cost for the demo** as buttons spread, because each publisher serves their own copy.
- **It matches the "no server in the middle" pitch more literally.**

### Delivery options (offer both)

| Option | How | Trade-off |
| --- | --- | --- |
| Self-hosted | A single `autonomi-button.js` with the WASM included, downloadable from the generator. The publisher uploads it next to their files. | Fully independent. The publisher must replace the file when Autonomi's seeds or protocol change. |
| npm CDN | Publish as an npm package and load a pinned version from jsDelivr (or unpkg). | Durable, and versions never change once published. Updates reach publishers only when they move to a newer version. |

### SDK support (checked against `@withautonomi/ant-browser-sdk` 0.1.0)

- **The engine can be passed in directly.** `ClientOptions.wasm` accepts a `WasmSource`, so the WASM can be bundled into one file instead of loaded from a path next to the script.
- **The save dialog can open before anything loads.** The component calls `showSaveFilePicker()` as the first action in its click handler, then loads the SDK, connects, and calls `downloadAndSave(address, { fileHandle })`. `SaveOptions.fileHandle` lets the SDK write to the location already chosen. Without the picker (Firefox and Safari), it falls back to an ordinary `<a download>` save.
- **Only downloads are needed.** The upload worker isn't used, so it can be left out of the bundle.

### Lazy loading

The engine (about 2 MB compressed) loads only when someone clicks. Optionally, loading and connecting can start on hover or focus to save a few seconds. There are no WebRTC connections for visitors who don't show intent.

### Limits (document these in the generator)

- **Scripts must be allowed.** GitHub READMEs, forums and most hosted CMSs strip them, so the link button stays the universal option. This is an "advanced" choice for people who run their own sites.
- **Strict security policies may block it.** A Content Security Policy that doesn't allow `'wasm-unsafe-eval'` blocks the engine, and some policies restrict WebRTC. The component should detect the failure and reveal the fallback link.
- **Not inside iframes.** Cross-origin iframes block the save dialog, and an iframe embed would still depend on the demo host, so iframes aren't used.
- **The same limits as the download page apply:** HTTPS, 1 GB maximum, the whole file in memory, and networks that block UDP won't work.
- **Truly host-free isn't possible.** The engine code must be served from somewhere, because a browser can't load code from Autonomi without already running it.

### Generator changes

- Add an "Advanced: script button" tab next to the HTML, Markdown and link outputs.
- The tab gives the two-line snippet, including the fallback link.
- It offers a download of `autonomi-button.js`, and the CDN URL once the package is published.
- It explains when to use this instead of the link button.

### Acceptance criteria

- [ ] On a plain HTTPS page on another origin, the component downloads and saves the small test file, and the saved file is byte-identical to the original. Test in Chrome, Firefox and Safari.
- [ ] Before anyone clicks, the page loads no WASM and opens no WebRTC connections (check the Network tab).
- [ ] With scripts disabled, or with a CSP that blocks WebAssembly, the fallback link is shown and works.
- [ ] With the self-hosted file, a download completes with the demo host blocked entirely.

**Rough effort:** about half a day on top of the existing `src/lib/*` helpers, plus npm publishing if the CDN option is wanted.
