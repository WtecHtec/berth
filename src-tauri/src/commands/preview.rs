use parking_lot::Mutex;
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    sync::mpsc::{self, Sender},
    thread,
};
use tauri::{AppHandle, Manager, State, Window};

struct PreviewServerHandle {
    owner_window: String,
    shutdown_sender: Sender<()>,
    address: SocketAddr,
}

impl PreviewServerHandle {
    fn shutdown(self) {
        let _ = self.shutdown_sender.send(());
        // 主动连接一次本地端口，唤醒阻塞中的 accept，让线程立即读取关闭信号。
        let _ = TcpStream::connect(self.address);
    }
}

#[derive(Default)]
pub struct PreviewServerRegistry {
    servers: Mutex<HashMap<String, PreviewServerHandle>>,
}

impl PreviewServerRegistry {
    /** 原生窗口销毁时停止其所属预览线程，兜底覆盖前端未执行 effect cleanup 的情况。 */
    pub fn terminate_window(&self, window_label: &str) {
        let owned_servers = {
            let mut servers = self.servers.lock();
            let ids = servers
                .iter()
                .filter(|(_, server)| server.owner_window == window_label)
                .map(|(id, _)| id.clone())
                .collect::<Vec<_>>();
            ids.into_iter()
                .filter_map(|id| servers.remove(&id))
                .collect::<Vec<_>>()
        };
        for server in owned_servers {
            server.shutdown();
        }
    }
}

impl Drop for PreviewServerRegistry {
    fn drop(&mut self) {
        for (_, server) in self.servers.get_mut().drain() {
            server.shutdown();
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HtmlPreviewSessionDto {
    id: String,
    url: String,
}

fn content_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "aac" => "audio/aac",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "css" => "text/css; charset=utf-8",
        "gif" => "image/gif",
        "flac" => "audio/flac",
        "htm" | "html" => "text/html; charset=utf-8",
        "ico" => "image/x-icon",
        "jpeg" | "jpg" => "image/jpeg",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" | "map" => "application/json; charset=utf-8",
        "m4v" => "video/x-m4v",
        "m4a" => "audio/mp4",
        "mov" => "video/quicktime",
        "mp3" => "audio/mpeg",
        "mp4" => "video/mp4",
        "oga" | "ogg" => "audio/ogg",
        "ogv" => "video/ogg",
        "png" => "image/png",
        "svg" => "image/svg+xml",
        "txt" => "text/plain; charset=utf-8",
        "wav" => "audio/wav",
        "webm" => "video/webm",
        "webp" => "image/webp",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

fn decode_url_path(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let pair = bytes.get(index + 1..index + 3)?;
            let hex = std::str::from_utf8(pair).ok()?;
            decoded.push(u8::from_str_radix(hex, 16).ok()?);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).ok()
}

fn response(
    stream: &mut TcpStream,
    status: &str,
    content_type: &str,
    body: &[u8],
    head_only: bool,
) {
    let headers = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(headers.as_bytes());
    if !head_only {
        let _ = stream.write_all(body);
    }
}

fn response_file(stream: &mut TcpStream, path: &Path, head_only: bool) {
    let Ok(mut file) = fs::File::open(path) else {
        response(
            stream,
            "404 Not Found",
            "text/plain; charset=utf-8",
            b"Not found",
            head_only,
        );
        return;
    };
    let Ok(metadata) = file.metadata() else {
        response(
            stream,
            "404 Not Found",
            "text/plain; charset=utf-8",
            b"Not found",
            head_only,
        );
        return;
    };
    let headers = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n",
        content_type(path),
        metadata.len(),
    );
    let _ = stream.write_all(headers.as_bytes());
    if !head_only {
        // 图片、音频和视频按流转发，避免 Rust 进程一次性持有完整媒体文件。
        let _ = std::io::copy(&mut file, stream);
    }
}

fn requested_file(root: &Path, request_path: &str) -> Option<PathBuf> {
    let decoded = decode_url_path(request_path)?;
    if decoded.contains('\0') {
        return None;
    }
    let mut candidate = root.join(decoded.trim_start_matches('/'));
    if candidate.is_dir() {
        candidate = candidate.join("index.html");
    }
    let canonical = candidate.canonicalize().ok()?;
    canonical.starts_with(root).then_some(canonical)
}

fn handle_connection(mut stream: TcpStream, root: &Path, entry_path: &Path, entry_content: &[u8]) {
    let mut buffer = [0_u8; 16 * 1024];
    let Ok(read) = stream.read(&mut buffer) else {
        return;
    };
    let request = String::from_utf8_lossy(&buffer[..read]);
    let Some(first_line) = request.lines().next() else {
        return;
    };
    let mut fields = first_line.split_whitespace();
    let method = fields.next().unwrap_or_default();
    let raw_path = fields.next().unwrap_or("/");
    let head_only = method == "HEAD";
    if method != "GET" && !head_only {
        response(
            &mut stream,
            "405 Method Not Allowed",
            "text/plain; charset=utf-8",
            b"Method not allowed",
            head_only,
        );
        return;
    }

    let request_path = raw_path.split(['?', '#']).next().unwrap_or("/");
    let entry_name = entry_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();
    let entry_route = format!("/{entry_name}");
    if request_path == "/" || decode_url_path(request_path).as_deref() == Some(entry_route.as_str())
    {
        response(
            &mut stream,
            "200 OK",
            "text/html; charset=utf-8",
            entry_content,
            head_only,
        );
        return;
    }

    let Some(path) = requested_file(root, request_path) else {
        response(
            &mut stream,
            "404 Not Found",
            "text/plain; charset=utf-8",
            b"Not found",
            head_only,
        );
        return;
    };
    response_file(&mut stream, &path, head_only);
}

#[tauri::command]
pub fn allow_preview_asset(path: String, app: AppHandle) -> Result<(), String> {
    let path = PathBuf::from(path)
        .canonicalize()
        .map_err(|error| format!("无法打开媒体文件：{error}"))?;
    if !path.is_file() {
        return Err("媒体预览目标不是文件".to_string());
    }
    app.asset_protocol_scope()
        .allow_file(path)
        .map_err(|error| format!("无法授权媒体预览：{error}"))
}

#[tauri::command]
pub fn start_html_preview(
    window: Window,
    path: String,
    content: String,
    registry: State<'_, PreviewServerRegistry>,
) -> Result<HtmlPreviewSessionDto, String> {
    let entry_path = PathBuf::from(path)
        .canonicalize()
        .map_err(|error| format!("无法打开 HTML 文件：{error}"))?;
    if !entry_path.is_file() {
        return Err("HTML 预览目标不是文件".to_string());
    }
    let root = entry_path
        .parent()
        .ok_or("无法确定 HTML 文件目录")?
        .canonicalize()
        .map_err(|error| format!("无法读取 HTML 文件目录：{error}"))?;
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("无法启动 HTML 预览服务：{error}"))?;
    let address = listener
        .local_addr()
        .map_err(|error| format!("无法读取 HTML 预览地址：{error}"))?;

