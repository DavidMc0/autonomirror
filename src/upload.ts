import {
  createManualPaymentProvider,
  getBrowserCapabilities,
  SDK_LIMITS,
  UploadError,
  type AutonomiClient,
  type ManualPaymentRequest,
  type PaymentProvider,
  type PrivateFile,
  type ProgressEvent,
  type PublicFile,
  type UploadRecovery,
  type UploadResult,
} from "@withautonomi/ant-browser-sdk";
import { describeError, getClient, MAX_DOWNLOAD_BYTES } from "./lib/client";
import { formatAnt, formatBytes, formatExactBytes } from "./lib/format";
import { $, applyState, bindCopy, setText } from "./lib/ui";
import { loadUploads, saveUpload, type SavedUpload } from "./lib/uploads";

type WalletModule = typeof import("./lib/wallet");
let wallet: WalletModule | undefined;
const loadWallet = async (): Promise<WalletModule> => (wallet ??= await import("./lib/wallet"));

type UploadState = "pick" | "busy" | "quote" | "done" | "error";
type Result = UploadResult<PublicFile | PrivateFile>;
type AttemptOptions = { payment: PaymentProvider; signal: AbortSignal; onProgress: (e: ProgressEvent) => void };
type Attempt = (client: AutonomiClient, options: AttemptOptions) => Promise<Result>;

/** Autonomi pays on Arbitrum One; its transactions are linked on Arbiscan. */
const ARBITRUM_ONE = 42161;

export interface UploadedFile {
  address: string;
  name: string;
  size: number;
}

const root = $("source-upload");
const fileInput = $<HTMLInputElement>("up-file");
const dropzone = $("dropzone");
const payBtn = $<HTMLButtonElement>("up-pay");
const agree = $<HTMLInputElement>("up-agree");
const problem = $("up-problem");

let onUploaded: (file: UploadedFile) => void = () => undefined;
let file: File | null = null;
let controller: AbortController | null = null;
let request: ManualPaymentRequest | null = null;
let recovery: UploadRecovery | null = null;
/** How many payments this attempt has asked for; large files can need one per part. */
let quotesShown = 0;
/** Set once a wallet prompt has started: from then on, cancelling isn't offered and leaving the tab is warned against. */
let paying = false;
/** Bumped by each attempt and by cancelling, so an abandoned attempt can't change the screen. */
let attemptId = 0;
/** A resume was refused because the earlier payment no longer covers the storage: the next one may ask for payment. */
let resumeNeedsPayment = false;

export function initUpload(handoff: (file: UploadedFile) => void): void {
  onUploaded = handoff;
  $("up-no-wallet").hidden = "ethereum" in window;
  renderHistory();
  setState("pick");

  fileInput.addEventListener("change", () => {
    const picked = fileInput.files?.[0];
    fileInput.value = "";
    if (picked) choose(picked);
  });
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("is-over");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-over"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-over");
    const dropped = e.dataTransfer?.files[0];
    if (dropped) choose(dropped);
  });

  agree.addEventListener("change", () => (payBtn.disabled = !agree.checked));
  payBtn.addEventListener("click", pay);
  $("up-decline").addEventListener("click", cancel);
  $("up-cancel").addEventListener("click", cancel);
  $("up-retry").addEventListener("click", retry);
  $("up-restart").addEventListener("click", () => void startOver());
  $("up-again").addEventListener("click", () => void startOver());
  bindCopy($<HTMLButtonElement>("up-copy-address"), () => $("up-done-address").textContent ?? "");

  window.addEventListener("beforeunload", (e) => {
    // Leaving mid-payment loses the SDK's in-page recovery state.
    if (controller && paying) e.preventDefault();
  });
}

function setState(state: UploadState): void {
  applyState(root, state);
}

// ------------------------------------------------------------------ choose a file

function choose(picked: File): void {
  file = picked;
  setText($("up-file-name"), picked.name);
  setText($("up-file-size"), formatBytes(picked.size));
  $("up-file-size").title = formatExactBytes(picked.size);

  if (picked.size > MAX_DOWNLOAD_BYTES) {
    return showError(
      "This file is too large",
      `It's ${formatBytes(picked.size)}. Browser uploads are limited to ${formatBytes(MAX_DOWNLOAD_BYTES)}, so use the Autonomi command-line tool (ant) for this one.`,
      "TOO_LARGE",
      false,
    );
  }
  if (picked.size < SDK_LIMITS.minFileBytes) {
    return showError("This file is too small", `Files need at least ${SDK_LIMITS.minFileBytes} bytes to be stored on Autonomi.`, "TOO_SMALL", false);
  }
  const support = getBrowserCapabilities().operations.uploadBlob;
  if (!support.available) {
    return showError("This browser can't upload files", `It's missing: ${support.missing.join(", ")}. Try a current version of Chrome, Edge, Firefox or Safari.`, "UNSUPPORTED", false);
  }
  void run((client, options) => client.upload(picked, options));
}

