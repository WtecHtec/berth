use crate::command_environment::configured_command;
use crate::commands::clipboard::{write_file_paths, ClipboardCacheRegistry};
use serde::Serialize;
use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    process::Stdio,
};

const MAX_REMOTE_TEXT_BYTES: u64 = 5 * 1024 * 1024;
const MAX_REMOTE_PREVIEW_BYTES: u64 = 200 * 1024 * 1024;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshSite {
    id: String,
    hostname: Option<String>,
    user: Option<String>,
    port: Option<u16>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpEntry {
    name: String,
    path: String,
    kind: String,
    size: u64,
    modified: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpDirectory {
    path: String,
    entries: Vec<SftpEntry>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpTextFile {
    content: String,
    size: u64,
    modified: String,
}

struct TemporaryFile {
    path: PathBuf,
    remove_on_drop: bool,
}

struct TemporaryDirectory {
    path: PathBuf,
    remove_on_drop: bool,
}

impl TemporaryDirectory {
    fn create(prefix: &str) -> Result<Self, String> {
        let path =
            std::env::temp_dir().join(format!("berth-sftp-{prefix}-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&path).map_err(|error| format!("无法创建 SFTP 临时目录：{error}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o700))
                .map_err(|error| format!("无法保护 SFTP 临时目录：{error}"))?;
        }
        Ok(Self {
            path,
            remove_on_drop: true,
        })
    }

    fn persist(mut self) -> PathBuf {
        self.remove_on_drop = false;
        self.path.clone()
    }
}

impl Drop for TemporaryDirectory {
    fn drop(&mut self) {
        if self.remove_on_drop {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}

impl TemporaryFile {
    fn create(prefix: &str, content: &[u8]) -> Result<Self, String> {
        Self::create_with_suffix(prefix, "", content)
    }

    fn create_with_suffix(prefix: &str, suffix: &str, content: &[u8]) -> Result<Self, String> {
        let path = std::env::temp_dir().join(format!(
            "berth-sftp-{prefix}-{}{suffix}",
            uuid::Uuid::new_v4()
        ));
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&path)
            .map_err(|error| format!("无法创建 SFTP 临时文件：{error}"))?;
        file.write_all(content)
            .map_err(|error| format!("无法写入 SFTP 临时文件：{error}"))?;
        Ok(Self {
            path,
            remove_on_drop: true,
        })
    }

    fn persist(mut self) -> PathBuf {
        self.remove_on_drop = false;
        self.path.clone()
    }
}

impl Drop for TemporaryFile {
    fn drop(&mut self) {
        if self.remove_on_drop {
            let _ = fs::remove_file(&self.path);
        }
    }
}

fn ssh_config_path() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .map(|home| home.join(".ssh/config"))
}

/** 只展示明确的 Host 别名；通配规则仍由 OpenSSH 在真正连接时应用。 */
fn parse_ssh_sites(content: &str) -> Vec<SshSite> {
    let mut sites = Vec::new();
    let mut aliases = Vec::<String>::new();
    let mut hostname = None;
    let mut user = None;
    let mut port = None;

    let flush = |sites: &mut Vec<SshSite>,
                 aliases: &mut Vec<String>,
                 hostname: &mut Option<String>,
                 user: &mut Option<String>,
                 port: &mut Option<u16>| {
        for id in aliases.drain(..) {
            sites.push(SshSite {
                id,
                hostname: hostname.clone(),
                user: user.clone(),
                port: *port,
            });
        }
        *hostname = None;
        *user = None;
        *port = None;
    };

    for raw_line in content.lines() {
        let line = raw_line.split('#').next().unwrap_or_default().trim();
        if line.is_empty() {
            continue;
        }
        let mut fields = line.split_whitespace();
        let directive = fields.next().unwrap_or_default().to_ascii_lowercase();
        if directive == "host" {
            flush(
                &mut sites,
                &mut aliases,
                &mut hostname,
                &mut user,
                &mut port,
            );
            aliases.extend(
                fields
                    .filter(|alias| {
                        !alias.starts_with('!')
                            && !alias.contains('*')
                            && !alias.contains('?')
                            && !alias.contains('[')
                    })
                    .map(str::to_string),
            );
            continue;
        }
        if aliases.is_empty() {
            continue;
        }
        let value = fields.next().map(str::to_string);
        match directive.as_str() {
            "hostname" if hostname.is_none() => hostname = value,
            "user" if user.is_none() => user = value,
            "port" if port.is_none() => port = value.and_then(|item| item.parse().ok()),
            _ => {}
        }
    }
    flush(
        &mut sites,
        &mut aliases,
        &mut hostname,
        &mut user,
        &mut port,
    );

    let mut known = HashSet::new();
    sites.retain(|site| known.insert(site.id.clone()));
    sites.sort_by_key(|site| site.id.to_lowercase());
    sites
}

#[tauri::command]
pub fn list_ssh_sites() -> Result<Vec<SshSite>, String> {
    let Some(path) = ssh_config_path() else {
        return Ok(Vec::new());
    };
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("无法读取 SSH 配置：{error}")),
    };
    Ok(parse_ssh_sites(&content))
}

