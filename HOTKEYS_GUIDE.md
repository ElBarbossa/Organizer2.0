# 🎮 Guide des Raccourcis Clavier - RustFocus

## 🎉 Les raccourcis clavier globaux sont maintenant ACTIFS !

Les hotkeys fonctionnent **partout dans Windows**, même quand Dofus est au premier plan.

---

## ⌨️ Raccourcis Disponibles

### Navigation Cyclique

| Touche | Action |
|--------|--------|
| **Page Down** | Passer à la fenêtre Dofus suivante |
| **Page Up** | Revenir à la fenêtre Dofus précédente |

### Accès Direct

| Touche | Action |
|--------|--------|
| **F1** | Accès direct à la fenêtre #1 |
| **F2** | Accès direct à la fenêtre #2 |
| **F3** | Accès direct à la fenêtre #3 |
| **F4** | Accès direct à la fenêtre #4 |
| **F5** | Accès direct à la fenêtre #5 |
| **F6** | Accès direct à la fenêtre #6 |
| **F7** | Accès direct à la fenêtre #7 |
| **F8** | Accès direct à la fenêtre #8 |

---

## 🧪 Comment Tester

### 1. Lancer RustFocus en Mode Debug

```powershell
.\rustfocus.ps1 debug
```

### 2. Détecter vos Fenêtres Dofus

1. Lancez plusieurs clients Dofus
2. Dans RustFocus, cliquez sur **"🔍 Détecter les fenêtres"**
3. Vérifiez que toutes vos fenêtres sont listées

### 3. Tester les Raccourcis

**Pendant que Dofus est actif au premier plan** :

✅ Appuyez sur **Page Down** → la fenêtre Dofus suivante devrait passer au premier plan
✅ Appuyez sur **Page Up** → la fenêtre Dofus précédente devrait passer au premier plan
✅ Appuyez sur **F1** → la première fenêtre Dofus devrait passer au premier plan
✅ Appuyez sur **F2** → la deuxième fenêtre Dofus devrait passer au premier plan

### 4. Vérifier les Logs

Dans la console PowerShell, vous devriez voir :

```
[HotkeyManager] Registered hotkey ID 1 (global ID: ...)
[HotkeyManager] Registered hotkey ID 2 (global ID: ...)
...
[HotkeyManager] Started listening for hotkey events
```

Quand vous appuyez sur une touche :

```
[HotkeyManager] Received hotkey event: 123
[HotkeyManager] Executing action: NextWindow
[RustFocus] Fenêtre focalisée: 12345678
```

---

## 🔧 Implémentation Technique

### Crate Utilisée

**`global-hotkey` v0.6** - Crate officielle de tauri-apps
- Cross-platform (Windows, Linux, macOS)
- Hotkeys système entier
- Thread-safe

### Architecture

```
┌─────────────────────┐
│   main.rs           │  ← Commande Tauri: setup_default_hotkeys
│                     │
│  ┌──────────────┐   │
│  │ AppState     │   │
│  │              │   │
│  │ HotkeyManager│◄──┼─── GlobalHotKeyManager
│  └──────────────┘   │       (crate global-hotkey)
│         │            │
│         ▼            │
│  handle_hotkey_      │
│  action()            │
│         │            │
│         ▼            │
│  window_manager::    │
│  focus_window()      │
│         │            │
│         ▼            │
│  SetForegroundWindow │  ← Windows API (ToS compliant)
└─────────────────────┘
```

### Fonctionnement

1. **Enregistrement** : `register_hotkey()` enregistre chaque touche avec `GlobalHotKeyManager`
2. **Thread d'écoute** : Un thread séparé écoute les événements avec `GlobalHotKeyEvent::receiver()`
3. **Callback** : Quand une touche est pressée, le callback est appelé avec l'action associée
4. **Action** : `handle_hotkey_action()` trouve la fenêtre correspondante et appelle `SetForegroundWindow`

### Code Clé

```rust
// Enregistrement d'une hotkey
let code = Code::PageDown;
let hotkey = HotKey::new(None, code);
manager.register(hotkey)?;

// Thread d'écoute
thread::spawn(move || {
    let receiver = GlobalHotKeyEvent::receiver();
    loop {
        if let Ok(event) = receiver.try_recv() {
            // Appeler le callback avec l'action
            callback(action);
        }
    }
});
```

---

## ✅ Conformité CGU (ToS Compliant)

Les raccourcis sont **100% conformes** aux CGU de Dofus :

✅ **Uniquement du changement de focus** → `SetForegroundWindow`
✅ **Pas d'automatisation** → Aucune action dans le jeu
✅ **Pas d'injection d'input** → Pas de simulation clavier/souris
✅ **Pas de modification du client** → Aucun hook ou injection
✅ **Pas de lecture de mémoire** → Juste détection de fenêtres

**Ce que fait RustFocus :**
- Détecte les fenêtres Dofus (par classe Windows `UnityWndClass`)
- Met la fenêtre au premier plan quand vous appuyez sur une touche
- C'est tout !

**Ce que RustFocus NE fait PAS :**
- ❌ Automatiser des actions dans le jeu
- ❌ Cliquer ou taper à votre place
- ❌ Lire ou modifier la mémoire du jeu
- ❌ Modifier le client Dofus

---

## 🐛 Dépannage

### Les hotkeys ne fonctionnent pas

1. **Vérifiez que l'app est compilée et lancée :**
   ```powershell
   .\rustfocus.ps1 debug
   ```

2. **Vérifiez les logs :**
   - Vous devez voir `[HotkeyManager] Registered hotkey ID ...`
   - Et `[HotkeyManager] Started listening for hotkey events`

3. **Détectez les fenêtres Dofus :**
   - Cliquez sur "🔍 Détecter les fenêtres"
   - Au moins une fenêtre doit être détectée

4. **Testez pendant que Dofus est actif :**
   - Les hotkeys fonctionnent même quand Dofus est au premier plan
   - Essayez Page Down/Up

### Erreur "Failed to register hotkey"

Une autre application utilise peut-être la même touche.
Les touches F1-F8 et Page Up/Down sont généralement libres.

Si le problème persiste :
- Fermez les autres applications qui pourraient capturer ces touches
- Redémarrez Windows
- Relancez RustFocus

### Les fenêtres ne changent pas

1. **Vérifiez que Dofus est bien lancé**
2. **Cliquez sur "🔍 Détecter"** pour rafraîchir la liste
3. **Regardez les logs** pour voir si l'action est bien déclenchée

---

## 🎯 Prochaines Étapes

### Fonctionnalités Futures (Optionnel)

- [ ] Configuration personnalisée des touches
- [ ] Modificateurs (Ctrl, Shift, Alt) pour éviter les conflits
- [ ] Indicateur visuel de la fenêtre active
- [ ] Désactivation temporaire des hotkeys
- [ ] Import/Export de configuration

---

**💡 Les hotkeys sont là, profitez-en !** 🚀
