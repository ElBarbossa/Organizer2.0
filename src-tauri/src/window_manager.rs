use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
use windows::Win32::System::ProcessStatus::GetProcessImageFileNameW;
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, GetCurrentProcessId,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
    SetForegroundWindow, AllowSetForegroundWindow, ShowWindow, SW_HIDE, SW_SHOW,
    GetForegroundWindow, BringWindowToTop, SetWindowPos, HWND_TOPMOST, HWND_NOTOPMOST,
    SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
    KEYBD_EVENT_FLAGS, VIRTUAL_KEY, VK_SPACE, VK_CONTROL, VK_V, VK_RETURN, VK_MENU,
    MapVirtualKeyW, MAPVK_VK_TO_VSC,
};
use windows::Win32::System::Threading::{
    AttachThreadInput, GetCurrentThreadId,
};
use windows::Win32::Foundation::GetLastError;

// Note: Toolbar messages kept for future reference if needed
// const TB_BUTTONCOUNT: u32 = 0x0418;
// const TB_GETBUTTON: u32 = 0x0417;
// const TB_MOVEBUTTON: u32 = 0x0452;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DofusWindow {
    pub handle: isize,
    pub character_name: String,
    pub title: String,
}

impl DofusWindow {
    pub fn new(handle: HWND, character_name: String, title: String) -> Self {
        Self {
            handle: handle.0 as isize,
            character_name,
            title,
        }
    }
}

/// Detect all Dofus windows currently running
pub fn detect_dofus_windows() -> Result<Vec<DofusWindow>> {
    let mut windows = Vec::new();

    unsafe {
        EnumWindows(
            Some(enum_windows_proc),
            LPARAM(&mut windows as *mut Vec<DofusWindow> as isize),
        )?;
    }

    Ok(windows)
}

/// Callback for EnumWindows - checks if window is a Dofus window
unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let windows = &mut *(lparam.0 as *mut Vec<DofusWindow>);

    // Only process visible windows
    if !IsWindowVisible(hwnd).as_bool() {
        return BOOL(1);
    }

    // Check window class - Dofus uses UnityWndClass
    let mut class_buffer = [0u16; 256];
    let class_len = GetClassNameW(hwnd, &mut class_buffer);

    if class_len > 0 {
        let class_name = OsString::from_wide(&class_buffer[..class_len as usize])
            .to_string_lossy()
            .to_string();

        // Log all windows for debugging
        println!("DEBUG Window: Class='{}', Handle={}", class_name, hwnd.0);

        // Check for UnityWndClass (current Dofus)
        if class_name != "UnityWndClass" {
            return BOOL(1);
        }
    } else {
        // If we can't get class name, skip
        return BOOL(1);
    }

    // Get window title
    let mut title_buffer = [0u16; 512];
    let title_len = GetWindowTextW(hwnd, &mut title_buffer);

    if title_len == 0 {
        println!("DEBUG: Skipping window {} - no title", hwnd.0);
        return BOOL(1);
    }

    let title = OsString::from_wide(&title_buffer[..title_len as usize])
        .to_string_lossy()
        .to_string();

    println!("DEBUG: Window {} has title: '{}'", hwnd.0, title);

    // Check if title contains "Dofus" (additional verification)
    // For some Dofus versions, the title format might be different
    // Temporarily accept any window with " - " in title (Dofus format)
    if !title.contains(" - ") {
        println!("DEBUG: Skipping window {} - title '{}' doesn't contain dash separator", hwnd.0, title);
        return BOOL(1);
    }

    println!("DEBUG: Window {} passed title check with title: '{}'", hwnd.0, title);

    println!("DEBUG: Window {} passed title check", hwnd.0);

    // Verify it's actually a Dofus process
    let mut process_id = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut process_id));

    if process_id == 0 {
        return BOOL(1);
    }

    // Verify the process is Dofus by checking the executable name
    if let Ok(process_handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) {
        let mut exe_path = [0u16; 512];
        let path_len = GetProcessImageFileNameW(process_handle, &mut exe_path);

        if path_len > 0 {
            let exe_name = OsString::from_wide(&exe_path[..path_len as usize])
                .to_string_lossy()
                .to_lowercase();

            // Check if it's actually Dofus.exe or related
            if !exe_name.contains("dofus") && !exe_name.contains("zaap") {
                return BOOL(1);
            }
        }
    }

    // Extract character name from title
    // Format: "CharacterName - Dofus X.XX.X"
    let character_name = if let Some(dash_pos) = title.find(" - ") {
        title[..dash_pos].trim().to_string()
    } else {
        title.clone()
    };

    let window = DofusWindow::new(hwnd, character_name, title);
    windows.push(window);

    BOOL(1)
}

