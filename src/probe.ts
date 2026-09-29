// Phase 1 go/no-go probe. Replaced by the generator page in Phase 5.
import { AutonomiClient, getBrowserCapabilities, type ProgressEvent } from "@withautonomi/ant-browser-sdk";

// try.autonomi.com sample: Welcome.md, 574 bytes.
const TEST_ADDRESS = "52af8a181c6171f8e12896ca734cdf60839c3b324dfbeadf857226dfc7cb453b";
const TEST_SHA256 = "420cb6b391e1d3a2b674b12b44b16aa504482f8b3668820463b3d4f77301a0fa";

const $ = (id: string) => document.getElementById(id)!;
const status = $("status");
const logEl = $("log");
const t0 = performance.now();

function log(line: string) {
  const s = ((performance.now() - t0) / 1000).toFixed(2).padStart(6);
  logEl.textContent += `[${s}s] ${line}\n`;
  console.log(line);
}
const logProgress = (e: ProgressEvent) =>
  log(`${e.operation}/${e.phase} ${e.status}: ${e.message}` +
    (e.total ? ` (${e.completed ?? 0}/${e.total} ${e.unit ?? ""})` : ""));

const caps = getBrowserCapabilities();
$("caps").textContent = Object.entries(caps.operations)
  .map(([op, s]) => `${s.available ? "✓" : "✗"} ${op}${s.missing.length ? `  (missing: ${s.missing.join(", ")})` : ""}`)
  .join("\n");

let client: AutonomiClient | undefined;

async function main() {
  status.textContent = "Connecting to Autonomi mainnet…";
  log("connect() start");
  try {
    client = await AutonomiClient.connect({ onProgress: logProgress });
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    status.textContent = `✓ Connected in ${secs}s`;
    status.className = "ok";
    log("client.connection = " + JSON.stringify(client.connection, null, 2));
    console.log("client.connection", client.connection);
    ($("size") as HTMLButtonElement).disabled = false;
    ($("dl") as HTMLButtonElement).disabled = false;
  } catch (err) {
    status.textContent = `✗ Connect failed: ${(err as { code?: string }).code ?? ""} ${(err as Error).message}`;
    status.className = "bad";
    log("connect() failed: " + String(err));
    console.error(err);
  }
}

$("size").addEventListener("click", async () => {
  if (!client) return;
  try {
    const reader = await client.openFile(TEST_ADDRESS, { onProgress: logProgress });
    log(`openFile size = ${reader.size} bytes (expected 574)`);
    reader.close();
  } catch (err) {
    log("openFile failed: " + String(err));
  }
});

$("dl").addEventListener("click", async () => {
  if (!client) return;
  try {
    // Must be the first await in the handler so the save picker keeps user activation.
    const { download, save } = await client.downloadAndSave(TEST_ADDRESS, {
      suggestedName: "Welcome.md",
      onProgress: logProgress,
    });
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", download.bytes as BufferSource)))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    log(`saved via ${save.method} as "${save.name}", ${download.bytes.byteLength} bytes`);
    log(`BLAKE3 ${download.hash}`);
    log(`SHA-256 ${sha} ${sha === TEST_SHA256 ? "✓ matches try.autonomi.com" : "✗ MISMATCH"}`);
  } catch (err) {
    log("downloadAndSave failed: " + String(err));
  }
});

addEventListener("pagehide", () => client?.close());
main();
