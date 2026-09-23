use serde::{Deserialize, Serialize};
use std::{env, fs, io, path::PathBuf};
use tauri::{Manager, PhysicalSize, Size, WebviewWindow, Window, WindowEvent};

const DEFAULT_SERVER_URL: &str = "wss://darkenlight.net/ws";
const SERVER_CONFIG_FILE: &str = "config";
const LEGACY_SERVER_CONFIG_FILE: &str = "server-config.json";
const MIN_WINDOW_WIDTH: u32 = 1024;
const MIN_WINDOW_HEIGHT: u32 = 640;

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowState {
    width: u32,
    height: u32,
    maximized: bool,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerConfig {
    server_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    window: Option<WindowState>,
}

fn server_config_path() -> Result<PathBuf, String> {
    let executable_path = env::current_exe()
        .map_err(|error| format!("Cannot locate the Darkenlight executable: {error}"))?;

    executable_path
        .parent()
        .map(|directory| directory.join(SERVER_CONFIG_FILE))
        .ok_or_else(|| "Cannot locate the Darkenlight installation directory.".to_string())
}

fn write_server_config(config_path: &PathBuf, config: &ServerConfig) -> Result<(), String> {
    let contents = serde_json::to_string_pretty(config)
        .map_err(|error| format!("Cannot serialize server configuration: {error}"))?;
    fs::write(config_path, format!("{contents}\n"))
        .map_err(|error| format!("Cannot write {}: {error}", config_path.display()))
}

fn load_server_config() -> Result<ServerConfig, String> {
    let config_path = server_config_path()?;

    match fs::read_to_string(&config_path) {
        Ok(contents) => serde_json::from_str(&contents)
            .map_err(|error| format!("Cannot read {}: {error}", config_path.display())),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            let legacy_config_path = config_path.with_file_name(LEGACY_SERVER_CONFIG_FILE);
            if legacy_config_path.exists() {
                fs::rename(&legacy_config_path, &config_path).map_err(|error| {
                    format!(
                        "Cannot rename {} to {}: {error}",
                        legacy_config_path.display(),
                        config_path.display()
                    )
                })?;
                return load_server_config();
            }

            let config = ServerConfig {
                server_url: DEFAULT_SERVER_URL.to_string(),
                window: None,
            };
            write_server_config(&config_path, &config)?;
            Ok(config)
        }
        Err(error) => Err(format!("Cannot read {}: {error}", config_path.display())),
    }
}

fn validate_server_url(server_url: &str) -> Result<(), String> {
    if server_url.starts_with("ws://") || server_url.starts_with("wss://") {
        return Ok(());
    }

    Err("serverUrl in config must start with ws:// or wss://.".to_string())
}

#[tauri::command]
fn load_server_url() -> Result<String, String> {
    let config = load_server_config()?;
    validate_server_url(&config.server_url)?;
    Ok(config.server_url)
}

fn restore_window_state(app: &tauri::App) -> Result<(), String> {
    let Some(window_state) = load_server_config()?.window else {
        return Ok(());
    };
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    if window_state.maximized {
        window
            .maximize()
            .map_err(|error| format!("Cannot maximize window: {error}"))?;
        return Ok(());
    }

    let width = window_state.width.max(MIN_WINDOW_WIDTH);
    let height = window_state.height.max(MIN_WINDOW_HEIGHT);
    window
        .set_size(Size::Physical(PhysicalSize::new(width, height)))
        .map_err(|error| format!("Cannot restore window size: {error}"))
}

fn save_window_state(window: &Window) -> Result<(), String> {
    let mut config = load_server_config()?;
    let size = window
        .outer_size()
        .map_err(|error| format!("Cannot get window size: {error}"))?;
    let maximized = window
        .is_maximized()
        .map_err(|error| format!("Cannot get window state: {error}"))?;
    config.window = Some(WindowState {
        width: size.width,
        height: size.height,
        maximized,
    });
    write_server_config(&server_config_path()?, &config)
}

#[tauri::command]
fn set_fullscreen(window: WebviewWindow, fullscreen: bool) -> Result<(), String> {
    window
        .set_fullscreen(fullscreen)
        .map_err(|error| format!("Cannot change fullscreen mode: {error}"))
}

#[tauri::command]
fn toggle_fullscreen(window: WebviewWindow) -> Result<(), String> {
    let fullscreen = window
        .is_fullscreen()
        .map_err(|error| format!("Cannot get fullscreen state: {error}"))?;
    window
        .set_fullscreen(!fullscreen)
        .map_err(|error| format!("Cannot change fullscreen mode: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_server_url,
            set_fullscreen,
            toggle_fullscreen
        ])
        .setup(|app| {
            restore_window_state(app)?;
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                if let Err(error) = save_window_state(window) {
                    eprintln!("Cannot save Darkenlight window state: {error}");
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
