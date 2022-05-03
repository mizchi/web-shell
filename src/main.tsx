import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./components/App";

async function main() {
  const root = createRoot(document.getElementById('root') as HTMLElement);
  root.render(<App />);
  return root;
}

export default main().catch(console.error);