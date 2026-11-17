import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
export default defineConfig({ root: "preview", plugins: [solid()], server: { port: 4317, strictPort: true } });
