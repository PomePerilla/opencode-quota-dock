import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(homedir(), ".config", "opencode", "opencode.json");
const guiBuild = await readFile(join(root, "dist", "gui-experimental.cjs"));
const buildRevision = createHash("sha256").update(await readFile(join(root, "dist", "server.js"))).update(guiBuild).digest("hex").slice(0, 16);
let original;
try { original = await readFile(target, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
let config;
try { config = original ? JSON.parse(original) : {}; }
catch { throw new Error("Global config uses comments or invalid JSON. Add the local plugin manually; no file was changed."); }
const entry = root.replaceAll("\\", "/");
if (!Array.isArray(config.plugins) && config.plugins !== undefined) throw new Error("Invalid plugins configuration; no file was changed.");
const existingIndex = (config.plugins ?? []).findIndex(item => (typeof item === "string" ? item : item.package)?.replaceAll("\\", "/") === entry);
const existingEntry = existingIndex >= 0 ? config.plugins[existingIndex] : undefined;
if (!existingEntry || typeof existingEntry === "string" || existingEntry.options?.buildRevision !== buildRevision) {
  await mkdir(join(root, ".local"), { recursive: true });
  if (original) await copyFile(target, join(root, ".local", `opencode-config-before-install-${Date.now()}.json`));
  const updatedEntry = { package: entry, options: { ...(typeof existingEntry === "object" ? existingEntry.options : {}), buildRevision } };
  config.plugins = [...(config.plugins ?? [])];
  if (existingIndex >= 0) config.plugins[existingIndex] = updatedEntry; else config.plugins.push(updatedEntry);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(config, null, 2)}\n`);
}
console.log("Local plugin registered; existing plugin entries preserved. Restart OpenCode Desktop if its GUI has not reloaded.");
