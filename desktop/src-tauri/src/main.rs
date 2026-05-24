use serde::{Deserialize, Serialize};
use std::fs::{create_dir_all, read_to_string, remove_file, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Clone, Default)]
struct SyncState {
    child: Arc<Mutex<Option<Child>>>,
}

#[derive(Clone, Default)]
struct TrayState {
    menu: Arc<Mutex<Option<TrayMenuItems>>>,
}

#[derive(Clone)]
struct TrayMenuItems {
    status: MenuItem<tauri::Wry>,
    start: MenuItem<tauri::Wry>,
    stop: MenuItem<tauri::Wry>,
    login: MenuItem<tauri::Wry>,
    auto_start: MenuItem<tauri::Wry>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncSettings {
    client_id: String,
    client_secret: String,
    spotify_redirect_uri: Option<String>,
    steam_username: String,
    steam_password: String,
    not_playing: String,
}

#[derive(Serialize)]
struct SyncStatus {
    running: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AutoStartStatus {
    enabled: bool,
    supported: bool,
}

#[derive(Clone, Serialize)]
struct LogPayload {
    stream: String,
    line: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncLifecyclePayload {
    state: String,
    message: String,
    exit_code: Option<i32>,
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

fn has_required_credentials(settings: &SyncSettings) -> bool {
    !settings.client_id.trim().is_empty()
        && !settings.client_secret.trim().is_empty()
        && !settings.steam_username.trim().is_empty()
        && !settings.steam_password.is_empty()
}

fn refresh_tray_menu(app_handle: &AppHandle) {
    let running = app_handle
        .try_state::<SyncState>()
        .and_then(|state| is_sync_running(state.inner()).ok())
        .unwrap_or(false);

    let has_settings = load_settings(app_handle.clone())
        .ok()
        .flatten()
        .map(|settings| has_required_credentials(&settings))
        .unwrap_or(false);

    let auto_start_enabled = get_auto_start_status()
        .map(|status| status.enabled)
        .unwrap_or(false);

    let Some(tray_state) = app_handle.try_state::<TrayState>() else {
        return;
    };

    let Ok(guard) = tray_state.menu.lock() else {
        return;
    };

    let Some(menu_items) = guard.as_ref() else {
        return;
    };

    let status_text = if running {
        "Status: Running"
    } else {
        "Status: Idle"
    };
    let auto_start_text = if auto_start_enabled {
        "Open at Login: On"
    } else {
        "Open at Login: Off"
    };

    let _ = menu_items.status.set_text(status_text);
    let _ = menu_items.start.set_enabled(!running && has_settings);
    let _ = menu_items.stop.set_enabled(running);
    let _ = menu_items.login.set_enabled(running);
    let _ = menu_items.auto_start.set_text(auto_start_text);
}

fn is_project_root(path: &Path) -> bool {
    path.join("package.json").exists() && path.join("src").join("index.ts").exists()
}

const DEFAULT_SPOTIFY_REDIRECT_URI: &str = "http://127.0.0.1:8888/callback";

#[derive(Debug, PartialEq)]
struct LocalRedirect {
    normalized_uri: String,
    origin: String,
}

fn is_loopback_host(host: &str) -> bool {
    matches!(host, "127.0.0.1" | "localhost" | "[::1]")
}

fn parse_local_redirect_uri(uri: &str) -> Result<LocalRedirect, String> {
    let trimmed = uri.trim();
    let without_scheme = trimmed
        .strip_prefix("http://")
        .ok_or_else(|| "Spotify redirect URI must use http://".to_string())?;
    let host_and_path = without_scheme
        .split_once('/')
        .ok_or_else(|| "Spotify redirect URI must include a callback path.".to_string())?;
    let host_and_port = host_and_path.0;
    let path = format!("/{}", host_and_path.1);

    if path == "/" {
        return Err("Spotify redirect URI must include a callback path.".to_string());
    }

    let port = if host_and_port.starts_with('[') {
        let end = host_and_port
            .find(']')
            .ok_or_else(|| "Spotify redirect URI has an invalid IPv6 host.".to_string())?;
        let remainder = &host_and_port[end + 1..];
        if remainder.is_empty() {
            None
        } else {
            Some(
                remainder
                    .strip_prefix(':')
                    .ok_or_else(|| "Spotify redirect URI has an invalid IPv6 host.".to_string())?,
            )
        }
    } else {
        host_and_port.rsplit_once(':').map(|(_, port)| port)
    };

    let host = if host_and_port.starts_with('[') {
        let end = host_and_port
            .find(']')
            .ok_or_else(|| "Spotify redirect URI has an invalid IPv6 host.".to_string())?;
        &host_and_port[..=end]
    } else {
        host_and_port.split(':').next().unwrap_or_default()
    };

    if !is_loopback_host(host) {
        return Err("Spotify redirect URI must use localhost, 127.0.0.1, or [::1].".to_string());
    }

    if let Some(port) = port {
        if port.is_empty() || port.parse::<u16>().is_err() {
            return Err("Spotify redirect URI has an invalid port.".to_string());
        }
    }

    Ok(LocalRedirect {
        normalized_uri: trimmed.to_string(),
        origin: format!("http://{host_and_port}"),
    })
}

fn spotify_redirect(redirect_uri: Option<&str>) -> Result<LocalRedirect, String> {
    let uri = redirect_uri
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_SPOTIFY_REDIRECT_URI);

    parse_local_redirect_uri(uri)
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

fn token_store_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let base = app_handle
        .path()
        .app_config_dir()
        .map_err(|err| format!("Could not resolve app config directory: {err}"))?;

    create_dir_all(&base).map_err(|err| format!("Could not create config directory: {err}"))?;

    Ok(base.join("spotify-tokens.json"))
}

fn write_private_file(path: &Path, content: &str) -> Result<(), String> {
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);

    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }

    let mut file = options
        .open(path)
        .map_err(|err| format!("Failed to open private file: {err}"))?;
    file.write_all(content.as_bytes())
        .map_err(|err| format!("Failed to write private file: {err}"))?;
    file.flush()
        .map_err(|err| format!("Failed to flush private file: {err}"))
}

#[cfg(target_os = "macos")]
fn launch_agent_path() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "Could not resolve HOME for LaunchAgent setup.".to_string())?;

    Ok(home
        .join("Library")
        .join("LaunchAgents")
        .join("com.steamspotify.desktop.plist"))
}

#[cfg(target_os = "macos")]
fn app_bundle_path_from_exe(path: &Path) -> Option<PathBuf> {
    path.ancestors()
        .find(|ancestor| {
            ancestor
                .extension()
                .is_some_and(|extension| extension == "app")
        })
        .map(Path::to_path_buf)
}

#[cfg(target_os = "macos")]
fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(target_os = "macos")]
fn launch_agent_plist(app_path: &Path) -> String {
    let app_path = xml_escape(&app_path.to_string_lossy());

    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.steamspotify.desktop</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>-a</string>
    <string>{app_path}</string>
    <string>--args</string>
    <string>--background</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
"#
    )
}

#[cfg(target_os = "macos")]
fn set_auto_start_enabled(enabled: bool) -> Result<AutoStartStatus, String> {
    let path = launch_agent_path()?;

    if enabled {
        let Some(parent) = path.parent() else {
            return Err("Could not resolve LaunchAgents directory.".to_string());
        };
        create_dir_all(parent)
            .map_err(|err| format!("Could not create LaunchAgents directory: {err}"))?;

        let exe = std::env::current_exe()
            .map_err(|err| format!("Could not resolve current app path: {err}"))?;
        let app_path = app_bundle_path_from_exe(&exe).unwrap_or(exe);
        write_private_file(&path, &launch_agent_plist(&app_path))
            .map_err(|err| format!("Failed to enable open at login: {err}"))?;
    } else if path.exists() {
        remove_file(&path).map_err(|err| format!("Failed to disable open at login: {err}"))?;
    }

    Ok(AutoStartStatus {
        enabled: path.exists(),
        supported: true,
    })
}

#[cfg(target_os = "macos")]
fn get_auto_start_status() -> Result<AutoStartStatus, String> {
    let path = launch_agent_path()?;

    Ok(AutoStartStatus {
        enabled: path.exists(),
        supported: true,
    })
}

