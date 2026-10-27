/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VIP_TRACKER_DATA_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
