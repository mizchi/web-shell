import { expose } from "comlink";
import { minify } from "terser";

// export const minify = async () => {

const api = {
  async minify(code: string) {
    const out = await minify(code, {
      module: true,
      // compress: {
      //   drop_console: true,
      // },
      // mangle: {
      // }
    });
    return out.code;
  }
}
expose(api);

export type MinifyApi = typeof api;
