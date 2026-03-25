import React, { useEffect, useState } from 'react';
import { useStore } from '../stores/useStore';

function formatTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;

  const time = d.toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const date = d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit' });

  if (diff < 86400000 && d.getDate() === now.getDate()) return `Hoje ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth()) return `Ontem ${time}`;
  return `${date} ${time}`;
}

function getFileName(f) {
  if (typeof f === 'string') return f;
  return f.file || f.relativePath || '';
}

export default function HistoryPanel() {
  const deployHistory = useStore((s) => s.deployHistory);
  const loadHistory = useStore((s) => s.loadHistory);
  const rollbackDeploy = useStore((s) => s.rollbackDeploy);
  const isDeploying = useStore((s) => s.isDeploying);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all, success, error
  const [expanded, setExpanded] = useState(null); // index of expanded entry
  const [rollingBack, setRollingBack] = useState(null); // index being rolled back
  const [confirmRollback, setConfirmRollback] = useState(null); // index awaiting confirmation

  useEffect(() => {
    loadHistory();
  }, []);

  const toggleExpand = (i) => {
    setExpanded(expanded === i ? null : i);
  };

  const handleRollback = async (entry, index) => {
    if (confirmRollback !== index) {
      setConfirmRollback(index);
      return;
    }
    setConfirmRollback(null);
    setRollingBack(index);
    try {
      const result = await rollbackDeploy(entry);
      if (!result?.success) {
        alert(`Erro no rollback: ${result?.error || 'Erro desconhecido'}`);
      }
    } catch (err) {
      alert(`Erro no rollback: ${err.message}`);
    }
    setRollingBack(null);
  };

  // Filter entries
  const filtered = deployHistory.filter((entry) => {
    // Filter by status
    if (filter === 'success' && entry.errorCount > 0) return false;
    if (filter === 'error' && (!entry.errorCount || entry.errorCount === 0)) return false;

    // Filter by search
    if (search.trim()) {
      const q = search.toLowerCase();
      const files = entry.files || [];
      const matchesFile = files.some((f) => getFileName(f).toLowerCase().includes(q));
      const matchesProject = (entry.projectName || '').toLowerCase().includes(q);
      if (!matchesFile && !matchesProject) return false;
    }

    return true;
  });

  if (deployHistory.length === 0) {
    return (
      <div className="history-empty">
        <div style={{ fontSize: 28, opacity: 0.3 }}>&#128640;</div>
        <div className="font-sans" style={{ fontSize: 14 }}>Nenhum deploy realizado</div>
        <div style={{ fontSize: 11 }}>Selecione arquivos e faça deploy para ver o histórico</div>
      </div>
    );
  }

  return (
    <>
      <div className="history-header">
        <span className="history-title">Histórico de Deploys</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            className={`source-tag ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Todos
          </button>
          <button
            className={`source-tag ${filter === 'success' ? 'active' : ''}`}
            onClick={() => setFilter('success')}
          >
            OK
          </button>
          <button
            className={`source-tag ${filter === 'error' ? 'active' : ''}`}
            onClick={() => setFilter('error')}
          >
            Erros
          </button>
        </div>
      </div>

      <div className="history-search">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por arquivo ou projeto..."
        />
      </div>

      <div className="history-panel">
        {filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
            Nenhum registro encontrado
          </div>
        )}

        {filtered.map((entry, i) => {
          const realIndex = deployHistory.indexOf(entry);
          const isExpanded = expanded === realIndex;
          const files = Array.isArray(entry.files) ? entry.files : [];
          const totalFiles = entry.totalFiles || files.length || 0;
          const successCount = entry.successCount != null ? entry.successCount : files.filter((f) => typeof f !== 'string' && f.status === 'success').length;
          const errorCount = entry.errorCount || 0;

          return (
            <div key={realIndex} className="history-item">
              <div
                className="history-item-header"
                style={{ cursor: 'pointer' }}
                onClick={() => toggleExpand(realIndex)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="history-expand">
                    {isExpanded ? '▼' : '▶'}
                  </span>
                  <span className="history-time">{formatTimestamp(entry.timestamp)}</span>
                  {entry.type === 'rollback' && (
                    <span className="rollback-badge">↩ rollback</span>
                  )}
                  {entry.projectName && (
                    <span style={{
                      fontSize: 9,
                      padding: '2px 6px',
                      borderRadius: 8,
                      background: 'var(--bg-surface)',
                      color: 'var(--text-dim)',
                    }}>
                      {entry.projectName}
                    </span>
                  )}
                </div>
                <div className="history-stats">
                  <span className="history-stat">
                    {totalFiles} arquivo{totalFiles !== 1 ? 's' : ''}
                  </span>
                  {successCount > 0 && (
                    <span className="history-stat success">
                      {successCount} ok
                    </span>
                  )}
                  {errorCount > 0 && (
                    <span className="history-stat error">
                      {errorCount} erro{errorCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>

              {!isExpanded && files.length > 0 && (
                <div className="history-files">
                  {files.slice(0, 5).map((f, j) => {
                    const name = getFileName(f);
                    const short = name.split('/').pop();
                    return (
                      <span key={j} className="history-file-tag" title={name}>
                        {short}
                      </span>
                    );
                  })}
                  {files.length > 5 && (
                    <span className="history-file-tag">+{files.length - 5}</span>
                  )}
                </div>
              )}

              {isExpanded && files.length > 0 && (
                <div className="history-item-detail">
                  {files.map((f, j) => {
                    const name = getFileName(f);
                    const status = typeof f === 'string' ? 'success' : (f.status || 'success');
                    const error = typeof f !== 'string' ? f.error : null;

                    return (
                      <div key={j} className="history-file-row">
                        <span className={`history-file-status ${status}`}>
                          {status === 'success' ? '✓' : status === 'skipped' ? '⊘' : '✗'}
                        </span>
                        <span className="history-file-name" title={name}>
                          {name}
                        </span>
                        {error && (
                          <span className="history-file-error" title={error}>
                            {error.length > 40 ? error.slice(0, 40) + '...' : error}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {entry.backupPath && entry.type !== 'rollback' && successCount > 0 && (
                    <div className="history-rollback-area">
                      <button
                        className={`btn-rollback ${confirmRollback === realIndex ? 'confirming' : ''}`}
                        disabled={rollingBack === realIndex || isDeploying}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRollback(entry, realIndex);
                        }}
                      >
                        {rollingBack === realIndex
                          ? 'Restaurando...'
                          : confirmRollback === realIndex
                            ? 'Confirmar rollback?'
                            : '↩ Desfazer deploy'}
                      </button>
                      {confirmRollback === realIndex && (
                        <button
                          className="btn-rollback-cancel"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmRollback(null);
                          }}
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
