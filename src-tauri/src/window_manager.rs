use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, WPARAM};
use windows::Win32::System::ProcessStatus::GetProcessImageFileNameW;
use windows::Win32::System::Threading::OpenProcess;
use windows::Win32::System::Threading::PROCESS_QUERY_LIMITED_INFORMATION;
use windows::Win32::System::Memory::{VirtualAllocEx, VirtualFreeEx, MEM_COMMIT, MEM_RELEASE, PAGE_READWRITE};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
    SetForegroundWindow, ShowWindow, SW_MINIMIZE, SW_RESTORE, SetWindowPos, SWP_NOMOVE, SWP_NOSIZE,
    HWND_BOTTOM, HWND_TOP, FindWindowW, FindWindowExW, SendMessageW,
};

// Toolbar messages
const TB_BUTTONCOUNT: u32 = 0x0418;
const TB_GETBUTTON: u32 = 0x0417;
const TB_MOVEBUTTON: u32 = 0x0452;

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

/// Try to find the taskbar toolbar control (Windows 10)
/// Returns None on Windows 11 or if not found
unsafe fn find_taskbar_toolbar() -> Option<HWND> {
    // Hierarchy: Shell_TrayWnd -> ReBarWindow32 -> MSTaskSwWClass -> ToolbarWindow32

    // Create wide strings with proper lifetime
    let shell_tray_class: Vec<u16> = "Shell_TrayWnd\0".encode_utf16().collect();
    let rebar_class: Vec<u16> = "ReBarWindow32\0".encode_utf16().collect();
    let task_sw_class: Vec<u16> = "MSTaskSwWClass\0".encode_utf16().collect();
    let toolbar_class: Vec<u16> = "ToolbarWindow32\0".encode_utf16().collect();

    let shell_tray = FindWindowW(
        PCWSTR::from_raw(shell_tray_class.as_ptr()),
        PCWSTR::null()
    );

    if shell_tray.0 == 0 {
        println!("DEBUG: Could not find Shell_TrayWnd");
        return None;
    }
    println!("DEBUG: Found Shell_TrayWnd: {:?}", shell_tray);

    let rebar = FindWindowExW(
        shell_tray,
        HWND(0),
        PCWSTR::from_raw(rebar_class.as_ptr()),
        PCWSTR::null()
    );

    if rebar.0 == 0 {
        println!("DEBUG: Could not find ReBarWindow32 (might be Windows 11)");
        return None;
    }
    println!("DEBUG: Found ReBarWindow32: {:?}", rebar);

    let task_sw = FindWindowExW(
        rebar,
        HWND(0),
        PCWSTR::from_raw(task_sw_class.as_ptr()),
        PCWSTR::null()
    );

    if task_sw.0 == 0 {
        println!("DEBUG: Could not find MSTaskSwWClass");
        return None;
    }
    println!("DEBUG: Found MSTaskSwWClass: {:?}", task_sw);

    let toolbar = FindWindowExW(
        task_sw,
        HWND(0),
        PCWSTR::from_raw(toolbar_class.as_ptr()),
        PCWSTR::null()
    );

    if toolbar.0 == 0 {
        println!("DEBUG: Could not find ToolbarWindow32");
        return None;
    }
    println!("DEBUG: Found ToolbarWindow32: {:?}", toolbar);

    Some(toolbar)
}

/// Update window Z-order based on character names order
/// Uses SetWindowPos with HWND_TOP in REVERSE order to stack windows correctly
///
/// Logic: To get final order [A, B, C] (A on top), we process in reverse:
/// 1. SetWindowPos(C, HWND_TOP) - C is now on top
/// 2. SetWindowPos(B, HWND_TOP) - B goes above C
/// 3. SetWindowPos(A, HWND_TOP) - A goes above B and C
/// Result: A, B, C (desired order)
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
        // NEW METHOD: Process windows in REVERSE order, placing each at HWND_TOP
        // This way, the first window in the desired order ends up on top
        println!("DEBUG: Processing windows in REVERSE order with HWND_TOP");

        for (index, (name, handle)) in ordered_handles.iter().rev().enumerate() {
            let hwnd = HWND(*handle);

            println!(
                "DEBUG: Placing window ({}/{}) at TOP: {}",
                index + 1,
                ordered_handles.len(),
                name
            );

            // Place window at the top of Z-order
            let result = SetWindowPos(
                hwnd,
                HWND_TOP,
                0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE,
            );

            if result.is_err() {
                println!("DEBUG: Failed to position window {}: {:?}", name, result.err());
            } else {
                println!("DEBUG: Successfully positioned window {} at TOP", name);
            }

            // Small delay to ensure Windows processes the change
            std::thread::sleep(std::time::Duration::from_millis(50));
        }

        // After positioning all windows, do a final focus pass to reinforce the order
        println!("DEBUG: ========================================");
        println!("DEBUG: Final focus pass in correct order to reinforce arrangement");

        for (index, (name, handle)) in ordered_handles.iter().enumerate() {
            let hwnd = HWND(*handle);
            SetForegroundWindow(hwnd);
            println!("DEBUG: Focused ({}/{}): {}", index + 1, ordered_handles.len(), name);
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
    }

    println!("DEBUG: ========================================");
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
