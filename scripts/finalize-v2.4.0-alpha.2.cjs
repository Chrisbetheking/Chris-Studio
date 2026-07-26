const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const VERSION = '2.4.0-alpha.2';
const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const write = (relative, value) => fs.writeFileSync(path.join(ROOT, relative), value, 'utf8');

function replaceRequired(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  const next = typeof search === 'string' ? source.replace(search, replacement) : source.replace(search, replacement);
  if (next === source) throw new Error(`Cannot patch ${label}; expected marker was not found.`);
  return next;
}
function patchText(relative, transform) {
  const before = read(relative);
  const after = transform(before);
  if (after !== before) {
    write(relative, after);
    console.log(`Patched ${relative}`);
  } else {
    console.log(`Already patched ${relative}`);
  }
}
function assertRepo() {
  for (const relative of ['apps/desktop/src-tauri/src/main.rs', 'apps/desktop/ui/src/App.tsx', 'apps/desktop/ui/src/screens/ProjectsScreen.tsx']) {
    if (!fs.existsSync(path.join(ROOT, relative))) throw new Error(`Run this file from the Chris-Studio repository overlay. Missing ${relative}`);
  }
}


function replaceSectionByFunctionMarkers(source, startFunction, endFunction, replacement, label, includeCommandAttribute = false) {
  const startFunctionMarker = `fn ${startFunction}(`;
  const endFunctionMarker = `fn ${endFunction}(`;
  const functionStart = source.indexOf(startFunctionMarker);
  if (functionStart < 0) throw new Error(`Cannot patch ${label}; ${startFunction} was not found.`);
  const nextFunctionStart = source.indexOf(endFunctionMarker, functionStart + startFunctionMarker.length);
  if (nextFunctionStart < 0) throw new Error(`Cannot patch ${label}; ${endFunction} was not found after ${startFunction}.`);

  let start = functionStart;
  let end = nextFunctionStart;
  if (includeCommandAttribute) {
    const attributeStart = source.lastIndexOf('#[tauri::command]', functionStart);
    if (attributeStart >= 0 && source.slice(attributeStart, functionStart).trim() === '#[tauri::command]') start = attributeStart;
    const nextAttributeStart = source.lastIndexOf('#[tauri::command]', nextFunctionStart);
    if (nextAttributeStart > start && source.slice(nextAttributeStart, nextFunctionStart).trim() === '#[tauri::command]') end = nextAttributeStart;
  }
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

function replaceArrowFunctionBefore(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Cannot patch ${label}; start marker was not found.`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`Cannot patch ${label}; end marker was not found.`);
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

const RUN_PROJECT_COMMAND = `fn run_project_command(root: &Path, preset: &str, program: &str, args: &[&str]) -> ProjectCommandResult {
    let started = Instant::now();
    let command_display = std::iter::once(program).chain(args.iter().copied()).collect::<Vec<_>>().join(" ");
    let token = format!("{}-{}", std::process::id(), project_transaction_id());
    let stdout_path = std::env::temp_dir().join(format!("chris-studio-command-{token}.stdout"));
    let stderr_path = std::env::temp_dir().join(format!("chris-studio-command-{token}.stderr"));
    let stdout_file = match fs::File::create(&stdout_path) {
        Ok(file) => file,
        Err(_) => return ProjectCommandResult { ok: false, preset: preset.to_string(), command: command_display, stdout: String::new(), stderr: String::new(), exit_code: None, duration_ms: 0, error_message: Some("Could not create the protected command output file.".to_string()) },
    };
    let stderr_file = match fs::File::create(&stderr_path) {
        Ok(file) => file,
        Err(_) => {
            let _ = fs::remove_file(&stdout_path);
            return ProjectCommandResult { ok: false, preset: preset.to_string(), command: command_display, stdout: String::new(), stderr: String::new(), exit_code: None, duration_ms: 0, error_message: Some("Could not create the protected command error file.".to_string()) };
        }
    };
    let mut command = Command::new(program);
    command
        .args(args)
        .current_dir(root)
        .env("CI", "true")
        .env_remove("OPENAI_API_KEY")
        .env_remove("ANTHROPIC_API_KEY")
        .env_remove("DEEPSEEK_API_KEY")
        .env_remove("GITHUB_TOKEN")
        .env_remove("GH_TOKEN")
        .stdout(std::process::Stdio::from(stdout_file))
        .stderr(std::process::Stdio::from(stderr_file));
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(_) => {
            let _ = fs::remove_file(&stdout_path);
            let _ = fs::remove_file(&stderr_path);
            return ProjectCommandResult { ok: false, preset: preset.to_string(), command: command_display, stdout: String::new(), stderr: String::new(), exit_code: None, duration_ms: started.elapsed().as_millis(), error_message: Some(format!("The required executable '{program}' is not available.")) };
        }
    };
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let stdout = fs::read(&stdout_path).unwrap_or_default();
                let stderr = fs::read(&stderr_path).unwrap_or_default();
                let _ = fs::remove_file(&stdout_path);
                let _ = fs::remove_file(&stderr_path);
                return ProjectCommandResult {
                    ok: status.success(),
                    preset: preset.to_string(),
                    command: command_display,
                    stdout: truncate_output(&stdout),
                    stderr: truncate_output(&stderr),
                    exit_code: status.code(),
                    duration_ms: started.elapsed().as_millis(),
                    error_message: None,
                };
            }
            Ok(None) if started.elapsed() >= Duration::from_millis(MAX_TIMEOUT_MS) => {
                let _ = child.kill();
                let _ = child.wait();
                let stdout = fs::read(&stdout_path).unwrap_or_default();
                let stderr = fs::read(&stderr_path).unwrap_or_default();
                let _ = fs::remove_file(&stdout_path);
                let _ = fs::remove_file(&stderr_path);
                return ProjectCommandResult {
                    ok: false,
                    preset: preset.to_string(),
                    command: command_display,
                    stdout: truncate_output(&stdout),
                    stderr: truncate_output(&stderr),
                    exit_code: None,
                    duration_ms: started.elapsed().as_millis(),
                    error_message: Some(format!("The approved command exceeded the {} second timeout and was stopped.", MAX_TIMEOUT_MS / 1_000)),
                };
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = fs::remove_file(&stdout_path);
                let _ = fs::remove_file(&stderr_path);
                return ProjectCommandResult { ok: false, preset: preset.to_string(), command: command_display, stdout: String::new(), stderr: String::new(), exit_code: None, duration_ms: started.elapsed().as_millis(), error_message: Some("The approved command process could not be observed safely.".to_string()) };
            }
        }
    }
}
`;

const SCOPED_COMMIT = `fn latest_reviewed_commit_files(root: &Path) -> Result<(PathBuf, Vec<ProjectChangeFileReceipt>), String> {
    let transaction_root = project_transaction_root(root);
    if !transaction_root.is_dir() {
        return Err("No reviewed Chris Studio transaction is available to commit.".to_string());
    }
    let mut session_ids = fs::read_dir(&transaction_root)
        .map_err(|_| "The project transaction directory could not be read.".to_string())?
        .flatten()
        .filter_map(|entry| {
            let id = entry.file_name().to_string_lossy().to_string();
            if entry.path().is_dir() && valid_project_transaction_id(&id) { Some(id) } else { None }
        })
        .collect::<Vec<_>>();
    session_ids.sort_by(|left, right| right.parse::<u128>().unwrap_or_default().cmp(&left.parse::<u128>().unwrap_or_default()));
    for session_id in session_ids {
        let (session_dir, _, manifest) = match load_project_change_manifest(root, &session_id) {
            Ok(value) => value,
            Err(_) => continue,
        };
        if !matches!(manifest.status.as_str(), "applied" | "accepted" | "partially-rolled-back") { continue; }
        let files = manifest.files.into_iter()
            .filter(|file| matches!(file.status.as_str(), "applied" | "accepted"))
            .collect::<Vec<_>>();
        if !files.is_empty() { return Ok((session_dir, files)); }
    }
    Err("No accepted or currently applied reviewed transaction files are available to commit.".to_string())
}
fn staged_git_paths(root: &Path) -> Result<HashSet<String>, String> {
    let output = Command::new("git")
        .args(["diff", "--cached", "--name-only", "--"])
        .current_dir(root)
        .output()
        .map_err(|_| "Git is not installed or could not inspect staged files.".to_string())?;
    if !output.status.success() { return Err(truncate_output(&output.stderr)); }
    let mut paths = HashSet::new();
    for line in String::from_utf8_lossy(&output.stdout).lines().filter(|line| !line.trim().is_empty()) {
        paths.insert(clean_relative_path(line)?.to_string_lossy().to_string());
    }
    Ok(paths)
}
#[tauri::command]
fn project_git_commit(message: String, paths: Vec<String>, confirmed: bool, state: State<'_, AppState>) -> ProjectCommandResult {
    let started = Instant::now();
    let message = message.trim();
    let failure = |detail: String| ProjectCommandResult { ok: false, preset: "git-commit".to_string(), command: "git add -- <reviewed paths> && git commit".to_string(), stdout: String::new(), stderr: String::new(), exit_code: None, duration_ms: started.elapsed().as_millis(), error_message: Some(detail) };
    if !confirmed || message.len() < 3 || message.len() > 240 || message.contains('\\n') || message.contains('\\r') {
        return failure("Enter a one-line commit message and approve the commit.".to_string());
    }
    if paths.is_empty() || paths.len() > 100 {
        return failure("Select 1–100 reviewed transaction files for this commit.".to_string());
    }
    let root = match current_project_root(&state) { Ok(root) => root, Err(error) => return failure(error) };
    let (session_dir, reviewed_files) = match latest_reviewed_commit_files(&root) { Ok(value) => value, Err(error) => return failure(error) };
    let allowed = reviewed_files.iter().map(|file| file.path.clone()).collect::<HashSet<_>>();
    let mut selected = Vec::new();
    let mut selected_set = HashSet::new();
    for path in paths {
        let clean = match clean_relative_path(&path) { Ok(value) => value.to_string_lossy().to_string(), Err(error) => return failure(error) };
        if !allowed.contains(&clean) { return failure(format!("{clean} is not part of the latest reviewed transaction.")); }
        if selected_set.insert(clean.clone()) { selected.push(clean); }
    }
    for path in &selected {
        let receipt = match reviewed_files.iter().find(|file| &file.path == path) {
            Some(receipt) => receipt,
            None => return failure(format!("{path} is missing from the reviewed transaction receipt.")),
        };
        match project_file_matches_after_state(&root, &session_dir, receipt) {
            Ok(true) => {}
            Ok(false) => return failure(format!("{path} changed after Agent review. Review it again before committing.")),
            Err(error) => return failure(error),
        }
    }
    let staged_before = match staged_git_paths(&root) { Ok(paths) => paths, Err(error) => return failure(error) };
    let unrelated = staged_before.difference(&selected_set).cloned().collect::<Vec<_>>();
    if !unrelated.is_empty() {
        return failure(format!("Unrelated files are already staged and were not touched: {}. Unstage them before creating the Agent commit.", unrelated.join(", ")));
    }
    let mut add_command = Command::new("git");
    add_command.arg("add").arg("--");
    for path in &selected { add_command.arg(path); }
    let add_output = match add_command.current_dir(&root).output() {
        Ok(output) => output,
        Err(_) => return failure("Git is not installed or could not stage reviewed files.".to_string()),
    };
    let add_result = command_result_from_output("git-add", "git add -- <reviewed paths>", started, add_output);
    if !add_result.ok { return add_result; }
    let staged_after = match staged_git_paths(&root) { Ok(paths) => paths, Err(error) => return failure(error) };
    let unexpected = staged_after.difference(&selected_set).cloned().collect::<Vec<_>>();
    if !unexpected.is_empty() {
        return failure(format!("Git reported unexpected staged files: {}. Commit was blocked.", unexpected.join(", ")));
    }
    run_project_command(&root, "git-commit", "git", &["commit", "-m", message])
}
`;

function patchMain() {
  patchText('apps/desktop/src-tauri/src/main.rs', (source) => {
    let next = source;
    if (!next.includes('mod unified_agent_native;')) {
      const crateAttribute = /#!\[cfg_attr\(not\(debug_assertions\), windows_subsystem = "windows"\)\]\r?\n/;
      if (!crateAttribute.test(next)) throw new Error('Cannot patch native Agent module; crate attribute was not found.');
      next = next.replace(crateAttribute, (match) => `${match}mod unified_agent_native;\n`);
    }
    if (!next.includes('unified_agent_native::computer_inspect_accessibility,')) {
      const captureRegistration = /^(\s*)computer_capture_screen,/m;
      if (!captureRegistration.test(next)) throw new Error('Cannot patch Accessibility command registration; computer_capture_screen was not found.');
      next = next.replace(captureRegistration, (_, indentation) => `${indentation}unified_agent_native::computer_inspect_accessibility,\n${indentation}unified_agent_native::computer_activate_accessibility,\n${indentation}computer_capture_screen,`);
    }
    if (!next.includes('The approved command exceeded the')) {
      next = replaceSectionByFunctionMarkers(next, 'run_project_command', 'execute_project_preset', RUN_PROJECT_COMMAND, 'bounded project command execution');
    }
    if (!next.includes('The approved command exceeded the')) throw new Error('Could not install bounded project command execution.');
    if (!next.includes('fn latest_reviewed_commit_files(root: &Path)')) {
      next = replaceSectionByFunctionMarkers(next, 'project_git_commit', 'project_git_push', SCOPED_COMMIT, 'reviewed-path Git commit', true);
    }
    if (next.includes('git", &["add", "-A"]') || next.includes('git add -A && git commit')) throw new Error('Unsafe git add -A remains in project commit code.');
    return next;
  });
}

function patchProjectsScreen() {
  patchText('apps/desktop/ui/src/screens/ProjectsScreen.tsx', (source) => {
    let next = source;
    if (!next.includes('scopedReadPaths.push(path);')) {
      next = replaceRequired(next, '        contextParts.push(`FILE: ${path}\\n${text}`);', '        contextParts.push(`FILE: ${path}\\n${text}`);\n        scopedReadPaths.push(path);', 'scoped read registration');
    }
    const replacement = `  const commitChanges = async () => {
    const reviewedPaths = changeSession?.files
      .filter((file) => file.status === 'applied' || file.status === 'accepted')
      .map((file) => file.path) ?? [];
    if (!reviewedPaths.length) return toast.show(copy(language, 'There are no reviewed transaction files to commit.', '当前没有可提交的已审查事务文件。'), 'warning');
    if (!window.confirm(copy(language, 'Stage only ' + reviewedPaths.length + ' reviewed transaction file(s) and create this commit?', '仅暂存 ' + reviewedPaths.length + ' 个已审查事务文件并创建提交？'))) return;
    const result = await commitProjectChanges(commitMessage, reviewedPaths, true);
    setCommand(result);
    toast.show(result.ok ? copy(language, 'Scoped commit created.', '已创建仅包含本次审查文件的提交。') : (result.errorMessage ?? result.stderr), result.ok ? 'success' : 'error');
  };\n`;
    if (!next.includes('commitProjectChanges(commitMessage, reviewedPaths, true)')) {
      next = replaceArrowFunctionBefore(next, '  const commitChanges = async () => {', '  const pushBranch = async () => {', replacement, 'scoped commit UI');
    }
    return next;
  });
}

function patchCoreTests() {
  patchText('apps/desktop/ui/scripts/run-core-tests.cjs', (source) => {
    let next = source;
    const tests = [
      'scripts/v2-4-unified-agent-test.cjs',
      'scripts/v2-4-alpha2-privacy-comparison-test.cjs',
    ];
    for (const test of tests) {
      if (next.includes(test)) continue;
      const marker = '  "scripts/v2-2-final-closeout-test.cjs",';
      if (next.includes(marker)) {
        next = next.replace(marker, `${marker}\n  "${test}",`);
        continue;
      }
      const close = next.lastIndexOf('];');
      if (close < 0) throw new Error(`Cannot register core test ${test}; tests array marker was not found.`);
      next = `${next.slice(0, close)}  "${test}",\n${next.slice(close)}`;
    }
    return next;
  });
}

function synchronizeNpmLock(relative, workspaceVersions = {}) {
  const lockPath = path.join(ROOT, relative);
  if (!fs.existsSync(lockPath)) return;
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = VERSION;
  if (lock.packages?.['']) lock.packages[''].version = VERSION;
  for (const [key, version] of Object.entries(workspaceVersions)) {
    if (lock.packages?.[key]) lock.packages[key].version = version;
  }
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`Synchronized ${relative} versions`);
}

function patchLocks() {
  synchronizeNpmLock('package-lock.json', { 'apps/desktop': VERSION, 'apps/desktop/ui': VERSION });
  synchronizeNpmLock('apps/desktop/package-lock.json');
  synchronizeNpmLock('apps/desktop/ui/package-lock.json');
  const cargoPath = path.join(ROOT, 'apps/desktop/src-tauri/Cargo.lock');
  if (fs.existsSync(cargoPath)) {
    let cargo = fs.readFileSync(cargoPath, 'utf8');
    cargo = cargo.replace(/(\[\[package\]\]\nname = "chris-studio"\nversion = ")[^"]+("\n)/, `$1${VERSION}$2`);
    fs.writeFileSync(cargoPath, cargo);
    console.log('Synchronized Cargo.lock version');
  }
}

function synchronizeMetadataSources() {
  const syncPath = path.join(ROOT, 'apps/desktop/ui/scripts/sync-product-metadata.cjs');
  delete require.cache[require.resolve(syncPath)];
  const sync = require(syncPath);
  const ui = path.join(ROOT, 'apps/desktop/ui');
  const synchronizeUnifiedWorkspaceAdapters = (source) => {
    const adapterMarkers = [
      '../features/providers/providerClient',
      '../features/providers/providerClientReliable',
      '../features/computer/computerClient',
      '../features/computer/computerClientReliable',
    ];
    if (!adapterMarkers.some((marker) => source.includes(marker))) return source;
    return sync.synchronizeWorkspaceRuntimeAdapters(source);
  };
  const items = [
    ['src/App.tsx', (source) => sync.synchronizeReliabilityAppText(sync.synchronizeAppText(source, VERSION))],
    ['src/screens/AboutScreen.tsx', (source) => sync.synchronizeAboutVersion(source, VERSION)],
    ['src/screens/WorkspaceScreen.tsx', synchronizeUnifiedWorkspaceAdapters],
    ['src/screens/ComputerScreen.tsx', sync.synchronizeComputerScreenRuntimeAdapter],
    ['src/screens/ChatWorkspace.tsx', sync.synchronizeChatWorkspaceText],
  ];
  for (const [relative, transform] of items) {
    const file = path.join(ui, relative);
    const before = fs.readFileSync(file, 'utf8');
    const after = transform(before);
    if (after !== before) fs.writeFileSync(file, after);
  }
  console.log('Synchronized product metadata without build-time source mutation');
}

function verify() {
  const main = read('apps/desktop/src-tauri/src/main.rs');
  const projects = read('apps/desktop/ui/src/screens/ProjectsScreen.tsx');
  const workflow = read('.github/workflows/tokenfence-macos.yml');
  if (!main.includes('mod unified_agent_native;')) throw new Error('Native Unified Agent module is not mounted.');
  if (!main.includes('computer_inspect_accessibility')) throw new Error('Accessibility commands are not registered.');
  if (main.includes('git add -A')) throw new Error('Unsafe git add -A remains.');
  if (!projects.includes('scopedReadPaths.push(path);')) throw new Error('Legacy scoped reads are still broken.');
  if (!projects.includes('commitProjectChanges(commitMessage, reviewedPaths, true)')) throw new Error('Legacy commit is not scoped.');
  if (!workflow.includes('default: v2.4.0-alpha.2')) throw new Error('Release workflow does not default to v2.4.0-alpha.2.');
  if (workflow.includes('cargo generate-lockfile')) throw new Error('Release workflow still mutates Cargo.lock in CI.');
  if (!workflow.includes("prerelease: ${{ contains(inputs.version, '-') }}")) throw new Error('Alpha Release protection is missing.');
  const registry = read('apps/desktop/ui/src/features/unified-agent/toolRegistry.ts');
  const workspace = read('apps/desktop/ui/src/screens/WorkspaceScreen.tsx');
  if (!registry.includes("case 'models.compare'")) throw new Error('Structured multi-model comparison tool is missing.');
  if (!registry.includes("case 'privacy.classify'")) throw new Error('Content-aware privacy classifier tool is missing.');
  if (!workspace.includes('privacyAssessment')) throw new Error('Workspace privacy preflight is missing.');
  cp.execFileSync(process.execPath, [path.join(ROOT, 'apps/desktop/ui/scripts/v2-4-unified-agent-test.cjs')], { cwd: path.join(ROOT, 'apps/desktop/ui'), stdio: 'inherit' });
  cp.execFileSync(process.execPath, [path.join(ROOT, 'apps/desktop/ui/scripts/v2-2-product-metadata-test.cjs')], { cwd: path.join(ROOT, 'apps/desktop/ui'), stdio: 'inherit' });
}

function main() {
  assertRepo();
  patchMain();
  patchProjectsScreen();
  patchCoreTests();
  patchLocks();
  synchronizeMetadataSources();
  verify();
  console.log('CHRIS_STUDIO_V2_4_ALPHA2_OVERLAY_READY');
}

if (require.main === module) main();

module.exports = {
  replaceSectionByFunctionMarkers,
  replaceArrowFunctionBefore,
};
