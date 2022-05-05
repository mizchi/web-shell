import { expose } from "comlink";
import prettier from "prettier/standalone";
import babel from "prettier/parser-babel";

function format(code: string) {
  return prettier.format(code, {
    parser: "babel-ts",
    plugins: [babel],
  });
}

const api = { format };
export type FormatApi = typeof api;
expose(api);
// expos 