import React, { useState } from 'react';
import { useStore } from '../stores/useStore';
import { showToast } from './Toast';

export default function DeployBar() {
  const selectedFiles = useStore((s) => s.selectedFiles);
  const deploying = useStore((s) => s.deploying);
  const deployProgress = useStore((s) => s.deployProgress);
  const deploy = useStore((s) => s.deploy);

  const [error, setError] = useState(null);
  const count = selectedFiles.size;

  const handleDeploy = async () => {
    setError(null);
    const result = await deploy();
    if (!result) return;
    if (result.success) {
      const ok = result.results?.filter((r) => r.status === 'success').length || 0;
      const fail = result.results?.filter((r) => r.status === 'error').length || 0;
      if (fail > 0) {
        showToast(`Deploy parcial: ${ok} ok, ${fail} erro(s)`, 'error');
      } else {
        showToast(`Deploy concluído — ${ok} arquivo${ok !== 1 ? 's' : ''} enviado${ok !== 1 ? 's' : ''}`, 'success');
      }
    } else {
      const msg = result.error || 'Erro ao fazer deploy';
      setError(msg);
      showToast(msg, 'error');
    }
  };

  return (
    <div className="deploy-bar">
      <div className="deploy-info">
        <span className="deploy-count font-sans">
          <strong>{count}</strong> arquivo{count !== 1 ? 's' : ''} selecionado{count !== 1 ? 's' : ''}
        </span>
        {error && (
          <span style={{ fontSize: 11, color: 'var(--red)', marginLeft: 8 }}>
            {error}
          </span>
        )}
      </div>

      {deploying && deployProgress && (
        <div className="deploy-progress">
          <div className="deploy-progress-bar">
            <div
              className="deploy-progress-fill"
              style={{
                width: `${deployProgress.total > 0 ? (deployProgress.current / deployProgress.total) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="deploy-progress-text font-sans">
            Enviando {deployProgress.current}/{deployProgress.total}...
          </div>
        </div>
      )}

      <button
        className="deploy-btn"
        disabled={count === 0 || deploying}
        onClick={handleDeploy}
      >
        {deploying ? 'Enviando...' : `Deploy ${count > 0 ? `(${count})` : ''}`}
      </button>
    </div>
  );
}
