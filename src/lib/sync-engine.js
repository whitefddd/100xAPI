import path from "node:path";
import { decryptText, encryptText } from "./crypto-util.js";
import { MANAGER_FILES, REMOTE_SYNC_FOLDER, TOOL_NAMES } from "./paths.js";
import {
  backupFileIfExists,
  fileExists,
  readJson,
  readText,
  writeTextAtomic,
} from "./fs-util.js";
import {
  createWebDavClient,
  normalizeSyncRemoteDir,
  updateSyncTimestamp,
} from "./sync-store.js";
import { mergeProviderConfig } from "./provider-store.js";
import { mergeMcpConfig } from "./mcp-store.js";

const SYNC_KEYS = ["codex", "claude", "gemini", "opencode", "mcp"];

function remoteBaseDir(config) {
  const base = normalizeSyncRemoteDir(config.remoteDir || "/");
  const raw = `${base}/${REMOTE_SYNC_FOLDER}`.replace(/\/+/g, "/");
  return raw.length > 1 && raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function remoteFilePath(config, key) {
  const filename = path.basename(MANAGER_FILES[key]);
  return `${remoteBaseDir(config)}/${filename}`.replace(/\/+/g, "/");
}

async function ensureRemoteRoot(client, config) {
  const root = remoteBaseDir(config);
  if (!(await client.exists(root))) {
    await client.createDirectory(root, { recursive: true });
  }
  return root;
}

function parseJsonOrThrow(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Remote ${label} is not valid JSON.`);
  }
}

export async function uploadSyncData(config, syncPassword) {
  const client = createWebDavClient(config);
  const root = await ensureRemoteRoot(client, config);
  let uploaded = 0;

  for (const key of SYNC_KEYS) {
    const localPath = MANAGER_FILES[key];
    if (!fileExists(localPath)) continue;
    const plain = readText(localPath, "");
    if (!plain.trim()) continue;
    const encrypted = encryptText(plain, syncPassword || "");
    await client.putFileContents(remoteFilePath(config, key), encrypted, { overwrite: true });
    uploaded += 1;
  }

  if (!uploaded) {
    throw new Error("No local manager files found to upload.");
  }

  updateSyncTimestamp();
  return { uploaded, remoteRoot: root };
}

export async function downloadSyncData(config, syncPassword) {
  const client = createWebDavClient(config);
  const backups = [];
  let downloaded = 0;

  for (const key of SYNC_KEYS) {
    const remotePath = remoteFilePath(config, key);
    if (!(await client.exists(remotePath))) continue;
    const payload = await client.getFileContents(remotePath, { format: "text" });
    const decrypted = decryptText(String(payload || ""), syncPassword || "");
    parseJsonOrThrow(decrypted, key);
    const localPath = MANAGER_FILES[key];
    const backup = backupFileIfExists(localPath);
    if (backup) backups.push(backup);
    writeTextAtomic(localPath, decrypted.endsWith("\n") ? decrypted : `${decrypted}\n`);
    downloaded += 1;
  }

  if (!downloaded) {
    throw new Error("No remote manager files found to download.");
  }

  updateSyncTimestamp();
  return { downloaded, backups };
}

function readConfigByKey(key) {
  return readJson(MANAGER_FILES[key], key === "mcp" ? { servers: [], managedServerNames: {} } : { providers: [] });
}

async function readRemoteConfigByKey(client, config, key, syncPassword) {
  const remotePath = remoteFilePath(config, key);
  if (!(await client.exists(remotePath))) return null;
  const payload = await client.getFileContents(remotePath, { format: "text" });
  const decrypted = decryptText(String(payload || ""), syncPassword || "");
  return parseJsonOrThrow(decrypted, key);
}

function mergeByKey(key, localConfig, remoteConfig) {
  if (!remoteConfig) return localConfig;
  if (key === "mcp") {
    return mergeMcpConfig(localConfig, remoteConfig);
  }
  return mergeProviderConfig(localConfig, remoteConfig);
}

export async function mergeSyncData(config, syncPassword) {
  const client = createWebDavClient(config);
  await ensureRemoteRoot(client, config);

  let changed = 0;
  const backups = [];

  for (const key of SYNC_KEYS) {
    const localConfig = readConfigByKey(key);
    const remoteConfig = await readRemoteConfigByKey(client, config, key, syncPassword);
    const mergedConfig = mergeByKey(key, localConfig, remoteConfig);

    const before = JSON.stringify(localConfig);
    const after = JSON.stringify(mergedConfig);
    if (before !== after) {
      const backup = backupFileIfExists(MANAGER_FILES[key]);
      if (backup) backups.push(backup);
      writeTextAtomic(MANAGER_FILES[key], `${JSON.stringify(mergedConfig, null, 2)}\n`);
      changed += 1;
    }

    const encrypted = encryptText(JSON.stringify(mergedConfig, null, 2), syncPassword || "");
    await client.putFileContents(remoteFilePath(config, key), encrypted, { overwrite: true });
  }

  updateSyncTimestamp();
  return { changed, backups };
}

export async function getSyncStatus(config) {
  const local = {};
  for (const key of SYNC_KEYS) {
    const exists = fileExists(MANAGER_FILES[key]);
    const content = exists ? readJson(MANAGER_FILES[key], {}) : null;
    local[key] = {
      exists,
      providers: Array.isArray(content?.providers) ? content.providers.length : undefined,
      servers: Array.isArray(content?.servers) ? content.servers.length : undefined,
    };
  }

  if (!config) {
    return {
      configured: false,
      tools: TOOL_NAMES,
      local,
      remote: null,
    };
  }

  const client = createWebDavClient(config);
  const remote = {};
  for (const key of SYNC_KEYS) {
    remote[key] = await client.exists(remoteFilePath(config, key));
  }

  return {
    configured: true,
    lastSync: config.lastSync || null,
    remoteDir: config.remoteDir || "/",
    local,
    remote,
  };
}
