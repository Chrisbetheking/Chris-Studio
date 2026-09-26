import { useEffect, useMemo, useState } from 'react';
import type { AgentProfile, ComputerCapability, Language, ProviderProfile } from '../app/types';
import { BUILT_IN_SKILLS } from '../app/skills';
import { loadActiveAgentId, loadAgents, loadCustomSkills, loadProviderProfiles, nowIso, saveActiveAgentId, saveAgents } from '../app/store';
import { getComputerCapabilities } from '../features/platform/desktopClient';
import { Icon, type IconName } from '../components/Icon';
import { useToast } from '../components/Toast';

const copy = (language: Language, en: string, zh: string) => language === 'zh-CN' ? zh : en;

export function AgentsScreen({ language, onStart }: { language: Language; onStart: () => void }) {
  const [agents, setAgents] = useState<AgentProfile[]>(() => loadAgents());
  const [activeId, setActiveId] = useState(() => loadActiveAgentId());
  const [capabilities, setCapabilities] = useState<ComputerCapability[]>([]);
  const [customSkills, setCustomSkills] = useState(() => loadCustomSkills());
  const [providerProfiles, setProviderProfiles] = useState<ProviderProfile[]>(() => loadProviderProfiles().filter((profile) => profile.enabled));
  const [category, setCategory] = useState<'all' | typeof BUILT_IN_SKILLS[number]['category']>('all');
  const toast = useToast();
  const active = agents.find((agent) => agent.id === activeId) ?? agents[0];
  const allSkills = useMemo(() => [...BUILT_IN_SKILLS, ...customSkills], [customSkills]);
  const filtered = useMemo(() => allSkills.filter((skill) => category === 'all' || skill.category === category), [allSkills, category]);

  useEffect(() => { void getComputerCapabilities().then(setCapabilities); }, []);
  useEffect(() => { const update = () => setCustomSkills(loadCustomSkills()); window.addEventListener('tokenfence:skills-updated', update); return () => window.removeEventListener('tokenfence:skills-updated', update); }, []);
  useEffect(() => { const update = () => setProviderProfiles(loadProviderProfiles().filter((profile) => profile.enabled)); window.addEventListener('tokenfence:providers-updated', update); return () => window.removeEventListener('tokenfence:providers-updated', update); }, []);

  const updateAgent = (next: AgentProfile) => {
    const all = agents.map((agent) => agent.id === next.id ? { ...next, updatedAt: nowIso() } : agent);
    setAgents(all);
    saveAgents(all);
  };

  const toggleSkill = (skillId: string) => {
    if (!active) return;
    const selected = active.skillIds.includes(skillId);
    updateAgent({ ...active, skillIds: selected ? active.skillIds.filter((id) => id !== skillId) : [...active.skillIds, skillId] });
  };

  const selectAgent = (id: string) => {
    setActiveId(id);
    saveActiveAgentId(id);
  };

  const start = () => {
    if (!active) return;
    saveActiveAgentId(active.id);
    toast.show(copy(language, `${active.name} selected for the next workspace task.`, `${active.name} 已用于下一个工作台任务。`), 'success');
    onStart();
  };

  return (
    <main className="modern-page agent-page">
      <header className="compact-page-header">
        <div><span className="section-kicker">AGENT STUDIO</span><h1>{copy(language, 'Agents and built-in skills', 'Agent 与内置 Skills')}</h1><p>{copy(language, 'Compose reusable agents from audited local skills, provider routing and explicit permissions.', '用经过审查的本地 Skills、模型路由和明确权限组合可复用 Agent。')}</p></div>
        <div className="header-actions"><span className="metric-chip"><strong>{allSkills.length}</strong> Skills</span><button className="button primary" onClick={start}><Icon name="bot" />{copy(language, 'Start with this agent', '使用此 Agent')}</button></div>
      </header>

      <div className="agent-layout">
        <aside className="agent-roster">
          <div className="panel-title"><span>{copy(language, 'Agent profiles', 'Agent 配置')}</span><small>{agents.length}</small></div>
          {agents.map((agent) => <button key={agent.id} className={activeId === agent.id ? 'selected' : ''} onClick={() => selectAgent(agent.id)}><span className="agent-avatar"><Icon name={agent.id === 'desktop-operator' ? 'monitor' : agent.id === 'document-analyst' ? 'fileText' : 'code'} /></span><span><strong>{agent.name}</strong><small>{agent.skillIds.length} skills · {agent.collaborationMode === 'plan-execute-review' ? '3-role' : 'single'} · {agent.permissionMode}</small></span></button>)}
          <div className="computer-capabilities">
            <div className="panel-title"><span>Computer Use Beta</span></div>
            {capabilities.map((capability) => <div key={capability.id}><span className={`cap-dot cap-${capability.status}`} /><strong>{capability.id}</strong><small>{capability.status}</small></div>)}
            <p>{copy(language, 'v2.0 includes approval-gated screen capture, pointer and keyboard actions, scoped project writes and approved command presets. Every native action remains visible and user controlled.', 'v2.0 已加入需确认的屏幕捕获、鼠标与键盘操作、受限项目写入和批准命令预设；所有原生操作仍保持可见并由用户控制。')}</p>
          </div>
        </aside>

        <section className="agent-editor">
          {active && <>
            <div className="agent-editor-hero"><div className="agent-big-icon"><Icon name={active.id === 'desktop-operator' ? 'monitor' : active.id === 'document-analyst' ? 'fileText' : 'code'} size={28} /></div><div><input value={active.name} onChange={(event) => updateAgent({ ...active, name: event.target.value })} /><textarea value={active.description} onChange={(event) => updateAgent({ ...active, description: event.target.value })} rows={2} /></div><label><span>{copy(language, 'Permission', '权限')}</span><select value={active.permissionMode} onChange={(event) => updateAgent({ ...active, permissionMode: event.target.value as AgentProfile['permissionMode'] })}><option value="ask">Ask every time</option><option value="read-only">Read only</option><option value="trusted">Trusted workspace</option></select></label></div>
            <section className="agent-collaboration-config">
              <div className="agent-collaboration-head">
                <div><span className="section-kicker">MULTI-MODEL RUNTIME</span><h2>{copy(language, 'Agent collaboration', 'Agent 多模型协作')}</h2><p>{copy(language, 'Use one model, or assign explicit Planner, Executor and Reviewer roles. Missing configured roles fail visibly and never silently fall back.', '使用单模型，或明确分配规划、执行和审查角色。已配置角色缺失时会明确失败，绝不会静默回退。')}</p></div>
                <label><span>{copy(language, 'Mode', '模式')}</span><select value={active.collaborationMode || 'single'} onChange={(event) => updateAgent({ ...active, collaborationMode: event.target.value as AgentProfile['collaborationMode'] })}><option value="single">{copy(language, 'Single model', '单模型')}</option><option value="plan-execute-review">{copy(language, 'Plan → Execute → Review', '规划 → 执行 → 审查')}</option></select></label>
              </div>
              {active.collaborationMode === 'plan-execute-review' && <>
                <div className="agent-role-grid">
                  <label><span>{copy(language, 'Planner', '规划模型')}</span><select value={active.plannerProviderProfileId || ''} onChange={(event) => updateAgent({ ...active, plannerProviderProfileId: event.target.value || undefined })}><option value="">{copy(language, 'Use Executor model', '沿用执行模型')}</option>{providerProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName} · {profile.model}</option>)}</select><small>{copy(language, 'Creates a 2–6 step auditable plan.', '生成 2–6 步可审计计划。')}</small></label>
                  <label><span>{copy(language, 'Executor', '执行模型')}</span><select value={active.executorProviderProfileId || active.providerProfileId || ''} onChange={(event) => updateAgent({ ...active, executorProviderProfileId: event.target.value || undefined })}><option value="">{copy(language, 'Use workspace routing', '使用工作台路由')}</option>{providerProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName} · {profile.model}</option>)}</select><small>{copy(language, 'Streams the user-facing answer.', '流式生成面向用户的结果。')}</small></label>
                  <label><span>{copy(language, 'Reviewer', '审查模型')}</span><select value={active.reviewerProviderProfileId || ''} onChange={(event) => updateAgent({ ...active, reviewerProviderProfileId: event.target.value || undefined })}><option value="">{copy(language, 'Use Executor model', '沿用执行模型')}</option>{providerProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName} · {profile.model}</option>)}</select><small>{copy(language, 'Checks evidence, boundaries and completeness.', '检查证据、权限边界和完整性。')}</small></label>
                </div>
                <div className="agent-collaboration-foot"><label><span>{copy(language, 'Bounded revision', '有限修订')}</span><select value={active.maxRevisionRounds ?? 0} onChange={(event) => updateAgent({ ...active, maxRevisionRounds: Number(event.target.value) === 1 ? 1 : 0 })}><option value={0}>{copy(language, 'Review only · 3 calls', '仅审查 · 3 次调用')}</option><option value={1}>{copy(language, 'Allow one revision · up to 4 calls', '允许一次修订 · 最多 4 次调用')}</option></select></label><p><Icon name="shield" />{copy(language, 'Each role has a visible receipt. Provider errors remain attached to that role; Chris Studio never swaps models silently.', '每个角色都有可见回执。模型错误会归属于对应角色；Chris Studio 绝不会静默更换模型。')}</p></div>
              </>}
            </section>
            <div className="skill-toolbar"><div className="skill-categories">{(['all', 'coding', 'documents', 'research', 'security', 'productivity', 'automation'] as const).map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div><span>{active.skillIds.length} {copy(language, 'enabled', '已启用')}</span></div>
            <div className="skill-grid">{filtered.map((skill) => { const enabled = active.skillIds.includes(skill.id); return <button key={skill.id} className={`skill-card ${enabled ? 'enabled' : ''}`} onClick={() => toggleSkill(skill.id)}><div className="skill-card-head"><span className="skill-icon"><Icon name={skill.icon as IconName} /></span><span className={`skill-check ${enabled ? 'on' : ''}`}>{enabled && <Icon name="check" size={13} />}</span></div><strong>{copy(language, skill.nameEn, skill.nameZh)}</strong><p>{copy(language, skill.descriptionEn, skill.descriptionZh)}</p><footer>{skill.permissions.length ? skill.permissions.map((permission) => <span key={permission}>{permission}</span>) : <span>{copy(language, 'No extra permission', '无需额外权限')}</span>}</footer></button>; })}</div>
          </>}
        </section>
      </div>
    </main>
  );
}
