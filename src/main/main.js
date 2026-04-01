const { app, BrowserWindow, ipcMain, dialog, shell, Notification } = require("electron");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const { FileWatcher } = require("./watcher");
const { ConfigStore } = require("./config");
const { MCPServer } = require("./mcp-server");
const { SftpManager } = require("./sftp");

let mainWindow;
let watcher;
let mcpServer;
let sftp = null;
const config = new ConfigStore();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 500,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0a0f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/dist/index.html"));
  }
}

// ─── File Watcher ──────────────────────────────────────────────

function startWatcher() {
  const projects = config.get("projects", []);
  const activeId = config.get("activeProject", null);
  const project = projects.find((p) => p.id === activeId);
  if (!project) return;

  if (watcher) watcher.stop();

  watcher = new FileWatcher(project.localPath, project.ignorePatterns || []);
  watcher.on("change", (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("file:changed", data);
    }
  });
  watcher.start();
}

function stopWatcher() {
  if (watcher) { watcher.stop(); watcher = null; }
}

// ─── MCP Server ────────────────────────────────────────────────

function startMCPServer() {
  const port = config.get("mcpPort", 3500);
  if (mcpServer) mcpServer.stop();

  mcpServer = new MCPServer(port);

  mcpServer.on("file-notify", (data) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const projects = config.get("projects", []);
    const activeId = config.get("activeProject", null);
    const project = projects.find((p) => p.id === activeId);

    const relativePath = data.filePath;
    const absolutePath = project
      ? path.join(project.localPath, relativePath)
      : null;

    let fileSize = null;
    if (absolutePath) {
      try {
        fileSize = fs.statSync(absolutePath).size;
      } catch (_) {
        // File may not exist yet or was deleted — size stays null
      }
    }

    // Send as file:changed so addChangedFile upserts the entry whether or
    // not the watcher has already seen it.
    mainWindow.webContents.send("file:changed", {
      relativePath,
      absolutePath,
      eventType: data.changeType || "modified",
      source: data.agent || "mcp-agent",
      timestamp: Date.now(),
      fileSize,
      description: data.description || null,
    });
  });

  mcpServer.on("agent-connected", (name) => {
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send("mcp:agent-connected", name);
  });

  mcpServer.on("agent-disconnected", (name) => {
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send("mcp:agent-disconnected", name);
  });

  mcpServer.start();
}

// ─── IPC Handlers ──────────────────────────────────────────────

ipcMain.handle("config:get", (_, key, def) => config.get(key, def));
ipcMain.handle("config:set", (_, key, val) => { config.set(key, val); return true; });
ipcMain.handle("config:getAll", () => config.getAll());

ipcMain.handle("project:getAll", () => config.get("projects", []));

ipcMain.handle("project:getActive", () => {
  const projects = config.get("projects", []);
  const activeId = config.get("activeProject", null);
  return projects.find((p) => p.id === activeId) || null;
});

ipcMain.handle("project:setActive", (_, id) => {
  config.set("activeProject", id);
  startWatcher();
  return true;
});

ipcMain.handle("project:save", (_, project) => {
  const projects = config.get("projects", []);
  const idx = projects.findIndex((p) => p.id === project.id);
  if (idx >= 0) projects[idx] = project;
  else { project.id = project.id || `proj_${Date.now()}`; projects.push(project); }
  config.set("projects", projects);
  // Auto-set as active if it's the first project or already active
  if (!config.get("activeProject") || config.get("activeProject") === project.id) {
    config.set("activeProject", project.id);
    startWatcher();
  }
  return project;
});

ipcMain.handle("project:delete", (_, id) => {
  let projects = config.get("projects", []).filter((p) => p.id !== id);
  config.set("projects", projects);
  if (config.get("activeProject") === id) {
    config.set("activeProject", projects[0]?.id || null);
    startWatcher();
  }
  return true;
});

ipcMain.handle("watcher:start", () => { startWatcher(); return true; });
ipcMain.handle("watcher:stop", () => { stopWatcher(); return true; });
ipcMain.handle("watcher:status", () => watcher ? watcher.isRunning : false);