fn valid_destination(value: &str) -> bool {
    !value.is_empty()
        && !value.starts_with('-')
        && value.len() <= 255
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "._-@:%[]".contains(character))
}

fn valid_control_path(value: &str) -> bool {
    let Some(identifier) = value
        .strip_prefix("/tmp/berth-ssh-")
        .and_then(|remaining| remaining.strip_suffix(".sock"))
    else {
        return false;
    };
    !identifier.is_empty()
        && identifier
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
}

fn quote_sftp_path(path: &str) -> Result<String, String> {
    if path.contains(['\n', '\r', '\0']) {
        return Err("SFTP 路径包含无效字符".to_string());
    }
    Ok(format!(
        "\"{}\"",
        path.replace('\\', "\\\\").replace('"', "\\\"")
    ))
}

fn join_remote_path(parent: &str, name: &str) -> String {
    if parent == "/" {
        format!("/{name}")
    } else {
        format!("{}/{name}", parent.trim_end_matches('/'))
    }
}

fn remote_parent(path: &str) -> &str {
    let trimmed = path.trim_end_matches('/');
    match trimmed.rsplit_once('/') {
        Some(("", _)) => "/",
        Some((parent, _)) => parent,
        None => ".",
    }
}

fn remote_name(path: &str) -> &str {
    path.trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or(path)
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

fn available_remote_copy_name(entries: &[SftpEntry], name: &str, is_directory: bool) -> String {
    let exists = |candidate: &str| entries.iter().any(|entry| entry.name == candidate);
    if !exists(name) {
        return name.to_string();
    }
    let (stem, extension) = split_copy_name(name, is_directory);
    for index in 1..=10_000 {
        let suffix = if index == 1 {
            " 副本".to_string()
        } else {
            format!(" 副本 {index}")
        };
        let candidate = format!("{stem}{suffix}{extension}");
        if !exists(&candidate) {
            return candidate;
        }
    }
    format!("{stem} 副本 {}{extension}", uuid::Uuid::new_v4())
}

fn available_local_copy_path(directory: &Path, name: &str, is_directory: bool) -> PathBuf {
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

fn parse_sftp_listing(output: &str, requested_path: &str) -> SftpDirectory {
    let canonical_path = output
        .lines()
        .find_map(|line| line.trim().strip_prefix("Remote working directory: "))
        .unwrap_or(requested_path)
        .to_string();
    let mut entries = output
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            let marker = line.chars().next()?;
            if !matches!(marker, 'd' | '-' | 'l') {
                return None;
            }
            let mut fields = line.split_whitespace();
            let permissions = fields.next()?;
            let _links = fields.next()?;
            let _owner = fields.next()?;
            let _group = fields.next()?;
            let size = fields.next()?.parse::<u64>().unwrap_or(0);
            let month = fields.next()?;
            let day = fields.next()?;
            let time_or_year = fields.next()?;
            let raw_name = fields.collect::<Vec<_>>().join(" ");
            let name = if marker == 'l' {
                raw_name
                    .split(" -> ")
                    .next()
                    .unwrap_or_default()
                    .to_string()
            } else {
                raw_name
            };
            if name.is_empty() || name == "." || name == ".." {
                return None;
            }
            Some(SftpEntry {
                path: join_remote_path(&canonical_path, &name),
                name,
                kind: match permissions.chars().next() {
                    Some('d') => "directory",
                    Some('l') => "symlink",
                    _ => "file",
                }
                .to_string(),
                size,
                modified: format!("{month} {day} {time_or_year}"),
            })
        })
        .collect::<Vec<_>>();
    entries.sort_by(|first, second| {
        let first_group = if first.kind == "directory" { 0 } else { 1 };
        let second_group = if second.kind == "directory" { 0 } else { 1 };
        first_group
            .cmp(&second_group)
            .then_with(|| first.name.to_lowercase().cmp(&second.name.to_lowercase()))
    });
    SftpDirectory {
        path: canonical_path,
        entries,
    }
}

