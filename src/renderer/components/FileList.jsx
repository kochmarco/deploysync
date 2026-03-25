import React, { useState } from 'react';
import { useStore } from '../stores/useStore';
import DiffViewer from './DiffViewer';

const STATUS_LABELS = { modified: 'M', created: '+', deleted: '−' };
const STATUS_CLASS = { modified: 'modified', created: 'created', deleted: 'deleted' };

function formatTime(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'agora';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function splitPath(relativePath) {
  const parts = relativePath.split('/');
  const fileName = parts.pop();
  const dir = parts.join('/');
  return { dir: dir ? dir + '/' : '', fileName };
}

export default function FileList() {
  const changedFiles = useStore((s) => s.changedFiles);
  const selectedFiles = useStore((s) => s.selectedFiles);
  const sourceFilter = useStore((s) => s.sourceFilter);
  const toggleFileSelection = useStore((s) => s.toggleFileSelection);
  const selectAllFiles = useStore((s) => s.selectAllFiles);
  const clearChangedFiles = useStore((s) => s.clearChangedFiles);
  const getFilteredFiles = useStore((s) => s.getFilteredFiles);
  const addIgnorePattern = useStore((s) => s.addIgnorePattern);

  const [diffFile, setDiffFile] = useState(null);
  const [ignoreMenu, setIgnoreMenu] = useState(null); // { relativePath, dir, x, y }

  const filteredFiles = getFilteredFiles();
  const allSelected = filteredFiles.length > 0 && selectedFiles.size === filteredFiles.length;

  if (changedFiles.length === 0) {
    return (
      <div className="file-list-empty">
        <div className="file-list-empty-icon">&#128065;</div>
        <div className="file-list-empty-text font-sans">Nenhuma alteração detectada</div>
        <div className="file-list-empty-sub">
          Edite arquivos no seu projeto e eles aparecerão aqui
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="file-list-header">
        <span className="file-list-title">
          {filteredFiles.length} arquivo{filteredFiles.length !== 1 ? 's' : ''} alterado{filteredFiles.length !== 1 ? 's' : ''}
          {sourceFilter !== 'all' && (
            <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}> ({sourceFilter})</span>
          )}
        </span>
        <div className="file-list-actions">
          <button onClick={selectAllFiles}>
            {allSelected ? 'Desmarcar' : 'Selecionar'} todos
          </button>
          <button onClick={clearChangedFiles}>Limpar</button>
        </div>
      </div>
      <div className="file-list-scroll">
        {filteredFiles.map((file) => {
          const { dir, fileName } = splitPath(file.relativePath);
          const isSelected = selectedFiles.has(file.relativePath);
          const type = file.type || file.eventType || 'modified';

          return (
            <div
              key={file.relativePath}
              className={`file-row ${isSelected ? 'selected' : ''}`}
              onClick={() => toggleFileSelection(file.relativePath)}
            >
              <div className={`file-checkbox ${isSelected ? 'checked' : ''}`} />
              <span className={`file-status ${STATUS_CLASS[type] || 'modified'}`}>
                {STATUS_LABELS[type] || 'M'}
              </span>
              <span className="file-path">
                {dir && <span className="dir">{dir}</span>}
                {fileName}
              </span>
              <button
                className="file-diff-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setDiffFile(file);
                }}
                title="Ver diferenças"
              >
                diff
              </button>
              <button
                className="file-ignore-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setIgnoreMenu({
                    relativePath: file.relativePath,
                    dir: dir ? dir.slice(0, -1) : '',
                    x: rect.right,
                    y: rect.bottom,
                  });
                }}
                title="Ignorar"
              >
                ✕
              </button>
              <span className={`file-source ${file.source || 'watcher'}`}>
                {file.source || 'watcher'}
              </span>
              <span className="file-time">{formatTime(file.timestamp)}</span>
            </div>
          );
        })}
      </div>

      {ignoreMenu && (
        <>
          <div
            className="ignore-menu-overlay"
            onClick={() => setIgnoreMenu(null)}
          />
          <div
            className="ignore-menu"
            style={{ top: ignoreMenu.y, left: ignoreMenu.x }}
          >
            <button
              className="ignore-menu-item"
              onClick={() => {
                addIgnorePattern(ignoreMenu.relativePath);
                setIgnoreMenu(null);
              }}
            >
              <span className="ignore-menu-icon">&#128196;</span>
              Ignorar arquivo
              <span className="ignore-menu-hint">{ignoreMenu.relativePath}</span>
            </button>
            {ignoreMenu.dir && (
              <button
                className="ignore-menu-item"
                onClick={() => {
                  addIgnorePattern(ignoreMenu.dir + '/**');
                  setIgnoreMenu(null);
                }}
              >
                <span className="ignore-menu-icon">&#128193;</span>
                Ignorar pasta
                <span className="ignore-menu-hint">{ignoreMenu.dir}/</span>
              </button>
            )}
          </div>
        </>
      )}

      {diffFile && (
        <DiffViewer file={diffFile} onClose={() => setDiffFile(null)} />
      )}
    </>
  );
}
