import type { FileSystem } from "./fs";
export type StdOut = {
  write: (data: string | Uint8Array) => void,
  // writeln: (data: string | Uint8Array) => void,
}
export type StdIn = {
  read: () => Uint8Array[],
}

export type EditorApi = {
  open(filepath: string): void;
}

export type Cmd<Args extends string[] = string[]> = (ctx: Context, args: Args, flags: string[]) => Promise<number> | number;

export type Context = {
  fs: FileSystem,
  stdout: StdOut,
  stderr: StdOut,
  stdin: StdIn,
  actions: EditorApi,
  // caches: Map<string, FileSystemHandleUnion>,
  env: {
    [key: string]: string;
  },
  cmds: Record<string, Cmd>
};

export type ResultMap = {
  'file': FileSystemFileHandle,
  'directory': FileSystemDirectoryHandle,
  'both': FileSystemHandleUnion,
}

export type HandleExpect = 'file' | 'directory' | 'both';
export type HandleExpectResult<Expect extends HandleExpect> = ResultMap[HandleExpect]
