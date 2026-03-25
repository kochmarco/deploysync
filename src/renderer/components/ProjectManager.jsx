import React, { useState } from 'react';
import { useStore } from '../stores/useStore';
import { showToast } from './Toast';

const api = typeof window !== 'undefined' ? window.api : null;

const EMPTY_FORM = {
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
  ignorePatterns: '',
};

function projectToForm(p) {
  return {
    name: p.name || '',
    localPath: p.localPath || '',
    remotePath: p.remotePath || '',
    sftpHost: p.sftp?.host || '',
    sftpPort: String(p.sftp?.port || 22),
    sftpUsername: p.sftp?.username || '',
    sftpAuthMethod: p.sftp?.privateKeyPath ? 'key' : 'password',
    sftpPrivateKeyPath: p.sftp?.privateKeyPath || '~/.ssh/id_rsa',
    sftpPassphrase: p.sftp?.passphrase || '',
    sftpPassword: p.sftp?.password || '',
    ignorePatterns: (p.ignorePatterns || []).join('\n'),
  };
}

function formToProject(form, existing) {
  return {
    ...(existing || {}),
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
    ignorePatterns: form.ignorePatterns
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  };
}

export default function ProjectManager() {
  const projects = useStore((s) => s.projects);
  const project = useStore((s) => s.project);
  const saveProject = useStore((s) => s.saveProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const setActiveProject = useStore((s) => s.setActiveProject);
  const setActiveTab = useStore((s) => s.setActiveTab);

  // null = list view, 'new' = new project form, project id = editing
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSelectFolder = async (field) => {
    if (!api) return;
    const folder = await api.selectFolder();
    if (folder) {
      update(field, folder);
      if (field === 'localPath' && !form.name) {
        update('name', folder.split('/').pop());
      }
    }
  };

  const handleNew = () => {
    setForm(EMPTY_FORM);
    setEditing('new');
  };

  const handleEdit = (p) => {
    setForm(projectToForm(p));
    setEditing(p.id);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const existing = editing !== 'new' ? projects.find((p) => p.id === editing) : null;
    const data = formToProject(form, existing);
    await saveProject(data);
    showToast(existing ? `Projeto "${form.name}" atualizado` : `Projeto "${form.name}" criado`, 'success');
    setEditing(null);
  };

  const handleDelete = async (id) => {
    const p = projects.find((pr) => pr.id === id);
    await deleteProject(id);
    showToast(`Projeto "${p?.name}" excluído`, 'info');
    setConfirmDelete(null);
    if (editing === id) setEditing(null);
  };

  const handleActivate = async (id) => {
    await setActiveProject(id);
    setActiveTab('changes');
  };

  // ─── Form view ────────────────────────────────────────
  if (editing !== null) {
    return (
      <div className="settings-panel">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 className="font-sans" style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
            {editing === 'new' ? 'Novo Projeto' : 'Editar Projeto'}
          </h2>
          <button className="btn btn-ghost" onClick={() => setEditing(null)}>
            Voltar
          </button>
        </div>

        <div className="settings-group">
          <div className="settings-group-title">Informações</div>
          <div className="settings-field">
            <label className="settings-label">Nome do projeto</label>
            <input
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="meu-saas"
              autoFocus
            />
          </div>
          <div className="settings-field">
            <label className="settings-label">Caminho local</label>
            <div className="settings-input-row">
              <input
                value={form.localPath}
                onChange={(e) => update('localPath', e.target.value)}
                placeholder="/Users/you/projetos/meu-saas"
              />
              <button onClick={() => handleSelectFolder('localPath')}>Selecionar</button>
            </div>
          </div>
          <div className="settings-field">
            <label className="settings-label">Caminho remoto</label>
            <input
              value={form.remotePath}
              onChange={(e) => update('remotePath', e.target.value)}
              placeholder="/var/www/meu-saas"
            />
          </div>
        </div>

        <div className="settings-group">
          <div className="settings-group-title">Conexão SFTP</div>
          <div className="settings-field">
            <label className="settings-label">Host</label>
            <input
              value={form.sftpHost}
              onChange={(e) => update('sftpHost', e.target.value)}
              placeholder="192.168.1.100"
            />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="settings-field" style={{ width: 100 }}>
              <label className="settings-label">Porta</label>
              <input
                value={form.sftpPort}
                onChange={(e) => update('sftpPort', e.target.value)}
                placeholder="22"
              />
            </div>
            <div className="settings-field" style={{ flex: 1 }}>
              <label className="settings-label">Usuário</label>
              <input
                value={form.sftpUsername}
                onChange={(e) => update('sftpUsername', e.target.value)}
                placeholder="deploy"
              />
            </div>
          </div>
          <div className="settings-field">
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
              <div className="settings-field">
                <label className="settings-label">Caminho da chave privada</label>
                <input
                  value={form.sftpPrivateKeyPath}
                  onChange={(e) => update('sftpPrivateKeyPath', e.target.value)}
                  placeholder="~/.ssh/id_rsa"
                />
              </div>
              <div className="settings-field">
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
            <div className="settings-field">
              <label className="settings-label">Senha</label>
              <input
                type="password"
                value={form.sftpPassword}
                onChange={(e) => update('sftpPassword', e.target.value)}
                placeholder="••••••••"
              />
            </div>
          )}
        </div>

        <div className="settings-group">
          <div className="settings-group-title">Padrões de Ignore</div>
          <div className="settings-field">
            <label className="settings-label">Um padrão por linha (glob syntax)</label>
            <textarea
              value={form.ignorePatterns}
              onChange={(e) => update('ignorePatterns', e.target.value)}
              placeholder={`**/node_modules/**\n**/vendor/**\n**/.git/**`}
              rows={6}
            />
          </div>
        </div>

        <div className="settings-actions">
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!form.name.trim() || !form.localPath.trim()}
          >
            {editing === 'new' ? 'Criar Projeto' : 'Salvar'}
          </button>
          <button className="btn btn-ghost" onClick={() => setEditing(null)}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // ─── List view ────────────────────────────────────────
  return (
    <div className="settings-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 className="font-sans" style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
          Projetos
        </h2>
        <button className="btn btn-primary" onClick={handleNew}>
          + Novo Projeto
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {projects.map((p) => (
          <div
            key={p.id}
            className="project-card"
            style={{
              background: p.id === project?.id ? 'var(--bg-surface)' : 'var(--bg-panel)',
              border: `1px solid ${p.id === project?.id ? 'var(--green)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              padding: '14px 16px',
              transition: 'all 0.15s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className="font-sans" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {p.name}
                  </span>
                  {p.id === project?.id && (
                    <span style={{
                      fontSize: 9,
                      padding: '2px 6px',
                      borderRadius: 8,
                      background: 'rgba(110, 203, 99, 0.15)',
                      color: 'var(--green)',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}>
                      Ativo
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
                  {p.localPath || 'Sem caminho local'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  {p.sftp?.host ? `${p.sftp.username}@${p.sftp.host}:${p.remotePath}` : 'SFTP não configurado'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
                {p.id !== project?.id && (
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '5px 10px', fontSize: 11 }}
                    onClick={() => handleActivate(p.id)}
                  >
                    Ativar
                  </button>
                )}
                <button
                  className="btn btn-ghost"
                  style={{ padding: '5px 10px', fontSize: 11 }}
                  onClick={() => handleEdit(p)}
                >
                  Editar
                </button>
                {confirmDelete === p.id ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      className="btn btn-danger"
                      style={{ padding: '5px 10px', fontSize: 11 }}
                      onClick={() => handleDelete(p.id)}
                    >
                      Confirmar
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '5px 10px', fontSize: 11 }}
                      onClick={() => setConfirmDelete(null)}
                    >
                      Não
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn btn-danger"
                    style={{ padding: '5px 10px', fontSize: 11 }}
                    onClick={() => setConfirmDelete(p.id)}
                  >
                    Excluir
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {projects.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
            <div style={{ fontSize: 28, opacity: 0.3, marginBottom: 8 }}>&#x2B21;</div>
            <div className="font-sans" style={{ fontSize: 14 }}>Nenhum projeto cadastrado</div>
          </div>
        )}
      </div>
    </div>
  );
}