/// Force a window to the foreground, even when our app is not in foreground
/// This uses multiple techniques to bypass Windows' foreground lock:
/// 1. Simulate Alt key press to "unlock" the foreground
/// 2. Attach thread input to the target window
/// 3. Use SetWindowPos with TOPMOST flag temporarily
/// 4. Call SetForegroundWindow
fn force_foreground_window(hwnd: HWND) -> bool {
    unsafe {
        let current_thread_id = GetCurrentThreadId();
        let mut target_thread_id = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut target_thread_id));

        // Allow our process to set foreground window
        let current_pid = GetCurrentProcessId();
        let _ = AllowSetForegroundWindow(current_pid);

        // Technique 1: Simulate Alt key press to unlock foreground
        // This tricks Windows into thinking user interaction occurred
        let alt_input = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VK_MENU,
                    wScan: 0,
                    dwFlags: KEYBD_EVENT_FLAGS(0),
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        let alt_up_input = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VK_MENU,
                    wScan: 0,
                    dwFlags: KEYEVENTF_KEYUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        SendInput(&[alt_input, alt_up_input], std::mem::size_of::<INPUT>() as i32);

        // Technique 2: Attach thread input if different threads
        let attached = if target_thread_id != 0 && target_thread_id != current_thread_id {
            AttachThreadInput(current_thread_id, target_thread_id, true).as_bool()
        } else {
            false
        };

        // Technique 3: Temporarily make window topmost, then remove topmost
        let _ = SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            0, 0, 0, 0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
        );

        // Bring to top and set foreground
        let _ = BringWindowToTop(hwnd);
        let result = SetForegroundWindow(hwnd);

        // Remove topmost flag to restore normal behavior
        let _ = SetWindowPos(
            hwnd,
            HWND_NOTOPMOST,
            0, 0, 0, 0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
        );

        // Detach thread input if we attached it
        if attached {
            let _ = AttachThreadInput(current_thread_id, target_thread_id, false);
        }

        result.as_bool()
    }
}

/// Bring a specific window to the foreground
pub fn focus_window(handle: isize) -> Result<()> {
    let hwnd = HWND(handle);
    force_foreground_window(hwnd);
    Ok(())
}

