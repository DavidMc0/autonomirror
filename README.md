# Autonomi Download Button

Turn any public [Autonomi](https://autonomi.com/?ref=download-button-demo) file into a download button for your site. Visitors who click it get the file **straight from Autonomi nodes, over WebRTC, in their browser**. There's no server in the middle.

**Live demo:** https://davidmc0.github.io/autonomirror/

This is a community tech demo built on [`@withautonomi/ant-browser-sdk`](https://github.com/WithAutonomi/ant-browser-sdk) 0.1.4.

## How it works

1. **The generator (`/`).** Paste the address of a public file (from `ant file upload --public`) and give it a file name. The page connects to Autonomi, checks that the file exists and reads its verified size. It then gives you:
   - an HTML button (Light, Dark or Minimal link) with inline styles only. Light and Dark read "Download lucky.jpg" with a small "Powered by Autonomi" line and logo underneath; the Minimal link reads "Download lucky.jpg from Autonomi";
   - a Markdown link for READMEs ("Download lucky.jpg from Autonomi");
   - a plain link.

   Or switch to **Upload a file**: pick or drop a file, see the exact storage price, then pay from a browser wallet such as MetaMask. Storage is paid in ANT on Arbitrum One, plus a little ETH on Arbitrum for network fees. Once stored, the address and name fill in and the embed code is ready. Uploads are remembered in the browser so a paid upload isn't lost if the tab closes.
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

Requires Node 22 or newer (the tests fail to start on Node 20.19).

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

- **Own domain:** to keep buttons working if the page ever moves host, serve it from a domain you own and set the repo variable `PUBLIC_ORIGIN`. See [docs/CUSTOM-DOMAIN.md](docs/CUSTOM-DOMAIN.md).

## If Autonomirror disappears

The files don't depend on this project. They're stored on the Autonomi network, and each visitor's browser fetches them directly from it. There is no Autonomirror server in between. What depends on this project is the download page the buttons link to. Anyone can bring it back:

1. **Rebuild the page.** Clone this repo (or a fork or archive of it), then with Node 22+ run `npm ci` and `npm run build`. Set `VITE_PUBLIC_ORIGIN` to the URL you'll host it at, and `BASE_PATH` if it's served from a sub-path.
2. **Host `dist/` anywhere** that serves static files over HTTPS (GitHub Pages, Cloudflare Pages, Netlify, your own server). If the original domain is pointed at the new host, existing buttons work again without changes.
3. **Licence.** The code is dual-licensed under [MIT](LICENSE-MIT) or [Apache 2.0](LICENSE-APACHE), so you may copy, host, modify and redistribute it, including commercially.
4. **Without any page at all**, a file can be fetched by its address. The address is in every download link (the `a=` part of `…/d/?a=<address>`) and, if the publisher turned it on, shown under the button. Open the [Autonomi app](https://autonomi.com), choose to download by address, and paste it. Or, with the `ant` command-line tool, run `ant file download <address> <output-file>` (check `ant file download --help`, as options vary between versions).

Buttons keep working wherever the page is hosted, as long as the domain they point at is renewed and pointed at a copy of the page.

## Known limits

- **Experimental.** The SDK and protocol are early. The SDK version is pinned, and a network upgrade may require updating it.
- **Large files need Chrome or Edge on a computer.** Those browsers stream downloads of any size straight to disk. Firefox, Safari and phones hold the whole file in memory, so they stop at 1 GB, and phones get a warning above 300 MB. Uploads are limited to 1 GB.
- **Uploads need a browser wallet** with ANT and a little ETH on Arbitrum One; there's no card payment yet. Wallet approvals are for the exact amount of each upload. Getting prices can take a minute or two, and a page reload during an upload loses the SDK's retry state (a finished upload is kept). On phones, use a wallet app's built-in browser.
- **Uploads are public and permanent**, and the payment links an upload to the paying wallet on the Arbitrum blockchain.
- **Public files only.** Archives (folder uploads) and private files aren't supported. The file name comes from the link, not the network.
- **Speed** depends on the network and the visitor's connection. The first lookup of a file can take 20–30 seconds.
- **Networks that block UDP** (some corporate or public Wi-Fi) can't make the WebRTC connections this relies on. The page says so when that happens.
- **Privacy.** The nodes serving a file can see the visitor's IP address, as with any peer-to-peer download.

## Credits

Downloads are free and come from the Autonomi network. Powered by [Autonomi](https://autonomi.com/?ref=download-button-demo). Sample files are from [try.autonomi.com](https://try.autonomi.com).

## Licence

Licensed under either of [Apache License 2.0](LICENSE-APACHE) or [MIT](LICENSE-MIT) at your option, matching the Autonomi browser SDK.
