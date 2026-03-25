import React from 'react';
import { useStore } from '../stores/useStore';

const SOURCES = ['all', 'watcher', 'claude-code', 'cursor', 'antigravity'];

export default function Sidebar() {
  const project = useStore((s) => s.project);
  const projects = useStore((s) => s.projects);
  const activeTab = useStore((s) => s.activeTab);
  const showSettings = useStore((s) => s.showSettings);
  const changedFiles = useStore((s) => s.changedFiles);
  const sourceFilter = useStore((s) => s.sourceFilter);
  const mcpStatus = useStore((s) => s.mcpStatus);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const setShowSettings = useStore((s) => s.setShowSettings);
  const setSourceFilter = useStore((s) => s.setSourceFilter);
  const setActiveProject = useStore((s) => s.setActiveProject);

  return (
    <div className="sidebar">
      {projects.length > 1 && (
        <div className="sidebar-section" style={{ borderTop: 'none' }}>
          <div className="sidebar-section-title">Projeto</div>
          <select
            className="project-select"
            value={project?.id || ''}
            onChange={(e) => setActiveProject(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}
      <nav className="sidebar-nav">
        <button
          className={`nav-item ${activeTab === 'changes' && !showSettings ? 'active' : ''}`}
          onClick={() => setActiveTab('changes')}
        >
          <span>&#9998;</span>
          <span>Alterações</span>
          {changedFiles.length > 0 && (
            <span className="nav-badge">{changedFiles.length}</span>
          )}
        </button>
        <button
          className={`nav-item ${activeTab === 'history' && !showSettings ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <span>&#8635;</span>
          <span>Histórico</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'projects' && !showSettings ? 'active' : ''}`}
          onClick={() => setActiveTab('projects')}
        >
          <span>&#9776;</span>
          <span>Projetos</span>
          <span className="nav-badge">{projects.length}</span>
        </button>
      </nav>

      {activeTab === 'changes' && !showSettings && (
        <div className="sidebar-section">
          <div className="sidebar-section-title">Filtrar por Source</div>
          <div className="source-filters">
            {SOURCES.map((src) => (
              <button
                key={src}
                className={`source-tag ${sourceFilter === src ? 'active' : ''}`}
                data-source={src !== 'all' ? src : undefined}
                onClick={() => setSourceFilter(src)}
              >
                {src === 'all' ? 'Todos' : src}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sidebar-section">
        <div className="sidebar-section-title">MCP Server</div>
        <div className="mcp-status">
          <span
            className={`status-dot ${mcpStatus?.running ? 'online' : 'offline'}`}
          />
          <span>
            {mcpStatus?.running
              ? `Porta ${mcpStatus.port}`
              : 'Offline'}
          </span>
        </div>
        {mcpStatus?.agents?.length > 0 && (
          <div style={{ marginTop: 4 }}>
            {mcpStatus.agents.map((agent) => (
              <div key={agent} className="mcp-status" style={{ paddingLeft: 13 }}>
                <span style={{ color: 'var(--green)', fontSize: 10 }}>&#x25CF;</span>
                <span>{agent}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <button
          className={`nav-item ${showSettings ? 'active' : ''}`}
          onClick={() => setShowSettings(!showSettings)}
        >
          <span>&#9881;</span>
          <span>Configurações</span>
        </button>
      </div>
    </div>
  );
}
