use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
struct SyncState {
    child: Mutex<Option<Child>>,
}

#[derive(Deserialize)]
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

fn project_root(app_handle: &AppHandle) -> PathBuf {
    if let Ok(path) = std::env::var("STEAM_SPOTIFY_ROOT") {
        return PathBuf::from(path);
    }

    if let Ok(path) = std::env::current_dir() {
        return path;
    }

    app_handle
        .path()
        .resource_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
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
    let guard = state
        .child
        .lock()
        .map_err(|_| "Failed to lock process state".to_string())?;
    Ok(SyncStatus {
        running: guard.is_some(),
    })
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

    if guard.is_some() {
        return Err("Sync is already running".to_string());
    }

    let mut child = Command::new("bun")
        .arg("run")
        .arg("start")
        .current_dir(project_root(&app_handle))
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
fn open_spotify_login() -> Result<(), String> {
    let url = "http://localhost:8888/login";

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