// ------------------------------------------------------------------ run an attempt

async function run(attempt: Attempt): Promise<void> {
  const id = ++attemptId;
  const current = () => id === attemptId;
  controller = new AbortController();
  const { signal } = controller;
  request = null;
  quotesShown = 0;
  paying = false;
  agree.checked = false;
  payBtn.disabled = true;
  showBusy("Connecting to Autonomi…");

  const payment = createManualPaymentProvider({
    onRequest: (next) => (current() ? showQuote(next) : void next.cancel("Upload abandoned")),
  });
  try {
    const client = await getClient();
    signal.throwIfAborted();
    const result = await attempt(client, { payment, signal, onProgress: (e) => current() && onProgress(e) });
    if (!current()) return;
    recovery = null;
    finished(result);
  } catch (err) {
    const retained = err instanceof UploadError ? err.recovery : null;
    if (!current()) {
      // Cancelled: the screen has already moved on, so just release the retained file.
      await retained?.discard().catch(() => undefined);
      return;
    }
    if (retained) recovery = retained;
    showUploadError(err);
  } finally {
    if (current()) {
      controller = null;
      request = null;
      paying = false;
    }
  }
}

/** Abandon the attempt before any payment and go straight back to choosing a file. */
function cancel(): void {
  if (paying) return;
  attemptId++;
  request?.cancel("Cancelled before payment");
  controller?.abort(new DOMException("Upload cancelled", "AbortError"));
  controller = null;
  request = null;
  void startOver();
}

function onProgress(e: ProgressEvent): void {
  if (e.status !== "running") return;
  const counted = e.completed !== undefined && e.total ? ([e.completed, e.total] as const) : undefined;
  switch (e.phase) {
    case "initializing":
    case "connecting":
      return updateBusy("Connecting to Autonomi…", e.message);
    case "lookup":
    case "preparing":
      return updateBusy("Getting storage prices. This can take a minute or two…", e.message);
    case "staging":
      return updateBusy("Encrypting your file…", e.message, counted);
    // The SDK reports "payment" while the price waits for review too, so `paying` is set by pay(), not here.
    case "approval":
      return updateBusy("Approve the ANT amount in your wallet…", e.message);
    case "payment":
      return updateBusy("Confirm the payment in your wallet…", e.message);
    case "uploading":
      return updateBusy("Storing your file on the network…", e.message, counted);
    default:
      return;
  }
}

function showBusy(status: string): void {
  updateBusy(status, "");
  setState("busy");
}

function updateBusy(status: string, detail: string, counted?: readonly [number, number]): void {
  // Progress from an earlier step can arrive while the price is on screen; keep the price up.
  if (root.dataset.state === "quote") return;
  setText($("up-status"), status);
  setText($("up-detail"), detail);
  const bar = $("up-bar");
  bar.classList.toggle("is-indeterminate", !counted);
  $("up-bar-fill").style.width = counted ? `${Math.min(100, (counted[0] / counted[1]) * 100)}%` : "";
  $("up-cancel").hidden = paying;
  $("up-keep-open").hidden = !paying;
  if (root.dataset.state !== "busy") setState("busy");
}

// ------------------------------------------------------------------ price review and payment

function showQuote(next: ManualPaymentRequest): void {
  request = next;
  quotesShown++;
  const price = formatAnt(next.totalAmountAtto);
  setText($("up-price"), next.merkle ? `Up to ${price}` : price);
  setText(
    $("up-prompts"),
    quotesShown > 1
      ? "This large file is stored in parts, and the next part needs its own payment. Your wallet will ask again."
      : "Your wallet will usually ask twice: first to approve this amount of ANT, then to pay.",
  );
  problem.hidden = true;
  payBtn.disabled = !agree.checked;
  setState("quote");
}

async function pay(): Promise<void> {
  const pending = request;
  if (!pending || pending.status !== "pending") return;
  payBtn.disabled = true;
  problem.hidden = true;
  setText(payBtn, "Connecting wallet…");
  try {
    const w = await loadWallet();
    const funds = await w.connectWallet(pending.network);
    const cost = BigInt(pending.totalAmountAtto);
    if (funds.ant < cost) {
      throw new w.WalletProblem(
        `This upload costs ${formatAnt(cost)}, but wallet ${shortAccount(funds.account)} has ${formatAnt(funds.ant)} on Arbitrum One. Add ANT and click Pay again.`,
      );
    }
    if (funds.eth === 0n) {
      throw new w.WalletProblem(`Wallet ${shortAccount(funds.account)} has no ETH on Arbitrum One for the network fee. Add a little and click Pay again.`);
    }
    if (pending.status !== "pending") return;
    paying = true;
    request = null;
    showBusy("Approve the ANT amount in your wallet…");
    // A failed payment also fails the upload, which shows the error.
    pending.pay(w.walletPayment()).catch(() => undefined);
  } catch (err) {
    setText(problem, err instanceof Error ? err.message : String(err));
    problem.hidden = false;
  } finally {
    setText(payBtn, "Connect wallet & pay");
    payBtn.disabled = !agree.checked;
  }
}

