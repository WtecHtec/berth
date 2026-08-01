use parking_lot::Mutex;
use serde::Serialize;
use std::{
    collections::HashMap,
    fs::File,
    io::{Read, Write},
    os::{
        fd::{AsRawFd, FromRawFd},
        unix::process::CommandExt,
    },
    process::{Child, Command},
    ptr,
    sync::Arc,
    thread,
};
use tauri::{ipc::Channel, State, Window};
use uuid::Uuid;

const MAX_TERMINAL_PROCESSES: usize = 16;

struct TerminalProcess {
    owner_window: String,
    writer: File,
    child: Child,
}

#[derive(Default)]
pub struct TerminalRegistry {
    processes: Arc<Mutex<HashMap<String, TerminalProcess>>>,
}

fn terminate_processes(processes: impl IntoIterator<Item = TerminalProcess>) {
    for mut terminal in processes {
        let _ = terminal.child.kill();
        let _ = terminal.child.wait();
    }
}

impl TerminalRegistry {
    /** Releases PTYs even when a native window closes before React cleanup runs. */
    pub fn terminate_window(&self, window_label: &str) {
        let owned_processes = {
            let mut processes = self.processes.lock();
            let ids = processes
                .iter()
                .filter(|(_, terminal)| terminal.owner_window == window_label)
                .map(|(id, _)| id.clone())
                .collect::<Vec<_>>();
            ids.into_iter()
                .filter_map(|id| processes.remove(&id))
                .collect::<Vec<_>>()
        };
        terminate_processes(owned_processes);
    }
}

impl Drop for TerminalRegistry {
    fn drop(&mut self) {
        // Tauri may close the window while PTY reader threads are still alive.
        // Drain ownership first, then terminate outside the registry lock.
        let processes = std::mem::take(&mut *self.processes.lock());
        terminate_processes(processes.into_values());
    }
}

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum TerminalEvent {
    Data { data: Vec<u8> },
    Exit { code: Option<i32> },
}

fn resolve_cwd(path: &str) -> std::path::PathBuf {
    if path == "~" {
        if let Some(home) = std::env::var_os("HOME") {
            return std::path::PathBuf::from(home);
        }
    }
    if let Some(suffix) = path.strip_prefix("~/") {
        if let Some(home) = std::env::var_os("HOME") {
            return std::path::PathBuf::from(home).join(suffix);
        }
    }
    std::path::PathBuf::from(path)
}

/**
 * Creates a native POSIX pseudo-terminal. The PTY adapter owns process details;
 * callers only exchange byte streams through the application boundary.
 */
