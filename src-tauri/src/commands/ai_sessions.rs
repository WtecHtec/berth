use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use serde_json::Value;
use std::{
    env, fs,
    io::{Read, Take},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const MAX_LIMIT_PER_PROVIDER: usize = 50;
const CLAUDE_METADATA_BYTES: u64 = 256 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSessionSummary {
    id: String,
    provider: &'static str,
    root_path: String,
    title: String,
    updated_at: i64,
    branch: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSessionListResponse {
    sessions: Vec<AiSessionSummary>,
    warnings: Vec<String>,
}

fn provider_home(variable: &str, default_directory: &str) -> Option<PathBuf> {
    env::var_os(variable).map(PathBuf::from).or_else(|| {
        env::var_os("HOME")
            .map(PathBuf::from)
            .map(|home| home.join(default_directory))
    })
}

fn encode_claude_project_path(path: &str) -> String {
    path.chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect()
}

fn modified_millis(metadata: &fs::Metadata) -> i64 {
    metadata
        .modified()
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}

fn summarize_text(value: &str, fallback: &str) -> String {
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() || normalized.starts_with('<') {
        return fallback.to_string();
    }
    let mut characters = normalized.chars();
    let title = characters.by_ref().take(58).collect::<String>();
    if characters.next().is_some() {
        format!("{title}…")
    } else {
        title
    }
}

fn user_message_text(value: &Value) -> Option<String> {
    let content = value.get("message")?.get("content")?;
    if let Some(text) = content.as_str() {
        return Some(text.to_string());
    }
    content.as_array().and_then(|items| {
        items.iter().find_map(|item| {
            (item.get("type")?.as_str()? == "text")
                .then(|| item.get("text")?.as_str().map(ToString::to_string))
                .flatten()
        })
    })
}

fn parse_claude_metadata(contents: &str, fallback_id: &str) -> (String, String, Option<String>) {
    let fallback_title = format!("Claude 会话 {}", &fallback_id[..fallback_id.len().min(8)]);
    let mut session_id = fallback_id.to_string();
    let mut title: Option<String> = None;
    let mut branch: Option<String> = None;

    for line in contents.lines() {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if let Some(id) = value.get("sessionId").and_then(Value::as_str) {
            session_id = id.to_string();
        }
        if branch.is_none() {
            branch = value
                .get("gitBranch")
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string);
        }
        let is_user = value.get("type").and_then(Value::as_str) == Some("user");
        let is_meta = value
            .get("isMeta")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        if title.is_none() && is_user && !is_meta {
            if let Some(message) = user_message_text(&value) {
                let candidate = summarize_text(&message, &fallback_title);
                if candidate != fallback_title {
                    title = Some(candidate);
                }
            }
        }
        if title.is_some() && branch.is_some() {
            break;
        }
    }

    (session_id, title.unwrap_or(fallback_title), branch)
}

fn read_limited(path: &Path) -> Result<String, String> {
    let file = fs::File::open(path).map_err(|error| format!("无法读取 Claude 会话：{error}"))?;
    let mut limited: Take<fs::File> = file.take(CLAUDE_METADATA_BYTES);
    let mut contents = Vec::new();
    limited
        .read_to_end(&mut contents)
        .map_err(|error| format!("无法解析 Claude 会话：{error}"))?;
    Ok(String::from_utf8_lossy(&contents).into_owned())
}

fn list_claude_sessions(root: &str, limit: usize) -> Result<Vec<AiSessionSummary>, String> {
    let Some(config_home) = provider_home("CLAUDE_CONFIG_DIR", ".claude") else {
        return Ok(Vec::new());
    };
    let project_directory = config_home
        .join("projects")
        .join(encode_claude_project_path(root));
    if !project_directory.is_dir() {
        return Ok(Vec::new());
    }

    let mut files = fs::read_dir(project_directory)
        .map_err(|error| format!("无法读取 Claude 会话目录：{error}"))?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let is_jsonl = path.extension().and_then(|value| value.to_str()) == Some("jsonl");
            let metadata = is_jsonl.then(|| entry.metadata().ok()).flatten()?;
            metadata
                .is_file()
                .then_some((path, modified_millis(&metadata)))
        })
        .collect::<Vec<_>>();
    files.sort_unstable_by(|left, right| right.1.cmp(&left.1));

    Ok(files
        .into_iter()
        .take(limit)
        .filter_map(|(path, updated_at)| {
            let fallback_id = path.file_stem()?.to_str()?;
            let contents = read_limited(&path).ok()?;
            let (id, title, branch) = parse_claude_metadata(&contents, fallback_id);
            Some(AiSessionSummary {
                id,
                provider: "claude",
                root_path: root.to_string(),
                title,
                updated_at,
                branch,
            })
        })
        .collect())
}

