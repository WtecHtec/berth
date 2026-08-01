use serde::Serialize;
use std::{
    collections::{BTreeMap, HashMap},
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
    process::{Command, Output, Stdio},
};

const MAX_DIFF_BYTES: usize = 2 * 1024 * 1024;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileChangeDto {
    path: String,
    relative_path: String,
    index_status: Option<&'static str>,
    worktree_status: Option<&'static str>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRepositoryDto {
    root: String,
    name: String,
    branch: String,
    workspace_roots: Vec<String>,
    changes: Vec<GitFileChangeDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorkspaceStatusDto {
    repositories: Vec<GitRepositoryDto>,
    warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffDto {
    content: String,
    truncated: bool,
}

fn command_error(action: &str, output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        format!(
            "{action}失败，退出码：{}",
            output.status.code().unwrap_or(-1)
        )
    } else {
        format!("{action}失败：{stderr}")
    }
}

fn git_output(directory: &Path, arguments: &[&str]) -> Result<Output, String> {
    Command::new("git")
        .arg("-C")
        .arg(directory)
        .args(arguments)
        .output()
        .map_err(|error| format!("无法运行 Git：{error}"))
}

fn discover_repository(path: &Path) -> Result<Option<PathBuf>, String> {
    let directory = if path.is_dir() {
        path
    } else {
        path.parent().unwrap_or(path)
    };
    let output = git_output(directory, &["rev-parse", "--show-toplevel"])?;
    if !output.status.success() {
        return Ok(None);
    }
    let root = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if root.is_empty() {
        return Ok(None);
    }
    Ok(Some(PathBuf::from(root)))
}

fn repository_branch(root: &Path) -> String {
    if let Ok(output) = git_output(root, &["symbolic-ref", "--quiet", "--short", "HEAD"]) {
        if output.status.success() {
            let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !branch.is_empty() {
                return branch;
            }
        }
    }
    if let Ok(output) = git_output(root, &["rev-parse", "--short", "HEAD"]) {
        if output.status.success() {
            let revision = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !revision.is_empty() {
                return format!("detached@{revision}");
            }
        }
    }
    "未初始化".to_string()
}

fn change_kind(code: u8) -> Option<&'static str> {
    match code {
        b'M' | b'T' => Some("modified"),
        b'A' => Some("added"),
        b'D' => Some("deleted"),
        b'R' | b'C' => Some("renamed"),
        _ => None,
    }
}

fn is_conflict_status(index: u8, worktree: u8) -> bool {
    matches!(
        (index, worktree),
        (b'D', b'D')
            | (b'A', b'U')
            | (b'U', b'D')
            | (b'U', b'A')
            | (b'D', b'U')
            | (b'A', b'A')
            | (b'U', b'U')
    )
}

/** Parses Git's NUL-delimited porcelain v1 format without losing spaces in paths. */
fn parse_porcelain_status(output: &[u8], repository_root: &Path) -> Vec<GitFileChangeDto> {
    let records = output.split(|byte| *byte == 0).collect::<Vec<_>>();
    let mut changes = Vec::new();
    let mut index = 0;

    while index < records.len() {
        let record = records[index];
        if record.len() < 4 {
            index += 1;
            continue;
        }
        let index_code = record[0];
        let worktree_code = record[1];
        let relative_path = String::from_utf8_lossy(&record[3..]).to_string();
        let conflicted = is_conflict_status(index_code, worktree_code);
        let (index_status, worktree_status) = if conflicted {
            // Conflicts remain working-tree actions until the user explicitly stages a resolution.
            (None, Some("conflicted"))
        } else if index_code == b'?' && worktree_code == b'?' {
            (None, Some("untracked"))
        } else {
            (change_kind(index_code), change_kind(worktree_code))
        };

        if index_status.is_some() || worktree_status.is_some() {
            changes.push(GitFileChangeDto {
                path: repository_root
                    .join(&relative_path)
                    .to_string_lossy()
                    .to_string(),
                relative_path,
                index_status,
                worktree_status,
            });
        }

        // In porcelain -z output a rename/copy is followed by its original path.
        index += if matches!(index_code, b'R' | b'C') {
            2
        } else {
            1
        };
    }
    changes
}

