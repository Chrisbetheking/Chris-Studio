import { useMemo, useRef, useState } from 'react';
import type { CustomSkillDefinition, Language, SkillPermission } from '../app/types';
import { BUILT_IN_SKILLS } from '../app/skills';
import { loadCustomSkills, makeId, nowIso, saveCustomSkills } from '../app/store';
import { Icon, type IconName } from '../components/Icon';
import { useToast } from '../components/Toast';

const copy = (language: Language, en: string, zh: string) => language === 'zh-CN' ? zh : en;
const permissions: SkillPermission[] = ['network', 'files-read', 'files-write', 'github', 'terminal-safe', 'computer-view', 'computer-control'];

const permissionCopy: Record<SkillPermission, { en: string; zh: string }> = {
  network: { en: 'Network access', zh: '网络访问' },
  'files-read': { en: 'Read files', zh: '读取文件' },
  'files-write': { en: 'Write files', zh: '写入文件' },
  github: { en: 'GitHub access', zh: 'GitHub 操作' },
  'terminal-safe': { en: 'Safe commands', zh: '安全命令' },
  'computer-view': { en: 'View screen', zh: '查看屏幕' },
  'computer-control': { en: 'Control computer', zh: '控制电脑' },
};

function blankSkill(): CustomSkillDefinition {
  return {
    id: makeId('skill'),
    nameEn: 'New Skill',
    nameZh: '新建 Skill',
    descriptionEn: '',
    descriptionZh: '',
    category: 'productivity',
    icon: 'sparkles',
    permissions: [],
    systemPrompt: '',
    builtIn: false,
    version: '1.0.0',
    source: 'local',
    updatedAt: nowIso(),
  };
}

