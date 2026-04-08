#!/usr/bin/env node

import { Command } from "commander";
import inquirer from "inquirer";
import chalk from "chalk";
import {
  addProvider,
  cloneProvider,
  editProvider,
  getCurrentProvider,
  listProviders,
  removeProvider,
  setCurrentProvider,
} from "./lib/provider-store.js";
import {
  applyAllCurrentProviders,
  applyCurrentProvider,
  applyProviderToTool,
  getTargetConfigPathForTool,
} from "./lib/writers.js";
import {
  addMcpServer,
  applyMcpConfig,
  editMcpServer,
  listMcpServers,
  removeMcpServer,
} from "./lib/mcp-store.js";
import { analyzeClaudeHistory, cleanClaudeHistory } from "./lib/claude-clean.js";
import { exportState, importState } from "./lib/portability.js";
import { loadSyncConfig, saveSyncConfig, testSyncConnection } from "./lib/sync-store.js";
import {
  downloadSyncData,
  getSyncStatus,
  mergeSyncData,
  uploadSyncData,
} from "./lib/sync-engine.js";
import { maskSecret } from "./lib/fs-util.js";

const TOOL_META = {
  cx: { key: "codex", label: "Codex" },
  cc: { key: "claude", label: "Claude Code" },
  gm: { key: "gemini", label: "Gemini CLI" },
  oc: { key: "opencode", label: "OpenCode" },
};

function printHeader(title) {
  console.log(chalk.cyan(`\n${title}`));
}

function printProvider(provider, markCurrent = false) {
  const flag = markCurrent ? chalk.green(" [current]") : "";
  console.log(`${chalk.bold(provider.name)}${flag}`);
  console.log(`  URL: ${provider.baseUrl || "(empty)"}`);
  console.log(`  API: ${maskSecret(provider.apiKey || "")}`);
  if (provider.model) console.log(`  Model: ${provider.model}`);
}