#[cfg(not(target_os = "macos"))]
fn set_auto_start_enabled(_enabled: bool) -> Result<AutoStartStatus, String> {
    Ok(AutoStartStatus {
        enabled: false,
        supported: false,
    })
}

#[cfg(not(target_os = "macos"))]
fn get_auto_start_status() -> Result<AutoStartStatus, String> {
    Ok(AutoStartStatus {
        enabled: false,
        supported: false,
    })
}

fn should_start_in_background() -> bool {
    std::env::args().any(|arg| arg == "--background")
}

fn emit_line(app_handle: &AppHandle, stream: &str, line: String) {
    let payload = LogPayload {
        stream: stream.to_string(),
        line,
    };
    let _ = app_handle.emit("sync-log", payload);
}

fn emit_lifecycle(app_handle: &AppHandle, state: &str, message: String, exit_code: Option<i32>) {
    let payload = SyncLifecyclePayload {
        state: state.to_string(),
        message,
        exit_code,
    };
    let _ = app_handle.emit("sync-lifecycle", payload);
    refresh_tray_menu(app_handle);
}

fn spawn_sync_monitor(app_handle: AppHandle, state: SyncState) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(1));

        let mut exited: Option<Option<i32>> = None;
        let mut monitor_error: Option<String> = None;

        {
            let mut guard = match state.child.lock() {
                Ok(guard) => guard,
                Err(_) => {
                    emit_lifecycle(
                        &app_handle,
                        "error",
                        "Failed to lock process state in sync monitor.".to_string(),
                        None,
                    );
                    break;
                }
            };

            if let Some(child) = guard.as_mut() {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        exited = Some(status.code());
                        *guard = None;
                    }
                    Ok(None) => {}
                    Err(err) => {
                        monitor_error = Some(format!("Failed to inspect sync process: {err}"));
                        *guard = None;
                    }
                }
            }
        }

        if let Some(error) = monitor_error {
            emit_line(&app_handle, "ui", error.clone());
            emit_lifecycle(&app_handle, "error", error, None);
            continue;
        }

        if let Some(exit_code) = exited {
            let message = if let Some(code) = exit_code {
                format!("Sync process exited with code {code}.")
            } else {
                "Sync process exited.".to_string()
            };
            emit_line(&app_handle, "ui", message.clone());
            emit_lifecycle(&app_handle, "exited", message, exit_code);
        }
    });
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

fn reveal_main_window(app_handle: &AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn terminate_sync_child(state: &SyncState) {
    let Ok(mut guard) = state.child.lock() else {
        return;
    };

    if let Some(child) = guard.as_mut() {
        let pid = child.id();

        #[cfg(unix)]
        {
            let _ = Command::new("pkill")
                .arg("-TERM")
                .arg("-P")
                .arg(pid.to_string())
                .status();
        }

        let _ = child.kill();
        let _ = child.wait();

        #[cfg(unix)]
        {
            let _ = Command::new("pkill")
                .arg("-KILL")
                .arg("-P")
                .arg(pid.to_string())
                .status();
        }
    }

    *guard = None;
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
    save_settings_to_disk(app_handle, settings, true)
}

fn save_settings_to_disk(
    app_handle: AppHandle,
    settings: SyncSettings,
    refresh_tray: bool,
) -> Result<(), String> {
    let path = settings_path(&app_handle)?;
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|err| format!("Failed to encode settings: {err}"))?;

    write_private_file(&path, &content).map_err(|err| format!("Failed to save settings: {err}"))?;
    if refresh_tray {
        refresh_tray_menu(&app_handle);
    }
    Ok(())
}

