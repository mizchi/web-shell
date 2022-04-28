// Copyright 2020 Google Inc. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import "xterm/css/xterm.css";
import type { IDisposable } from 'xterm';
import { ExitStatus, getWasiImports, OpenFlags, stringOut } from './binding';
import { FileOrDir, OpenFiles } from './native_fs';
import { Terminal, } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import LocalEchoController from "./local-echo/mod";
import { instantiate } from "asyncify-wasm";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

async function setupTerminal(): Promise<{term: Terminal, localEcho: LocalEchoController, commands: string[]}> {
  const term = new Terminal({});

  // weblink
  term.loadAddon(new WebLinksAddon());

  // fit addon
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  window.addEventListener("resize", () => fitAddon.fit());
  const localEcho = new LocalEchoController();
  const commands = ['help', 'mount', 'cd'];
  localEcho.addAutocompleteHandler((index: number): string[] =>
    index === 0 ? commands : []
  );
  const storedHistory = localStorage.getItem('command-history');
  if (storedHistory) {
    localEcho.history.entries = storedHistory.split('\n');
    localEcho.history.rewind();
  }
  term.loadAddon(localEcho);

  term.open(document.querySelector("#root")!);
  fitAddon.fit();
  return {
    term,
    localEcho,
    commands,
  };
}

