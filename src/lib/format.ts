const UNITS = ["KB", "MB", "GB", "TB"];

/**
 * Decimal (SI) sizes, matching the SDK's 1,000,000,000-byte limit.
 * Default: "312.4 MB". Compact (for buttons): "312 MB", "3.2 GB".
 */
export function formatBytes(bytes: number, { compact = false } = {}): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1000) return bytes === 1 ? "1 byte" : `${bytes} bytes`;
  let value = bytes;
  let unit = -1;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit++;
  }
  // Rounding can carry into the next unit (999.96 KB → "1000.0 KB").
  if (Number(value.toFixed(1)) >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit++;
  }
  const digits = compact && value >= 10 ? 0 : 1;
  const text = value.toFixed(digits).replace(/\.0$/, "");
  return `${text} ${UNITS[unit]}`;
}

/** "12,345 bytes" for tooltips. */
export function formatExactBytes(bytes: number): string {
  return `${bytes.toLocaleString("en-US")} ${bytes === 1 ? "byte" : "bytes"}`;
}
