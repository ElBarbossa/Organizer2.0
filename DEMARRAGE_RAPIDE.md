# 🚀 Démarrage Rapide - RustFocus

## ⚡ Utilisation Simple

### Un seul script pour tout faire : `rustfocus.ps1`

```powershell
# Option 1: Menu interactif (RECOMMANDÉ)
.\rustfocus.ps1

# Option 2: Ligne de commande
.\rustfocus.ps1 debug          # Lancer en mode debug (avec logs)
.\rustfocus.ps1 run            # Lancer en mode release
.\rustfocus.ps1 build          # Compiler seulement
.\rustfocus.ps1 all            # Compiler + Lancer
```

---

## 📋 Menu Interactif

Quand vous lancez `.\rustfocus.ps1` sans argument :

```
========================================
   RustFocus - Menu Principal
========================================

Que voulez-vous faire?

  1. Build RELEASE (optimisé, rapide)
  2. Build DEBUG (avec logs et DevTools)
  3. Run RELEASE
  4. Run DEBUG (mode débogage)
  5. Build + Run RELEASE
  6. Build + Run DEBUG
  7. Quitter

Votre choix (1-7):
```

---

## 🔧 Prérequis

Le script vérifie automatiquement si Rust/Cargo est installé.

**Si vous voyez une erreur "Cargo introuvable" :**
1. Installez Rust depuis : https://rustup.rs/
2. Redémarrez PowerShell
3. Relancez le script

**Note :** Visual Studio Build Tools est installé automatiquement avec Rust sur Windows !

---

## 🐛 Mode Debug (Pour diagnostiquer les problèmes)

**Quand utiliser le mode debug :**
- Les onglets ne répondent pas
- L'application crash
- Vous voulez voir ce qui se passe

**Comment :**
```powershell
.\rustfocus.ps1 debug
```

**Ce que vous obtenez :**
- ✅ Tous les `console.log()` affichés dans PowerShell
- ✅ DevTools (F12) accessibles
- ✅ Messages d'erreur détaillés
- ✅ Parfait pour diagnostiquer

**Exemple de logs :**
```
[RustFocus] Script app.js chargé !
[RustFocus] API Tauri trouvée après 0 ms
[RustFocus] Configuration des onglets...
[RustFocus] Nombre de boutons d'onglets trouvés: 3
[RustFocus] CLIC SUR ONGLET: settings
```

---

## ✨ Compilation Optimale

**Première compilation :**
- Durée : 5-15 minutes
- C'est normal, Rust compile TOUT

**Compilations suivantes :**
- Durée : <1 minute
- Seuls les fichiers modifiés sont recompilés

---

## 📁 Emplacement des Executables

**Mode Release (optimisé) :**
```
src-tauri\target\release\rustfocus.exe
```

**Mode Debug (avec logs) :**
```
src-tauri\target\debug\rustfocus.exe
```

---

## 🎯 Résolution de Problèmes

### L'interface ne s'ouvre pas

**Solution :**
```powershell
.\rustfocus.ps1 debug
```

Regardez les logs dans PowerShell pour voir l'erreur.

### Les onglets ne fonctionnent pas

**Solution :**
```powershell
.\rustfocus.ps1 debug
```

Cliquez sur les onglets et vérifiez si vous voyez :
```
[RustFocus] CLIC SUR ONGLET: settings
```

Si **OUI** → Problème CSS
Si **NON** → Problème JavaScript

Ouvrez F12 dans l'app pour plus de détails.

### Erreur "API Tauri non disponible"

**C'est corrigé !** Le script attend maintenant que Tauri soit chargé.

Si le problème persiste :
1. Vérifiez `src-tauri/tauri.conf.json`
2. `withGlobalTauri` doit être `true`

---

## 💡 Astuces

**Nettoyer tout et recompiler :**
```powershell
Remove-Item -Recurse -Force src-tauri\target
.\rustfocus.ps1 build
```

**Voir la version de Rust :**
```powershell
cargo --version
```

**Mettre à jour Rust :**
```powershell
rustup update
```

---

## 📞 Besoin d'Aide ?

1. **Lancez en mode debug** : `.\rustfocus.ps1 debug`
2. **Copiez les logs** affichés dans PowerShell
3. **Signalez le problème** avec les logs complets

---

## ✅ Checklist

Avant de signaler un bug :

- [ ] J'ai lancé `.\rustfocus.ps1 debug`
- [ ] J'ai vérifié les logs dans PowerShell
- [ ] J'ai ouvert F12 dans l'application
- [ ] J'ai vérifié la console des DevTools
- [ ] J'ai copié les messages d'erreur complets

---

**🎮 Prêt à organiser vos fenêtres Dofus !**

Lancez simplement :
```powershell
.\rustfocus.ps1
```

Et choisissez l'option 6 pour compiler et lancer en mode debug la première fois !
