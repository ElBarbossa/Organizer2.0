# 🚀 Scripts d'Installation et d'Utilisation - RustFocus

## 📋 Scripts Disponibles

### 🔨 `install.bat` - Installation Complète (RECOMMANDÉ)
**Ce que ça fait** :
- ✅ Installe automatiquement Rust si nécessaire
- ✅ Télécharge toutes les dépendances
- ✅ Compile l'application en mode optimisé
- ✅ Crée un raccourci sur le bureau
- ⏱️ Durée : 10-20 minutes (première fois)

**Utilisation** :
```
Double-clic sur install.bat
```

Aucune confirmation demandée, tout est automatique !

---

### 🏗️ `build.bat` - Compilation Automatique
**Ce que ça fait** :
- ✅ Vérifie et installe Rust automatiquement
- ✅ Télécharge les dépendances Cargo
- ✅ Compile en mode release (optimisé)
- ⏱️ Durée : 10-15 minutes (première fois), 2-5 min ensuite

**Utilisation** :
```
Double-clic sur build.bat
```

**Résultat** :
- `src-tauri\target\release\rustfocus.exe` (~6 Mo)

---

### ▶️ `run.bat` - Lancement de l'Application
**Ce que ça fait** :
- ✅ Lance l'application si elle est compilée
- ✅ Propose de compiler si elle n'existe pas encore
- ⚡ Démarrage instantané

**Utilisation** :
```
Double-clic sur run.bat
```

---

### 🔧 `run-dev.bat` - Mode Développement
**Ce que ça fait** :
- ✅ Lance en mode debug avec hot-reload
- ✅ Utile pour tester des modifications
- ⏱️ Compilation plus rapide mais exe plus gros

**Utilisation** :
```
Double-clic sur run-dev.bat
```

---

### 🧹 `clean.bat` - Nettoyage
**Ce que ça fait** :
- ✅ Supprime les fichiers de build
- ✅ Libère de l'espace disque (~2 Go)
- ✅ Permet de recompiler depuis zéro

**Utilisation** :
```
Double-clic sur clean.bat
```

---

## 🎯 Guide de Démarrage Rapide

### Pour Installer et Lancer (3 clics)

**Méthode 1 : Installation complète (recommandé)**
```
1. Double-clic sur install.bat
2. Attendre la fin de la compilation
3. Double-clic sur le raccourci "RustFocus" sur le bureau
```

**Méthode 2 : Séparée**
```
1. Double-clic sur build.bat
2. Attendre la fin
3. Double-clic sur run.bat
```

---

## 📦 Ce qui est Téléchargé Automatiquement

### Si Rust n'est pas installé :
- **rustup-init.exe** (~10 Mo)
- **Rust toolchain** (~200 Mo)
- **Cargo** (inclus avec Rust)

### Dépendances Rust (via Cargo) :
- **tauri** et ses dépendances (~300 Mo)
- **windows-rs** pour les API Windows
- **serde/serde_json** pour JSON
- **parking_lot** pour les locks performants
- **anyhow** pour la gestion d'erreurs

**Total première installation** : ~500-600 Mo

---

## 🛠️ Détails Techniques des Scripts

### build.bat
```batch
1. Vérifie PowerShell
2. Lance build.ps1
3. Affiche le résultat
```

### build.ps1 (PowerShell)
```powershell
1. Vérifie si Rust est installé
   └─> Si non : télécharge et installe automatiquement
2. Télécharge les dépendances (cargo fetch)
3. Compile en release (cargo build --release)
4. Affiche le chemin de l'exe
```

### run.bat
```batch
1. Cherche rustfocus.exe dans target/release/
2. Si trouvé : lance l'application
3. Si non trouvé : propose de compiler
```

---

## ❓ FAQ des Scripts

### Q : Les scripts demandent des confirmations ?
**R :** Non ! Tout est en mode silencieux (`-y` pour Rust, pas de prompts).

### Q : Dois-je avoir les droits administrateur ?
**R :** Non, l'installation de Rust se fait en mode utilisateur.

### Q : Ça fonctionne sans connexion Internet ?
**R :** Non, Internet est requis pour télécharger Rust et les dépendances.

### Q : Puis-je supprimer les fichiers après la compilation ?
**R :** Oui, une fois compilé, vous pouvez :
- Copier `rustfocus.exe` ailleurs
- Supprimer le dossier `target/` (2 Go)
- Conserver juste l'exe (~6 Mo)

### Q : Le script build.bat bloque à une étape ?
**R :** Vérifiez :
- Connexion Internet active
- Pas de proxy d'entreprise bloquant
- Antivirus ne bloque pas rustup-init.exe

---

## 🔧 Configuration Avancée

