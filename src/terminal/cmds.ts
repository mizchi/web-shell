import { transformSync } from '@mizchi/mints';
import path from 'path-browserify';
import { bundle } from '../api/bundle';
// import { parse_rel, _read, resolve_parent, resolve_path, resolve_rel_handler } from './fs';
// import { FileSystem } from './fs';

import { Cmd, Context } from "../types";

export const init_default_cmds = (ctx: Context) => {
  const defaluts: Record<string, Cmd> = {
    cd: $cd,
    "..": $cd_dotdot,
    mkdir: $mkdir,
    touch: $touch,
    eval: $eval,
    exec: $exec,
    rm: $rm,
    rmdir: $rmdir,
    echo: $echo,
    ls: $ls,
    cp: $cp,
    help: $help,
    writef: $writef,
    open: $open,
    bundle: $bundle,
    // appendf: $appendf,
    cat: $cat,
    mount: $mount
  }
  for (const [key, cmd] of Object.entries(defaluts)) {
    ctx.cmds[key] = cmd;
  }
}

export const $bundle: Cmd = async ({ fs, stdout }, args) => {
  const target = args[0];
  if (target == null) return 1;
  const fullpath = path.join(fs.cwd(), target);
  const parsed = path.parse(fullpath);
  const output = await bundle(fs, {
    input: fullpath,
    output: {
      dir: 'dist',
      format: 'es'
    }
  });
  const outdir = path.join(parsed.dir, 'dist');
  await fs.mkdir(outdir).catch(() => { });
  for (const chunk of output.output) {
    const out = path.join(parsed.dir, 'dist', chunk.fileName);
    stdout.write(`gen > ${out}`);
    if (chunk.type === 'asset') {
      await fs.writeFile(out, chunk.source as string);
    } else {
      await fs.writeFile(out, chunk.code);
    }
  }
  return 0;
}


export const $mount: Cmd = async ({ fs }, args) => {
  const target = args[0];
  if (target) {
    const full_path = path.join(fs.cwd(), target);
    const choosed = await showDirectoryPicker({
      title: 'Select a directory to mount',
      buttonLabel: 'Mount',
      startIn: 'documents',
    });
    await fs.mount(full_path, choosed);
    fs.chdir(full_path);
  } else {
    const choosed = await showDirectoryPicker({
      title: 'Select a directory to mount',
      buttonLabel: 'Mount',
      startIn: 'documents',
    });
    const full = `/${choosed.name}`;
    await fs.mount(full, choosed);
    fs.chdir(full);
  }
  return 0;
}


async function run_code(code: string, write: (text: string) => void) {
  const encoded = btoa(code);
  const wrapped = `
globalThis._console = console;
globalThis.console = Object.keys(console).reduce((acc, cur) => {
  return {...acc, [cur](...args) {
    postMessage({type: "log", method: cur, args });
  }};
}, {});

const code = \`data:text/javascript;base64,${encoded}\`;
// debugger;
import(code)
  .then(mod => mod.default?.())
  .finally(() => {
    postMessage({type: "terminate", error: false});
  });

self.onerror = (err) => {
  postMessage({type: "terminate", error: true, message: err?.message});
}
`;
  const blob = new Blob([wrapped]);
  const blobURL = URL.createObjectURL(blob);
  // const cmd_names = Object.keys(cmds);
  // const worker = new Worker(blobURL, { type: 'module' });
  const worker = new Worker(blobURL);

  // let res,rej;
  await new Promise<void>((res, rej) => {
    worker.onmessage = (ev) => {
      switch (ev.data.type) {
        case "log": {
          for (const arg of ev.data.args) {
            for (const line of String(arg).split("\n")) {
              write(line);
            }
            // stdout.write(',');
          }
          break;
        }
        case "terminate": {
          worker.terminate();
          if (ev.data.error) {
            rej(ev.data.message);
          } else {
            res();
          }
        }
      }
    }
  });
}