fn workspace_status_blocking(roots: Vec<String>) -> Result<GitWorkspaceStatusDto, String> {
    let mut grouped_roots = BTreeMap::<PathBuf, Vec<PathBuf>>::new();
    let mut warnings = Vec::new();

    for root in roots {
        let raw_workspace_root = PathBuf::from(&root);
        let workspace_root = fs::canonicalize(&raw_workspace_root).unwrap_or(raw_workspace_root);
        match discover_repository(&workspace_root) {
            Ok(Some(repository_root)) => grouped_roots
                .entry(repository_root)
                .or_default()
                .push(workspace_root),
            Ok(None) => {}
            Err(error) => warnings.push(format!("{root}：{error}")),
        }
    }

    let mut repositories = Vec::new();
    for (repository_root, workspace_roots) in grouped_roots {
        let mut command = Command::new("git");
        command.arg("-C").arg(&repository_root).args([
            "status",
            "--porcelain=v1",
            "-z",
            "--untracked-files=all",
            "--",
        ]);

        let whole_repository_is_visible =
            workspace_roots.iter().any(|root| root == &repository_root);
        if whole_repository_is_visible {
            command.arg(".");
        } else {
            for root in &workspace_roots {
                if let Ok(relative) = root.strip_prefix(&repository_root) {
                    command.arg(relative);
                }
            }
        }

        let output = command
            .output()
            .map_err(|error| format!("无法运行 Git：{error}"))?;
        if !output.status.success() {
            warnings.push(command_error("读取 Git 状态", &output));
            continue;
        }
        let name = repository_root
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| repository_root.to_string_lossy().to_string());
        repositories.push(GitRepositoryDto {
            root: repository_root.to_string_lossy().to_string(),
            name,
            branch: repository_branch(&repository_root),
            workspace_roots: workspace_roots
                .iter()
                .map(|root| root.to_string_lossy().to_string())
                .collect(),
            changes: parse_porcelain_status(&output.stdout, &repository_root),
        });
    }

    Ok(GitWorkspaceStatusDto {
        repositories,
        warnings,
    })
}

#[tauri::command]
pub async fn git_workspace_status(roots: Vec<String>) -> Result<GitWorkspaceStatusDto, String> {
    tauri::async_runtime::spawn_blocking(move || workspace_status_blocking(roots))
        .await
        .map_err(|error| format!("Git 状态任务失败：{error}"))?
}

fn checked_relative_path(repository_root: &str, path: &str) -> Result<(PathBuf, PathBuf), String> {
    let repository = PathBuf::from(repository_root);
    let candidate = PathBuf::from(path);
    if !repository.is_absolute() || !candidate.is_absolute() {
        return Err("Git 操作需要绝对路径".to_string());
    }
    let relative = candidate
        .strip_prefix(&repository)
        .map_err(|_| "文件不在所选 Git 仓库中".to_string())?;
    if relative.as_os_str().is_empty()
        || relative.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err("Git 文件路径无效".to_string());
    }
    Ok((repository, relative.to_path_buf()))
}

fn run_path_mutation(
    action: &str,
    repository_root: String,
    path: String,
    arguments: &[&str],
) -> Result<(), String> {
    let (repository, relative) = checked_relative_path(&repository_root, &path)?;
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(&repository)
        .args(arguments)
        .arg("--")
        .arg(relative);
    let output = command
        .output()
        .map_err(|error| format!("无法运行 Git：{error}"))?;
    if !output.status.success() {
        return Err(command_error(action, &output));
    }
    Ok(())
}

#[tauri::command]
pub async fn git_stage(repository_root: String, path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_path_mutation("暂存文件", repository_root, path, &["add"])
    })
    .await
    .map_err(|error| format!("暂存任务失败：{error}"))?
}

fn unstage_blocking(repository_root: String, path: String) -> Result<(), String> {
    let (repository, relative) = checked_relative_path(&repository_root, &path)?;
    let has_head = git_output(&repository, &["rev-parse", "--verify", "HEAD"])
        .map(|output| output.status.success())
        .unwrap_or(false);
    let mut command = Command::new("git");
    command.arg("-C").arg(&repository);
    if has_head {
        command.args(["restore", "--staged", "--"]).arg(relative);
    } else {
        command.args(["rm", "--cached", "--"]).arg(relative);
    }
    let output = command
        .output()
        .map_err(|error| format!("无法运行 Git：{error}"))?;
    if !output.status.success() {
        return Err(command_error("取消暂存", &output));
    }
    Ok(())
}

#[tauri::command]
pub async fn git_unstage(repository_root: String, path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || unstage_blocking(repository_root, path))
        .await
        .map_err(|error| format!("取消暂存任务失败：{error}"))?
}

fn checked_repository_root(repository_root: &str) -> Result<PathBuf, String> {
    let requested = PathBuf::from(repository_root);
    if !requested.is_absolute() {
        return Err("Git 操作需要绝对仓库路径".to_string());
    }
    let requested = fs::canonicalize(&requested).unwrap_or(requested);
    let discovered =
        discover_repository(&requested)?.ok_or_else(|| "所选目录不是 Git 仓库".to_string())?;
    let discovered = fs::canonicalize(&discovered).unwrap_or(discovered);
    if requested != discovered {
        return Err("所选路径不是 Git 仓库根目录".to_string());
    }
    Ok(discovered)
}