/// Update window Z-order and taskbar order based on character names order
///
/// NEW APPROACH: Hide/Show windows in desired order
/// Windows updates the taskbar when windows are shown, so by hiding all windows
/// then showing them in the desired order, we get the correct taskbar arrangement.
///
/// Logic: To get final order [A, B, C]:
/// 1. Hide all windows (SW_HIDE) - removes from taskbar
/// 2. Wait 250ms for Windows to process
/// 3. Show windows in order A, B, C (SW_SHOW) - adds back to taskbar in order
/// Result: A, B, C in taskbar (left to right)
pub fn reorder_taskbar_windows(order: Vec<String>) -> Result<()> {
    println!("DEBUG: ========================================");
    println!("DEBUG: Starting taskbar window reordering for {} windows", order.len());

    if order.is_empty() {
        println!("DEBUG: No windows to reorder");
        return Ok(());
    }

    // First, detect all current Dofus windows
    let all_windows = detect_dofus_windows()?;

    if all_windows.is_empty() {
        println!("DEBUG: No windows found to reorder");
        return Ok(());
    }

    // Create a map of character names to window handles for quick lookup
    let mut window_map = std::collections::HashMap::new();
    for window in all_windows {
        window_map.insert(window.character_name.clone(), window.handle);
    }

    // Collect ordered window handles
    let mut ordered_handles = Vec::new();
    for character_name in &order {
        if let Some(&handle) = window_map.get(character_name) {
            ordered_handles.push((character_name.clone(), handle));
        } else {
            println!("DEBUG: Window not found for character: {}", character_name);
        }
    }

    if ordered_handles.is_empty() {
        println!("DEBUG: No matching windows found to reorder");
        return Ok(());
    }

    println!("DEBUG: Found {} windows to reorder", ordered_handles.len());
    println!("DEBUG: Desired order: {:?}", order);
    println!("DEBUG: ========================================");

    unsafe {
        // NEW APPROACH: Hide all windows, then show in desired order
        println!("DEBUG: STEP 1 - Hiding all windows to clear taskbar...");

        for (index, (name, handle)) in ordered_handles.iter().enumerate() {
            let hwnd = HWND(*handle);
            ShowWindow(hwnd, SW_HIDE);
            println!("DEBUG: Hidden ({}/{}): {}", index + 1, ordered_handles.len(), name);
        }

        // Wait for Windows Shell to process the hide operations
        println!("DEBUG: Waiting 250ms for Windows to process...");
        std::thread::sleep(std::time::Duration::from_millis(250));

        // Show windows in the desired order (first to last)
        // Windows should add them to the taskbar in this order
        println!("DEBUG: ========================================");
        println!("DEBUG: STEP 2 - Showing windows in desired order...");

        let current_pid = GetCurrentProcessId();

        for (index, (name, handle)) in ordered_handles.iter().enumerate() {
            let hwnd = HWND(*handle);

            println!("DEBUG: Showing ({}/{}): {}", index + 1, ordered_handles.len(), name);
            ShowWindow(hwnd, SW_SHOW);

            // For the first window, give it foreground to ensure it's fully visible
            if index == 0 {
                let _ = AllowSetForegroundWindow(current_pid);
                SetForegroundWindow(hwnd);
                println!("DEBUG: Set first window {} as foreground", name);
            }

            // Small delay between each show to ensure Windows processes them in order
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
    }

    println!("DEBUG: ========================================");
    println!("DEBUG: Taskbar window reordering completed");
    println!("DEBUG: Windows should now be ordered in taskbar as: {:?}", order);
    Ok(())
}

/// Helper function to create a keyboard input event with scan code
/// Using scan codes makes the input more "realistic" for games like Dofus
fn create_key_input(vk: VIRTUAL_KEY, flags: KEYBD_EVENT_FLAGS) -> INPUT {
    unsafe {
        // Get the scan code from the virtual key
        let scan_code = MapVirtualKeyW(vk.0 as u32, MAPVK_VK_TO_VSC) as u16;

        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: scan_code,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }
}

/// Send a key sequence (Space + Paste + Enter + Enter) to a specific window
/// Sequence: Space → Ctrl+V → Enter (send command) → Wait → Enter (validate popup)
/// Always focuses the target window (required for SendInput)
#[allow(unused_variables)]
pub fn send_space_paste_enter_to_window(handle: isize, with_focus: bool) -> Result<()> {
    println!("DEBUG: Sending space + paste + enter + enter sequence to window {}", handle);

    unsafe {
        let hwnd = HWND(handle);

        // Use force_foreground_window to ensure window is focused
        // This works even when Organizer is not in foreground
        println!("DEBUG: Forcing window to foreground using enhanced technique...");

        let mut focus_success = false;
        for attempt in 0..3 {
            // Check if already in foreground
            let fg_hwnd = GetForegroundWindow();
            if fg_hwnd.0 == handle {
                println!("DEBUG: Window already in foreground");
                focus_success = true;
                break;
            }

            println!("DEBUG: Attempt {}/3 - Forcing foreground...", attempt + 1);
            force_foreground_window(hwnd);

            // Wait for Windows to process
            std::thread::sleep(std::time::Duration::from_millis(150));

            // Verify
            let fg_hwnd = GetForegroundWindow();
            if fg_hwnd.0 == handle {
                println!("DEBUG: Successfully focused window on attempt {}", attempt + 1);
                focus_success = true;
                break;
            } else {
                println!("DEBUG: Focus attempt {} - FG: {}, Target: {}", attempt + 1, fg_hwnd.0, handle);
            }
        }

        if !focus_success {
            let fg_hwnd = GetForegroundWindow();
            println!("ERROR: Failed to focus window after 3 attempts. FG: {}, Target: {}", fg_hwnd.0, handle);
            return Err(anyhow::anyhow!("Failed to bring window to foreground after multiple attempts. Current foreground: {}, Target: {}", fg_hwnd.0, handle));
        }

        // Envoi de la touche Espace avec scan code
        println!("DEBUG: Sending SPACE key with scan code...");
        let space_scan = MapVirtualKeyW(VK_SPACE.0 as u32, MAPVK_VK_TO_VSC);
        println!("DEBUG: VK_SPACE=0x{:X}, Scan code=0x{:X}", VK_SPACE.0, space_scan);

        let space_inputs = [
            create_key_input(VK_SPACE, KEYBD_EVENT_FLAGS(0)), // Appui
            create_key_input(VK_SPACE, KEYEVENTF_KEYUP),      // Relâchement
        ];

        let sent = SendInput(&space_inputs, std::mem::size_of::<INPUT>() as i32);
        if sent == 0 {
            let error = GetLastError();
            println!("ERROR: Failed to send space input. Error code: {:?}", error);
            return Err(anyhow::anyhow!("Failed to send space input. Error: {:?}", error));
        }
        println!("DEBUG: Space sent, {} events processed", sent);

        std::thread::sleep(std::time::Duration::from_millis(100));

        // Envoi de Ctrl+V avec délais individuels pour garantir la détection
        println!("DEBUG: Sending CTRL+V (paste) with individual delays...");

        // Press Ctrl
        let sent = SendInput(&[create_key_input(VK_CONTROL, KEYBD_EVENT_FLAGS(0))], std::mem::size_of::<INPUT>() as i32);
        if sent == 0 {
            let error = GetLastError();
            println!("ERROR: Failed to send Ctrl down. Error code: {:?}", error);
            return Err(anyhow::anyhow!("Failed to send Ctrl down. Error: {:?}", error));
        }
        std::thread::sleep(std::time::Duration::from_millis(30));

        // Press V (while Ctrl is held)
        let sent = SendInput(&[create_key_input(VK_V, KEYBD_EVENT_FLAGS(0))], std::mem::size_of::<INPUT>() as i32);
        if sent == 0 {
            let error = GetLastError();
            println!("ERROR: Failed to send V down. Error code: {:?}", error);
            return Err(anyhow::anyhow!("Failed to send V down. Error: {:?}", error));
        }
        std::thread::sleep(std::time::Duration::from_millis(30));

        // Release V
        let sent = SendInput(&[create_key_input(VK_V, KEYEVENTF_KEYUP)], std::mem::size_of::<INPUT>() as i32);
        if sent == 0 {
            let error = GetLastError();
            println!("ERROR: Failed to send V up. Error code: {:?}", error);
            return Err(anyhow::anyhow!("Failed to send V up. Error: {:?}", error));
        }
        std::thread::sleep(std::time::Duration::from_millis(30));

        // Release Ctrl
        let sent = SendInput(&[create_key_input(VK_CONTROL, KEYEVENTF_KEYUP)], std::mem::size_of::<INPUT>() as i32);
        if sent == 0 {
            let error = GetLastError();
            println!("ERROR: Failed to send Ctrl up. Error code: {:?}", error);
            return Err(anyhow::anyhow!("Failed to send Ctrl up. Error: {:?}", error));
        }
        println!("DEBUG: Ctrl+V sent successfully with {} total events", 4);

        // Wait before sending Enter
        std::thread::sleep(std::time::Duration::from_millis(50));

        // Send first Enter key (to send the /travel command)
        println!("DEBUG: Sending first ENTER key (send command)...");
        let enter_inputs = [
            create_key_input(VK_RETURN, KEYBD_EVENT_FLAGS(0)), // Appui
            create_key_input(VK_RETURN, KEYEVENTF_KEYUP),      // Relâchement
        ];

        let sent = SendInput(&enter_inputs, std::mem::size_of::<INPUT>() as i32);
        if sent == 0 {
            let error = GetLastError();
            println!("ERROR: Failed to send first enter input. Error code: {:?}", error);
            return Err(anyhow::anyhow!("Failed to send first enter input. Error: {:?}", error));
        }
        println!("DEBUG: First Enter sent, {} events processed", sent);

        // Wait for popup to appear
        std::thread::sleep(std::time::Duration::from_millis(300));

        // Send second Enter key (to validate the popup)
        println!("DEBUG: Sending second ENTER key (validate popup)...");
        let enter_inputs_2 = [
            create_key_input(VK_RETURN, KEYBD_EVENT_FLAGS(0)), // Appui
            create_key_input(VK_RETURN, KEYEVENTF_KEYUP),      // Relâchement
        ];

        let sent = SendInput(&enter_inputs_2, std::mem::size_of::<INPUT>() as i32);
        if sent == 0 {
            let error = GetLastError();
            println!("ERROR: Failed to send second enter input. Error code: {:?}", error);
            return Err(anyhow::anyhow!("Failed to send second enter input. Error: {:?}", error));
        }
        println!("DEBUG: Second Enter sent, {} events processed", sent);

        println!("DEBUG: Space + paste + enter + enter sequence completed successfully");
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_windows() {
        // This will only work if Dofus is actually running
        let windows = detect_dofus_windows();
        println!("Detected windows: {:?}", windows);
    }
}
