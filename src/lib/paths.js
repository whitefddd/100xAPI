import os from "node:os";
import path from "node:path";

export const HOME_DIR = os.homedir();
export const MANAGER_DIR = path.join(HOME_DIR, ".100xlabsapi");

export const TOOL_KEY_MAP = {
  cx: "codex",
  cc: "claude",
  gm: "gemini",
  oc: "opencode",
};

export const TOOL_NAMES = ["codex", "claude", "gemini", "opencode"];

export const MANAGER_FILES = {
  codex: path.join(MANAGER_DIR, "codex.json"),
  claude: path.join(MANAGER_DIR, "claude.json"),
  gemini: path.join(MANAGER_DIR, "gemini.json"),
  opencode: path.join(MANAGER_DIR, "opencode.json"),
  mcp: path.join(MANAGER_DIR, "mcp.json"),
  sync: path.join(MANAGER_DIR, "config.json"),
};

export const TARGET_PATHS = {
  codexDir: path.join(HOME_DIR, ".codex"),
  codexConfig: path.join(HOME_DIR, ".codex", "config.toml"),
  codexAuth: path.join(HOME_DIR, ".codex", "auth.json"),
  claudeDir: path.join(HOME_DIR, ".claude"),
  claudeSettings: path.join(HOME_DIR, ".claude", "settings.json"),
  claudeHistory: path.join(HOME_DIR, ".claude.json"),
  geminiDir: path.join(HOME_DIR, ".gemini"),
  geminiSettings: path.join(HOME_DIR, ".gemini", "settings.json"),
  geminiEnv: path.join(HOME_DIR, ".gemini", ".env"),
  opencodeDir: path.join(HOME_DIR, ".config", "opencode"),
  opencodeConfigJsonc: path.join(HOME_DIR, ".config", "opencode", "opencode.jsonc"),
  opencodeConfigJson: path.join(HOME_DIR, ".config", "opencode", "opencode.json"),
};

export const REMOTE_SYNC_FOLDER = ".100xlabsapi";

export function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