async function promptProvider(base = {}) {
  const questions = [];

  if (!base.name) {
    questions.push({
      type: "input",
      name: "name",
      message: "Provider name:",
      validate: (v) => (String(v || "").trim() ? true : "Name is required."),
    });
  }

  if (!base.baseUrl) {
    questions.push({
      type: "input",
      name: "baseUrl",
      message: "Base URL:",
      validate: (v) => {
        const text = String(v || "").trim();
        if (!text) return "Base URL is required.";
        if (!/^https?:\/\//i.test(text)) return "Base URL must start with http:// or https://";
        return true;
      },
    });
  }

  if (!base.apiKey) {
    questions.push({
      type: "password",
      name: "apiKey",
      message: "API key:",
      mask: "*",
      validate: (v) => (String(v || "").trim() ? true : "API key is required."),
    });
  }

  if (base.model === undefined) {
    questions.push({
      type: "input",
      name: "model",
      message: "Model (optional):",
      default: "",
    });
  }

  if (!questions.length) {
    return {
      name: String(base.name || "").trim(),
      baseUrl: String(base.baseUrl || "").trim(),
      apiKey: String(base.apiKey || "").trim(),
      model: String(base.model || "").trim() || undefined,
      desc: base.desc ? String(base.desc).trim() : undefined,
    };
  }

  const answers = await inquirer.prompt(questions);
  return {
    name: String(base.name ?? answers.name ?? "").trim(),
    baseUrl: String(base.baseUrl ?? answers.baseUrl ?? "").trim(),
    apiKey: String(base.apiKey ?? answers.apiKey ?? "").trim(),
    model: String(base.model ?? answers.model ?? "").trim() || undefined,
    desc: base.desc ? String(base.desc).trim() : undefined,
  };
}

function registerProviderCommands(commandName, command) {
  const meta = TOOL_META[commandName];
  const tool = meta.key;
  const label = meta.label;

  command
    .command("add [name]")
    .description(`Add a ${label} provider`)
    .option("-u, --base-url <url>", "Base URL")
    .option("-k, --api-key <key>", "API key")
    .option("-m, --model <model>", "Default model")
    .option("-d, --desc <text>", "Description")
    .option("--activate", "Switch to this provider immediately", false)
    .action(async (name, options) => {
      const input = await promptProvider({
        name,
        baseUrl: options.baseUrl,
        apiKey: options.apiKey,
        model: options.model,
        desc: options.desc,
      });
      const provider = addProvider(tool, input);
      console.log(chalk.green(`\nAdded ${label} provider: ${provider.name}`));
      if (options.activate) {
        const current = setCurrentProvider(tool, provider.id);
        applyProviderToTool(tool, current);
        console.log(chalk.green(`Activated and wrote config for ${label}.`));
      }
    });

  command
    .command("list")
    .description(`List ${label} providers`)
    .action(() => {
      const providers = listProviders(tool);
      const current = getCurrentProvider(tool);
      if (!providers.length) {
        console.log(chalk.yellow(`\nNo ${label} providers yet.`));
        return;
      }
      printHeader(`${label} Providers`);
      for (const provider of providers) {
        const isCurrent = current && current.id === provider.id;
        printProvider(provider, isCurrent);
      }
    });

  command
    .command("use [name]")
    .description(`Switch active ${label} provider`)
    .action(async (name) => {
      let target = name;
      if (!target) {
        const providers = listProviders(tool);
        if (!providers.length) throw new Error(`No ${label} providers available.`);
        const answer = await inquirer.prompt([
          {
            type: "list",
            name: "target",
            message: `Choose a ${label} provider:`,
            choices: providers.map((item) => ({
              name: `${item.name} (${item.baseUrl})`,
              value: item.id,
            })),
          },
        ]);
        target = answer.target;
      }

      const provider = setCurrentProvider(tool, target);
      applyProviderToTool(tool, provider);
      console.log(chalk.green(`\nNow using ${provider.name} for ${label}.`));
      const targets = getTargetConfigPathForTool(tool);
      for (const targetPath of targets) {
        console.log(`  updated: ${targetPath}`);
      }
    });

  command
    .command("current")
    .description(`Show active ${label} provider`)
    .action(() => {
      const provider = getCurrentProvider(tool);
      if (!provider) {
        console.log(chalk.yellow(`\nNo active ${label} provider.`));
        return;
      }
      printHeader(`Current ${label} Provider`);
      printProvider(provider, true);
    });

  command
    .command("edit [name]")
    .description(`Edit a ${label} provider`)
    .option("--new-name <name>", "New provider name")
    .option("-u, --base-url <url>", "New Base URL")
    .option("-k, --api-key <key>", "New API key")
    .option("-m, --model <model>", "New model")
    .option("-d, --desc <text>", "New description")
    .action(async (name, options) => {
      let target = name;
      if (!target) {
        const providers = listProviders(tool);
        if (!providers.length) throw new Error(`No ${label} providers available.`);
        const answer = await inquirer.prompt([
          {
            type: "list",
            name: "target",
            message: `Choose ${label} provider to edit:`,
            choices: providers.map((item) => ({ name: item.name, value: item.id })),
          },
        ]);
        target = answer.target;
      }

      const patch = {
        name: options.newName,
        baseUrl: options.baseUrl,
        apiKey: options.apiKey,
        model: options.model,
        desc: options.desc,
      };

      const hasAnyPatch = Object.values(patch).some((value) => value !== undefined);
      let finalPatch = patch;

      if (!hasAnyPatch) {
        const ask = await inquirer.prompt([
          { type: "input", name: "name", message: "New name (blank to keep):" },
          { type: "input", name: "baseUrl", message: "New base URL (blank to keep):" },
          { type: "password", name: "apiKey", message: "New API key (blank to keep):", mask: "*" },
          { type: "input", name: "model", message: "New model (blank to keep):" },
          { type: "input", name: "desc", message: "New description (blank to keep):" },
        ]);
        finalPatch = {
          name: ask.name?.trim() || undefined,
          baseUrl: ask.baseUrl?.trim() || undefined,
          apiKey: ask.apiKey?.trim() || undefined,
          model: ask.model?.trim() || undefined,
          desc: ask.desc?.trim() || undefined,
        };
      }

      const edited = editProvider(tool, target, finalPatch);
      const current = getCurrentProvider(tool);
      if (current && current.id === edited.id) {
        applyCurrentProvider(tool);
      }
      console.log(chalk.green(`\nUpdated ${label} provider: ${edited.name}`));
    });

  command
    .command("remove [name]")
    .description(`Remove a ${label} provider`)
    .option("-y, --yes", "Skip confirmation", false)
    .action(async (name, options) => {
      let target = name;
      if (!target) {
        const providers = listProviders(tool);
        if (!providers.length) throw new Error(`No ${label} providers available.`);
        const answer = await inquirer.prompt([
          {
            type: "list",
            name: "target",
            message: `Choose ${label} provider to remove:`,
            choices: providers.map((item) => ({ name: item.name, value: item.id })),
          },
        ]);
        target = answer.target;
      }

      if (!options.yes) {
        const confirm = await inquirer.prompt([
          { type: "confirm", name: "ok", message: `Remove provider "${target}"?`, default: false },
        ]);
        if (!confirm.ok) {
          console.log(chalk.yellow("Cancelled."));
          return;
        }
      }
      const removed = removeProvider(tool, target);
      console.log(chalk.green(`Removed ${label} provider: ${removed.name}`));
    });

  command
    .command("clone <source> <newName>")
    .description(`Clone a ${label} provider`)
    .action((source, newName) => {
      const cloned = cloneProvider(tool, source, newName);
      console.log(chalk.green(`Cloned provider to: ${cloned.name}`));
    });
}

function parseArgsString(value) {
  const text = String(value || "").trim();
  if (!text) return [];
  return text.split(/\s+/g).filter(Boolean);
}

function parseEnvJson(value) {
  if (!value) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  try {
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      throw new Error("env must be a JSON object.");
    }
    return obj;
  } catch (error) {
    throw new Error(`Invalid env JSON: ${(error && error.message) || String(error)}`);
  }
}

