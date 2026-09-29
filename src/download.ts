import "./styles.css";
import "./download.css";
import { getBrowserCapabilities, type AutonomiClient, type ProgressEvent } from "@withautonomi/ant-browser-sdk";
import { shortenAddress } from "./lib/address";
import { closeClient, connectedClient, describeError, getClient, MAX_DOWNLOAD_BYTES, type FriendlyError } from "./lib/client";
import { drawConstellation, type Constellation } from "./lib/constellation";
import { formatBytes, formatExactBytes } from "./lib/format";
import { parseDownloadParams, type DownloadParams } from "./lib/params";
import { chunkCountFromMessage, readProgress } from "./lib/progress";
import { $, applyState, bindCopy, setText } from "./lib/ui";

type State = "invalid" | "connecting" | "ready" | "downloading" | "done" | "blocked" | "error";

const PHONE_WARN_BYTES = 300_000_000;
const MAX_GRID_CELLS = 96;

const FEATURE_NAMES: Record<string, string> = {
  window: "a browser window",
  secureContext: "a secure (HTTPS) connection",
  webAssembly: "WebAssembly",
  webRtc: "WebRTC",
  crypto: "Web Crypto",
  blob: "Blob support",
  document: "a document",
  objectUrls: "object URLs",
  readableStream: "streams",
};

const app = $("app");
let state: State = "connecting";
let params: DownloadParams;
/** Verified size from the DataMap, once known. */
let verifiedSize: number | undefined;
let chunkTotal: number | undefined;
let controller: AbortController | null = null;
let constellation: Constellation | undefined;
/** Where to resume after an error: reconnect, re-check the file, or just re-enable the button. */
let retryAction: "connect" | "verify" | "download" = "connect";

function setState(next: State): void {
  state = next;
  applyState(app, next);
}

// ------------------------------------------------------------------ boot

const parsed = parseDownloadParams(location.search);
if (!parsed.ok) {
  setText(
    $("invalid-reason"),
    parsed.reason === "missing-address"
      ? "The link is missing an Autonomi address. Ask whoever shared it for a fresh link, or make your own button."
      : "The address in this link isn't a valid Autonomi address (64 hexadecimal characters). It may have been cut off when it was copied.",
  );
  document.title = "Invalid link · Autonomi Download";
  setState("invalid");
} else {
  params = parsed.params;
  renderFileCard();
  const caps = getBrowserCapabilities();
  if (!caps.operations.download.available) {
    const missing = caps.operations.download.missing.map((f) => FEATURE_NAMES[f] ?? f);
    showBlocked(
      "Your browser can't download from Autonomi",
      `This page needs ${listJoin(missing)}, which ${missing.length === 1 ? "isn't" : "aren't"} available here. Try an up-to-date Chrome, Edge, Firefox or Safari.`,
    );
  } else {
    connect();
  }
}

