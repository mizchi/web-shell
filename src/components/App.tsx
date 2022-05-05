import { Suspense, useEffect, useState } from "react";
import { lazy } from "react";
import { create_context } from "../context";
import { EditorApi } from "../types";
import { Provider, useTrackedState, useUpdate } from "./AppContext";

const Terminal = lazy(() => import("./Terminal"));
const Editor = lazy(() => import("./Editor"));

export function App() {
  return <Provider>
    <AppLoader />
  </Provider>
}

function AppLoader() {
  const [loaded, setLoaded] = useState(false);
  const setState = useUpdate();
  useEffect(() => {
    const actions: EditorApi = {
      open(filepath: string) {
        setState((state) => ({ ...state, filepath }));
      }
    };
    (async () => {
      const ctx = await create_context(actions);
      setState((state) => ({ ...state, ctx }));
      setLoaded(true);
    })();
  }, []);
  if (!loaded) return <div></div>;
  return <AppImpl />
}

function AppImpl() {
  const { filepath, ctx } = useTrackedState();
  console.log("AppImple", filepath);
  return <div style={{ display: 'flex', width: '99vw', height: '100vw' }}>
    <div style={{ flex: 1, height: '100vh', maxWidth: '50vw' }}>
      <Suspense fallback={<div></div>}>
        <Editor filepath={filepath} ctx={ctx} />
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