fn start_sync_with_settings(
    app_handle: AppHandle,
    state: &SyncState,
    settings: SyncSettings,
) -> Result<(), String> {
    if !has_required_credentials(&settings) {
        return Err("Missing required credentials".to_string());
    }

    emit_lifecycle(
        &app_handle,
        "starting",
        "Starting sync process...".to_string(),
        None,
    );

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

    let validated_redirect = spotify_redirect(settings.spotify_redirect_uri.as_deref())?;
    save_settings_to_disk(app_handle.clone(), settings.clone(), false)?;
    let token_store = token_store_path(&app_handle)?;

    let root = match project_root(&app_handle) {
        Ok(root) => root,
        Err(err) => {
            emit_lifecycle(&app_handle, "error", err.clone(), None);
            return Err(err);
        }
    };

    emit_line(
        &app_handle,
        "ui",
        format!("Using project root: {}", root.display()),
    );

    let SyncSettings {
        client_id,
        client_secret,
        spotify_redirect_uri,
        steam_username,
        steam_password,
        not_playing,
    } = settings;

    let mut command = Command::new("bun");
    command
        .arg("run")
        .arg("src/index.ts")
        .current_dir(root)
        .env("CLIENTID", client_id)
        .env("CLIENTSECRET", client_secret)
        .env("STEAMUSERNAME", steam_username)
        .env("STEAMPASSWORD", steam_password)
        .env("NOTPLAYING", not_playing)
        .env("STEAM_SPOTIFY_TOKEN_STORE_PATH", token_store)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if spotify_redirect_uri
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some()
    {
        command.env("SPOTIFY_REDIRECT_URI", validated_redirect.normalized_uri);
    }

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(err) => {
            let message = format!("Failed to start sync process. Ensure Bun is installed. {err}");
            emit_lifecycle(&app_handle, "error", message.clone(), None);
            return Err(message);
        }
    };

    emit_line(&app_handle, "ui", "Sync process started".to_string());

    if let Some(stdout) = child.stdout.take() {
        spawn_log_reader(app_handle.clone(), "stdout", stdout);
    }

    if let Some(stderr) = child.stderr.take() {
        spawn_log_reader(app_handle.clone(), "stderr", stderr);
    }

    *guard = Some(child);
    drop(guard);
    emit_lifecycle(
        &app_handle,
        "running",
        "Sync process started.".to_string(),
        None,
    );
    Ok(())
}

#[tauri::command]
fn start_sync(
    app_handle: AppHandle,
    state: State<'_, SyncState>,
    settings: SyncSettings,
) -> Result<(), String> {
    start_sync_with_settings(app_handle, state.inner(), settings)
}

fn stop_sync_with_state(app_handle: AppHandle, state: &SyncState) -> Result<(), String> {
    if is_sync_running(state)? {
        emit_lifecycle(
            &app_handle,
            "stopping",
            "Stopping sync process...".to_string(),
            None,
        );
        terminate_sync_child(state);
        emit_line(&app_handle, "ui", "Sync process stopped".to_string());
        emit_lifecycle(
            &app_handle,
            "stopped",
            "Sync process stopped.".to_string(),
            None,
        );
        return Ok(());
    }

    emit_lifecycle(
        &app_handle,
        "idle",
        "Sync process is not running.".to_string(),
        None,
    );
    Ok(())
}

#[tauri::command]
fn stop_sync(app_handle: AppHandle, state: State<'_, SyncState>) -> Result<(), String> {
    stop_sync_with_state(app_handle, state.inner())
}

#[tauri::command]
fn submit_steam_guard_code(
    app_handle: AppHandle,
    state: State<'_, SyncState>,
    code: String,
) -> Result<(), String> {
    emit_line(
        &app_handle,
        "ui",
        "Received Steam Guard code submission request.".to_string(),
    );

    let trimmed = code.trim();
    if trimmed.is_empty() {
        return Err("Steam Guard code cannot be empty.".to_string());
    }

    let mut guard = state
        .child
        .lock()
        .map_err(|_| "Failed to lock process state".to_string())?;

    let Some(child) = guard.as_mut() else {
        return Err("Sync is not running.".to_string());
    };

    match child.try_wait() {
        Ok(Some(_)) => {
            *guard = None;
            return Err("Sync is not running.".to_string());
        }
        Ok(None) => {}
        Err(err) => return Err(format!("Failed to inspect sync process: {err}")),
    }

    let Some(stdin) = child.stdin.as_mut() else {
        return Err("Sync process input is unavailable.".to_string());
    };

    stdin
        .write_all(trimmed.as_bytes())
        .map_err(|err| format!("Failed to send Steam Guard code: {err}"))?;
    stdin
        .write_all(b"\n")
        .map_err(|err| format!("Failed to send Steam Guard code: {err}"))?;
    stdin
        .flush()
        .map_err(|err| format!("Failed to flush Steam Guard code: {err}"))?;

    emit_line(
        &app_handle,
        "ui",
        "Submitted Steam Guard code to sync process.".to_string(),
    );
    Ok(())
}

