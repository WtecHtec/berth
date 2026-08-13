use serde::Serialize;
use std::{
    fs,
    fs::OpenOptions,
    path::{Path, PathBuf},
    process::Command,
};

use super::git::list_searchable_files;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntryDto {
    id: String,
    name: String,
    path: String,
    kind: &'static str,
    depth: u8,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSearchResultDto {
    id: String,
    name: String,
    path: String,
    kind: &'static str,
    depth: u8,
    meta: String,
}

const SEARCH_RESULT_LIMIT: usize = 200;
const IGNORED_SEARCH_DIRECTORIES: [&str; 4] = [".git", "node_modules", "target", ".next"];
const MAX_EDITABLE_FILE_BYTES: u64 = 5 * 1024 * 1024;

/** 在进入 WebView 前限制完整文本大小，避免 content、draft 与高亮节点叠加占用内存。 */
fn ensure_editable_file_size(size: u64) -> Result<(), String> {
    if size > MAX_EDITABLE_FILE_BYTES {
        return Err("文件超过 5 MB，为避免占用过多内存，Berth 不会直接加载该文件".to_string());
    }
    Ok(())
}

fn normalize_path(path: &str) -> Result<PathBuf, String> {
    let expanded = if path == "~" {
        std::env::var_os("HOME").map(PathBuf::from)
    } else if let Some(suffix) = path.strip_prefix("~/") {
        std::env::var_os("HOME").map(|home| PathBuf::from(home).join(suffix))
    } else {
        Some(PathBuf::from(path))
    };
    expanded.ok_or_else(|| "无法解析用户目录".to_string())
}

fn validate_name(name: &str) -> Result<&str, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        return Err("名称不能为空".to_string());
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err("名称不能包含路径分隔符".to_string());
    }
    Ok(trimmed)
}

fn split_copy_name(name: &str, is_directory: bool) -> (&str, &str) {
    if is_directory {
        return (name, "");
    }
    match name.rsplit_once('.') {
        Some((stem, extension)) if !stem.is_empty() && !extension.is_empty() => {
            (stem, &name[stem.len()..])
        }
        _ => (name, ""),
    }
}

