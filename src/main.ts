import { StdIn, StdOut } from './binding';
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
import { FileOrDir, OpenFiles } from './fs_handler';
import { Terminal, } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import LocalEchoController from "../local-echo/mod";
import { instantiate } from "asyncify-wasm";

const ANSI_GRAY = '\x1B[38;5;251m';
const ANSI_BLUE = '\x1B[34;1m';
const ANSI_RESET = '\x1B[0m';

const cmdParser = /(?:'(.*?)'|"(.*?)"|(\S+))\s*/gsuy;

const parseInput = (line: string) => {
  return Array.from(
    line.matchAll(cmdParser),
    ([, s1, s2, s3]) => s1 ?? s2 ?? s3
  );
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

async function setupTerminal(): Promise<{ term: Terminal, localEcho: LocalEchoController }> {
  const term = new Terminal({});

  // weblink
  term.loadAddon(new WebLinksAddon());

  // fit addon
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  window.addEventListener("resize", () => fitAddon.fit());
  const localEcho = new LocalEchoController();
  const commands = [
    'help', 'mount', 'cd',
    'base32', 'base64', 'basename', 'cat', 'cksum', 'comm',
    'cp', 'csplit', 'cut', 'date', 'df', 'dircolors', 'dirname',
    'echo', 'env', 'expand', 'expr', 'factor',
    'false', 'fmt', 'fold', 'hashsum', 'head', 'join',
    'link', 'ln', 'ls', 'md5sum', 'mkdir', 'mktemp', 'more',
    'mv', 'nl', 'od', 'paste', 'printenv', 'printf', 'ptx', 'pwd',
    'readlink', 'realpath', 'relpath', 'rm', 'rmdir', 'seq', 'sha1sum',
    'sha224sum', 'sha256sum', 'sha3-224sum', 'sha3-256sum', 'sha3-384sum',
    'sha3-512sum', 'sha384sum', 'sha3sum', 'sha512sum',
    'shake128sum', 'shake256sum', 'shred', 'shuf', 'sleep', 'sort',
    'split', 'sum', 'tac', 'tail', 'tee', 'test', 'touch', 'tr',
    'true', 'truncate', 'tsort', 'unexpand', 'uniq', 'wc', 'yes'
  ];
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
  };
}

async function main() {
  const { term, localEcho } = await setupTerminal();
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

  const stdin: StdIn = {
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

  const stdout: StdOut = {
    write(data: Uint8Array) {
      term.write(
        textDecoder.decode(data, { stream: true }).replaceAll('\n', '\r\n')
      );
    }
  };

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
        const dest = args[1];
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
      default: {
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
          const statusCode = await runCommand(module, pwd, args, {
            openFiles,
            abortSignal: abortController.signal,
            stdin,
            stdout,
            redirectedStdOut: redirectedStdout,
          });
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
    }

  }

  const onRewind = () => {
    localEcho.history.rewind();
    localStorage.setItem(
      'command-history',
      localEcho.history.entries.join('\n')
    );
  }
  while (true) {
    const line = await localEcho.read(`${pwd}$ `);
    onRewind();
    const args = parseInput(line);
    try {
      if (!args.length) {
        continue;
      }
      await handleInput(args);
    } catch (err) {
      term.writeln((err as Error).message);
    }
  }
};

async function runCommand(
  module: WebAssembly.Module,
  pwd: string,
  args: string[],
  { openFiles, abortSignal, stdin, stdout, redirectedStdOut
  }: {
    openFiles: OpenFiles,
    abortSignal: AbortSignal,
    stdin: StdIn,
    stdout: StdOut,
    redirectedStdOut?: StdOut
  })
  : Promise<number> {
  const wasi = getWasiImports({
    getBuffer: () => memory.buffer,
    abortSignal,
    openFiles,
    stdin,
    stdout: redirectedStdOut ?? stdout,
    stderr: stdout,
    args: ['$', ...args],
    env: {
      RUST_BACKTRACE: '1',
      PWD: pwd
    }
  });

  const compiled = await instantiate(module, {
    wasi_snapshot_preview1: wasi,
  });

  const { _start, memory } = compiled.exports as {
    _start: () => Promise<number>,
    memory: WebAssembly.Memory
  };
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


main().catch(console.error);

