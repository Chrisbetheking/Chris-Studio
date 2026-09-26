import { useMemo, useState } from 'react';
import type { FileKind, Language, RoutingRule } from '../app/types';
import { loadProviderProfiles, loadRoutingRules, saveRoutingRules } from '../app/store';
import { providerDefinition } from '../app/providerRegistry';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';

const copy = (language: Language, en: string, zh: string) => language === 'zh-CN' ? zh : en;
const kinds: Array<{ kind: FileKind | 'default'; icon: 'route' | 'code' | 'fileText' | 'image' | 'table' | 'file'; en: string; zh: string }> = [
  { kind: 'code', icon: 'code', en: 'Code and repositories', zh: '代码与仓库' },
  { kind: 'pdf', icon: 'fileText', en: 'PDF documents', zh: 'PDF 文档' },
  { kind: 'image', icon: 'image', en: 'Images and OCR', zh: '图片与 OCR' },
  { kind: 'spreadsheet', icon: 'table', en: 'Spreadsheets', zh: '电子表格' },
  { kind: 'document', icon: 'file', en: 'Office documents', zh: '办公文档' },
  { kind: 'default', icon: 'route', en: 'General fallback', zh: '通用回退' },
];

export function RoutingScreen({ language }: { language: Language }) {
  const profiles = useMemo(() => loadProviderProfiles().filter((profile) => profile.enabled), []);
  const [rules, setRules] = useState<RoutingRule[]>(() => loadRoutingRules());
  const toast = useToast();
  const update = (kind: FileKind | 'default', patch: Partial<RoutingRule>) => {
    const current = rules.find((rule) => rule.kind === kind);
    const next = current ? rules.map((rule) => rule.kind === kind ? { ...rule, ...patch } : rule) : [...rules, { id: `route-${kind}`, kind, providerProfileId: profiles[0]?.id ?? '', enabled: true, reasonEn: 'Custom route', reasonZh: '自定义路由', ...patch }];
    setRules(next);
    saveRoutingRules(next);
  };
  return <main className="modern-page routing-page">
    <header className="compact-page-header"><div><span className="section-kicker">MODEL ROUTER</span><h1>{copy(language, 'Route every file to the right model', '让不同文件自动选择合适模型')}</h1><p>{copy(language, 'Rules are evaluated locally. A routed provider is never used until its connection has been verified.', '路由规则在本地执行；未通过连接验证的 Provider 不会被自动调用。')}</p></div><div className="header-actions"><button className="button secondary" onClick={() => toast.show(copy(language, 'Routing rules saved locally.', '路由规则已保存到本地。'), 'success')}><Icon name="check" />{copy(language, 'Rules saved', '规则已保存')}</button></div></header>
    <div className="routing-grid">{kinds.map((item) => { const rule = rules.find((entry) => entry.kind === item.kind); const profile = profiles.find((entry) => entry.id === rule?.providerProfileId) ?? profiles[0]; const def = profile ? providerDefinition(profile.providerId) : null; return <article key={item.kind} className={!rule?.enabled ? 'disabled' : ''}><header><span className="routing-icon"><Icon name={item.icon} /></span><div><strong>{copy(language, item.en, item.zh)}</strong><small>{rule?.reasonEn ?? 'Routing rule'}</small></div><label className="switch"><input type="checkbox" checked={rule?.enabled ?? true} onChange={(event) => update(item.kind, { enabled: event.target.checked })} /><span /></label></header><div className="route-flow"><span>{item.kind}</span><Icon name="chevron" /><div>{def && <span className="provider-avatar tiny" style={{ '--provider-accent': def.accent } as React.CSSProperties}>{def.shortName}</span>}<select value={profile?.id ?? ''} onChange={(event) => update(item.kind, { providerProfileId: event.target.value })}>{profiles.map((entry) => <option key={entry.id} value={entry.id}>{entry.displayName} · {entry.model}</option>)}</select></div></div><label><span>{copy(language, 'Optional model override', '可选模型覆盖')}</span><input value={rule?.modelOverride ?? ''} onChange={(event) => update(item.kind, { modelOverride: event.target.value })} placeholder={profile?.model ?? ''} /></label></article>; })}</div>
    <section className="routing-principles"><article><Icon name="shield" /><div><strong>{copy(language, 'Safety before routing', '先安全，后路由')}</strong><p>{copy(language, 'Prompt and extracted file text are scanned before the route is executed.', '提示词与提取后的文件文本会在路由执行前完成扫描。')}</p></div></article><article><Icon name="sparkles" /><div><strong>{copy(language, 'Token-aware context', 'Token 感知上下文')}</strong><p>{copy(language, 'Local compaction and file classification happen before provider billing starts.', '本地压缩与文件分类发生在 Provider 计费之前。')}</p></div></article><article><Icon name="lock" /><div><strong>{copy(language, 'Explicit destinations', '明确发送目标')}</strong><p>{copy(language, 'The workspace inspector always shows the final provider and model.', '工作台检查器始终显示最终 Provider 与模型。')}</p></div></article></section>
  </main>;
}
