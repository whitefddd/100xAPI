import fs from "node:fs";
import path from "node:path";
import { timestampForFile } from "./paths.js";

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function fileExists(filePath) {
  return fs.existsSync(filePath);
}

export function backupFileIfExists(filePath) {
  if (!fileExists(filePath)) return null;
  const backupPath = `${filePath}.bak.${timestampForFile()}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

export function readText(filePath, fallback = "") {
  if (!fileExists(filePath)) return fallback;
  return fs.readFileSync(filePath, "utf8");
}

export function readJson(filePath, fallback = {}) {
  if (!fileExists(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function stripJsonComments(input) {
  let output = "";
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
        output += char;
      }
      continue;
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        i += 1;
      }
      continue;
    }

    if (!inString && char === "/" && next === "/") {
      lineComment = true;
      i += 1;
      continue;
    }

    if (!inString && char === "/" && next === "*") {
      blockComment = true;
      i += 1;
      continue;
    }

    output += char;

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    }
  }

  return output;
}

export function readJsonc(filePath, fallback = {}) {
  if (!fileExists(filePath)) return fallback;
  try {
    const text = fs.readFileSync(filePath, "utf8");
    return JSON.parse(stripJsonComments(text));
  } catch {
    return fallback;
  }
}

export function writeTextAtomic(filePath, content) {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  fs.writeFileSync(tempPath, content, { encoding: "utf8" });
  fs.renameSync(tempPath, filePath);
}

export function writeJsonAtomic(filePath, data) {
  writeTextAtomic(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

export function parseEnv(text) {
  const result = {};
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    result[key] = value;
  }
  return result;
}

export function stringifyEnv(envObj) {
  const keys = Object.keys(envObj).sort();
  return `${keys.map((key) => `${key}=${String(envObj[key] ?? "")}`).join("\n")}\n`;
}

export function maskSecret(value, keep = 4) {
  if (!value) return "(empty)";
  if (value.length <= keep * 2) return `${"*".repeat(value.length)}`;
  return `${value.slice(0, keep)}${"*".repeat(Math.max(4, value.length - keep * 2))}${value.slice(
    -keep
  )}`;
}