### Modifier l'Installation de Rust
Éditez `build.ps1`, ligne ~45 :
```powershell
Start-Process -FilePath $rustupPath -ArgumentList "-y", "--default-toolchain", "stable"
```

Options disponibles :
- `--default-toolchain nightly` : version nightly
- `--profile minimal` : installation minimale
- `--no-modify-path` : ne pas modifier le PATH

### Compiler avec Optimisations Maximales
Éditez `src-tauri/Cargo.toml`, ajoutez :
```toml
[profile.release]
opt-level = "z"        # Optimisation taille
lto = true             # Link Time Optimization
codegen-units = 1      # Compilation en 1 unité
strip = true           # Supprimer symboles debug
```

Puis relancez `build.bat`.

---

## 📊 Temps de Compilation Attendus

| Étape | Première fois | Fois suivantes |
|-------|---------------|----------------|
| Installation Rust | 5-10 min | 0 sec (déjà installé) |
| Téléchargement deps | 2-5 min | 0 sec (en cache) |
| Compilation | 5-15 min | 2-5 min (incrémentale) |
| **TOTAL** | **12-30 min** | **2-5 min** |

---

## 🎮 Utilisation Post-Installation

Une fois installé, vous avez plusieurs options :

### Option 1 : Raccourci Bureau
```
Double-clic sur "RustFocus" sur le bureau
```

### Option 2 : Script run.bat
```
Double-clic sur run.bat
```

### Option 3 : Directement l'exe
```
src-tauri\target\release\rustfocus.exe
```

### Option 4 : Copier l'exe ailleurs
```
1. Copier rustfocus.exe n'importe où
2. Double-clic pour lancer
   (aucune dépendance externe requise !)
```

---

## 🚨 Résolution de Problèmes

### Erreur : "PowerShell n'est pas installé"
**Solution** : PowerShell est normalement préinstallé sur Windows 10/11.
Si manquant, installez manuellement Rust depuis https://rustup.rs/

### Erreur : "Failed to download rustup-init.exe"
**Causes** :
- Pas de connexion Internet
- Firewall/proxy bloque l'accès
- Antivirus bloque le téléchargement

**Solutions** :
1. Vérifier la connexion Internet
2. Désactiver temporairement l'antivirus
3. Installer Rust manuellement : https://rustup.rs/

### Erreur : "cargo : command not found"
**Cause** : Rust installé mais PATH pas à jour

**Solutions** :
1. Redémarrer le terminal
2. Redémarrer l'ordinateur
3. Ou ajouter manuellement au PATH : `%USERPROFILE%\.cargo\bin`

### Erreur : "error: linker 'link.exe' not found"
**Cause** : Compilateur C++ manquant

**Solution** : Installer Visual Studio Build Tools
- Télécharger : https://visualstudio.microsoft.com/downloads/
- Sélectionner : "Desktop development with C++"

### Compilation très lente
**Cause** : Antivirus scanne chaque fichier compilé

**Solution** :
1. Ajouter une exception dans l'antivirus pour le dossier `target/`
2. Ou désactiver temporairement l'antivirus pendant la compilation

---

## 📁 Structure Après Installation

```
Organizer2.0/
├── build.bat              ← Script de compilation
├── build.ps1              ← Script PowerShell (appelé par build.bat)
├── run.bat                ← Script de lancement
├── run-dev.bat            ← Lancement en mode dev
├── clean.bat              ← Nettoyage
├── install.bat            ← Installation complète
│
├── src-tauri/
│   ├── target/
│   │   ├── release/
│   │   │   └── rustfocus.exe    ← EXECUTABLE FINAL (~6 Mo)
│   │   └── debug/               ← Version debug (plus grosse)
│   └── Cargo.toml
│
└── src/
    └── (frontend files)
```

---

## 🎯 Commandes Équivalentes Manuelles

Si vous préférez taper les commandes vous-même :

### Build manuel
```batch
cd src-tauri
cargo build --release
cd ..
```

### Lancement manuel
```batch
src-tauri\target\release\rustfocus.exe
```

### Nettoyage manuel
```batch
cd src-tauri
cargo clean
cd ..
```

---

## 💡 Astuces

### Accélérer les Compilations Futures
Après la première compilation, Rust met en cache les dépendances.
Les compilations suivantes ne recompilent que votre code (~2 min).

### Réduire la Taille de l'Exe
Ajoutez dans `Cargo.toml` :
```toml
[profile.release]
opt-level = "z"
strip = true
lto = true
```

L'exe passera de ~6 Mo à ~3-4 Mo.

### Compiler Plus Rapidement (Dev)
Utilisez `run-dev.bat` au lieu de `build.bat`.
Compilation 2-3x plus rapide, mais exe plus gros.

---

**Tout est prêt ! Lancez `install.bat` et profitez de RustFocus ! 🚀**