    let id = uuid::Uuid::new_v4().to_string();
    let (shutdown_sender, shutdown_receiver) = mpsc::channel();
    registry.servers.lock().insert(
        id.clone(),
        PreviewServerHandle {
            owner_window: window.label().to_string(),
            shutdown_sender,
            address,
        },
    );

    // 每个预览使用独立的本地阻塞监听线程；关闭时由 PreviewServerHandle 主动唤醒。
    thread::spawn(move || {
        let entry_content = content.into_bytes();
        while let Ok((stream, _)) = listener.accept() {
            if shutdown_receiver.try_recv().is_ok() {
                break;
            }
            handle_connection(stream, &root, &entry_path, &entry_content);
        }
    });

    Ok(HtmlPreviewSessionDto {
        id,
        url: format!("http://{address}/"),
    })
}

#[tauri::command]
pub fn stop_html_preview(preview_id: String, registry: State<'_, PreviewServerRegistry>) {
    if let Some(server) = registry.servers.lock().remove(&preview_id) {
        server.shutdown();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TemporaryPreviewRoot(PathBuf);

    impl Drop for TemporaryPreviewRoot {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn preview_request(
        root: &Path,
        entry_path: &Path,
        entry_content: &[u8],
        route: &str,
    ) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server");
        let address = listener.local_addr().expect("read test address");
        let root = root.to_path_buf();
        let entry_path = entry_path.to_path_buf();
        let entry_content = entry_content.to_vec();
        let server = thread::spawn(move || {
            let (stream, _) = listener.accept().expect("accept test request");
            handle_connection(stream, &root, &entry_path, &entry_content);
        });
        let mut client = TcpStream::connect(address).expect("connect test server");
        client
            .write_all(format!("GET {route} HTTP/1.1\r\nHost: localhost\r\n\r\n").as_bytes())
            .expect("write test request");
        let mut result = String::new();
        client
            .read_to_string(&mut result)
            .expect("read test response");
        server.join().expect("join test server");
        result
    }

    #[test]
    fn decodes_url_paths_without_allowing_invalid_sequences() {
        assert_eq!(
            decode_url_path("/image%20one.png").as_deref(),
            Some("/image one.png")
        );
        assert_eq!(decode_url_path("/%GG"), None);
    }

    #[test]
    fn maps_preview_asset_content_types() {
        assert_eq!(content_type(Path::new("movie.mp4")), "video/mp4");
        assert_eq!(
            content_type(Path::new("style.css")),
            "text/css; charset=utf-8"
        );
    }

    #[test]
    fn shutdown_wakes_a_blocking_preview_listener() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind preview listener");
        let address = listener
            .local_addr()
            .expect("read preview listener address");
        let (shutdown_sender, shutdown_receiver) = mpsc::channel();
        let server = thread::spawn(move || {
            listener.accept().expect("accept shutdown wakeup");
            shutdown_receiver.try_recv().is_ok()
        });

        PreviewServerHandle {
            owner_window: "test".to_string(),
            shutdown_sender,
            address,
        }
        .shutdown();

        assert!(server.join().expect("join preview listener"));
    }

    #[test]
    fn serves_draft_html_and_relative_assets() {
        let root = TemporaryPreviewRoot(
            std::env::temp_dir().join(format!("berth-preview-{}", uuid::Uuid::new_v4())),
        );
        fs::create_dir_all(&root.0).expect("create preview directory");
        let entry_path = root.0.join("index.html");
        fs::write(&entry_path, "saved").expect("write entry file");
        fs::write(root.0.join("style.css"), "body { color: red; }").expect("write asset");
        let canonical_root = root.0.canonicalize().expect("canonical root");
        let canonical_entry = entry_path.canonicalize().expect("canonical entry");

        let document = preview_request(&canonical_root, &canonical_entry, b"draft", "/");
        let stylesheet = preview_request(&canonical_root, &canonical_entry, b"draft", "/style.css");

        assert!(document.ends_with("draft"));
        assert!(stylesheet.contains("Content-Type: text/css; charset=utf-8"));
        assert!(stylesheet.ends_with("body { color: red; }"));
    }
}
