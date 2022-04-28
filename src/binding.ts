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

import { OpenFiles, FileOrDir, FIRST_PREOPEN_FD } from './native_fs';
// import { instantiate } from '../node_modules/asyncify-wasm/dist/asyncify.mjs';
import { instantiate } from 'asyncify-wasm';

import {
  enumer,
  ptr,
  string,
  struct,
  taggedUnion,
  TargetType,
  TypeDesc,
  int8_t,
  uint8_t,
  uint16_t,
  uint32_t,
  uint64_t,
  size_t
} from './type_desc';

export enum E {
  SUCCESS = 0,
  ACCES = 2,
  BADF = 8,
  CANCELED = 11,
  EXIST = 20,
  INVAL = 28,
  ISDIR = 31,
  NOENT = 44,
  NOSYS = 52,
  NOTDIR = 54,
  NOTEMPTY = 55,
  NOTCAPABLE = 76
}

export class ExitStatus {
  constructor(public statusCode: number) {}
}

const enum PreOpenType {
  Dir
}
const preopentype_t = enumer<PreOpenType>(int8_t);

const prestat_t = struct({
  type: preopentype_t,
  nameLen: size_t
});
type prestat_t = TargetType<typeof prestat_t>;

export type fd_t = number & { _name: 'fd' };
export const fd_t = uint32_t as TypeDesc<fd_t>;

const iovec_t = struct({
  bufPtr: uint32_t,
  bufLen: size_t
});
type iovec_t = TargetType<typeof iovec_t>;

const enum FileType {
  Unknown,
  BlockDevice,
  CharacterDevice,
  Directory,
  RegularFile,
  SocketDatagram,
  SocketStream,
  SymbolicLink
}
const filetype_t = enumer<FileType>(uint8_t);

const fdflags_t = enumer<FdFlags>(uint16_t);

const rights_t = uint64_t;

const fdstat_t = struct({
  filetype: filetype_t,
  flags: fdflags_t,
  rightsBase: rights_t,
  rightsInheriting: rights_t
});
type fdstat_t = TargetType<typeof fdstat_t>;

const dircookie_t = uint64_t;

const inode_t = uint64_t;

const dirent_t = struct({
  next: dircookie_t,
  ino: inode_t,
  nameLen: uint32_t,
  type: filetype_t
});
type dirent_t = TargetType<typeof dirent_t>;

const device_t = uint64_t;

const linkcount_t = uint64_t;

const filesize_t = uint64_t;

const timestamp_t = uint64_t;

const filestat_t = struct({
  dev: device_t,
  ino: inode_t,
  filetype: filetype_t,
  nlink: linkcount_t,
  size: filesize_t,
  accessTime: timestamp_t,
  modTime: timestamp_t,
  changeTime: timestamp_t
});
type filestat_t = TargetType<typeof filestat_t>;

const enum ClockId {
  Realtime,
  Monotonic,
  ProcessCPUTimeId,
  ThreadCPUTimeId
}
const clockid_t = enumer<ClockId>(uint32_t);

const userdata_t = uint64_t;

const enum EventType {
  Clock,
  FdRead,
  FdWrite
}
const eventtype_t = enumer<EventType>(uint8_t);

const enum SubclockFlags {
  Relative,
  Absolute
}
const subclockflags_t = enumer<SubclockFlags>(uint16_t);

const subscription_clock_t = struct({
  id: clockid_t,
  timeout: timestamp_t,
  precision: timestamp_t,
  flags: subclockflags_t
});

const subscription_fd_readwrite_t = struct({
  fd: fd_t
});

const subscription_union_t = taggedUnion({
  tag: eventtype_t,
  data: {
    [EventType.Clock]: subscription_clock_t,
    [EventType.FdRead]: subscription_fd_readwrite_t,
    [EventType.FdWrite]: subscription_fd_readwrite_t
  }
});