ipcMain.handle("dialog:selectFolder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("dialog:selectFile", async (_, options = {}) => {
  const home = app.getPath("home");
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "showHiddenFiles"],
    defaultPath: options.defaultPath || path.join(home, ".ssh"),
    filters: options.filters || [{ name: "Todos os arquivos", extensions: ["*"] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("mcp:status", () => {
  return mcpServer
    ? { running: true, port: mcpServer.port, agents: mcpServer.getConnectedAgents() }
    : { running: false, port: null, agents: [] };
});
ipcMain.handle("mcp:restart", () => { startMCPServer(); return true; });
ipcMain.handle("mcp:setPort", (_, port) => {
  config.set("mcpPort", port);
  startMCPServer();
  return true;
});
ipcMain.handle("mcp:getPort", () => config.get("mcpPort", 3500));

ipcMain.handle("history:get", () => config.get("deployHistory", []));
ipcMain.handle("history:add", (_, entry) => {
  const history = config.get("deployHistory", []);
  history.unshift({ ...entry, timestamp: Date.now() });
  config.set("deployHistory", history.slice(0, 100));
  return true;
});

ipcMain.handle("history:rollback", async (_, entry) => {
  if (!sftp || !sftp.connected) {
    return { success: false, error: "SFTP não conectado" };
  }

  if (!entry.backupPath) {
    return { success: false, error: "Nenhum backup disponível para este deploy" };
  }

  if (!fs.existsSync(entry.backupPath)) {
    return { success: false, error: "Pasta de backup não encontrada no disco" };
  }

  const projects = config.get("projects", []);
  const activeId = config.get("activeProject", null);
  const project = projects.find((p) => p.id === activeId);
  if (!project) {
    return { success: false, error: "Nenhum projeto ativo" };
  }

  const filesToRollback = (entry.files || []).filter(
    (f) => typeof f !== "string" && f.status === "success"
  );

  if (filesToRollback.length === 0) {
    return { success: false, error: "Nenhum arquivo para desfazer" };
  }

  const results = [];

  for (const fileEntry of filesToRollback) {
    const relativePath = fileEntry.file;
    const backupFile = path.join(entry.backupPath, relativePath);
    const remotePath = project.remotePath + relativePath.replace(/\\/g, "/");

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("sftp:upload-progress", {
        file: relativePath,
        status: "uploading",
        current: results.length + 1,
        total: filesToRollback.length,
        rollback: true,
      });
    }

    if (!fs.existsSync(backupFile)) {
      results.push({ file: relativePath, status: "skipped", error: "Backup não encontrado (arquivo era novo)" });
      continue;
    }

    try {
      await sftp.upload(backupFile, remotePath);
      results.push({ file: relativePath, status: "success" });
    } catch (err) {
      results.push({ file: relativePath, status: "error", error: err.message });
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("sftp:upload-progress", {
        file: relativePath,
        status: results[results.length - 1].status === "success" ? "done" : "error",
        current: results.length,
        total: filesToRollback.length,
        rollback: true,
      });
    }
  }

  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const skippedCount = results.filter((r) => r.status === "skipped").length;

  // Save rollback entry to history
  const history = config.get("deployHistory", []);
  history.unshift({
    timestamp: Date.now(),
    type: "rollback",
    files: results,
    totalFiles: filesToRollback.length,
    successCount,
    errorCount,
    skippedCount,
    originalTimestamp: entry.timestamp,
  });
  config.set("deployHistory", history.slice(0, 100));

  if (Notification.isSupported()) {
    const n = new Notification({
      title: "DeploySync — Rollback",
      body: errorCount > 0
        ? `${successCount} restaurado(s), ${errorCount} erro(s)`
        : `${successCount} arquivo${successCount !== 1 ? "s" : ""} restaurado${successCount !== 1 ? "s" : ""}`,
      silent: false,
    });
    n.show();
  }

  return { success: true, results };
});

// ─── SFTP ───────────────────────────────────────────────────────
ipcMain.handle("sftp:connect", async (_, sftpConfig) => {
  try {
    if (sftp) await sftp.disconnect().catch(() => {});
    sftp = new SftpManager();
    await sftp.connect(sftpConfig);
    return { success: true };
  } catch (err) {
    sftp = null;
    return { success: false, error: err.message };
  }
});

ipcMain.handle("sftp:disconnect", async () => {
  if (sftp) {
    await sftp.disconnect().catch(() => {});
    sftp = null;
  }
  return { success: true };
});

ipcMain.handle("sftp:status", () => {
  return { connected: sftp?.connected || false };
});

ipcMain.handle("sftp:upload", async (_, { files, deletedFiles = [], localBase, remoteBase, backup }) => {
  if (!sftp || !sftp.connected) {
    return { success: false, error: "SFTP não conectado" };
  }

  const backupEnabled = backup !== false;
  const backupDir = path.join(app.getPath("userData"), "backups", String(Date.now()));
  if (backupEnabled) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const results = [];
  const MAX_RETRIES = 2;
  const totalCount = files.length + deletedFiles.length;

  // ─── Delete remote files that were deleted locally ─────────────
  for (const relPath of deletedFiles) {
    const remotePath = remoteBase + "/" + relPath.replace(/\\/g, "/");

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("sftp:upload-progress", {
        file: relPath,
        status: "deleting",
        current: results.length + 1,
        total: totalCount,
      });
    }

    // Backup remote file before deleting
    if (backupEnabled) {
      try {
        const remoteExists = await sftp.exists(remotePath);
        if (remoteExists) {
          const backupFile = path.join(backupDir, relPath);
          fs.mkdirSync(path.dirname(backupFile), { recursive: true });
          await sftp.download(remotePath, backupFile);
        }
      } catch (_) {
        // Backup failure shouldn't block delete
      }
    }

    // Delete with retry
    let deleted = false;
    let lastError = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        await sftp.delete(remotePath);
        deleted = true;
        break;
      } catch (err) {
        lastError = err;
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
      }
    }

    results.push(deleted
      ? { file: relPath, status: "success", action: "deleted" }
      : { file: relPath, status: "error", error: lastError?.message || "Delete failed" }
    );

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("sftp:upload-progress", {
        file: relPath,
        status: deleted ? "done" : "error",
        current: results.length,
        total: totalCount,
      });
    }
  }

  // ─── Upload files ──────────────────────────────────────────────
  for (const file of files) {
    const relativePath = file.replace(localBase, "");
    const remotePath = remoteBase + relativePath.replace(/\\/g, "/");

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("sftp:upload-progress", {
        file: relativePath,
        status: "uploading",
        current: results.length + 1,
        total: totalCount,
      });
    }

    // Backup remote file before overwriting
    if (backupEnabled) {
      try {
        const remoteExists = await sftp.exists(remotePath);
        if (remoteExists) {
          const backupFile = path.join(backupDir, relativePath);
          fs.mkdirSync(path.dirname(backupFile), { recursive: true });
          await sftp.download(remotePath, backupFile);
        }
      } catch (_) {
        // Backup failure shouldn't block upload
      }
    }

    // Upload with retry
    let uploaded = false;
    let lastError = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        await sftp.upload(file, remotePath);
        uploaded = true;
        break;
      } catch (err) {
        lastError = err;
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
      }
    }

    if (uploaded) {
      results.push({ file: relativePath, status: "success" });
    } else {
      results.push({ file: relativePath, status: "error", error: lastError?.message || "Upload failed" });
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("sftp:upload-progress", {
        file: relativePath,
        status: uploaded ? "done" : "error",
        current: results.length,
        total: totalCount,
      });
    }
  }

  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  // Save to deploy history
  const history = config.get("deployHistory", []);
  history.unshift({
    timestamp: Date.now(),
    files: results,
    totalFiles: totalCount,
    successCount,
    errorCount,
    backupPath: backupEnabled ? backupDir : null,
  });
  config.set("deployHistory", history.slice(0, 100));

  // Native notification
  if (Notification.isSupported()) {
    const n = new Notification({
      title: "DeploySync — Deploy",
      body: errorCount > 0
        ? `${successCount} ok, ${errorCount} erro(s)`
        : `${successCount} arquivo${successCount !== 1 ? "s" : ""} sincronizado${successCount !== 1 ? "s" : ""}`,
      silent: false,
    });
    n.show();
  }

  return { success: true, results };
});

