import { TARGET_PATHS } from "./paths.js";
import {
  backupFileIfExists,
  fileExists,
  readJson,
  writeJsonAtomic,
} from "./fs-util.js";

function formatBytes(bytes) {
  const num = Number(bytes || 0);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

export function analyzeClaudeHistory() {
  const filePath = TARGET_PATHS.claudeHistory;
  if (!fileExists(filePath)) {
    return {
      filePath,
      exists: false,
      fileSize: 0,
      fileSizeText: "0 B",
      projectCount: 0,
      totalHistoryCount: 0,
      cachedChangelogSize: 0,
      topProjects: [],
    };
  }

  const raw = readJson(filePath, {});
  const text = JSON.stringify(raw);
  const projects = raw.projects && typeof raw.projects === "object" ? raw.projects : {};
  const entries = [];
  let totalHistoryCount = 0;

  for (const [projectPath, detail] of Object.entries(projects)) {
    const history = Array.isArray(detail?.history) ? detail.history : [];
    totalHistoryCount += history.length;
    entries.push({
      path: projectPath,
      historyCount: history.length,
      approxSize: JSON.stringify(detail || {}).length,
    });
  }

  entries.sort((a, b) => b.historyCount - a.historyCount);
  return {
    filePath,
    exists: true,
    fileSize: text.length,
    fileSizeText: formatBytes(text.length),
    projectCount: entries.length,
    totalHistoryCount,
    cachedChangelogSize: JSON.stringify(raw.cachedChangelog || "").length,
    topProjects: entries.slice(0, 10),
  };
}

export function cleanClaudeHistory(options = {}) {
  const filePath = TARGET_PATHS.claudeHistory;
  if (!fileExists(filePath)) {
    throw new Error(`${filePath} does not exist.`);
  }

  const keepRecentCount =
    options.keepRecentCount === undefined ? 10 : Math.max(0, Number(options.keepRecentCount));
  const cleanProjectHistory = options.cleanProjectHistory !== false;
  const cleanCache = Boolean(options.cleanCache);
  const cleanStats = Boolean(options.cleanStats);
  const before = analyzeClaudeHistory();
  const data = readJson(filePath, {});

  const backup = backupFileIfExists(filePath);
  const projects = data.projects && typeof data.projects === "object" ? data.projects : {};
  let removedHistoryCount = 0;

  if (cleanProjectHistory) {
    for (const detail of Object.values(projects)) {
      if (!Array.isArray(detail?.history)) continue;
      const oldCount = detail.history.length;
      detail.history = detail.history.slice(-keepRecentCount);
      removedHistoryCount += oldCount - detail.history.length;
    }
  }

  if (cleanCache) {
    delete data.cachedChangelog;
    data.changelogLastFetched = 0;
  }

  if (cleanStats) {
    data.numStartups = 0;
    data.promptQueueUseCount = 0;
    data.tipsHistory = {};
  }

  writeJsonAtomic(filePath, data);
  const after = analyzeClaudeHistory();

  return {
    backupPath: backup,
    keepRecentCount,
    removedHistoryCount,
    cleanedCache: cleanCache,
    cleanedStats: cleanStats,
    before,
    after,
    savedBytes: before.fileSize - after.fileSize,
    savedText: formatBytes(before.fileSize - after.fileSize),
  };
}