export const $eval: Cmd = async ({ cmds, stdout }, args, flags) => {
  let code = args.join(" ");
  await run_code(code, stdout.write.bind(stdout));
  return 0;
}

export const $exec: Cmd = async ({ fs, stdout, stderr }, args, flags) => {
  const target = args[0];
  if (target == null) {
    stdout.write("usage: exec <file>");
    return 1;
  }
  const fullpath = path.join(fs.cwd(), target);
  const output = await bundle(fs, {
    input: fullpath,
    output: {
      dir: 'dist',
      format: 'es'
    }
  });
  const code = output.output[0].code;
  await run_code(code, stdout.write.bind(stdout));
  return 0;
}


export const $help: Cmd = async ({ cmds, stdout }, args) => {
  const cmd_names = Object.keys(cmds);
  const help_text = `webshell: commands`;
  stdout.write(help_text);
  stdout.write(cmd_names.join(" "));
  return 0;
}

export const $mkdir: Cmd = async ({ fs }, args) => {
  const target = args[0];
  await fs.mkdir(target);
  return 0;
}

export const $rmdir: Cmd = async ({ fs }, args, flags) => {
  const target = args[0];
  if (target == null) return 1;
  await fs.rmdir(target);
  return 0;
}

export const $cd_dotdot: Cmd = async ({ fs }, args) => {
  fs.chdir("..");
  return 0;
}

export const $cd: Cmd = async ({ fs }, args) => {
  const target = args[0];
  if (target == null) {
    fs.chdir("~");
    return 0;
  };
  const handle = await fs.read(target);
  if (handle.kind === 'file') {
    throw new Error(`${target} is not a directory`);
  }
  fs.chdir(target);
  return 0;
}

export const $touch: Cmd = async ({ fs }, args) => {
  const target = args[0];
  if (target == null) return 1;
  const exists = await fs.exists(target);
  if (exists) {
    return 0;
  } else {
    await fs.writeFile(target, "");
    return 0;
  }
}

export const $rm: Cmd = async ({ fs }, args, flags) => {
  const target = args[0];
  if (target == null) return 1;
  if (flags.includes('-r')) {
    await fs.rmdir(target);
  } else {
    await fs.rm(target);
  }
  return 0;
}

export const $echo: Cmd = async (ctx, args) => {
  const target = args.join(" ");
  if (target) {
    ctx.stdout.write(target);
  }
  return 0;
}

export const $ls: Cmd = async ({ fs, stdout }, args) => {
  const target = args[0] ?? '.';
  const entries = await fs.readdir(target);
  const files: string[] = [];
  const dirs: string[] = [];

  for await (const entry of entries) {
    if (entry.kind === 'file') {
      files.push(entry.name);
    } else {
      dirs.push(entry.name)
    }
  }
  for (const dir of dirs.sort()) {
    stdout.write(`${dir}/`);
  }
  for (const f of files.sort()) {
    stdout.write(`${f}`);
  }
  return 0;
}

export const $writef: Cmd = async (ctx, args) => {
  const [target, content] = args;
  if (target == null || content == null) return 1;
  await ctx.fs.writeFile(target, content);
  return 0;
}


export const $open: Cmd = async ({ fs, stdout, actions }, args) => {
  const target = args[0];
  if (target == null) return 1;
  let handle;
  if (await fs.exists(target)) {
    handle = await fs.read(target);
  } else {
    await fs.writeFile(target, "");
    handle = await fs.read(target);
  }
  const fullpath = path.join(fs.cwd(), target);
  actions.open(fullpath);
  return 0;
}


export const $cat: Cmd = async ({ fs, stdout }, args) => {
  const target = args[0];
  if (target == null) return 1;
  const text = await fs.readFile(target);
  for (const line of text.split('\n')) {
    stdout.write(line);
  }
  return 0;
}

export const $cp: Cmd = async ({ fs }, args) => {
  const [target, dest] = args;
  if (target == null || dest == null) return 1;
  const content = await fs.readFile(target);
  await fs.writeFile(dest, content);
  return 0;
}

