# 🛠️ Organizer 2.0 - Documentation Développeur

## 🎯 Vue d'Ensemble Technique

Organizer 2.0 est une application Windows native pour la gestion de fenêtres multiples Dofus, construite avec **Rust** et **Tauri**. L'architecture sépare clairement le backend (Rust) pour les performances système et le frontend (HTML/CSS/JS) pour l'interface utilisateur.

## 🏗️ Architecture

### Backend (Rust)
```
src-tauri/
├── src/
│   ├── main.rs              # Application principale & commandes Tauri
│   ├── window_manager.rs    # Détection & gestion du focus des fenêtres
│   ├── hotkey_manager.rs    # Enregistrement & gestion des raccourcis globaux
│   └── profile_manager.rs   # Fonctionnalité sauvegarde/chargement profils
├── Cargo.toml               # Dépendances Rust
└── tauri.conf.json          # Configuration Tauri
```

### Frontend (HTML/CSS/JS)
```
src/
├── index.html               # Structure UI principale
├── styles.css               # Thème sombre moderne
└── app.js                   # Logique application & intégration API Tauri
```

## 📋 Prérequis de Développement

### Outils Requis
- **Rust** (dernière version stable) - [Installer ici](https://rustup.rs/)
- **Node.js** 16+ - [Télécharger ici](https://nodejs.org/)
- **npm** (inclus avec Node.js)
- **Windows 10/11** (64-bit)

### Vérifier l'Installation
```bash
rustc --version
cargo --version
node --version
npm --version
```

## 🏗️ Construction depuis les Sources

### 🚀 Démarrage Rapide (Automatique - Windows)

**Méthode la plus simple - Tout est automatique !**

1. **Installation Complète** (Recommandée) :
```batch
# Double-cliquez sur install.bat
# Cela va :
# - Installer Rust automatiquement si nécessaire
# - Télécharger toutes les dépendances
# - Compiler l'application
# - Créer un raccourci bureau
```

2. **Ou Juste Construire** :
```batch
# Double-cliquez sur build.bat
# Installation Rust automatique + compilation
```

3. **Puis Lancer** :
```batch
# Double-cliquez sur run.bat
# Ou utilisez le raccourci bureau
```

📖 **Voir [SCRIPTS_README.md](SCRIPTS_README.md) pour la documentation détaillée des scripts**

---

### 🛠️ Construction Manuelle (Avancé)

#### 1. Cloner le Dépôt
```bash
git clone https://github.com/ElBarbossa/Organizer2.0.git
cd Organizer2.0
```

#### 2. Installer les Dépendances
```bash
cd src-tauri
cargo fetch
```

#### 3. Build de Développement
```bash
# Lancer en mode développement avec rechargement à chaud
cargo tauri dev
```

#### 4. Build de Production
```bash
# Construire le binaire release optimisé
cargo tauri build
```

L'exécutable compilé sera situé dans :
```
src-tauri/target/release/rustfocus.exe
```

L'installeur (MSI) sera dans :
```
src-tauri/target/release/bundle/msi/rustfocus_1.0.0_x64_en-US.msi
```

## ⚙️ Configuration

### Raccourcis Clavier Personnalisés
Actuellement, les raccourcis sont prédéfinis sur :
- `Page Bas` - Fenêtre suivante
- `Page Haut` - Fenêtre précédente
- `F1`-`F8` - Accès direct aux fenêtres

Pour modifier les raccourcis, éditez `src-tauri/src/main.rs` dans la fonction `setup_default_hotkeys`.

### Stockage des Profils
Les profils sont stockés en fichiers JSON dans :
```
%APPDATA%\Organizer 2.0\profiles\
```

## 🔧 Dépannage

### "Aucune fenêtre Dofus détectée"
- S'assurer que Dofus fonctionne
- Essayer de cliquer sur "Actualiser Fenêtres"
- Vérifier que le titre de la fenêtre contient "Dofus"

### Raccourcis ne fonctionnent pas
- Vérifier si une autre application utilise les mêmes raccourcis
- Redémarrer Organizer 2.0
- Lancer en tant qu'Administrateur si nécessaire

### Fenêtre ne prend pas le focus
- S'assurer que la fenêtre Dofus existe encore
- Actualiser la liste des fenêtres
- Vérifier si le jeu est minimisé dans la barre des tâches

### Utilisation CPU/Mémoire Élevée
Cela ne devrait pas arriver ! Si c'est le cas :
1. Fermer Organizer 2.0
2. Supprimer `%APPDATA%\Organizer 2.0\profiles\current.json`
3. Redémarrer Organizer 2.0
4. Signaler le problème sur GitHub

## 🧪 Tests

### Checklist de Tests Manuels
- [ ] Détecte toutes les fenêtres Dofus en cours
- [ ] Liste des fenêtres affiche les noms corrects des personnages
- [ ] Glisser-déposer pour réorganiser fonctionne
- [ ] Page Haut/Bas parcourt les fenêtres
- [ ] F1-F8 focus sur fenêtres spécifiques
- [ ] Sauvegarde/chargement profils fonctionne correctement
- [ ] Barre des tâches affiche/masque la fenêtre
- [ ] Zéro utilisation CPU au repos
- [ ] Utilisation mémoire reste sous 50 Mo

### Tests de Performance
```bash
# Surveiller l'utilisation des ressources en cours d'exécution
# Gestionnaire de tâches > Détails > rustfocus.exe
# Attendu : 0% CPU, <50 Mo RAM au repos
```

## 📝 Détails Techniques

### Fonctions API Windows Utilisées
- `EnumWindows` - Énumérer toutes les fenêtres de niveau supérieur
- `GetWindowTextW` - Récupérer les titres des fenêtres
- `GetWindowThreadProcessId` - Vérifier la propriété du processus
- `SetForegroundWindow` - Mettre la fenêtre au premier plan ✅ **Seule action effectuée**
- `RegisterHotKey` - Enregistrer les raccourcis clavier globaux
- `GetMessageW` - Écouter les événements de raccourcis

### Dépendances Clés
```toml
tauri = "1.5"              # Framework d'application
windows = "0.58"           # Bindings API Windows
serde = "1.0"              # Sérialisation JSON
parking_lot = "0.12"       # Verrous haute performance
```

## 🤝 Contribution

Les contributions sont les bienvenues ! Veuillez vous assurer :
1. Le code suit les meilleures pratiques Rust
2. Aucune introduction de fonctionnalités d'automatisation
3. Maintenir la conformité aux CGU
4. Les performances restent optimales

## 🐛 Problèmes Connus

- Espaces réservés d'icônes à remplacer par de vraies icônes d'application
- Personnalisation des raccourcis actuellement basée sur le code (pas GUI)
- Pas de support pour plus de 8 raccourcis d'accès direct (F1-F8)

## 🔮 Améliorations Futures

- [ ] Personnalisation des raccourcis basée sur GUI
- [ ] Support pour raccourcis F9-F12
- [ ] Vignettes d'aperçu des fenêtres
- [ ] Option d'actualisation automatique
- [ ] Support positionnement multi-moniteur
- [ ] Import/export d'ensembles de profils

## 📞 Support

Pour les problèmes, questions, ou demandes de fonctionnalités :
- Ouvrir une issue sur GitHub
- Vérifier les issues existantes d'abord
- Fournir des messages d'erreur détaillés et des logs

---

**Construit avec ❤️ utilisant Rust + Tauri**