const subscription_t = struct({
  userdata: userdata_t,
  union: subscription_union_t
});
type subscription_t = TargetType<typeof subscription_t>;

const enum EventRwFlags {
  None,
  FdReadWriteHangup
}
const event_rw_flags_t = enumer<EventRwFlags>(uint16_t);

const event_fd_readwrite_t = struct({
  nbytes: filesize_t,
  flags: event_rw_flags_t
});

const event_t = struct({
  userdata: userdata_t,
  error: enumer<E>(uint16_t),
  type: eventtype_t,
  fd_readwrite: event_fd_readwrite_t
});
type event_t = TargetType<typeof event_t>;

export class SystemError extends Error {
  constructor(public readonly code: E, public readonly ignore = false) {
    super(`E${E[code]}`);
  }
}

const enum Whence {
  Current,
  End,
  Set
}

export const enum OpenFlags {
  Create = 1 << 0,
  Directory = 1 << 1,
  Exclusive = 1 << 2,
  Truncate = 1 << 3
}

export const enum FdFlags {
  Append = 1 << 0,
  DSync = 1 << 1,
  NonBlock = 1 << 2,
  RSync = 1 << 3,
  Sync = 1 << 4
}

interface In {
  read(len: number): Uint8Array | Promise<Uint8Array>;
}

interface Out {
  write(data: Uint8Array): void | Promise<void>;
}

export const bufferIn = (buffer: Uint8Array): In => {
  return {
    read: len => {
      let chunk = buffer.subarray(0, len);
      buffer = buffer.subarray(len);
      return chunk;
    }
  };
};

export const stringOut = (writeStr: (chunk: string) => void): Out => {
  let decoder = new TextDecoder();

  return {
    write: data => {
      writeStr(decoder.decode(data, { stream: true }));
    }
  };
};

export const lineOut = (writeLn: (chunk: string) => void): Out => {
  let lineBuf = '';

  return stringOut(chunk => {
    lineBuf += chunk;
    let lines = lineBuf.split('\n');
    lineBuf = lines.pop()!;
    for (let line of lines) {
      writeLn(line);
    }
  });
};

function unimplemented() {
  throw new SystemError(E.NOSYS);
}

class StringCollection {
  private readonly _offsets: Uint32Array;
  private readonly _buffer: string;

  constructor(strings: string[]) {
    this._offsets = new Uint32Array(strings.length);
    this._buffer = '';

    for (let [i, s] of strings.entries()) {
      this._offsets[i] = this._buffer.length;
      this._buffer += `${s}\0`;
    }
  }

  sizes_get(buf: ArrayBuffer, countPtr: ptr<number>, sizePtr: ptr<number>) {
    size_t.set(buf, countPtr, this._offsets.length);
    size_t.set(buf, sizePtr, this._buffer.length);
  }

  get(buf: ArrayBuffer, offsetsPtr: ptr<Uint32Array>, ptr: ptr<string>) {
    new Uint32Array(buf, offsetsPtr, this._offsets.length).set(
      this._offsets.map(offset => ptr + offset)
    );
    string.set(buf, ptr, this._buffer);
  }
}

function translateError(err: any): E {
  if (err instanceof SystemError) {
    // Warn about any error except the one we always expect.
    if (!err.ignore) {
      console.warn(err);
    }
    return err.code;
  }
  if (err instanceof DOMException) {
    let code;
    switch (err.name) {
      case 'NotFoundError':
        code = E.NOENT;
        break;
      case 'NotAllowedError':
      case 'DataCloneError':
      case 'SecurityError':
        code = E.ACCES;
        break;
      case 'InvalidModificationError':
        code = E.NOTEMPTY;
        break;
      case 'AbortError':
        code = E.CANCELED;
        break;
    }
    if (code) {
      console.warn(err);
      return code;
    }
  } else if (err instanceof TypeError || err instanceof RangeError) {
    console.warn(err);
    return E.INVAL;
  }
  throw err;
}

