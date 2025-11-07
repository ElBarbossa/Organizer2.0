# 🎮 Configuration Personnalisée des Touches - RustFocus

## ✨ Nouvelle Fonctionnalité !

Vous pouvez maintenant **personnaliser tous les raccourcis clavier** selon vos préférences !

---

## 📋 Comment Configurer

### Étape 1 : Ouvrir l'Onglet Paramètres

Lancez RustFocus et cliquez sur l'onglet **"Paramètres"**.

### Étape 2 : Configurer une Touche

1. **Cliquez sur "🔧 Configurer"** à côté du raccourci que vous voulez changer
2. Le texte change en **"Appuyez sur une touche..."** avec une animation bleue
3. **Appuyez sur la touche** que vous voulez utiliser
4. La nouvelle touche s'affiche immédiatement

### Étape 3 : Appliquer les Changements

Cliquez sur **"💾 Appliquer les Changements"** pour activer vos raccourcis.

**C'est tout !** Vos nouveaux raccourcis sont actifs immédiatement.

---

## ⌨️ Touches Disponibles

Vous pouvez utiliser les touches suivantes :

### Touches de Fonction
- **F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12**

### Touches de Navigation
- **Page Up** - Page vers le haut
- **Page Down** - Page vers le bas
- **Home** - Début
- **End** - Fin

### Touches d'Édition
- **Insert** - Insertion
- **Delete** - Suppression

### Pavé Numérique
- **Num*** - Multiplication
- **Num +** - Addition
- **Num -** - Soustraction
- **Num /** - Division

---

## 🎯 Raccourcis Configurables

| Fonction | Par Défaut | Personnalisable |
|----------|------------|-----------------|
| **Fenêtre Suivante** | Page Down | ✅ |
| **Fenêtre Précédente** | Page Up | ✅ |
| **Fenêtre #1** | F1 | ✅ |
| **Fenêtre #2** | F2 | ✅ |
| **Fenêtre #3** | F3 | ✅ |
| **Fenêtre #4** | F4 | ✅ |
| **Fenêtre #5** | F5 | ✅ |
| **Fenêtre #6** | F6 | ✅ |
| **Fenêtre #7** | F7 | ✅ |
| **Fenêtre #8** | F8 | ✅ |

**Total : 10 raccourcis personnalisables !**

---

## 💡 Exemples d'Utilisation

### Exemple 1 : Joueur avec Souris à Boutons

Vous avez une souris gaming avec F9-F12 sur les boutons latéraux ?

1. Configurez les 4 premières fenêtres sur F9, F10, F11, F12
2. Gardez F5-F8 pour les fenêtres 5-8
3. Utilisez Page Up/Down pour naviguer

### Exemple 2 : Joueur avec Pavé Numérique

Vous préférez le pavé numérique ?

1. Fenêtre suivante → **Num +**
2. Fenêtre précédente → **Num -**
3. Fenêtres 1-4 → **F1-F4** (plus proches du clavier principal)

### Exemple 3 : Multi-Boxing Avancé

Vous gérez 8+ comptes ?

1. F1-F8 pour les 8 premiers comptes
2. F9-F12 pour les comptes supplémentaires (si vous en ajoutez plus tard)
3. Home/End pour navigation rapide

---

## 🔒 Sécurité et Validation

### Détection de Conflits

Si vous essayez d'assigner une touche déjà utilisée :
```
⚠️ Cette touche est déjà assignée à: Fenêtre F2
```

Vous devez choisir une autre touche.

### Touches Non Supportées

Si vous appuyez sur une touche non supportée (lettres, chiffres, etc.) :
```
⚠️ Touche non supportée.
Utilisez F1-F12, Page Up/Down, Home, End, etc.
```

### Auto-Annulation

Si vous ne pressez pas de touche dans les **10 secondes**, la configuration s'annule automatiquement.

---

## 🔄 Réinitialiser

### Bouton "Réinitialiser par Défaut"

Cliquez sur **"🔄 Réinitialiser par Défaut"** pour revenir à la configuration d'origine :

- Fenêtre Suivante → **Page Down**
- Fenêtre Précédente → **Page Up**
- Fenêtres 1-8 → **F1-F8**

Une confirmation est demandée avant de réinitialiser.

---

## 🎨 Interface Utilisateur

### Animation Pendant la Configuration

Quand vous configurez une touche :
- Le texte change en **"Appuyez sur une touche..."**
- Animation **bleue clignotante** (pulse)
- Retour à la normale après capture

### Affichage Clair

Les touches sont affichées avec des noms lisibles :
- `Page Down` au lieu de `PageDown`
- `Num +` au lieu de `NumpadAdd`
- `Page Up` au lieu de `PageUp`

---

## 📝 Sauvegarde

La configuration est sauvegardée dans l'objet `hotkeyConfig` et persiste pendant toute la session.

**Note :** Pour une sauvegarde permanente entre sessions, utilisez les **Profils** dans l'onglet correspondant.

---

## 🐛 Dépannage

### La touche ne s'enregistre pas

**Solution :**
1. Vérifiez que vous êtes bien en mode configuration (animation bleue)
2. Appuyez fermement sur la touche une seule fois
3. Utilisez uniquement les touches supportées listées ci-dessus

### Les changements ne s'appliquent pas

**Solution :**
1. Cliquez sur **"💾 Appliquer les Changements"** après configuration
2. Vérifiez les logs dans la console (mode debug)
3. Relancez l'application si nécessaire

### Conflit avec une autre application

Certaines applications capturent les touches globalement.

**Solutions :**
- Fermez les autres applications utilisant les mêmes touches
- Choisissez des touches moins communes (Insert, Home, End)
- Utilisez le pavé numérique

---

## 🎉 Avantages

✅ **Flexibilité totale** - Adaptez RustFocus à votre setup
✅ **Facile à utiliser** - Interface intuitive avec feedback visuel
✅ **Sécurisé** - Validation et détection de conflits
✅ **Réversible** - Réinitialisez en un clic
✅ **Instantané** - Les changements s'appliquent immédiatement

---

## 🚀 Astuces Pro

1. **Groupez vos touches** - Mettez les fenêtres importantes sur F1-F4 (plus accessibles)
2. **Utilisez la logique** - Page Down pour "suivant", Page Up pour "précédent"
3. **Testez avant de valider** - Essayez la touche avant de cliquer sur "Appliquer"
4. **Documentez votre config** - Notez vos raccourcis personnalisés quelque part

---

**💡 Personnalisez RustFocus comme vous le voulez !**