/** 与 Finder 类似，在目标目录已存在同名项目时生成“副本”“副本 2”名称。 */
fn available_copy_path(directory: &Path, name: &str, is_directory: bool) -> PathBuf {
    let original = directory.join(name);
    if !original.exists() {
        return original;
    }
    let (stem, extension) = split_copy_name(name, is_directory);
    for index in 1..=10_000 {
        let suffix = if index == 1 {
            " 副本".to_string()
        } else {
            format!(" 副本 {index}")
        };
        let candidate = directory.join(format!("{stem}{suffix}{extension}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    directory.join(format!("{stem} 副本 {}{extension}", uuid::Uuid::new_v4()))
}

fn copy_directory_recursive(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir(destination).map_err(|error| format!("无法创建目标文件夹：{error}"))?;
    for entry in fs::read_dir(source).map_err(|error| format!("无法读取源文件夹：{error}"))?
    {
        let entry = entry.map_err(|error| format!("无法读取文件夹项目：{error}"))?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        let metadata = fs::symlink_metadata(&source_path)
            .map_err(|error| format!("无法读取文件信息：{error}"))?;
        if metadata.file_type().is_symlink() {
            #[cfg(unix)]
            std::os::unix::fs::symlink(
                fs::read_link(&source_path)
                    .map_err(|error| format!("无法读取符号链接：{error}"))?,
                &destination_path,
            )
            .map_err(|error| format!("无法复制符号链接：{error}"))?;
        } else if metadata.is_dir() {
            copy_directory_recursive(&source_path, &destination_path)?;
        } else {
            fs::copy(&source_path, &destination_path)
                .map_err(|error| format!("无法复制文件：{error}"))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<FileEntryDto>, String> {
    let root = normalize_path(&path)?;
    let mut entries = fs::read_dir(&root)
        .map_err(|error| format!("无法读取目录：{error}"))?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let file_type = entry.file_type().ok()?;
            let entry_path = entry.path();
            Some(FileEntryDto {
                id: entry_path.to_string_lossy().to_string(),
                name: entry.file_name().to_string_lossy().to_string(),
                path: entry_path.to_string_lossy().to_string(),
                kind: if file_type.is_dir() { "folder" } else { "file" },
                depth: 0,
            })
        })
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| (entry.kind != "folder", entry.name.to_lowercase()));
    Ok(entries)
}

fn collect_matching_files(
    root: &Path,
    directory: &Path,
    root_label: &str,
    query: &str,
    results: &mut Vec<FileSearchResultDto>,
) {
    if results.len() >= SEARCH_RESULT_LIMIT {
        return;
    }
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };

    for entry in entries.filter_map(Result::ok) {
        if results.len() >= SEARCH_RESULT_LIMIT {
            return;
        }
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();
        if file_type.is_dir() {
            if !IGNORED_SEARCH_DIRECTORIES.contains(&name.as_str()) {
                collect_matching_files(root, &path, root_label, query, results);
            }
            continue;
        }
        if !file_type.is_file() || !name.to_lowercase().contains(query) {
            continue;
        }

        let relative_parent = path
            .strip_prefix(root)
            .ok()
            .and_then(Path::parent)
            .filter(|parent| !parent.as_os_str().is_empty())
            .map(|parent| parent.to_string_lossy().to_string());
        let meta = relative_parent
            .map(|parent| format!("{root_label}/{parent}"))
            .unwrap_or_else(|| root_label.to_string());
        let path_text = path.to_string_lossy().to_string();
        results.push(FileSearchResultDto {
            id: path_text.clone(),
            name,
            path: path_text,
            kind: "file",
            depth: 0,
            meta,
        });
    }
}

fn search_files_blocking(
    roots: Vec<String>,
    query: String,
) -> Result<Vec<FileSearchResultDto>, String> {
    let normalized_query = query.trim().to_lowercase();
    if normalized_query.is_empty() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    for root in roots {
        let root = normalize_path(&root)?;
        let root_label = root
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| root.to_string_lossy().to_string());
        match list_searchable_files(&root) {
            Ok(Some(paths)) => {
                // Git 仓库优先使用 Git 文件清单，自动遵循仓库、全局和 exclude 忽略规则。
                for path in paths {
                    if results.len() >= SEARCH_RESULT_LIMIT {
                        break;
                    }
                    let Some(name) = path
                        .file_name()
                        .map(|value| value.to_string_lossy().to_string())
                    else {
                        continue;
                    };
                    if !name.to_lowercase().contains(&normalized_query) {
                        continue;
                    }
                    let relative_parent = path
                        .strip_prefix(&root)
                        .ok()
                        .and_then(Path::parent)
                        .filter(|parent| !parent.as_os_str().is_empty())
                        .map(|parent| parent.to_string_lossy().to_string());
                    let meta = relative_parent
                        .map(|parent| format!("{root_label}/{parent}"))
                        .unwrap_or_else(|| root_label.clone());
                    let path_text = path.to_string_lossy().to_string();
                    results.push(FileSearchResultDto {
                        id: path_text.clone(),
                        name,
                        path: path_text,
                        kind: "file",
                        depth: 0,
                        meta,
                    });
                }
            }
            // 非 Git 根目录退回有结果上限的递归文件系统搜索。
            Ok(None) | Err(_) => {
                collect_matching_files(&root, &root, &root_label, &normalized_query, &mut results)
            }
        }
        if results.len() >= SEARCH_RESULT_LIMIT {
            break;
        }
    }
    results.sort_by_key(|entry| {
        (
            !entry.name.to_lowercase().starts_with(&normalized_query),
            entry.name.to_lowercase(),
            entry.path.clone(),
        )
    });
    Ok(results)
}

#[tauri::command]
pub async fn search_files(
    roots: Vec<String>,
    query: String,
) -> Result<Vec<FileSearchResultDto>, String> {
    tauri::async_runtime::spawn_blocking(move || search_files_blocking(roots, query))
        .await
        .map_err(|error| format!("文件搜索任务失败：{error}"))?
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    let path = normalize_path(&path)?;
    let metadata = fs::metadata(&path).map_err(|error| format!("无法读取文件信息：{error}"))?;
    ensure_editable_file_size(metadata.len())?;
    fs::read_to_string(path).map_err(|error| format!("无法读取文件：{error}"))
}

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(normalize_path(&path)?, content).map_err(|error| format!("无法保存文件：{error}"))
}

