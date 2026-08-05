/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGENT_BASEPATH: string;
  readonly VITE_MOCK_API?: string;
  readonly VITE_MOCK_RVTOOLS_MODE?: string;
  readonly VITE_MOCK_HAS_COLLECTION?: string;
  // Add other env variables here
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
