import React, { useEffect } from 'react';
import { useStore } from './stores/useStore';
import { useElectronEvents } from './hooks/useElectronEvents';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import FileList from './components/FileList';
import DeployBar from './components/DeployBar';
import HistoryPanel from './components/HistoryPanel';
import SettingsPanel from './components/SettingsPanel';
import Onboarding from './components/Onboarding';
import ProjectManager from './components/ProjectManager';
import ToastContainer from './components/Toast';

export default function App() {
  const project = useStore((s) => s.project);
  const projects = useStore((s) => s.projects);
  const activeTab = useStore((s) => s.activeTab);
  const showSettings = useStore((s) => s.showSettings);
  const loadProjects = useStore((s) => s.loadProjects);
  const startWatcher = useStore((s) => s.startWatcher);
  const loadHistory = useStore((s) => s.loadHistory);
  const loadMcpStatus = useStore((s) => s.loadMcpStatus);
  const checkSftpStatus = useStore((s) => s.checkSftpStatus);

  useElectronEvents();

  useEffect(() => {
    loadProjects().then(() => {
      const currentProject = useStore.getState().project;
      if (currentProject) {
        startWatcher();
        loadHistory();
        loadMcpStatus();
        checkSftpStatus();
      }
    });
  }, []);

  // No projects yet — show onboarding
  if (projects.length === 0 && project === null) {
    return (
      <>
        <Onboarding />
        <ToastContainer />
      </>
    );
  }

  const renderContent = () => {
    if (showSettings) return <SettingsPanel />;
    if (activeTab === 'projects') return <ProjectManager />;
    if (activeTab === 'history') return <HistoryPanel />;
    return <FileList />;
  };

  return (
    <div className="app-layout">
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        <div className="main-content">
          {renderContent()}
          {activeTab === 'changes' && !showSettings && <DeployBar />}
        </div>
      </div>
      <ToastContainer />
    </div>
  );
}
