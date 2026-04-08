# 100xlabsAPI 中文使用说明

`100xlabsapi` 是一个本地 CLI 工具，用来统一管理以下客户端的服务商配置并一键切换：

- Codex
- Claude Code
- Gemini CLI
- OpenCode
- MCP 服务

## 1. 存储位置

工具自己的管理数据会写到：

- `~/.100xlabsapi/codex.json`
- `~/.100xlabsapi/claude.json`
- `~/.100xlabsapi/gemini.json`
- `~/.100xlabsapi/opencode.json`
- `~/.100xlabsapi/mcp.json`
- `~/.100xlabsapi/config.json`（WebDAV 同步配置）

切换 `use` 时会自动写入各客户端真实配置文件：

- Codex: `~/.codex/config.toml`、`~/.codex/auth.json`
- Claude Code: `~/.claude/settings.json`
- Gemini CLI: `~/.gemini/settings.json`、`~/.gemini/.env`
- OpenCode: `~/.config/opencode/opencode.jsonc`（或 `.json`）

## 2. 安装与运行

全局安装：

```bash
npm i -g 100xlabsapi
```

本地运行：

```bash
npm i
node src/index.js --help
```

## 3. 命令总览

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

## 4. 快速上手示例

### 4.1 添加并启用 Codex 服务商

```bash
100xlabsapi cx add myProvider --base-url https://example.com/v1 --api-key sk-xxxx --model gpt-5.4 --activate
100xlabsapi cx current
```

### 4.2 Claude/Gemini/OpenCode 同理

```bash
100xlabsapi cc add claudeA --base-url https://example.com/anthropic --api-key token-xxxx --model gpt-5.4
100xlabsapi cc use claudeA

100xlabsapi gm add geminiA --base-url https://example.com/gemini --api-key key-xxxx --model gemini-2.5-pro
100xlabsapi gm use geminiA

100xlabsapi oc add ocA --base-url https://example.com/v1 --api-key sk-xxxx --model gpt-5.4
100xlabsapi oc use ocA
```

### 4.3 MCP 管理

添加一个 MCP：

```bash
100xlabsapi mcp add mymcp --command npx --args "@modelcontextprotocol/server-filesystem C:\\data" --apps claude,gemini
```

应用 MCP 到客户端配置：

```bash
100xlabsapi mcp apply
```

### 4.4 Claude 历史分析与清理

先分析：

```bash
100xlabsapi cc clean:analyze
```

清理（每个项目保留最近 10 条）：

```bash
100xlabsapi cc clean --keep 10 --cache --stats
```

激进清理：

```bash
100xlabsapi cc clean --aggressive
```

## 5. WebDAV 同步

### 5.1 配置同步参数

```bash
100xlabsapi sync config --webdav-url https://dav.example.com --username user --password pass --auth-type password --remote-dir / --sync-password my-sync-pass
```

### 5.2 测试连接

```bash
100xlabsapi sync test
```

### 5.3 上传/下载/合并

```bash
100xlabsapi sync upload
100xlabsapi sync download
100xlabsapi sync merge
100xlabsapi sync status
```

说明：

- 远端目录使用 `/<remoteDir>/.100xlabsapi/`
- 同步数据会用 `sync-password` 加密后再上传

## 6. 迁移与备份

导出：

```bash
100xlabsapi export ./backup-dir
```

导入：

```bash
100xlabsapi import ./backup-dir
```

导入后快速重写入客户端配置：

```bash
100xlabsapi apply
```

## 7. 常用排查

- 先看帮助：`100xlabsapi --help`
- 命令级帮助：`100xlabsapi cc --help`
- 查看当前配置：`100xlabsapi sync status`
- 多次切换失败时执行：`100xlabsapi apply`
- 工具会在覆盖关键文件前生成 `.bak.<timestamp>` 备份