fn open_spotify_login_with_state(
    state: &SyncState,
    spotify_redirect_uri: Option<String>,
) -> Result<(), String> {
    if !is_sync_running(state)? {
        return Err(
            "Sync is not running yet. Click Start Sync first, then open Spotify login.".to_string(),
        );
    }

    let redirect = spotify_redirect(spotify_redirect_uri.as_deref())?;
    let url = format!("{}/login", redirect.origin);

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(url.as_str())
            .spawn()
            .map_err(|err| format!("Failed to open browser: {err}"))?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .arg("/C")
            .arg("start")
            .arg(url.as_str())
            .spawn()
            .map_err(|err| format!("Failed to open browser: {err}"))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(url.as_str())
            .spawn()
            .map_err(|err| format!("Failed to open browser: {err}"))?;
    }

    Ok(())
}

#[tauri::command]
fn open_spotify_login(
    state: State<'_, SyncState>,
    spotify_redirect_uri: Option<String>,
) -> Result<(), String> {
    open_spotify_login_with_state(state.inner(), spotify_redirect_uri)
}

#[tauri::command]
fn get_auto_start() -> Result<AutoStartStatus, String> {
    get_auto_start_status()
}

#[tauri::command]
fn set_auto_start(app_handle: AppHandle, enabled: bool) -> Result<AutoStartStatus, String> {
    let status = set_auto_start_enabled(enabled)?;
    refresh_tray_menu(&app_handle);
    Ok(status)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SyncState::default())
        .manage(TrayState::default())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let state = app.state::<SyncState>().inner().clone();
            spawn_sync_monitor(app_handle.clone(), state);

            let status_item =
                MenuItem::with_id(app, "status", "Status: Idle", false, None::<&str>)?;
            let start_item =
                MenuItem::with_id(app, "tray_start", "Start Sync", false, None::<&str>)?;
            let stop_item = MenuItem::with_id(app, "tray_stop", "Stop Sync", false, None::<&str>)?;
            let login_item =
                MenuItem::with_id(app, "tray_login", "Open Spotify Login", false, None::<&str>)?;
            let auto_start_item = MenuItem::with_id(
                app,
                "tray_auto_start",
                "Open at Login: Off",
                true,
                None::<&str>,
            )?;
            let show_item =
                MenuItem::with_id(app, "show", "Show Steam Spotify", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let separator_one = PredefinedMenuItem::separator(app)?;
            let separator_two = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(
                app,
                &[
                    &status_item,
                    &separator_one,
                    &start_item,
                    &stop_item,
                    &login_item,
                    &auto_start_item,
                    &separator_two,
                    &show_item,
                    &quit_item,
                ],
            )?;

            let tray_state = app.state::<TrayState>().inner().clone();
            if let Ok(mut guard) = tray_state.menu.lock() {
                *guard = Some(TrayMenuItems {
                    status: status_item,
                    start: start_item,
                    stop: stop_item,
                    login: login_item,
                    auto_start: auto_start_item,
                });
            }

            TrayIconBuilder::new()
                .tooltip("Steam Spotify")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        reveal_main_window(tray.app_handle());
                    }
                })
                .on_menu_event(|app_handle, event| match event.id().as_ref() {
                    "tray_start" => match load_settings(app_handle.clone()) {
                        Ok(Some(settings)) => {
                            let state = app_handle.state::<SyncState>().inner().clone();
                            if let Err(err) =
                                start_sync_with_settings(app_handle.clone(), &state, settings)
                            {
                                emit_line(
                                    app_handle,
                                    "ui",
                                    format!("Failed to start from tray: {err}"),
                                );
                                emit_lifecycle(app_handle, "error", err, None);
                                reveal_main_window(app_handle);
                            }
                        }
                        Ok(None) => {
                            let message =
                                "Saved settings are required before starting from the tray."
                                    .to_string();
                            emit_line(app_handle, "ui", message.clone());
                            emit_lifecycle(app_handle, "error", message, None);
                            reveal_main_window(app_handle);
                        }
                        Err(err) => {
                            emit_line(
                                app_handle,
                                "ui",
                                format!("Failed to load saved settings: {err}"),
                            );
                            emit_lifecycle(app_handle, "error", err, None);
                            reveal_main_window(app_handle);
                        }
                    },
                    "tray_stop" => {
                        let state = app_handle.state::<SyncState>().inner().clone();
                        if let Err(err) = stop_sync_with_state(app_handle.clone(), &state) {
                            emit_line(app_handle, "ui", format!("Failed to stop from tray: {err}"));
                            emit_lifecycle(app_handle, "error", err, None);
                        }
                    }
                    "tray_login" => {
                        let state = app_handle.state::<SyncState>().inner().clone();
                        let redirect_uri = load_settings(app_handle.clone())
                            .ok()
                            .flatten()
                            .and_then(|settings| settings.spotify_redirect_uri);
                        if let Err(err) = open_spotify_login_with_state(&state, redirect_uri) {
                            emit_line(
                                app_handle,
                                "ui",
                                format!("Failed to open Spotify login: {err}"),
                            );
                            emit_lifecycle(app_handle, "error", err, None);
                            reveal_main_window(app_handle);
                        }
                    }
                    "tray_auto_start" => {
                        let currently_enabled = get_auto_start_status()
                            .map(|status| status.enabled)
                            .unwrap_or(false);
                        match set_auto_start_enabled(!currently_enabled) {
                            Ok(status) => {
                                let label = if status.enabled {
                                    "enabled"
                                } else {
                                    "disabled"
                                };
                                emit_line(app_handle, "ui", format!("Open at login {label}."));
                                refresh_tray_menu(app_handle);
                            }
                            Err(err) => {
                                emit_line(
                                    app_handle,
                                    "ui",
                                    format!("Failed to update open at login: {err}"),
                                );
                                emit_lifecycle(app_handle, "error", err, None);
                                reveal_main_window(app_handle);
                            }
                        }
                    }
                    "show" => reveal_main_window(app_handle),
                    "quit" => {
                        let state = app_handle.state::<SyncState>().inner().clone();
                        terminate_sync_child(&state);
                        app_handle.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;
            refresh_tray_menu(&app_handle);

            if should_start_in_background() {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_sync_status,
            load_settings,
            save_settings,
            start_sync,
            stop_sync,
            submit_steam_guard_code,
            open_spotify_login,
            get_auto_start,
            set_auto_start
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}

#[cfg(test)]
mod tests {
    use super::spotify_redirect;

    #[test]
    fn spotify_redirect_defaults_to_loopback_callback() {
        let redirect = spotify_redirect(None).expect("default redirect should parse");

        assert_eq!(redirect.normalized_uri, "http://127.0.0.1:8888/callback");
        assert_eq!(redirect.origin, "http://127.0.0.1:8888");
    }

    #[test]
    fn spotify_redirect_accepts_localhost() {
        let redirect = spotify_redirect(Some("http://localhost:3456/callback"))
            .expect("localhost redirect should parse");

        assert_eq!(redirect.normalized_uri, "http://localhost:3456/callback");
        assert_eq!(redirect.origin, "http://localhost:3456");
    }

    #[test]
    fn spotify_redirect_accepts_ipv6_loopback() {
        let redirect = spotify_redirect(Some("http://[::1]:3456/callback"))
            .expect("IPv6 loopback redirect should parse");

        assert_eq!(redirect.origin, "http://[::1]:3456");
    }

    #[test]
    fn spotify_redirect_rejects_external_hosts() {
        assert!(spotify_redirect(Some("http://example.com:8888/callback")).is_err());
    }

    #[test]
    fn spotify_redirect_rejects_non_http_scheme() {
        assert!(spotify_redirect(Some("https://127.0.0.1:8888/callback")).is_err());
    }

    #[test]
    fn spotify_redirect_rejects_missing_callback_path() {
        assert!(spotify_redirect(Some("http://127.0.0.1:8888")).is_err());
    }
}
