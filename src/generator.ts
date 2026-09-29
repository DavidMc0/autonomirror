import "./styles.css";
import "./generator.css";
import { extractAddress, hexCount } from "./lib/address";
import { describeError, getClient, MAX_DOWNLOAD_BYTES } from "./lib/client";
import { formatBytes, formatExactBytes } from "./lib/format";
import { buildDownloadUrl, parseDownloadParams, parseView, sanitizeName, siteBaseUrl, type PageView } from "./lib/params";
import { buttonLabel, htmlSnippet, markdownSnippet, type ButtonStyle, type SnippetOptions } from "./lib/snippets";
import { $, bindCopy } from "./lib/ui";

// Samples from try.autonomi.com ("Try one of these").
const SAMPLES: Record<string, { address: string; name: string }> = {
  lucky: { address: "711c7e20006ff3e0ac6c1f3063286a0c1a3e4c409642e8c526173fa60bb7078a", name: "lucky.jpg" },
  welcome: { address: "52af8a181c6171f8e12896ca734cdf60839c3b324dfbeadf857226dfc7cb453b", name: "Welcome.md" },
  large: { address: "f6eeba94008f493a8518186b0647df6d39dbde75f41d5b79549e9a4e63a1ab43", name: "64 MB of random bytes.bin" },
};

type Check =
  | { status: "idle" }
  | { status: "checking"; address: string }
  | { status: "ok"; address: string; size: number }
  | { status: "too-large"; address: string; size: number }
  | { status: "failed"; address: string; code: string; message: string; forced: boolean };

const siteBase = siteBaseUrl();
const addressInput = $<HTMLTextAreaElement>("address");
const nameInput = $<HTMLInputElement>("name");
const checkBtn = $<HTMLButtonElement>("check-btn");
const result = $("check-result");

let check: Check = { status: "idle" };
/** Bumped on each check so a slow, superseded lookup can't overwrite a newer result. */
let checkSeq = 0;

const address = () => extractAddress(addressInput.value);
const fileName = () => sanitizeName(nameInput.value);
const radio = <T extends string>(name: string) =>
  (document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? "") as T;

// ------------------------------------------------------------------ inputs

addressInput.addEventListener("input", onAddressInput);
addressInput.addEventListener("focus", warmUp, { once: true });
addressInput.addEventListener("paste", () => {
  // A pasted download link carries its name too: use it if the name is empty.
  requestAnimationFrame(() => {
    const match = addressInput.value.match(/[?&]a=[0-9a-fA-F]{64}[^\s]*/);
    if (match && !nameInput.value.trim()) {
      const parsed = parseDownloadParams(match[0].slice(1));
      if (parsed.ok && parsed.params.nameProvided) nameInput.value = parsed.params.name;
    }
    tidyAddress();
    render();
  });
});
addressInput.addEventListener("blur", tidyAddress);
nameInput.addEventListener("input", render);

/** Replace pasted links or spaced-out text with the bare address once one is found. */
function tidyAddress(): void {
  const found = address();
  if (found && addressInput.value !== found) {
    addressInput.value = found;
    onAddressInput();
  }
}
document.querySelectorAll<HTMLInputElement>('input[name="style"], input[name="view"], input[name="host"], #show-name').forEach((el) =>
  el.addEventListener("change", render),
);

document.querySelectorAll<HTMLButtonElement>("[data-sample]").forEach((btn) =>
  btn.addEventListener("click", () => {
    const sample = SAMPLES[btn.dataset.sample!];
    addressInput.value = sample.address;
    nameInput.value = sample.name;
    onAddressInput();
    runCheck();
  }),
);

function onAddressInput(): void {
  const found = address();
  const counter = $("address-counter");
  counter.textContent = `${hexCount(addressInput.value)} of 64`;
  counter.classList.toggle("is-complete", !!found);
  addressInput.classList.toggle("is-valid", !!found);
  // A different address invalidates the previous check.
  if (check.status !== "idle" && check.address !== found) {
    check = { status: "idle" };
    checkSeq++;
  }
  if (found) warmUp();
  render();
}