#[tauri::command]
pub fn create_file(directory: String, name: String) -> Result<String, String> {
    let directory = normalize_path(&directory)?;
    if !directory.is_dir() {
        return Err("目标位置不是文件夹".to_string());
    }
    let path = directory.join(validate_name(&name)?);
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|error| format!("无法新建文件：{error}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn copy_path(
    source_path: String,
    destination_directory: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let source = normalize_path(&source_path)?;
        let canonical_source = source
            .canonicalize()
            .map_err(|error| format!("无法读取复制来源：{error}"))?;
        let destination_directory = normalize_path(&destination_directory)?
            .canonicalize()
            .map_err(|error| format!("无法读取粘贴位置：{error}"))?;
        if !destination_directory.is_dir() {
            return Err("粘贴位置不是文件夹".to_string());
        }
        let metadata =
            fs::symlink_metadata(&source).map_err(|error| format!("无法读取复制来源：{error}"))?;
        if metadata.is_dir() && destination_directory.starts_with(&canonical_source) {
            return Err("不能将文件夹粘贴到它自身或子目录中".to_string());
        }
        let name = source
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or("无法确定复制项目名称")?;
        let destination = available_copy_path(&destination_directory, name, metadata.is_dir());
        if metadata.is_dir() {
            copy_directory_recursive(&source, &destination)?;
        } else if metadata.file_type().is_symlink() {
            #[cfg(unix)]
            std::os::unix::fs::symlink(
                fs::read_link(&source).map_err(|error| format!("无法读取符号链接：{error}"))?,
                &destination,
            )
            .map_err(|error| format!("无法复制符号链接：{error}"))?;
        } else {
            fs::copy(&source, &destination).map_err(|error| format!("无法复制文件：{error}"))?;
        }
        Ok(destination.to_string_lossy().into_owned())
    })
    .await
    .map_err(|error| format!("文件复制任务失败：{error}"))?
}

#[tauri::command]
pub fn rename_path(path: String, new_name: String) -> Result<String, String> {
    let source = normalize_path(&path)?;
    let parent = source.parent().ok_or("无法重命名根目录")?;
    let destination = parent.join(validate_name(&new_name)?);
    if destination.exists() {
        return Err("同名文件或文件夹已经存在".to_string());
    }
    fs::rename(&source, &destination).map_err(|error| format!("无法重命名：{error}"))?;
    Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
pub fn move_to_trash(path: String) -> Result<(), String> {
    let target = normalize_path(&path)?;
    if !target.is_absolute() || target.parent().is_none() {
        return Err("不能将系统根路径移到废纸篓".to_string());
    }
    if std::env::var_os("HOME").is_some_and(|home| Path::new(&home) == target) {
        return Err("不能将用户主目录移到废纸篓".to_string());
    }
    // 使用 symlink_metadata 验证条目本身，避免符号链接被解析后误删链接目标。
    fs::symlink_metadata(&target).map_err(|error| format!("无法读取待移动项目：{error}"))?;
    trash::delete(target).map_err(|error| format!("无法移入废纸篓：{error}"))
}

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    let resolved = normalize_path(&path)?;
    let mut command = Command::new("open");
    if resolved.is_dir() {
        command.arg(&resolved);
    } else {
        command.arg("-R").arg(&resolved);
    }
    command
        .spawn()
        .map_err(|error| format!("无法在访达中显示：{error}"))?;
    Ok(())
}

