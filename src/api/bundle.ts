import { InputOptions, OutputOptions, Plugin, rollup } from "rollup";
import path from "path-browserify";
import { FileSystem } from "../fs";
import { transformSync } from "@mizchi/mints";
import { minify } from "../workers/mod"

export async function bundle(fs: FileSystem, opts: InputOptions & { output?: OutputOptions }) {
  const { output, ...input } = opts;
  console.log('bundle', opts);
  const rolled = await rollup({
    ...input,
    input: input.input!,
    plugins: [
      ...input.plugins ?? [],
      mints_plugin(),
      fs_plugin(fs),
      minify_plugin(),
    ],
  });
  return rolled.generate(output ?? {});
}

const mints_plugin = () => {
  return ({
    name: 'mints',
    transform(code, id) {
      if (id.endsWith('.ts') || id.endsWith('.tsx')) {
        const transformed = transformSync(code, {});
        if (!transformed.error) return transformed.code;
      }
    }
  }) as Plugin
}

const fs_plugin = (fs: FileSystem) => {
  return {
    name: 'fs',
    async resolveId(id, importer) {
      const import_dir = importer ? path.dirname(importer) : '/';
      const SEARCH_EXT = ['', '.ts', '.tsx', '.js', '.json'];
      for (const ext of SEARCH_EXT) {
        const resolved = path.resolve(import_dir, id + ext);
        if (await fs.exists(resolved)) {
          return resolved;
        }
      }
    },
    load(id) {
      return fs.readFile(id);
    }
  } as Plugin
}

const minify_plugin = () => {
  return {
    name: 'minify',
    async transform(code, id) {
      return await minify.minify(code);
    }
  } as Plugin
}