#[tauri::command]
pub fn spawn_terminal(
    window: Window,
    cwd: String,
    channel: Channel<TerminalEvent>,
    registry: State<'_, TerminalRegistry>,
) -> Result<String, String> {
    let owner_window = window.label().to_string();
    let active_in_window = registry
        .processes
        .lock()
        .values()
        .filter(|terminal| terminal.owner_window == owner_window)
        .count();
    if active_in_window >= MAX_TERMINAL_PROCESSES {
        return Err(format!(
            "单个窗口最多同时运行 {MAX_TERMINAL_PROCESSES} 个终端，请先关闭不再使用的终端"
        ));
    }

    let mut master_fd = -1;
    let mut slave_fd = -1;
    let open_result = unsafe {
        libc::openpty(
            &mut master_fd,
            &mut slave_fd,
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
        )
    };
    if open_result != 0 {
        return Err(format!(
            "无法创建伪终端：{}",
            std::io::Error::last_os_error()
        ));
    }

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut command = Command::new(&shell);
    let shell_name = std::path::Path::new(&shell)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("zsh");
    // macOS Terminal launches the user's shell as an interactive login shell.
    // Prefixing argv[0] with '-' preserves the same startup-file and PATH behavior,
    // so commands installed through .zprofile/.zshrc are available inside Berth.
    command.arg0(format!("-{shell_name}"));
    command.current_dir(resolve_cwd(&cwd));
    // npm injects this variable while running `tauri dev`; NVM deliberately
    // refuses to initialize when it is present. A terminal must inherit the
    // user's login configuration, not the package manager that launched Berth.
    command.env_remove("npm_config_prefix");
    command.env_remove("NPM_CONFIG_PREFIX");
    command.env("SHELL", &shell);
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");

    // SAFETY: `pre_exec` runs after fork and before exec. Only async-signal-safe
    // libc calls are used to attach the slave side as the controlling terminal.
    unsafe {
        command.pre_exec(move || {
            if libc::setsid() == -1 {
                return Err(std::io::Error::last_os_error());
            }
            if libc::ioctl(slave_fd, libc::TIOCSCTTY.into(), 0) == -1 {
                return Err(std::io::Error::last_os_error());
            }
            for target in [libc::STDIN_FILENO, libc::STDOUT_FILENO, libc::STDERR_FILENO] {
                if libc::dup2(slave_fd, target) == -1 {
                    return Err(std::io::Error::last_os_error());
                }
            }
            libc::close(master_fd);
            if slave_fd > libc::STDERR_FILENO {
                libc::close(slave_fd);
            }
            Ok(())
        });
    }

    let child = command.spawn().map_err(|error| {
        unsafe {
            libc::close(master_fd);
            libc::close(slave_fd);
        }
        format!("无法启动 shell：{error}")
    })?;
    unsafe { libc::close(slave_fd) };

    let writer = unsafe { File::from_raw_fd(master_fd) };
    let mut reader = writer
        .try_clone()
        .map_err(|error| format!("无法克隆终端句柄：{error}"))?;
    let terminal_id = Uuid::new_v4().to_string();

    registry.processes.lock().insert(
        terminal_id.clone(),
        TerminalProcess {
            owner_window,
            writer,
            child,
        },
    );

    let process_registry = Arc::clone(&registry.processes);
    let reader_terminal_id = terminal_id.clone();
    thread::spawn(move || {
        let mut buffer = vec![0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    if channel
                        .send(TerminalEvent::Data {
                            data: buffer[..count].to_vec(),
                        })
                        .is_err()
                    {
                        break;
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(_) => break,
            }
        }

        // Reap naturally exited shells immediately. Killing is harmless if the
        // child has already exited and prevents a broken PTY reader from leaving
        // a live process behind.
        drop(reader);
        let terminal = process_registry.lock().remove(&reader_terminal_id);
        let code = terminal.and_then(|mut terminal| {
            let _ = terminal.child.kill();
            terminal.child.wait().ok().and_then(|status| status.code())
        });
        let _ = channel.send(TerminalEvent::Exit { code });
    });

    Ok(terminal_id)
}

#[tauri::command]
pub fn write_to_terminal(
    terminal_id: String,
    data: Vec<u8>,
    registry: State<'_, TerminalRegistry>,
) -> Result<(), String> {
    let mut processes = registry.processes.lock();
    let terminal = processes.get_mut(&terminal_id).ok_or("终端不存在")?;
    terminal
        .writer
        .write_all(&data)
        .map_err(|error| format!("终端写入失败：{error}"))
}

#[tauri::command]
pub fn resize_terminal(
    terminal_id: String,
    rows: u16,
    cols: u16,
    registry: State<'_, TerminalRegistry>,
) -> Result<(), String> {
    let processes = registry.processes.lock();
    let terminal = processes.get(&terminal_id).ok_or("终端不存在")?;
    let size = libc::winsize {
        ws_row: rows,
        ws_col: cols,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    let result = unsafe { libc::ioctl(terminal.writer.as_raw_fd(), libc::TIOCSWINSZ, &size) };
    if result == -1 {
        return Err(format!(
            "终端 resize 失败：{}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn kill_terminal(
    terminal_id: String,
    registry: State<'_, TerminalRegistry>,
) -> Result<(), String> {
    let Some(mut terminal) = registry.processes.lock().remove(&terminal_id) else {
        // Cleanup is intentionally idempotent: a naturally exited shell may
        // already have been reaped by its PTY reader thread.
        return Ok(());
    };
    terminal
        .child
        .kill()
        .map_err(|error| format!("无法结束终端进程：{error}"))?;
    let _ = terminal.child.wait();
    Ok(())
}
