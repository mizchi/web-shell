import { Suspense, useEffect, useState } from "react";
import { lazy } from "react";
import { create_context } from "../context";
import { Context } from "../types";

const Terminal = lazy(() => import("./Terminal"));
const Editor = lazy(() => import("./Editor"));

export function App() {
  const [state, setState] = useState({
    filepath: "/workspace/README.md",
  });
  const [ctx, setCtx] = useState<null | Context>(null);

  const handlers = {
    onOpen(filepath: string) {
      setState({ ...state, filepath });
    }
  }

  useEffect(() => {
    (async () => {
      if (ctx == null) {
        const ctx = await create_context(handlers);
        setCtx(ctx);
      }
    })();
  }, []);
  if (ctx == null) return <div></div>;
  return <div style={{ display: 'flex', width: '99vw', height: '100vw' }}>
    <div style={{ flex: 1, height: '100vh', maxWidth: '50vw' }}>
      <Suspense fallback={<div></div>}>
        <Editor filepath={state.filepath} ctx={ctx} />
      </Suspense>
    </div>
    <div style={{ flex: 1, width: '50vw', height: '100%' }}>
      <div style={{ boxSizing: 'border-box', width: '100%', height: '100%', padding: 10, background: '#333' }}>
        <Suspense fallback={<div></div>}>
          <Terminal ctx={ctx} />
        </Suspense>
      </div>
    </div>
  </div>
}