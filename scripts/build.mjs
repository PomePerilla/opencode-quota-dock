import { build as esbuild } from "esbuild";
import { build as vite } from "vite";
import { mkdir } from "node:fs/promises";
await mkdir("dist", { recursive: true });
await mkdir("artifacts", { recursive: true });
await esbuild({ entryPoints: { server: "src/index.ts", rpc: "src/rpc.ts" }, outdir: "dist", bundle: true, platform: "node", format: "esm", target: "node22", packages: "external", sourcemap: false });
await vite({ configFile: "vite.config.ts" });
