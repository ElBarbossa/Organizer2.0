// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod hotkey_manager;
mod profile_manager;
mod window_manager;

use anyhow::Result;
use hotkey_manager::{vk_codes, Hotkey, HotkeyAction, HotkeyManager};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeyConfig {
    pub id: i32,
    pub modifiers: u32,
    pub key_code: u32,
    pub action: HotkeyAction,
}
use parking_lot::Mutex;
use profile_manager::{Profile, ProfileManager};
use std::sync::Arc;
use tauri::{AppHandle, CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem};
use window_manager::DofusWindow;

// Application state shared across the app
struct AppState {
    hotkey_manager: Arc<Mutex<HotkeyManager>>,
    profile_manager: Arc<Mutex<ProfileManager>>,
    window_list: Arc<Mutex<Vec<DofusWindow>>>,
    current_profile: Arc<Mutex<Option<Profile>>>,
    excluded_windows: Arc<Mutex<Vec<isize>>>, // Window handles excluded from hotkeys
}

impl AppState {
    fn new() -> Result<Self> {
        Ok(Self {
            hotkey_manager: Arc::new(Mutex::new(HotkeyManager::new())),
            profile_manager: Arc::new(Mutex::new(ProfileManager::new()?)),
            window_list: Arc::new(Mutex::new(Vec::new())),
            current_profile: Arc::new(Mutex::new(None)),
            excluded_windows: Arc::new(Mutex::new(Vec::new())),
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
        p.window_order = order.clone();

        // Auto-save current profile
        state.profile_manager.lock()
            .save_current_profile(p)
            .map_err(|e| format!("Failed to save profile: {}", e))?;
    } else {
        // No current profile, create a temporary one with the order
        // This allows hotkeys to work with the applied order even without a saved profile
        let temp_profile = Profile {
            name: "temp".to_string(),
            window_order: order.clone(),
            hotkeys: vec![],
        };
        *profile = Some(temp_profile);
    }

    // Try to reorder taskbar windows (may not work on all Windows versions)
    window_manager::reorder_taskbar_windows(order)
        .map_err(|e| format!("Failed to reorder taskbar: {}", e))?;

    Ok(())
}

/// Update the list of excluded windows (windows that should be skipped by hotkeys)
#[tauri::command]
fn update_excluded_windows(state: tauri::State<AppState>, excluded_handles: Vec<isize>) -> Result<(), String> {
    *state.excluded_windows.lock() = excluded_handles.clone();
    println!("DEBUG: Updated excluded windows: {:?}", excluded_handles);
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
    let excluded_windows = Arc::clone(&state.excluded_windows);
    let current_profile = Arc::clone(&state.current_profile);
    let app_handle_clone = app_handle.clone();
    manager.set_callback(move |action| {
        handle_hotkey_action(action, &window_list, &excluded_windows, &current_profile, &app_handle_clone);
    });

    // Start listening for hotkeys
    manager
        .start_listening()
        .map_err(|e| format!("Failed to start listening: {}", e))?;

    Ok(())
}

/// Register custom hotkeys
#[tauri::command]
fn setup_custom_hotkeys(
    state: tauri::State<AppState>,
    app_handle: AppHandle,
    hotkeys: Vec<Hotkey>,
) -> Result<(), String> {
    let manager = state.hotkey_manager.lock();

    // Unregister all existing hotkeys first
    manager
        .unregister_all()
        .map_err(|e| format!("Failed to unregister hotkeys: {}", e))?;

    // Register custom hotkeys
    for hotkey in hotkeys {
        manager
            .register_hotkey(hotkey)
            .map_err(|e| format!("Failed to register custom hotkey: {}", e))?;
    }

    // Set up the callback for hotkey events
    let window_list = Arc::clone(&state.window_list);
    let excluded_windows = Arc::clone(&state.excluded_windows);
    let current_profile = Arc::clone(&state.current_profile);
    let app_handle_clone = app_handle.clone();
    manager.set_callback(move |action| {
        handle_hotkey_action(action, &window_list, &excluded_windows, &current_profile, &app_handle_clone);
    });

    // Start listening for hotkeys
    manager
        .start_listening()
        .map_err(|e| format!("Failed to start listening: {}", e))?;

    Ok(())
}

// Track current window index for cycling
static mut CURRENT_WINDOW_INDEX: usize = 0;

/// Get the current foreground window handle
fn get_foreground_window() -> Option<isize> {
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0 != 0 {
            Some(hwnd.0 as isize)
        } else {
            None
        }
    }
}

/// Handle hotkey actions
fn handle_hotkey_action(
    action: HotkeyAction,
    window_list: &Arc<Mutex<Vec<DofusWindow>>>,
    excluded_windows: &Arc<Mutex<Vec<isize>>>,
    current_profile: &Arc<Mutex<Option<Profile>>>,
    app_handle: &AppHandle
) {
    let all_windows = window_list.lock();
    let excluded = excluded_windows.lock();
    let profile = current_profile.lock();

    // Filter out excluded windows
    let available_windows: Vec<&DofusWindow> = all_windows.iter()
        .filter(|w| !excluded.contains(&w.handle))
        .collect();

    if available_windows.is_empty() {
        println!("DEBUG: No windows available for hotkey action (all excluded or no windows)");
        return;
    }

    println!("DEBUG: Handling hotkey action {:?} with {} windows ({} total, {} excluded)",
             action, available_windows.len(), all_windows.len(), excluded.len());

    // Get the current foreground window
    let foreground_handle = get_foreground_window();
    println!("DEBUG: Current foreground window handle: {:?}", foreground_handle);

    // Determine target window based on action and profile order
    let target_window = match action {
        HotkeyAction::NextWindow | HotkeyAction::PreviousWindow => {
            if let Some(ref profile) = *profile {
                if !profile.window_order.is_empty() {
                    // Use profile's window order
                    println!("DEBUG: Using profile window order: {:?}", profile.window_order);

                    // Find current position in the order
                    let current_pos = if let Some(fg_handle) = foreground_handle {
                        // Find which window in the order is currently foreground
                        profile.window_order.iter().position(|character_name| {
                            available_windows.iter().any(|w| w.character_name == *character_name && w.handle == fg_handle)
                        })
                    } else {
                        None
                    };

                    println!("DEBUG: Current position in order: {:?}", current_pos);

                    // Calculate next/previous position
                    let order_len = profile.window_order.len();
                    let target_pos = match action {
                        HotkeyAction::NextWindow => {
                            match current_pos {
                                Some(pos) => (pos + 1) % order_len,
                                None => 0, // Start from beginning if no current window found
                            }
                        }
                        HotkeyAction::PreviousWindow => {
                            match current_pos {
                                Some(pos) => if pos == 0 { order_len - 1 } else { pos - 1 },
                                None => order_len - 1, // Start from end if no current window found
                            }
                        }
                        _ => unreachable!(),
                    };

                    println!("DEBUG: Target position in order: {}", target_pos);

                    // Find the window at this position in the order
                    if let Some(target_character) = profile.window_order.get(target_pos) {
                        available_windows.iter().find(|w| w.character_name == *target_character).cloned()
                    } else {
                        None
                    }
                } else {
                    // Fallback to sequential cycling if no order defined
                    println!("DEBUG: No window order defined, using sequential cycling");
                    let current_index = unsafe { CURRENT_WINDOW_INDEX };
                    let target_index = match action {
                        HotkeyAction::NextWindow => (current_index + 1) % available_windows.len(),
                        HotkeyAction::PreviousWindow => {
                            if current_index == 0 {
                                available_windows.len() - 1
                            } else {
                                current_index - 1
                            }
                        }
                        _ => unreachable!(),
                    };
                    unsafe { CURRENT_WINDOW_INDEX = target_index; }
                    available_windows.get(target_index).cloned()
                }
            } else {
                // No profile, use sequential cycling
                println!("DEBUG: No profile loaded, using sequential cycling");
                let current_index = unsafe { CURRENT_WINDOW_INDEX };
                let target_index = match action {
                    HotkeyAction::NextWindow => (current_index + 1) % available_windows.len(),
                    HotkeyAction::PreviousWindow => {
                        if current_index == 0 {
                            available_windows.len() - 1
                        } else {
                            current_index - 1
                        }
                    }
                    _ => unreachable!(),
                };
                unsafe { CURRENT_WINDOW_INDEX = target_index; }
                available_windows.get(target_index).cloned()
            }
        }
        HotkeyAction::DirectWindow(index) => {
            if index < available_windows.len() {
                println!("DEBUG: DirectWindow action - focusing window at index {}", index);
                available_windows.get(index).cloned()
            } else {
                println!("DEBUG: DirectWindow action - index {} out of bounds ({} windows)", index, available_windows.len());
                return;
            }
        }
    };

    if let Some(window) = target_window {
        println!("DEBUG: Focusing window '{}' (handle: {})", window.title, window.handle);
        let result = window_manager::focus_window(window.handle);
        match result {
            Ok(_) => println!("DEBUG: Successfully focused window"),
            Err(e) => println!("DEBUG: Failed to focus window: {}", e),
        }

        // Emit event to frontend to update UI
        let _ = app_handle.emit_all("window-focused", window.handle);
    } else {
        println!("DEBUG: No target window found for action {:?}", action);
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

/// Get the current loaded profile
#[tauri::command]
fn get_current_profile(state: tauri::State<AppState>) -> Result<Option<Profile>, String> {
    let profile = state.current_profile.lock().clone();
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

/// Show and focus the main window
#[tauri::command]
fn show_window(app_handle: AppHandle) -> Result<(), String> {
    let window = app_handle
        .get_window("main")
        .ok_or("Failed to get main window")?;

    window.show().map_err(|e| format!("Failed to show window: {}", e))?;
    window.unminimize().map_err(|e| format!("Failed to unminimize window: {}", e))?;
    window.set_focus().map_err(|e| format!("Failed to focus window: {}", e))?;

    Ok(())
}

/// Send space + paste + enter key sequence to a specific window
#[tauri::command]
fn send_space_paste_enter(handle: isize, with_focus: bool) -> Result<(), String> {
    window_manager::send_space_paste_enter_to_window(handle, with_focus)
        .map_err(|e| format!("Failed to send space + paste + enter: {}", e))
}

fn main() {
    // Initialize app state
    let state = AppState::new().expect("Failed to initialize app state");

    // Load current profile if it exists
    if let Ok(Some(profile)) = state.profile_manager.lock().load_current_profile() {
        *state.current_profile.lock() = Some(profile);
    }

    // Create system tray menu
    let tray_menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("show", "Show"))
        .add_item(CustomMenuItem::new("hide", "Hide"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("quit", "Quit"));

    let system_tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .manage(state)
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "show" => {
                    let window = app.get_window("main").unwrap();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                "hide" => {
                    let window = app.get_window("main").unwrap();
                    let _ = window.hide();
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            },
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            detect_windows,
            focus_window,
            update_window_order,
            update_excluded_windows,
            setup_default_hotkeys,
            setup_custom_hotkeys,
            save_profile,
            load_profile,
            get_current_profile,
            list_profiles,
            delete_profile,
            show_window,
            send_space_paste_enter,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