/** Start connecting as soon as someone shows intent, since the first connect takes a few seconds. */
function warmUp(): void {
  getClient().catch(() => undefined);
}

// ------------------------------------------------------------------ check

$("file-form").addEventListener("submit", (e) => {
  e.preventDefault();
  runCheck();
});

async function runCheck(): Promise<void> {
  const addr = address();
  if (!addr) return;
  const seq = ++checkSeq;
  check = { status: "checking", address: addr };
  setCheckMessage("Connecting to Autonomi…");
  renderEmbed();
  try {
    const client = await getClient();
    if (seq !== checkSeq) return;
    setCheckMessage("Looking up the file… the first lookup can take up to 30 seconds.");
    const reader = await client.openFile(addr);
    const size = reader.size;
    reader.close();
    if (seq !== checkSeq) return;
    check = size > MAX_DOWNLOAD_BYTES ? { status: "too-large", address: addr, size } : { status: "ok", address: addr, size };
  } catch (err) {
    if (seq !== checkSeq) return;
    const info = describeError(err);
    check = { status: "failed", address: addr, code: info.code, message: info.message, forced: false };
  }
  render();
}

let checkMessage = "";
function setCheckMessage(text: string): void {
  checkMessage = text;
  renderCheck();
}

function renderCheck(): void {
  const busy = check.status === "checking";
  checkBtn.disabled = !address() || busy;
  $("check-spinner").hidden = !busy;
  $("check-label").textContent = busy ? "Checking…" : check.status === "idle" ? "Check address" : "Check again";

  result.hidden = check.status === "idle";
  result.className = `check-result is-${check.status}`;
  const icon = (t: string) => el("span", "check-icon", t);

  switch (check.status) {
    case "idle":
      result.replaceChildren();
      break;
    case "checking":
      result.replaceChildren(el("span", "spinner"), el("span", "", checkMessage));
      break;
    case "ok": {
      const size = el("strong", "", formatBytes(check.size));
      size.title = formatExactBytes(check.size);
      result.replaceChildren(icon("✓"), el("span", "", "Found · ", size, " · verified DataMap"));
      break;
    }
    case "too-large":
      result.replaceChildren(
        icon("!"),
        el(
          "span",
          "",
          `This file is ${formatBytes(check.size)}. The browser download limit is ${formatBytes(MAX_DOWNLOAD_BYTES)}, so it can't be used in this demo.`,
        ),
      );
      break;
    case "failed": {
      const body = el("div", "check-body");
      body.append(
        el("p", "", "Couldn't find or open this file on the network."),
        el("p", "muted", "Check it's a public file address (from ant file upload --public), not an archive or private file. Network hiccups happen too, so it's worth trying again."),
        el("span", "code-tag", `${check.code}: ${check.message}`),
      );
      if (!check.forced) {
        const anyway = el("button", "btn btn-sm", "Generate anyway") as HTMLButtonElement;
        anyway.type = "button";
        anyway.addEventListener("click", () => {
          if (check.status === "failed") check.forced = true;
          render();
        });
        body.append(el("div", "check-actions", anyway));
      }
      result.replaceChildren(icon("!"), body);
      break;
    }
  }
}

// ------------------------------------------------------------------ outputs

function currentSize(): number | undefined {
  return check.status === "ok" ? check.size : undefined;
}

/** Size, plus the file name when "Show the file name on the button" is on. */
function snippetOptions(): SnippetOptions {
  const showName = $<HTMLInputElement>("show-name").checked;
  return { size: currentSize(), fileName: showName ? fileName() || undefined : undefined };
}

function downloadUrl(): string | null {
  const addr = address();
  if (!addr) return null;
  return buildDownloadUrl(siteBase, { address: addr, name: fileName(), size: currentSize(), view: radio<PageView>("view") });
}

