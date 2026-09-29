# Autonomi Download Button

Turn any public [Autonomi](https://autonomi.com/?ref=download-button-demo) file into a download button for your site. Visitors who click it get the file **straight from Autonomi nodes, over WebRTC, in their browser**. There's no server in the middle.

**Live demo:** https://davidmc0.github.io/autonomirror/

This is a community tech demo built on [`@withautonomi/ant-browser-sdk`](https://github.com/WithAutonomi/ant-browser-sdk) 0.1.0.

## How it works

1. **The generator (`/`).** Paste the address of a public file (from `ant file upload --public`) and give it a file name. The page connects to Autonomi, checks that the file exists and reads its verified size. It then gives you:
   - an HTML button (Light, Dark or Minimal link) with inline styles only, optionally showing the file name ("Download lucky.jpg from Autonomi") so several files on one page are easy to tell apart;
   - a Markdown link for READMEs;
   - a plain link.
2. **The button** is an ordinary link to the download page. It never loads the SDK on your site, so it works anywhere links do: websites, CMSs, READMEs and forums.
3. **The download page (`/d/`)** connects to the network as soon as it opens. When the visitor clicks Download, it fetches every encrypted chunk directly from the nodes storing them, verifies each chunk and the whole file (BLAKE3), and saves the file. Chromium browsers show a save dialog; other browsers use a normal download.

### Download link format

```
https://<host>/d/?a=<address>&n=<file name>&s=<size in bytes>&v=<view>
```

| Param | Required | Notes |
| --- | --- | --- |
| `a` | yes | 64 lowercase hex characters: a public file's DataMap address. |
| `n` | recommended | File name. The network doesn't store names, so the link carries it. It's sanitised on arrival. |
| `s` | optional | Size shown before connecting. It's replaced by the verified size from the network. |
| `v` | optional | Page size: `full` (default), `medium`, or `compact`. |

The generator also accepts `/?a=…&n=…&v=…` to open with the form already filled in.

## Development

Requires Node 20.19 or newer.

```sh
npm install
npm run dev       # http://localhost:5173 (localhost counts as a secure context)
npm test          # vitest unit tests for src/lib
npm run build     # type-check and build to dist/
npm run preview   # serve dist/
```

```
index.html          generator page         src/generator.ts, src/generator.css
d/index.html        download page          src/download.ts,  src/download.css
src/lib/            address, params, format, snippets, progress, client, ui helpers
src/styles.css      shared theme (dark and light, following the system setting)
tests/              unit tests for src/lib
```

### Configuration

Both variables are read at build time.

| Variable | Purpose |
| --- | --- |
| `BASE_PATH` | Sub-path the site is served from, e.g. `/autonomirror/`. Defaults to `/`. |
| `VITE_PUBLIC_ORIGIN` | Origin written into embed snippets, e.g. `https://example.com`. Defaults to whichever origin the generator is opened on. |

## Deploying

The output is static files, so any static host with HTTPS works. HTTPS is required because the SDK needs a secure context.

- **GitHub Pages:** `.github/workflows/deploy.yml` tests, builds and deploys on every push to `main`. It sets `BASE_PATH` and `VITE_PUBLIC_ORIGIN` from the Pages settings. Enable it under *Settings → Pages → Source: GitHub Actions*.
- **Cloudflare Pages or Netlify:** build command `npm run build`, output directory `dist`. Set `VITE_PUBLIC_ORIGIN` to your site's URL.

Make sure `.wasm` files are served as `application/wasm`. All of the hosts above do this by default.

## Known limits

- **Experimental.** The SDK and protocol are early. The SDK version is pinned, and a network upgrade may require updating it.
- **1 GB maximum.** The SDK refuses larger downloads, and the whole file is held in memory while it downloads. Phones get a warning above 300 MB.
- **Public files only.** Archives (folder uploads) and private files aren't supported. The file name comes from the link, not the network.
- **Speed** depends on the network and the visitor's connection. The first lookup of a file can take 20–30 seconds.
- **Networks that block UDP** (some corporate or public Wi-Fi) can't make the WebRTC connections this relies on. The page says so when that happens.
- **Privacy.** The nodes serving a file can see the visitor's IP address, as with any peer-to-peer download.

## Credits

Downloads are free and come from the Autonomi network. Powered by [Autonomi](https://autonomi.com/?ref=download-button-demo). Sample files are from [try.autonomi.com](https://try.autonomi.com).

## Licence

Licensed under either of [Apache License 2.0](LICENSE-APACHE) or [MIT](LICENSE-MIT) at your option, matching the Autonomi browser SDK.
