import { useEffect, useMemo, useState } from 'react';
import type {
  ChatMessage,
  GitHubConnectionInfo,
  GitHubIssueSummary,
  GitHubRepositoryOverview,
  Language,
  ProjectChangeSessionResult,
  ProjectCodingPlan,
  ProjectCodingReview,
  ProjectCommandResult,
  ProjectFileNode,
  ProjectPatchFileSummary,
  ProjectWorkspace,
  ProviderProfile,
} from '../app/types';
import {
  loadActiveAgentId,
  loadActiveProvider,
  loadAgents,
  loadGitHubRepoUrl,
  loadProjectRoot,
  loadProviderProfiles,
  loadSettings,
  recordTokenUsage,
  saveGitHubRepoUrl,
  saveProjectRoot,
} from '../app/store';
import {
  acceptProjectChangeSession,
  applyProjectChangeSession,
  chooseProjectFolder,
  clonePublicRepository,
  commitProjectChanges,
  loadLatestProjectChangeSession,
  createGitBranch,
  projectGitDiff,
  projectGitStatus,
  pushGitBranch,
  readProjectFile,
  reopenProjectFolder,
  rollbackProjectChangeSession,
  runProjectPreset,
  scanProject,
  writeProjectFile,
} from '../features/projects/projectClient';
import {
  createGitHubPullRequest,
  deleteGitHubToken,
  getGitHubRepository,
  listGitHubIssues,
  saveGitHubToken,
  testGitHubConnection,
} from '../features/github/githubClient';
import { Icon } from '../components/Icon';
import { sendProviderChat } from '../features/providers/providerClient';
import { resolveAgentRoleProfiles } from '../features/agent-runtime/collaborativeRun';
import { scanText } from '../features/safety/scanner';
import { estimateTokens } from '../features/tokens/optimizer';
import { useToast } from '../components/Toast';
import {
  chooseProjectContextFiles,
  composeSelectedPatch,
  extractUnifiedDiff,
  normalizeApprovedChecks,
  parseProjectCodingPlan,
  parseProjectCodingReview,
  parseUnifiedDiff,
} from '../features/projects/projectChangeSession';

const copy = (language: Language, en: string, zh: string) => language === 'zh-CN' ? zh : en;

type CodingStage = 'idle' | 'planning' | 'reading' | 'proposed' | 'applied' | 'tested' | 'reviewed' | 'accepted' | 'rolled-back' | 'failed';

const CHECK_LABELS: Record<string, string> = {
  'npm-typecheck': 'npm typecheck',
  'npm-test': 'npm test',
  'npm-build': 'npm build',
  'cargo-check': 'cargo check',
  'cargo-test': 'cargo test',
};

function flatten(nodes: ProjectFileNode[]): ProjectFileNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flatten(node.children) : [])]);
}

function repoParts(url: string): { owner: string; repo: string } | null {
  const match = url.trim().match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/);
  return match ? { owner: match[1], repo: match[2] } : null;
}

function providerReady(profile: ProviderProfile): boolean {
  return profile.providerId !== 'local-demo' && profile.enabled && Boolean(profile.model.trim());
}

function stageLabel(language: Language, stage: CodingStage): string {
  const labels: Record<CodingStage, [string, string]> = {
    idle: ['Ready', '就绪'], planning: ['Planning', '规划中'], reading: ['Reading context', '读取上下文'],
    proposed: ['Review diff', '审查 Diff'], applied: ['Applied', '已应用'], tested: ['Checks complete', '检查完成'],
    reviewed: ['Reviewer complete', '审查完成'], accepted: ['Accepted', '已接受'], 'rolled-back': ['Rolled back', '已回滚'], failed: ['Needs attention', '需要处理'],
  };
  return copy(language, labels[stage][0], labels[stage][1]);
}

function roleProfiles() {
  const profiles = loadProviderProfiles();
  const fallback = loadActiveProvider();
  const agent = loadAgents().find((entry) => entry.id === loadActiveAgentId()) ?? loadAgents()[0];
  if (!agent) throw new Error('No Agent profile is configured.');
  return { agent, roles: resolveAgentRoleProfiles(agent, profiles, fallback) };
}

function testEvidence(results: ProjectCommandResult[]): string {
  return results.map((result) => [
    `$ ${result.command}`,
    `status=${result.ok ? 'passed' : 'failed'} exit=${result.exitCode ?? 'unknown'} durationMs=${result.durationMs}`,
    result.stdout,
    result.stderr,
    result.errorMessage,
  ].filter(Boolean).join('\n')).join('\n\n').slice(0, 80_000);
}

