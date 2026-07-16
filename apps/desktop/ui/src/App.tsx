import { useEffect, useMemo, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { AppSettings, Language, ScreenId } from './app/types';
import {
  loadActiveProvider,
  loadProviderProfiles,
  loadProviderStatus,
  loadSettings,
  saveActiveProviderId,
  saveProviderProfile,
} from './app/store';
import { isDesktopRuntime, saveProviderSecret } from './features/platform/desktopClient';
import { providerDefinition } from './app/providerRegistry';
import { Icon, type IconName } from './components/Icon';
import { ToastProvider } from './components/Toast';
import { WorkspaceScreen } from './screens/WorkspaceScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { ProvidersScreen } from './screens/ProvidersScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { AboutScreen } from './screens/AboutScreen';
import { AgentsScreen } from './screens/AgentsScreen';
import { FilesScreen } from './screens/FilesScreen';
import { RoutingScreen } from './screens/RoutingScreen';
import { UpdatesScreen } from './screens/UpdatesScreen';

const copy = (language: Language, en: string, zh: string) => language === 'zh-CN' ? zh : en;

interface NavItem {
  id: ScreenId;
  icon: IconName;
  en: string;
  zh: string;
  group: 'work' | 'system';
}

const NAV: NavItem[] = [
  { id: 'workspace', icon: 'workspace', en: 'Workspace', zh: '工作台', group: 'work' },
  { id: 'agents', icon: 'bot', en: 'Agents', zh: 'Agent', group: 'work' },
  { id: 'files', icon: 'folder', en: 'Files', zh: '文件处理', group: 'work' },
  { id: 'routing', icon: 'route', en: 'Model Router', zh: '模型路由', group: 'work' },
  { id: 'providers', icon: 'server', en: 'Providers', zh: '模型服务', group: 'work' },
  { id: 'history', icon: 'history', en: 'History', zh: '历史记录', group: 'work' },
  { id: 'updates', icon: 'refresh', en: 'Updates', zh: '版本更新', group: 'system' },
  { id: 'settings', icon: 'settings', en: 'Settings', zh: '设置', group: 'system' },
  { id: 'about', icon: 'info', en: 'About', zh: '关于', group: 'system' },
];

function resolvedTheme(settings: AppSettings): 'light' | 'dark' {
  if (settings.theme !== 'system') return settings.theme;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function TokenFenceApp() {
  const initialSettings = useMemo(() => loadSettings(), []);
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [active, setActive] = useState<ScreenId>(initialSettings.startScreen);
  const [openConversationId, setOpenConversationId] = useState<string | undefined>(undefined);
  const [newSessionNonce, setNewSessionNonce] = useState(0);
  const [providerNonce, setProviderNonce] = useState(0);
  const language = settings.language;
  const activeProvider = loadActiveProvider();
  const activeDefinition = providerDefinition(activeProvider.providerId);
  const activeStatus = loadProviderStatus(activeProvider.id);

  useEffect(() => {
    const apply = () => {
      const next = loadSettings();
      setSettings(next);
      document.documentElement.dataset.theme = resolvedTheme(next);
      document.documentElement.lang = next.language;
    };
    apply();
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener('change', apply);
    window.addEventListener('tokenfence:settings-updated', apply);
    return () => {
      media?.removeEventListener('change', apply);
      window.removeEventListener('tokenfence:settings-updated', apply);
    };
  }, []);

  useEffect(() => {
    const update = () => setProviderNonce((value) => value + 1);
    window.addEventListener('tokenfence:providers-updated', update);
    return () => window.removeEventListener('tokenfence:providers-updated', update);
  }, []);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    const profiles = loadProviderProfiles();
    for (const profile of profiles) {
      if (!profile.apiKey.trim()) continue;
      void saveProviderSecret(profile.id, profile.apiKey.trim()).then((result) => {
        saveProviderProfile({ ...profile, apiKey: '', credentialStored: result.ok || profile.credentialStored });
      });
    }
  }, []);

  const startNew = () => {
    setActive('workspace');
    setOpenConversationId(undefined);
    setNewSessionNonce((value) => value + 1);
  };

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    const cleanups: Array<() => void> = [];
    void listen('tokenfence://new-session', startNew).then((unlisten) => cleanups.push(unlisten));
    void listen<string>('tokenfence://navigate', ({ payload }) => {
      if (NAV.some((item) => item.id === payload)) setActive(payload as ScreenId);
    }).then((unlisten) => cleanups.push(unlisten));
    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  const changeProvider = (id: string) => {
    saveActiveProviderId(id);
    setProviderNonce((value) => value + 1);
  };

  const current = NAV.find((item) => item.id === active);

  return (
    <div className="app-shell" data-provider-nonce={providerNonce}>
      <div className="window-dragbar" data-tauri-drag-region>
        <div className="dragbar-spacer" data-tauri-drag-region />
        <button className="command-trigger" type="button" onClick={() => setActive('workspace')}>
          <Icon name="command" size={14} />
          <span>{copy(language, 'Quick command', '快速命令')}</span>
          <kbd>⌘ K</kbd>
        </button>
        <div className="dragbar-actions">
          <select className="provider-quick-select" value={activeProvider.id} onChange={(event) => changeProvider(event.target.value)} aria-label="Active provider">
            {loadProviderProfiles().filter((profile) => profile.enabled).map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.displayName} · {profile.model}</option>
            ))}
          </select>
          <button className={`top-status status-${activeStatus.state}`} onClick={() => setActive('providers')} type="button">
            <span />{activeDefinition.shortName}
          </button>
        </div>
      </div>

      <aside className="app-sidebar">
        <div className="brand-compact">
          <div className="brand-mark"><Icon name="shield" size={20} /></div>
          <strong>TokenFence</strong>
        </div>

        <button className="new-session" onClick={startNew}><Icon name="plus" />{copy(language, 'New task', '新建任务')}</button>

        <nav className="app-nav" aria-label="Primary navigation">
          <span className="nav-label">{copy(language, 'BUILD', '工作')}</span>
          {NAV.filter((item) => item.group === 'work').map((item) => (
            <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => setActive(item.id)} title={copy(language, item.en, item.zh)}>
              <Icon name={item.icon} />
              <span>{copy(language, item.en, item.zh)}</span>
              {item.id === 'updates' && <i />}
            </button>
          ))}
          <span className="nav-label nav-label-system">{copy(language, 'SYSTEM', '系统')}</span>
          {NAV.filter((item) => item.group === 'system').map((item) => (
            <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => setActive(item.id)} title={copy(language, item.en, item.zh)}>
              <Icon name={item.icon} />
              <span>{copy(language, item.en, item.zh)}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="secure-foot"><Icon name="lock" size={14} /><span>{copy(language, 'Local safety layer', '本地安全层')}</span></div>
          <small>v1.7.1 · macOS</small>
        </div>
      </aside>

      <div className="app-content">
        <div className="screen-context-mobile">{copy(language, current?.en ?? '', current?.zh ?? '')}</div>
        {active === 'workspace' && <WorkspaceScreen language={language} openConversationId={openConversationId} newSessionNonce={newSessionNonce} onOpenProviders={() => setActive('providers')} onOpenRouting={() => setActive('routing')} onOpenAgents={() => setActive('agents')} />}
        {active === 'agents' && <AgentsScreen language={language} onStart={() => { setActive('workspace'); setNewSessionNonce((value) => value + 1); }} />}
        {active === 'files' && <FilesScreen language={language} onUseInWorkspace={() => setActive('workspace')} />}
        {active === 'routing' && <RoutingScreen language={language} />}
        {active === 'history' && <HistoryScreen language={language} onOpen={(id) => { setOpenConversationId(id); setActive('workspace'); }} />}
        {active === 'providers' && <ProvidersScreen language={language} onDone={() => setActive('workspace')} />}
        {active === 'updates' && <UpdatesScreen language={language} />}
        {active === 'settings' && <SettingsScreen language={language} onSettingsChanged={setSettings} />}
        {active === 'about' && <AboutScreen language={language} />}
      </div>
    </div>
  );
}

export function App() {
  return <ToastProvider><TokenFenceApp /></ToastProvider>;
}
