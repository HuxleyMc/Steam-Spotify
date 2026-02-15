use serde::{Deserialize, Serialize};
use std::fs::{create_dir_all, read_to_string, write};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
struct SyncState {
    child: Mutex<Option<Child>>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncSettings {
    client_id: String,
    client_secret: String,
    steam_username: String,
    steam_password: String,
    not_playing: String,
}

#[derive(Serialize)]
struct SyncStatus {
    running: bool,
}

#[derive(Clone, Serialize)]
struct LogPayload {
    stream: String,
    line: String,
}

fn is_sync_running(state: &SyncState) -> Result<bool, String> {
    let mut guard = state
        .child
        .lock()
        .map_err(|_| "Failed to lock process state".to_string())?;

    if let Some(child) = guard.as_mut() {
        match child.try_wait() {
            Ok(Some(_)) => {
                *guard = None;
                Ok(false)
            }
            Ok(None) => Ok(true),
            Err(err) => Err(format!("Failed to inspect sync process: {err}")),
        }
    } else {
        Ok(false)
    }
}

fn is_project_root(path: &Path) -> bool {
    path.join("package.json").exists() && path.join("src").join("index.ts").exists()
}

fn find_root_from_candidate(candidate: PathBuf) -> Option<PathBuf> {
    for ancestor in candidate.ancestors() {
        if is_project_root(ancestor) {
            return Some(ancestor.to_path_buf());
        }
    }

    None
}

fn project_root(app_handle: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(path) = std::env::var("STEAM_SPOTIFY_ROOT") {
        let env_path = PathBuf::from(path);
        if is_project_root(&env_path) {
            return Ok(env_path);
        }
    }

    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(path) = std::env::current_dir() {
        candidates.push(path);
    }

    if let Ok(path) = std::env::current_exe() {
        if let Some(parent) = path.parent() {
            candidates.push(parent.to_path_buf());
        }
    }

    if let Ok(path) = app_handle.path().resource_dir() {
        candidates.push(path);
    }

    for candidate in candidates {
        if let Some(root) = find_root_from_candidate(candidate) {
            return Ok(root);
        }
    }

    Err("Could not locate project root. Set STEAM_SPOTIFY_ROOT to your repo path.".to_string())
}

fn settings_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let base = app_handle
        .path()
        .app_config_dir()
        .map_err(|err| format!("Could not resolve app config directory: {err}"))?;

    create_dir_all(&base).map_err(|err| format!("Could not create config directory: {err}"))?;

    Ok(base.join("settings.json"))
}

fn emit_line(app_handle: &AppHandle, stream: &str, line: String) {
    let payload = LogPayload {
        stream: stream.to_string(),
        line,
    };
    let _ = app_handle.emit("sync-log", payload);
}

fn spawn_log_reader(
    app_handle: AppHandle,
    stream: &'static str,
    pipe: impl std::io::Read + Send + 'static,
) {
    std::thread::spawn(move || {
        let reader = BufReader::new(pipe);

        for line in reader.lines() {
            match line {
                Ok(content) => emit_line(&app_handle, stream, content),
                Err(err) => {
                    emit_line(
                        &app_handle,
                        "ui",
                        format!("Failed reading process output: {err}"),
                    );
                    break;
                }
            }
        }
    });
}

#[tauri::command]
fn get_sync_status(state: State<'_, SyncState>) -> Result<SyncStatus, String> {
    let running = is_sync_running(&state)?;

    Ok(SyncStatus { running })
}

#[tauri::command]
fn load_settings(app_handle: AppHandle) -> Result<Option<SyncSettings>, String> {
    let path = settings_path(&app_handle)?;

    if !path.exists() {
        return Ok(None);
    }

    let content = read_to_string(path).map_err(|err| format!("Failed to read settings: {err}"))?;
    let settings = serde_json::from_str::<SyncSettings>(&content)
        .map_err(|err| format!("Failed to parse settings: {err}"))?;

    Ok(Some(settings))
}

#[tauri::command]
fn save_settings(app_handle: AppHandle, settings: SyncSettings) -> Result<(), String> {
    let path = settings_path(&app_handle)?;
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|err| format!("Failed to encode settings: {err}"))?;

    write(path, content).map_err(|err| format!("Failed to save settings: {err}"))
}

#[tauri::command]
fn start_sync(
    app_handle: AppHandle,
    state: State<'_, SyncState>,
    settings: SyncSettings,
) -> Result<(), String> {
    if settings.client_id.is_empty()
        || settings.client_secret.is_empty()
        || settings.steam_username.is_empty()
        || settings.steam_password.is_empty()
    {
        return Err("Missing required credentials".to_string());
    }

    let mut guard = state
        .child
        .lock()
        .map_err(|_| "Failed to lock process state".to_string())?;

    if let Some(child) = guard.as_mut() {
        match child.try_wait() {
            Ok(Some(_)) => {
                *guard = None;
            }
            Ok(None) => return Err("Sync is already running".to_string()),
            Err(err) => return Err(format!("Failed to inspect sync process: {err}")),
        }
    }

    save_settings(app_handle.clone(), settings.clone())?;

    let root = project_root(&app_handle)?;

    emit_line(
        &app_handle,
        "ui",
        format!("Using project root: {}", root.display()),
    );

    let mut child = Command::new("bun")
        .arg("run")
        .arg("start")
        .current_dir(root)
        .env("CLIENTID", settings.client_id)
        .env("CLIENTSECRET", settings.client_secret)
        .env("STEAMUSERNAME", settings.steam_username)
        .env("STEAMPASSWORD", settings.steam_password)
        .env("NOTPLAYING", settings.not_playing)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("Failed to start sync process. Ensure Bun is installed. {err}"))?;

    emit_line(&app_handle, "ui", "Sync process started".to_string());

    if let Some(stdout) = child.stdout.take() {
        spawn_log_reader(app_handle.clone(), "stdout", stdout);
    }

    if let Some(stderr) = child.stderr.take() {
        spawn_log_reader(app_handle, "stderr", stderr);
    }

    *guard = Some(child);
    Ok(())
}

#[tauri::command]
fn stop_sync(state: State<'_, SyncState>) -> Result<(), String> {
    let mut guard = state
        .child
        .lock()
        .map_err(|_| "Failed to lock process state".to_string())?;

    if let Some(child) = guard.as_mut() {
        child
            .kill()
            .map_err(|err| format!("Failed to stop sync process: {err}"))?;
    }

    *guard = None;
    Ok(())
}

#[tauri::command]
fn open_spotify_login(state: State<'_, SyncState>) -> Result<(), String> {
    if !is_sync_running(&state)? {
        return Err(
            "Sync is not running yet. Click Start Sync first, then open Spotify login.".to_string(),
        );
    }

    let url = "http://127.0.0.1:8888/login";

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|err| format!("Failed to open browser: {err}"))?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .arg("/C")
            .arg("start")
            .arg(url)
            .spawn()
            .map_err(|err| format!("Failed to open browser: {err}"))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|err| format!("Failed to open browser: {err}"))?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SyncState::default())
        .invoke_handler(tauri::generate_handler![
            get_sync_status,
            load_settings,
            save_settings,
            start_sync,
            stop_sync,
            open_spotify_login
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}