export function ProjectsScreen({ language }: { language: Language }) {
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(null);
  const [tree, setTree] = useState<ProjectFileNode[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [command, setCommand] = useState<ProjectCommandResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [repoUrl, setRepoUrl] = useState(() => loadGitHubRepoUrl());
  const [token, setToken] = useState('');
  const [github, setGithub] = useState<GitHubConnectionInfo | null>(null);
  const [overview, setOverview] = useState<GitHubRepositoryOverview | null>(null);
  const [issues, setIssues] = useState<GitHubIssueSummary[]>([]);
  const [branch, setBranch] = useState('chris-studio/agent-change');
  const [commitMessage, setCommitMessage] = useState('feat: apply reviewed Chris Studio change');
  const [prTitle, setPrTitle] = useState('Chris Studio reviewed change');
  const [prBody, setPrBody] = useState('Created from the Chris Studio scoped coding workspace after local review and checks.');
  const [baseBranch, setBaseBranch] = useState('main');

  const [agentTask, setAgentTask] = useState('');
  const [codingStage, setCodingStage] = useState<CodingStage>('idle');
  const [codingPlan, setCodingPlan] = useState<ProjectCodingPlan | null>(null);
  const [proposalFiles, setProposalFiles] = useState<ProjectPatchFileSummary[]>([]);
  const [selectedProposalPaths, setSelectedProposalPaths] = useState<string[]>([]);
  const [activeDiffPath, setActiveDiffPath] = useState('');
  const [changeSession, setChangeSession] = useState<ProjectChangeSessionResult | null>(null);
  const [selectedChecks, setSelectedChecks] = useState<string[]>([]);
  const [checkResults, setCheckResults] = useState<ProjectCommandResult[]>([]);
  const [codingReview, setCodingReview] = useState<ProjectCodingReview | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);

  const toast = useToast();
  const flat = useMemo(() => flatten(tree), [tree]);
  const dirty = content !== original;
  const activeDiff = proposalFiles.find((entry) => entry.path === activeDiffPath) ?? proposalFiles[0];
  const sessionPendingFiles = changeSession?.files.filter((file) => file.status === 'applied') ?? [];
  const sessionRollbackFiles = changeSession?.files.filter((file) => file.status === 'applied' || file.status === 'rollback-blocked') ?? [];

  const refreshTree = async () => setTree(await scanProject());

  const recoverPendingTransaction = async () => {
    const recovered = await loadLatestProjectChangeSession();
    if (!recovered?.session.sessionId) return;
    const files = parseUnifiedDiff(recovered.patch);
    setChangeSession(recovered.session);
    setProposalFiles(files);
    setSelectedProposalPaths(files.map((file) => file.path));
    setActiveDiffPath(files[0]?.path ?? '');
    setCodingPlan(null);
    setCheckResults([]);
    setCodingReview(null);
    setCodingStage(recovered.session.files.some((file) => file.status === 'rollback-blocked') ? 'failed' : 'applied');
    toast.show(copy(language, 'Recovered a pending protected project transaction. You can inspect, test, accept or roll it back; the original model plan is not available after restart.', '已恢复一个待处理的受保护项目事务。你可以检查、测试、接受或回滚；应用重启后原始模型计划不可恢复。'), 'warning');
  };

  useEffect(() => {
    const root = loadProjectRoot();
    if (!root) return;
    void reopenProjectFolder(root).then((value) => {
      if (!value) return;
      setWorkspace(value);
      void refreshTree().then(recoverPendingTransaction);
    });
  }, []);

  const resetCodingSession = () => {
    setCodingStage('idle');
    setCodingPlan(null);
    setProposalFiles([]);
    setSelectedProposalPaths([]);
    setActiveDiffPath('');
    setChangeSession(null);
    setSelectedChecks([]);
    setCheckResults([]);
    setCodingReview(null);
  };

  const openFolder = async () => {
    const value = await chooseProjectFolder();
    if (!value) return;
    setWorkspace(value);
    saveProjectRoot(value.root);
    setSelectedPath('');
    setContent('');
    setOriginal('');
    resetCodingSession();
    await refreshTree();
    await recoverPendingTransaction();
  };

  const openFile = async (path: string) => {
    if (dirty && !window.confirm(copy(language, 'Discard unsaved editor changes?', '放弃尚未保存的编辑内容？'))) return;
    const result = await readProjectFile(path);
    if (!result.ok || result.binary) {
      toast.show(result.errorMessage ?? copy(language, 'This file cannot be edited as text.', '此文件无法作为文本编辑。'), 'warning');
      return;
    }
    setSelectedPath(path);
    setContent(result.content);
    setOriginal(result.content);
  };

  const save = async () => {
    if (!selectedPath || !dirty) return;
    if (!window.confirm(copy(language, 'Write this reviewed change and create a local backup?', '写入此项已审查修改并创建本地备份？'))) return;
    const result = await writeProjectFile(selectedPath, content, true);
    if (!result.ok) return toast.show(result.errorMessage ?? 'Write failed.', 'error');
    setOriginal(content);
    toast.show(copy(language, `Saved with backup: ${result.backupPath ?? 'created'}`, `已保存并创建备份：${result.backupPath ?? '完成'}`), 'success');
    await refreshTree();
  };

  const run = async (preset: string) => {
    setBusy(true);
    try {
      const result = preset === 'git-status' ? await projectGitStatus() : preset === 'git-diff' ? await projectGitDiff() : await runProjectPreset(preset, true);
      setCommand(result);
    } finally {
      setBusy(false);
    }
  };

  const connectGitHub = async () => {
    if (token.trim()) {
      const saved = await saveGitHubToken(token.trim());
      if (!saved.ok) return toast.show(saved.message ?? 'GitHub token could not be stored.', 'error');
      setToken('');
    }
    const status = await testGitHubConnection();
    setGithub(status);
    if (!status.ok) return toast.show(status.errorMessage ?? 'GitHub connection failed.', 'error');
    saveGitHubRepoUrl(repoUrl);
    const parts = repoParts(repoUrl);
    if (parts) {
      const [repo, repoIssues] = await Promise.all([getGitHubRepository(parts.owner, parts.repo), listGitHubIssues(parts.owner, parts.repo)]);
      setOverview(repo);
      setIssues(repoIssues);
    }
    toast.show(copy(language, `Connected as ${status.login}.`, `已连接 GitHub：${status.login}。`), 'success');
  };

  const cloneRepo = async () => {
    const value = await clonePublicRepository(repoUrl);
    if (!value) return;
    setWorkspace(value);
    saveProjectRoot(value.root);
    resetCodingSession();
    await refreshTree();
    await recoverPendingTransaction();
  };

  const generateCodingProposal = async () => {
    if (!workspace || !agentTask.trim()) return;
    if (sessionRollbackFiles.length) {
      toast.show(copy(language, 'Resolve the current applied transaction by accepting or rolling it back before starting another.', '请先接受或回滚当前已应用事务，再启动新的修改会话。'), 'warning');
      return;
    }
    if (!workspace.gitRepository) {
      toast.show(copy(language, 'Open a Git repository before starting a transactional coding session.', '请先打开 Git 仓库，再启动事务式 Coding Agent。'), 'warning');
      return;
    }
    setAgentBusy(true);
    setCodingStage('planning');
    setCodingPlan(null);
    setProposalFiles([]);
    setSelectedProposalPaths([]);
    setChangeSession(null);
    setCheckResults([]);
    setCodingReview(null);
    try {
      const settings = loadSettings();
      const { roles } = roleProfiles();
      if (![roles.planner, roles.executor, roles.reviewer].every(providerReady)) {
        throw new Error(copy(language, 'Planner, Executor and Reviewer must each use an enabled non-demo model.', 'Planner、Executor 和 Reviewer 都必须使用已启用的真实模型。'));
      }
      const [status, diff] = await Promise.all([projectGitStatus(), projectGitDiff()]);
      const fileList = flat.filter((node) => node.kind === 'file').slice(0, 2_000).map((node) => `${node.path}\t${node.size}`).join('\n');
      const plannerContext = [
        `TASK:\n${agentTask.trim()}`,
        `PROJECT: ${workspace.name}`,
        `REPOSITORY TREE (path and bytes):\n${fileList}`,
        `GIT STATUS:\n${status.stdout || status.stderr || '(clean)'}`,
        `CURRENT DIFF:\n${(diff.stdout || diff.stderr || '(none)').slice(0, 40_000)}`,
        selectedPath ? `CURRENTLY SELECTED FILE: ${selectedPath}` : 'NO FILE CURRENTLY SELECTED',
      ].join('\n\n');
      const plannerSafety = scanText(plannerContext, settings.customSensitiveTerms);
      if ((plannerSafety.riskLevel === 'critical' || plannerSafety.riskLevel === 'high') && !window.confirm(copy(language, 'Sensitive repository data was found. Send only the locally redacted planning context?', '检测到敏感仓库数据。是否仅发送本地脱敏后的规划上下文？'))) {
        setCodingStage('idle');
        return;
      }
      const safePlannerContext = plannerSafety.findings.length ? plannerSafety.redactedText : plannerContext;
      const plannerMessages: Pick<ChatMessage, 'role' | 'content'>[] = [
        {
          role: 'system',
          content: 'You are the Planner in Chris Studio Coding Agent. Inspect only the supplied scoped repository metadata. Do not write code yet. Return JSON only: {"summary":"goal","steps":[{"title":"step","detail":"evidence"}],"filesToRead":["relative/path"],"checks":["npm-typecheck"|"npm-test"|"npm-build"|"cargo-check"|"cargo-test"],"risks":["risk"]}. Request at most 12 text files and 3 checks. Never request secrets, .git contents, node_modules, target, dist, binaries or files outside the repository.',
        },
        { role: 'user', content: safePlannerContext },
      ];
      const plannerReply = await sendProviderChat(roles.planner, plannerMessages, settings.requestTimeoutMs);
      if (!plannerReply.ok || !plannerReply.content) throw new Error(plannerReply.errorMessage ?? 'Planner failed.');
      const plan = parseProjectCodingPlan(plannerReply.content);
      setCodingPlan(plan);
      setCodingStage('reading');

      const contextPaths = chooseProjectContextFiles(tree, plan.filesToRead, selectedPath, agentTask);
      const contextParts: string[] = [];
      const scopedReadPaths: string[] = [];
      let totalChars = 0;
      for (const path of contextPaths) {
        const file = await readProjectFile(path);
        if (!file.ok || file.binary) continue;
        const remaining = 180_000 - totalChars;
        if (remaining <= 0) break;
        const text = file.content.slice(0, Math.min(80_000, remaining));
        totalChars += text.length;
        contextParts.push(`FILE: ${path}\n${text}`);
      }
      const executorContext = [
        `TASK:\n${agentTask.trim()}`,
        `PLAN:\n${plan.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`,
        `GIT STATUS BEFORE CHANGE:\n${status.stdout || status.stderr || '(clean)'}`,
        `SCOPED FILE CONTENTS:\n\n${contextParts.join('\n\n---\n\n') || '(No readable files were supplied.)'}`,
      ].join('\n\n');
      const executorSafety = scanText(executorContext, settings.customSensitiveTerms);
      const safeExecutorContext = executorSafety.findings.length ? executorSafety.redactedText : executorContext;
      const executorMessages: Pick<ChatMessage, 'role' | 'content'>[] = [
        {
          role: 'system',
          content: 'You are the Executor in Chris Studio Coding Agent. Produce the smallest correct code change from the exact supplied file contents. Never invent unseen file contents. Do not include commands, prose or Markdown outside the required sections. Do not rename files, change file modes, edit binaries, submodules, .git, node_modules, target, dist or paths outside the repository. Return exactly: SUMMARY: one sentence, then PATCH: followed by a valid unified Git diff beginning with diff --git. New, modified and deleted text files are allowed. If context is insufficient, return SUMMARY explaining the missing file and PATCH: NONE.',
        },
        { role: 'user', content: safeExecutorContext },
      ];
      const executorReply = await sendProviderChat(roles.executor, executorMessages, settings.requestTimeoutMs);
      if (!executorReply.ok || !executorReply.content) throw new Error(executorReply.errorMessage ?? 'Executor failed.');
      const patch = extractUnifiedDiff(executorReply.content);
      const files = parseUnifiedDiff(patch);
      if (!patch || !files.length) throw new Error(copy(language, 'Executor did not return a valid multi-file unified diff.', 'Executor 没有返回有效的多文件统一 Diff。'));
      if (files.some((file) => file.action === 'rename')) throw new Error(copy(language, 'File renames are blocked in this transactional release.', '当前事务版本禁止文件重命名。'));
      const availableFiles = new Set(flat.filter((node) => node.kind === 'file').map((node) => node.path));
      const readFiles = new Set(scopedReadPaths);
      const unreadTargets = files.filter((file) => file.action !== 'add' && !readFiles.has(file.path));
      if (unreadTargets.length) {
        throw new Error(copy(language, `Executor attempted to change files that were not supplied as scoped context: ${unreadTargets.map((file) => file.path).join(', ')}`, `Executor 尝试修改未作为受限上下文读取的文件：${unreadTargets.map((file) => file.path).join('、')}`));
      }
      const conflictingAdds = files.filter((file) => file.action === 'add' && availableFiles.has(file.path));
      if (conflictingAdds.length) {
        throw new Error(copy(language, `Executor declared existing files as new: ${conflictingAdds.map((file) => file.path).join(', ')}`, `Executor 把现有文件声明为新增文件：${conflictingAdds.map((file) => file.path).join('、')}`));
      }
      setProposalFiles(files);
      setSelectedProposalPaths(files.map((file) => file.path));
      setActiveDiffPath(files[0].path);
      setSelectedChecks(normalizeApprovedChecks(plan, availableFiles.has('package.json'), availableFiles.has('Cargo.toml') || availableFiles.has('apps/desktop/src-tauri/Cargo.toml')));
      setCodingStage('proposed');
      recordTokenUsage({
        id: `project_agent_${Date.now()}`,
        createdAt: new Date().toISOString(),
        provider: `${roles.planner.displayName} → ${roles.executor.displayName}`,
        model: `${roles.planner.model} → ${roles.executor.model}`,
        inputTokens: estimateTokens(safePlannerContext + safeExecutorContext),
        outputTokens: estimateTokens(plannerReply.content + executorReply.content),
        savedTokens: Math.max(0, estimateTokens(plannerContext + executorContext) - estimateTokens(safePlannerContext + safeExecutorContext)),
      });
      toast.show(copy(language, `Prepared ${files.length} reviewed file change(s). Nothing has been written yet.`, `已准备 ${files.length} 个待审查文件修改，目前尚未写入。`), 'success');
    } catch (error) {
      setCodingStage('failed');
      toast.show(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setAgentBusy(false);
    }
  };

  const toggleProposalPath = (path: string) => {
    setSelectedProposalPaths((current) => current.includes(path) ? current.filter((entry) => entry !== path) : [...current, path]);
  };

  const applySelectedProposal = async () => {
    const selectedPatch = composeSelectedPatch(proposalFiles, selectedProposalPaths);
    if (!selectedPatch) return;
    if (!window.confirm(copy(language, `Apply ${selectedProposalPaths.length} selected file change(s)? Chris Studio will snapshot every existing target first.`, `应用选中的 ${selectedProposalPaths.length} 个文件修改？Chris Studio 会先为所有现有目标创建快照。`))) return;
    setBusy(true);
    try {
      const result = await applyProjectChangeSession(selectedPatch, true);
      setChangeSession(result);
      if (!result.ok) {
        setCodingStage('failed');
        toast.show(result.errorMessage ?? 'Project transaction failed.', 'error');
        return;
      }
      setCodingStage('applied');
      setCodingReview(null);
      setCheckResults([]);
      await refreshTree();
      const diff = await projectGitDiff();
      setCommand(diff);
      toast.show(copy(language, 'Patch applied with a protected transaction backup. Review the real Git diff and run checks.', '补丁已通过受保护事务写入。请检查真实 Git Diff 并运行检查。'), 'success');
    } finally {
      setBusy(false);
    }
  };

  const runSelectedChecks = async () => {
    if (!changeSession?.ok) return;
    if (!selectedChecks.length) {
      toast.show(copy(language, 'Select at least one approved check.', '请至少选择一项批准的检查。'), 'warning');
      return;
    }
    if (!window.confirm(copy(language, `Run ${selectedChecks.map((entry) => CHECK_LABELS[entry]).join(', ')} in the approved project folder?`, `在批准的项目目录运行 ${selectedChecks.map((entry) => CHECK_LABELS[entry]).join('、')}？`))) return;
    setBusy(true);
    const results: ProjectCommandResult[] = [];
    try {
      for (const preset of selectedChecks) {
        const result = await runProjectPreset(preset, true);
        results.push(result);
        setCommand(result);
        if (!result.ok) break;
      }
      setCheckResults(results);
      setCodingStage('tested');
      const failed = results.find((result) => !result.ok);
      toast.show(failed ? copy(language, `${failed.command} failed. Review logs before asking Reviewer.`, `${failed.command} 失败，请先检查日志。`) : copy(language, 'All selected checks passed.', '所选检查全部通过。'), failed ? 'warning' : 'success');
    } finally {
      setBusy(false);
    }
  };

  const runReviewer = async () => {
    if (!changeSession?.ok || !codingPlan) return;
    setAgentBusy(true);
    try {
      const settings = loadSettings();
      const { roles } = roleProfiles();
      if (!providerReady(roles.reviewer)) throw new Error(copy(language, 'The configured Reviewer model is unavailable. Chris Studio will not switch models silently.', '已配置的 Reviewer 模型不可用，Chris Studio 不会静默切换模型。'));
      const diff = await projectGitDiff();
      const evidence = [
        `TASK:\n${agentTask.trim()}`,
        `PLAN:\n${codingPlan.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`,
        `FILES IN TRANSACTION:\n${changeSession.files.map((file) => `${file.path} action=${file.action} status=${file.status}`).join('\n')}`,
        `REAL GIT DIFF AFTER WRITE:\n${(diff.stdout || diff.stderr).slice(0, 80_000)}`,
        `APPROVED CHECK RECEIPTS:\n${testEvidence(checkResults) || '(No checks were run.)'}`,
      ].join('\n\n');
      const safety = scanText(evidence, settings.customSensitiveTerms);
      const safeEvidence = safety.findings.length ? safety.redactedText : evidence;
      const messages: Pick<ChatMessage, 'role' | 'content'>[] = [
        {
          role: 'system',
          content: 'You are the independent Reviewer in Chris Studio Coding Agent. Review only the real Git diff and command receipts supplied. Do not claim unrun tests passed. Check correctness, regressions, security boundaries, missing tests and whether the change satisfies the task. Return JSON only: {"verdict":"pass"|"revise"|"block","summary":"concise result","issues":["specific issue"],"tested":["evidence actually present"]}.',
        },
        { role: 'user', content: safeEvidence },
      ];
      const reply = await sendProviderChat(roles.reviewer, messages, settings.requestTimeoutMs);
      if (!reply.ok || !reply.content) throw new Error(reply.errorMessage ?? 'Reviewer failed.');
      const review = parseProjectCodingReview(reply.content);
      setCodingReview(review);
      setCodingStage('reviewed');
      toast.show(review.verdict === 'pass' ? copy(language, 'Reviewer passed the applied change. User acceptance is still required.', 'Reviewer 已通过该修改，仍需用户最终接受。') : copy(language, 'Reviewer found issues. Reject files or roll back before continuing.', 'Reviewer 发现问题，请拒绝相关文件或回滚后再继续。'), review.verdict === 'pass' ? 'success' : 'warning');
    } catch (error) {
      setCodingStage('failed');
      toast.show(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setAgentBusy(false);
    }
  };

  const rollbackFiles = async (paths: string[]) => {
    if (!changeSession?.sessionId) return;
    const label = paths.length ? paths.join(', ') : copy(language, 'all transaction files', '全部事务文件');
    if (!window.confirm(copy(language, `Restore ${label} from the protected before-state snapshot?`, `从受保护的写入前快照恢复 ${label}？`))) return;
    setBusy(true);
    try {
      const result = await rollbackProjectChangeSession(changeSession.sessionId, paths, true);
      setChangeSession(result);
      setCodingStage(result.status === 'rolled-back' ? 'rolled-back' : result.ok ? 'applied' : 'failed');
      await refreshTree();
      setCommand(await projectGitDiff());
      toast.show(result.ok ? copy(language, 'Selected project files were restored.', '所选项目文件已恢复。') : (result.errorMessage ?? 'Rollback failed.'), result.ok ? 'success' : 'error');
    } finally {
      setBusy(false);
    }
  };

  const acceptRemaining = async () => {
    if (!changeSession?.sessionId || !sessionPendingFiles.length) return;
    if (codingReview?.verdict !== 'pass' && !window.confirm(copy(language, 'Reviewer has not passed this change. Accept the remaining files anyway?', 'Reviewer 尚未通过该修改，仍然接受剩余文件？'))) return;
    else if (!window.confirm(copy(language, 'Accept the remaining applied files and keep their backups for audit?', '接受剩余已应用文件，并保留备份用于审计？'))) return;
    setBusy(true);
    try {
      const result = await acceptProjectChangeSession(changeSession.sessionId, sessionPendingFiles.map((file) => file.path), true);
      setChangeSession(result);
      const fullyAccepted = result.ok && result.status === 'accepted';
      setCodingStage(fullyAccepted ? 'accepted' : 'failed');
      toast.show(fullyAccepted ? copy(language, 'The reviewed project change was accepted.', '已接受审查后的项目修改。') : (result.errorMessage ?? copy(language, 'Some files still require rollback attention before this transaction can close.', '部分文件仍需处理回滚冲突，事务尚未关闭。')), fullyAccepted ? 'success' : 'warning');
    } finally {
      setBusy(false);
    }
  };

  const createBranch = async () => {
    if (!window.confirm(copy(language, `Create branch ${branch}?`, `创建分支 ${branch}？`))) return;
    const result = await createGitBranch(branch, true);
    setCommand(result);
    toast.show(result.ok ? copy(language, 'Branch created.', '分支已创建。') : (result.errorMessage ?? result.stderr), result.ok ? 'success' : 'error');
  };

  const commitChanges = async () => {
    if (!window.confirm(copy(language, 'Stage all reviewed project changes and create this commit?', '暂存全部已审查修改并创建该提交？'))) return;
    const result = await commitProjectChanges(commitMessage, true);
    setCommand(result);
    toast.show(result.ok ? copy(language, 'Commit created.', '提交已创建。') : (result.errorMessage ?? result.stderr), result.ok ? 'success' : 'error');
  };

  const pushBranch = async () => {
    if (!window.confirm(copy(language, `Push ${branch} to origin using the Mac Git credential configuration?`, `使用 Mac 的 Git 凭证配置把 ${branch} 推送到 origin？`))) return;
    const result = await pushGitBranch(branch, true);
    setCommand(result);
    toast.show(result.ok ? copy(language, 'Branch pushed.', '分支已推送。') : (result.errorMessage ?? result.stderr), result.ok ? 'success' : 'error');
  };

  const createPullRequest = async () => {
    const parts = repoParts(repoUrl);
    if (!parts) return toast.show(copy(language, 'Enter a valid GitHub repository URL.', '请输入有效的 GitHub 仓库地址。'), 'warning');
    if (!window.confirm(copy(language, `Create a Pull Request from ${branch} to ${baseBranch}?`, `创建从 ${branch} 到 ${baseBranch} 的 Pull Request？`))) return;
    const result = await createGitHubPullRequest({ owner: parts.owner, repo: parts.repo, title: prTitle, body: prBody, head: branch, base: baseBranch, confirmed: true });
    if (!result.ok) return toast.show(result.errorMessage ?? 'Pull Request failed.', 'error');
    toast.show(copy(language, `Pull Request #${result.number} created.`, `Pull Request #${result.number} 已创建。`), 'success');
    if (result.url) window.open(result.url, '_blank', 'noopener,noreferrer');
  };

  return <main className="modern-page projects-page">
    <header className="compact-page-header">
      <div><span className="section-kicker">TRANSACTIONAL CODING AGENT</span><h1>{copy(language, 'Repository workspace', '仓库工作区')}</h1><p>{copy(language, 'Plan, inspect exact files, review a multi-file diff, snapshot before writing, run checks and accept or roll back.', '规划、读取真实文件、审查多文件 Diff、写入前快照、运行检查，并最终接受或回滚。')}</p></div>
      <div className="header-actions"><button className="button secondary" onClick={cloneRepo}><Icon name="git" />{copy(language, 'Clone public repo', '克隆公开仓库')}</button><button className="button primary" onClick={openFolder}><Icon name="folder" />{copy(language, 'Open folder', '打开文件夹')}</button></div>
    </header>

    <section className="github-strip">
      <div><Icon name="git" /><span><strong>{github?.ok ? `@${github.login}` : copy(language, 'GitHub not connected', 'GitHub 未连接')}</strong><small>{overview?.fullName ?? repoUrl}</small></span></div>
      <input value={repoUrl} onChange={(event) => setRepoUrl(event.target.value)} placeholder="https://github.com/owner/repo" />
      <input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder={copy(language, 'PAT (stored in Keychain)', 'PAT（保存到钥匙串）')} />
      <button className="button secondary" onClick={connectGitHub}>{copy(language, 'Connect', '连接')}</button>
      <button className="icon-button danger" onClick={() => { void deleteGitHubToken(); setGithub(null); }} title={copy(language, 'Remove token', '删除令牌')}><Icon name="trash" /></button>
    </section>

    {overview?.ok && <section className="repo-overview-row"><span><strong>{overview.defaultBranch}</strong><small>{copy(language, 'default branch', '默认分支')}</small></span><span><strong>{overview.stars ?? 0}</strong><small>stars</small></span><span><strong>{overview.openIssues ?? 0}</strong><small>{copy(language, 'open issues', '未关闭 Issue')}</small></span><span><strong>{overview.privateRepo ? copy(language, 'Private', '私有') : copy(language, 'Public', '公开')}</strong><small>{overview.pushedAt ? new Date(overview.pushedAt).toLocaleString() : '—'}</small></span></section>}

    <section className="coding-session-board">
      <header className="coding-session-header">
        <div><span className={`coding-stage stage-${codingStage}`}>{stageLabel(language, codingStage)}</span><h2>{copy(language, 'Real project change session', '真实项目修改会话')}</h2><p>{workspace ? workspace.root : copy(language, 'Open a Git repository to begin.', '打开 Git 仓库后开始。')}</p></div>
        <button className="button secondary" onClick={resetCodingSession} disabled={agentBusy || busy || sessionRollbackFiles.length > 0} title={sessionRollbackFiles.length ? copy(language, 'Accept or roll back the active transaction first.', '请先接受或回滚当前事务。') : undefined}>{copy(language, 'New session', '新建会话')}</button>
      </header>
      <div className="coding-session-input">
        <textarea value={agentTask} onChange={(event) => setAgentTask(event.target.value)} placeholder={copy(language, 'Describe the repository change and acceptance criteria. The Agent will plan first and read only scoped files.', '描述仓库修改目标与验收标准。Agent 会先规划，并且只读取受限文件。')} />
        <button className="button primary" onClick={() => void generateCodingProposal()} disabled={!workspace || !agentTask.trim() || agentBusy || busy}><Icon name="sparkles" />{agentBusy ? copy(language, 'Working…', '处理中…') : copy(language, 'Plan + prepare diff', '规划并生成 Diff')}</button>
      </div>

      <div className="coding-step-rail">
        {[
          ['1', copy(language, 'Plan', '规划')], ['2', copy(language, 'Read', '读取')], ['3', copy(language, 'Review diff', '审查 Diff')],
          ['4', copy(language, 'Write + backup', '写入并备份')], ['5', copy(language, 'Checks', '检查')], ['6', copy(language, 'Reviewer', 'Reviewer')], ['7', copy(language, 'Accept / rollback', '接受/回滚')],
        ].map(([number, label]) => <span key={number}><b>{number}</b>{label}</span>)}
      </div>

      {(codingPlan || proposalFiles.length > 0 || changeSession) && <div className="coding-session-grid">
        <aside className="coding-plan-panel">
          <h3>{copy(language, 'Reviewed plan', '审查计划')}</h3>
          {codingPlan ? <>
            <p>{codingPlan.summary}</p>
            <ol>{codingPlan.steps.map((step) => <li key={step}>{step}</li>)}</ol>
            {codingPlan.risks.length > 0 && <div className="coding-risk-list"><strong>{copy(language, 'Risks', '风险')}</strong>{codingPlan.risks.map((risk) => <span key={risk}>{risk}</span>)}</div>}
          </> : <p>{changeSession ? copy(language, 'Recovered transaction: the original Planner context is unavailable after restart. Reviewer is disabled, but checks, accept and rollback remain available.', '已恢复事务：应用重启后原始 Planner 上下文不可用。Reviewer 已禁用，但仍可运行检查、接受或回滚。') : copy(language, 'Planner output will appear here.', 'Planner 输出将在此显示。')}</p>}
          <h3>{copy(language, 'Approved checks', '批准的检查')}</h3>
          <div className="coding-check-picker">{Object.entries(CHECK_LABELS).map(([id, label]) => <label key={id}><input type="checkbox" checked={selectedChecks.includes(id)} onChange={() => setSelectedChecks((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id].slice(0, 3))} />{label}</label>)}</div>
        </aside>

        <section className="coding-diff-panel">
          <header><div><h3>{copy(language, 'Multi-file diff', '多文件 Diff')}</h3><small>{selectedProposalPaths.length}/{proposalFiles.length} {copy(language, 'selected', '已选择')}</small></div><button className="button primary" onClick={() => void applySelectedProposal()} disabled={codingStage !== 'proposed' || !selectedProposalPaths.length || busy}>{copy(language, 'Apply selected + snapshot', '应用所选并创建快照')}</button></header>
          <div className="coding-diff-layout">
            <nav>{proposalFiles.map((file) => <label key={file.path} className={activeDiff?.path === file.path ? 'active' : ''}><input type="checkbox" checked={selectedProposalPaths.includes(file.path)} disabled={Boolean(changeSession)} onChange={() => toggleProposalPath(file.path)} /><button onClick={() => setActiveDiffPath(file.path)}><strong>{file.path}</strong><small>{file.action} <em>+{file.additions}</em> <i>-{file.deletions}</i></small></button></label>)}</nav>
            <pre>{activeDiff?.patch || copy(language, 'The selected file diff appears here.', '所选文件 Diff 将显示在这里。')}</pre>
          </div>
        </section>

        <aside className="coding-receipt-panel">
          <h3>{copy(language, 'Real execution receipts', '真实执行回执')}</h3>
          {changeSession ? <div className="transaction-files">{changeSession.files.map((file) => <article key={file.path} className={`status-${file.status}`}><div><strong>{file.path}</strong><small>{file.action} · {file.status}</small></div>{(file.status === 'applied' || file.status === 'rollback-blocked') && <button onClick={() => void rollbackFiles([file.path])} disabled={busy}>{file.status === 'rollback-blocked' ? copy(language, 'Retry rollback', '重试回滚') : copy(language, 'Reject file', '拒绝文件')}</button>}</article>)}</div> : <p>{copy(language, 'No files have been written. Proposal review is local and reversible.', '尚未写入任何文件。提案审查在本地进行且可撤销。')}</p>}
          <div className="coding-session-actions">
            <button onClick={() => void runSelectedChecks()} disabled={!changeSession?.ok || !sessionPendingFiles.length || busy}>{copy(language, 'Run selected checks', '运行所选检查')}</button>
            <button onClick={() => void runReviewer()} disabled={!changeSession?.ok || !codingPlan || !sessionPendingFiles.length || agentBusy || busy}>{agentBusy ? copy(language, 'Reviewing…', '审查中…') : copy(language, 'Run independent Reviewer', '运行独立 Reviewer')}</button>
            <button className="accept" onClick={() => void acceptRemaining()} disabled={!sessionPendingFiles.length || busy}>{copy(language, 'Accept remaining', '接受剩余文件')}</button>
            <button className="danger" onClick={() => void rollbackFiles([])} disabled={!changeSession?.sessionId || !sessionRollbackFiles.length || busy}>{copy(language, 'Rollback all', '全部回滚')}</button>
          </div>
          {checkResults.length > 0 && <div className="coding-check-results">{checkResults.map((result) => <span key={`${result.preset}-${result.durationMs}`} className={result.ok ? 'passed' : 'failed'}>{result.ok ? '✓' : '×'} {result.command}</span>)}</div>}
          {codingReview && <div className={`coding-review verdict-${codingReview.verdict}`}><strong>Reviewer: {codingReview.verdict}</strong><p>{codingReview.summary}</p>{codingReview.issues.map((issue) => <span key={issue}>{issue}</span>)}</div>}
        </aside>
      </div>}
    </section>

    <div className="project-workbench">
      <aside className="project-tree-panel">
        <div className="panel-title"><span>{workspace?.name ?? copy(language, 'No project selected', '尚未选择项目')}</span><small>{workspace?.fileCount ?? 0}</small></div>
        {flat.filter((node) => node.kind === 'file').slice(0, 2_000).map((node) => <button key={node.path} className={selectedPath === node.path ? 'selected' : ''} onClick={() => void openFile(node.path)} style={{ paddingLeft: `${10 + Math.min(node.depth, 6) * 10}px` }}><Icon name="file" size={14} /><span>{node.name}</span></button>)}
        {!workspace && <div className="file-empty-small"><Icon name="folder" /><p>{copy(language, 'Open a repository folder to start.', '打开仓库文件夹后开始。')}</p></div>}
      </aside>

      <section className="project-editor-panel">
        <header><div><span className="file-kind-pill">{dirty ? copy(language, 'MODIFIED', '已修改') : copy(language, 'REVIEWED FILE', '审查文件')}</span><h2>{selectedPath || copy(language, 'Select a text file', '选择一个文本文件')}</h2></div><button className="button primary" onClick={save} disabled={!dirty}><Icon name="check" />{copy(language, 'Save + backup', '保存并备份')}</button></header>
        <textarea className="code-editor" value={content} onChange={(event) => setContent(event.target.value)} spellCheck={false} placeholder={copy(language, 'File content appears here. Every manual write requires confirmation.', '文件内容将在此显示，每次手动写入都需要确认。')} />
      </section>

      <aside className="project-tools-panel">
        <div className="panel-title"><span>{copy(language, 'Repository tools', '仓库工具')}</span></div>
        {[
          ['git-status', 'Git status'], ['git-diff', 'Git diff'], ['npm-typecheck', 'npm typecheck'], ['npm-test', 'npm test'], ['npm-build', 'npm build'], ['cargo-check', 'cargo check'], ['cargo-test', 'cargo test'],
        ].map(([id, label]) => <button key={id} onClick={() => void run(id)} disabled={!workspace || busy}><Icon name={id.startsWith('git') ? 'git' : 'terminal'} /><span>{label}</span></button>)}
        <details className="agent-action-group">
          <summary>{copy(language, 'Branch, commit and PR', '分支、提交与 PR')}</summary>
          <input value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="chris-studio/feature" />
          <input value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} placeholder="feat: ..." />
          <div className="action-button-row"><button onClick={() => void createBranch()} disabled={!workspace}>{copy(language, 'Create branch', '创建分支')}</button><button onClick={() => void commitChanges()} disabled={!workspace}>{copy(language, 'Commit', '提交')}</button><button onClick={() => void pushBranch()} disabled={!workspace}>{copy(language, 'Push', '推送')}</button></div>
          <input value={prTitle} onChange={(event) => setPrTitle(event.target.value)} placeholder={copy(language, 'Pull Request title', 'Pull Request 标题')} />
          <input value={baseBranch} onChange={(event) => setBaseBranch(event.target.value)} placeholder="main" />
          <textarea value={prBody} onChange={(event) => setPrBody(event.target.value)} placeholder={copy(language, 'Pull Request summary', 'Pull Request 说明')} />
          <button onClick={() => void createPullRequest()} disabled={!github?.ok}><Icon name="git" /><span>{copy(language, 'Create Pull Request', '创建 Pull Request')}</span></button>
        </details>
        <pre className="command-output">{command ? `$ ${command.command}\n\n${command.stdout}${command.stderr ? `\n${command.stderr}` : ''}${command.errorMessage ? `\n${command.errorMessage}` : ''}` : copy(language, 'Command output and the real Git diff appear here.', '命令输出和真实 Git Diff 将显示在这里。')}</pre>
        {issues.length > 0 && <div className="issue-mini-list"><div className="panel-title"><span>Issues</span><small>{issues.length}</small></div>{issues.slice(0, 6).map((issue) => <a key={issue.number} href={issue.url} target="_blank" rel="noreferrer">#{issue.number} {issue.title}</a>)}</div>}
      </aside>
    </div>
  </main>;
}
