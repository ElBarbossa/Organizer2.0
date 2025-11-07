# 🚀 RustFocus - Démarrage Rapide

## ⚡ Installation en 1 Clic

**Pour les utilisateurs Windows (RECOMMANDÉ)** :

```
1. Double-clic sur install.bat
2. Attendre 10-20 minutes
3. C'est prêt !
```

Tout est automatique :
- ✅ Installation de Rust (si nécessaire)
- ✅ Téléchargement des dépendances
- ✅ Compilation optimisée
- ✅ Création du raccourci bureau
- ❌ **AUCUNE confirmation demandée**

---

## 📜 Liste des Scripts Disponibles

| Script | Description | Durée |
|--------|-------------|-------|
| `install.bat` | **Installation complète** (build + raccourci) | 10-20 min |
| `build.bat` | Compilation automatique (avec install Rust) | 10-15 min |
| `run.bat` | Lancer l'application | Instantané |
| `run-dev.bat` | Lancer en mode développement | Variable |
| `clean.bat` | Nettoyer les fichiers de build | 5-10 sec |
| `update.bat` | Mettre à jour Rust et recompiler | 5-10 min |

**Détails complets** : voir [SCRIPTS_README.md](SCRIPTS_README.md)

---

## 🎯 Scénarios d'Utilisation

### 🆕 Première Installation
```
Double-clic sur install.bat
```
→ Installe tout automatiquement

---

### ▶️ Lancer le Programme
```
Double-clic sur run.bat
```
→ Lance l'application (ou propose de compiler si besoin)

**OU**

```
Double-clic sur le raccourci bureau "RustFocus"
```

---

### 🔄 Recompiler Après Modifications du Code
```
Double-clic sur build.bat
```
→ Recompile uniquement (Rust déjà installé)

---

### 🧹 Libérer de l'Espace Disque
```
Double-clic sur clean.bat
```
→ Supprime ~2 Go de fichiers temporaires

---

### 🔧 Développement / Tests
```
Double-clic sur run-dev.bat
```
→ Lance en mode debug avec hot-reload

---

### 📦 Mettre à Jour
```
Double-clic sur update.bat
```
→ Met à jour Rust et les dépendances, puis recompile

---

## 🎮 Utilisation de RustFocus

### Première Utilisation

1. **Lancer Dofus** (autant de clients que vous voulez)
2. **Lancer RustFocus** (via le raccourci ou run.bat)
3. **Cliquer sur "🔄 Refresh Windows"**
4. Vos personnages apparaissent dans la liste !

### Raccourcis Clavier (Globaux)

| Touche | Action |
|--------|--------|
| `Page Down` | Fenêtre suivante |
| `Page Up` | Fenêtre précédente |
| `F1` à `F8` | Accès direct aux fenêtres 1 à 8 |

**Ces raccourcis fonctionnent même quand Dofus est au premier plan !**

### Organiser l'Ordre

- **Drag & Drop** : Glissez-déposez les personnages dans l'ordre voulu
- L'ordre définit le cycle Page Up/Down

### Sauvegarder des Profils

1. Onglet **"Profiles"**
2. Entrer un nom (ex: "Farm Team")
3. Cliquer **"Save Current Profile"**

### Charger un Profil

1. Onglet **"Profiles"**
2. Cliquer **"Load"** sur le profil voulu

---

## 🐛 Problèmes Courants

### Script bloque ou erreur réseau
**Cause** : Firewall, antivirus, ou proxy bloque le téléchargement

**Solution** :
1. Vérifier connexion Internet
2. Désactiver temporairement l'antivirus
3. Si en entreprise : configurer proxy

### "Rust already installed" mais erreurs
**Cause** : PATH pas à jour

**Solution** :
1. Redémarrer l'ordinateur
2. Relancer build.bat

### Compilation très lente
**Cause** : Antivirus scanne chaque fichier

**Solution** :
1. Ajouter exception pour dossier `target/`
2. Ou désactiver temporairement

### "No Dofus windows detected"
**Cause** : Dofus pas lancé ou fenêtre minimisée

**Solution** :
1. Lancer Dofus
2. S'assurer que la fenêtre est visible
3. Cliquer "🔄 Refresh Windows"

---

## 📊 Espace Disque Requis

| Composant | Taille |
|-----------|--------|
| Rust toolchain | ~200 Mo |
| Dépendances (cache Cargo) | ~300 Mo |
| Fichiers de build (target/) | ~1.5-2 Go |
| **Executable final** | **~6 Mo** |

💡 **Astuce** : Après compilation, vous pouvez :
- Copier `rustfocus.exe` ailleurs
- Exécuter `clean.bat` pour libérer ~2 Go
- Conserver juste l'exe (6 Mo) qui fonctionne seul !

---

## 🔐 Sécurité & Conformité

✅ **RustFocus est 100% conforme aux CGU Dofus**

**Ce que l'application FAIT** :
- ✅ Change la fenêtre active (comme Alt+Tab)
- ✅ C'est tout !

**Ce que l'application NE FAIT PAS** :
- ❌ Pas d'automation d'input
- ❌ Pas de simulation clavier/souris
- ❌ Pas de lecture de mémoire
- ❌ Pas de modification de fichiers du jeu
- ❌ Pas de multiplexing (duplication d'actions)

**Code source** : 100% open source, vérifiable dans `src-tauri/src/`

---

## 📞 Besoin d'Aide ?

1. **Documentation complète** : [README.md](README.md)
2. **Guide des scripts** : [SCRIPTS_README.md](SCRIPTS_README.md)
3. **Guide de build** : [BUILDING.md](BUILDING.md)
4. **Notes techniques** : [NOTES_FR.md](NOTES_FR.md)
5. **GitHub Issues** : https://github.com/ElBarbossa/Organizer2.0/issues

---

## ⚡ TL;DR (Trop Long, Pas Lu)

```
1. Double-clic install.bat
2. Attendre 15 minutes
3. Lancer Dofus (plusieurs clients)
4. Double-clic sur RustFocus (raccourci bureau)
5. Cliquer "Refresh Windows"
6. Utiliser Page Down/Up pour switcher
7. Profit ! 🎮
```

---

**Bon farm ! 🚀✨**
