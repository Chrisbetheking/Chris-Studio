import { useState, useEffect, useCallback } from 'react';
import { tk, onLangChange } from '@tokenfence/shared/src/i18n';
import { Dashboard } from './screens/Dashboard';
import { GuardScreen } from './screens/GuardScreen';
import { DocumentsScreen } from './screens/DocumentsScreen';
import { MatrixScreen } from './screens/MatrixScreen';
import { ProvidersScreen } from './screens/ProvidersScreen';
import { ArchiveScreen } from './screens/ArchiveScreen';
import { StorageScreen } from './screens/StorageScreen';
import { AboutScreen } from './screens/AboutScreen';
import { AgentLabScreen } from './screens/AgentLabScreen';
import { PluginStoreScreen } from './screens/PluginStoreScreen';
import { OutputScreen } from './screens/OutputScreen';
import { MindMapScreen } from './screens/MindMapScreen';
import { ComputerControlScreen } from './screens/ComputerControlScreen';
import { RoutingScreen } from './screens/RoutingScreen';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import type { SupportedLanguage } from '@tokenfence/shared/src/i18n';

type Screen = 'dashboard' | 'guard' | 'documents' | 'matrix' | 'providers' | 'archive' | 'storage' | 'about' | 'agent-lab' | 'plugins' | 'output' | 'mindmap' | 'computer' | 'routing';

const screenLabelKeys: Record<Screen, string> = {
  dashboard: 'nav.dashboard',
  guard: 'nav.guard',
  documents: 'nav.documents',
  matrix: 'nav.matrix',
  'agent-lab': 'nav.agentLab',
  plugins: 'nav.plugins',
  output: 'nav.outputs',
  mindmap: 'nav.mindMap',
  routing: 'nav.routing',
  computer: 'nav.computerUse',
  providers: 'nav.providers',
  archive: 'nav.archive',
  storage: 'nav.storage',
  about: 'nav.about',
};

const icons: Record<Screen, string> = {
  dashboard: '\u25C9', guard: '\u25C8', documents: '\u25D7', matrix: '\u25A3',
  'agent-lab': '\u2AFF', plugins: '\u27D0', output: '\u25CA', mindmap: '\u25CE',
  routing: '\u2B21', computer: '\u25EB', providers: '\u25D1', archive: '\u25F0',
  storage: '\u25E7', about: '\u25CC',
};

const screens: Record<Screen, React.ReactNode> = {
  dashboard: <Dashboard />,
  guard: <GuardScreen />,
  documents: <DocumentsScreen />,
  matrix: <MatrixScreen />,
  'agent-lab': <AgentLabScreen />,
  plugins: <PluginStoreScreen />,
  output: <OutputScreen />,
  mindmap: <MindMapScreen />,
  routing: <RoutingScreen />,
  computer: <ComputerControlScreen />,
  providers: <ProvidersScreen />,
  archive: <ArchiveScreen />,
  storage: <StorageScreen />,
  about: <AboutScreen />,
};

export function App() {
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [, forceRender] = useState(0);

  useEffect(() => {
    return onLangChange(() => forceRender((n) => n + 1));
  }, []);

  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-icon">TF</span>
          <span className="sidebar-brand-text">TokenFence</span>
        </div>
        <div className="sidebar-nav">
          {(Object.entries(screenLabelKeys) as [Screen, string][]).map(([id, key]) => (
            <button
              key={id}
              className={`sidebar-item ${screen === id ? 'active' : ''}`}
              onClick={() => setScreen(id)}
            >
              <span className="sidebar-item-icon">{icons[id]}</span>
              <span className="sidebar-item-label">{tk(key)}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-footer">
          <LanguageSwitcher />
          <div className="status-indicator" style={{ marginTop: 8 }}>
            <span className="status-dot green"></span>
            <span>{tk('status.localFirst')}</span>
          </div>
          <div className="version-text">v1.0.0-rc1</div>
        </div>
      </nav>
      <main className="main-content">
        {screens[screen]}
      </main>
    </div>
  );
}
