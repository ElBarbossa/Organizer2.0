# 📁 Structure du Projet RustFocus

## 🗂️ Vue d'Ensemble

```
Organizer2.0/
│
├── 📜 Scripts d'Installation (COMMENCER ICI!)
│   ├── install.bat              ⭐ Installation complète automatique
│   ├── build.bat                🔨 Compilation automatique
│   ├── build.ps1                🔧 Script PowerShell (auto-install Rust)
│   ├── run.bat                  ▶️ Lancer l'application
│   ├── run-dev.bat              🔧 Lancer en mode dev
│   ├── clean.bat                🧹 Nettoyer les fichiers de build
│   └── update.bat               🔄 Mettre à jour et recompiler
│
├── 📖 Documentation
│   ├── QUICKSTART.md            ⚡ Démarrage rapide (LIRE EN PREMIER!)
│   ├── README.md                📘 Documentation utilisateur complète
│   ├── SCRIPTS_README.md        📗 Guide détaillé des scripts
│   ├── BUILDING.md              🏗️ Guide de compilation avancé
│   ├── NOTES_FR.md              📝 Notes techniques en français
│   ├── PROJECT_SUMMARY.md       📊 Résumé du projet
│   └── PROJECT_STRUCTURE.md     📁 Ce fichier
│
├── 🦀 Backend Rust (src-tauri/)
│   ├── src/
│   │   ├── main.rs              🎯 Application principale + Tauri commands
│   │   ├── window_manager.rs    🪟 Détection des fenêtres Dofus (UnityWndClass)
│   │   ├── hotkey_manager.rs    ⌨️ Gestion des raccourcis globaux
│   │   └── profile_manager.rs   💾 Sauvegarde/chargement profils JSON
│   │
│   ├── Cargo.toml               📦 Dépendances Rust
│   ├── tauri.conf.json          ⚙️ Configuration Tauri
│   ├── build.rs                 🔨 Script de build
│   │
│   └── target/                  🎯 Fichiers compilés (créé après build)
│       ├── release/
│       │   └── rustfocus.exe    ⭐ EXECUTABLE FINAL (~6 Mo)
│       └── debug/               (version debug, plus grosse)
│
├── 🌐 Frontend (src/)
│   ├── index.html               📄 Structure UI (3 onglets)
│   ├── styles.css               🎨 Thème sombre moderne
│   └── app.js                   ⚡ Logique app (drag-drop, Tauri API)
│
└── ⚙️ Configuration
    ├── .gitignore               🚫 Fichiers ignorés par Git
    └── .git/                    🔀 Repository Git

```

## 📦 Tailles de Fichiers

| Élément | Taille | Notes |
|---------|--------|-------|
| **Scripts** | ~30 Ko | Tous les .bat et .ps1 |
| **Documentation** | ~200 Ko | Tous les .md |
| **Code source** | ~50 Ko | Rust + HTML/CSS/JS |
| **Dépendances** (après fetch) | ~300 Mo | Cache Cargo |
| **Build artifacts** | ~1.5-2 Go | Dossier target/ |
| **Executable final** | **~6 Mo** | rustfocus.exe |

## 🚀 Workflow d'Installation

```
1. Télécharger le projet
   └─> git clone ou download ZIP

2. Double-clic sur install.bat
   ├─> Vérifie si Rust est installé
   │   └─> Si non : télécharge et installe automatiquement
   ├─> Télécharge les dépendances (cargo fetch)
   ├─> Compile en mode release
   └─> Crée un raccourci bureau

3. Double-clic sur le raccourci "RustFocus"
   └─> L'application se lance !
```

## 🔍 Fichiers Importants par Catégorie

### 🎯 Pour Démarrer
- `install.bat` - Installation en 1 clic
- `QUICKSTART.md` - Guide ultra-rapide

### 🎮 Pour Utiliser
- `run.bat` - Lancer l'app
- `src-tauri/target/release/rustfocus.exe` - Executable
- `README.md` - Mode d'emploi

### 🛠️ Pour Développer
- `src-tauri/src/main.rs` - Code principal
- `src-tauri/src/window_manager.rs` - Détection fenêtres
- `src/app.js` - Frontend JavaScript
- `run-dev.bat` - Mode développement

### 📖 Pour Comprendre
- `PROJECT_SUMMARY.md` - Résumé technique
- `NOTES_FR.md` - Détails techniques en français
- `BUILDING.md` - Compilation avancée

## 🔧 Modules Backend (Rust)

### main.rs (380 lignes)
```rust
- AppState struct (état partagé)
- Commandes Tauri :
  ├─ detect_windows()
  ├─ focus_window()
  ├─ update_window_order()
  ├─ setup_default_hotkeys()
  ├─ save_profile()
  ├─ load_profile()
  ├─ list_profiles()
  └─ delete_profile()
- System tray event handler
```

### window_manager.rs (145 lignes)
```rust
- DofusWindow struct
- detect_dofus_windows()
  └─> EnumWindows callback
      ├─> Vérifie IsWindowVisible
      ├─> Vérifie GetClassNameW == "UnityWndClass"
      ├─> Vérifie titre contient "Dofus"
      └─> Extrait nom du personnage
- focus_window()
  └─> SetForegroundWindow (SEULE action autorisée!)
```

