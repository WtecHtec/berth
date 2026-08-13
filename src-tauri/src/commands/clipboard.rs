use parking_lot::Mutex;
use serde::Serialize;
use std::{fs, path::PathBuf, time::Duration};

pub struct ClipboardCacheRegistry {
    state: Mutex<ClipboardCacheState>,
}

#[derive(Default)]
struct ClipboardCacheState {
    paths: Vec<PathBuf>,
    change_count: Option<i64>,
}

impl Default for ClipboardCacheRegistry {
    fn default() -> Self {
        cleanup_stale_sftp_clipboard_caches();
        Self {
            state: Mutex::new(ClipboardCacheState::default()),
        }
    }
}

impl ClipboardCacheRegistry {
    /** 新文件 URL 写入系统剪贴板后，旧的远端缓存才可以安全回收。 */
    pub fn replace(&self, next_paths: Vec<PathBuf>, change_count: Option<i64>) {
        let previous = {
            let mut state = self.state.lock();
            state.change_count = change_count;
            std::mem::replace(&mut state.paths, next_paths)
        };
        remove_cached_paths(previous);
    }

    /** 用户在其他应用复制新内容后，Berth 不再持有已经失效的远端缓存。 */
    fn discard_if_pasteboard_changed(&self, current_change_count: i64) {
        let previous = {
            let mut state = self.state.lock();
            if state.change_count == Some(current_change_count) {
                return;
            }
            state.change_count = None;
            std::mem::take(&mut state.paths)
        };
        remove_cached_paths(previous);
    }
}

fn remove_cached_paths(paths: Vec<PathBuf>) {
    for path in paths {
        if path.is_dir() {
            let _ = fs::remove_dir_all(path);
        } else {
            let _ = fs::remove_file(path);
        }
    }
}

