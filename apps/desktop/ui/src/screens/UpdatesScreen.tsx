import { useEffect, useState } from 'react';
import type { Language, UpdateInfo } from '../app/types';
import { loadSettings } from '../app/store';
import { checkForUpdates, openExternal } from '../features/updates/updateClient';
import { Icon } from '../components/Icon';

const copy = (language: Language, en: string, zh: string) => language === 'zh-CN' ? zh : en;

export function UpdatesScreen({ language }: { language: Language }) {
  const settings = loadSettings();
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); setInfo(await checkForUpdates(settings.githubOwner, settings.githubRepo)); setBusy(false); };
  useEffect(() => { void run(); }, []);
  return <main className="modern-page updates-page">
    <header className="compact-page-header"><div><span className="section-kicker">GITHUB RELEASE CHANNEL</span><h1>{copy(language, 'Updates from your repository', '从 GitHub 仓库获取更新')}</h1><p>{settings.githubOwner}/{settings.githubRepo}</p></div><div className="header-actions"><button className="button secondary" onClick={() => void run()} disabled={busy}><Icon name="refresh" />{busy ? copy(language, 'Checking…', '检查中…') : copy(language, 'Check now', '立即检查')}</button></div></header>
    <section className="update-hero"><div className={`update-orb ${info?.updateAvailable ? 'available' : ''}`}><Icon name={info?.updateAvailable ? 'download' : 'check'} size={30} /></div><span className="section-kicker">CHRIS STUDIO</span><h2>{info?.updateAvailable ? copy(language, `Version ${info.latestVersion} is available`, `发现新版本 ${info.latestVersion}`) : copy(language, 'You are on the latest published version', '当前已是最新发布版本')}</h2><p>{info?.errorMessage ?? copy(language, `Installed: ${info?.currentVersion ?? '2.1.0'} · Latest: ${info?.latestVersion ?? 'checking'}`, `已安装：${info?.currentVersion ?? '2.1.0'} · 最新：${info?.latestVersion ?? '检查中'}`)}</p>{info?.releaseUrl && <button className="button primary" onClick={() => void openExternal(info.releaseUrl!)}><Icon name="external" />{copy(language, 'Open GitHub Release', '打开 GitHub Release')}</button>}</section>
    {info?.assets.length ? <section className="release-assets"><div className="panel-title"><span>{copy(language, 'Release downloads', '发布下载')}</span><small>{info.assets.length}</small></div>{info.assets.map((asset) => <button key={asset.name} onClick={() => void openExternal(asset.downloadUrl)}><Icon name="download" /><span><strong>{asset.name}</strong><small>{(asset.size / 1_000_000).toFixed(1)} MB</small></span><Icon name="external" /></button>)}</section> : null}
    <section className="update-settings-summary"><article><Icon name="git" /><div><strong>{copy(language, 'Repository-linked', '已连接仓库')}</strong><p>{copy(language, 'The desktop app reads the latest public GitHub Release and its downloadable assets.', '桌面应用会读取最新公开 GitHub Release 及其下载资源。')}</p></div></article><article><Icon name="shield" /><div><strong>{copy(language, 'No silent installation', '不会静默安装')}</strong><p>{copy(language, 'Chris Studio reports updates but never replaces the application without your action.', 'Chris Studio 只提示更新，不会在未经操作时替换应用。')}</p></div></article></section>
  </main>;
}
