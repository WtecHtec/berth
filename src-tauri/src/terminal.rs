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
use tauri::{ipc::Channel, State};
use uuid::Uuid;

struct TerminalProcess {
    writer: File,
    child: Child,
}

#[derive(Default)]
pub struct TerminalRegistry {
    processes: Arc<Mutex<HashMap<String, TerminalProcess>>>,
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
    cwd: String,
    channel: Channel<TerminalEvent>,
    registry: State<'_, TerminalRegistry>,
) -> Result<String, String> {
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

    registry
        .processes
        .lock()
        .insert(terminal_id.clone(), TerminalProcess { writer, child });

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
        let _ = channel.send(TerminalEvent::Exit { code: None });
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
    let mut terminal = registry
        .processes
        .lock()
        .remove(&terminal_id)
        .ok_or("终端不存在")?;
    terminal
        .child
        .kill()
        .map_err(|error| format!("无法结束终端进程：{error}"))?;
    let _ = terminal.child.wait();
    Ok(())
}
