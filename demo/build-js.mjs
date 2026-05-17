import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["demo/worker.ts"],
  outfile: "demo/build/index.js",
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  external: ["./index_bg.wasm"],
});
