/// <reference types="vite/client" />

/**
 * Describes all existing environment variables and their types for Main Process.
 */
interface ImportMetaEnv {
  /**
   * URL where `renderer` web page is running in dev mode.
   */
  readonly VITE_DEV_SERVER_URL: undefined | string;
}

// biome-ignore lint/correctness/noUnusedVariables: Vite ImportMeta augmentation
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
