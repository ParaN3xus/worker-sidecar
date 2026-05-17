import * as esbuild from "esbuild";

await esbuild.build({
	entryPoints: ["demo/src/worker.ts"],
	outfile: "demo/build/index.js",
	bundle: true,
	minify: true,
	format: "esm",
	platform: "browser",
	target: "es2022",
	external: ["./worker_sidecar.wasm"],
});
