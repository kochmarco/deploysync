import React, { useState, useEffect } from 'react';
import { useStore } from '../stores/useStore';

const api = typeof window !== 'undefined' ? window.api : null;

const EDITORS = [
  { id: 'cursor', name: 'Cursor', icon: '{ }', path: '~/.cursor/mcp.json' },
  { id: 'claude-code', name: 'Claude Code', icon: '>', path: '~/.claude.json' },
  { id: 'windsurf', name: 'Windsurf', icon: '~', path: '~/.codeium/windsurf/mcp_config.json' },
  { id: 'vscode', name: 'VS Code', icon: 'VS', path: '~/.vscode/mcp.json' },
  { id: 'antigravity', name: 'Antigravity', icon: '▲', path: '~/.gemini/antigravity/mcp_config.json' },
];

function McpTab({ mcpPort, setMcpPort, mcpStatus, loadMcpStatus }) {
  const [editorStatuses, setEditorStatuses] = useState({});
  const [rulesStatuses, setRulesStatuses] = useState({});
  const [installing, setInstalling] = useState(null);
  const [installingRules, setInstallingRules] = useState(null);
  const [adapterPath, setAdapterPath] = useState('');
  const [showManual, setShowManual] = useState(false);

  const showToast = typeof window !== 'undefined' && window.showToast ? window.showToast : () => {};

  const checkStatuses = async () => {
    if (!api?.mcpCheckEditorInstalled) return;
    const statuses = {};
    for (const editor of EDITORS) {
      statuses[editor.id] = await api.mcpCheckEditorInstalled(editor.id);
    }
    setEditorStatuses(statuses);

    if (api.mcpGetAdapterPath) {
      setAdapterPath(await api.mcpGetAdapterPath());
    }
  };

  const checkRulesStatuses = async () => {
    if (!api?.mcpCheckEditorRulesInstalled) return;
    const statuses = {};
    for (const editor of EDITORS) {
      statuses[editor.id] = await api.mcpCheckEditorRulesInstalled(editor.id);
    }
    setRulesStatuses(statuses);
  };

  useEffect(() => {
    checkStatuses();
    checkRulesStatuses();
  }, []);

  const handleInstall = async (editorId) => {
    if (!api?.mcpInstallEditor) return;
    setInstalling(editorId);
    const result = await api.mcpInstallEditor(editorId);
    setInstalling(null);
    if (result.success) {
      showToast(`MCP configurado no ${EDITORS.find((e) => e.id === editorId)?.name}!`, 'success');
    } else {
      showToast(`Erro: ${result.error}`, 'error');
    }
    checkStatuses();
  };

  const handleUninstall = async (editorId) => {
    if (!api?.mcpUninstallEditor) return;
    setInstalling(editorId);
    const result = await api.mcpUninstallEditor(editorId);
    setInstalling(null);
    if (result.success) {
      showToast(`MCP removido do ${EDITORS.find((e) => e.id === editorId)?.name}`, 'success');
    } else {
      showToast(`Erro: ${result.error}`, 'error');
    }
    checkStatuses();
  };

  const handleInstallRules = async (editorId) => {
    if (!api?.mcpInstallEditorRules) return;
    setInstallingRules(editorId);
    const result = await api.mcpInstallEditorRules(editorId);
    setInstallingRules(null);
    if (result.success) {
      if (result.alreadyInstalled) {
        showToast(`Regras já instaladas no ${EDITORS.find((e) => e.id === editorId)?.name}`, 'info');
      } else {
        showToast(`Regras instaladas no ${EDITORS.find((e) => e.id === editorId)?.name}!`, 'success');
      }
    } else {
      showToast(`Erro: ${result.error}`, 'error');
    }
    checkRulesStatuses();
  };

  const handleUninstallRules = async (editorId) => {
    if (!api?.mcpUninstallEditorRules) return;
    setInstallingRules(editorId);
    const result = await api.mcpUninstallEditorRules(editorId);
    setInstallingRules(null);
    if (result.success) {
      showToast(`Regras removidas do ${EDITORS.find((e) => e.id === editorId)?.name}`, 'success');
    } else {
      showToast(`Erro: ${result.error}`, 'error');
    }
    checkRulesStatuses();
  };

  const RULE_PATHS = {
    cursor: '.cursor/rules/deploysync.mdc',
    'claude-code': 'CLAUDE.md',
    windsurf: '.windsurfrules',
    vscode: '.github/copilot-instructions.md',
    antigravity: 'GEMINI.md',
  };

  return (
    <>
      <div className="settings-group">
        <div className="settings-group-title">MCP Server</div>
        <div className="settings-field">
          <label className="settings-label">Porta</label>
          <div className="settings-input-row">
            <input
              value={mcpPort}
              onChange={(e) => setMcpPort(e.target.value)}
              placeholder="3500"
              style={{ width: 120 }}
            />
            <button
              onClick={async () => {
                const port = parseInt(mcpPort, 10);
                if (port > 0 && port < 65536) {
                  await api.mcpSetPort(port);
                  await loadMcpStatus();
                }
              }}
            >
              Aplicar
            </button>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Status</div>
        <div className="mcp-status">
          <span className={`status-dot ${mcpStatus?.running ? 'online' : 'offline'}`} />
          <span style={{ fontSize: 12 }}>
            {mcpStatus?.running ? `Rodando na porta ${mcpStatus.port}` : 'Offline'}
          </span>
        </div>
        {mcpStatus?.agents?.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div className="settings-label" style={{ marginBottom: 4 }}>Agentes conectados</div>
            {mcpStatus.agents.map((agent) => (
              <div key={agent} className="mcp-status" style={{ paddingLeft: 4 }}>
                <span style={{ color: 'var(--green)', fontSize: 10 }}>&#x25CF;</span>
                <span>{agent}</span>
              </div>
            ))}
          </div>
        )}
        {(!mcpStatus?.agents || mcpStatus.agents.length === 0) && mcpStatus?.running && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)' }}>
            Nenhum agente conectado
          </div>
        )}
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Instalar nos Editores</div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
          Configure automaticamente o MCP Server nos seus editores com um clique.
        </p>
        <div className="editor-cards">
          {EDITORS.map((editor) => {
            const installed = editorStatuses[editor.id];
            const isLoading = installing === editor.id;
            return (
              <div key={editor.id} className="editor-card">
                <div className="editor-card-left">
                  <span className="editor-icon">{editor.icon}</span>
                  <div>
                    <div className="editor-name">{editor.name}</div>
                    <div className="editor-path">{editor.path}</div>
                  </div>
                </div>
                <div className="editor-card-right">
                  {installed && (
                    <span className="editor-status installed">Configurado</span>
                  )}
                  <button
                    className={`btn-editor-install ${installed ? 'installed' : ''}`}
                    disabled={isLoading}
                    onClick={() => installed ? handleUninstall(editor.id) : handleInstall(editor.id)}
                  >
                    {isLoading ? '...' : installed ? 'Remover' : 'Configurar'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Regras do Agente</div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, lineHeight: 1.6 }}>
          Instale regras no projeto ativo para que o agente do editor notifique automaticamente
          cada arquivo criado/editado. <strong>Isso faz o source aparecer corretamente na lista.</strong>
        </p>
        <p style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.5 }}>
          As regras são salvas dentro da pasta do projeto. Cada editor usa um formato diferente.
        </p>
        <div className="editor-cards">
          {EDITORS.map((editor) => {
            const installed = rulesStatuses[editor.id];
            const isLoading = installingRules === editor.id;
            return (
              <div key={editor.id} className="editor-card">
                <div className="editor-card-left">
                  <span className="editor-icon">{editor.icon}</span>
                  <div>
                    <div className="editor-name">{editor.name}</div>
                    <div className="editor-path">{RULE_PATHS[editor.id]}</div>
                  </div>
                </div>
                <div className="editor-card-right">
                  {installed && (
                    <span className="editor-status installed">Instalado</span>
                  )}
                  <button
                    className={`btn-editor-install ${installed ? 'installed' : ''}`}
                    disabled={isLoading}
                    onClick={() => installed ? handleUninstallRules(editor.id) : handleInstallRules(editor.id)}
                  >
                    {isLoading ? '...' : installed ? 'Remover' : 'Instalar'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="settings-group">
        <button
          className="btn btn-ghost"
          style={{ fontSize: 11, padding: '6px 0' }}
          onClick={() => setShowManual(!showManual)}
        >
          {showManual ? '▾' : '▸'} Configuração manual / REST API
        </button>
        {showManual && (
          <div style={{ marginTop: 12 }}>
            <div className="mcp-example">
              <div className="mcp-example-title">JSON de configuração (stdio)</div>
              <pre className="mcp-example-code">{`{
  "mcpServers": {
    "deploysync": {
      "command": "node",
      "args": ["${adapterPath || '~/Library/Application Support/deploysync/mcp-stdio-adapter.js'}"]
    }
  }
}`}</pre>
            </div>
            <div className="mcp-example">
              <div className="mcp-example-title">REST API — cURL</div>
              <pre className="mcp-example-code">{`curl -X POST http://127.0.0.1:${mcpPort}/api/notify \\
  -H "Content-Type: application/json" \\
  -d '{
    "filePath": "app/Http/Controllers/UserController.php",
    "changeType": "modified",
    "agent": "meu-script"
  }'`}</pre>
            </div>
            <div className="mcp-example">
              <div className="mcp-example-title">WebSocket</div>
              <pre className="mcp-example-code">{`// ws://127.0.0.1:${mcpPort}/ws
ws.send(JSON.stringify({
  type: "register", agent: "meu-agent"
}));
ws.send(JSON.stringify({
  type: "notify_file_change",
  filePath: "app/Models/User.php",
  changeType: "modified"
}));`}</pre>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default function SettingsPanel() {
  const project = useStore((s) => s.project);
  const settingsTab = useStore((s) => s.settingsTab);
  const sftpConnected = useStore((s) => s.sftpConnected);
  const setSettingsTab = useStore((s) => s.setSettingsTab);
  const saveProject = useStore((s) => s.saveProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const setShowSettings = useStore((s) => s.setShowSettings);
  const connectSftp = useStore((s) => s.connectSftp);
  const disconnectSftp = useStore((s) => s.disconnectSftp);

  const mcpStatus = useStore((s) => s.mcpStatus);
  const loadMcpStatus = useStore((s) => s.loadMcpStatus);

  const [sftpError, setSftpError] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [mcpPort, setMcpPort] = useState('3500');

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
    ignorePatterns: '',
  });

  useEffect(() => {
    if (api) {
      api.mcpGetPort().then((port) => setMcpPort(String(port)));
    }
  }, []);

  useEffect(() => {
    if (project) {
      setForm({
        name: project.name || '',
        localPath: project.localPath || '',
        remotePath: project.remotePath || '',
        sftpHost: project.sftp?.host || '',
        sftpPort: String(project.sftp?.port || 22),
        sftpUsername: project.sftp?.username || '',
        sftpAuthMethod: project.sftp?.privateKeyPath ? 'key' : 'password',
        sftpPrivateKeyPath: project.sftp?.privateKeyPath || '~/.ssh/id_rsa',
        sftpPassphrase: project.sftp?.passphrase || '',
        sftpPassword: project.sftp?.password || '',
        ignorePatterns: (project.ignorePatterns || []).join('\n'),
      });
    }
  }, [project]);

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSelectFolder = async (field) => {
    if (!api) return;
    const folder = await api.selectFolder();
    if (folder) update(field, folder);
  };

  const handleSave = async () => {
    const updated = {
      ...project,
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
    await saveProject(updated);
  };

  const handleSaveAndClose = async () => {
    await handleSave();
    setShowSettings(false);
  };

  const handleDelete = async () => {
    if (!project?.id) return;
    await deleteProject(project.id);
    setShowSettings(false);
  };

  return (
    <div className="settings-panel">
      <div className="settings-tabs">
        <button
          className={`settings-tab ${settingsTab === 'project' ? 'active' : ''}`}
          onClick={() => setSettingsTab('project')}
        >
          Projeto
        </button>
        <button
          className={`settings-tab ${settingsTab === 'sftp' ? 'active' : ''}`}
          onClick={() => setSettingsTab('sftp')}
        >
          SFTP
        </button>
        <button
          className={`settings-tab ${settingsTab === 'ignore' ? 'active' : ''}`}
          onClick={() => setSettingsTab('ignore')}
        >
          Ignorados
        </button>
        <button
          className={`settings-tab ${settingsTab === 'mcp' ? 'active' : ''}`}
          onClick={() => setSettingsTab('mcp')}
        >
          MCP
        </button>
      </div>

      {settingsTab === 'project' && (
        <>
          <div className="settings-group">
            <div className="settings-group-title">Informações do Projeto</div>
            <div className="settings-field">
              <label className="settings-label">Nome do projeto</label>
              <input
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="meu-saas"
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
                <button onClick={() => handleSelectFolder('localPath')}>
                  Selecionar
                </button>
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
        </>
      )}

      {settingsTab === 'sftp' && (
        <>
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
            <div className="settings-field">
              <label className="settings-label">Porta</label>
              <input
                value={form.sftpPort}
                onChange={(e) => update('sftpPort', e.target.value)}
                placeholder="22"
                style={{ width: 100 }}
              />
            </div>
            <div className="settings-field">
              <label className="settings-label">Usuário</label>
              <input
                value={form.sftpUsername}
                onChange={(e) => update('sftpUsername', e.target.value)}
                placeholder="deploy"
              />
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
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      style={{ flex: 1 }}
                      value={form.sftpPrivateKeyPath}
                      onChange={(e) => update('sftpPrivateKeyPath', e.target.value)}
                      placeholder="~/.ssh/id_rsa"
                    />
                    <button
                      onClick={async () => {
                        if (!api?.selectFile) return;
                        const file = await api.selectFile({ defaultPath: form.sftpPrivateKeyPath || undefined });
                        if (file) update('sftpPrivateKeyPath', file);
                      }}
                    >
                      Procurar
                    </button>
                  </div>
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
            <div className="settings-group-title">Conexão</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="status-indicator">
                <span className={`status-dot ${sftpConnected ? 'online' : 'offline'}`} />
                <span>{sftpConnected ? 'Conectado' : 'Desconectado'}</span>
              </div>
              {sftpConnected ? (
                <button className="btn btn-ghost" onClick={disconnectSftp}>
                  Desconectar
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  disabled={connecting}
                  onClick={async () => {
                    setSftpError(null);
                    setConnecting(true);
                    // Save first so config is up to date
                    await handleSave();
                    const result = await connectSftp();
                    setConnecting(false);
                    if (!result.success) setSftpError(result.error);
                  }}
                >
                  {connecting ? 'Conectando...' : 'Testar Conexão'}
                </button>
              )}
            </div>
            {sftpError && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--red)' }}>
                {sftpError}
              </div>
            )}
          </div>
        </>
      )}

      {settingsTab === 'ignore' && (
        <>
          <div className="settings-group">
            <div className="settings-group-title">Padrões de Ignore</div>
            <div className="settings-field">
              <label className="settings-label">
                Um padrão por linha (glob syntax)
              </label>
              <textarea
                value={form.ignorePatterns}
                onChange={(e) => update('ignorePatterns', e.target.value)}
                placeholder={`**/node_modules/**\n**/vendor/**\n**/.git/**\n**/storage/logs/**`}
                rows={12}
              />
            </div>
          </div>
        </>
      )}

      {settingsTab === 'mcp' && (
        <McpTab mcpPort={mcpPort} setMcpPort={setMcpPort} mcpStatus={mcpStatus} loadMcpStatus={loadMcpStatus} />
      )}

      <div className="settings-actions">
        <button className="btn btn-primary" onClick={handleSaveAndClose}>
          Salvar
        </button>
        <button className="btn btn-ghost" onClick={() => setShowSettings(false)}>
          Cancelar
        </button>
        {project?.id && (
          <button
            className="btn btn-danger"
            style={{ marginLeft: 'auto' }}
            onClick={handleDelete}
          >
            Excluir Projeto
          </button>
        )}
      </div>
    </div>
  );
}
