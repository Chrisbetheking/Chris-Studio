import { useState } from 'react';
import { Dashboard } from './screens/Dashboard';
import { GuardScreen } from './screens/GuardScreen';
import { DocumentsScreen } from './screens/DocumentsScreen';
import { MatrixScreen } from './screens/MatrixScreen';
import { ProvidersScreen } from './screens/ProvidersScreen';
import { ArchiveScreen } from './screens/ArchiveScreen';
import { StorageScreen } from './screens/StorageScreen';
import { AboutScreen } from './screens/AboutScreen';

type Screen = 'dashboard' | 'guard' | 'documents' | 'matrix' | 'providers' | 'archive' | 'storage' | 'about';

const navItems: { id: Screen; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '◈' },
  { id: 'guard', label: 'Prompt Guard', icon: '◆' },
  { id: 'documents', label: 'Documents', icon: '◇' },
  { id: 'matrix', label: 'Model Matrix', icon: '▣' },
  { id: 'providers', label: 'Providers', icon: '◉' },
  { id: 'archive', label: 'Archive', icon: '◷' },
  { id: 'storage', label: 'Storage', icon: '◫' },
  { id: 'about', label: 'About', icon: '◈' },
];

const screens: Record<Screen, React.ReactNode> = {
  dashboard: <Dashboard />,
  guard: <GuardScreen />,
  documents: <DocumentsScreen />,
  matrix: <MatrixScreen />,
  providers: <ProvidersScreen />,
  archive: <ArchiveScreen />,
  storage: <StorageScreen />,
  about: <AboutScreen />,
};

export function App() {
  const [screen, setScreen] = useState<Screen>('dashboard');

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-icon">TF</span>
          <span className="sidebar-brand-text">TokenFence</span>
        </div>
        <div className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`sidebar-item ${screen === item.id ? 'active' : ''}`}
              onClick={() => setScreen(item.id)}
            >
              <span className="sidebar-item-icon">{item.icon}</span>
              <span className="sidebar-item-label">{item.label}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-footer">
          <div className="status-indicator">
            <span className="status-dot green"></span>
            <span>Local-first</span>
          </div>
          <div className="version-text">v0.4.0-dev</div>
        </div>
      </nav>

      {/* Main content */}
      <main className="main-content">
        {screens[screen]}
      </main>
    </div>
  );
}
