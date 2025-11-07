# 🎮 RustFocus - Organisateur de Fenêtres Dofus

Application Windows ultra-performante pour gérer plusieurs fenêtres de jeu Dofus (multi-compte). Construite avec Rust et Tauri pour des performances maximales et une utilisation minimale des ressources.

## ✨ Téléchargement Direct

🔗 **[Télécharger RustFocus.exe](https://github.com/ElBarbossa/Organizer2.0/raw/main/src-tauri/target/release/rustfocus.exe)** (~5.4 Mo)

## 🎯 Fonctionnalités

### Fonctionnalités Principales
- **🔍 Détection Automatique** : Scanne et liste automatiquement toutes les fenêtres Dofus en cours
- **📋 Gestion Visuelle** : Interface claire pour voir tous vos personnages
- **🔄 Glisser-Déposer** : Réorganisez les fenêtres par simple glisser-déposer
- **⌨️ Raccourcis Globaux** : Changez de fenêtre instantanément, même en jeu
- **💾 Gestion des Profils** : Sauvegardez et chargez vos configurations de fenêtres
- **🖥️ Barre des Tâches** : Minimisez dans la barre des tâches pour une utilisation discrète

### Contrôles par Raccourcis
- **Page Bas** : Fenêtre suivante dans la liste
- **Page Haut** : Fenêtre précédente dans la liste
- **F1-F8** : Accès direct aux fenêtres spécifiques (1ère à 8ème)

### Performances
- **⚡ Zéro utilisation CPU au repos** (0%)
- **💨 Empreinte mémoire minimale** (<50 Mo)
- **🚀 Changement de fenêtre instantané** (<1ms de latence)
- **🎯 Stable avec 8+ clients** simultanés

### Conformité aux Conditions d'Utilisation
✅ **Entièrement conforme aux CGU Dofus**
- Utilise uniquement `SetForegroundWindow` pour le changement de fenêtre
- **AUCUNE automatisation** ou injection d'entrée
- **AUCUN multiplexage** ou duplication d'actions
- **AUCUN enregistrement** ou lecture de macros

## 🚀 Utilisation

### Premier Lancement
1. Lancez vos clients Dofus (autant que vous voulez)
2. Exécutez RustFocus.exe
3. Cliquez sur "🔄 Actualiser Fenêtres" pour détecter toutes les instances Dofus
4. Vos personnages apparaîtront dans la liste

### Gestion des Fenêtres
- **Réorganiser** : Glissez-déposez les entrées de personnages pour changer l'ordre
- **Focus** : Cliquez sur le bouton "👁️ Focus" ou utilisez les raccourcis
- **Parcourir** : Utilisez `Page Haut`/`Page Bas` pour parcourir les fenêtres
- **Accès Direct** : Pressez `F1`-`F8` pour un accès instantané

### Sauvegarder des Profils
1. Organisez vos fenêtres dans l'ordre désiré
2. Allez dans l'onglet "Profils"
3. Entrez un nom de profil (ex: "Équipe Farm", "Escouade PvP")
4. Cliquez sur "Sauvegarder Profil Actuel"

### Charger des Profils
1. Allez dans l'onglet "Profils"
2. Cliquez sur "Charger" sur le profil désiré
3. Votre ordre de fenêtres sera restauré instantanément

### Barre des Tâches
- Cliquez sur l'icône pour afficher/masquer la fenêtre
- Clic droit pour le menu d'actions rapides

## 🔧 Dépannage

### "Aucune fenêtre Dofus détectée"
- Vérifiez que Dofus fonctionne
- Essayez de cliquer sur "Actualiser Fenêtres"
- Vérifiez que le titre de la fenêtre contient "Dofus"

### Raccourcis ne fonctionnent pas
- Vérifiez si une autre application utilise les mêmes raccourcis
- Redémarrez RustFocus
- Lancez en tant qu'Administrateur si nécessaire

### La fenêtre ne prend pas le focus
- Vérifiez que la fenêtre Dofus existe encore
- Actualisez la liste des fenêtres
- Vérifiez si le jeu est minimisé dans la barre des tâches

## 📄 Licence

Ce projet est fourni tel quel à des fins éducatives. Utilisez à vos propres risques.

## ⚠️ Avertissement

Cet outil **UNIQUEMENT** change le focus des fenêtres et n'automatise en aucun cas le gameplay. Il est conçu pour être entièrement conforme aux Conditions d'Utilisation de Dofus. Cependant :
- Utilisez à vos propres risques
- L'auteur n'est pas responsable des actions du compte
- Respectez toujours les règles du jeu et les CGU

---

**Construit avec ❤️ utilisant Rust + Tauri**

*Profitez d'un gaming multi-compte fluide !*