fn stage_all_blocking(repository_root: String) -> Result<(), String> {
    let repository = checked_repository_root(&repository_root)?;
    let output = git_output(&repository, &["add", "--all", "--", "."])?;
    if !output.status.success() {
        return Err(command_error("暂存所有更改", &output));
    }
    Ok(())
}

#[tauri::command]
pub async fn git_stage_all(repository_root: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || stage_all_blocking(repository_root))
        .await
        .map_err(|error| format!("暂存所有更改任务失败：{error}"))?
}

fn unstage_all_blocking(repository_root: String) -> Result<(), String> {
    let repository = checked_repository_root(&repository_root)?;
    let has_head = git_output(&repository, &["rev-parse", "--verify", "HEAD"])
        .map(|output| output.status.success())
        .unwrap_or(false);
    let output = if has_head {
        git_output(&repository, &["restore", "--staged", "--", "."])?
    } else {
        git_output(&repository, &["rm", "--cached", "-r", "--", "."])?
    };
    if !output.status.success() {
        return Err(command_error("取消暂存所有更改", &output));
    }
    Ok(())
}

#[tauri::command]
pub async fn git_unstage_all(repository_root: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || unstage_all_blocking(repository_root))
        .await
        .map_err(|error| format!("取消暂存所有更改任务失败：{error}"))?
}

fn is_tracked(repository: &Path, relative: &Path) -> bool {
    Command::new("git")
        .arg("-C")
        .arg(repository)
        .args(["ls-files", "--error-unmatch", "--"])
        .arg(relative)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn diff_blocking(
    repository_root: String,
    path: String,
    staged: bool,
) -> Result<GitDiffDto, String> {
    let (repository, relative) = checked_relative_path(&repository_root, &path)?;
    let untracked = !staged && !is_tracked(&repository, &relative);
    let mut command = Command::new("git");
    command.arg("-C").arg(&repository);
    if untracked {
        command
            .args([
                "diff",
                "--no-index",
                "--no-ext-diff",
                "--no-color",
                "--",
                "/dev/null",
            ])
            .arg(&relative);
    } else {
        command.args(["diff"]);
        if staged {
            command.arg("--cached");
        }
        command
            .args(["--no-ext-diff", "--no-color", "--"])
            .arg(&relative);
    }
    let output = command
        .output()
        .map_err(|error| format!("无法运行 Git Diff：{error}"))?;
    let valid_no_index_difference = untracked && output.status.code() == Some(1);
    if !output.status.success() && !valid_no_index_difference {
        return Err(command_error("读取 Git Diff", &output));
    }

    let truncated = output.stdout.len() > MAX_DIFF_BYTES;
    let bytes = if truncated {
        &output.stdout[..MAX_DIFF_BYTES]
    } else {
        output.stdout.as_slice()
    };
    Ok(GitDiffDto {
        content: String::from_utf8_lossy(bytes).to_string(),
        truncated,
    })
}

#[tauri::command]
pub async fn git_file_diff(
    repository_root: String,
    path: String,
    staged: bool,
) -> Result<GitDiffDto, String> {
    tauri::async_runtime::spawn_blocking(move || diff_blocking(repository_root, path, staged))
        .await
        .map_err(|error| format!("Git Diff 任务失败：{error}"))?
}

fn normalized_relative_path(path: &str) -> &str {
    path.trim_end_matches(['/', '\\'])
}

/**
 * Resolves repositories once per workspace root, then checks every loaded tree
 * path in batches. This avoids spawning one Git process per file-tree node.
 */
fn ignored_paths_blocking(roots: Vec<String>, paths: Vec<String>) -> Result<Vec<String>, String> {
    let mut repositories = Vec::<PathBuf>::new();
    for root in roots {
        let root = PathBuf::from(root);
        if let Some(repository) = discover_repository(&root)? {
            let repository = fs::canonicalize(&repository).unwrap_or(repository);
            if !repositories.contains(&repository) {
                repositories.push(repository);
            }
        }
    }
    // A nested repository owns its paths before an enclosing repository does.
    repositories.sort_by_key(|repository| std::cmp::Reverse(repository.components().count()));

    let mut grouped = BTreeMap::<PathBuf, Vec<(String, String)>>::new();
    for path_text in paths {
        let path = PathBuf::from(&path_text);
        let resolved_path = fs::canonicalize(&path).unwrap_or(path);
        let Some(repository) = repositories
            .iter()
            .find(|repository| resolved_path.starts_with(repository))
        else {
            continue;
        };
        let Ok(relative) = resolved_path.strip_prefix(repository) else {
            continue;
        };
        if relative.as_os_str().is_empty() {
            continue;
        }
        grouped
            .entry(repository.clone())
            .or_default()
            .push((relative.to_string_lossy().to_string(), path_text));
    }

    let mut ignored = Vec::new();
    for (repository, candidates) in grouped {
        let candidate_by_relative = candidates
            .iter()
            .map(|(relative, path)| (normalized_relative_path(relative).to_string(), path.clone()))
            .collect::<HashMap<_, _>>();
        let mut child = Command::new("git")
            .arg("-C")
            .arg(&repository)
            .args(["check-ignore", "--no-index", "-z", "--stdin"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("无法运行 Git Ignore 检查：{error}"))?;
        if let Some(stdin) = child.stdin.as_mut() {
            for (relative, _) in &candidates {
                stdin
                    .write_all(relative.as_bytes())
                    .and_then(|_| stdin.write_all(&[0]))
                    .map_err(|error| format!("无法发送 Ignore 检查路径：{error}"))?;
            }
        }
        let output = child
            .wait_with_output()
            .map_err(|error| format!("Ignore 检查失败：{error}"))?;
        // Exit code 1 means that none of the candidate paths are ignored.
        if !output.status.success() && output.status.code() != Some(1) {
            return Err(command_error("Ignore 检查", &output));
        }
        for record in output.stdout.split(|byte| *byte == 0) {
            if record.is_empty() {
                continue;
            }
            let relative = String::from_utf8_lossy(record);
            if let Some(path) = candidate_by_relative.get(normalized_relative_path(&relative)) {
                ignored.push(path.clone());
            }
        }
    }
    Ok(ignored)
}

#[tauri::command]
pub async fn git_ignored_paths(
    roots: Vec<String>,
    paths: Vec<String>,
) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || ignored_paths_blocking(roots, paths))
        .await
        .map_err(|error| format!("Ignore 检查任务失败：{error}"))?
}