fn validate_connection(site_id: &str, control_path: Option<&str>) -> Result<(), String> {
    if !valid_destination(site_id) {
        return Err("SSH 站点名称无效".to_string());
    }
    if let Some(control_path) = control_path {
        if !valid_control_path(control_path) {
            return Err("SSH 连接标识无效".to_string());
        }
        if !Path::new(control_path).exists() {
            return Err("SSH 连接尚未完成，请在终端完成登录后刷新 SFTP".to_string());
        }
    }
    Ok(())
}

/** 所有远端文件操作都经过这一条系统 sftp 通道，以复用 SSH config、密钥及当前主连接。 */
fn run_sftp_batch(
    site_id: &str,
    control_path: Option<&str>,
    batch: &str,
) -> Result<String, String> {
    validate_connection(site_id, control_path)?;
    let mut command = configured_command("/usr/bin/sftp");
    command.args(["-q", "-oBatchMode=yes", "-oConnectTimeout=8"]);
    if let Some(control_path) = control_path {
        command.arg(format!("-oControlPath={control_path}"));
    }
    command
        .args(["-b", "-", site_id])
        .env("LC_ALL", "C")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| format!("无法启动系统 sftp：{error}"))?;
    child
        .stdin
        .take()
        .ok_or("无法写入 sftp 命令")?
        .write_all(batch.as_bytes())
        .map_err(|error| format!("无法写入 sftp 命令：{error}"))?;
    let output = child
        .wait_with_output()
        .map_err(|error| format!("SFTP 操作失败：{error}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if control_path.is_none() && detail.to_ascii_lowercase().contains("permission denied") {
            return Err(
                "SFTP 无法复用手动输入的 SSH 密码会话，请从 SSH 侧栏重新建立连接".to_string(),
            );
        }
        return Err(if detail.is_empty() {
            "SFTP 连接失败，请先在终端确认主机并检查密钥或 ssh-agent".to_string()
        } else {
            format!("SFTP 操作失败：{detail}")
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn fetch_directory(
    site_id: &str,
    path: &str,
    control_path: Option<&str>,
) -> Result<SftpDirectory, String> {
    let requested_path = if path.trim().is_empty() {
        "."
    } else {
        path.trim()
    };
    let batch = format!("cd {}\npwd\nls -la\n", quote_sftp_path(requested_path)?);
    let output = run_sftp_batch(site_id, control_path, &batch)?;
    Ok(parse_sftp_listing(&output, requested_path))
}

fn fetch_file_metadata(
    site_id: &str,
    path: &str,
    control_path: Option<&str>,
) -> Result<SftpEntry, String> {
    let directory = fetch_directory(site_id, remote_parent(path), control_path)?;
    directory
        .entries
        .into_iter()
        .find(|entry| entry.name == remote_name(path))
        .ok_or_else(|| "远端文件不存在或已被移动".to_string())
}

/**
 * 通过系统 sftp 执行一次只读目录查询，复用用户的 SSH config、密钥和 ssh-agent。
 * BatchMode 防止后端进程等待不可见的密码输入；首次连接应先在终端中完成主机确认。
 */
#[tauri::command]
pub fn list_sftp_directory(
    site_id: String,
    path: String,
    control_path: Option<String>,
) -> Result<SftpDirectory, String> {
    fetch_directory(&site_id, &path, control_path.as_deref())
}

#[tauri::command]
pub fn read_sftp_text_file(
    site_id: String,
    path: String,
    control_path: Option<String>,
) -> Result<SftpTextFile, String> {
    let metadata = fetch_file_metadata(&site_id, &path, control_path.as_deref())?;
    if metadata.kind == "directory" {
        return Err("目录不能作为文件打开".to_string());
    }
    if metadata.size > MAX_REMOTE_TEXT_BYTES {
        return Err("远端文本文件超过 5 MB，请下载后查看".to_string());
    }
    let temporary = TemporaryFile::create("read", b"")?;
    let batch = format!(
        "get {} {}\n",
        quote_sftp_path(&path)?,
        quote_sftp_path(&temporary.path.to_string_lossy())?
    );
    run_sftp_batch(&site_id, control_path.as_deref(), &batch)?;
    let bytes =
        fs::read(&temporary.path).map_err(|error| format!("无法读取远端文件缓存：{error}"))?;
    let content = String::from_utf8(bytes)
        .map_err(|_| "该远端文件不是 UTF-8 文本，请下载后使用其他应用查看".to_string())?;
    Ok(SftpTextFile {
        content,
        size: metadata.size,
        modified: metadata.modified,
    })
}

/** 保存前比较打开时的元数据，避免覆盖同一文件在服务器上的较新修改。 */
#[tauri::command]
pub fn write_sftp_text_file(
    site_id: String,
    path: String,
    content: String,
    expected_size: u64,
    expected_modified: String,
    control_path: Option<String>,
) -> Result<SftpTextFile, String> {
    let current = fetch_file_metadata(&site_id, &path, control_path.as_deref())?;
    if current.size != expected_size || current.modified != expected_modified {
        return Err("远端文件已被其他程序修改。请重新打开文件并合并修改后再保存".to_string());
    }
    let temporary = TemporaryFile::create("write", content.as_bytes())?;
    let remote_temporary = format!("{path}.berth-{}.tmp", uuid::Uuid::new_v4());
    let batch = format!(
        "put {} {}\nrename {} {}\n",
        quote_sftp_path(&temporary.path.to_string_lossy())?,
        quote_sftp_path(&remote_temporary)?,
        quote_sftp_path(&remote_temporary)?,
        quote_sftp_path(&path)?
    );
    run_sftp_batch(&site_id, control_path.as_deref(), &batch)?;
    let next = fetch_file_metadata(&site_id, &path, control_path.as_deref())?;
    Ok(SftpTextFile {
        content,
        size: next.size,
        modified: next.modified,
    })
}

#[tauri::command]
pub fn upload_sftp_paths(
    site_id: String,
    directory: String,
    local_paths: Vec<String>,
    control_path: Option<String>,
) -> Result<SftpDirectory, String> {
    if local_paths.is_empty() {
        return fetch_directory(&site_id, &directory, control_path.as_deref());
    }
    let mut batch = format!("cd {}\n", quote_sftp_path(&directory)?);
    for local_path in local_paths {
        let path = Path::new(&local_path);
        if !path.exists() {
            return Err(format!("本地文件不存在：{local_path}"));
        }
        let command = if path.is_dir() { "put -r" } else { "put" };
        batch.push_str(&format!("{command} {}\n", quote_sftp_path(&local_path)?));
    }
    run_sftp_batch(&site_id, control_path.as_deref(), &batch)?;
    fetch_directory(&site_id, &directory, control_path.as_deref())
}

/** 应用内粘贴会先解析目标目录中的重名项目，避免直接覆盖远端文件。 */
#[tauri::command]
pub fn paste_local_path_to_sftp(
    site_id: String,
    directory: String,
    local_path: String,
    control_path: Option<String>,
) -> Result<SftpDirectory, String> {
    let local_path = PathBuf::from(local_path);
    if !local_path.exists() {
        return Err("复制来源已经不存在".to_string());
    }
    let is_directory = local_path.is_dir();
    let source_name = local_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("无法确定复制项目名称")?;
    let destination = fetch_directory(&site_id, &directory, control_path.as_deref())?;
    let destination_name =
        available_remote_copy_name(&destination.entries, source_name, is_directory);
    let destination_path = join_remote_path(&destination.path, &destination_name);
    let command = if is_directory { "put -R" } else { "put" };
    let batch = format!(
        "{command} {} {}\n",
        quote_sftp_path(&local_path.to_string_lossy())?,
        quote_sftp_path(&destination_path)?
    );
    run_sftp_batch(&site_id, control_path.as_deref(), &batch)?;
    fetch_directory(&site_id, &destination.path, control_path.as_deref())
}

#[tauri::command]
pub fn download_sftp_file(
    site_id: String,
    remote_path: String,
    local_path: String,
    control_path: Option<String>,
) -> Result<(), String> {
    let batch = format!(
        "get {} {}\n",
        quote_sftp_path(&remote_path)?,
        quote_sftp_path(&local_path)?
    );
    run_sftp_batch(&site_id, control_path.as_deref(), &batch).map(|_| ())
}

#[tauri::command]
pub fn download_sftp_entry(
    site_id: String,
    remote_path: String,
    kind: String,
    destination_directory: String,
    control_path: Option<String>,
) -> Result<String, String> {
    let destination_directory = PathBuf::from(destination_directory)
        .canonicalize()
        .map_err(|error| format!("无法读取粘贴位置：{error}"))?;
    if !destination_directory.is_dir() {
        return Err("粘贴位置不是文件夹".to_string());
    }
    let is_directory = kind == "directory";
    if !is_directory && kind != "file" && kind != "symlink" {
        return Err("不支持的远端条目类型".to_string());
    }
    let destination = available_local_copy_path(
        &destination_directory,
        remote_name(&remote_path),
        is_directory,
    );
    let command = if is_directory { "get -R" } else { "get" };
    let batch = format!(
        "{command} {} {}\n",
        quote_sftp_path(&remote_path)?,
        quote_sftp_path(&destination.to_string_lossy())?
    );
    run_sftp_batch(&site_id, control_path.as_deref(), &batch)?;
    Ok(destination.to_string_lossy().into_owned())
}

/** 远端复制先进入受控临时目录，再上传到目标连接，因而也支持跨 SSH 会话粘贴。 */
#[tauri::command]
pub fn copy_sftp_entry(
    source_site_id: String,
    source_path: String,
    source_kind: String,
    source_control_path: Option<String>,
    destination_site_id: String,
    destination_directory: String,
    destination_control_path: Option<String>,
) -> Result<SftpDirectory, String> {
    let is_directory = source_kind == "directory";
    if !is_directory && source_kind != "file" && source_kind != "symlink" {
        return Err("不支持的远端条目类型".to_string());
    }
    let destination = fetch_directory(
        &destination_site_id,
        &destination_directory,
        destination_control_path.as_deref(),
    )?;
    let source_name = remote_name(&source_path);
    let destination_name =
        available_remote_copy_name(&destination.entries, source_name, is_directory);
    let temporary = TemporaryDirectory::create("copy")?;
    let get_command = if is_directory { "get -R" } else { "get" };
    let download_batch = format!(
        "lcd {}\n{get_command} {}\n",
        quote_sftp_path(&temporary.path.to_string_lossy())?,
        quote_sftp_path(&source_path)?
    );
    run_sftp_batch(
        &source_site_id,
        source_control_path.as_deref(),
        &download_batch,
    )?;
    let downloaded_path = temporary.path.join(source_name);
    if !downloaded_path.exists() {
        return Err("SFTP 已完成下载，但未找到本地临时副本".to_string());
    }
    let upload_path = if destination_name == source_name {
        downloaded_path
    } else {
        let renamed = temporary.path.join(&destination_name);
        fs::rename(&downloaded_path, &renamed)
            .map_err(|error| format!("无法准备远端副本：{error}"))?;
        renamed
    };
    let put_command = if is_directory { "put -R" } else { "put" };
    let upload_batch = format!(
        "cd {}\n{put_command} {}\n",
        quote_sftp_path(&destination.path)?,
        quote_sftp_path(&upload_path.to_string_lossy())?
    );
    run_sftp_batch(
        &destination_site_id,
        destination_control_path.as_deref(),
        &upload_batch,
    )?;
    fetch_directory(
        &destination_site_id,
        &destination.path,
        destination_control_path.as_deref(),
    )
}

/** 将远端项目缓存成真实文件 URL，使 Finder 可以直接从 Berth 粘贴。 */
#[tauri::command]
pub fn copy_sftp_entry_to_system_clipboard(
    site_id: String,
    remote_path: String,
    kind: String,
    control_path: Option<String>,
    registry: tauri::State<'_, ClipboardCacheRegistry>,
) -> Result<i64, String> {
    let is_directory = kind == "directory";
    if !is_directory && kind != "file" && kind != "symlink" {
        return Err("不支持的远端条目类型".to_string());
    }
    let temporary = TemporaryDirectory::create("clipboard")?;
    let local_path = temporary.path.join(remote_name(&remote_path));
    let command = if is_directory { "get -R" } else { "get" };
    let batch = format!(
        "{command} {} {}\n",
        quote_sftp_path(&remote_path)?,
        quote_sftp_path(&local_path.to_string_lossy())?
    );
    run_sftp_batch(&site_id, control_path.as_deref(), &batch)?;
    if !local_path.exists() {
        return Err("SFTP 已完成下载，但未找到系统剪贴板缓存".to_string());
    }
    let change_count = write_file_paths(std::slice::from_ref(&local_path))?;
    registry.replace(vec![temporary.persist()], Some(change_count));
    Ok(change_count)
}

/** 媒体预览缓存只存在系统临时目录，并由前端标签生命周期主动回收。 */
#[tauri::command]
pub fn cache_sftp_file(
    site_id: String,
    remote_path: String,
    control_path: Option<String>,
) -> Result<String, String> {
    let metadata = fetch_file_metadata(&site_id, &remote_path, control_path.as_deref())?;
    if metadata.size > MAX_REMOTE_PREVIEW_BYTES {
        return Err("远端媒体文件超过 200 MB，请下载后查看".to_string());
    }
    let extension = remote_name(&remote_path)
        .rsplit_once('.')
        .map(|(_, value)| value)
        .filter(|value| {
            !value.is_empty()
                && value.len() <= 10
                && value
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric())
        })
        .map(|value| format!(".{value}"))
        .unwrap_or_default();
    let temporary = TemporaryFile::create_with_suffix("preview", &extension, b"")?;
    let batch = format!(
        "get {} {}\n",
        quote_sftp_path(&remote_path)?,
        quote_sftp_path(&temporary.path.to_string_lossy())?
    );
    run_sftp_batch(&site_id, control_path.as_deref(), &batch)?;
    Ok(temporary.persist().to_string_lossy().into_owned())
}

#[tauri::command]
pub fn release_sftp_cache(path: String) -> Result<(), String> {
    let candidate = PathBuf::from(&path);
    let valid_parent = candidate.parent() == Some(std::env::temp_dir().as_path());
    let valid_name = candidate
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with("berth-sftp-preview-"));
    if !valid_parent || !valid_name {
        return Err("SFTP 预览缓存路径无效".to_string());
    }
    match fs::remove_file(candidate) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("无法清理 SFTP 预览缓存：{error}")),
    }
}

