// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod hotkey_manager;
mod profile_manager;
mod window_manager;

use anyhow::Result;
use hotkey_manager::{vk_codes, Hotkey, HotkeyAction, HotkeyManager};
use parking_lot::Mutex;
use profile_manager::{Profile, ProfileManager};
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use window_manager::DofusWindow;

// Application state shared across the app
struct AppState {
    hotkey_manager: Arc<Mutex<HotkeyManager>>,
    profile_manager: Arc<Mutex<ProfileManager>>,
    window_list: Arc<Mutex<Vec<DofusWindow>>>,
    current_profile: Arc<Mutex<Option<Profile>>>,
}

impl AppState {
    fn new() -> Result<Self> {
        Ok(Self {
            hotkey_manager: Arc::new(Mutex::new(HotkeyManager::new())),
            profile_manager: Arc::new(Mutex::new(ProfileManager::new()?)),
            window_list: Arc::new(Mutex::new(Vec::new())),
            current_profile: Arc::new(Mutex::new(None)),
        })
    }
}

// Tauri Commands

/// Scan and detect all Dofus windows
#[tauri::command]
fn detect_windows(state: tauri::State<AppState>) -> Result<Vec<DofusWindow>, String> {
    let windows = window_manager::detect_dofus_windows()
        .map_err(|e| format!("Failed to detect windows: {}", e))?;

    *state.window_list.lock() = windows.clone();

    Ok(windows)
}

/// Focus a specific window by its handle
#[tauri::command]
fn focus_window(handle: isize) -> Result<(), String> {
    window_manager::focus_window(handle)
        .map_err(|e| format!("Failed to focus window: {}", e))
}

/// Update the window order (after drag-and-drop)
#[tauri::command]
fn update_window_order(state: tauri::State<AppState>, order: Vec<String>) -> Result<(), String> {
    let mut profile = state.current_profile.lock();
    if let Some(ref mut p) = *profile {
        p.window_order = order;

        // Auto-save current profile
        state.profile_manager.lock()
            .save_current_profile(p)
            .map_err(|e| format!("Failed to save profile: {}", e))?;
    }
    Ok(())
}

/// Register default hotkeys
#[tauri::command]
fn setup_default_hotkeys(
    state: tauri::State<AppState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let manager = state.hotkey_manager.lock();

    // Unregister all existing hotkeys first
    manager
        .unregister_all()
        .map_err(|e| format!("Failed to unregister hotkeys: {}", e))?;

    // Register Page Down for next window
    manager
        .register_hotkey(Hotkey {
            id: 1,
            modifiers: 0,
            key_code: vk_codes::VK_NEXT,
            action: HotkeyAction::NextWindow,
        })
        .map_err(|e| format!("Failed to register Page Down: {}", e))?;

    // Register Page Up for previous window
    manager
        .register_hotkey(Hotkey {
            id: 2,
            modifiers: 0,
            key_code: vk_codes::VK_PRIOR,
            action: HotkeyAction::PreviousWindow,
        })
        .map_err(|e| format!("Failed to register Page Up: {}", e))?;

    // Register F1-F8 for direct window access
    let f_keys = [
        vk_codes::VK_F1,
        vk_codes::VK_F2,
        vk_codes::VK_F3,
        vk_codes::VK_F4,
        vk_codes::VK_F5,
        vk_codes::VK_F6,
        vk_codes::VK_F7,
        vk_codes::VK_F8,
    ];

    for (index, &key_code) in f_keys.iter().enumerate() {
        manager
            .register_hotkey(Hotkey {
                id: 10 + index as i32,
                modifiers: 0,
                key_code,
                action: HotkeyAction::DirectWindow(index),
            })
            .map_err(|e| format!("Failed to register F{}: {}", index + 1, e))?;
    }

    // Set up the callback for hotkey events
    let window_list = Arc::clone(&state.window_list);
    manager.set_callback(move |action| {
        handle_hotkey_action(action, &window_list, &app_handle);
    });

    // Start listening for hotkeys
    manager
        .start_listening()
        .map_err(|e| format!("Failed to start listening: {}", e))?;

    Ok(())
}

/// Handle hotkey actions
fn handle_hotkey_action(action: HotkeyAction, window_list: &Arc<Mutex<Vec<DofusWindow>>>, app_handle: &AppHandle) {
    let windows = window_list.lock();

    if windows.is_empty() {
        return;
    }

    let target_index = match action {
        HotkeyAction::NextWindow => {
            // Find current focused window and move to next
            // For now, just cycle through
            0 // This would need more logic to track current window
        }
        HotkeyAction::PreviousWindow => {
            // Find current focused window and move to previous
            windows.len() - 1
        }
        HotkeyAction::DirectWindow(index) => {
            if index < windows.len() {
                index
            } else {
                return;
            }
        }
    };

    if let Some(window) = windows.get(target_index) {
        let _ = window_manager::focus_window(window.handle);

        // Emit event to frontend to update UI
        let _ = app_handle.emit_all("window-focused", window.handle);
    }
}

/// Save current profile
#[tauri::command]
fn save_profile(state: tauri::State<AppState>, name: String) -> Result<(), String> {
    let current = state.current_profile.lock();
    if let Some(mut profile) = current.clone() {
        profile.name = name;
        state.profile_manager.lock()
            .save_profile(&profile)
            .map_err(|e| format!("Failed to save profile: {}", e))?;
    }
    Ok(())
}

/// Load a profile
#[tauri::command]
fn load_profile(state: tauri::State<AppState>, name: String) -> Result<Profile, String> {
    let profile = state.profile_manager.lock()
        .load_profile(&name)
        .map_err(|e| format!("Failed to load profile: {}", e))?;

    *state.current_profile.lock() = Some(profile.clone());

    Ok(profile)
}

/// List all profiles
#[tauri::command]
fn list_profiles(state: tauri::State<AppState>) -> Result<Vec<String>, String> {
    state.profile_manager.lock()
        .list_profiles()
        .map_err(|e| format!("Failed to list profiles: {}", e))
}

/// Delete a profile
#[tauri::command]
fn delete_profile(state: tauri::State<AppState>, name: String) -> Result<(), String> {
    state.profile_manager.lock()
        .delete_profile(&name)
        .map_err(|e| format!("Failed to delete profile: {}", e))
}

fn main() {
    // Initialize app state
    let state = AppState::new().expect("Failed to initialize app state");

    // Load current profile if it exists
    if let Ok(Some(profile)) = state.profile_manager.lock().load_current_profile() {
        *state.current_profile.lock() = Some(profile);
    }

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            detect_windows,
            focus_window,
            update_window_order,
            setup_default_hotkeys,
            save_profile,
            load_profile,
            list_profiles,
            delete_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
