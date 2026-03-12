import { build } from "esbuild";

await build({
  entryPoints: ["server/_core/vercel-trpc-handler.ts"],
  outfile: "api/trpc/_handler.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: false,
  logLevel: "info",
});
