import path from "node:path";
import { createClient } from "webdav";
import { MANAGER_FILES } from "./paths.js";
import { ensureDir, readJson, writeJsonAtomic } from "./fs-util.js";

function normalizeRemoteDir(value) {
  const text = String(value || "/").trim() || "/";
  const withPrefix = text.startsWith("/") ? text : `/${text}`;
  return withPrefix.replace(/\/+$/, "") || "/";
}

export function loadSyncConfig() {
  const config = readJson(MANAGER_FILES.sync, null);
  if (!config) return null;
  return {
    ...config,
    remoteDir: normalizeRemoteDir(config.remoteDir || "/"),
    authType: config.authType === "digest" ? "digest" : "password",
  };
}

export function saveSyncConfig(config) {
  const next = {
    ...config,
    remoteDir: normalizeRemoteDir(config.remoteDir || "/"),
    authType: config.authType === "digest" ? "digest" : "password",
  };
  ensureDir(path.dirname(MANAGER_FILES.sync));
  writeJsonAtomic(MANAGER_FILES.sync, next);
  return next;
}

export function updateSyncTimestamp() {
  const current = loadSyncConfig();
  if (!current) return null;
  current.lastSync = new Date().toISOString();
  saveSyncConfig(current);
  return current.lastSync;
}

export function createWebDavClient(config) {
  if (!config?.webdavUrl || !config?.username || !config?.password) {
    throw new Error("WebDAV config is incomplete. Run: 100xlabsapi sync config");
  }

  return createClient(config.webdavUrl, {
    username: config.username,
    password: config.password,
    digest: config.authType === "digest",
  });
}

export async function testSyncConnection(config) {
  const client = createWebDavClient(config);
  const target = `${normalizeRemoteDir(config.remoteDir || "/")}`;
  await client.getDirectoryContents(target).catch(async () => {
    await client.createDirectory(target, { recursive: true });
  });
  return true;
}

export function normalizeSyncRemoteDir(value) {
  return normalizeRemoteDir(value);
}
