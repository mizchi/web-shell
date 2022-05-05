import type { FormatApi } from "./format";
import type { MinifyApi } from "./minify";
import { wrap } from "comlink";

export const format = wrap<FormatApi>(
  new Worker(
    new URL("./format", import.meta.url), { type: 'module' }
  )
);
export const minify = wrap<MinifyApi>(
  new Worker(new URL("./minify", import.meta.url), { type: 'module' }));
