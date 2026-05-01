const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // Config
  configGet: (key, def) => ipcRenderer.invoke("config:get", key, def),
  configSet: (key, val) => ipcRenderer.invoke("config:set", key, val),
  configGetAll: () => ipcRenderer.invoke("config:getAll"),

  // Projects
  getProjects: () => ipcRenderer.invoke("project:getAll"),
  getActiveProject: () => ipcRenderer.invoke("project:getActive"),
  setActiveProject: (id) => ipcRenderer.invoke("project:setActive", id),
  saveProject: (project) => ipcRenderer.invoke("project:save", project),
  deleteProject: (id) => ipcRenderer.invoke("project:delete", id),

  // Watcher
  watcherStart: () => ipcRenderer.invoke("watcher:start"),
  watcherStop: () => ipcRenderer.invoke("watcher:stop"),
  watcherStatus: () => ipcRenderer.invoke("watcher:status"),

  // SFTP
  sftpConnect: (config) => ipcRenderer.invoke("sftp:connect", config),
  sftpDisconnect: () => ipcRenderer.invoke("sftp:disconnect"),
  sftpStatus: () => ipcRenderer.invoke("sftp:status"),
  sftpPing: () => ipcRenderer.invoke("sftp:ping"),
  sftpUpload: (payload) => ipcRenderer.invoke("sftp:upload", payload),

  // MCP
  mcpStatus: () => ipcRenderer.invoke("mcp:status"),
  mcpRestart: () => ipcRenderer.invoke("mcp:restart"),
  mcpSetPort: (port) => ipcRenderer.invoke("mcp:setPort", port),
  mcpGetPort: () => ipcRenderer.invoke("mcp:getPort"),

  // Dialog
  selectFolder: () => ipcRenderer.invoke("dialog:selectFolder"),
  selectFile: (options) => ipcRenderer.invoke("dialog:selectFile", options),

  // History
  getHistory: () => ipcRenderer.invoke("history:get"),
  addHistory: (entry) => ipcRenderer.invoke("history:add", entry),
  rollbackDeploy: (entry) => ipcRenderer.invoke("history:rollback", entry),

  // Diff
  getDiff: (payload) => ipcRenderer.invoke("diff:get", payload),

  // MCP Editor Integration
  mcpGetAdapterPath: () => ipcRenderer.invoke("mcp:getAdapterPath"),
  mcpInstallEditor: (editor) => ipcRenderer.invoke("mcp:installEditor", editor),
  mcpUninstallEditor: (editor) => ipcRenderer.invoke("mcp:uninstallEditor", editor),
  mcpCheckEditorInstalled: (editor) => ipcRenderer.invoke("mcp:checkEditorInstalled", editor),
  mcpInstallEditorRules: (editor) => ipcRenderer.invoke("mcp:installEditorRules", editor),
  mcpUninstallEditorRules: (editor) => ipcRenderer.invoke("mcp:uninstallEditorRules", editor),
  mcpCheckEditorRulesInstalled: (editor) => ipcRenderer.invoke("mcp:checkEditorRulesInstalled", editor),

  // Utility
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  fsExists: (p) => ipcRenderer.invoke("fs:exists", p),

  // Events from main
  onFileChanged: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on("file:changed", handler);
    return () => ipcRenderer.removeListener("file:changed", handler);
  },

  onMCPAgentConnected: (cb) => {
    const handler = (_, name) => cb(name);
    ipcRenderer.on("mcp:agent-connected", handler);
    return () => ipcRenderer.removeListener("mcp:agent-connected", handler);
  },

  onMCPAgentDisconnected: (cb) => {
    const handler = (_, name) => cb(name);
    ipcRenderer.on("mcp:agent-disconnected", handler);
    return () => ipcRenderer.removeListener("mcp:agent-disconnected", handler);
  },

  onFileSourceUpdate: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on("file:source-update", handler);
    return () => ipcRenderer.removeListener("file:source-update", handler);
  },

  onSftpUploadProgress: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on("sftp:upload-progress", handler);
    return () => ipcRenderer.removeListener("sftp:upload-progress", handler);
  },
});