function renderFileCard(): void {
  const { address, name, view } = params;
  document.documentElement.dataset.view = view;
  const how = $<HTMLDetailsElement>("how");
  how.open = view === "full";
  $("show-how").addEventListener("click", (e) => {
    e.preventDefault();
    document.documentElement.classList.add("show-how");
    how.open = true;
    how.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.title = `${name} · Autonomi Download`;
  setText($("file-name"), name);
  const ext = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1];
  setText($("file-ext"), (ext ?? "file").toUpperCase());
  $("file-ext").classList.toggle("is-long", (ext?.length ?? 4) > 3);

  const short = $("address-short");
  setText(short, shortenAddress(address, 8, 8));
  short.title = address;
  bindCopy($<HTMLButtonElement>("copy-address"), () => address);

  renderSize();
  constellation = drawConstellation($("constellation") as unknown as SVGSVGElement, address);
}

function renderSize(): void {
  const size = verifiedSize ?? params.size;
  const sizeEl = $("file-size");
  setText(sizeEl, size === undefined ? "Size unknown" : formatBytes(size));
  sizeEl.title = size === undefined ? "" : formatExactBytes(size);

  const badge = $("size-badge");
  badge.hidden = size === undefined && verifiedSize === undefined;
  badge.classList.toggle("is-verified", verifiedSize !== undefined);
  setText(badge, verifiedSize !== undefined ? "✓ verified" : "from link");
  badge.title =
    verifiedSize !== undefined
      ? "Size read from the file's verified DataMap on the network"
      : "Size given in the link; it will be checked against the network";

  const chunks = $("chunk-meta");
  chunks.hidden = chunkTotal === undefined;
  if (chunkTotal !== undefined) setText(chunks, `${chunkTotal} encrypted chunk${chunkTotal === 1 ? "" : "s"}`);

  setText($("download-meta"), size === undefined ? "" : `· ${formatBytes(size, { compact: true })}`);
}

// ------------------------------------------------------------------ connect + verify

function onConnectProgress(e: ProgressEvent): void {
  if (state !== "connecting") return;
  if (e.phase === "initializing") setStatus("connecting", "Connecting to the Autonomi network…", "Starting the Autonomi engine in your browser");
  else if (e.phase === "connecting") setStatus("connecting", "Connecting to the Autonomi network…", `${e.message}…`);
}

async function connect(): Promise<void> {
  setState("connecting");
  setStatus("connecting", "Connecting to the Autonomi network…", "The first connection can take a few seconds.");
  setButton("connecting");
  try {
    const client = await getClient(onConnectProgress);
    if (state !== "connecting") return;
    setState("ready");
    setButton("ready");
    void verify(client);
  } catch (err) {
    showError(describeError(err), "connect");
  }
}

/** Read the verified size from the DataMap without downloading the file. */
async function verify(client: AutonomiClient): Promise<void> {
  setStatus("checking", "Connected", "Finding the file on the network…");
  let reader;
  try {
    reader = await client.openFile(params.address, {
      onProgress: (e) => {
        const n = chunkCountFromMessage(e.message);
        if (n !== undefined) chunkTotal = n;
      },
    });
  } catch (err) {
    // A download already started takes precedence over a failed pre-check.
    if (state === "ready") showError(describeError(err), "verify");
    return;
  }
  verifiedSize = reader.size;
  reader.close();
  renderSize();
  if (state !== "ready") return;

  if (verifiedSize > MAX_DOWNLOAD_BYTES) {
    showBlocked(
      "This file is too large for a browser download",
      `It's ${formatBytes(verifiedSize)}. Browsers can download files up to ${formatBytes(MAX_DOWNLOAD_BYTES)} from Autonomi, so use the Autonomi command-line tools (ant) for this one.`,
    );
    return;
  }
  $("memory-warning").hidden = !(isPhone() && verifiedSize > PHONE_WARN_BYTES);
  setStatus("ready", "Ready to download", "Found the file and verified its DataMap.");
}

function isPhone(): boolean {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return (memory !== undefined && memory <= 4) || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

// ------------------------------------------------------------------ download

$("download-btn").addEventListener("click", startDownload);
$("again-btn").addEventListener("click", startDownload);
$("retry-btn").addEventListener("click", retry);
$("cancel-btn").addEventListener("click", () => controller?.abort());
bindCopy($<HTMLButtonElement>("copy-hash"), () => $("done-hash").textContent ?? "");

async function startDownload(): Promise<void> {
  const client = connectedClient();
  if (!client || state === "downloading") return;
  controller = new AbortController();
  const started = performance.now();
  $("cancelled-note").hidden = true;
  setState("downloading");
  resetProgress();
  try {
    // Must be the first await so the save picker still counts as a user action.
    const { download, save } = await client.downloadAndSave(params.address, {
      suggestedName: params.name,
      signal: controller.signal,
      onProgress: (e) => renderProgress(e, started),
    });
    verifiedSize = download.bytes.byteLength;
    chunkTotal = download.file.chunks.length || chunkTotal;
    renderSize();
    showDone(download.hash, save.method, save.name, download.bytes.byteLength, performance.now() - started);
  } catch (err) {
    const info = describeError(err);
    if (info.cancelled) {
      setState("ready");
      setButton("ready");
      $("cancelled-note").hidden = false;
      return;
    }
    showError(info, info.connection || info.code === "CLIENT_CLOSED" ? "connect" : "download");
  } finally {
    controller = null;
  }
}

function resetProgress(): void {
  setText($("progress-title"), "Finding the file…");
  setText($("progress-percent"), "");
  setText($("progress-message"), "Starting…");
  $("progress-bar").classList.add("is-indeterminate");
  $("progress-bar").removeAttribute("aria-valuenow");
  $("bar-fill").style.width = "0%";
  buildGrid(chunkTotal);
}

let gridTotal = 0;
function buildGrid(total: number | undefined): void {
  const grid = $("chunk-grid");
  gridTotal = total ?? 0;
  const cells = Math.min(gridTotal, MAX_GRID_CELLS);
  grid.hidden = cells === 0;
  // The chunk grid replaces the plain bar once the chunk count is known.
  $("progress-bar").hidden = cells > 0;
  grid.classList.toggle("is-dense", cells > 24);
  grid.replaceChildren(...Array.from({ length: cells }, () => document.createElement("span")));
  grid.style.setProperty("--cols", String(Math.min(cells, 24)));
}

function paintGrid(completed: number): void {
  const cells = $("chunk-grid").children;
  if (!cells.length) return;
  const lit = Math.round((completed / gridTotal) * cells.length);
  for (let i = 0; i < cells.length; i++) cells[i].classList.toggle("on", i < lit);
}

function renderProgress(e: ProgressEvent, started: number): void {
  if (state !== "downloading" || e.status !== "running") return;
  const p = readProgress(e);
  const bar = $("progress-bar");

  if (e.phase === "saving") {
    setText($("progress-title"), "Saving…");
    setText($("progress-message"), e.message.startsWith("Choosing") ? "Choose where to save the file" : "Writing the file");
    return;
  }

  if (p.fraction === undefined || p.total === undefined || p.completed === undefined) {
    setText($("progress-message"), p.message);
    return;
  }

  if (p.unit === "records") {
    if (p.total !== gridTotal) buildGrid(p.total);
    paintGrid(p.completed);
    if (p.completed > 0) constellation?.spark();
    setText($("progress-title"), "Fetching chunks");
    setText($("progress-message"), `Fetched ${p.completed} of ${p.total} chunk${p.total === 1 ? "" : "s"}`);
  } else {
    setText($("progress-message"), `${formatBytes(p.completed)} of ${formatBytes(p.total)}`);
  }

  const pct = Math.round(p.fraction * 100);
  bar.classList.remove("is-indeterminate");
  bar.setAttribute("aria-valuenow", String(pct));
  $("bar-fill").style.width = `${pct}%`;
  const size = verifiedSize ?? params.size;
  const secs = (performance.now() - started) / 1000;
  const rate = size && secs > 1 && p.fraction > 0 ? ` · ${formatBytes((size * p.fraction) / secs, { compact: true })}/s` : "";
  setText($("progress-percent"), `${pct}%${rate}`);
}

function showDone(hash: string, method: "file-picker" | "download", savedName: string, bytes: number, ms: number): void {
  setText($("done-hash"), hash);
  setText(
    $("done-saved"),
    method === "file-picker" ? `${savedName}, where you chose` : `${savedName}, in your browser's downloads`,
  );
  setText($("done-size"), `${formatBytes(bytes)} in ${(ms / 1000).toFixed(1)} s`);
  $("done-size").title = formatExactBytes(bytes);
  setState("done");
}

// ------------------------------------------------------------------ status / errors

function setStatus(kind: "connecting" | "checking" | "ready", title: string, detail: string): void {
  const indicator = $("status-indicator");
  indicator.className = `status-indicator is-${kind}`;
  indicator.replaceChildren(kind === "ready" ? dot() : spinner());
  setText($("status-title"), title);
  setText($("status-detail"), detail);
}

function setButton(mode: "connecting" | "ready"): void {
  const btn = $<HTMLButtonElement>("download-btn");
  btn.disabled = mode !== "ready";
  $("download-spinner").hidden = mode === "ready";
  setText($("download-label"), mode === "ready" ? "Download" : "Connecting…");
}

function showBlocked(title: string, text: string): void {
  setText($("blocked-title"), title);
  setText($("blocked-text"), text);
  setState("blocked");
}

function showError(info: FriendlyError, action: typeof retryAction): void {
  retryAction = action;
  const copy = errorCopy(info, action);
  setText($("error-title"), copy.title);
  setText($("error-text"), copy.text);
  setText($("error-code"), info.code);
  $("error-code").title = info.message;
  $("error-network").hidden = !(action === "connect" || info.connection);
  setText($("retry-btn"), action === "connect" ? "Reconnect" : "Try again");
  setState("error");
}

function errorCopy(info: FriendlyError, action: typeof retryAction): { title: string; text: string } {
  if (action === "connect") {
    return { title: "Couldn't reach the Autonomi network", text: "Your browser couldn't connect to any Autonomi nodes." };
  }
  switch (info.code) {
    case "OPEN_FILE_FAILED":
    case "LOOKUP_FAILED":
      return {
        title: "Couldn't find this file on the network",
        text: "The address may be mistyped, or it may point to an archive (folder) or private file rather than a public file. It can also be a temporary network problem.",
      };
    case "DOWNLOAD_FAILED":
      return { title: "The download didn't finish", text: "Some chunks couldn't be fetched or verified. This is often temporary, so try again." };
    case "SAVE_FAILED":
      return { title: "The file couldn't be saved", text: "It downloaded, but your browser couldn't write it. Check you have space and permission to save there." };
    default:
      return { title: "Something went wrong", text: info.message };
  }
}

async function retry(): Promise<void> {
  if (retryAction === "connect") {
    closeClient();
    return connect();
  }
  const client = connectedClient();
  if (!client) return connect();
  if (retryAction === "download") return startDownload(); // still a user gesture
  setState("ready");
  setButton("ready");
  void verify(client);
}

function spinner(): HTMLElement {
  const s = document.createElement("span");
  s.className = "spinner";
  return s;
}
function dot(): HTMLElement {
  const s = document.createElement("span");
  s.className = "status-dot";
  return s;
}
function listJoin(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

// ------------------------------------------------------------------ lifecycle

addEventListener("pagehide", () => {
  controller?.abort();
  closeClient();
});
addEventListener("pageshow", (e) => {
  // Restored from the back/forward cache after pagehide closed the client.
  if (e.persisted && parsed.ok && state !== "blocked") connect();
});
