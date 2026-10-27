# Project notes

A shared log for everyone working on this repo. Add entries as `- YYYY-MM-DD [Author] text`, with Author being `[Grok Bot]`, `[Claude]` or `[David]`. Append only: never rewrite someone else's entry. To close one, add `(resolved YYYY-MM-DD [Author]: …)` after it. `SPEC.md` stays the source of truth; record decisions here and then fold them into the spec.

## Decisions

- 2026-10-26 [Grok Bot] Validate demand with 5–10 real publishers (game mods, Linux ISOs) before building payments further.
- 2026-10-26 [Grok Bot] After validation, build a **shared payments layer** (price quote, wallet and possibly card payment, upload tracking and resume, receipts). It will be extracted from `src/lib/wallet.ts` and `src/lib/uploads.ts` so that later front ends (photo albums, AutoVid YouTube backup) can reuse it.

## Open questions

- 2026-10-26 [Grok Bot] When will an ant-browser-sdk release include the ant-client large-download core (PR #214) and raise `maxFileBytes` for downloads? The latest on npm is 0.1.2 (2026-10-05), which still has the 1 GB cap.
- 2026-10-26 [Claude] Large-download SDK progress: ant-client #230 (manifest export and pointer recovery, which SDK PR #7 depended on) merged on 2026-10-22. ant-browser-sdk PR #7 (large-file streaming, adding `client.streamAndSave()` and `PublicFileReader.pipeTo()`) is out of draft and was updated on 2026-10-26, but isn't merged yet. npm is still at 0.1.2. When upgrading: in PR #7, `maxFileBytes` becomes the upload limit, so `MAX_DOWNLOAD_BYTES` in `src/lib/client.ts` must stop using it; `openFile` stops throwing for large files, so `oversizedFileBytes` stops firing; and the media service worker needs redeploying with the new SDK. https://github.com/WithAutonomi/ant-browser-sdk/pull/7 · https://github.com/WithAutonomi/ant-client/pull/230
- 2026-10-27 [Claude] `@withautonomi/ant-browser-sdk` 0.1.3 was published to npm on 2026-10-27 and includes SDK PR #7. It adds `client.streamAndSave()` and `PublicFileReader.pipeTo()` (a bounded disk stream with no size cap), and `SDK_LIMITS.maxUploadBytes` (1 GB). `maxFileBytes` is now an alias for the upload limit. `download()`/`downloadAndSave()` take `maxMemoryBytes`, which defaults to 1 GB, and `openFile()` no longer rejects large files. Capabilities gain `pipeTo` and `streamAndSave`; `streamAndSave` needs `showSaveFilePicker`, so it works on desktop Chromium only. Changes needed here: pin 0.1.3; split `MAX_DOWNLOAD_BYTES` into an upload limit (`maxUploadBytes`) and a buffered limit (`defaultDownloadMemoryBytes`); use `streamAndSave` on `/d/` when the picker exists and keep `downloadAndSave` with the 1 GB message elsewhere; render `saving`-phase byte progress, which the page currently ignores; let the generator accept files over 1 GB with a "Chrome/Edge desktop only" note; replace `oversizedFileBytes` and its tests. Not built yet: it needs a decision on Firefox/Safari and a real file over 1 GB to test.
- 2026-10-27 [Claude] Built the above on `feat/sdk-0.1.3-large-downloads`. David chose option A for Firefox/Safari: keep the 1 GB message there, pointing to Chrome/Edge on a computer or the ant tool. Chromium streams every download, not just large ones. Later: a small standalone downloader, or point people to the Autonomi App (SPEC roadmap item 4). Tested in headless Edge on the live network with the 64 MB sample: the streamed save (fake save picker) and the buffered save without a picker were both byte-identical (SHA-256 matches). Still untested: a real file over 1 GB, and real Firefox/Safari/Android.
- 2026-10-26 [Grok Bot] What are the Autonomi app's upload limits? No primary source found; expected no cap, untested.
- 2026-10-26 [Grok Bot] Do publishers need card/fiat payment, or is a wallet acceptable?

## Test results

- 2026-10-26 [Grok Bot] `npm test` with Node 20.19.2 fails to start: vitest workers throw `webidl.util.markAsUncloneable is not a function`, likely needing a newer Node. With Node 22: 8 files, 103 tests passed.
- 2026-10-26 [Grok Bot] Size-limit findings (from code and docs, not tested):
  - The network and core no longer limit downloads to 1 GB. ant-client PR #214 adds streaming `pipeTo` and range reads; it shipped in ant-core v0.13.0 and ant-cli v0.3.11/0.3.12. https://github.com/WithAutonomi/ant-client/pull/214 · https://github.com/WithAutonomi/ant-client/blob/main/ant-core/src/browser.rs
  - `MAX_BROWSER_FILE_BYTES` (1,000,000,000) still caps **browser uploads**.
  - The browser SDK (0.1.2 and main) still caps downloads, range reads and media at 1 GB. https://github.com/WithAutonomi/ant-browser-sdk/blob/main/src/limits.ts · https://docs.autonomi.com/developers/sdk/install/build-in-browser
  - Nodes: ant-node v0.23.0 (2026-10-16) and v0.23.1 (2026-10-23). The release notes don't mention size limits. https://github.com/WithAutonomi/ant-node/releases
  - This repo pins SDK 0.1.1 and uses the in-memory `downloadAndSave`, so >1 GB downloads won't work here yet.

## Next steps

- 2026-10-26 [Grok Bot] Contact publishers from the shortlist once David approves the drafts.
- 2026-10-26 [Grok Bot] Test plan for downloads over 1 GB:
  1. Upload 1.5 GB and 4 GB public files with ant CLI 0.3.12 and record the cost.
  2. Use a newer SDK, or build one locally from main against ant-client main with the download cap raised.
  3. On a branch, stream `/d/` via `openFile().pipeTo(showSaveFilePicker writable)` for files over 1 GB.
  4. Test Chromium desktop: download completes, hash matches, memory stays bounded.
  5. Record the Firefox and Safari fallback, Android Chrome with 1.5 GB, aborting mid-download, and a UDP-blocked network.
  6. Pass: 4 GB on Chromium desktop with bounded memory.