#[tauri::command]
pub fn create_sftp_entry(
    site_id: String,
    path: String,
    kind: String,
    control_path: Option<String>,
) -> Result<(), String> {
    let batch = match kind.as_str() {
        "directory" => format!("mkdir {}\n", quote_sftp_path(&path)?),
        "file" => {
            let temporary = TemporaryFile::create("empty", b"")?;
            let batch = format!(
                "put {} {}\n",
                quote_sftp_path(&temporary.path.to_string_lossy())?,
                quote_sftp_path(&path)?
            );
            return run_sftp_batch(&site_id, control_path.as_deref(), &batch).map(|_| ());
        }
        _ => return Err("不支持的远端条目类型".to_string()),
    };
    run_sftp_batch(&site_id, control_path.as_deref(), &batch).map(|_| ())
}

#[tauri::command]
pub fn rename_sftp_entry(
    site_id: String,
    path: String,
    next_path: String,
    control_path: Option<String>,
) -> Result<(), String> {
    let batch = format!(
        "rename {} {}\n",
        quote_sftp_path(&path)?,
        quote_sftp_path(&next_path)?
    );
    run_sftp_batch(&site_id, control_path.as_deref(), &batch).map(|_| ())
}

#[tauri::command]
pub fn delete_sftp_entry(
    site_id: String,
    path: String,
    kind: String,
    control_path: Option<String>,
) -> Result<(), String> {
    // 目录只允许删除空目录，避免一次误操作递归清空服务器内容。
    let command = match kind.as_str() {
        "directory" => "rmdir",
        "file" | "symlink" => "rm",
        _ => return Err("不支持的远端条目类型".to_string()),
    };
    let batch = format!("{command} {}\n", quote_sftp_path(&path)?);
    run_sftp_batch(&site_id, control_path.as_deref(), &batch).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_explicit_ssh_aliases_and_skips_wildcards() {
        let sites = parse_ssh_sites(
            "Host *\n  ServerAliveInterval 30\nHost staging stage-short\n  HostName 10.0.0.8\n  User deploy\n  Port 2222\nHost *.internal\n  User ignored\n",
        );
        assert_eq!(sites.len(), 2);
        assert_eq!(sites[0].id, "stage-short");
        assert_eq!(sites[1].id, "staging");
        assert_eq!(sites[1].hostname.as_deref(), Some("10.0.0.8"));
        assert_eq!(sites[1].user.as_deref(), Some("deploy"));
        assert_eq!(sites[1].port, Some(2222));
    }

    #[test]
    fn parses_sftp_directories_and_files_with_spaces() {
        let listing = "Remote working directory: /srv/app\ndrwxr-xr-x 3 user group 96 Aug 12 10:20 logs\n-rw-r--r-- 1 user group 42 Aug 12 10:21 release notes.txt\n";
        let directory = parse_sftp_listing(listing, ".");
        assert_eq!(directory.path, "/srv/app");
        assert_eq!(directory.entries[0].path, "/srv/app/logs");
        assert_eq!(directory.entries[1].name, "release notes.txt");
    }

    #[test]
    fn accepts_only_berth_owned_control_socket_paths() {
        assert!(valid_control_path(
            "/tmp/berth-ssh-98b77c10-0783-4d6d-a145-cbf67cf8e834.sock"
        ));
        assert!(!valid_control_path("/tmp/arbitrary.sock"));
        assert!(!valid_control_path("/tmp/berth-ssh-../other.sock"));
    }

    #[test]
    fn resolves_remote_parent_and_escapes_batch_paths() {
        assert_eq!(remote_parent("/srv/app/read me.md"), "/srv/app");
        assert_eq!(remote_parent("/readme.md"), "/");
        assert_eq!(remote_name("/srv/app/read me.md"), "read me.md");
        assert_eq!(
            quote_sftp_path("/srv/a \"b\"").unwrap(),
            "\"/srv/a \\\"b\\\"\""
        );
        assert!(quote_sftp_path("bad\ncommand").is_err());
    }

    #[test]
    fn generates_available_remote_copy_names() {
        let entries = vec![
            SftpEntry {
                name: "notes.md".to_string(),
                path: "/notes.md".to_string(),
                kind: "file".to_string(),
                size: 1,
                modified: String::new(),
            },
            SftpEntry {
                name: "notes 副本.md".to_string(),
                path: "/notes 副本.md".to_string(),
                kind: "file".to_string(),
                size: 1,
                modified: String::new(),
            },
        ];
        assert_eq!(
            available_remote_copy_name(&entries, "notes.md", false),
            "notes 副本 2.md"
        );
        assert_eq!(
            available_remote_copy_name(&entries, "folder", true),
            "folder"
        );
    }
}