function renderPreview(): void {
  const style = radio<ButtonStyle>("style");
  const host = radio<"light" | "dark">("host");
  const url = downloadUrl() ?? buildDownloadUrl(siteBase, { address: SAMPLES.lucky.address, name: "example.zip" });
  const snippet = htmlSnippet(style, url, snippetOptions());
  const [bg, fg, muted] = host === "dark" ? ["#15181e", "#e8eaee", "#8b93a1"] : ["#ffffff", "#1f2328", "#6b7280"];
  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
    html,body{margin:0;height:100%}
    body{display:flex;flex-direction:column;justify-content:center;gap:10px;padding:18px 22px;box-sizing:border-box;
      background:${bg};color:${fg};font:14px/1.5 Georgia,serif}
    h3{margin:0;font:600 16px/1.3 system-ui,sans-serif}
    p{margin:0;color:${muted}}
  </style></head><body>
    <h3>${escapeText(fileName() || "my-mod-v1.2.zip")}</h3>
    <p>Example text on your page. Your button goes wherever you paste the code.</p>
    <div>${snippet}</div>
  </body></html>`;
  const frame = $<HTMLIFrameElement>("preview");
  if (frame.srcdoc !== doc) frame.srcdoc = doc;
}

function renderEmbed(): void {
  const ready = check.status === "ok" || (check.status === "failed" && check.forced);
  const name = fileName();
  const url = downloadUrl();
  const locked = $("embed-locked");
  const embed = $("embed");

  let lockedText = "";
  if (!address()) lockedText = "Paste an address and check it to get your embed code.";
  else if (check.status === "too-large") lockedText = "This file is over the 1 GB browser limit, so there's no embed code for it.";
  else if (!ready) lockedText = "Check your address to get the embed code.";
  else if (!name) lockedText = "Add a file name to get the embed code.";

  locked.hidden = !lockedText;
  embed.hidden = !!lockedText;
  $("embed-locked-text").textContent = lockedText;
  $("step3").parentElement!.classList.toggle("is-ready", !lockedText);
  if (lockedText || !url) return;

  $("embed-warning").hidden = check.status === "ok";
  const style = radio<ButtonStyle>("style");
  const options = snippetOptions();
  $<HTMLTextAreaElement>("out-html").value = htmlSnippet(style, url, options);
  $<HTMLTextAreaElement>("out-md").value = markdownSnippet(url, options);
  $<HTMLInputElement>("out-link").value = url;
  $<HTMLAnchorElement>("open-link").href = url;
}

bindCopy($<HTMLButtonElement>("copy-html"), () => $<HTMLTextAreaElement>("out-html").value);
bindCopy($<HTMLButtonElement>("copy-md"), () => $<HTMLTextAreaElement>("out-md").value);
bindCopy($<HTMLButtonElement>("copy-link"), () => $<HTMLInputElement>("out-link").value);
for (const id of ["out-html", "out-md", "out-link"]) {
  $(id).addEventListener("focus", (e) => (e.target as HTMLInputElement).select());
}

function render(): void {
  $("show-name-example").textContent = `“${buttonLabel(fileName() || "my-mod-v1.2.zip")}”`;
  renderCheck();
  renderPreview();
  renderEmbed();
}

// ------------------------------------------------------------------ helpers

function el(tag: string, className: string, ...children: (string | Node)[]): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

function escapeText(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ------------------------------------------------------------------ boot: optional pre-fill from ?a=&n=&v=

const q = new URLSearchParams(location.search);
const preAddress = extractAddress(q.get("a") ?? "");
if (preAddress) {
  addressInput.value = preAddress;
  nameInput.value = sanitizeName(q.get("n") ?? "");
  const view = parseView(q.get("v"));
  document.querySelector<HTMLInputElement>(`input[name="view"][value="${view}"]`)!.checked = true;
  onAddressInput();
  runCheck();
} else {
  render();
}
