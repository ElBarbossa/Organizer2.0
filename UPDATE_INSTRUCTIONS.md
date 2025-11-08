# 🔄 Instructions pour les Mises à Jour Automatiques

Le système de mise à jour automatique est maintenant configuré dans l'application. Voici comment publier une nouvelle version pour que les utilisateurs puissent la télécharger automatiquement.

## 📋 Prérequis

- Rust installé (https://rustup.rs/)
- Avoir accès au dépôt GitHub `ElBarbossa/Organizer2.0`

## 🚀 Processus de Publication (AUTOMATISÉ)

### 1. Mettre à jour le numéro de version

Dans `src-tauri/tauri.conf.json` :
```json
{
  "package": {
    "productName": "Organizer 2.0",
    "version": "1.0.2"  // ← Incrémenter ici
  }
}
```

### 2. Lancer le script de build

**Option A : Menu interactif**
```powershell
.\rustfocus.ps1
```
Puis choisir l'option **7. Build GITHUB RELEASE**

**Option B : Ligne de commande**
```powershell
.\rustfocus.ps1 release
```

### 3. Suivre les instructions du script

Le script va :
1. ✅ Lire automatiquement la version depuis `tauri.conf.json`
2. ✅ Vous demander d'entrer le changelog (ou utiliser un changelog par défaut)
3. ✅ Générer automatiquement `latest.json`
4. ✅ Compiler l'application avec Tauri
5. ✅ Renommer le fichier `.exe` (enlever les espaces)
6. ✅ Créer un dossier `release-v{version}` avec tous les fichiers prêts

### 4. Le script crée automatiquement

Le fichier `latest.json` est généré avec ce format :

```json
{
  "version": "1.0.2",
  "notes": "Améliorations et corrections de bugs\n- Nouvelle interface de l'onglet Fenêtres\n- Système de mise à jour automatique\n- Correction du curseur bloqué",
  "pub_date": "2024-01-15T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "",
      "url": "https://github.com/ElBarbossa/Organizer2.0/releases/download/v1.0.2/Organizer.2.0_1.0.2_x64-setup.exe"
    }
  }
}
```

**Notes importantes :**
- `version` : Doit correspondre à celle dans `tauri.conf.json`
- `notes` : Description des changements (markdown supporté)
- `pub_date` : Date de publication au format ISO 8601
- `url` : URL de téléchargement du fichier `.exe` (remplacer les espaces par des points)
- `signature` : Laisser vide pour l'instant (optionnel)

### 5. Publier sur GitHub Releases

1. Aller sur https://github.com/ElBarbossa/Organizer2.0/releases
2. Cliquer sur "Draft a new release"
3. Remplir les champs :
   - **Tag version** : `v1.0.2` (avec le "v")
   - **Release title** : `Organizer 2.0 v1.0.2`
   - **Description** : Copier-coller le changelog que vous avez entré
4. **Uploader les fichiers** du dossier `release-v{version}` :
   - ✅ `Organizer.2.0_1.0.2_x64-setup.exe` (déjà renommé automatiquement)
   - ✅ `latest.json` (déjà généré automatiquement)
5. Cliquer sur "Publish release"

**C'est tout !** Le script a tout préparé pour vous 🎉

### 6. Vérifier que tout fonctionne

Après publication, vérifier que :
- L'URL du fichier est accessible : `https://github.com/ElBarbossa/Organizer2.0/releases/download/v1.0.2/Organizer.2.0_1.0.2_x64-setup.exe`
- Le `latest.json` est accessible : `https://github.com/ElBarbossa/Organizer2.0/releases/latest/download/latest.json`

## ✅ Test

1. Lancer l'ancienne version de l'application
2. Aller dans "Paramètres"
3. Cliquer sur "Vérifier les mises à jour"
4. Un message devrait apparaître avec la nouvelle version
5. Cliquer sur "Installer maintenant"
6. L'application se télécharge, s'installe et redémarre

## 💾 Données Préservées

Les données suivantes sont **automatiquement conservées** lors des mises à jour :
- ✅ Profils sauvegardés
- ✅ Raccourcis clavier personnalisés
- ✅ Fenêtres exclues
- ✅ Profil de lancement automatique
- ✅ Toutes les préférences (localStorage)

## 🔒 Signatures (Optionnel mais Recommandé)

Pour sécuriser les mises à jour avec des signatures :

1. Générer une paire de clés :
```bash
npm run tauri signer generate
```

2. Ajouter la clé publique dans `tauri.conf.json` :
```json
{
  "updater": {
    "pubkey": "YOUR_PUBLIC_KEY_HERE"
  }
}
```

3. Signer le fichier de mise à jour :
```bash
npm run tauri signer sign path/to/Organizer.2.0_1.0.2_x64-setup.exe
```

4. Ajouter la signature dans `latest.json` :
```json
{
  "platforms": {
    "windows-x86_64": {
      "signature": "SIGNATURE_GENERATED_HERE",
      "url": "..."
    }
  }
}
```

## 📝 Workflow Complet (Résumé)

```powershell
# 1. Éditer src-tauri/tauri.conf.json : version = "1.0.2"

# 2. Lancer le script
.\rustfocus.ps1 release

# 3. Entrer le changelog quand demandé (ou ligne vide pour changelog par défaut)

# 4. Attendre que le build se termine

# 5. Uploader les fichiers de release-v1.0.2/ sur GitHub

# C'est tout ! ✨
```

## 🐛 Dépannage

**Erreur "Impossible de vérifier les mises à jour"** :
- Vérifier que `latest.json` est bien accessible publiquement
- Vérifier que l'URL dans `tauri.conf.json` est correcte

**"Vous utilisez la dernière version" alors qu'une nouvelle existe** :
- Vérifier que le numéro de version dans `latest.json` est supérieur à celui dans `tauri.conf.json`
- Vérifier que le format de version est correct (sans "v")

**L'installation échoue** :
- Vérifier que l'URL du fichier `.exe` est correcte
- Vérifier que le fichier est bien téléchargeable publiquement
- Vérifier la signature si activée

## 📚 Documentation Tauri

Pour plus d'informations : https://tauri.app/v1/guides/distribution/updater
