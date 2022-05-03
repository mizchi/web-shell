/// <reference types="vite/client" />

declare module 'path-browserify' {
  const t: typeof import("path");
  export default t;
}

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
  // その他の環境変数...
}
