use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
use windows::Win32::System::ProcessStatus::GetProcessImageFileNameW;
use windows::Win32::System::Threading::OpenProcess;
use windows::Win32::System::Threading::PROCESS_QUERY_LIMITED_INFORMATION;
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
    SetForegroundWindow,
};

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

/// Bring a specific window to the foreground
pub fn focus_window(handle: isize) -> Result<()> {
    unsafe {
        let hwnd = HWND(handle);
        SetForegroundWindow(hwnd);
    }
    Ok(())
}

/// Update window Z-order based on character names order
/// Windows orders taskbar buttons based on last activation time,
/// so we focus windows in the desired order to update the taskbar
pub fn reorder_taskbar_windows(order: Vec<String>) -> Result<()> {
    println!("DEBUG: Starting taskbar window reordering for {} windows", order.len());

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

    // Focus windows in the desired order (first to last)
    // Windows will update the taskbar order based on activation sequence
    for (index, character_name) in order.iter().enumerate() {
        if let Some(&handle) = window_map.get(character_name) {
            println!("DEBUG: Focusing window {} ({}) - position {}", character_name, handle, index + 1);

            unsafe {
                let hwnd = HWND(handle);
                SetForegroundWindow(hwnd);
            }

            // Small delay to ensure Windows processes the focus change
            // 50ms should be enough for Windows to register the activation
            std::thread::sleep(std::time::Duration::from_millis(50));
        } else {
            println!("DEBUG: Window not found for character: {}", character_name);
        }
    }

    println!("DEBUG: Taskbar window reordering completed");
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
