import "xterm/css/xterm.css";
import path from 'path-browserify';
import { Terminal, } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import { init_default_cmds } from './cmds';
import LocalEchoController from "../local-echo/mod";
import README from "./assets/README.md?raw";
import MainTs from "./assets/main.ts?raw";
import SubTs from "./assets/sub.ts?raw";

import { Context } from "./types";
import { AutoCompleteFunc } from "../local-echo/types";
import { parse } from "shell-quote";
import { hasTailingWhitespace } from "../local-echo/Utils";

type PipeOp = '>' | '>>' | '|' | '&&' | '&' | '||' | '|>';
const PIPE_EATER = /(?<next>[^\|\>\<\&]+)((?<op>\>|\>\>|\|\>|\&\&|\|\|)\s*(?<rest>.+)?)/;

const CMD_PARSER_REGEX = /(?:'(.*?)'|"(.*?)"|(\S+))\s*/gsuy;

const ANSI_GRAY = '\x1B[38;5;251m';
const ANSI_BLUE = '\x1B[34;1m';
const ANSI_RESET = '\x1B[0m';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const parse_input = (line: string) => {
  const parsed = Array.from(
    line.matchAll(CMD_PARSER_REGEX),
    ([, s1, s2, s3]) => s1 ?? s2 ?? s3
  );

  const args: string[] = [];
  const flags: string[] = [];
  for (const arg of parsed) {
    if (arg.startsWith('-')) {
      flags.push(arg);
    } else {
      args.push(arg);
    }
  }
  return { args, flags };
}

export const init_term = async (ctx: Context, el: HTMLElement) => {
  const { term, localEcho } = await setup_terminal(el);
  init_default_cmds(ctx);

  const completion_handler: AutoCompleteFunc = async ({ args, raw, cursor }): Promise<string[]> => {
    const tokens = parse(raw);
    let index = tokens.length - 1;
    let expr: string = tokens[index] as string || "";
    // Empty expressions
    if (raw.trim() === "") {
      index = 0;
      expr = "";
    } else if (hasTailingWhitespace(raw)) {
      index += 1;
      expr = "";
    }
    if (index === 0) {
      return Object.keys(ctx.cmds).filter(e => e.startsWith(expr as string));
    }
    const parsed = parse_input(raw);
    const cmd = parsed.args[0] as string;

    // expect dir
    if (index === 1 && ['cd', 'rmdir'].includes(cmd)) {
      const subpath = expr!.lastIndexOf('/');
      if (subpath > -1) {
        return [];
        const parent_dir = expr!.substring(0, subpath + 1);
        const rest_expr = expr!.substring(subpath + 1);
        // if (rest_expr.length > 0) {
        // debugger
        const entries = await ctx.fs.readdir(parent_dir as string);
        const ret = entries
          .filter(e => e.kind === 'directory')
          .filter(e => e.name.startsWith(rest_expr))
          .map(e => parent_dir + e.name + '/');
        debugger;
        return ret;
        // } else {
        //   const entries = await ctx.fs.readdir(parent_dir);
        //   debugger
        //   // const parsed = path.parse(rest_expr as string);
        //   // debugger
        //   return entries
        //     .filter(e => e.kind === 'directory')
        //     .map(e => parent_dir + e.name + '/');
        // }
      } else {
        const entries = await ctx.fs.readdir('.');
        return entries
          .filter(e => e.kind === 'directory')
          .filter(e => e.name.startsWith(expr))
          .map(e => e.name + '/');
      }
    }
    // expect file
    if (index === 1 && ['open', 'bundle', 'cat', 'rm'].includes(cmd)) {
      const entries = await ctx.fs.readdir('.');
      return entries.filter(e => e.kind === 'file' && e.name.startsWith(expr as string)).map(e => e.name);
    }
    // expect both
    if (index === 1 && ['ls', 'cp'].includes(cmd)) {
      const entries = await ctx.fs.readdir('.');
      return entries.filter(e => e.name.startsWith(expr as string)).map(e => e.name);
    }

    return [];
    // return index === 0 ? ['ls', 'cd', 'pwd'] : []
  }
  localEcho.addAutocompleteHandler(completion_handler);

  // @ts-ignore
  globalThis.ctx = ctx;
  const onRewind = () => {
    // const keep_size = Math.min(localEcho.history.entries.length, 30);
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
      const { args, flags } = parse_input(eaten.next);
      // console.log('run', args);
      const piped = ctx.stdin.read().map(x => textDecoder.decode(x));
      try {
        if (input_raw === 'clear') {
          term.clear();
          continue;
        }
        last_status = await handle_input(
          ctx, args[0], [...args.slice(1) as string[], ...piped], flags
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

const handle_input = async (ctx: Context, cmd: string, args: string[] = [], flags: string[] = []): Promise<number> => {
  if (!cmd) {
    return 0;
  }
  try {
    const cmd_func = ctx.cmds[cmd];
    if (!cmd_func) {
      ctx.stdout.write(`${cmd}: command not found`);
      return 1;
    }
    return cmd_func(ctx, args, flags);
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