function shortAccount(account: string): string {
  return `${account.slice(0, 6)}…${account.slice(-4)}`;
}

// ------------------------------------------------------------------ results

function finished(result: Result): void {
  // Uploads here are always public, so the file has an address.
  const stored = result.file as PublicFile;
  const saved: SavedUpload = {
    address: stored.address,
    name: file?.name ?? stored.name,
    size: stored.size,
    date: new Date().toISOString(),
    ...(result.transactionHash ? { tx: result.transactionHash } : {}),
  };
  saveUpload(saved);
  renderHistory();
  showDone(saved, result.storageCostAtto, result.payments.at(-1)?.network.chainId);
}

function showDone(saved: SavedUpload, costAtto?: string, chainId?: number): void {
  setText($("up-done-file"), `${saved.name} · ${formatBytes(saved.size)}`);
  setText($("up-done-address"), saved.address);
  const paid = $("up-done-paid");
  paid.replaceChildren();
  if (costAtto !== undefined) {
    paid.append(costAtto === "0" ? "Already on the network, so there was nothing to pay." : `Paid ${formatAnt(costAtto)}`);
  } else {
    paid.append(`Uploaded ${new Date(saved.date).toLocaleDateString()}`);
  }
  // Saved uploads don't record the chain; this site only uses Autonomi's Arbitrum One mainnet.
  if (saved.tx && (chainId ?? ARBITRUM_ONE) === ARBITRUM_ONE) {
    const link = document.createElement("a");
    link.href = `https://arbiscan.io/tx/${saved.tx}`;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "View payment ↗";
    paid.append(" · ", link);
  }
  setState("done");
  onUploaded({ address: saved.address, name: saved.name, size: saved.size });
}

function showUploadError(err: unknown): void {
  const info = describeError(err);
  const declined = wallet?.isUserRejection(err) ?? false;
  const paidBefore = !!recovery && (recovery.payments.length > 0 || recovery.pendingPayments.length > 0);
  resumeNeedsPayment = info.code === "RECOVERY_PAYMENT_REQUIRED";

  let title = "The upload didn't finish";
  let text = info.message;
  if (resumeNeedsPayment) {
    title = "The storage price changed";
    text = "Your earlier payment no longer covers all of the storage. Try again to see the new price before paying anything more.";
  } else if (declined) {
    title = "Payment cancelled in your wallet";
    text = paidBefore ? "Your earlier payment is kept. Try again to finish the upload." : "No storage payment was made. Try again to see the price and pay.";
  } else if (info.connection) {
    title = "Couldn't reach the Autonomi network";
    text = "Your browser couldn't connect to Autonomi nodes. Networks that block UDP traffic, like some offices and VPNs, can cause this.";
  } else if (paidBefore) {
    text = `Your payment went through, so trying again finishes storing the file without paying twice. Keep this tab open. (${info.message})`;
  }
  showError(title, text, info.code, !!recovery || !!file);
}

function showError(title: string, text: string, code: string, canRetry: boolean): void {
  setText($("up-error-title"), title);
  setText($("up-error-text"), text);
  setText($("up-error-code"), code);
  $("up-retry").hidden = !canRetry;
  setState("error");
}

function retry(): void {
  const pending = recovery;
  if (pending) {
    const paidBefore = pending.payments.length > 0 || pending.pendingPayments.length > 0;
    // Resuming after a payment never pays again unless the network asks for more; then the price is shown first.
    const askForPayment = !paidBefore || resumeNeedsPayment;
    void run((client, { payment, signal, onProgress }) => client.resumeUpload(pending, { signal, onProgress, ...(askForPayment ? { payment } : {}) }));
  } else if (file) {
    choose(file);
  }
}

async function startOver(): Promise<void> {
  const old = recovery;
  recovery = null;
  file = null;
  resumeNeedsPayment = false;
  setState("pick");
  await old?.discard().catch(() => undefined);
}

// ------------------------------------------------------------------ history

function renderHistory(): void {
  const saved = loadUploads();
  $("up-history").hidden = saved.length === 0;
  $("up-history-list").replaceChildren(
    ...saved.map((u) => {
      const item = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "up-history-item";
      btn.title = `Use ${u.name} (${u.address})`;
      const name = document.createElement("span");
      name.className = "up-history-name";
      name.textContent = u.name;
      const meta = document.createElement("span");
      meta.className = "faint";
      meta.textContent = `${formatBytes(u.size)} · ${new Date(u.date).toLocaleDateString()}`;
      btn.append(name, meta);
      btn.addEventListener("click", () => {
        file = null;
        showDone(u);
      });
      item.append(btn);
      return item;
    }),
  );
}
