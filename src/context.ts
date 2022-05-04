import type { Terminal } from "xterm";
import type { Context, EditorApi, StdIn, StdOut } from "./types";
import { FileSystem } from "./fs";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const create_context = async (handlers: {
  onOpen(filpath: string): void;
}): Promise<Context> => {
  const root = await navigator.storage.getDirectory();
  const fs = new FileSystem(root);
  const editor: EditorApi = {
    open: async (filepath: string) => {
      handlers.onOpen(filepath);
    }
  };
  return {
    ...create_std(),
    fs,
    editor,
    env: {
      HOME: '/workspace',
    },
    cmds: {}
  }
}

const create_std = (): { stdin: StdIn, stdout: StdOut, stderr: StdOut } => {
  let _buf: Uint8Array[] = [];

  const stdin: StdIn = {
    read: () => {
      const ret = _buf.slice();
      _buf.length = 0;
      return ret;
    },
  };

  const stdout: StdOut = {
    write: (data: string | Uint8Array) => {
      if (data instanceof Uint8Array) {
        _buf.push(data);
        return;
      }
      const encoded = textEncoder.encode(data);
      _buf.push(encoded);
    },
  };
  const stderr: StdOut = {
    write: (data: string | Uint8Array) => {
      if (data instanceof Uint8Array) {
        data = textDecoder.decode(data);
      }
      console.error(data);
      // term.writeln(data);
    },
  };
  return {
    stdin, stdout, stderr
  }
}