function parseApps(value) {
  const text = String(value || "").trim();
  if (!text) return ["claude"];
  const apps = text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!apps.length) return ["claude"];
  for (const app of apps) {
    if (!["claude", "gemini", "codex", "opencode"].includes(app)) {
      throw new Error(`Unsupported app in --apps: ${app}`);
    }
  }
  return [...new Set(apps)];
}

function parseBooleanLike(value) {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(text)) return true;
  if (["0", "false", "no", "n"].includes(text)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function registerMcpCommands(command) {
  command
    .command("add [name]")
    .description("Add MCP server")
    .option("-c, --command <command>", "Launch command", "npx")
    .option("-a, --args <args>", "Args string, space separated")
    .option("-e, --env <json>", "Env JSON object")
    .option("--apps <apps>", "Enabled apps, comma-separated (claude,gemini,codex,opencode)", "claude")
    .option("--no-apply", "Do not apply to app configs immediately")
    .action((name, options) => {
      if (!name) throw new Error("MCP server name is required.");
      const server = addMcpServer({
        name,
        command: options.command,
        args: parseArgsString(options.args),
        env: parseEnvJson(options.env),
        enabledApps: parseApps(options.apps),
      });
      if (options.apply) {
        applyMcpConfig({});
      }
      console.log(chalk.green(`\nAdded MCP server: ${server.name}`));
    });

  command
    .command("list")
    .description("List MCP servers")
    .action(() => {
      const servers = listMcpServers();
      if (!servers.length) {
        console.log(chalk.yellow("\nNo MCP servers yet."));
        return;
      }
      printHeader("MCP Servers");
      for (const server of servers) {
        console.log(chalk.bold(server.name));
        console.log(`  command: ${server.command}`);
        console.log(`  args: ${Array.isArray(server.args) ? server.args.join(" ") : ""}`);
        console.log(`  apps: ${(server.enabledApps || ["claude"]).join(", ")}`);
        if (server.env && Object.keys(server.env).length) {
          console.log(`  env: ${Object.keys(server.env).join(", ")}`);
        }
      }
    });

  command
    .command("edit <name>")
    .description("Edit MCP server")
    .option("--new-name <name>", "New MCP name")
    .option("-c, --command <command>", "Launch command")
    .option("-a, --args <args>", "Args string")
    .option("-e, --env <json>", "Env JSON object")
    .option("--apps <apps>", "Enabled apps")
    .option("--no-apply", "Do not apply after edit")
    .action((name, options) => {
      const patch = {};
      if (options.newName !== undefined) patch.name = String(options.newName).trim();
      if (options.command !== undefined) patch.command = String(options.command).trim();
      if (options.args !== undefined) patch.args = parseArgsString(options.args);
      if (options.env !== undefined) patch.env = parseEnvJson(options.env);
      if (options.apps !== undefined) patch.enabledApps = parseApps(options.apps);

      const edited = editMcpServer(name, patch);
      if (options.apply) applyMcpConfig({});
      console.log(chalk.green(`Updated MCP server: ${edited.name}`));
    });

  command
    .command("remove <name>")
    .description("Remove MCP server")
    .option("--no-apply", "Do not apply after remove")
    .action((name, options) => {
      const removed = removeMcpServer(name);
      if (options.apply) applyMcpConfig({});
      console.log(chalk.green(`Removed MCP server: ${removed.name}`));
    });

  command
    .command("apply")
    .description("Apply managed MCP servers into app config files")
    .option("--app <app>", "Target app (claude|gemini)")
    .action((options) => {
      const count = applyMcpConfig({ app: options.app });
      console.log(chalk.green(`Applied MCP config to ${count} app file(s).`));
    });
}

async function resolveSyncConfigFromOptions(options) {
  const existing = loadSyncConfig() || {};
  const remember = parseBooleanLike(options.rememberSyncPassword);
  const next = {
    webdavUrl: options.webdavUrl ?? existing.webdavUrl,
    username: options.username ?? existing.username,
    password: options.password ?? existing.password,
    authType: options.authType ?? existing.authType ?? "password",
    remoteDir: options.remoteDir ?? existing.remoteDir ?? "/",
    syncPassword: options.syncPassword ?? existing.syncPassword,
    rememberSyncPassword:
      remember !== undefined ? remember : existing.rememberSyncPassword ?? true,
    lastSync: existing.lastSync,
  };

  if (!next.webdavUrl || !next.username || !next.password || !next.syncPassword) {
    const ask = await inquirer.prompt([
      {
        type: "input",
        name: "webdavUrl",
        message: "WebDAV URL:",
        default: next.webdavUrl || "",
      },
      {
        type: "input",
        name: "username",
        message: "WebDAV username:",
        default: next.username || "",
      },
      {
        type: "password",
        name: "password",
        message: "WebDAV password:",
        mask: "*",
        default: next.password || "",
      },
      {
        type: "list",
        name: "authType",
        message: "Auth type:",
        choices: [
          { name: "password (Basic)", value: "password" },
          { name: "digest", value: "digest" },
        ],
        default: next.authType || "password",
      },
      {
        type: "input",
        name: "remoteDir",
        message: "Remote base dir:",
        default: next.remoteDir || "/",
      },
      {
        type: "password",
        name: "syncPassword",
        message: "Sync password (for encrypting remote data):",
        mask: "*",
        default: next.syncPassword || "",
      },
    ]);
    return {
      ...next,
      ...ask,
    };
  }

  return next;
}

function registerSyncCommands(command) {
  command
    .command("config")
    .description("Configure WebDAV sync")
    .option("--webdav-url <url>", "WebDAV URL")
    .option("--username <name>", "WebDAV username")
    .option("--password <password>", "WebDAV password")
    .option("--auth-type <type>", "password|digest")
    .option("--remote-dir <dir>", "Remote base dir, default /")
    .option("--sync-password <password>", "Sync encryption password")
    .option("--remember-sync-password <boolean>", "Store sync password in local config")
    .action(async (options) => {
      const config = await resolveSyncConfigFromOptions(options);
      const saved = saveSyncConfig(config);
      console.log(chalk.green("\nSync config saved."));
      console.log(`  url: ${saved.webdavUrl}`);
      console.log(`  user: ${saved.username}`);
      console.log(`  remoteDir: ${saved.remoteDir}`);
      console.log(`  authType: ${saved.authType}`);
    });

  command
    .command("test")
    .description("Test WebDAV connection")
    .action(async () => {
      const config = loadSyncConfig();
      if (!config) throw new Error("Sync config not found. Run: 100xlabsapi sync config");
      await testSyncConnection(config);
      console.log(chalk.green("WebDAV connection OK."));
    });

  command
    .command("upload")
    .description("Upload local manager data to WebDAV")
    .option("--password <password>", "Sync encryption password override")
    .action(async (options) => {
      const config = loadSyncConfig();
      if (!config) throw new Error("Sync config not found. Run: 100xlabsapi sync config");
      const result = await uploadSyncData(config, options.password || config.syncPassword);
      console.log(chalk.green(`Uploaded ${result.uploaded} file(s).`));
    });

  command
    .command("download")
    .description("Download manager data from WebDAV")
    .option("--password <password>", "Sync encryption password override")
    .action(async (options) => {
      const config = loadSyncConfig();
      if (!config) throw new Error("Sync config not found. Run: 100xlabsapi sync config");
      const result = await downloadSyncData(config, options.password || config.syncPassword);
      applyAllCurrentProviders();
      applyMcpConfig({});
      console.log(chalk.green(`Downloaded ${result.downloaded} file(s).`));
    });

  command
    .command("merge")
    .description("Merge local and remote manager data")
    .option("--password <password>", "Sync encryption password override")
    .action(async (options) => {
      const config = loadSyncConfig();
      if (!config) throw new Error("Sync config not found. Run: 100xlabsapi sync config");
      const result = await mergeSyncData(config, options.password || config.syncPassword);
      applyAllCurrentProviders();
      applyMcpConfig({});
      console.log(chalk.green(`Merge completed. Changed ${result.changed} file(s).`));
    });

  command
    .command("status")
    .description("Show sync status")
    .action(async () => {
      const config = loadSyncConfig();
      const status = await getSyncStatus(config);
      printHeader("Sync Status");
      console.log(`configured: ${status.configured ? "yes" : "no"}`);
      if (status.configured) {
        console.log(`remoteDir: ${status.remoteDir}`);
        console.log(`lastSync: ${status.lastSync || "(never)"}`);
      }
      console.log(chalk.gray("local:"));
      for (const [key, item] of Object.entries(status.local)) {
        const detail =
          item.providers !== undefined ? `providers=${item.providers}` : item.servers !== undefined ? `servers=${item.servers}` : "";
        console.log(`  ${key}: ${item.exists ? "yes" : "no"} ${detail}`.trim());
      }
      if (status.remote) {
        console.log(chalk.gray("remote:"));
        for (const [key, exists] of Object.entries(status.remote)) {
          console.log(`  ${key}: ${exists ? "yes" : "no"}`);
        }
      }
    });
}

function registerClaudeCleanCommands(command) {
  command
    .command("clean:analyze")
    .description("Analyze ~/.claude.json size and history records")
    .action(() => {
      const result = analyzeClaudeHistory();
      printHeader("Claude History Analysis");
      console.log(`path: ${result.filePath}`);
      console.log(`exists: ${result.exists ? "yes" : "no"}`);
      console.log(`size: ${result.fileSizeText}`);
      console.log(`projects: ${result.projectCount}`);
      console.log(`history records: ${result.totalHistoryCount}`);
      console.log(`cachedChangelog: ${result.cachedChangelogSize} bytes`);
      if (result.topProjects.length) {
        console.log(chalk.gray("top projects:"));
        for (const item of result.topProjects) {
          console.log(`  ${item.historyCount}  ${item.path}`);
        }
      }
    });

  command
    .command("clean")
    .description("Clean ~/.claude.json history/cache")
    .option("--keep <count>", "Keep N recent history items per project", "10")
    .option("--cache", "Remove cached changelog", false)
    .option("--stats", "Reset local stats fields", false)
    .option("--aggressive", "Equivalent to --keep 0 --cache --stats", false)
    .action((options) => {
      const keep = options.aggressive ? 0 : Number(options.keep || 10);
      const result = cleanClaudeHistory({
        keepRecentCount: Number.isFinite(keep) ? keep : 10,
        cleanProjectHistory: true,
        cleanCache: options.cache || options.aggressive,
        cleanStats: options.stats || options.aggressive,
      });
      console.log(chalk.green("\nClaude history cleaned."));
      console.log(`  removedHistory: ${result.removedHistoryCount}`);
      console.log(`  saved: ${result.savedText}`);
      if (result.backupPath) console.log(`  backup: ${result.backupPath}`);
    });
}

const program = new Command();

program
  .name("100xlabsapi")
  .description("Provider config manager for Codex, Claude, Gemini, OpenCode and MCP")
  .version("1.0.0-cleanroom");

const cx = program.command("cx").description("Manage Codex providers");
const cc = program.command("cc").description("Manage Claude providers");
const gm = program.command("gm").description("Manage Gemini providers");
const oc = program.command("oc").description("Manage OpenCode providers");
const mcp = program.command("mcp").description("Manage MCP servers");
const sync = program.command("sync").description("WebDAV sync commands");

registerProviderCommands("cx", cx);
registerProviderCommands("cc", cc);
registerProviderCommands("gm", gm);
registerProviderCommands("oc", oc);
registerClaudeCleanCommands(cc);
registerMcpCommands(mcp);
registerSyncCommands(sync);

program
  .command("export [dir]")
  .description("Export manager files")
  .action((dir) => {
    const result = exportState(dir);
    console.log(chalk.green(`Export complete: ${result.outputDir}`));
    console.log(`files: ${result.copiedFiles.join(", ") || "(none)"}`);
  });

program
  .command("import [dir]")
  .description("Import manager files")
  .action((dir) => {
    const result = importState(dir || ".");
    applyAllCurrentProviders();
    applyMcpConfig({});
    console.log(chalk.green(`Import complete: ${result.inputDir}`));
    console.log(`files: ${result.copied.join(", ")}`);
  });

program
  .command("apply")
  .description("Re-apply current providers and MCP to all tools")
  .action(() => {
    const applied = applyAllCurrentProviders();
    const mcpCount = applyMcpConfig({});
    console.log(chalk.green("Applied current configuration."));
    console.log(`providers: ${applied.map((item) => `${item.tool}:${item.providerName}`).join(", ") || "(none)"}`);
    console.log(`mcp apps: ${mcpCount}`);
  });

if (!process.argv.slice(2).length) {
  program.help();
}

program.parseAsync(process.argv).catch((error) => {
  console.error(chalk.red(`\nError: ${error.message}\n`));
  process.exit(1);
});
