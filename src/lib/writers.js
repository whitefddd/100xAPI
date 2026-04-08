import { parse as parseToml, stringify as stringifyToml } from "@iarna/toml";
import path from "node:path";
import {
  TARGET_PATHS,
  TOOL_NAMES,
} from "./paths.js";
import {
  backupFileIfExists,
  ensureDir,
  fileExists,
  parseEnv,
  readJson,
  readJsonc,
  readText,
  stringifyEnv,
  writeJsonAtomic,
  writeTextAtomic,
} from "./fs-util.js";
import { getCurrentProvider } from "./provider-store.js";

function sanitizeKey(value, fallback = "default") {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return key || fallback;
}

function resolveOpenCodeConfigPath() {
  if (fileExists(TARGET_PATHS.opencodeConfigJsonc)) return TARGET_PATHS.opencodeConfigJsonc;
  if (fileExists(TARGET_PATHS.opencodeConfigJson)) return TARGET_PATHS.opencodeConfigJson;
  return TARGET_PATHS.opencodeConfigJsonc;
}

function writeCodex(provider) {
  ensureDir(TARGET_PATHS.codexDir);

  const configPath = TARGET_PATHS.codexConfig;
  const authPath = TARGET_PATHS.codexAuth;
  backupFileIfExists(configPath);
  backupFileIfExists(authPath);

  let config = {};
  if (fileExists(configPath)) {
    try {
      config = parseToml(readText(configPath));
    } catch {
      config = {};
    }
  }

  const providerKey = sanitizeKey(provider.name, "provider");
  if (!config.model_providers || typeof config.model_providers !== "object") {
    config.model_providers = {};
  }

  config.model_provider = providerKey;
  config.model = provider.model || config.model || "gpt-5.4";
  config.model_providers[providerKey] = {
    name: providerKey,
    base_url: provider.baseUrl,
    wire_api: "responses",
    requires_openai_auth: true,
  };

  writeTextAtomic(configPath, stringifyToml(config));

  const auth = readJson(authPath, {});
  auth.OPENAI_API_KEY = provider.apiKey;
  writeJsonAtomic(authPath, auth);
}

function writeClaude(provider) {
  ensureDir(TARGET_PATHS.claudeDir);

  const settingsPath = TARGET_PATHS.claudeSettings;
  backupFileIfExists(settingsPath);

  const config = readJson(settingsPath, {});
  config.env = config.env && typeof config.env === "object" ? config.env : {};
  config.env.ANTHROPIC_AUTH_TOKEN = provider.apiKey;
  config.env.ANTHROPIC_BASE_URL = provider.baseUrl;
  config.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC =
    config.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC || "1";

  if (provider.model) {
    config.env.ANTHROPIC_CUSTOM_MODEL_OPTION = provider.model;
    config.env.ANTHROPIC_CUSTOM_MODEL_DISPLAY_NAME = `${provider.model} via ${provider.name}`;
    config.env.ANTHROPIC_DEFAULT_OPUS_MODEL = provider.model;
    config.env.ANTHROPIC_DEFAULT_SONNET_MODEL = provider.model;
    config.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = provider.model;
  }

  writeJsonAtomic(settingsPath, config);
}

function writeGemini(provider) {
  ensureDir(TARGET_PATHS.geminiDir);

  backupFileIfExists(TARGET_PATHS.geminiSettings);
  backupFileIfExists(TARGET_PATHS.geminiEnv);

  const settings = readJson(TARGET_PATHS.geminiSettings, {});
  settings.ide = settings.ide && typeof settings.ide === "object" ? settings.ide : {};
  settings.ide.enabled = settings.ide.enabled ?? true;
  settings.security = settings.security && typeof settings.security === "object" ? settings.security : {};
  settings.security.auth =
    settings.security.auth && typeof settings.security.auth === "object" ? settings.security.auth : {};
  settings.security.auth.selectedType = "gemini-api-key";
  writeJsonAtomic(TARGET_PATHS.geminiSettings, settings);

  const env = parseEnv(readText(TARGET_PATHS.geminiEnv, ""));
  env.GOOGLE_GEMINI_BASE_URL = provider.baseUrl;
  env.GEMINI_API_KEY = provider.apiKey;
  if (provider.model) env.GEMINI_MODEL = provider.model;
  writeTextAtomic(TARGET_PATHS.geminiEnv, stringifyEnv(env));
}

function writeOpenCode(provider) {
  ensureDir(TARGET_PATHS.opencodeDir);

  const configPath = resolveOpenCodeConfigPath();
  backupFileIfExists(configPath);

  const config = configPath.endsWith(".jsonc") ? readJsonc(configPath, {}) : readJson(configPath, {});
  const providerKey = sanitizeKey(provider.name, "openai");
  const modelName = provider.model || "gpt-5.4";
  const modelKey = sanitizeKey(modelName, "gpt-5-4");

  if (!config.provider || typeof config.provider !== "object") config.provider = {};
  const previous = config.provider[providerKey] || {};
  const previousOptions = previous.options && typeof previous.options === "object" ? previous.options : {};
  const previousModels = previous.models && typeof previous.models === "object" ? previous.models : {};

  config.provider[providerKey] = {
    name: provider.name,
    npm: previous.npm || "@ai-sdk/openai-compatible",
    options: {
      ...previousOptions,
      baseURL: provider.baseUrl,
      apiKey: provider.apiKey,
    },
    models: {
      ...previousModels,
      [modelKey]: {
        name: modelName,
      },
    },
  };

  config.$schema = config.$schema || "https://opencode.ai/config.json";
  config.model = `${providerKey}/${modelKey}`;

  writeJsonAtomic(configPath, config);
}

export function applyProviderToTool(tool, provider) {
  if (!provider) throw new Error("Provider is required.");
  if (tool === "codex") return writeCodex(provider);
  if (tool === "claude") return writeClaude(provider);
  if (tool === "gemini") return writeGemini(provider);
  if (tool === "opencode") return writeOpenCode(provider);
  throw new Error(`Unsupported tool: ${tool}`);
}

export function applyCurrentProvider(tool) {
  const provider = getCurrentProvider(tool);
  if (!provider) return null;
  applyProviderToTool(tool, provider);
  return provider;
}

export function applyAllCurrentProviders() {
  const applied = [];
  for (const tool of TOOL_NAMES) {
    const provider = applyCurrentProvider(tool);
    if (provider) {
      applied.push({ tool, providerName: provider.name });
    }
  }
  return applied;
}

export function getTargetConfigPathForTool(tool) {
  if (tool === "codex") return [TARGET_PATHS.codexConfig, TARGET_PATHS.codexAuth];
  if (tool === "claude") return [TARGET_PATHS.claudeSettings];
  if (tool === "gemini") return [TARGET_PATHS.geminiSettings, TARGET_PATHS.geminiEnv];
  if (tool === "opencode") return [resolveOpenCodeConfigPath()];
  return [];
}

export function getOpenCodeConfigPath() {
  return resolveOpenCodeConfigPath();
}

export function managerDirOf(filePath) {
  return path.dirname(filePath);
}
