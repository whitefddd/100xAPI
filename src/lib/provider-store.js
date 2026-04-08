import { MANAGER_FILES } from "./paths.js";
import { ensureDir, readJson, writeJsonAtomic } from "./fs-util.js";
import path from "node:path";

function now() {
  return Date.now();
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase();
}

function ensureShape(config) {
  if (!config || typeof config !== "object") {
    return { providers: [], presets: [] };
  }
  if (!Array.isArray(config.providers)) config.providers = [];
  if (!Array.isArray(config.presets)) config.presets = [];
  return config;
}

export function loadToolConfig(tool) {
  const filePath = MANAGER_FILES[tool];
  return ensureShape(readJson(filePath, { providers: [], presets: [] }));
}

export function saveToolConfig(tool, config) {
  const filePath = MANAGER_FILES[tool];
  ensureDir(path.dirname(filePath));
  writeJsonAtomic(filePath, ensureShape(config));
}

export function findProvider(config, query) {
  if (!query) return null;
  const key = normalizeName(query);
  return (
    config.providers.find((item) => item.id === query) ||
    config.providers.find((item) => normalizeName(item.name) === key) ||
    null
  );
}

export function listProviders(tool) {
  const config = loadToolConfig(tool);
  return config.providers;
}

export function getCurrentProvider(tool) {
  const config = loadToolConfig(tool);
  if (!config.currentProviderId) return null;
  return config.providers.find((item) => item.id === config.currentProviderId) || null;
}

export function addProvider(tool, payload) {
  const config = loadToolConfig(tool);
  const name = String(payload.name || "").trim();
  if (!name) throw new Error("Provider name is required.");

  const exists = config.providers.some((item) => normalizeName(item.name) === normalizeName(name));
  if (exists) {
    throw new Error(`Provider already exists: ${name}`);
  }

  const time = now();
  const provider = {
    id: makeId(tool),
    name,
    desc: payload.desc ? String(payload.desc).trim() : undefined,
    baseUrl: String(payload.baseUrl || "").trim(),
    apiKey: String(payload.apiKey || "").trim(),
    model: payload.model ? String(payload.model).trim() : undefined,
    createdAt: time,
    lastModified: time,
  };

  config.providers.push(provider);
  saveToolConfig(tool, config);
  return provider;
}

export function setCurrentProvider(tool, query) {
  const config = loadToolConfig(tool);
  const provider = findProvider(config, query);
  if (!provider) {
    throw new Error(`Provider not found: ${query}`);
  }
  provider.lastUsedAt = now();
  provider.lastModified = now();
  config.currentProviderId = provider.id;
  saveToolConfig(tool, config);
  return provider;
}

export function editProvider(tool, query, patch) {
  const config = loadToolConfig(tool);
  const provider = findProvider(config, query);
  if (!provider) {
    throw new Error(`Provider not found: ${query}`);
  }

  if (patch.name !== undefined) {
    const nextName = String(patch.name).trim();
    if (!nextName) throw new Error("Provider name cannot be empty.");
    const conflict = config.providers.some(
      (item) => item.id !== provider.id && normalizeName(item.name) === normalizeName(nextName)
    );
    if (conflict) {
      throw new Error(`Provider already exists: ${nextName}`);
    }
    provider.name = nextName;
  }

  if (patch.desc !== undefined) provider.desc = String(patch.desc || "").trim() || undefined;
  if (patch.baseUrl !== undefined) provider.baseUrl = String(patch.baseUrl || "").trim();
  if (patch.apiKey !== undefined) provider.apiKey = String(patch.apiKey || "").trim();
  if (patch.model !== undefined) provider.model = String(patch.model || "").trim() || undefined;
  provider.lastModified = now();
  saveToolConfig(tool, config);
  return provider;
}

export function removeProvider(tool, query) {
  const config = loadToolConfig(tool);
  const provider = findProvider(config, query);
  if (!provider) throw new Error(`Provider not found: ${query}`);

  config.providers = config.providers.filter((item) => item.id !== provider.id);
  if (config.currentProviderId === provider.id) {
    config.currentProviderId = undefined;
  }
  saveToolConfig(tool, config);
  return provider;
}

export function cloneProvider(tool, sourceQuery, newName) {
  const config = loadToolConfig(tool);
  const source = findProvider(config, sourceQuery);
  if (!source) throw new Error(`Provider not found: ${sourceQuery}`);

  const targetName = String(newName || "").trim();
  if (!targetName) throw new Error("New provider name is required.");
  const exists = config.providers.some((item) => normalizeName(item.name) === normalizeName(targetName));
  if (exists) throw new Error(`Provider already exists: ${targetName}`);

  const time = now();
  const cloned = {
    ...source,
    id: makeId(tool),
    name: targetName,
    createdAt: time,
    lastModified: time,
    lastUsedAt: undefined,
  };
  config.providers.push(cloned);
  saveToolConfig(tool, config);
  return cloned;
}

export function mergeProviderConfig(localConfig, remoteConfig) {
  const local = ensureShape(structuredClone(localConfig || {}));
  const remote = ensureShape(structuredClone(remoteConfig || {}));
  const mergedByName = new Map();

  for (const item of [...local.providers, ...remote.providers]) {
    const key = normalizeName(item.name || item.id);
    if (!key) continue;
    const existing = mergedByName.get(key);
    if (!existing) {
      mergedByName.set(key, item);
      continue;
    }
    const oldTs = Number(existing.lastModified || existing.createdAt || 0);
    const newTs = Number(item.lastModified || item.createdAt || 0);
    mergedByName.set(key, newTs >= oldTs ? item : existing);
  }

  const mergedProviders = [...mergedByName.values()];
  const mergedPresets = [...(local.presets || [])];
  for (const preset of remote.presets || []) {
    if (!mergedPresets.some((item) => normalizeName(item.name) === normalizeName(preset.name))) {
      mergedPresets.push(preset);
    }
  }

  const currentProviderId =
    local.currentProviderId && mergedProviders.some((item) => item.id === local.currentProviderId)
      ? local.currentProviderId
      : remote.currentProviderId && mergedProviders.some((item) => item.id === remote.currentProviderId)
        ? remote.currentProviderId
        : undefined;

  return {
    ...local,
    ...remote,
    providers: mergedProviders,
    presets: mergedPresets,
    currentProviderId,
  };
}
