import React, { useEffect, useState } from 'react';
import { useStore } from '../stores/useStore';

const api = typeof window !== 'undefined' ? window.api : null;

function computeDiff(local, remote) {
  const localLines = local.split('\n');
  const remoteLines = remote.split('\n');
  const lines = [];
  const maxLen = Math.max(localLines.length, remoteLines.length);

  for (let i = 0; i < maxLen; i++) {
    const l = localLines[i];
    const r = remoteLines[i];

    if (l === undefined) {
      lines.push({ type: 'removed', num: i + 1, content: r });
    } else if (r === undefined) {
      lines.push({ type: 'added', num: i + 1, content: l });
    } else if (l !== r) {
      lines.push({ type: 'removed', num: i + 1, content: r });
      lines.push({ type: 'added', num: i + 1, content: l });
    } else {
      lines.push({ type: 'same', num: i + 1, content: l });
    }
  }

  return lines;
}

export default function DiffViewer({ file, onClose }) {
  const project = useStore((s) => s.project);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [diffLines, setDiffLines] = useState([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!api || !project || !file) return;

    setLoading(true);
    setError(null);

    const localFile = file.absolutePath || (project.localPath.replace(/\/$/, '') + '/' + file.relativePath);

    api.getDiff({
      localFile,
      remoteBase: project.remotePath,
      localBase: project.localPath,
    }).then((result) => {
      setLoading(false);
      if (!result.success) {
        setError(result.error);
        return;
      }

      if (result.remoteContent.startsWith('[')) {
        setDiffLines([]);
        setError(result.remoteContent);
        return;
      }

      const lines = computeDiff(result.localContent, result.remoteContent);
      setDiffLines(lines);
    }).catch((err) => {
      setLoading(false);
      setError(err.message);
    });
  }, [file, project]);

  const changedLines = diffLines.filter((l) => l.type !== 'same');
  const displayLines = showAll ? diffLines : getContextLines(diffLines, 3);

  return (
    <div className="diff-overlay">
      <div className="diff-panel">
        <div className="diff-header">
          <div style={{ flex: 1 }}>
            <div className="diff-title font-sans">{file.relativePath}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
              {loading ? 'Carregando...' : error ? error : `${changedLines.length} linha${changedLines.length !== 1 ? 's' : ''} alterada${changedLines.length !== 1 ? 's' : ''}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!loading && !error && diffLines.length > 0 && (
              <button
                className="btn btn-ghost"
                style={{ padding: '4px 10px', fontSize: 11 }}
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? 'Só alterações' : 'Arquivo completo'}
              </button>
            )}
            <button
              className="btn btn-ghost"
              style={{ padding: '4px 10px', fontSize: 11 }}
              onClick={onClose}
            >
              Fechar
            </button>
          </div>
        </div>

        <div className="diff-body">
          {loading && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)' }}>
              Buscando arquivo remoto...
            </div>
          )}

          {!loading && error && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)' }}>
              {error}
            </div>
          )}

          {!loading && !error && changedLines.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--green)' }}>
              Arquivos idênticos
            </div>
          )}

          {!loading && !error && displayLines.map((line, i) => {
            if (line.type === 'separator') {
              return (
                <div key={i} className="diff-line diff-separator">
                  <span className="diff-num">...</span>
                  <span className="diff-content" style={{ color: 'var(--text-dim)' }}>
                    ─── linhas omitidas ───
                  </span>
                </div>
              );
            }
            return (
              <div key={i} className={`diff-line diff-${line.type}`}>
                <span className="diff-num">{line.num}</span>
                <span className="diff-sign">
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                </span>
                <span className="diff-content">{line.content || ' '}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function getContextLines(lines, context) {
  const result = [];
  const changed = new Set();

  lines.forEach((l, i) => {
    if (l.type !== 'same') changed.add(i);
  });

  if (changed.size === 0) return [];

  let lastIncluded = -2;
  lines.forEach((l, i) => {
    let include = changed.has(i);
    if (!include) {
      for (let c = Math.max(0, i - context); c <= Math.min(lines.length - 1, i + context); c++) {
        if (changed.has(c)) { include = true; break; }
      }
    }

    if (include) {
      if (lastIncluded >= 0 && i - lastIncluded > 1) {
        result.push({ type: 'separator' });
      }
      result.push(l);
      lastIncluded = i;
    }
  });

  return result;
}
