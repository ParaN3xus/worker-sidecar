# Worker Sidecar

[Cloudflare Workers](https://workers.cloudflare.com/) are great. WebAssembly is great. But do you know what isn’t great? Your WASM binary is too large, while the Cloudflare free plan only allows Workers smaller than 3MB.

Want to manually compress your WASM, or fetch the WASM from a URL and load it dynamically inside the Worker? No - you’ll be greeted with the merciless:

> "WASM code generation disallowed by embedder"

So what can we do instead?

The answer is: upload a tiny WASM executor, then use that executor (not Cloudflare's built-in runtime, so it has none of those restrictions) to load and execute your real WASM module.

Yes, this will significantly increase CPU time usage, but that's better than being unable to deploy the Worker at all. And that's what **`worker-sidecar`** is about.

To demonstrate the idea, this project includes a Worker capable of rendering [Typst](https://typst.app/) code:
[Typst Worker Demo](https://typst-worker.paran3x.us/). The [Typst compiler WASM](https://github.com/ParaN3xus/worker-sidecar/releases/tag/guest_wasm) is around 20MB, yet we successfully got it running inside a Cloudflare Worker.

## How It Works

There are two WASM modules:

- `sidecar-host`: the bundled Worker WASM module. It is essentially a [wasmi](https://github.com/wasmi-labs/wasmi) executor responsible for running the actual WASM module.
- Guest WASM: the dynamically loaded WASM module. In our example, this is [`sidecar-typst-guest`](https://github.com/ParaN3xus/worker-sidecar/tree/main/demo), which contains a full Typst compiler.

For communication between the sidecar host and the guest WASM, we use the same [WASM minimal protocol](https://typst.app/docs/reference/foundations/plugin/#protocol) adopted by [Typst WASM plugins](https://typst.app/docs/reference/foundations/plugin/). It is simple and effective.

## Demo

I deployed a fully functional Typst compiler running inside a Cloudflare Worker: [Typst Worker Demo](https://typst-worker.paran3x.us/)

## Build

Use `pnpm build` to build the Worker.
This includes:

- the sidecar host WASM
- the TypeScript code responsible for loading the guest WASM and exposing the WASM functionality

Use `demo/publish-guest.sh` to build the guest WASM and upload it wherever you want.

In the demo deployment, the guest WASM is hosted through [GitHub Releases](https://github.com/ParaN3xus/worker-sidecar/releases/tag/guest_wasm). The upload location must match the download URL configured in the TypeScript code.

## License

MIT.
