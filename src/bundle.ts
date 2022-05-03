import { InputOptions, OutputOptions, Plugin, rollup, RollupOptions, RollupOutput } from "rollup";
import path from "path-browserify";
import { FileSystem } from "./fs";
import { transformSync } from "@mizchi/mints";

// import {} from "./"


export async function bundle(fs: FileSystem, opts: InputOptions & { output?: OutputOptions }) {
  const { output, ...input } = opts;
  console.log('bundle', opts);
  const rolled = await rollup({
    ...input,
    input: input.input!,
    plugins: [
      ...input.plugins ?? [],
      mints(),
      fs_plugin(fs),
    ],
  });
  return rolled.generate(output ?? {});
}

const mints = () => {
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
