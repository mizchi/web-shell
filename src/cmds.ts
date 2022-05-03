import path from 'path-browserify';
import { bundle } from './bundle';
// import { parse_rel, _read, resolve_parent, resolve_path, resolve_rel_handler } from './fs';
// import { FileSystem } from './fs';

import { Context } from "./types";

export type Cmd<Args extends string[] = string[]> = (ctx: Context, args: Args) => Promise<number> | number;

export const init_default_cmds = (ctx: Context) => {
  const defaluts: Record<string, Cmd> = {
    cd: $cd,
    mkdir: $mkdir,
    touch: $touch,
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

export const $rmdir: Cmd = async ({ fs }, args) => {
  const target = args[0];
  if (target == null) return 1;
  await fs.rmdir(target);
  return 0;
}

export const $cd: Cmd = async ({ fs }, args) => {
  const target = args[0];
  if (target == null) {
    fs.chdir("/");
    return 0;
  };
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
    fs.writeFile(target, "");
    return 0;
  }
}

export const $rm: Cmd = async ({ fs }, args) => {
  const target = args[0];
  if (target == null) return 1;
  await fs.rm(target);
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


export const $open: Cmd = async ({ fs, stdout, editor }, args) => {
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
  editor.open(fullpath);
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