(async () => {
  const { term, localEcho, commands } = await setupTerminal();
  const ANSI_GRAY = '\x1B[38;5;251m';
  const ANSI_BLUE = '\x1B[34;1m';
  const ANSI_RESET = '\x1B[0m';

  function writeIndented(s: string) {
    term.write(
      s
        .trimStart()
        .replace(/\n +/g, '\r\n')
        .replace(/https:\S+/g, ANSI_BLUE + '$&' + ANSI_RESET)
        .replace(/^#.*$/gm, ANSI_GRAY + '$&' + ANSI_RESET)
    );
  }

  // @ts-ignore
  const fetching = fetch(new URL('./coreutils.async.wasm', import.meta.url));
  const module = await WebAssembly.compileStreaming(fetching);

  let helpStr = '';

  let _mem: WebAssembly.Memory;
  const onGetMemory = (mem: WebAssembly.Memory) => { _mem = mem };
  const getBuffer = () => {
    return _mem.buffer;
  };
  const wasi = getWasiImports({
    getBuffer,
    openFiles: new OpenFiles({}),
    args: ['--help'],
    stdout: stringOut(chunk => (helpStr += chunk))
  });
  await run(module, wasi, onGetMemory);
  commands.push(
    ...helpStr
      .match(/Currently defined functions\/utilities:(.*)/s)![1]
      .match(/[\w-]+/g)!
  );

  writeIndented(`
    # Right now you have /sandbox mounted to a persistent sandbox filesystem:
    $ df -a
    Filesystem          1k-blocks         Used    Available  Use% Mounted on
    wasi                        0            0            0     - /sandbox
    # To mount a real directory, use command
    $ mount /mount/point # and choose a source in the dialogue.

    # To view a list of other commands, use
    $ help
  `);

  const stdin = {
    async read() {
      let onData: IDisposable;
      let line = '';
      try {
        await new Promise<void>(resolve => {
          onData = term.onData(s => {
            console.log("ondata", s);
            // Ctrl+D
            if (s === '\x04') {
              term.writeln('^D');
              return resolve();
            }
            // Enter
            if (s === '\r') {
              term.writeln('');
              line += '\n';
              return resolve();
            }
            // Ignore other functional keys
            if (s.charCodeAt(0) < 32) {
              return;
            }
            // Backspace
            if (s === '\x7F') {
              term.write('\b \b');
              line = line.slice(0, -1);
              return;
            }
            term.write(s);
            line += s;
          });
        });
      } finally {
        onData!.dispose();
      }
      return textEncoder.encode(line);
    }
  };

  const stdout = {
    write(data: Uint8Array) {
      term.write(
        textDecoder.decode(data, { stream: true }).replaceAll('\n', '\r\n')
      );
    }
  };

  const cmdParser = /(?:'(.*?)'|"(.*?)"|(\S+))\s*/gsuy;
  const preOpens: Record<string, FileSystemDirectoryHandle> = {
    '/sandbox': await navigator.storage.getDirectory()
  };

  let pwd = '/sandbox';

  const handleInput = async (args: string[]) => {
    switch (args[0]) {
      case 'help':
        args[0] = '--help';
        break;
      case 'mount': {
        let dest = args[1];
        if (!dest || dest === '--help' || !dest.startsWith('/')) {
          term.writeln(
            'Provide a desination mount point like "mount /mount/point" and choose a source in the dialogue.'
          );
          return;
        }
        const src = (preOpens[dest] = await showDirectoryPicker());
        term.writeln(
          `Successfully mounted (...host path...)/${src.name} at ${dest}.`
        );
        pwd = dest;
        return;
      }
      case 'cd': {
        let dest = args[1];
        if (dest) {
          // Resolve against the current working dir.
          dest = new URL(dest, `file://${pwd}/`).pathname;
          if (dest.endsWith('/')) {
            dest = dest.slice(0, -1) || '/';
          }
          const openFiles = new OpenFiles(preOpens);
          const { preOpen, relativePath } = openFiles.findRelPath(dest);
          await preOpen.getFileOrDir(
            relativePath,
            FileOrDir.Dir,
            OpenFlags.Directory
          );
          // We got here without failing, set the new working dir.
          pwd = dest;
        } else {
          term.writeln('Provide the directory argument.');
        }
        return;
      }
    }
    const openFiles = new OpenFiles(preOpens);
    let redirectedStdout;
    if (['>', '>>'].includes(args[args.length - 2])) {
      let path = args.pop()!;
      // Resolve against the current working dir.
      path = new URL(path, `file://${pwd}/`).pathname;
      let { preOpen, relativePath } = openFiles.findRelPath(path);
      let handle = await preOpen.getFileOrDir(
        relativePath,
        FileOrDir.File,
        OpenFlags.Create
      );
      if (args.pop() === '>') {
        redirectedStdout = await handle.createWritable();
      } else {
        redirectedStdout = await handle.createWritable({ keepExistingData: true });
        redirectedStdout.seek((await handle.getFile()).size);
      }
    }
    localEcho.detach();
    const abortController = new AbortController();
    const ctrlCHandler = term.onData(s => {
      if (s === '\x03') {
        term.write('^C');
        abortController.abort();
      }
    });
    try {
      let _mem: WebAssembly.Memory;
      const onGetMemory = (mem: WebAssembly.Memory) => { _mem = mem };
      const getBuffer = () => {
        return _mem.buffer;
      };

      const wasi = getWasiImports({
        getBuffer,
        abortSignal: abortController.signal,
        openFiles,
        stdin,
        stdout: redirectedStdout ?? stdout,
        stderr: stdout,
        args: ['$', ...args],
        env: {
          RUST_BACKTRACE: '1',
          PWD: pwd
        }
      });
      const statusCode = await run(module, wasi, onGetMemory);      
      if (statusCode !== 0) {
        term.writeln(`Exit code: ${statusCode}`);
      }
    } finally {
      ctrlCHandler.dispose();
      localEcho.attach();
      if (redirectedStdout) {
        await redirectedStdout.close();
      }
    }

  }
  while (true) {
    let line: string = await localEcho.read(`${pwd}$ `);
    localEcho.history.rewind();
    localStorage.setItem(
      'command-history',
      localEcho.history.entries.join('\n')
    );
    const args = Array.from(
      line.matchAll(cmdParser),
      ([, s1, s2, s3]) => s1 ?? s2 ?? s3
    );
    console.log("line >", args);
    try {
      if (!args.length) {
        continue;
      }
      await handleInput(args);
    } catch (err) {
      term.writeln((err as Error).message);
    }
  }
})();

async function run(module: WebAssembly.Module, wasi: any, fn: (memory: WebAssembly.Memory) => void): Promise<number> {
  let {
    exports: { _start, memory }
  } = await instantiate(module, {
    wasi_snapshot_preview1: wasi,
  }) as any;
  // this.memory = memory;
  fn(memory);
  try {
    await _start();
    return 0;
  } catch (err) {
    if (err instanceof ExitStatus) {
      return err.statusCode;
    }
    throw err;
  }
}
