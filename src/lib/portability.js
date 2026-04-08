import fs from "node:fs";
import path from "node:path";
import { MANAGER_FILES } from "./paths.js";
import { backupFileIfExists, ensureDir, fileExists, writeJsonAtomic } from "./fs-util.js";

const EXPORT_KEYS = ["codex", "claude", "gemini", "opencode", "mcp", "sync"];

function formatStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes()
  )}${pad(d.getSeconds())}`;
}

export function exportState(targetDir) {
  const outputDir = path.resolve(targetDir || `100xlabsapi-export-${formatStamp()}`);
  ensureDir(outputDir);

  const copiedFiles = [];
  for (const key of EXPORT_KEYS) {
    const source = MANAGER_FILES[key];
    if (!fileExists(source)) continue;
    const name = path.basename(source);
    const destination = path.join(outputDir, name);
    fs.copyFileSync(source, destination);
    copiedFiles.push(name);
  }

  writeJsonAtomic(path.join(outputDir, "manifest.json"), {
    createdAt: new Date().toISOString(),
    app: "100xlabsapi",
    version: "1.0.0-cleanroom",
    files: copiedFiles,
  });

  return { outputDir, copiedFiles };
}

export function importState(sourceDir) {
  const inputDir = path.resolve(sourceDir || ".");
  if (!fileExists(inputDir)) throw new Error(`Import directory not found: ${inputDir}`);

  const copied = [];
  const backups = [];

  for (const key of EXPORT_KEYS) {
    const filename = path.basename(MANAGER_FILES[key]);
    const source = path.join(inputDir, filename);
    if (!fileExists(source)) continue;
    const backup = backupFileIfExists(MANAGER_FILES[key]);
    if (backup) backups.push(backup);
    ensureDir(path.dirname(MANAGER_FILES[key]));
    fs.copyFileSync(source, MANAGER_FILES[key]);
    copied.push(filename);
  }

  if (!copied.length) {
    throw new Error("No importable files found. Expected *.json manager files.");
  }

  return { inputDir, copied, backups };
}