#[allow(dead_code)]
fn parent_directory(path: &Path) -> &Path {
    if path.is_dir() {
        path
    } else {
        path.parent().unwrap_or(path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_files_above_the_editable_memory_limit() {
        assert!(ensure_editable_file_size(MAX_EDITABLE_FILE_BYTES).is_ok());
        assert!(ensure_editable_file_size(MAX_EDITABLE_FILE_BYTES + 1).is_err());
    }

    #[test]
    fn rejects_unsafe_trash_targets_without_touching_disk() {
        assert!(move_to_trash("relative/path".to_string()).is_err());
        assert!(move_to_trash("/".to_string()).is_err());
    }

    #[test]
    fn generates_finder_style_copy_names_without_losing_extensions() {
        let root = TemporarySearchRoot(
            std::env::temp_dir().join(format!("berth-copy-name-{}", uuid::Uuid::new_v4())),
        );
        fs::create_dir(&root.0).expect("create copy root");
        fs::write(root.0.join("notes.md"), "first").expect("write original");
        assert_eq!(
            available_copy_path(&root.0, "notes.md", false)
                .file_name()
                .and_then(|value| value.to_str()),
            Some("notes 副本.md")
        );
        fs::write(root.0.join("notes 副本.md"), "second").expect("write first copy");
        assert_eq!(
            available_copy_path(&root.0, "notes.md", false)
                .file_name()
                .and_then(|value| value.to_str()),
            Some("notes 副本 2.md")
        );
    }

    #[test]
    fn recursively_copies_a_directory_tree() {
        let root = TemporarySearchRoot(
            std::env::temp_dir().join(format!("berth-copy-tree-{}", uuid::Uuid::new_v4())),
        );
        fs::create_dir_all(root.0.join("source/nested")).expect("create source tree");
        fs::write(root.0.join("source/nested/file.txt"), "copied").expect("write source");
        copy_directory_recursive(&root.0.join("source"), &root.0.join("destination"))
            .expect("copy directory tree");
        assert_eq!(
            fs::read_to_string(root.0.join("destination/nested/file.txt")).unwrap(),
            "copied"
        );
    }

    struct TemporarySearchRoot(PathBuf);

    impl Drop for TemporarySearchRoot {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn recursively_finds_files_and_skips_dependency_directories() {
        let root = TemporarySearchRoot(
            std::env::temp_dir().join(format!("berth-file-search-{}", uuid::Uuid::new_v4())),
        );
        fs::create_dir_all(root.0.join("src")).expect("create source directory");
        fs::create_dir_all(root.0.join("node_modules/pkg")).expect("create ignored directory");
        fs::write(root.0.join("src/AppShell.tsx"), "export {};").expect("write source file");
        fs::write(root.0.join("node_modules/pkg/AppIgnored.js"), "").expect("write ignored file");

        let results = search_files_blocking(
            vec![root.0.to_string_lossy().to_string()],
            "app".to_string(),
        )
        .expect("search files");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "AppShell.tsx");
        assert!(results[0].meta.ends_with("/src"));
    }

    #[test]
    fn git_workspace_search_honors_standard_ignore_rules() {
        let root = TemporarySearchRoot(
            std::env::temp_dir().join(format!("berth-file-search-{}", uuid::Uuid::new_v4())),
        );
        fs::create_dir_all(root.0.join("src")).expect("create source directory");
        fs::write(root.0.join(".gitignore"), "AppIgnored.tsx\n").expect("write ignore file");
        fs::write(root.0.join("src/AppVisible.tsx"), "export {};").expect("write visible file");
        fs::write(root.0.join("AppIgnored.tsx"), "export {};").expect("write ignored file");
        let output = Command::new("git")
            .arg("-C")
            .arg(&root.0)
            .args(["init", "-q"])
            .output()
            .expect("initialize repository");
        assert!(output.status.success());

        let results = search_files_blocking(
            vec![root.0.to_string_lossy().to_string()],
            "app".to_string(),
        )
        .expect("search Git files");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "AppVisible.tsx");
    }
}
