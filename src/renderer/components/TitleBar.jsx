import React, { useState } from 'react';
import { useStore } from '../stores/useStore';
import { showToast } from './Toast';

export default function TitleBar() {
  const project = useStore((s) => s.project);
  const watcherActive = useStore((s) => s.watcherActive);
  const sftpConnected = useStore((s) => s.sftpConnected);
  const startWatcher = useStore((s) => s.startWatcher);
  const stopWatcher = useStore((s) => s.stopWatcher);
  const connectSftp = useStore((s) => s.connectSftp);
  const disconnectSftp = useStore((s) => s.disconnectSftp);

  const [connecting, setConnecting] = useState(false);

  const toggleWatcher = () => {
    if (watcherActive) stopWatcher();
    else startWatcher();
  };

  const toggleSftp = async () => {
    if (sftpConnected) {
      await disconnectSftp();
      showToast('SFTP desconectado', 'info');
    } else {
      if (!project?.sftp?.host) {
        showToast('Configure o SFTP nas configurações primeiro', 'error');
        return;
      }
      setConnecting(true);
      const result = await connectSftp();
      setConnecting(false);
      if (result.success) {
        showToast('SFTP conectado', 'success');
      } else {
        showToast(`Erro SFTP: ${result.error}`, 'error');
      }
    }
  };

  return (
    <div className="titlebar">
      <div className="titlebar-left">
        <span className="app-name">&#x2B21; DeploySync</span>
        {project && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            / {project.name}
          </span>
        )}
      </div>
      <div className="titlebar-right">
        <button
          className={`watcher-toggle ${sftpConnected ? 'active' : ''}`}
          onClick={toggleSftp}
          disabled={connecting}
          title={sftpConnected ? 'Clique para desconectar SFTP' : 'Clique para conectar SFTP'}
          style={sftpConnected ? { '--toggle-color': 'var(--green)' } : {}}
        >
          <span className={`status-dot ${sftpConnected ? 'online' : 'offline'}`} />
          <span className="watcher-toggle-label" style={sftpConnected ? { color: 'var(--green)' } : {}}>
            {connecting ? 'Conectando...' : sftpConnected ? 'SFTP' : 'SFTP'}
          </span>
        </button>
        <div className="status-divider" />
        <button
          className={`watcher-toggle ${watcherActive ? 'active' : ''}`}
          onClick={toggleWatcher}
          title={watcherActive ? 'Clique para parar o watcher' : 'Clique para iniciar o watcher'}
        >
          <span className={`status-dot ${watcherActive ? 'watching' : 'offline'}`} />
          <span className="watcher-toggle-label">
            {watcherActive ? 'Observando' : 'Parado'}
          </span>
        </button>
      </div>
    </div>
  );
}
