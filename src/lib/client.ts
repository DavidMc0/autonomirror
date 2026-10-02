import { AutonomiClient, AutonomiError, SDK_LIMITS, type ProgressListener } from "@withautonomi/ant-browser-sdk";

/** Downloads above this are refused by the Rust core. */
export const MAX_DOWNLOAD_BYTES: number = SDK_LIMITS.maxFileBytes;

let pending: Promise<AutonomiClient> | null = null;
let current: AutonomiClient | null = null;

/** One client per page. A failed attempt is forgotten so the next call retries. */
export function getClient(onProgress?: ProgressListener): Promise<AutonomiClient> {
  if (current && !current.closed) return Promise.resolve(current);
  if (!pending) {
    pending = AutonomiClient.connect({ onProgress }).then(
      (client) => {
        current = client;
        return client;
      },
      (err) => {
        pending = null;
        throw err;
      },
    );
  }
  return pending;
}

/** The connected client, or null. Lets click handlers avoid awaiting before downloadAndSave. */
export function connectedClient(): AutonomiClient | null {
  return current && !current.closed ? current : null;
}

export function closeClient(): void {
  current?.close();
  current = null;
  pending = null;
}

/**
 * The size of a file the SDK refused for being over the browser limit, or undefined.
 * The core checks the size while opening the file, so it never returns a reader with
 * a large `.size`; the size only arrives in the error text ("invalid public file size N").
 */
export function oversizedFileBytes(err: unknown): number | undefined {
  for (let e = err; e instanceof Error; e = e.cause) {
    const match = /invalid public file size (\d+)/.exec(e.message);
    if (match) {
      const size = Number(match[1]);
      return size > MAX_DOWNLOAD_BYTES ? size : undefined;
    }
  }
  return undefined;
}

export interface FriendlyError {
  code: string;
  message: string;
  /** The network couldn't be reached (so suggest another network). */
  connection: boolean;
  cancelled: boolean;
}

export function describeError(err: unknown): FriendlyError {
  // A cancelled save picker rejects with a bare AbortError, not an AutonomiError.
  if (typeof err === "object" && err !== null && (err as { name?: unknown }).name === "AbortError") {
    return { code: "ABORTED", message: "Cancelled.", connection: false, cancelled: true };
  }
  if (err instanceof AutonomiError) {
    return {
      code: err.code,
      message: err.message,
      connection: err.code === "CONNECTION_FAILED" || err.code === "INITIALIZATION_FAILED",
      cancelled: false,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { code: "UNKNOWN", message, connection: false, cancelled: false };
}
