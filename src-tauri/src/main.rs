// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod hotkey_manager;
mod ocre_manager;
mod profile_manager;
mod screen_capture;
mod window_manager;

use anyhow::Result;
use hotkey_manager::{vk_codes, Hotkey, HotkeyAction, HotkeyManager};
use ocre_manager::{CaptureResult, Monster, OcreManager, OcreStatistics};
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
    ocre_manager: Arc<Mutex<OcreManager>>,
}

impl AppState {
    fn new() -> Result<Self> {
        Ok(Self {
            hotkey_manager: Arc::new(Mutex::new(HotkeyManager::new())),
            profile_manager: Arc::new(Mutex::new(ProfileManager::new()?)),
            window_list: Arc::new(Mutex::new(Vec::new())),
            current_profile: Arc::new(Mutex::new(None)),
            excluded_windows: Arc::new(Mutex::new(Vec::new())),
            ocre_manager: Arc::new(Mutex::new(OcreManager::new()?)),
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

/// Send space + paste + enter + enter key sequence to a specific window
/// Sequence: Space → Ctrl+V → Enter (send command) → Wait 500ms → Enter (validate popup)
/// Always focuses the target window and keeps it in foreground
#[tauri::command]
fn send_space_paste_enter(handle: isize, with_focus: bool) -> Result<(), String> {
    window_manager::send_space_paste_enter_to_window(handle, with_focus)
        .map_err(|e| format!("Failed to send space + paste + enter + enter: {}", e))
}

/// Read clipboard content
#[tauri::command]
fn read_clipboard(app_handle: AppHandle) -> Result<String, String> {
    use tauri::ClipboardManager;

    app_handle
        .clipboard_manager()
        .read_text()
        .map_err(|e| format!("Failed to read clipboard: {}", e))
        .and_then(|opt| opt.ok_or_else(|| "Clipboard is empty".to_string()))
}

// ============================================================================
// OCRE COMMANDS
// ============================================================================

/// Fetch monsters from Metamob API and cache locally
#[tauri::command]
fn ocre_fetch_monsters(state: tauri::State<AppState>, api_key: String) -> Result<usize, String> {
    state.ocre_manager.lock()
        .fetch_monsters_from_api(&api_key)
        .map_err(|e| format!("Failed to fetch monsters: {}", e))
}

/// Get all cached monsters
#[tauri::command]
fn ocre_get_monsters(state: tauri::State<AppState>) -> Result<Vec<Monster>, String> {
    Ok(state.ocre_manager.lock().get_monsters().clone())
}

/// Get monsters filtered by type
#[tauri::command]
fn ocre_get_monsters_by_type(state: tauri::State<AppState>, monster_type: String) -> Result<Vec<Monster>, String> {
    let manager = state.ocre_manager.lock();
    let monsters: Vec<Monster> = manager.get_monsters_by_type(&monster_type)
        .into_iter()
        .cloned()
        .collect();
    Ok(monsters)
}

/// Get quantity for a specific monster
#[tauri::command]
fn ocre_get_monster_quantity(state: tauri::State<AppState>, monster_id: i32) -> Result<i32, String> {
    Ok(state.ocre_manager.lock().get_monster_quantity(monster_id))
}

/// Set quantity for a monster
#[tauri::command]
fn ocre_set_monster_quantity(state: tauri::State<AppState>, monster_id: i32, quantity: i32) -> Result<(), String> {
    state.ocre_manager.lock()
        .set_monster_quantity(monster_id, quantity)
        .map_err(|e| format!("Failed to set quantity: {}", e))
}

/// Add quantity to a monster (+1)
#[tauri::command]
fn ocre_add_monster_quantity(state: tauri::State<AppState>, monster_id: i32, amount: i32) -> Result<i32, String> {
    state.ocre_manager.lock()
        .add_monster_quantity(monster_id, amount)
        .map_err(|e| format!("Failed to add quantity: {}", e))
}

/// Process captured text and match to monsters
#[tauri::command]
fn ocre_process_captured_text(
    state: tauri::State<AppState>,
    lines: Vec<String>,
    min_confidence: f64,
) -> Result<CaptureResult, String> {
    state.ocre_manager.lock()
        .process_captured_text(lines, min_confidence)
        .map_err(|e| format!("Failed to process captured text: {}", e))
}

/// Get Ocre statistics
#[tauri::command]
fn ocre_get_statistics(state: tauri::State<AppState>) -> Result<OcreStatistics, String> {
    Ok(state.ocre_manager.lock().get_statistics())
}

/// Reset all Ocre progress
#[tauri::command]
fn ocre_reset_progress(state: tauri::State<AppState>) -> Result<(), String> {
    state.ocre_manager.lock()
        .reset_progress()
        .map_err(|e| format!("Failed to reset progress: {}", e))
}

/// Export Ocre progress to JSON
#[tauri::command]
fn ocre_export_progress(state: tauri::State<AppState>) -> Result<String, String> {
    state.ocre_manager.lock()
        .export_progress()
        .map_err(|e| format!("Failed to export progress: {}", e))
}

/// Import Ocre progress from JSON
#[tauri::command]
fn ocre_import_progress(state: tauri::State<AppState>, json: String) -> Result<usize, String> {
    state.ocre_manager.lock()
        .import_progress(&json)
        .map_err(|e| format!("Failed to import progress: {}", e))
}

/// Capture screenshot of foreground window and return as base64 PNG
#[tauri::command]
fn ocre_capture_screenshot() -> Result<String, String> {
    let screenshot = screen_capture::capture_foreground_window()
        .map_err(|e| format!("Failed to capture screenshot: {}", e))?;

    screenshot.to_base64_png()
        .map_err(|e| format!("Failed to convert to base64: {}", e))
}

/// Capture a specific region of the screen
#[tauri::command]
fn ocre_capture_region(x: i32, y: i32, width: u32, height: u32) -> Result<String, String> {
    let screenshot = screen_capture::capture_region(x, y, width, height)
        .map_err(|e| format!("Failed to capture region: {}", e))?;

    screenshot.to_base64_png()
        .map_err(|e| format!("Failed to convert to base64: {}", e))
}

/// Capture foreground window and perform OCR recognition
#[tauri::command]
fn ocre_capture_and_recognize(
    state: tauri::State<AppState>,
    min_confidence: f64,
) -> Result<CaptureResult, String> {
    println!("[Ocre] Starting capture and recognize...");

    // Capture and perform OCR
    let lines = screen_capture::capture_and_ocr()
        .map_err(|e| format!("Failed to capture and OCR: {}", e))?;

    println!("[Ocre] OCR extracted {} lines", lines.len());

    // Process the recognized text
    state.ocre_manager.lock()
        .process_captured_text(lines, min_confidence)
        .map_err(|e| format!("Failed to process captured text: {}", e))
}

/// Capture a specific region and perform OCR recognition
#[tauri::command]
fn ocre_capture_region_and_recognize(
    state: tauri::State<AppState>,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    min_confidence: f64,
) -> Result<CaptureResult, String> {
    println!("[Ocre] Starting region capture and recognize at ({}, {}) {}x{}...", x, y, width, height);

    // Capture and perform OCR on region
    let lines = screen_capture::capture_region_and_ocr(x, y, width, height)
        .map_err(|e| format!("Failed to capture region and OCR: {}", e))?;

    println!("[Ocre] OCR extracted {} lines", lines.len());

    // Process the recognized text
    state.ocre_manager.lock()
        .process_captured_text(lines, min_confidence)
        .map_err(|e| format!("Failed to process captured text: {}", e))
}

/// Get user progress (all monsters with quantities)
#[tauri::command]
fn ocre_get_progress(state: tauri::State<AppState>) -> Result<Vec<ocre_manager::MonsterProgress>, String> {
    let manager = state.ocre_manager.lock();
    let progress: Vec<ocre_manager::MonsterProgress> = manager.get_progress()
        .values()
        .cloned()
        .collect();
    Ok(progress)
}

fn main() {
    // Initialize app state
    let state = AppState::new().expect("Failed to initialize app state");

    // Note: Ne pas charger automatiquement le profil au démarrage.
    // Le chargement automatique est géré par JavaScript via localStorage (rustfocus_auto_load_profile).
    // Le fichier .current_state.json sert uniquement à sauvegarder l'état actuel, pas à le restaurer.

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
            read_clipboard,
            // Ocre commands
            ocre_fetch_monsters,
            ocre_get_monsters,
            ocre_get_monsters_by_type,
            ocre_get_monster_quantity,
            ocre_set_monster_quantity,
            ocre_add_monster_quantity,
            ocre_process_captured_text,
            ocre_get_statistics,
            ocre_reset_progress,
            ocre_export_progress,
            ocre_import_progress,
            ocre_capture_screenshot,
            ocre_capture_region,
            ocre_capture_and_recognize,
            ocre_capture_region_and_recognize,
            ocre_get_progress,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