export function SkillsScreen({ language }: { language: Language }) {
  const [custom, setCustom] = useState<CustomSkillDefinition[]>(() => loadCustomSkills());
  const [selectedId, setSelectedId] = useState(custom[0]?.id ?? 'secure-coder');
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement | null>(null);
  const toast = useToast();
  const all = useMemo(() => [...BUILT_IN_SKILLS, ...custom], [custom]);
  const selected = all.find((skill) => skill.id === selectedId) ?? all[0];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((skill) => [skill.nameEn, skill.nameZh, skill.descriptionEn, skill.descriptionZh, skill.category]
      .some((value) => value.toLowerCase().includes(needle)));
  }, [all, query]);

  const update = (patch: Partial<CustomSkillDefinition>) => {
    if (!selected || selected.builtIn) return;
    const next = custom.map((skill) => skill.id === selected.id ? { ...skill, ...patch, updatedAt: nowIso() } : skill);
    setCustom(next);
    saveCustomSkills(next);
  };

  const create = () => {
    const skill = blankSkill();
    const next = [skill, ...custom];
    setCustom(next);
    saveCustomSkills(next);
    setSelectedId(skill.id);
    setQuery('');
  };

  const remove = () => {
    if (!selected || selected.builtIn || !window.confirm(copy(language, 'Delete this local skill?', '删除这个本地 Skill？'))) return;
    const next = custom.filter((skill) => skill.id !== selected.id);
    setCustom(next);
    saveCustomSkills(next);
    setSelectedId(BUILT_IN_SKILLS[0].id);
  };

  const exportSkills = () => {
    const blob = new Blob([JSON.stringify({ schema: 'chris-studio-skills-v1', exportedAt: nowIso(), skills: custom }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'chris-studio-skills.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importSkills = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { skills?: CustomSkillDefinition[] } | CustomSkillDefinition[];
      const source = Array.isArray(parsed) ? parsed : parsed.skills ?? [];
      const safe = source
        .filter((skill) => skill && typeof skill.id === 'string' && typeof skill.systemPrompt === 'string')
        .map((skill) => ({ ...skill, builtIn: false, source: 'imported' as const, updatedAt: nowIso() }));
      const map = new Map(custom.map((skill) => [skill.id, skill]));
      safe.forEach((skill) => map.set(skill.id, skill));
      const next = Array.from(map.values()).slice(0, 200);
      setCustom(next);
      saveCustomSkills(next);
      if (safe[0]) setSelectedId(safe[0].id);
      toast.show(copy(language, `Imported ${safe.length} skills.`, `已导入 ${safe.length} 个 Skills。`), 'success');
    } catch {
      toast.show(copy(language, 'Invalid skill package.', 'Skill 包格式无效。'), 'error');
    }
  };

  return (
    <main className="modern-page skills-page">
      <header className="compact-page-header">
        <div>
          <span className="section-kicker">SKILL LIBRARY</span>
          <h1>{copy(language, 'Built-in and local skills', '内置与本地 Skills')}</h1>
          <p>{copy(language, 'Create, audit, import and export reusable agent instructions with explicit permissions.', '创建、审查、导入和导出带明确权限的可复用 Agent 指令。')}</p>
        </div>
        <div className="header-actions">
          <input ref={input} hidden type="file" accept="application/json,.json" onChange={(event) => { void importSkills(event.target.files?.[0]); event.currentTarget.value = ''; }} />
          <button className="button secondary" onClick={() => input.current?.click()}><Icon name="download" />{copy(language, 'Import', '导入')}</button>
          <button className="button secondary" onClick={exportSkills}><Icon name="external" />{copy(language, 'Export', '导出')}</button>
          <button className="button primary" onClick={create}><Icon name="plus" />{copy(language, 'New skill', '新建 Skill')}</button>
        </div>
      </header>

      <div className="skills-layout">
        <aside className="skill-library-list">
          <div className="skill-library-head">
            <div className="panel-title"><span>{copy(language, 'Library', '技能库')}</span><small>{all.length}</small></div>
            <label className="skill-search">
              <Icon name="search" size={15} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy(language, 'Search skills', '搜索 Skills')} />
            </label>
          </div>
          <div className="skill-library-scroll">
            {filtered.map((skill) => (
              <button key={skill.id} className={selectedId === skill.id ? 'selected' : ''} onClick={() => setSelectedId(skill.id)}>
                <Icon name={skill.icon as IconName} />
                <span>
                  <strong>{copy(language, skill.nameEn, skill.nameZh)}</strong>
                  <small>{skill.builtIn ? copy(language, 'Built in', '内置') : copy(language, 'Local', '本地')} · {skill.category}</small>
                </span>
              </button>
            ))}
            {!filtered.length && <div className="skill-list-empty">{copy(language, 'No matching skills.', '没有匹配的 Skill。')}</div>}
          </div>
        </aside>

        <section className="skill-editor-panel">
          {selected && <>
            <header>
              <div className="agent-big-icon"><Icon name={selected.icon as IconName} /></div>
              <div>
                <span className="file-kind-pill">{selected.builtIn ? 'BUILT IN' : 'LOCAL'}</span>
                <h2>{copy(language, selected.nameEn, selected.nameZh)}</h2>
                <p>{copy(language, selected.descriptionEn, selected.descriptionZh)}</p>
              </div>
              {!selected.builtIn && <button className="icon-button danger" onClick={remove}><Icon name="trash" /></button>}
            </header>

            <div className="skill-edit-grid">
              <label><span>English name</span><input disabled={selected.builtIn} value={selected.nameEn} onChange={(event) => update({ nameEn: event.target.value })} /></label>
              <label><span>中文名称</span><input disabled={selected.builtIn} value={selected.nameZh} onChange={(event) => update({ nameZh: event.target.value })} /></label>
              <label><span>Category</span><select disabled={selected.builtIn} value={selected.category} onChange={(event) => update({ category: event.target.value as CustomSkillDefinition['category'] })}>{['coding', 'documents', 'research', 'security', 'productivity', 'automation'].map((value) => <option key={value}>{value}</option>)}</select></label>
              <label><span>Version</span><input disabled={selected.builtIn} value={'version' in selected && typeof selected.version === 'string' ? selected.version : 'built-in'} onChange={(event) => update({ version: event.target.value })} /></label>
              <label className="field-wide"><span>English description</span><input disabled={selected.builtIn} value={selected.descriptionEn} onChange={(event) => update({ descriptionEn: event.target.value })} /></label>
              <label className="field-wide"><span>中文说明</span><input disabled={selected.builtIn} value={selected.descriptionZh} onChange={(event) => update({ descriptionZh: event.target.value })} /></label>
              <label className="field-wide"><span>System prompt</span><textarea disabled={selected.builtIn} rows={10} value={selected.systemPrompt} onChange={(event) => update({ systemPrompt: event.target.value })} /></label>
            </div>

            <div className="permission-picker">
              <div className="permission-picker-title">
                <strong>{copy(language, 'Declared permissions', '声明权限')}</strong>
                <small>{copy(language, 'Built-in skills are read-only. Local skills can be edited immediately.', '内置 Skill 为只读，本地 Skill 修改后会立即保存。')}</small>
              </div>
              <div className="permission-grid">
                {permissions.map((permission) => (
                  <label key={permission}>
                    <input type="checkbox" disabled={selected.builtIn} checked={selected.permissions.includes(permission)} onChange={(event) => update({ permissions: event.target.checked ? [...selected.permissions, permission] : selected.permissions.filter((item) => item !== permission) })} />
                    <span><strong>{copy(language, permissionCopy[permission].en, permissionCopy[permission].zh)}</strong><small>{permission}</small></span>
                  </label>
                ))}
              </div>
            </div>
          </>}
        </section>
      </div>
    </main>
  );
}
