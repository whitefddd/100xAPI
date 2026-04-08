# 100xlabsAPI

`100xlabsapi` 是一个本地 CLI 工具，用于统一管理以下客户端的服务商配置并一键切换：

- Codex
- Claude Code
- Gemini CLI
- OpenCode
- MCP 服务

详细中文说明：`README.zh-CN.md`

## 安装

```bash
npm i -g 100xlabsapi
```

或本地运行：

```bash
npm i
node src/index.js --help
```

## 命令总览

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

## 配置文件位置

管理器数据保存在：

- `~/.100xlabsapi/codex.json`
- `~/.100xlabsapi/claude.json`
- `~/.100xlabsapi/gemini.json`
- `~/.100xlabsapi/opencode.json`
- `~/.100xlabsapi/mcp.json`
- `~/.100xlabsapi/config.json`

切换 `use` 后会自动写入客户端真实配置：

- Codex：`~/.codex/config.toml`、`~/.codex/auth.json`
- Claude：`~/.claude/settings.json`
- Gemini：`~/.gemini/settings.json`、`~/.gemini/.env`
- OpenCode：`~/.config/opencode/opencode.jsonc`（或 `.json`）
