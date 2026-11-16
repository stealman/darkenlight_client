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

fn save_slot_path(app: &tauri::AppHandle, slot: &str) -> Result<PathBuf, String> {
    if slot.is_empty()
        || slot.len() > 64
        || !slot
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
    {
        return Err("Invalid save slot.".into());
    }
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("saves");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join(format!("{slot}.json")))
}

#[tauri::command]
fn load_game_save(app: tauri::AppHandle, slot: String) -> Result<Option<String>, String> {
    let path = save_slot_path(&app, &slot)?;
    match fs::read_to_string(path) {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn write_game_save(app: tauri::AppHandle, slot: String, contents: String) -> Result<(), String> {
    use std::io::Write;
    let path = save_slot_path(&app, &slot)?;
    let temporary = path.with_extension("json.tmp");
    let mut file = fs::File::create(&temporary).map_err(|error| error.to_string())?;
    file.write_all(contents.as_bytes())
        .map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    drop(file);
    fs::rename(&temporary, &path).map_err(|error| error.to_string())
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CharacterProfile {
    id: String,
    name: String,
    gm: bool,
    class_key: String,
    created_at: u64,
}

#[tauri::command]
fn list_character_profiles(app: tauri::AppHandle) -> Result<Vec<CharacterProfile>, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("profiles");
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut profiles = Vec::new();
    for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let profile = serde_json::from_str::<CharacterProfile>(
            &fs::read_to_string(path).map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())?;
        profiles.push(profile);
    }
    Ok(profiles)
}

#[tauri::command]
fn write_character_profile(app: tauri::AppHandle, profile: CharacterProfile) -> Result<(), String> {
    use std::io::Write;
    save_slot_path(&app, &profile.id)?;
    if !profile.id.starts_with("char-")
        || profile.gm
        || profile.name.trim().chars().count() < 3
        || profile.name.chars().count() > 40
        || !["FIGHTER", "MYSTIC"].contains(&profile.class_key.as_str())
    {
        return Err("Invalid local character profile.".into());
    }
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("profiles");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(directory.join(format!("{}.json", profile.id)))
        .map_err(|error| error.to_string())?;
    file.write_all(
        serde_json::to_string(&profile)
            .map_err(|error| error.to_string())?
            .as_bytes(),
    )
    .map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())
}

#[tauri::command]
fn runtime_smoke_test_enabled() -> bool {
    env::args().any(|value| value == "--runtime-smoke-test")
}

fn remove_character_files(save_path: &std::path::Path, profile_path: &std::path::Path) -> Result<(), String> {
    // Remove the save first so a filesystem error keeps the profile visible for retry.
    for path in [save_path.with_extension("json.tmp"), save_path.to_path_buf(), profile_path.to_path_buf()] {
        match fs::remove_file(path) {
            Ok(()) => (),
            Err(error) if error.kind() == io::ErrorKind::NotFound => (),
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(())
}

#[tauri::command]
fn delete_character_profile(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let save_path = save_slot_path(&app, &id)?;
    if !id.starts_with("char-") || id.len() <= 5 {
        return Err("Invalid local character profile ID.".into());
    }
    let profile_path = app.path().app_data_dir().map_err(|error| error.to_string())?
        .join("profiles").join(format!("{id}.json"));
    remove_character_files(&save_path, &profile_path)
}

#[cfg(test)]
mod character_deletion_tests {
    use super::*;

    #[test]
    fn removes_only_selected_character_and_allows_retry_without_a_save() {
        let directory = env::temp_dir().join(format!("darkenlight-delete-{}-{}", std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir_all(&directory).unwrap();
        let save = directory.join("char-one-save.json");
        let profile = directory.join("char-one-profile.json");
        let other = directory.join("char-two-save.json");
        for path in [&save, &profile, &save.with_extension("json.tmp"), &other] {
            fs::write(path, "test").unwrap();
        }
        remove_character_files(&save, &profile).unwrap();
        assert!(!save.exists());
        assert!(!save.with_extension("json.tmp").exists());
        assert!(!profile.exists());
        assert_eq!(fs::read_to_string(&other).unwrap(), "test");
        fs::write(&profile, "profile without save").unwrap();
        remove_character_files(&save, &profile).unwrap();
        remove_character_files(&save, &profile).unwrap();
        fs::remove_file(other).unwrap();
        fs::remove_dir(directory).unwrap();
    }
}

#[tauri::command]
fn finish_runtime_smoke_test(
    app: tauri::AppHandle,
    success: bool,
    report: String,
) -> Result<(), String> {
    if !runtime_smoke_test_enabled() {
        return Err("Runtime test mode is not enabled.".into());
    }
    let arguments: Vec<String> = env::args().collect();
    let index = arguments
        .iter()
        .position(|value| value == "--runtime-test-report")
        .ok_or("Missing runtime test report path.")?;
    let path = arguments
        .get(index + 1)
        .ok_or("Missing runtime test report path.")?;
    fs::write(path, report).map_err(|error| error.to_string())?;
    app.exit(if success { 0 } else { 1 });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_server_url,
            load_game_save,
            write_game_save,
            list_character_profiles,
            write_character_profile,
            delete_character_profile,
            runtime_smoke_test_enabled,
            finish_runtime_smoke_test,
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
