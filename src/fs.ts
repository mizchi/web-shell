import path from 'path-browserify';
import { HandleExpect, HandleExpectResult } from "./types";

export class FileSystem {
  #root: FileSystemDirectoryHandle;
  #cwd: string;
  #caches: Map<string, FileSystemHandleUnion> = new Map();
  #mounts = new Map<string, FileSystemDirectoryHandle>();
  constructor(root: FileSystemDirectoryHandle, cwd: string = '/') {
    this.#root = root;
    this.#cwd = cwd;
    this.#caches.set("/", root);
    this.#mounts.set("/workspace", root);
  }
  public chdir(target: string) {
    const resolved = this.#resolve_path(target);
    this.#cwd = resolved;
  }

  public cwd(): string {
    return this.#cwd;
  }
  public onMountPath(fpath: string): boolean {
    const resolve = this.#resolve_path(fpath);
    for (const v of this.#mounts.keys()) {
      if (resolve.startsWith(v)) {
        return true;
      }
    }
    return false;
  }

  public async mount(fpath: string, directory: FileSystemDirectoryHandle) {
    const resolved = this.#resolve_path(fpath);
    this.#caches.set(resolved, directory);
    this.#mounts.set(resolved, directory);
  }

  public async read(
    fpath: string,
  ): Promise<FileSystemHandleUnion> {
    const full = this.#resolve_path(fpath);
    const cached = this.#caches.get(full);
    if (cached) return cached;

    const got = await this.#read_impl(full);
    this.#caches.set(full, got);
    return got;
  }

  async #read_impl(full: string): Promise<FileSystemHandleUnion> {
    // select volume
    const vol = [...this.#mounts.entries()]
      .find(([k, _v]) => full.startsWith(k))?.[1] ?? this.#root;
    const access_paths = full.replace(/^\//, '').split('/');
    let cur: FileSystemHandleUnion = vol;
    let dest = '/';
    for (let i = 0; i < access_paths.length; i++) {
      const next_path = access_paths[i];
      dest = path.join(dest, next_path);
      if (this.#caches.has(dest)) {
        cur = this.#caches.get(dest) as FileSystemDirectoryHandle;
      } else {
        cur = await access_child(cur as FileSystemDirectoryHandle, next_path);
        this.#caches.set(dest, cur);
      }
    }
    return cur;
  }

  public async stat(fpath: string): Promise<{ kind: 'file', size: number } | { kind: 'directory' }> {
    const res = await this.read(fpath);
    if (res.kind === 'file') {
      const file = await res.getFile();
      return {
        kind: res.kind,
        size: file.size
      }
    }
    return { kind: 'directory' };
  }

  public async readdir(
    fpath: string
  ): Promise<Array<FileSystemFileHandle | FileSystemDirectoryHandle>> {
    const full = this.#resolve_path(fpath);
    const res = await this.read(full);
    if (res.kind === 'file') {
      throw new Error(`${fpath} is not a directory`);
    }
    const entries: Array<FileSystemFileHandle | FileSystemDirectoryHandle> = [];
    for await (const handle of res.values()) {
      entries.push(handle);
    }
    return entries;
  }

  public async exists(fpath: string): Promise<boolean> {
    const resolved = path.parse(this.#resolve_path(fpath));
    const parent = await this.read(resolved.dir) as FileSystemDirectoryHandle;
    for await (const name of parent.keys()) {
      if (name === resolved.base) {
        return true;
      }
    }
    return false;
  }

  public async rm(fpath: string) {
    const full = this.#resolve_path(fpath);
    const parsed = path.parse(full);

    const parent = await this.read(parsed.dir) as FileSystemDirectoryHandle;
    this.#caches.delete(full);
    await parent.removeEntry(parsed.base);
  }

  public async rmdir(fpath: string, recursive: boolean = true) {
    const full = this.#resolve_path(fpath);
    const resolved = path.parse(full);
    const parent = await this.read(resolved.dir) as FileSystemDirectoryHandle;
    await parent.removeEntry(resolved.base, { recursive });
    // remove cache under this directory
    for (const [k, v] of this.#caches.entries()) {
      if (k.startsWith(full)) {
        this.#caches.delete(k);
      }
    }
  }

  public async readFile(
    fpath: string
  ): Promise<string> {
    const h = await this.read(fpath);
    if (h.kind === 'directory') {
      throw new Error(`${fpath} is not a file`);
    }
    const file = await h.getFile();
    return file.text();
  }

  public async writeFile(
    fpath: string,
    content: string
  ): Promise<void> {
    const full = this.#resolve_path(fpath);
    const parsed = path.parse(full);
    const parent = await this.read(parsed.dir) as FileSystemDirectoryHandle;

    let file = this.#caches.get(full) as FileSystemFileHandle;
    if (!file) {
      file = await parent.getFileHandle(parsed.base, { create: true }) as FileSystemFileHandle;
      this.#caches.set(full, file);
    }
    const writable = await file.createWritable();
    await writable.truncate(0);
    await writable.write(content);
    await writable.close();
  }

  public async mkdir(fpath: string): Promise<void> {
    const full = this.#resolve_path(fpath);
    const parsed = path.parse(full);
    const parent = await this.read(parsed.dir) as FileSystemDirectoryHandle;
    await parent.getDirectoryHandle(parsed.base, { create: true });
    return;
  }

  #resolve_path(rel: string) {
    if (rel.startsWith("/")) {
      return rel;
    }
    if (rel.startsWith("~")) {
      if (rel === '~') {
        return '/workspace'
      }
      if (rel.startsWith('~/')) {
        return path.resolve('/workspace', rel.slice(2));
      }
      throw new Error(`unsupported path: ${rel}`);
    }

    return path.resolve('/', this.#cwd, rel);
  }
}

const access_child = async <Expect extends HandleExpect>(
  handle: FileSystemDirectoryHandle,
  child: string,
  expect: Expect = 'both' as Expect
): Promise<HandleExpectResult<Expect>> => {
  if (expect === 'file') {
    return await handle.getFileHandle(child) as any;
  } else if (expect === 'directory') {
    return await handle.getDirectoryHandle(child) as any;
  }
  for await (const [key, h] of handle.entries()) {
    if (key === child) {
      return h as any;
    }
  }
  throw new Error(`Not Found: ${child}`);
}

