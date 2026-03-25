import { useEffect } from 'react';
import { useStore } from '../stores/useStore';

const api = typeof window !== 'undefined' ? window.api : null;

export function useElectronEvents() {
  const addChangedFile = useStore((s) => s.addChangedFile);
  const updateFileSource = useStore((s) => s.updateFileSource);

  useEffect(() => {
    if (!api) return;

    const removeFileListener = api.onFileChanged((fileEvent) => {
      const normalized = {
        type: fileEvent.eventType || fileEvent.type || 'modified',
        absolutePath: fileEvent.absolutePath || null,
        relativePath: fileEvent.relativePath || fileEvent.filePath,
        timestamp: fileEvent.timestamp || Date.now(),
        size: fileEvent.fileSize || fileEvent.size || null,
        source: fileEvent.source || 'watcher',
        description: fileEvent.description || null,
      };
      addChangedFile(normalized);
    });

    // When an MCP agent claims a file, just update the source of the existing entry
    const removeSourceUpdate = api.onFileSourceUpdate((data) => {
      updateFileSource(data.filePath, data.source, data.description);
    });

    const removeAgentConnected = api.onMCPAgentConnected((name) => {
      useStore.getState().loadMcpStatus();
    });

    const removeAgentDisconnected = api.onMCPAgentDisconnected((name) => {
      useStore.getState().loadMcpStatus();
    });

    const removeProgressListener = api.onSftpUploadProgress((progress) => {
      useStore.setState({
        deployProgress: { current: progress.current, total: progress.total },
      });
    });

    return () => {
      removeFileListener();
      removeSourceUpdate();
      removeAgentConnected();
      removeAgentDisconnected();
      removeProgressListener();
    };
  }, [addChangedFile, updateFileSource]);
}
