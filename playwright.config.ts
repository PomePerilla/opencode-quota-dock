import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "tests/ui", fullyParallel: false, workers: 1, use: { baseURL: "http://127.0.0.1:4317", channel: "msedge", headless: true }, webServer: { command: "npm run preview", url: "http://127.0.0.1:4317", reuseExistingServer: true }, reporter: "list" });