export function getWasiImports(
  {
    openFiles,
    stdin = { read: () => new Uint8Array() },
    stdout = lineOut(console.log),
    stderr = lineOut(console.error),
    args: args_ = [],
    env: env_ = {},
    abortSignal,
    getBuffer,
  }: {
    openFiles: OpenFiles;
    stdin?: In;
    stdout?: Out;
    stderr?: Out;
    args?: string[];
    env?: Record<string, string>;
    abortSignal?: AbortSignal;
    getBuffer: () => ArrayBuffer;
  }
) {
  const args = new StringCollection(args_);
  const env = new StringCollection(
    Object.entries(env_).map(([key, value]) => `${key}=${value}`)
  );

  const bindings: Record<string, (...args: any[]) => void | Promise<void>> = {
    fd_prestat_get: (fd: fd_t, prestatPtr: ptr<prestat_t>) => {
      prestat_t.set(getBuffer(), prestatPtr, {
        type: PreOpenType.Dir,
        nameLen: openFiles.getPreOpen(fd).path.length
      });
    },
    fd_prestat_dir_name: (
      fd: fd_t,
      pathPtr: ptr<string>,
      pathLen: number
    ) => {
      string.set(
        getBuffer(),
        pathPtr,
        openFiles.getPreOpen(fd).path,
        pathLen
      );
    },
    environ_sizes_get: (countPtr: ptr<number>, sizePtr: ptr<number>) =>
      env.sizes_get(getBuffer(), countPtr, sizePtr),
    environ_get: (environPtr: ptr<Uint32Array>, environBufPtr: ptr<string>) =>
      env.get(getBuffer(), environPtr, environBufPtr),
    args_sizes_get: (argcPtr: ptr<number>, argvBufSizePtr: ptr<number>) =>
      args.sizes_get(getBuffer(), argcPtr, argvBufSizePtr),
    args_get: (argvPtr: ptr<Uint32Array>, argvBufPtr: ptr<string>) =>
      args.get(getBuffer(), argvPtr, argvBufPtr),
    proc_exit: (code: number) => {
      throw new ExitStatus(code);
    },
    random_get: (bufPtr: ptr<Uint8Array>, bufLen: number) => {
      crypto.getRandomValues(
        new Uint8Array(getBuffer(), bufPtr, bufLen)
      );
    },
    path_open: async (
      dirFd: fd_t,
      dirFlags: number,
      pathPtr: ptr<string>,
      pathLen: number,
      oFlags: OpenFlags,
      fsRightsBase: bigint,
      fsRightsInheriting: bigint,
      fsFlags: FdFlags,
      fdPtr: ptr<fd_t>
    ) => {
      if (fsFlags & FdFlags.NonBlock) {
        console.warn(
          'Asked for non-blocking mode while opening the file, falling back to blocking one.'
        );
        fsFlags &= ~FdFlags.NonBlock;
      }
      if (fsFlags != 0) {
        unimplemented();
      }
      fd_t.set(
        getBuffer(),
        fdPtr,
        await openFiles.open(
          openFiles.getPreOpen(dirFd),
          string.get(getBuffer(), pathPtr, pathLen),
          oFlags
        )
      );
    },
    fd_fdstat_set_flags: (fd: fd_t, flags: FdFlags) => unimplemented(),
    fd_close: (fd: fd_t) => openFiles.close(fd),
    fd_read: async (
      fd: fd_t,
      iovsPtr: ptr<iovec_t>,
      iovsLen: number,
      nreadPtr: ptr<number>
    ) => {
      let input = fd === 0 ? stdin : openFiles.get(fd).asFile();
      await _forEachIoVec(getBuffer, iovsPtr, iovsLen, nreadPtr, async buf => {
        let chunk = await input.read(buf.length);
        buf.set(chunk);
        return chunk.length;
      }, abortSignal);
    },
    fd_write: async (
      fd: fd_t,
      iovsPtr: ptr<iovec_t>,
      iovsLen: number,
      nwrittenPtr: ptr<number>
    ) => {
      let out: Out;
      switch (fd) {
        case 1: {
          out = stdout;
          break;
        }
        case 2: {
          out = stderr;
          break;
        }
        default: {
          out = openFiles.get(fd).asFile();
          break;
        }
      }
      await _forEachIoVec(getBuffer, iovsPtr, iovsLen, nwrittenPtr, async data => {
        await out.write(data);
        return data.length;
      }, abortSignal);
    },
    fd_fdstat_get: async (fd: fd_t, fdstatPtr: ptr<fdstat_t>) => {
      let filetype;
      if (fd < FIRST_PREOPEN_FD) {
        filetype = FileType.CharacterDevice;
      } else if (openFiles.get(fd).isFile) {
        filetype = FileType.RegularFile;
      } else {
        filetype = FileType.Directory;
      }
      fdstat_t.set(getBuffer(), fdstatPtr, {
        filetype,
        flags: 0,
        rightsBase: /* anything */ -1n,
        rightsInheriting: /* anything but symlink */ ~(1n << 24n)
      });
    },
    path_create_directory: async (
      dirFd: fd_t,
      pathPtr: ptr<string>,
      pathLen: number
    ) =>
      openFiles
        .getPreOpen(dirFd)
        .getFileOrDir(
          string.get(getBuffer(), pathPtr, pathLen),
          FileOrDir.Dir,
          OpenFlags.Create | OpenFlags.Directory | OpenFlags.Exclusive
        )
        .then(() => {}),
    path_rename: async (
      oldDirFd: fd_t,
      oldPathPtr: ptr<string>,
      oldPathLen: number,
      newDirFd: fd_t,
      newPathPtr: ptr<string>,
      newPathLen: number
    ) => unimplemented(),
    path_remove_directory: (
      dirFd: fd_t,
      pathPtr: ptr<string>,
      pathLen: number
    ) =>
      openFiles
        .getPreOpen(dirFd)
        .delete(string.get(getBuffer(), pathPtr, pathLen)),
    fd_readdir: async (
      fd: fd_t,
      bufPtr: ptr<dirent_t>,
      bufLen: number,
      cookie: bigint,
      bufUsedPtr: ptr<number>
    ) => {
      const initialBufPtr = bufPtr;
      let openDir = openFiles.get(fd).asDir();
      let pos = Number(cookie);
      let entries = openDir.getEntries(pos);
      for await (let handle of entries) {
        if (abortSignal?.aborted) {
          throw new SystemError(E.CANCELED)
        }
        // this._checkAbort();
        let { name } = handle;
        let itemSize = dirent_t.size + name.length;
        if (bufLen < itemSize) {
          entries.revert(handle);
          break;
        }
        dirent_t.set(getBuffer(), bufPtr, {
          next: ++cookie,
          ino: 0n, // TODO
          nameLen: name.length,
          type:
            handle.kind === 'file' ? FileType.RegularFile : FileType.Directory
        });
        string.set(
          getBuffer(),
          (bufPtr + dirent_t.size) as ptr<string>,
          name
        );
        bufPtr = (bufPtr + itemSize) as ptr<dirent_t>;
        bufLen -= itemSize;
      }
      size_t.set(getBuffer(), bufUsedPtr, bufPtr - initialBufPtr);
    },
    path_readlink: (
      dirFd: fd_t,
      pathPtr: number,
      pathLen: number,
      bufPtr: number,
      bufLen: number,
      bufUsedPtr: number
    ) => unimplemented(),
    path_filestat_get: async (
      dirFd: fd_t,
      flags: any,
      pathPtr: ptr<string>,
      pathLen: number,
      filestatPtr: ptr<filestat_t>
    ) => {
      let handle = await openFiles
        .getPreOpen(dirFd)
        .getFileOrDir(
          string.get(getBuffer(), pathPtr, pathLen),
          FileOrDir.Any
        );
      return _getFileStat(
        getBuffer,
        handle.kind === 'file' ? await handle.getFile() : undefined,
        filestatPtr
      );
    },
    fd_seek: async (
      fd: fd_t,
      offset: bigint,
      whence: Whence,
      filesizePtr: ptr<bigint>
    ) => {
      let openFile = openFiles.get(fd).asFile();
      let base: number;
      switch (whence) {
        case Whence.Current:
          base = openFile.position;
          break;
        case Whence.End:
          base = (await openFile.getFile()).size;
          break;
        case Whence.Set:
          base = 0;
          break;
      }
      openFile.position = base + Number(offset);
      uint64_t.set(getBuffer(), filesizePtr, BigInt(openFile.position));
    },
    fd_tell: (fd: fd_t, offsetPtr: ptr<bigint>) => {
      uint64_t.set(
        getBuffer(),
        offsetPtr,
        BigInt(openFiles.get(fd).asFile().position)
      );
    },
    fd_filestat_get: async (fd: fd_t, filestatPtr: ptr<filestat_t>) => {
      let openFile = openFiles.get(fd);
      _getFileStat(
        getBuffer,
        openFile.isFile ? await openFile.getFile() : undefined,
        filestatPtr
      );
    },
    path_unlink_file: (dirFd: fd_t, pathPtr: ptr<string>, pathLen: number) =>
      openFiles
        .getPreOpen(dirFd)
        .delete(string.get(getBuffer(), pathPtr, pathLen)),
    poll_oneoff: async (
      subscriptionPtr: ptr<subscription_t>,
      eventsPtr: ptr<event_t>,
      subscriptionsNum: number,
      eventsNumPtr: ptr<number>
    ) => {
      if (subscriptionsNum === 0) {
        throw new RangeError('Polling requires at least one subscription');
      }
      let eventsNum = 0;
      const addEvent = (event: Partial<event_t>) => {
        Object.assign(event_t.get(getBuffer(), eventsPtr), event);
        eventsNum++;
        eventsPtr = (eventsPtr + event_t.size) as ptr<event_t>;
      };
      let clockEvents: {
        timeout: number;
        extra: number;
        userdata: bigint;
      }[] = [];
      for (let i = 0; i < subscriptionsNum; i++) {
        let { userdata, union } = subscription_t.get(
          getBuffer(),
          subscriptionPtr
        );
        subscriptionPtr = (subscriptionPtr + subscription_t.size) as ptr<
          subscription_t
        >;
        switch (union.tag) {
          case EventType.Clock: {
            let timeout = Number(union.data.timeout) / 1_000_000;
            if (union.data.flags === SubclockFlags.Absolute) {
              let origin =
                union.data.id === ClockId.Realtime ? Date : performance;
              timeout -= origin.now();
            }
            // This is not completely correct, since setTimeout doesn't give the required precision for monotonic clock.
            clockEvents.push({
              timeout,
              extra: Number(union.data.precision) / 1_000_000,
              userdata
            });
            break;
          }
          default: {
            addEvent({
              userdata,
              error: E.NOSYS,
              type: union.tag,
              fd_readwrite: {
                nbytes: 0n,
                flags: EventRwFlags.None
              }
            });
            break;
          }
        }
      }
      if (!eventsNum) {
        clockEvents.sort((a, b) => a.timeout - b.timeout);
        let wait = clockEvents[0].timeout + clockEvents[0].extra;
        let matchingCount = clockEvents.findIndex(
          item => item.timeout > wait
        );
        matchingCount =
          matchingCount === -1 ? clockEvents.length : matchingCount;
        await _wait(clockEvents[matchingCount - 1].timeout, abortSignal);
        for (let i = 0; i < matchingCount; i++) {
          addEvent({
            userdata: clockEvents[i].userdata,
            error: E.SUCCESS,
            type: EventType.Clock
          });
        }
      }
      size_t.set(getBuffer(), eventsNumPtr, eventsNum);
    },
    path_link: (
      oldDirFd: fd_t,
      oldFlags: number,
      oldPathPtr: ptr<string>,
      oldPathLen: number,
      newFd: fd_t,
      newPathPtr: ptr<string>,
      newPathLen: number
    ) => unimplemented(),
    fd_datasync: (fd: fd_t) => openFiles.get(fd).asFile().flush(),
    fd_sync: async (fd: fd_t) => {
      let openFile = openFiles.get(fd);
      if (openFile.isFile) {
        await openFile.flush();
      }
    },
    fd_filestat_set_size: async (fd: fd_t, newSize: bigint) =>
      openFiles.get(fd).asFile().setSize(Number(newSize)),
    fd_renumber: (from: fd_t, to: fd_t) => openFiles.renumber(from, to),
    path_symlink: (oldPath: ptr<string>, fd: fd_t, newPath: ptr<string>) =>
      unimplemented(),
    clock_time_get: (
      id: ClockId,
      precision: bigint,
      resultPtr: ptr<bigint>
    ) => {
      let origin = id === ClockId.Realtime ? Date : performance;
      timestamp_t.set(
        getBuffer(),
        resultPtr,
        BigInt(Math.round(origin.now() * 1_000_000))
      );
    },
    clock_res_get: (id: ClockId, resultPtr: ptr<bigint>) => {
      timestamp_t.set(getBuffer(), resultPtr, /* 1ms */ 1_000_000n);
    }
  };

  return new Proxy(bindings, {
    get: (target, name, receiver) => {
      let value = Reflect.get(target, name, receiver);
      if (typeof name !== 'string' || typeof value !== 'function') {
        return value;
      }
      return async (...args: any[]) => {
        try {
          await value(...args);
          if (abortSignal?.aborted) { throw new SystemError(E.CANCELED) };
          return E.SUCCESS;
        } catch (err) {
          return translateError(err);
        }
      };
    }
  });
}


