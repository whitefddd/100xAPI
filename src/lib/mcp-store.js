import path from "node:path";
import { MANAGER_FILES, TARGET_PATHS } from "./paths.js";
import {
  backupFileIfExists,
  ensureDir,
  readJson,
  writeJsonAtomic,
} from "./fs-util.js";

const DEFAULT_MANAGED = {
  claude: [],
  codex: [],
  gemini: [],
  opencode: [],
};

function now() {
  return Date.now();
}

function makeId() {
  return `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase();
}

function ensureMcpShape(config) {
  const next = config && typeof config === "object" ? config : {};
  if (!Array.isArray(next.servers)) next.servers = [];
  if (!next.managedServerNames || typeof next.managedServerNames !== "object") {
    next.managedServerNames = structuredClone(DEFAULT_MANAGED);
  } else {
    for (const key of Object.keys(DEFAULT_MANAGED)) {
      if (!Array.isArray(next.managedServerNames[key])) next.managedServerNames[key] = [];
    }
  }
  return next;
}

export function loadMcpConfig() {
  return ensureMcpShape(readJson(MANAGER_FILES.mcp, {}));
}

export function saveMcpConfig(config) {
  ensureDir(path.dirname(MANAGER_FILES.mcp));
  writeJsonAtomic(MANAGER_FILES.mcp, ensureMcpShape(config));
}

function findServer(config, query) {
  if (!query) return null;
  const byName = normalizeName(query);
  return (
    config.servers.find((item) => item.id === query) ||
    config.servers.find((item) => normalizeName(item.name) === byName) ||
    null
  );
}

export function listMcpServers() {
  return loadMcpConfig().servers;
}

export function addMcpServer(payload) {
  const config = loadMcpConfig();
  const name = String(payload.name || "").trim();
  if (!name) throw new Error("MCP server name is required.");

  const exists = config.servers.some((item) => normalizeName(item.name) === normalizeName(name));
  if (exists) throw new Error(`MCP server already exists: ${name}`);

  const time = now();
  const server = {
    id: makeId(),
    name,
    command: String(payload.command || "").trim() || "npx",
    args: Array.isArray(payload.args) ? payload.args : [],
    env: payload.env && typeof payload.env === "object" ? payload.env : undefined,
    enabledApps: Array.isArray(payload.enabledApps) && payload.enabledApps.length ? payload.enabledApps : ["claude"],
    createdAt: time,
    lastModified: time,
  };
  config.servers.push(server);
  saveMcpConfig(config);
  return server;
}

export function editMcpServer(query, patch) {
  const config = loadMcpConfig();
  const server = findServer(config, query);
  if (!server) throw new Error(`MCP server not found: ${query}`);

  if (patch.name !== undefined) {
    const nextName = String(patch.name || "").trim();
    if (!nextName) throw new Error("MCP server name cannot be empty.");
    const conflict = config.servers.some(
      (item) => item.id !== server.id && normalizeName(item.name) === normalizeName(nextName)
    );
    if (conflict) throw new Error(`MCP server already exists: ${nextName}`);
    server.name = nextName;
  }

  if (patch.command !== undefined) server.command = String(patch.command || "").trim();
  if (patch.args !== undefined) server.args = Array.isArray(patch.args) ? patch.args : [];
  if (patch.env !== undefined) server.env = patch.env && typeof patch.env === "object" ? patch.env : undefined;
  if (patch.enabledApps !== undefined) {
    server.enabledApps = Array.isArray(patch.enabledApps) && patch.enabledApps.length ? patch.enabledApps : ["claude"];
  }
  server.lastModified = now();
  saveMcpConfig(config);
  return server;
}

export function removeMcpServer(query) {
  const config = loadMcpConfig();
  const server = findServer(config, query);
  if (!server) throw new Error(`MCP server not found: ${query}`);

  config.servers = config.servers.filter((item) => item.id !== server.id);
  for (const app of Object.keys(config.managedServerNames)) {
    config.managedServerNames[app] = (config.managedServerNames[app] || []).filter(
      (name) => normalizeName(name) !== normalizeName(server.name)
    );
  }
  saveMcpConfig(config);
  return server;
}

function mcpEntryFromServer(server) {
  const entry = {
    command: server.command,
    args: Array.isArray(server.args) ? server.args : [],
  };
  if (server.env && typeof server.env === "object" && Object.keys(server.env).length) {
    entry.env = server.env;
  }
  return entry;
}

function targetPathByApp(app) {
  if (app === "claude") return TARGET_PATHS.claudeSettings;
  if (app === "gemini") return TARGET_PATHS.geminiSettings;
  return null;
}

function applyMcpToApp(app, config) {
  const targetPath = targetPathByApp(app);
  if (!targetPath) return false;

  ensureDir(path.dirname(targetPath));
  const appConfig = readJson(targetPath, {});
  const existing = appConfig.mcpServers && typeof appConfig.mcpServers === "object" ? appConfig.mcpServers : {};
  const previousManaged = new Set((config.managedServerNames[app] || []).map((name) => normalizeName(name)));

  const userEntries = {};
  for (const [name, value] of Object.entries(existing)) {
    if (!previousManaged.has(normalizeName(name))) {
      userEntries[name] = value;
    }
  }

  const managedEntries = {};
  const managedNames = [];
  for (const server of config.servers) {
    const enabled = Array.isArray(server.enabledApps) ? server.enabledApps : ["claude"];
    if (!enabled.includes(app)) continue;
    managedEntries[server.name] = mcpEntryFromServer(server);
    managedNames.push(server.name);
  }

  appConfig.mcpServers = {
    ...managedEntries,
    ...userEntries,
  };
  backupFileIfExists(targetPath);
  writeJsonAtomic(targetPath, appConfig);
  config.managedServerNames[app] = managedNames;
  return true;
}

export function applyMcpConfig(options = {}) {
  const config = loadMcpConfig();
  const targetApps = options.app ? [options.app] : ["claude", "gemini"];
  let appliedCount = 0;
  for (const app of targetApps) {
    if (applyMcpToApp(app, config)) appliedCount += 1;
  }
  saveMcpConfig(config);
  return appliedCount;
}

export function mergeMcpConfig(localConfig, remoteConfig) {
  const local = ensureMcpShape(structuredClone(localConfig || {}));
  const remote = ensureMcpShape(structuredClone(remoteConfig || {}));
  const mergedByName = new Map();

  for (const item of [...local.servers, ...remote.servers]) {
    const key = normalizeName(item.name || item.id);
    if (!key) continue;
    const current = mergedByName.get(key);
    if (!current) {
      mergedByName.set(key, item);
      continue;
    }
    const oldTs = Number(current.lastModified || current.createdAt || 0);
    const newTs = Number(item.lastModified || item.createdAt || 0);
    mergedByName.set(key, newTs >= oldTs ? item : current);
  }

  const merged = {
    ...local,
    ...remote,
    servers: [...mergedByName.values()],
    managedServerNames: structuredClone(DEFAULT_MANAGED),
  };

  for (const app of Object.keys(DEFAULT_MANAGED)) {
    const set = new Set([
      ...(local.managedServerNames[app] || []).map((name) => normalizeName(name)),
      ...(remote.managedServerNames[app] || []).map((name) => normalizeName(name)),
    ]);
    merged.managedServerNames[app] = merged.servers
      .filter((server) => set.has(normalizeName(server.name)))
      .map((server) => server.name);
  }

  return merged;
}
