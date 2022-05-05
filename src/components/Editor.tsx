import { useCallback, useEffect, useRef, useState } from "react";
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

import * as monaco from 'monaco-editor';
import { Context } from "../types";
import path from "path-browserify";
import { format } from "../workers/mod";
import { FileSystem } from "../fs";

monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
  jsx: monaco.languages.typescript.JsxEmit.React,
  jsxFactory: "React.createElement",
  reactNamespace: "React",
  allowNonTsExtensions: true,
  allowJs: true,
  typeRoots: ["./@types"],
  moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
  allowSyntheticDefaultImports: true,
  target: monaco.languages.typescript.ScriptTarget.Latest,
});

monaco.languages.registerDocumentFormattingEditProvider("typescript", {
  async provideDocumentFormattingEdits(model) {
    const text = await format.format(model.getValue());
    return [
      {
        range: model.getFullModelRange(),
        text,
      },
    ];
  },
});

(globalThis as any).MonacoEnvironment = {
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
    return new editorWorker()
  }
}

const IMPORT_REGEX = /import\s+?(?:(?:(?:[\w*\s{},]*)\s+from\s+?)|)(?:(?:"(?<specifier1>.*?)")|(?:'(?<specifier2>.*?)'))[\s]*?(?:;|$|)/g;

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
  const save = useCallback(async () => {
    await props.ctx.fs.writeFile(props.filepath, editor!.getValue());
    setHasChange(false);
  }, [props.filepath, props.ctx, editor]);

  useEffect(() => {
    if (editor == null) return;
    if (props.filepath == null) return;
    const disposes: Array<monaco.IDisposable> = [];
    const language = ext2lang[path.extname(props.filepath)] ?? 'text';
    const uri = monaco.Uri.file(props.filepath);
    let model = monaco.editor.getModel(uri);

    (async () => {
      if (model == null) {
        const content = await props.ctx.fs.readFile(props.filepath);
        model = monaco.editor.createModel(content, language, uri);
        model.updateOptions({
          tabSize: 2,
        });
        let id: null | any = null;
        if (props.filepath.endsWith('.ts') || props.filepath.endsWith('.tsx')) {
          load_imports(props.ctx.fs, props.filepath, content)
            .then(() => console.log("loaded", uri))
            .catch(console.error);
        }

        const dispose_change = model.onDidChangeContent(async () => {
          setHasChange(true);
          if (id) clearTimeout(id);
          if (props.filepath.endsWith('.ts') || props.filepath.endsWith('.tsx')) {
            id = setTimeout(async () => {
              const ret = await load_imports(props.ctx.fs, props.filepath, content)
              if (ret) {
                editor.render(true);
                // editor.setValue(editor.getValue())
              }
            }, 500);
          }
        });
        disposes.push(dispose_change);
      }
      editor.setModel(model);
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        async () => {
          await editor.getAction("editor.action.formatDocument").run();
          save();
        }
      );
      editor.focus();
    })().catch(console.error);
    const handler = (ev: KeyboardEvent) => {
      if (ev.ctrlKey && ev.key === '1') {
        editor.focus();
      }
    }
    window.addEventListener('keydown', handler);
    return () => {
      disposes.forEach(d => d.dispose());
      window.removeEventListener('keydown', handler);
    }
  }, [props.filepath, editor, props.ctx, save]);
  return <div style={{ width: '100%', height: '100%', fontFamily: 'monaco', background: '#222', color: 'white' }}>
    <div style={{ height: 25, width: '100%', paddingLeft: 10 }}>
      {props.filepath}
      &nbsp;
      {hasChange ?
        <button onClick={save}>Save(Cmd+S)</button>
        : ''}
    </div>
    <div style={{ width: '100%', height: 'calc(100% - 25px)' }}
      ref={ref}
    >
    </div>
  </div>
}

const load_imports = async (fs: FileSystem, filepath: string, content: string): Promise<boolean> => {
  const imports = content.matchAll(IMPORT_REGEX);
  for (const imp of imports) {
    const specifier: string = imp.groups?.specifier1 ?? imp.groups?.specifier2 as string;
    for (const ext of ['', '.ts', '.tsx', '.js']) {
      const expect = path.join(path.dirname(filepath), specifier + ext);
      if (await fs.exists(expect)) {
        const sub_content = await fs.readFile(expect);
        const uri = monaco.Uri.file(expect);
        let model = monaco.editor.getModel(uri);
        if (model == null) {
          const language = ext2lang[path.extname(expect)] ?? 'text';
          model = monaco.editor.createModel(sub_content, language, uri);
        } else {
          model.setValue(sub_content);
        }
        console.log("detect", uri);
        return true;
      }
    }
  }
  return false;
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