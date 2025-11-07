# 🐛 Guide de Débogage RustFocus

Ce guide explique comment diagnostiquer et résoudre les problèmes avec RustFocus.

## 📋 Table des matières

1. [Voir les logs de débogage](#voir-les-logs-de-débogage)
2. [Mode Debug vs Mode Release](#mode-debug-vs-mode-release)
3. [Problèmes connus](#problèmes-connus)
4. [Outils de débogage](#outils-de-débogage)

---

## 🔍 Voir les logs de débogage

RustFocus inclut un système de logging détaillé pour diagnostiquer les problèmes.

### Méthode 1 : Mode Debug (RECOMMANDÉ)

Utilisez le script `run-debug.ps1` pour compiler et lancer en mode debug :

```powershell
.\run-debug.ps1
```

**Avantages :**
- ✅ Tous les `console.log()` s'affichent dans la console PowerShell
- ✅ DevTools accessibles avec **F12**
- ✅ Messages d'erreur détaillés
- ✅ Pas besoin de recompiler à chaque fois

**Ce que vous verrez :**
```
[RustFocus] ========================================
[RustFocus] Script app.js chargé !
[RustFocus] ========================================
[RustFocus] API Tauri importées avec succès
[RustFocus] document.readyState: complete
[RustFocus] DOM déjà chargé, appel direct de init()...
[RustFocus] ========================================
[RustFocus] DEBUT DE INIT() !
[RustFocus] ========================================
[RustFocus] Configuration des onglets...
[RustFocus] Nombre de boutons d'onglets trouvés: 3
[RustFocus] Nombre de contenus d'onglets trouvés: 3
```

### Méthode 2 : Lancer l'exe depuis PowerShell

Si vous avez déjà compilé en mode release :

```powershell
.\src-tauri\target\release\rustfocus.exe
```

Les logs `console.log()` s'afficheront dans la console PowerShell.

---

## 🎯 Mode Debug vs Mode Release

### Mode Debug

- **Script :** `run-debug.ps1`
- **Chemin exe :** `src-tauri\target\debug\rustfocus.exe`
- **Avantages :**
  - DevTools (F12) fonctionnels
  - Logs console visibles
  - Messages d'erreur détaillés
- **Inconvénients :**
  - Plus lent
  - Fichier exe plus gros

### Mode Release

- **Script :** `build.ps1`
- **Chemin exe :** `src-tauri\target\release\rustfocus.exe`
- **Avantages :**
  - Optimisé et rapide
  - Fichier exe plus petit
- **Inconvénients :**
  - DevTools désactivés par défaut
  - Moins de logs
  - Pour voir les logs, lancer depuis PowerShell

---

## 🔧 Problèmes connus

### Les onglets ne répondent pas aux clics

**Diagnostic :**

1. Lancez en mode debug : `.\run-debug.ps1`
2. Regardez les logs dans la console
3. Cliquez sur un onglet
4. Vérifiez si vous voyez :
   ```
   [RustFocus] ========================================
   [RustFocus] CLIC SUR ONGLET: settings
   [RustFocus] ========================================
   ```

**Si vous voyez les logs de clic :**
- Le JavaScript fonctionne ✅
- Le problème est dans le CSS ou le HTML
- Ouvrez F12 → Onglet "Elements" → Inspectez les classes CSS

**Si vous ne voyez PAS les logs de clic :**
- Les event listeners ne sont pas attachés ❌
- Vérifiez si vous voyez : `[RustFocus] Configuration des onglets...`
- Vérifiez le nombre de boutons trouvés

### F12 (DevTools) ne s'ouvre pas

**Solution :**
Utilisez le mode debug au lieu du mode release :

```powershell
.\run-debug.ps1
```

Les DevTools sont uniquement disponibles en mode debug dans Tauri.

### Les fenêtres Dofus ne sont pas détectées

**Vérifications :**

1. Assurez-vous que Dofus est lancé
2. Vérifiez que c'est bien le client Dofus (pas le launcher)
3. Regardez les logs quand vous cliquez sur "🔍 Détecter"
4. Les fenêtres doivent avoir la classe `UnityWndClass`

**Commande PowerShell pour vérifier :**
```powershell
Get-Process | Where-Object {$_.MainWindowTitle -like "*Dofus*"}
```

---

## 🛠️ Outils de débogage

### 1. Console PowerShell

Toujours lancer RustFocus depuis PowerShell pour voir les logs :

```powershell
cd C:\chemin\vers\Organizer2.0
.\run-debug.ps1
```

### 2. DevTools (F12)

En mode debug uniquement :
- **Console** : Voir les logs JavaScript
- **Elements** : Inspecteur HTML/CSS
- **Network** : Requêtes réseau
- **Sources** : Déboguer le code JavaScript

### 3. Logs détaillés des onglets

Le code inclut des logs très verbeux pour diagnostiquer les clics :

```javascript
[RustFocus] Configuration du bouton d'onglet 1: windows
[RustFocus] Configuration du bouton d'onglet 2: settings
[RustFocus] Configuration du bouton d'onglet 3: profiles
```

À chaque clic :
```javascript
[RustFocus] ========================================
[RustFocus] CLIC SUR ONGLET: settings
[RustFocus] ========================================
[RustFocus] Retrait de active sur bouton: windows
[RustFocus] Retrait de active sur bouton: settings
[RustFocus] Retrait de active sur bouton: profiles
[RustFocus] Ajout de active sur bouton: settings
[RustFocus] Ajout de active sur contenu: settings-tab
```

---

## 📞 Rapporter un bug

Quand vous rapportez un problème, incluez :

1. **Mode utilisé** : Debug ou Release
2. **Logs complets** : Copiez tout ce qui s'affiche dans PowerShell
3. **Actions effectuées** : Ce que vous avez fait étape par étape
4. **Comportement attendu** : Ce qui devrait se passer
5. **Comportement observé** : Ce qui se passe réellement

---

## ✅ Checklist de débogage

Avant de rapporter un problème, essayez :

- [ ] Lancer en mode debug avec `run-debug.ps1`
- [ ] Vérifier les logs dans la console PowerShell
- [ ] Ouvrir F12 en mode debug et vérifier la console
- [ ] Regarder l'onglet "Elements" pour les erreurs CSS
- [ ] Vérifier que `app.js` se charge (voir logs)
- [ ] Vérifier que `init()` est appelé (voir logs)
- [ ] Vérifier que les event listeners sont attachés (voir logs)
- [ ] Tester de cliquer sur les onglets et vérifier les logs

---

**💡 Astuce :** En cas de doute, utilisez toujours `run-debug.ps1` - c'est fait pour ça !
