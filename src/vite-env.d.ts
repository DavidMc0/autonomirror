/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute origin baked into embed snippets, e.g. https://example.github.io. Defaults to the page origin. */
  readonly VITE_PUBLIC_ORIGIN?: string;
}
