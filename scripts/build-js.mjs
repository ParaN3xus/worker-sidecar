import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/worker.ts"],
  outfile: "build/index.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  external: ["./index_bg.wasm"],
});

