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
                    println!("[HotkeyManager] Received hotkey event: {:?}", event.id);

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
        // Page Up/Down
        0x21 => Ok(Code::PageUp),
        0x22 => Ok(Code::PageDown),

        // Function keys F1-F8
        0x70 => Ok(Code::F1),
        0x71 => Ok(Code::F2),
        0x72 => Ok(Code::F3),
        0x73 => Ok(Code::F4),
        0x74 => Ok(Code::F5),
        0x75 => Ok(Code::F6),
        0x76 => Ok(Code::F7),
        0x77 => Ok(Code::F8),

        _ => Err(anyhow::anyhow!("Unsupported virtual key code: 0x{:X}", vk)),
    }
}

pub mod vk_codes {
    // Page Up/Down
    pub const VK_PRIOR: u32 = 0x21;  // Page Up
    pub const VK_NEXT: u32 = 0x22;   // Page Down

    // Function keys
    pub const VK_F1: u32 = 0x70;
    pub const VK_F2: u32 = 0x71;
    pub const VK_F3: u32 = 0x72;
    pub const VK_F4: u32 = 0x73;
    pub const VK_F5: u32 = 0x74;
    pub const VK_F6: u32 = 0x75;
    pub const VK_F7: u32 = 0x76;
    pub const VK_F8: u32 = 0x77;
}
