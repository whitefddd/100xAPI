# 100xlabsAPI

中文说明见: [README.zh-CN.md](./README.zh-CN.md)

`100xlabsapi` is a clean-room CLI for managing provider configs across:

- Codex (`~/.codex/config.toml`, `~/.codex/auth.json`)
- Claude Code (`~/.claude/settings.json`)
- Gemini CLI (`~/.gemini/settings.json`, `~/.gemini/.env`)
- OpenCode (`~/.config/opencode/opencode.jsonc`)
- MCP server registry

It stores its own manager state in:

- `~/.100xlabsapi/codex.json`
- `~/.100xlabsapi/claude.json`
- `~/.100xlabsapi/gemini.json`
- `~/.100xlabsapi/opencode.json`
- `~/.100xlabsapi/mcp.json`
- `~/.100xlabsapi/config.json` (WebDAV sync settings)

## Install

```bash
npm i -g 100xlabsapi
```

Or run locally:

```bash
npm i
node src/index.js --help
```

## Commands

```bash
100xlabsapi cx add|list|use|current|edit|remove|clone
100xlabsapi cc add|list|use|current|edit|remove|clone|clean:analyze|clean
100xlabsapi gm add|list|use|current|edit|remove|clone
100xlabsapi oc add|list|use|current|edit|remove|clone
100xlabsapi mcp add|list|edit|remove|apply
100xlabsapi sync config|test|upload|download|merge|status
100xlabsapi export [dir]
100xlabsapi import [dir]
100xlabsapi apply
```

## Notes

- `use` updates local manager state and writes the target tool config.
- All destructive writes create timestamped backups.
- `sync` stores data remotely under `/<remoteDir>/.100xlabsapi/`.