fn query_codex_sessions(
    connection: &Connection,
    root: &str,
    limit: usize,
) -> Result<Vec<AiSessionSummary>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id,
                    COALESCE(NULLIF(name, ''), NULLIF(title, ''), NULLIF(preview, ''),
                             NULLIF(first_user_message, ''), ''),
                    NULLIF(git_branch, ''),
                    COALESCE(NULLIF(recency_at_ms, 0), NULLIF(updated_at_ms, 0), updated_at * 1000)
             FROM threads
             WHERE archived = 0 AND cwd = ?1 AND source IN ('cli', 'vscode')
             ORDER BY COALESCE(NULLIF(recency_at_ms, 0), NULLIF(updated_at_ms, 0), updated_at * 1000) DESC
             LIMIT ?2",
        )
        .map_err(|error| format!("无法查询 Codex 会话索引：{error}"))?;
    let sessions = statement
        .query_map((root, limit as i64), |row| {
            let id: String = row.get(0)?;
            let raw_title: String = row.get(1)?;
            let fallback = format!("Codex 会话 {}", &id[..id.len().min(8)]);
            Ok(AiSessionSummary {
                id,
                provider: "codex",
                root_path: root.to_string(),
                title: summarize_text(&raw_title, &fallback),
                branch: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .map_err(|error| format!("无法读取 Codex 会话索引：{error}"))?
        .filter_map(Result::ok)
        .collect();
    Ok(sessions)
}

fn list_codex_sessions(root: &str, limit: usize) -> Result<Vec<AiSessionSummary>, String> {
    let Some(codex_home) = provider_home("CODEX_HOME", ".codex") else {
        return Ok(Vec::new());
    };
    let database_path = codex_home.join("state_5.sqlite");
    if !database_path.is_file() {
        return Ok(Vec::new());
    }
    let connection = Connection::open_with_flags(
        database_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|error| format!("无法打开 Codex 会话索引：{error}"))?;
    query_codex_sessions(&connection, root, limit)
}

/**
 * Lists only recent metadata for each provider. Claude reads bounded file prefixes;
 * Codex uses its indexed state database, so transcript history never enters Berth.
 */
#[tauri::command]
pub fn list_ai_sessions(roots: Vec<String>, limit_per_provider: usize) -> AiSessionListResponse {
    let limit = limit_per_provider.clamp(1, MAX_LIMIT_PER_PROVIDER);
    let mut sessions = Vec::new();
    let mut warnings = Vec::new();
    for root in roots {
        match list_claude_sessions(&root, limit) {
            Ok(mut found) => sessions.append(&mut found),
            Err(error) => warnings.push(error),
        }
        match list_codex_sessions(&root, limit) {
            Ok(mut found) => sessions.append(&mut found),
            Err(error) => warnings.push(error),
        }
    }
    sessions.sort_unstable_by(|left, right| right.updated_at.cmp(&left.updated_at));
    AiSessionListResponse { sessions, warnings }
}

#[cfg(test)]
mod tests {
    use super::{
        encode_claude_project_path, parse_claude_metadata, query_codex_sessions, summarize_text,
    };
    use rusqlite::Connection;

    #[test]
    fn encodes_claude_project_directories() {
        assert_eq!(
            encode_claude_project_path("/Users/example/Code/Berth"),
            "-Users-example-Code-Berth"
        );
    }

    #[test]
    fn extracts_only_claude_session_metadata() {
        let contents = concat!(
            r#"{"type":"permission-mode","sessionId":"session-1"}"#,
            "\n",
            r#"{"type":"user","sessionId":"session-1","gitBranch":"main","isMeta":false,"message":{"content":"Implement the terminal session list","role":"user"}}"#,
        );
        let (id, title, branch) = parse_claude_metadata(contents, "fallback");
        assert_eq!(id, "session-1");
        assert_eq!(title, "Implement the terminal session list");
        assert_eq!(branch.as_deref(), Some("main"));
    }

    #[test]
    fn limits_titles_without_splitting_unicode() {
        let title = summarize_text(&"会话".repeat(40), "fallback");
        assert!(title.ends_with('…'));
        assert!(title.chars().count() <= 59);
    }

    #[test]
    fn queries_only_recent_codex_metadata_for_one_root() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        connection.execute_batch(
            "CREATE TABLE threads (
                id TEXT PRIMARY KEY, name TEXT, title TEXT, preview TEXT,
                first_user_message TEXT, git_branch TEXT, recency_at_ms INTEGER,
                updated_at_ms INTEGER, updated_at INTEGER, archived INTEGER,
                cwd TEXT, source TEXT
             );
             INSERT INTO threads VALUES
                ('new', '', 'Newest', '', '', 'main', 3000, 3000, 3, 0, '/project', 'cli'),
                ('old', '', 'Older', '', '', NULL, 2000, 2000, 2, 0, '/project', 'cli'),
                ('other', '', 'Other root', '', '', NULL, 4000, 4000, 4, 0, '/other', 'cli'),
                ('exec', '', 'Non interactive', '', '', NULL, 5000, 5000, 5, 0, '/project', 'exec');",
        )
        .expect("schema and fixtures");
        let sessions = query_codex_sessions(&connection, "/project", 1).expect("query");
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].id, "new");
        assert_eq!(sessions[0].title, "Newest");
    }
}
