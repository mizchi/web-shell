import "xterm/css/xterm.css";
import { Terminal, } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import { init_default_cmds } from './cmds';
import LocalEchoController from "../local-echo/mod";
import README from "./assets/README.md?raw";
import MainTs from "./assets/main.ts?raw";
import SubTs from "./assets/sub.ts?raw";

import { Context } from "./types";

type PipeOp = '>' | '>>' | '|' | '&&' | '&' | '||' | '|>';
const PIPE_EATER = /(?<next>[^\|\>\<\&]+)((?<op>\>|\>\>|\|\>|\&\&|\|\|)\s*(?<rest>.+)?)/;

const CMD_PARSER_REGEX = /(?:'(.*?)'|"(.*?)"|(\S+))\s*/gsuy;

const ANSI_GRAY = '\x1B[38;5;251m';
const ANSI_BLUE = '\x1B[34;1m';
const ANSI_RESET = '\x1B[0m';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const parse_input = (line: string) => {
  return Array.from(
    line.matchAll(CMD_PARSER_REGEX),
    ([, s1, s2, s3]) => s1 ?? s2 ?? s3
  );
}

export const init_term = async (ctx: Context, el: HTMLElement) => {
  const { term, localEcho } = await setup_terminal(el);
  init_default_cmds(ctx);
  // @ts-ignore
  globalThis.ctx = ctx;
  const onRewind = () => {
    localStorage.setItem(
      'command-history',
      localEcho.history.entries.join('\n')
    );
    localEcho.history.rewind();
  }

  // for await (const name of ctx.fs.root.keys()) {
  //   await ctx.root.removeEntry(name, { recursive: true });
  // }
  term.writeln("Welcome to webshell");
  await handle_input(ctx, 'mkdir', ['/workspace']);
  ctx.stdin.read();
  await handle_input(ctx, 'cd', ['/workspace']);
  ctx.stdin.read();

  await ctx.fs.writeFile('/workspace/README.md', README);
  await ctx.fs.writeFile('/workspace/main.ts', MainTs);
  await ctx.fs.writeFile('/workspace/sub.ts', SubTs);
  let last_status = 0;
  while (true) {
    term.writeln(`${ANSI_BLUE}${ctx.fs.cwd()}${ANSI_RESET}`);
    onRewind();
    const input_raw = await localEcho.read(
      last_status === 0 ? `$ ` : `!$ `);
    let eaten = eat(input_raw);
    // console.log('eaten', eaten);
    // let piped: string[] = [];

    const flush = () => {
      for (const p of ctx.stdin.read()) {
        if (last_status === 0) {
          const text = textDecoder.decode(p);
          term.writeln(text);
        } else {
          term.writeln(textDecoder.decode(p));
        }
      }
    }

    do {
      const args = parse_input(eaten.next);
      // console.log('run', args);
      const piped = ctx.stdin.read().map(x => textDecoder.decode(x));
      try {
        if (input_raw === 'clear') {
          term.clear();
          continue;
        }
        last_status = await handle_input(
          ctx, args[0], [...args.slice(1) as string[], ...piped]
        );
      } catch (err) {
        last_status = 1;
        if (err instanceof Error) {
          term.writeln(err.toString());
        }
        console.error(err);
      }
      // stop
      if (eaten.op === '&&') {
        if (last_status === 0) {
          flush();
          continue;
        }
        else {
          break;
        };
      }
      if (eaten.op === '||') {
        if (last_status !== 0) {
          flush();
          continue;
        } else {
          break;
        }
      }
    } while (eaten.rest && (eaten = eat(eaten.rest)));
    flush();
  }
};


async function setup_terminal(el: HTMLElement): Promise<{
  term: Terminal,
  localEcho: LocalEchoController
}> {
  const term = new Terminal({
    theme: {
      background: '#333'
    }
  });
  const _dispose = term.onData((arg1) => {
    if (arg1 === '\f') {
      term.clear();
    }
  });

  // weblink
  term.loadAddon(new WebLinksAddon());

  // fit addon
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  window.addEventListener("resize", () => fitAddon.fit());
  const localEcho = new LocalEchoController();
  localEcho.addAutocompleteHandler((index: number): string[] =>
    index === 0 ? ['ls', 'cd', 'pwd'] : []
  );
  const storedHistory = localStorage.getItem('command-history');
  if (storedHistory) {
    localEcho.history.entries = storedHistory.split('\n');
    localEcho.history.rewind();
  }
  term.loadAddon(localEcho);

  el.innerHTML = '';
  term.open(el);
  fitAddon.fit();
  term.focus();
  return {
    term,
    localEcho,
  };
}

const handle_input = async (ctx: Context, cmd: string, args: string[] = []): Promise<number> => {
  if (!cmd) {
    return 0;
  }
  try {
    const cmd_func = ctx.cmds[cmd];
    if (!cmd_func) {
      ctx.stdout.write(`${cmd}: command not found`);
      return 1;
    }
    return cmd_func(ctx, args);
  } catch (err) {
    if (err instanceof Error) {
      ctx.stdout.write(err.toString());
    } else {
      ctx.stdout.write(String(err));
    }
    return 1;
  }
}

const eat = (input: string): { next: string, op?: undefined | PipeOp, rest?: string } => {
  const group = PIPE_EATER.exec(input)?.groups as undefined | {
    head: string,
    op: PipeOp,
    rest: string
  };
  if (group == null) {
    const out = input;
    return {
      next: out,
    };
  }
  // input = group.rest;
  return group as any;;
};