// ─── DIFF ────────────────────────────────────────────────────────
ipcMain.handle("diff:get", async (_, { localFile, remoteBase, localBase }) => {
  try {
    const relativePath = localFile.replace(localBase, "");
    const remotePath = remoteBase + relativePath.replace(/\\/g, "/");

    // Read local
    let localContent = "";
    try {
      localContent = fs.readFileSync(localFile, "utf8");
    } catch {
      localContent = "[Arquivo local não encontrado]";
    }

    // Read remote
    let remoteContent = "";
    if (sftp && sftp.connected) {
      try {
        const tmpFile = path.join(app.getPath("temp"), `deploysync_diff_${Date.now()}`);
        await sftp.download(remotePath, tmpFile);
        remoteContent = fs.readFileSync(tmpFile, "utf8");
        fs.unlinkSync(tmpFile);
      } catch {
        remoteContent = "[Arquivo remoto não encontrado]";
      }
    } else {
      remoteContent = "[SFTP não conectado]";
    }

    return { success: true, localContent, remoteContent, relativePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("shell:openExternal", (_, url) => shell.openExternal(url));
ipcMain.handle("fs:exists", (_, p) => fs.existsSync(p));

// ─── MCP Stdio Adapter — Auto-install for Editors ────────────

function getAdapterPath() {
  return path.join(app.getPath("userData"), "mcp-stdio-adapter.js");
}

function copyAdapterToUserData() {
  const src = path.join(__dirname, "mcp-stdio-adapter.js");
  const dest = getAdapterPath();
  try {
    fs.copyFileSync(src, dest);
    fs.chmodSync(dest, 0o755);
    console.log(`[MCP] Adapter copied to ${dest}`);
  } catch (err) {
    console.error("[MCP] Failed to copy adapter:", err.message);
  }
}

function getEditorConfigPath(editor) {
  const home = app.getPath("home");
  switch (editor) {
    case "cursor":
      return path.join(home, ".cursor", "mcp.json");
    case "claude-code":
      return path.join(home, ".claude.json");
    case "windsurf":
      return path.join(home, ".codeium", "windsurf", "mcp_config.json");
    case "vscode":
      return path.join(home, ".vscode", "mcp.json");
    case "antigravity":
      return path.join(home, ".gemini", "antigravity", "mcp_config.json");
    default:
      return null;
  }
}

function buildMcpEntry(editor) {
  const adapterPath = getAdapterPath();
  const mcpPort = config.get("mcpPort", 3500);

  if (editor === "vscode") {
    return {
      type: "stdio",
      command: "node",
      args: [adapterPath, "--port", String(mcpPort)],
    };
  }

  return {
    command: "node",
    args: [adapterPath, "--port", String(mcpPort)],
  };
}

ipcMain.handle("mcp:getAdapterPath", () => getAdapterPath());

ipcMain.handle("mcp:installEditor", async (_, editor) => {
  try {
    copyAdapterToUserData();

    const configPath = getEditorConfigPath(editor);
    if (!configPath) {
      return { success: false, error: `Editor "${editor}" não suportado` };
    }

    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let existingConfig = {};
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, "utf8");
        existingConfig = JSON.parse(raw);
      } catch {
        existingConfig = {};
      }
    }

    const entry = buildMcpEntry(editor);

    if (editor === "vscode") {
      if (!existingConfig.servers) existingConfig.servers = {};
      existingConfig.servers["deploysync"] = entry;
    } else {
      if (!existingConfig.mcpServers) existingConfig.mcpServers = {};
      existingConfig.mcpServers["deploysync"] = entry;
    }

    fs.writeFileSync(configPath, JSON.stringify(existingConfig, null, 2), "utf8");

    return { success: true, configPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("mcp:uninstallEditor", async (_, editor) => {
  try {
    const configPath = getEditorConfigPath(editor);
    if (!configPath || !fs.existsSync(configPath)) {
      return { success: true };
    }

    const raw = fs.readFileSync(configPath, "utf8");
    const existingConfig = JSON.parse(raw);

    if (editor === "vscode") {
      if (existingConfig.servers) delete existingConfig.servers["deploysync"];
    } else {
      if (existingConfig.mcpServers) delete existingConfig.mcpServers["deploysync"];
    }

    fs.writeFileSync(configPath, JSON.stringify(existingConfig, null, 2), "utf8");
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("mcp:checkEditorInstalled", async (_, editor) => {
  try {
    const configPath = getEditorConfigPath(editor);
    if (!configPath || !fs.existsSync(configPath)) return false;

    const raw = fs.readFileSync(configPath, "utf8");
    const cfg = JSON.parse(raw);

    if (editor === "vscode") {
      return !!(cfg.servers && cfg.servers["deploysync"]);
    }
    return !!(cfg.mcpServers && cfg.mcpServers["deploysync"]);
  } catch {
    return false;
  }
});

// ─── Editor Agent Rules ────────────────────────────────────────

function getEditorRuleContent(editor) {
  const ruleBase = `After creating, modifying, or deleting any project file, you MUST call the \`notify_file_change\` MCP tool from the \`deploysync\` server with:
- filePath: the relative path of the file (e.g. "src/index.js")
- changeType: "created", "modified", or "deleted"
- agent: "${editor}"
- description: a brief summary of what was changed

If you changed multiple files at once, use \`notify_batch_changes\` instead, passing an array of changes with the same fields.

This is mandatory for EVERY file operation. Never skip this step.`;

  switch (editor) {
    case "cursor":
      return `---
description: DeploySync — notify file changes for deploy tracking
alwaysApply: true
---

${ruleBase}`;

    case "claude-code":
      return `\n# DeploySync Integration\n\n${ruleBase}`;

    case "windsurf":
      return `\n# DeploySync Integration\n\n${ruleBase}`;

    case "vscode":
      return `\n# DeploySync Integration\n\n${ruleBase}`;

    case "antigravity":
      return `\n# DeploySync Integration\n\n${ruleBase}`;

    default:
      return ruleBase;
  }
}

function getEditorRulePath(editor, projectPath) {
  switch (editor) {
    case "cursor":
      return path.join(projectPath, ".cursor", "rules", "deploysync.mdc");
    case "claude-code":
      return path.join(projectPath, "CLAUDE.md");
    case "windsurf":
      return path.join(projectPath, ".windsurfrules");
    case "vscode":
      return path.join(projectPath, ".github", "copilot-instructions.md");
    case "antigravity":
      return path.join(projectPath, "GEMINI.md");
    default:
      return null;
  }
}

ipcMain.handle("mcp:installEditorRules", async (_, editor) => {
  try {
    const projects = config.get("projects", []);
    const activeId = config.get("activeProject", null);
    const project = projects.find((p) => p.id === activeId);
    if (!project) {
      return { success: false, error: "Nenhum projeto ativo" };
    }

    const rulePath = getEditorRulePath(editor, project.localPath);
    if (!rulePath) {
      return { success: false, error: `Editor "${editor}" não suportado` };
    }

    const dir = path.dirname(rulePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const ruleContent = getEditorRuleContent(editor);

    if (editor === "cursor") {
      // Cursor: write standalone .mdc file (overwrite)
      fs.writeFileSync(rulePath, ruleContent, "utf8");
    } else {
      // Others: append to existing file if it exists, or create
      if (fs.existsSync(rulePath)) {
        const existing = fs.readFileSync(rulePath, "utf8");
        if (existing.includes("DeploySync Integration")) {
          // Already installed
          return { success: true, rulePath, alreadyInstalled: true };
        }
        fs.appendFileSync(rulePath, "\n" + ruleContent, "utf8");
      } else {
        fs.writeFileSync(rulePath, ruleContent.trimStart(), "utf8");
      }
    }

    return { success: true, rulePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("mcp:uninstallEditorRules", async (_, editor) => {
  try {
    const projects = config.get("projects", []);
    const activeId = config.get("activeProject", null);
    const project = projects.find((p) => p.id === activeId);
    if (!project) {
      return { success: true };
    }

    const rulePath = getEditorRulePath(editor, project.localPath);
    if (!rulePath || !fs.existsSync(rulePath)) {
      return { success: true };
    }

    if (editor === "cursor") {
      // Remove the entire .mdc file
      fs.unlinkSync(rulePath);
    } else {
      // Remove the DeploySync section from the file
      const content = fs.readFileSync(rulePath, "utf8");
      const marker = "# DeploySync Integration";
      const idx = content.indexOf(marker);
      if (idx >= 0) {
        // Remove from marker to end of the deploysync block
        // Find next "# " heading or end of file
        const afterMarker = content.substring(idx + marker.length);
        const nextHeading = afterMarker.search(/\n# [^#]/);
        const cleaned = nextHeading >= 0
          ? content.substring(0, idx).trimEnd() + "\n" + afterMarker.substring(nextHeading + 1)
          : content.substring(0, idx).trimEnd();
        if (cleaned.trim()) {
          fs.writeFileSync(rulePath, cleaned + "\n", "utf8");
        } else {
          fs.unlinkSync(rulePath);
        }
      }
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("mcp:checkEditorRulesInstalled", async (_, editor) => {
  try {
    const projects = config.get("projects", []);
    const activeId = config.get("activeProject", null);
    const project = projects.find((p) => p.id === activeId);
    if (!project) return false;

    const rulePath = getEditorRulePath(editor, project.localPath);
    if (!rulePath || !fs.existsSync(rulePath)) return false;

    if (editor === "cursor") {
      return true; // .mdc file exists = installed
    }

    const content = fs.readFileSync(rulePath, "utf8");
    return content.includes("DeploySync Integration");
  } catch {
    return false;
  }
});

// ─── App Lifecycle ─────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  startWatcher();
  startMCPServer();
  copyAdapterToUserData();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopWatcher();
  if (sftp) sftp.disconnect().catch(() => {});
  if (mcpServer) mcpServer.stop();
  if (process.platform !== "darwin") app.quit();
});
