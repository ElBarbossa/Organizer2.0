use anyhow::{Result, Context};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use parking_lot::Mutex;
use global_hotkey::{GlobalHotKeyManager, hotkey::{HotKey, Code}, GlobalHotKeyEvent};
use std::thread;

// Wrapper thread-safe pour GlobalHotKeyManager
// SAFETY: GlobalHotKeyManager est conçu pour être utilisé de manière thread-safe
// mais n'implémente pas Send/Sync à cause de l'implémentation Windows avec des pointeurs bruts.
// En pratique, il est safe de l'utiliser dans un contexte multi-thread.
struct ThreadSafeHotKeyManager(GlobalHotKeyManager);

unsafe impl Send for ThreadSafeHotKeyManager {}
unsafe impl Sync for ThreadSafeHotKeyManager {}

impl ThreadSafeHotKeyManager {
    fn new() -> Result<Self> {
        Ok(ThreadSafeHotKeyManager(
            GlobalHotKeyManager::new()
                .context("Failed to create GlobalHotKeyManager")?
        ))
    }

    fn register(&self, hotkey: HotKey) -> global_hotkey::Result<()> {
        self.0.register(hotkey)
    }

    fn unregister(&self, hotkey: HotKey) -> global_hotkey::Result<()> {
        self.0.unregister(hotkey)
    }
}

