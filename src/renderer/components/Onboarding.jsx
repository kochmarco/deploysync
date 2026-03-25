import React, { useState } from 'react';
import { useStore } from '../stores/useStore';

const api = typeof window !== 'undefined' ? window.api : null;

const STEPS = [
  { key: 'welcome', label: 'Bem-vindo' },
  { key: 'project', label: 'Projeto' },
  { key: 'paths', label: 'Caminhos' },
  { key: 'sftp', label: 'SFTP' },
];

export default function Onboarding() {
  const saveProject = useStore((s) => s.saveProject);
  const startWatcher = useStore((s) => s.startWatcher);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: '',
    localPath: '',
    remotePath: '',
    sftpHost: '',
    sftpPort: '22',
    sftpUsername: '',
    sftpAuthMethod: 'key',
    sftpPrivateKeyPath: '~/.ssh/id_rsa',
    sftpPassphrase: '',
    sftpPassword: '',
  });

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSelectFolder = async () => {
    if (!api) return;
    const folder = await api.selectFolder();
    if (folder) {
      update('localPath', folder);
      if (!form.name) {
        const name = folder.split('/').pop();
        update('name', name);
      }
    }
  };

  const canProceed = () => {
    switch (step) {
      case 0: return true;
      case 1: return form.name.trim() !== '';
      case 2: return form.localPath.trim() !== '' && form.remotePath.trim() !== '';
      case 3: return form.sftpHost.trim() !== '' && form.sftpUsername.trim() !== '';
      default: return true;
    }
  };

  const handleFinish = async () => {
    const project = {
      name: form.name,
      localPath: form.localPath,
      remotePath: form.remotePath,
      sftp: {
        host: form.sftpHost,
        port: parseInt(form.sftpPort, 10) || 22,
        username: form.sftpUsername,
        ...(form.sftpAuthMethod === 'key'
          ? { privateKeyPath: form.sftpPrivateKeyPath, passphrase: form.sftpPassphrase || undefined }
          : { password: form.sftpPassword }),
      },
      ignorePatterns: [],
    };

    await saveProject(project);
    startWatcher();
  };

  const next = () => {
    if (step === STEPS.length - 1) {
      handleFinish();
    } else {
      setStep((s) => s + 1);
    }
  };

  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div className="onboarding-step">
          Passo {step + 1} de {STEPS.length} — {STEPS[step].label}
        </div>

        {step === 0 && (
          <>
            <div className="onboarding-logo">&#x2B21;</div>
            <h1 className="onboarding-title">DeploySync</h1>
            <p className="onboarding-subtitle">
              Deploy assistant para seus projetos. Monitora arquivos alterados
              e faz upload seletivo via SFTP para o servidor.
            </p>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="onboarding-title" style={{ fontSize: 18 }}>
              Nome do Projeto
            </h2>
            <p className="onboarding-subtitle">
              Escolha um nome para identificar seu projeto.
            </p>
            <div className="settings-field">
              <input
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="meu-saas"
                autoFocus
              />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="onboarding-title" style={{ fontSize: 18 }}>
              Caminhos do Projeto
            </h2>
            <p className="onboarding-subtitle">
              Informe a pasta local e o caminho remoto no servidor.
            </p>
            <div className="settings-field">
              <label className="settings-label">Pasta local</label>
              <div className="settings-input-row">
                <input
                  value={form.localPath}
                  onChange={(e) => update('localPath', e.target.value)}
                  placeholder="/Users/you/projetos/meu-saas"
                />
                <button onClick={handleSelectFolder}>Selecionar</button>
              </div>
            </div>
            <div className="settings-field" style={{ marginTop: 16 }}>
              <label className="settings-label">Caminho remoto</label>
              <input
                value={form.remotePath}
                onChange={(e) => update('remotePath', e.target.value)}
                placeholder="/var/www/meu-saas"
              />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="onboarding-title" style={{ fontSize: 18 }}>
              Configuração SFTP
            </h2>
            <p className="onboarding-subtitle">
              Dados de conexão com o servidor de produção.
            </p>
            <div className="settings-field">
              <label className="settings-label">Host</label>
              <input
                value={form.sftpHost}
                onChange={(e) => update('sftpHost', e.target.value)}
                placeholder="192.168.1.100"
                autoFocus
              />
            </div>
            <div className="settings-field" style={{ marginTop: 12 }}>
              <label className="settings-label">Porta</label>
              <input
                value={form.sftpPort}
                onChange={(e) => update('sftpPort', e.target.value)}
                placeholder="22"
                style={{ width: 100 }}
              />
            </div>
            <div className="settings-field" style={{ marginTop: 12 }}>
              <label className="settings-label">Usuário</label>
              <input
                value={form.sftpUsername}
                onChange={(e) => update('sftpUsername', e.target.value)}
                placeholder="deploy"
              />
            </div>
            <div className="settings-field" style={{ marginTop: 12 }}>
              <label className="settings-label">Autenticação</label>
              <select
                value={form.sftpAuthMethod}
                onChange={(e) => update('sftpAuthMethod', e.target.value)}
              >
                <option value="key">Chave SSH</option>
                <option value="password">Senha</option>
              </select>
            </div>
            {form.sftpAuthMethod === 'key' ? (
              <>
                <div className="settings-field" style={{ marginTop: 12 }}>
                  <label className="settings-label">Caminho da chave privada</label>
                  <input
                    value={form.sftpPrivateKeyPath}
                    onChange={(e) => update('sftpPrivateKeyPath', e.target.value)}
                    placeholder="~/.ssh/id_rsa"
                  />
                </div>
                <div className="settings-field" style={{ marginTop: 12 }}>
                  <label className="settings-label">Passphrase (opcional)</label>
                  <input
                    type="password"
                    value={form.sftpPassphrase}
                    onChange={(e) => update('sftpPassphrase', e.target.value)}
                    placeholder="Deixe vazio se não tiver"
                  />
                </div>
              </>
            ) : (
              <div className="settings-field" style={{ marginTop: 12 }}>
                <label className="settings-label">Senha</label>
                <input
                  type="password"
                  value={form.sftpPassword}
                  onChange={(e) => update('sftpPassword', e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            )}
          </>
        )}

        <div className="onboarding-actions">
          {step > 0 ? (
            <button className="btn btn-ghost" onClick={back}>
              Voltar
            </button>
          ) : (
            <div />
          )}
          <button className="btn btn-primary" onClick={next} disabled={!canProceed()}>
            {step === STEPS.length - 1 ? 'Criar Projeto' : 'Continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}
