/// <reference types="vite/client" />

declare const __COMMIT_HASH__: string;
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.svg" {
  const content: string;
  export default content;
}

// Vite ?raw suffix — imports any file as a plain string
declare module "*?raw" {
  const content: string;
  export default content;
}