// Variable statique pour le GlobalHotKeyManager (maintenant thread-safe)
static GLOBAL_MANAGER: OnceLock<ThreadSafeHotKeyManager> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct Hotkey {
    pub id: i32,
    pub modifiers: u32,
    pub key_code: u32,
    pub action: HotkeyAction,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum HotkeyAction {
    NextWindow,
    PreviousWindow,
    DirectWindow(usize),
}

pub struct HotkeyManager {
    hotkeys: Arc<Mutex<HashMap<i32, HotKey>>>,
    callback: Arc<Mutex<Option<Box<dyn Fn(HotkeyAction) + Send + Sync + 'static>>>>,
    hotkey_actions: Arc<Mutex<HashMap<u32, HotkeyAction>>>,
    listening: Arc<Mutex<bool>>,
}

impl HotkeyManager {
    pub fn new() -> Self {
        // Initialiser le GlobalHotKeyManager une seule fois
        GLOBAL_MANAGER.get_or_init(|| {
            ThreadSafeHotKeyManager::new()
                .expect("Failed to create ThreadSafeHotKeyManager")
        });

        Self {
            hotkeys: Arc::new(Mutex::new(HashMap::new())),
            callback: Arc::new(Mutex::new(None)),
            hotkey_actions: Arc::new(Mutex::new(HashMap::new())),
            listening: Arc::new(Mutex::new(false)),
        }
    }

    pub fn set_callback<F>(&self, callback: F)
    where
        F: Fn(HotkeyAction) + Send + Sync + 'static,
    {
        let mut cb = self.callback.lock();
        *cb = Some(Box::new(callback));
    }

    pub fn register_hotkey(&self, hotkey: Hotkey) -> Result<()> {
        let manager = GLOBAL_MANAGER.get()
            .context("GlobalHotKeyManager not initialized")?;

        // Convertir le code virtuel Windows en Code de global-hotkey
        let code = vk_to_code(hotkey.key_code)
            .context(format!("Unsupported key code: 0x{:X}", hotkey.key_code))?;

        // Créer la hotkey (sans modifiers pour l'instant)
        let global_hotkey = HotKey::new(None, code);

        // Enregistrer la hotkey
        manager
            .register(global_hotkey)
            .context(format!("Failed to register hotkey with id {}", hotkey.id))?;

        // Stocker la hotkey et son action
        let hotkey_id = global_hotkey.id();
        self.hotkeys.lock().insert(hotkey.id, global_hotkey);
        self.hotkey_actions.lock().insert(hotkey_id, hotkey.action);

        println!("[HotkeyManager] Registered hotkey ID {} (global ID: {})", hotkey.id, hotkey_id);

        Ok(())
    }

    pub fn unregister_hotkey(&self, id: i32) -> Result<()> {
        let manager = GLOBAL_MANAGER.get()
            .context("GlobalHotKeyManager not initialized")?;

        if let Some(hotkey) = self.hotkeys.lock().remove(&id) {
            manager
                .unregister(hotkey)
                .context(format!("Failed to unregister hotkey with id {}", id))?;

            println!("[HotkeyManager] Unregistered hotkey ID {}", id);
        }
        Ok(())
    }

    pub fn unregister_all(&self) -> Result<()> {
        let manager = GLOBAL_MANAGER.get()
            .context("GlobalHotKeyManager not initialized")?;

        let hotkeys: Vec<HotKey> = self.hotkeys.lock().values().cloned().collect();

        for hotkey in hotkeys {
            manager
                .unregister(hotkey)
                .context("Failed to unregister hotkey")?;
        }

        self.hotkeys.lock().clear();
        self.hotkey_actions.lock().clear();

        println!("[HotkeyManager] Unregistered all hotkeys");
        Ok(())
    }

    pub fn start_listening(&self) -> Result<()> {
        let mut listening = self.listening.lock();
        if *listening {
            return Ok(()); // Déjà en écoute
        }
        *listening = true;
        drop(listening);

        let callback = Arc::clone(&self.callback);
        let hotkey_actions = Arc::clone(&self.hotkey_actions);
        let listening_flag = Arc::clone(&self.listening);

        // Lancer un thread pour écouter les événements
        thread::spawn(move || {
            println!("[HotkeyManager] Started listening for hotkey events");

            let receiver = GlobalHotKeyEvent::receiver();

            loop {
                // Vérifier si on doit arrêter
                if !*listening_flag.lock() {
                    println!("[HotkeyManager] Stopped listening for hotkey events");
                    break;
                }

                // Essayer de recevoir un événement (non bloquant)
                if let Ok(event) = receiver.try_recv() {
                    use std::time::Instant;

                    static mut LAST_EVENT_TIME: Option<Instant> = None;
                    static mut LAST_EVENT_ID: u32 = 0;
                    static mut LAST_EVENT_STATE: Option<global_hotkey::HotKeyState> = None;

                    let now = Instant::now();
                    unsafe {
                        // Filtrer les événements de relâchement de touche et les vrais duplicates système
                        // Les événements de relâchement arrivent généralement juste après l'appui
                        // On ne traite que les événements d'appui (Pressed)
                        if event.state != global_hotkey::HotKeyState::Pressed {
                            println!("[HotkeyManager] Event ignored (key release): {:?}", event.id);
                            continue;
                        }

                        // Filtrer uniquement les vrais duplicates système (< 50ms)
                        // Les doubles détections système arrivent généralement en < 30-50ms
                        // tandis que les appuis humains rapides sont espacés d'au moins 100ms
                        if let Some(last_time) = LAST_EVENT_TIME {
                            let elapsed_ms = now.duration_since(last_time).as_millis();
                            if elapsed_ms < 50 && LAST_EVENT_ID == event.id && LAST_EVENT_STATE == Some(global_hotkey::HotKeyState::Pressed) {
                                println!("[HotkeyManager] Event ignored (duplicate système, {}ms): {:?}", elapsed_ms, event.id);
                                continue;
                            }
                        }
                        LAST_EVENT_TIME = Some(now);
                        LAST_EVENT_ID = event.id;
                        LAST_EVENT_STATE = Some(event.state);
                    }

                    println!("[HotkeyManager] Received hotkey event (pressed): {:?}", event.id);

                    // Trouver l'action associée
                    if let Some(action) = hotkey_actions.lock().get(&event.id) {
                        println!("[HotkeyManager] Executing action: {:?}", action);

                        // Appeler le callback
                        if let Some(ref cb) = *callback.lock() {
                            cb(action.clone());
                        }
                    }
                }

                // Petite pause pour ne pas surcharger le CPU
                thread::sleep(std::time::Duration::from_millis(10));
            }
        });

        Ok(())
    }

    pub fn stop_listening(&self) {
        let mut listening = self.listening.lock();
        *listening = false;
        println!("[HotkeyManager] Requested stop listening");
    }
}

// Conversion des Virtual Key Codes Windows vers Code de global-hotkey
fn vk_to_code(vk: u32) -> Result<Code> {
    match vk {
        // Lettres A-Z
        0x41 => Ok(Code::KeyA),
        0x42 => Ok(Code::KeyB),
        0x43 => Ok(Code::KeyC),
        0x44 => Ok(Code::KeyD),
        0x45 => Ok(Code::KeyE),
        0x46 => Ok(Code::KeyF),
        0x47 => Ok(Code::KeyG),
        0x48 => Ok(Code::KeyH),
        0x49 => Ok(Code::KeyI),
        0x4A => Ok(Code::KeyJ),
        0x4B => Ok(Code::KeyK),
        0x4C => Ok(Code::KeyL),
        0x4D => Ok(Code::KeyM),
        0x4E => Ok(Code::KeyN),
        0x4F => Ok(Code::KeyO),
        0x50 => Ok(Code::KeyP),
        0x51 => Ok(Code::KeyQ),
        0x52 => Ok(Code::KeyR),
        0x53 => Ok(Code::KeyS),
        0x54 => Ok(Code::KeyT),
        0x55 => Ok(Code::KeyU),
        0x56 => Ok(Code::KeyV),
        0x57 => Ok(Code::KeyW),
        0x58 => Ok(Code::KeyX),
        0x59 => Ok(Code::KeyY),
        0x5A => Ok(Code::KeyZ),

        // Chiffres 0-9 (pavé principal)
        0x30 => Ok(Code::Digit0),
        0x31 => Ok(Code::Digit1),
        0x32 => Ok(Code::Digit2),
        0x33 => Ok(Code::Digit3),
        0x34 => Ok(Code::Digit4),
        0x35 => Ok(Code::Digit5),
        0x36 => Ok(Code::Digit6),
        0x37 => Ok(Code::Digit7),
        0x38 => Ok(Code::Digit8),
        0x39 => Ok(Code::Digit9),

        // Pavé numérique
        0x60 => Ok(Code::Numpad0),
        0x61 => Ok(Code::Numpad1),
        0x62 => Ok(Code::Numpad2),
        0x63 => Ok(Code::Numpad3),
        0x64 => Ok(Code::Numpad4),
        0x65 => Ok(Code::Numpad5),
        0x66 => Ok(Code::Numpad6),
        0x67 => Ok(Code::Numpad7),
        0x68 => Ok(Code::Numpad8),
        0x69 => Ok(Code::Numpad9),
        0x6A => Ok(Code::NumpadMultiply),
        0x6B => Ok(Code::NumpadAdd),
        0x6D => Ok(Code::NumpadSubtract),
        0x6E => Ok(Code::NumpadDecimal),
        0x6F => Ok(Code::NumpadDivide),

        // Touches de fonction F1-F24
        0x70 => Ok(Code::F1),
        0x71 => Ok(Code::F2),
        0x72 => Ok(Code::F3),
        0x73 => Ok(Code::F4),
        0x74 => Ok(Code::F5),
        0x75 => Ok(Code::F6),
        0x76 => Ok(Code::F7),
        0x77 => Ok(Code::F8),
        0x78 => Ok(Code::F9),
        0x79 => Ok(Code::F10),
        0x7A => Ok(Code::F11),
        0x7B => Ok(Code::F12),
        0x7C => Ok(Code::F13),
        0x7D => Ok(Code::F14),
        0x7E => Ok(Code::F15),
        0x7F => Ok(Code::F16),
        0x80 => Ok(Code::F17),
        0x81 => Ok(Code::F18),
        0x82 => Ok(Code::F19),
        0x83 => Ok(Code::F20),
        0x84 => Ok(Code::F21),
        0x85 => Ok(Code::F22),
        0x86 => Ok(Code::F23),
        0x87 => Ok(Code::F24),

        // Flèches directionnelles
        0x25 => Ok(Code::ArrowLeft),
        0x26 => Ok(Code::ArrowUp),
        0x27 => Ok(Code::ArrowRight),
        0x28 => Ok(Code::ArrowDown),

        // Navigation
        0x21 => Ok(Code::PageUp),
        0x22 => Ok(Code::PageDown),
        0x24 => Ok(Code::Home),
        0x23 => Ok(Code::End),
        0x2D => Ok(Code::Insert),
        0x2E => Ok(Code::Delete),

        // Touches spéciales
        0x20 => Ok(Code::Space),
        0x0D => Ok(Code::Enter),
        0x09 => Ok(Code::Tab),
        0x1B => Ok(Code::Escape),
        0x08 => Ok(Code::Backspace),

        // Symboles
        0xBD => Ok(Code::Minus),
        0xBB => Ok(Code::Equal),
        0xDB => Ok(Code::BracketLeft),
        0xDD => Ok(Code::BracketRight),
        0xBA => Ok(Code::Semicolon),
        0xDE => Ok(Code::Quote),
        0xDC => Ok(Code::Backslash),
        0xBC => Ok(Code::Comma),
        0xBE => Ok(Code::Period),
        0xBF => Ok(Code::Slash),
        0xC0 => Ok(Code::Backquote),

        _ => Err(anyhow::anyhow!("Unsupported virtual key code: 0x{:X}. Most standard keys (A-Z, 0-9, F1-F24, arrows, etc.) are supported.", vk)),
    }
}

pub mod vk_codes {
    // Page Up/Down
    pub const VK_PRIOR: u32 = 0x21;  // Page Up
    pub const VK_NEXT: u32 = 0x22;   // Page Down

    // Home/End
    pub const VK_END: u32 = 0x23;
    pub const VK_HOME: u32 = 0x24;

    // Insert/Delete
    pub const VK_INSERT: u32 = 0x2D;
    pub const VK_DELETE: u32 = 0x2E;

    // Function keys
    pub const VK_F1: u32 = 0x70;
    pub const VK_F2: u32 = 0x71;
    pub const VK_F3: u32 = 0x72;
    pub const VK_F4: u32 = 0x73;
    pub const VK_F5: u32 = 0x74;
    pub const VK_F6: u32 = 0x75;
    pub const VK_F7: u32 = 0x76;
    pub const VK_F8: u32 = 0x77;
    pub const VK_F9: u32 = 0x78;
    pub const VK_F10: u32 = 0x79;
    pub const VK_F11: u32 = 0x7A;
    pub const VK_F12: u32 = 0x7B;

    // Numpad
    pub const VK_MULTIPLY: u32 = 0x6A;
    pub const VK_ADD: u32 = 0x6B;
    pub const VK_SUBTRACT: u32 = 0x6D;
    pub const VK_DIVIDE: u32 = 0x6F;
}
