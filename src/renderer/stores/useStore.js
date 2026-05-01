import { create } from 'zustand';

const api = typeof window !== 'undefined' ? window.api : null;

export const useStore = create((set, get) => ({
  // ─── Project ──────────────────────────────────────────────
  project: null,
  projects: [],

  loadProjects: async () => {
    if (!api) return;
    const projects = await api.getProjects();
    const active = await api.getActiveProject();
    set({ projects, project: active });
  },

  saveProject: async (project) => {
    if (!api) return;
    const saved = await api.saveProject(project);
    await get().loadProjects();
    return saved;
  },

  deleteProject: async (id) => {
    if (!api) return;
    // Disconnect SFTP if deleting the active project
    const currentProject = get().project;
    if (currentProject?.id === id && get().sftpConnected) {
      await get().disconnectSftp();
    }
    await api.deleteProject(id);
    await get().loadProjects();
  },

  setActiveProject: async (id) => {
    if (!api) return;
    // Disconnect current SFTP before switching
    if (get().sftpConnected) {
      await get().disconnectSftp();
    }
    await api.setActiveProject(id);
    await get().loadProjects();
    get().clearChangedFiles();
    get().startWatcher();
  },

  // ─── Changed Files ────────────────────────────────────────
  changedFiles: [],
  selectedFiles: new Set(),

  addChangedFile: (fileEvent) => {
    set((state) => {
      const existing = state.changedFiles.findIndex(
        (f) => f.relativePath === fileEvent.relativePath
      );
      let next;
      if (existing >= 0) {
        next = [...state.changedFiles];
        next[existing] = { ...next[existing], ...fileEvent };
      } else {
        next = [fileEvent, ...state.changedFiles];
      }
      return { changedFiles: next };
    });
  },

  updateFileSource: (filePath, source, description) => {
    set((state) => {
      const idx = state.changedFiles.findIndex((f) => f.relativePath === filePath);
      if (idx < 0) return state; // file not in list yet, ignore
      const next = [...state.changedFiles];
      next[idx] = { ...next[idx], source, description: description || next[idx].description };
      return { changedFiles: next };
    });
  },

  removeChangedFiles: (paths) => {
    const pathSet = new Set(paths);
    set((state) => ({
      changedFiles: state.changedFiles.filter((f) => !pathSet.has(f.relativePath)),
      selectedFiles: new Set([...state.selectedFiles].filter((p) => !pathSet.has(p))),
    }));
  },

  clearChangedFiles: () => set({ changedFiles: [], selectedFiles: new Set() }),

  addIgnorePattern: async (pattern) => {
    const project = get().project;
    if (!project || !api) return;
    const existing = project.ignorePatterns || [];
    if (existing.includes(pattern)) return;
    const updated = { ...project, ignorePatterns: [...existing, pattern] };
    await api.saveProject(updated);
    await get().loadProjects();
    // Remove matching files from the list
    set((state) => {
      const filtered = state.changedFiles.filter((f) => {
        // Check if file matches the new pattern (simple prefix match for folders)
        if (pattern.endsWith('/**')) {
          const folder = pattern.slice(0, -3);
          return !f.relativePath.startsWith(folder + '/') && f.relativePath !== folder;
        }
        return f.relativePath !== pattern;
      });
      const pathSet = new Set(filtered.map((f) => f.relativePath));
      return {
        changedFiles: filtered,
        selectedFiles: new Set([...state.selectedFiles].filter((p) => pathSet.has(p))),
      };
    });
    // Restart watcher so new ignore patterns take effect
    try { await api.watcherStop(); } catch {}
    try { await api.watcherStart(); } catch {}
  },

  toggleFileSelection: (relativePath) => {
    set((state) => {
      const next = new Set(state.selectedFiles);
      if (next.has(relativePath)) next.delete(relativePath);
      else next.add(relativePath);
      return { selectedFiles: next };
    });
  },

  selectAllFiles: () => {
    set((state) => {
      const filtered = get().getFilteredFiles();
      if (state.selectedFiles.size === filtered.length && filtered.length > 0) {
        return { selectedFiles: new Set() };
      }
      return { selectedFiles: new Set(filtered.map((f) => f.relativePath)) };
    });
  },

  getFilteredFiles: () => {
    const { changedFiles, sourceFilter } = get();
    if (sourceFilter === 'all') return changedFiles;
    return changedFiles.filter((f) => f.source === sourceFilter);
  },

  // ─── Watcher ──────────────────────────────────────────────
  watcherActive: false,

  startWatcher: async () => {
    if (!api) return;
    const result = await api.watcherStart();
    if (result) set({ watcherActive: true });
  },

  stopWatcher: async () => {
    if (!api) return;
    await api.watcherStop();
    set({ watcherActive: false });
  },

  // ─── SFTP / Deploy ───────────────────────────────────────
  sftpConnected: false,
  deploying: false,
  deployProgress: null,

  connectSftp: async () => {
    const project = get().project;
    if (!api || !project?.sftp) return { success: false, error: 'Sem config SFTP' };
    const result = await api.sftpConnect(project.sftp);
    if (result.success) set({ sftpConnected: true });
    return result;
  },

  disconnectSftp: async () => {
    if (!api) return;
    await api.sftpDisconnect();
    set({ sftpConnected: false });
  },

  checkSftpStatus: async () => {
    if (!api) return;
    const result = await api.sftpStatus();
    set({ sftpConnected: result.connected });
  },

  deploy: async () => {
    const { project, changedFiles, selectedFiles, sftpConnected } = get();
    if (!api || !project || selectedFiles.size === 0) return;

    // Auto-connect if not connected
    if (!sftpConnected && project.sftp?.host) {
      const conn = await get().connectSftp();
      if (!conn.success) return conn;
    }

    const selected = changedFiles.filter((f) => selectedFiles.has(f.relativePath));
    const fileType = (f) => f.type || f.eventType || 'modified';

    // Separate normal files (upload) from deleted files (remote delete)
    const filesToUpload = selected
      .filter((f) => fileType(f) !== 'deleted' && fileType(f) !== 'unlink')
      .map((f) => {
        if (f.absolutePath) return f.absolutePath;
        const base = project.localPath.replace(/\/$/, '');
        return base + '/' + f.relativePath;
      });

    const deletedFiles = selected
      .filter((f) => fileType(f) === 'deleted' || fileType(f) === 'unlink')
      .map((f) => f.relativePath);

    const totalFiles = filesToUpload.length + deletedFiles.length;
    set({ deploying: true, deployProgress: { current: 0, total: totalFiles } });

    const result = await api.sftpUpload({
      files: filesToUpload,
      deletedFiles,
      localBase: project.localPath,
      remoteBase: project.remotePath,
    });

    set({ deploying: false, deployProgress: null });

    if (result.disconnected) {
      set({ sftpConnected: false });
    }

    if (result.success) {
      const successPaths = result.results
        .filter((r) => r.status === 'success')
        .map((r) => r.file.replace(/^\//, ''));
      get().removeChangedFiles(successPaths);
      await get().loadHistory();
    }

    return result;
  },

  // ─── Deploy History ───────────────────────────────────────
  deployHistory: [],

  loadHistory: async () => {
    if (!api) return;
    const history = await api.getHistory();
    set({ deployHistory: history });
  },

  rollbackDeploy: async (entry) => {
    if (!api) return { success: false, error: "API não disponível" };
    set({ isDeploying: true });
    try {
      const result = await api.rollbackDeploy(entry);
      await get().loadHistory();
      return result;
    } finally {
      set({ isDeploying: false });
    }
  },

  // ─── MCP ──────────────────────────────────────────────────
  mcpStatus: null,

  loadMcpStatus: async () => {
    if (!api) return;
    const status = await api.mcpStatus();
    set({ mcpStatus: status });
  },

  // ─── UI ───────────────────────────────────────────────────
  activeTab: 'changes',
  showSettings: false,
  settingsTab: 'project',
  sourceFilter: 'all',

  setActiveTab: (tab) => set({ activeTab: tab, showSettings: false }),
  setShowSettings: (show) => set({ showSettings: show, activeTab: show ? null : 'changes' }),
  setSettingsTab: (tab) => set({ settingsTab: tab }),
  setSourceFilter: (filter) => set({ sourceFilter: filter }),
}));