/** Returns visible Git files for search, or None when the directory is not in a repository. */
pub(crate) fn list_searchable_files(root: &Path) -> Result<Option<Vec<PathBuf>>, String> {
    if discover_repository(root)?.is_none() {
        return Ok(None);
    }
    let output = git_output(
        root,
        &[
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
            "--",
            ".",
        ],
    )?;
    if !output.status.success() {
        return Err(command_error("读取 Git 文件索引", &output));
    }
    Ok(Some(
        output
            .stdout
            .split(|byte| *byte == 0)
            .filter(|record| !record.is_empty())
            .map(|record| root.join(String::from_utf8_lossy(record).as_ref()))
            .filter(|path| path.is_file())
            .collect(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    struct TemporaryRepository(PathBuf);

    impl TemporaryRepository {
        fn create() -> Self {
            let path = std::env::temp_dir().join(format!("berth-git-{}", uuid::Uuid::new_v4()));
            fs::create_dir_all(&path).expect("create temporary repository");
            let repository = Self(path);
            repository.git(&["init", "-q"]);
            repository.git(&["config", "user.name", "Berth Test"]);
            repository.git(&["config", "user.email", "berth@example.test"]);
            repository
        }

        fn git(&self, arguments: &[&str]) {
            let output = git_output(&self.0, arguments).expect("run test git command");
            assert!(
                output.status.success(),
                "{}",
                command_error("test git", &output)
            );
        }
    }

    impl Drop for TemporaryRepository {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn parses_worktree_staged_untracked_and_renamed_statuses() {
        let root = Path::new("/tmp/berth-repository");
        let status = b" M src/App.tsx\0A  src/new.rs\0?? notes a.md\0R  src/to.rs\0src/from.rs\0";
        let changes = parse_porcelain_status(status, root);

        assert_eq!(changes.len(), 4);
        assert_eq!(changes[0].worktree_status, Some("modified"));
        assert_eq!(changes[1].index_status, Some("added"));
        assert_eq!(changes[2].worktree_status, Some("untracked"));
        assert_eq!(changes[2].relative_path, "notes a.md");
        assert_eq!(changes[3].index_status, Some("renamed"));
        assert_eq!(changes[3].relative_path, "src/to.rs");
    }

    #[test]
    fn marks_unmerged_status_as_conflicted() {
        let changes = parse_porcelain_status(b"UU src/conflict.ts\0", Path::new("/repo"));
        assert_eq!(changes[0].index_status, None);
        assert_eq!(changes[0].worktree_status, Some("conflicted"));
    }

    #[test]
    fn rejects_paths_outside_the_repository() {
        assert!(checked_relative_path("/repo", "/other/file.ts").is_err());
        assert!(checked_relative_path("/repo", "/repo/src/file.ts").is_ok());
    }

    #[test]
    fn stage_and_unstage_all_support_a_repository_without_head() {
        let repository = TemporaryRepository::create();
        fs::write(repository.0.join("first.txt"), "first\n").expect("write first file");
        let root = fs::canonicalize(&repository.0)
            .expect("canonical repository path")
            .to_string_lossy()
            .to_string();

        stage_all_blocking(root.clone()).expect("stage all before first commit");
        let staged = workspace_status_blocking(vec![root.clone()]).expect("read staged status");
        assert_eq!(
            staged.repositories[0].changes[0].index_status,
            Some("added")
        );

        unstage_all_blocking(root.clone()).expect("unstage all before first commit");
        let unstaged = workspace_status_blocking(vec![root]).expect("read unstaged status");
        assert_eq!(unstaged.repositories[0].changes[0].index_status, None);
        assert_eq!(
            unstaged.repositories[0].changes[0].worktree_status,
            Some("untracked")
        );
    }

    #[test]
    fn status_diff_ignore_stage_and_unstage_form_a_complete_file_flow() {
        let repository = TemporaryRepository::create();
        fs::write(repository.0.join("tracked.txt"), "before\n").expect("write tracked file");
        fs::write(repository.0.join(".gitignore"), "*.log\nnode_modules/\n")
            .expect("write ignore file");
        repository.git(&["add", "."]);
        repository.git(&["commit", "-qm", "initial"]);

        fs::write(repository.0.join("tracked.txt"), "before\nafter\n").expect("modify file");
        fs::write(repository.0.join("notes.md"), "untracked\n").expect("write untracked file");
        fs::write(repository.0.join("debug.log"), "ignored\n").expect("write ignored file");
        fs::create_dir_all(repository.0.join("node_modules/example"))
            .expect("create ignored directory");

        let resolved_root = fs::canonicalize(&repository.0).expect("canonical repository path");
        let root = resolved_root.to_string_lossy().to_string();
        let tracked = resolved_root
            .join("tracked.txt")
            .to_string_lossy()
            .to_string();
        let ignored = repository.0.join("debug.log").to_string_lossy().to_string();
        let ignored_directory = repository
            .0
            .join("node_modules")
            .to_string_lossy()
            .to_string();
        let status = workspace_status_blocking(vec![root.clone()]).expect("read status");
        assert_eq!(status.repositories.len(), 1);
        assert_eq!(status.repositories[0].changes.len(), 2);

        let ignored_paths = ignored_paths_blocking(
            vec![root.clone()],
            vec![ignored.clone(), ignored_directory.clone()],
        )
        .expect("read ignored paths");
        assert_eq!(ignored_paths, vec![ignored, ignored_directory]);

        stage_all_blocking(root.clone()).expect("stage all changes");
        let all_staged = workspace_status_blocking(vec![root.clone()]).expect("read all staged");
        assert!(all_staged.repositories[0]
            .changes
            .iter()
            .all(|change| change.index_status.is_some() && change.worktree_status.is_none()));

        unstage_all_blocking(root.clone()).expect("unstage all changes");
        let all_unstaged =
            workspace_status_blocking(vec![root.clone()]).expect("read all unstaged");
        assert!(all_unstaged.repositories[0]
            .changes
            .iter()
            .all(|change| change.index_status.is_none() && change.worktree_status.is_some()));

        let diff = diff_blocking(root.clone(), tracked.clone(), false).expect("read diff");
        assert!(diff.content.contains("+after"));
        run_path_mutation("stage", root.clone(), tracked.clone(), &["add"]).expect("stage file");
        let staged = workspace_status_blocking(vec![root.clone()]).expect("read staged status");
        let tracked_change = staged.repositories[0]
            .changes
            .iter()
            .find(|change| change.path == tracked)
            .expect("find tracked change");
        assert_eq!(tracked_change.index_status, Some("modified"));
        assert_eq!(tracked_change.worktree_status, None);

        unstage_blocking(root.clone(), tracked.clone()).expect("unstage file");
        let unstaged = workspace_status_blocking(vec![root]).expect("read unstaged status");
        let tracked_change = unstaged.repositories[0]
            .changes
            .iter()
            .find(|change| change.path == tracked)
            .expect("find unstaged change");
        assert_eq!(tracked_change.index_status, None);
        assert_eq!(tracked_change.worktree_status, Some("modified"));
    }
}