/** 上次进程为 Finder 粘贴保留的缓存最多存活一天，避免异常退出造成无限堆积。 */
fn cleanup_stale_sftp_clipboard_caches() {
    let Ok(entries) = fs::read_dir(std::env::temp_dir()) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let is_clipboard_cache = path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("berth-sftp-clipboard-"));
        if !is_clipboard_cache {
            continue;
        }
        let is_stale = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .and_then(|modified| modified.elapsed().map_err(std::io::Error::other))
            .is_ok_and(|age| age >= Duration::from_secs(24 * 60 * 60));
        if is_stale {
            let _ = fs::remove_dir_all(path);
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemFileClipboardItem {
    name: String,
    path: String,
    kind: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemFileClipboardSnapshot {
    change_count: i64,
    item: Option<SystemFileClipboardItem>,
}

#[cfg(target_os = "macos")]
mod platform {
    use super::{SystemFileClipboardItem, SystemFileClipboardSnapshot};
    use objc2::{
        rc::Retained,
        runtime::{AnyClass, ProtocolObject},
        ClassType,
    };
    use objc2_app_kit::{NSPasteboard, NSPasteboardTypeFileURL, NSPasteboardWriting};
    use objc2_foundation::{NSArray, NSString, NSURL};
    use std::path::{Path, PathBuf};

    fn file_url(path: &Path) -> Retained<NSURL> {
        let is_directory = path.is_dir();
        let path = NSString::from_str(&path.to_string_lossy());
        NSURL::fileURLWithPath_isDirectory(&path, is_directory)
    }

    fn clipboard_item_from_url(url: &NSURL) -> Option<SystemFileClipboardItem> {
        if !url.isFileURL() {
            return None;
        }
        let path = url.path()?.to_string();
        let path_value = Path::new(&path);
        if !path_value.exists() {
            return None;
        }
        let name = path_value.file_name()?.to_string_lossy().into_owned();
        let kind = if path_value.is_dir() {
            "directory"
        } else {
            "file"
        }
        .to_string();
        Some(SystemFileClipboardItem { name, path, kind })
    }

    fn write_file_paths_to_pasteboard(
        pasteboard: &NSPasteboard,
        paths: &[PathBuf],
    ) -> Result<i64, String> {
        let paths = paths
            .iter()
            .map(|path| {
                path.canonicalize()
                    .map_err(|error| format!("无法读取复制项目：{error}"))
            })
            .collect::<Result<Vec<_>, _>>()?;
        if paths.is_empty() {
            return Err("没有可复制的文件或文件夹".to_string());
        }
        let urls = paths.iter().map(|path| file_url(path)).collect::<Vec<_>>();
        let writable_urls = urls
            .iter()
            .map(|url| ProtocolObject::<dyn NSPasteboardWriting>::from_ref(&**url))
            .collect::<Vec<_>>();
        let objects = NSArray::from_slice(&writable_urls);
        pasteboard.clearContents();
        if !pasteboard.writeObjects(&objects) {
            return Err("无法写入 macOS 文件剪贴板".to_string());
        }
        Ok(pasteboard.changeCount() as i64)
    }

    fn read_file_snapshot_from_pasteboard(
        pasteboard: &NSPasteboard,
    ) -> Result<SystemFileClipboardSnapshot, String> {
        let classes = NSArray::<AnyClass>::from_slice(&[NSURL::class()]);
        // SAFETY: class_array 明确只包含 NSURL，返回对象逐项再次执行运行时类型检查。
        let objects = unsafe { pasteboard.readObjectsForClasses_options(&classes, None) };
        let item = objects
            .and_then(|objects| {
                for index in 0..objects.count() {
                    let object = objects.objectAtIndex(index);
                    let Some(url) = object.downcast_ref::<NSURL>() else {
                        continue;
                    };
                    if let Some(item) = clipboard_item_from_url(url) {
                        return Some(item);
                    }
                }
                None
            })
            .or_else(|| {
                // Finder 始终提供 public.file-url；个别系统版本可能不为 readObjects
                // 实例化 NSURL，此时直接读取该标准类型作为兼容兜底。
                // SAFETY: AppKit 导出的 NSPasteboardTypeFileURL 是进程生命周期内有效的静态常量。
                let file_url_type = unsafe { NSPasteboardTypeFileURL };
                let value = pasteboard.stringForType(file_url_type)?;
                let url = NSURL::URLWithString(&value)?;
                clipboard_item_from_url(&url)
            });
        Ok(SystemFileClipboardSnapshot {
            change_count: pasteboard.changeCount() as i64,
            item,
        })
    }

    pub fn write_file_paths(paths: &[PathBuf]) -> Result<i64, String> {
        write_file_paths_to_pasteboard(&NSPasteboard::generalPasteboard(), paths)
    }

    pub fn read_file_snapshot() -> Result<SystemFileClipboardSnapshot, String> {
        read_file_snapshot_from_pasteboard(&NSPasteboard::generalPasteboard())
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::{
            fs,
            time::{SystemTime, UNIX_EPOCH},
        };

        fn isolated_fixture() -> PathBuf {
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock must advance")
                .as_nanos();
            let directory = std::env::temp_dir().join(format!(
                "berth-clipboard-test-{}-{stamp}",
                std::process::id()
            ));
            fs::create_dir_all(&directory).expect("fixture directory must be created");
            let file = directory.join("Finder 互通.txt");
            fs::write(&file, "berth").expect("fixture file must be written");
            file
        }

        #[test]
        #[ignore = "requires an active macOS pasteboard server"]
        fn file_urls_round_trip_without_touching_general_pasteboard() {
            let file = isolated_fixture();
            let pasteboard = NSPasteboard::pasteboardWithUniqueName();

            let written_change_count =
                write_file_paths_to_pasteboard(&pasteboard, std::slice::from_ref(&file))
                    .expect("file URL must be written");
            let snapshot =
                read_file_snapshot_from_pasteboard(&pasteboard).expect("file URL must be readable");
            let item = snapshot.item.expect("snapshot must contain the file");

            assert_eq!(snapshot.change_count, written_change_count);
            assert_eq!(item.name, "Finder 互通.txt");
            assert_eq!(item.path, file.canonicalize().unwrap().to_string_lossy());
            assert_eq!(item.kind, "file");

            fs::remove_dir_all(file.parent().unwrap()).expect("fixture must be removed");
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use super::SystemFileClipboardSnapshot;
    use std::path::PathBuf;

    pub fn write_file_paths(_paths: &[PathBuf]) -> Result<i64, String> {
        Err("系统文件剪贴板目前只支持 macOS".to_string())
    }

    pub fn read_file_snapshot() -> Result<SystemFileClipboardSnapshot, String> {
        Err("系统文件剪贴板目前只支持 macOS".to_string())
    }
}

pub(crate) use platform::write_file_paths;

#[tauri::command]
pub fn read_system_file_clipboard(
    registry: tauri::State<'_, ClipboardCacheRegistry>,
) -> Result<SystemFileClipboardSnapshot, String> {
    let snapshot = platform::read_file_snapshot()?;
    registry.discard_if_pasteboard_changed(snapshot.change_count);
    Ok(snapshot)
}

#[tauri::command]
pub fn copy_local_path_to_system_clipboard(
    path: String,
    registry: tauri::State<'_, ClipboardCacheRegistry>,
) -> Result<i64, String> {
    let path = PathBuf::from(path);
    let change_count = platform::write_file_paths(std::slice::from_ref(&path))?;
    registry.replace(Vec::new(), None);
    Ok(change_count)
}