async function _forEachIoVec(
  getBuffer: () => ArrayBuffer,
  iovsPtr: ptr<iovec_t>,
  iovsLen: number,
  handledPtr: ptr<number>,
  cb: (buf: Uint8Array) => Promise<number>,
  abortSignal: AbortSignal | undefined,
) {
  let totalHandled = 0;
  for (let i = 0; i < iovsLen; i++) {
    let iovec = iovec_t.get(getBuffer(), iovsPtr);
    let buf = new Uint8Array(getBuffer(), iovec.bufPtr, iovec.bufLen);
    let handled = await cb(buf);
    if (abortSignal?.aborted) {
      throw new SystemError(E.CANCELED);
    }
    totalHandled += handled;
    if (handled < iovec.bufLen) {
      break;
    }
    iovsPtr = (iovsPtr + iovec_t.size) as ptr<iovec_t>;
  }
  size_t.set(getBuffer(), handledPtr, totalHandled);
}

function _getFileStat(getBuffer: () => ArrayBuffer, file: File | undefined, filestatPtr: ptr<filestat_t>) {
  let size = 0n;
  let time = 0n;
  if (file) {
    size = BigInt(file.size);
    time = BigInt(file.lastModified) * 1_000_000n;
  }
  filestat_t.set(getBuffer(), filestatPtr, {
    dev: 0n,
    ino: 0n, // TODO
    filetype: file ? FileType.RegularFile : FileType.Directory,
    nlink: 0n,
    size,
    accessTime: time,
    modTime: time,
    changeTime: time
  });
}

function _wait(ms: number, abortSignal: AbortSignal | undefined) {
  return new Promise((resolve, reject) => {
    let id = setTimeout(resolve, ms);
    abortSignal?.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new SystemError(E.CANCELED));
    });
  });
}
