import { useCallback, useEffect, useRef, useState } from "react";
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
// import mdWorker from 'monaco-editor/esm/vs/basic-languages/markdown/markdown_';

import * as monaco from 'monaco-editor';
import { Context } from "../types";
import path from "path-browserify";

// @ts-ignore
globalThis.MonacoEnvironment = {
  getWorker(_: any, label: string) {
    if (label === 'json') {
      return new jsonWorker();
    }
    if (label === 'css') {
      return new cssWorker()
    }

    if (label === 'html') {
      return new htmlWorker()
    }
    if (['typescript', 'javascript', 'js', 'ts'].includes(label)) {
      return new tsWorker()
    }
    // return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker', import.meta.url), { type: 'module' });
    return new editorWorker()
  }
}

export default function Editor(props: { filepath: string; ctx: Context }) {
  const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [hasChange, setHasChange] = useState(false);

  useEffect(() => {
    if (ref.current == null) return;
    const editor = monaco.editor.create(ref.current, {
      theme: 'vs-dark',
      language: 'typescript',
      fontSize: 16,
      minimap: {
        enabled: false,
      }
    });
    setEditor(editor);
    editor.layout();
    const obs = new ResizeObserver(() => {
      editor.layout();
    });
    obs.observe(ref.current);
    return () => {
      obs.disconnect();
      editor.dispose();
    }
  }, []);
  useEffect(() => {
    if (editor == null) return;
    if (props.filepath == null) return;
    (async () => {
      const content = await props.ctx.fs.readFile(props.filepath);
      const uri = monaco.Uri.file(props.filepath);
      const language = ext2lang[path.extname(props.filepath)] ?? 'text';
      const model = monaco.editor.getModel(uri) || monaco.editor.createModel(content, language, uri)
      editor.setModel(model);
      editor.onDidChangeModelContent(() => {
        setHasChange(true);
      });
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        async () => {
          await props.ctx.fs.writeFile(props.filepath, editor.getValue());
          setHasChange(false);
        }
      );
      editor.focus();
    })();
  }, [props.filepath, editor, props.ctx]);
  return <div style={{ width: '100%', height: '100%', fontFamily: 'monaco', background: '#222', color: 'white' }}>
    <div style={{ height: 25, width: '100%', paddingLeft: 10 }}>
      {hasChange ? '*' : ''} {props.filepath}
    </div>
    <div style={{ width: '100%', height: 'calc(100% - 25px)' }}
      ref={ref}
    >
    </div>
  </div>
}

const ext2lang: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.json': 'json',
  '.css': 'css',
  '.html': 'html',
  '.md': 'markdown',
}