import "xterm/css/xterm.css";
import type { IDisposable } from 'xterm';
// import { ExitStatus, getWasiImports, OpenFlags, stringOut } from './binding';
// import { FileOrDir, OpenFiles } from './fs_handler';
import { Terminal, } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import LocalEchoController from "../local-echo/mod";
// import { instantiate } from "asyncify-wasm";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

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

async function setupTerminal(): Promise<{
  term: Terminal,
  localEcho: LocalEchoController
}> {
  const term = new Terminal({});

  // weblink
  term.loadAddon(new WebLinksAddon());

  // fit addon
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  window.addEventListener("resize", () => fitAddon.fit());
  const localEcho = new LocalEchoController();
  // localEcho.addAutocompleteHandler((index: number): string[] =>
  //   index === 0 ? commands : []
  // );
  // const storedHistory = localStorage.getItem('command-history');
  // if (storedHistory) {
  //   localEcho.history.entries = storedHistory.split('\n');
  //   localEcho.history.rewind();
  // }
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
  let pwd = "/";
  globalThis.term = term;
  const onRewind = () => {
    localEcho.history.rewind();
  }
  while (true) {
    const line = await localEcho.read(`${pwd}$ `);
    onRewind();
    const args = parseInput(line);
    console.log('args', args);
    term.writeln(args.join(" "));
  }
}

main().catch(console.error);