### hotkey_manager.rs (185 lignes)
```rust
- HotkeyManager struct
- Hotkey struct
- HotkeyAction enum { NextWindow, PreviousWindow, DirectWindow(usize) }
- register_hotkey()
  └─> RegisterHotKey avec MOD_NOREPEAT
- start_listening()
  └─> Thread séparé avec GetMessageW
- Callback system pour événements
```

### profile_manager.rs (165 lignes)
```rust
- Profile struct
- ProfileManager struct
- save_profile() → JSON
- load_profile() ← JSON
- list_profiles()
- delete_profile()
- Stockage : %APPDATA%/RustFocus/profiles/
```

## 🌐 Structure Frontend

### index.html (95 lignes)
```html
<header> Logo + titre </header>
<nav> 3 onglets: Windows | Settings | Profiles </nav>
<main>
  ├─ Windows Tab : Liste drag-and-drop
  ├─ Settings Tab : Configuration hotkeys
  └─ Profiles Tab : CRUD profils
</main>
<footer> Infos conformité </footer>
```

### styles.css (450 lignes)
```css
:root { Variables thème sombre }
.tab-nav { Navigation onglets }
.window-list { Liste fenêtres Dofus }
.window-item { Carte personnage draggable }
Drag & drop animations
Dark theme moderne
```

### app.js (340 lignes)
```javascript
init()
├─ setupTabs()
├─ setupEventListeners()
├─ loadWindows() → invoke('detect_windows')
├─ setupHotkeys() → invoke('setup_default_hotkeys')
└─ loadProfiles() → invoke('list_profiles')

Drag & Drop :
├─ handleDragStart()
├─ handleDragOver()
├─ handleDrop()
└─ updateWindowOrder() → invoke('update_window_order')
```

## 📊 Flux de Données

```
Frontend (JavaScript)
    ↓ invoke('detect_windows')
Backend Rust (Tauri Command)
    ↓ window_manager::detect_dofus_windows()
Windows API
    ↓ EnumWindows + GetClassNameW
Fenêtres Dofus
    ↓ Return Vec<DofusWindow>
Backend → Frontend
    ↓ Affichage dans UI
```

## 🎯 Points d'Entrée

### Pour l'Utilisateur
1. `install.bat` → Tout installer
2. `run.bat` ou raccourci → Lancer l'app
3. Interface graphique → Utiliser

### Pour le Développeur
1. `run-dev.bat` → Mode dev
2. `src-tauri/src/main.rs` → Backend
3. `src/app.js` → Frontend

## 🔐 Conformité CGU Dofus

**Fichier concerné** : `src-tauri/src/window_manager.rs`

```rust
// LIGNE 115 - SEULE ACTION AUTORISEE :
pub fn focus_window(handle: isize) -> Result<()> {
    unsafe {
        let hwnd = HWND(handle as *mut _);
        SetForegroundWindow(hwnd)?; // ← C'est TOUT !
    }
    Ok(())
}
```

**Ce qui N'existe PAS dans le code** :
- ❌ SendInput / SendMessage
- ❌ SetCursorPos / mouse_event  
- ❌ keybd_event
- ❌ ReadProcessMemory
- ❌ WriteProcessMemory
- ❌ Hooks clavier/souris

**= 100% conforme aux CGU Dofus**

## 📈 Progression de Build

```
1. [0%]    install.bat lancé
2. [5%]    Vérification Rust
3. [10%]   Téléchargement rustup (si nécessaire)
4. [20%]   Installation Rust (~5 min)
5. [30%]   cargo fetch (~2 min)
6. [40%]   Début compilation
7. [60%]   Compilation dépendances (~5 min)
8. [90%]   Compilation RustFocus (~2 min)
9. [95%]   Création raccourci
10. [100%] Terminé !
```

Total première fois : **10-20 minutes**

## 🗄️ Fichiers Créés Après Installation

```
%APPDATA%/RustFocus/
└── profiles/
    ├── current.json         (profil auto-save)
    ├── Farm Team.json       (profils utilisateur)
    └── PvP Squad.json

%USERPROFILE%/.cargo/
└── bin/
    ├── rustc.exe
    ├── cargo.exe
    └── rustup.exe

Desktop/
└── RustFocus.lnk           (raccourci)
```

## 💾 Nettoyage Post-Installation

Pour libérer de l'espace après build :

```
1. Copier rustfocus.exe ailleurs
2. Exécuter clean.bat
   → Supprime ~2 Go dans target/
3. Optionnel : désinstaller Rust
   → Libère ~200 Mo supplémentaires
```

L'exe (6 Mo) fonctionne seul, sans dépendances !

---

**📍 Où aller maintenant ?**

- **Installer** → `install.bat`
- **Lire** → `QUICKSTART.md`
- **Lancer** → `run.bat` ou raccourci
- **Comprendre** → `README.md`
- **Développer** → `BUILDING.md`

**Bon farming ! 🎮✨**
