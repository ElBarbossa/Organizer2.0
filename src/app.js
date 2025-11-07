// ===== CHARGEMENT DU SCRIPT =====
console.log('[RustFocus] ========================================');
console.log('[RustFocus] Script app.js chargé !');
console.log('[RustFocus] ========================================');

// Attendre que l'API Tauri soit disponible
async function waitForTauri() {
    console.log('[RustFocus] Attente de l\'API Tauri...');

    let attempts = 0;
    const maxAttempts = 50; // 5 secondes max

    while (!window.__TAURI__ && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    if (!window.__TAURI__) {
        console.error('[RustFocus] ERREUR: API Tauri non disponible après 5 secondes');
        alert('ERREUR: L\'API Tauri n\'a pas pu être chargée.\n\nVérifiez que withGlobalTauri est activé dans tauri.conf.json');
        throw new Error('Tauri API not available');
    }

    console.log('[RustFocus] API Tauri trouvée après', attempts * 100, 'ms');
}

// Variables pour les API Tauri (seront initialisées dans initTauriApis)
let invoke, listen;

// Initialiser les APIs Tauri
async function initTauriApis() {
    await waitForTauri();
    invoke = window.__TAURI__.tauri.invoke;
    listen = window.__TAURI__.event.listen;
    console.log('[RustFocus] API Tauri importées avec succès');
}

// Application State
let windowList = [];
let currentDraggedItem = null;

// Mode Debug
const DEBUG = true;

function log(...args) {
    if (DEBUG) {
        console.log('[RustFocus]', ...args);
    }
}

function logError(...args) {
    console.error('[RustFocus ERROR]', ...args);
}

// Initialize the application
async function init() {
    console.log('[RustFocus] ========================================');
    console.log('[RustFocus] DEBUT DE INIT() !');
    console.log('[RustFocus] ========================================');

    // Initialiser les APIs Tauri en premier
    await initTauriApis();

    log('Initialisation de l\'application...');

    // Charger la configuration des hotkeys depuis localStorage
    loadSavedHotkeyConfig();

    setupTabs();
    setupEventListeners();
    await loadWindows();
    await setupHotkeys();
    await loadProfiles();

    // Listen for window focus events from backend
    await listen('window-focused', (event) => {
        log('Fenêtre focalisée:', event.payload);
        updateStatusText(`Fenêtre focalisée: ${event.payload}`);
    });

    log('Application initialisée avec succès');
}

// Setup tab navigation
function setupTabs() {
    log('Configuration des onglets...');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    log('Nombre de boutons d\'onglets trouvés:', tabButtons.length);
    log('Nombre de contenus d\'onglets trouvés:', tabContents.length);

    if (tabButtons.length === 0) {
        logError('AUCUN BOUTON D\'ONGLET TROUVE !');
        return;
    }

    tabButtons.forEach((button, index) => {
        log(`Configuration du bouton d'onglet ${index + 1}:`, button.dataset.tab);

        button.addEventListener('click', (e) => {
            const tabName = button.dataset.tab;
            log('========================================');
            log('CLIC SUR ONGLET:', tabName);
            log('========================================');

            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => {
                log('Retrait de active sur bouton:', btn.dataset.tab);
                btn.classList.remove('active');
            });

            tabContents.forEach(content => {
                log('Retrait de active sur contenu:', content.id);
                content.classList.remove('active');
            });

            // Add active class to clicked button and corresponding content
            log('Ajout de active sur bouton:', tabName);
            button.classList.add('active');

            const targetContent = document.getElementById(`${tabName}-tab`);
            if (targetContent) {
                log('Ajout de active sur contenu:', `${tabName}-tab`);
                targetContent.classList.add('active');
            } else {
                logError('CONTENU D\'ONGLET NON TROUVE:', `${tabName}-tab`);
            }
        });
    });

    log('Configuration des onglets terminée avec succès');
}

// Setup event listeners
function setupEventListeners() {
    log('Configuration des écouteurs d\'événements...');

    // Refresh windows button
    document.getElementById('refresh-btn').addEventListener('click', async () => {
        log('Bouton actualiser cliqué');
        await loadWindows();
    });

    // Save profile button
    document.getElementById('save-profile-btn').addEventListener('click', async () => {
        const nameInput = document.getElementById('profile-name-input');
        const profileName = nameInput.value.trim();

        log('Tentative de sauvegarde du profil:', profileName);

        if (!profileName) {
            alert('Veuillez entrer un nom de profil');
            return;
        }

        try {
            // Sauvegarder le profil avec la configuration des touches
            await saveProfileWithHotkeys(profileName);
            log('Profil sauvegardé avec succès:', profileName);
            updateStatusText(`Profil "${profileName}" sauvegardé`);
            nameInput.value = '';
            await loadProfiles();
        } catch (error) {
            logError('Échec de la sauvegarde du profil:', error);
            alert(`Échec de la sauvegarde du profil: ${error}`);
        }
    });
}

// Load all Dofus windows
async function loadWindows() {
    log('Chargement des fenêtres Dofus...');
    updateStatusText('Recherche de fenêtres Dofus...');

    try {
        const windows = await invoke('detect_windows');
        log('Fenêtres détectées:', windows.length, windows);
        windowList = windows;
        renderWindowList();
        updateStatusText(`${windows.length} fenêtre(s) Dofus détectée(s)`);
    } catch (error) {
        logError('Échec de la détection des fenêtres:', error);
        updateStatusText('Échec de la détection des fenêtres');
    }
}

// Render the window list
function renderWindowList() {
    log('Rendu de la liste des fenêtres...');
    const listElement = document.getElementById('window-list');
    listElement.innerHTML = '';

    if (windowList.length === 0) {
        listElement.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🎮</div>
                <div class="empty-state-text">Aucune fenêtre Dofus détectée</div>
                <div class="empty-state-text">Lancez Dofus et cliquez sur "Actualiser les Fenêtres"</div>
            </div>
        `;
        return;
    }

    windowList.forEach((window, index) => {
        const li = document.createElement('li');
        li.className = 'window-item';
        li.draggable = true;
        li.dataset.index = index;
        li.dataset.handle = window.handle;

        li.innerHTML = `
            <div class="window-index">${index + 1}</div>
            <div class="window-info">
                <div class="window-name">${escapeHtml(window.character_name)}</div>
                <div class="window-title">${escapeHtml(window.title)}</div>
            </div>
            <div class="window-actions">
                <button class="icon-btn focus-btn" data-handle="${window.handle}">
                    👁️ Focus
                </button>
            </div>
        `;

        // Add drag and drop event listeners
        li.addEventListener('dragstart', handleDragStart);
        li.addEventListener('dragover', handleDragOver);
        li.addEventListener('drop', handleDrop);
        li.addEventListener('dragend', handleDragEnd);

        // Add focus button listener
        li.querySelector('.focus-btn').addEventListener('click', async (e) => {
            const handle = parseInt(e.target.dataset.handle);
            log('Focus de la fenêtre:', handle, window.character_name);
            try {
                await invoke('focus_window', { handle });
                updateStatusText(`Fenêtre focalisée: ${window.character_name}`);
            } catch (error) {
                logError('Échec du focus de la fenêtre:', error);
                alert(`Échec du focus de la fenêtre: ${error}`);
            }
        });

        listElement.appendChild(li);
    });

    log('Liste des fenêtres rendue:', windowList.length, 'éléments');
}

// Drag and Drop handlers
function handleDragStart(e) {
    currentDraggedItem = e.currentTarget;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
    log('Début du glisser-déposer');
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const container = e.currentTarget.parentElement;
    const afterElement = getDragAfterElement(container, e.clientY);
    const draggable = currentDraggedItem;

    if (draggable && container) {
        if (afterElement == null) {
            container.appendChild(draggable);
        } else {
            container.insertBefore(draggable, afterElement);
        }
    }

    return false;
}

function handleDrop(e) {
    e.stopPropagation();
    e.preventDefault();

    log('Élément déposé, mise à jour de l\'ordre');
    updateWindowOrder();
    return false;
}

function handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    currentDraggedItem = null;
    log('Fin du glisser-déposer');
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.window-item:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Update window order after drag and drop
async function updateWindowOrder() {
log('=== UPDATE WINDOW ORDER CALLED ===');
const items = document.querySelectorAll('.window-item');
const newOrder = [];

log('Nombre d\'éléments trouvés:', items.length);

items.forEach((item, index) => {
    const handle = parseInt(item.dataset.handle);
    log(`Élément ${index}: handle=${handle}, dataset.handle=${item.dataset.handle}`);
    const window = windowList.find(w => w.handle === handle);
    if (window) {
        newOrder.push(window);
        log(`  Ajouté: ${window.character_name}`);
    } else {
        logError(`  Fenêtre non trouvée pour handle ${handle}`);
    }

    // Update index display
    const indexElement = item.querySelector('.window-index');
    if (indexElement) {
        indexElement.textContent = index + 1;
    }
});

windowList = newOrder;
log('Nouvel ordre des fenêtres:', windowList.map(w => w.character_name));

// Send order to backend
const characterNames = newOrder.map(w => w.character_name);
log('Envoi au backend:', characterNames);

try {
    const result = await invoke('update_window_order', { order: characterNames });
    log('Backend response:', result);
    updateStatusText('Ordre des fenêtres mis à jour');
} catch (error) {
    logError('Échec de la mise à jour de l\'ordre:', error);
    alert(`Erreur lors de la mise à jour de l'ordre: ${error}`);
}
}

// Setup default hotkeys
async function setupHotkeys() {
    log('Configuration des raccourcis clavier...');
    try {
        // Vérifier s'il y a une configuration personnalisée sauvegardée
        const saved = localStorage.getItem('rustfocus_hotkey_config');

        if (saved) {
            // Appliquer la configuration personnalisée
            log('Application de la configuration personnalisée...');
            const customHotkeys = [];

            customHotkeys.push({
                id: 1,
                modifiers: 0,
                key_code: hotkeyConfig.next.vkCode,
                action: { NextWindow: {} }
            });

            customHotkeys.push({
                id: 2,
                modifiers: 0,
                key_code: hotkeyConfig.prev.vkCode,
                action: { PreviousWindow: {} }
            });

            for (let i = 0; i < 8; i++) {
                const key = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'][i];
                customHotkeys.push({
                    id: 10 + i,
                    modifiers: 0,
                    key_code: hotkeyConfig[key].vkCode,
                    action: { DirectWindow: i }
                });
            }

            await invoke('setup_custom_hotkeys', { hotkeys: customHotkeys });
            log('✓ Configuration personnalisée appliquée');
        } else {
            // Appliquer la configuration par défaut
            await invoke('setup_default_hotkeys');
        }

        log('✓ Raccourcis clavier ACTIFS:');
        log('  - Page Down: Fenêtre suivante');
        log('  - Page Up: Fenêtre précédente');
        log('  - F1-F8: Accès direct aux fenêtres 1-8');
        updateStatusText('Raccourcis clavier configurés ✓');
    } catch (error) {
        logError('Échec de la configuration des raccourcis:', error);
        updateStatusText('Erreur: Raccourcis non configurés');
    }
}

// Load saved profiles
async function loadProfiles() {
    log('Chargement des profils...');
    try {
        const profiles = await invoke('list_profiles');
        log('Profils chargés:', profiles.length, profiles);
        renderProfileList(profiles);
    } catch (error) {
        logError('Échec du chargement des profils:', error);
    }
}

// Render profile list
function renderProfileList(profiles) {
    log('Rendu de la liste des profils...');
    const listElement = document.getElementById('profile-list');
    listElement.innerHTML = '';

    if (profiles.length === 0) {
        listElement.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">💾</div>
                <div class="empty-state-text">Aucun profil sauvegardé</div>
            </div>
        `;
        return;
    }

    profiles.forEach(profileName => {
        const li = document.createElement('li');
        li.className = 'profile-item';

        li.innerHTML = `
            <div class="profile-name">${escapeHtml(profileName)}</div>
            <div class="profile-actions-btn">
                <button class="btn btn-success load-profile-btn" data-name="${escapeHtml(profileName)}">
                    Charger
                </button>
                <button class="btn btn-danger delete-profile-btn" data-name="${escapeHtml(profileName)}">
                    Supprimer
                </button>
            </div>
        `;

        // Load profile button
        li.querySelector('.load-profile-btn').addEventListener('click', async (e) => {
            const name = e.target.dataset.name;
            log('Chargement du profil:', name);
            try {
                await loadProfileWithHotkeys(name);
                updateStatusText(`Profil "${name}" chargé avec succès`);
                await loadWindows();
            } catch (error) {
                logError('Échec du chargement du profil:', error);
                alert(`Échec du chargement du profil: ${error}`);
            }
        });

        // Delete profile button
        li.querySelector('.delete-profile-btn').addEventListener('click', async (e) => {
            const name = e.target.dataset.name;
            if (!confirm(`Voulez-vous vraiment supprimer le profil "${name}" ?`)) {
                return;
            }

            log('Suppression du profil:', name);
            try {
                await invoke('delete_profile', { name });
                log('Profil supprimé:', name);
                updateStatusText(`Profil "${name}" supprimé`);
                await loadProfiles();
            } catch (error) {
                logError('Échec de la suppression du profil:', error);
                alert(`Échec de la suppression du profil: ${error}`);
            }
        });

        listElement.appendChild(li);
    });

    log('Liste des profils rendue:', profiles.length, 'éléments');
}

// Update status text
function updateStatusText(text) {
    log('Mise à jour du statut:', text);
    const statusElement = document.getElementById('status-text');
    statusElement.textContent = text;

    // Reset to "Ready" after 3 seconds
    setTimeout(() => {
        statusElement.textContent = 'Prêt';
    }, 3000);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize when DOM is ready
console.log('[RustFocus] document.readyState:', document.readyState);
if (document.readyState === 'loading') {
    console.log('[RustFocus] DOM pas encore chargé, attente de DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[RustFocus] DOMContentLoaded déclenché, appel de init()...');
        init();
    });
} else {
    console.log('[RustFocus] DOM déjà chargé, appel direct de init()...');
    init();
}

// Log when window closes
window.addEventListener('beforeunload', () => {
    log('Fermeture de l\'application');
});

// =============================================================================
// PROFILE + HOTKEY MANAGEMENT
// =============================================================================

// Sauvegarder un profil avec la configuration des touches
async function saveProfileWithHotkeys(profileName) {
    log('Sauvegarde du profil avec configuration des touches:', profileName);

    // Sauvegarder la configuration dans localStorage pour persistance
    const configToSave = {
        profileName,
        hotkeyConfig: hotkeyConfig,
        windowOrder: windowList.map(w => w.character_name)
    };

    localStorage.setItem(`rustfocus_profile_${profileName}`, JSON.stringify(configToSave));

    // Sauvegarder aussi via l'API Rust (pour le window_order)
    await invoke('save_profile', { name: profileName });

    log('✓ Profil sauvegardé:', profileName, configToSave);
}

// Charger un profil avec la configuration des touches
async function loadProfileWithHotkeys(profileName) {
    log('Chargement du profil avec configuration des touches:', profileName);

    // Charger depuis localStorage
    const saved = localStorage.getItem(`rustfocus_profile_${profileName}`);

    if (saved) {
        try {
            const config = JSON.parse(saved);
            log('Configuration chargée depuis localStorage:', config);

            // Restaurer les hotkeys
            if (config.hotkeyConfig) {
                Object.assign(hotkeyConfig, config.hotkeyConfig);

                // Mettre à jour l'affichage
                for (const [id, hotkeyInfo] of Object.entries(config.hotkeyConfig)) {
                    const kbdElement = document.getElementById(`hotkey-${id}`);
                    if (kbdElement) {
                        kbdElement.textContent = hotkeyInfo.name;
                    }
                }

                log('✓ Configuration des touches restaurée');

                // Réappliquer les hotkeys
                await invoke('setup_default_hotkeys');
                log('✓ Raccourcis réenregistrés');
            }
        } catch (error) {
            logError('Erreur lors du parsing de la configuration:', error);
        }
    }

    // Charger aussi via l'API Rust
    const profile = await invoke('load_profile', { name: profileName });
    log('Profil chargé depuis Rust:', profile);

    return profile;
}

// Lister les profils avec leurs infos
function listSavedProfiles() {
    const profiles = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('rustfocus_profile_')) {
            const profileName = key.replace('rustfocus_profile_', '');
            const data = localStorage.getItem(key);
            try {
                const config = JSON.parse(data);
                profiles.push({
                    name: profileName,
                    hasCustomHotkeys: !!config.hotkeyConfig,
                    windowCount: config.windowOrder ? config.windowOrder.length : 0
                });
            } catch (e) {
                // Ignorer les profils mal formés
            }
        }
    }
    return profiles;
}

// =============================================================================
// HOTKEY CONFIGURATION
// =============================================================================

// Configuration actuelle des touches
const hotkeyConfig = {
    next: { key: 'PageDown', vkCode: 0x22, name: 'Page Down' },
    prev: { key: 'PageUp', vkCode: 0x21, name: 'Page Up' },
    f1: { key: 'F1', vkCode: 0x70, name: 'F1' },
    f2: { key: 'F2', vkCode: 0x71, name: 'F2' },
    f3: { key: 'F3', vkCode: 0x72, name: 'F3' },
    f4: { key: 'F4', vkCode: 0x73, name: 'F4' },
    f5: { key: 'F5', vkCode: 0x74, name: 'F5' },
    f6: { key: 'F6', vkCode: 0x75, name: 'F6' },
    f7: { key: 'F7', vkCode: 0x76, name: 'F7' },
    f8: { key: 'F8', vkCode: 0x77, name: 'F8' },
};

// Charger la configuration sauvegardée depuis localStorage
function loadSavedHotkeyConfig() {
    try {
        const saved = localStorage.getItem('rustfocus_hotkey_config');
        if (saved) {
            const config = JSON.parse(saved);
            log('Configuration des hotkeys chargée depuis localStorage:', config);

            // Restaurer la configuration
            if (config.hotkeyConfig) {
                Object.assign(hotkeyConfig, config.hotkeyConfig);

                // Mettre à jour l'affichage une fois que le DOM est prêt
                setTimeout(() => {
                    for (const [id, hotkeyInfo] of Object.entries(config.hotkeyConfig)) {
                        const kbdElement = document.getElementById(`hotkey-${id}`);
                        if (kbdElement) {
                            kbdElement.textContent = hotkeyInfo.name;
                        }
                    }
                }, 100);

                log('✓ Configuration des hotkeys restaurée');
            }
        }
    } catch (error) {
        logError('Erreur lors du chargement de la configuration:', error);
    }
}

// État de la configuration
let currentlyConfiguring = null;
let keyListener = null;

// Mapping des touches supportées (code clavier → VK code)
const keyToVK = {
    'F1': 0x70, 'F2': 0x71, 'F3': 0x72, 'F4': 0x73,
    'F5': 0x74, 'F6': 0x75, 'F7': 0x76, 'F8': 0x77,
    'F9': 0x78, 'F10': 0x79, 'F11': 0x7A, 'F12': 0x7B,
    'PageUp': 0x21, 'PageDown': 0x22,
    'Home': 0x24, 'End': 0x23,
    'Insert': 0x2D, 'Delete': 0x2E,
    'NumpadMultiply': 0x6A, 'NumpadAdd': 0x6B,
    'NumpadSubtract': 0x6D, 'NumpadDivide': 0x6F,
};

// Noms lisibles des touches
const keyNames = {
    'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4',
    'F5': 'F5', 'F6': 'F6', 'F7': 'F7', 'F8': 'F8',
    'F9': 'F9', 'F10': 'F10', 'F11': 'F11', 'F12': 'F12',
    'PageUp': 'Page Up', 'PageDown': 'Page Down',
    'Home': 'Home', 'End': 'End',
    'Insert': 'Insert', 'Delete': 'Delete',
    'NumpadMultiply': 'Num *', 'NumpadAdd': 'Num +',
    'NumpadSubtract': 'Num -', 'NumpadDivide': 'Num /',
};

// Configurer une touche
function configureHotkey(hotkeyId) {
    log('Configuration de la touche:', hotkeyId);

    // Si on est déjà en train de configurer, annuler
    if (currentlyConfiguring) {
        cancelHotkeyConfiguration();
    }

    currentlyConfiguring = hotkeyId;
    const kbdElement = document.getElementById(`hotkey-${hotkeyId}`);

    // Changer l'affichage
    kbdElement.textContent = 'Appuyez sur une touche...';
    kbdElement.classList.add('waiting');

    // Écouter la prochaine touche
    keyListener = (event) => {
        event.preventDefault();
        event.stopPropagation();

        const key = event.code;
        log('Touche détectée:', key);

        // Vérifier si la touche est supportée
        if (keyToVK[key]) {
            // Vérifier les conflits
            const conflict = checkHotkeyConflict(key, hotkeyId);
            if (conflict) {
                alert(`Cette touche est déjà assignée à: ${conflict}`);
                cancelHotkeyConfiguration();
                return;
            }

            // Enregistrer la nouvelle configuration
            hotkeyConfig[hotkeyId] = {
                key: key,
                vkCode: keyToVK[key],
                name: keyNames[key] || key
            };

            // Mettre à jour l'affichage
            kbdElement.textContent = keyNames[key] || key;
            kbdElement.classList.remove('waiting');

            // Retirer l'écouteur
            document.removeEventListener('keydown', keyListener);
            keyListener = null;
            currentlyConfiguring = null;

            log('Touche configurée:', hotkeyId, '→', keyNames[key]);
            updateStatusText(`Touche configurée: ${keyNames[key]}. Cliquez sur "Appliquer" pour sauvegarder.`);
        } else {
            alert('Touche non supportée. Utilisez F1-F12, Page Up/Down, Home, End, etc.');
            cancelHotkeyConfiguration();
        }
    };

    document.addEventListener('keydown', keyListener);

    // Auto-annulation après 10 secondes
    setTimeout(() => {
        if (currentlyConfiguring === hotkeyId) {
            cancelHotkeyConfiguration();
        }
    }, 10000);
}

// Annuler la configuration
function cancelHotkeyConfiguration() {
    if (currentlyConfiguring) {
        const kbdElement = document.getElementById(`hotkey-${currentlyConfiguring}`);
        const config = hotkeyConfig[currentlyConfiguring];
        kbdElement.textContent = config.name;
        kbdElement.classList.remove('waiting');

        if (keyListener) {
            document.removeEventListener('keydown', keyListener);
            keyListener = null;
        }

        currentlyConfiguring = null;
    }
}

// Vérifier les conflits de touches
function checkHotkeyConflict(key, excludeId) {
    for (const [id, config] of Object.entries(hotkeyConfig)) {
        if (id !== excludeId && config.key === key) {
            return `Fenêtre ${id.toUpperCase()}`;
        }
    }
    return null;
}

// Appliquer les changements
async function applyHotkeys() {
log('Application des changements de touches...');

const applyBtn = document.getElementById('apply-hotkeys-btn');
if (applyBtn) {
    applyBtn.disabled = true;
    applyBtn.textContent = '🔄 Application...';
}

try {
    // Créer une nouvelle configuration basée sur les touches personnalisées
    const customHotkeys = [];

    // Ajouter les touches personnalisées
    customHotkeys.push({
        id: 1,
        modifiers: 0,
        key_code: hotkeyConfig.next.vkCode,
        action: { NextWindow: {} }
    });

    customHotkeys.push({
        id: 2,
        modifiers: 0,
        key_code: hotkeyConfig.prev.vkCode,
        action: { PreviousWindow: {} }
    });

    // F1-F8
    for (let i = 0; i < 8; i++) {
        const key = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'][i];
        customHotkeys.push({
            id: 10 + i,
            modifiers: 0,
            key_code: hotkeyConfig[key].vkCode,
            action: { DirectWindow: i }
        });
    }

    log('Configuration personnalisée à envoyer:', customHotkeys);

    // Envoyer la configuration personnalisée au backend
    await invoke('setup_custom_hotkeys', { hotkeys: customHotkeys });

    log('✓ Raccourcis mis à jour avec succès !');

    // Sauvegarder la configuration dans localStorage pour persistance
    const configToSave = {
        hotkeyConfig: hotkeyConfig,
        timestamp: Date.now()
    };
    localStorage.setItem('rustfocus_hotkey_config', JSON.stringify(configToSave));
    log('✓ Configuration sauvegardée dans localStorage');

    updateStatusText('Raccourcis mis à jour avec succès ✓');

    alert('Raccourcis mis à jour avec succès !\n\nLes nouveaux raccourcis sont maintenant actifs.');
} catch (error) {
    logError('Échec de la mise à jour des raccourcis:', error);
    updateStatusText('Erreur lors de la mise à jour');
    alert('Erreur lors de la mise à jour des raccourcis:\n' + error);
} finally {
    // Réactiver le bouton
    if (applyBtn) {
        applyBtn.disabled = false;
        applyBtn.textContent = '💾 Appliquer les Changements';
    }
}
}

// Réinitialiser aux valeurs par défaut
function resetHotkeys() {
    log('Réinitialisation des raccourcis par défaut...');

    if (!confirm('Voulez-vous vraiment réinitialiser tous les raccourcis aux valeurs par défaut ?')) {
        return;
    }

    // Réinitialiser la configuration
    hotkeyConfig.next = { key: 'PageDown', vkCode: 0x22, name: 'Page Down' };
    hotkeyConfig.prev = { key: 'PageUp', vkCode: 0x21, name: 'Page Up' };
    hotkeyConfig.f1 = { key: 'F1', vkCode: 0x70, name: 'F1' };
    hotkeyConfig.f2 = { key: 'F2', vkCode: 0x71, name: 'F2' };
    hotkeyConfig.f3 = { key: 'F3', vkCode: 0x72, name: 'F3' };
    hotkeyConfig.f4 = { key: 'F4', vkCode: 0x73, name: 'F4' };
    hotkeyConfig.f5 = { key: 'F5', vkCode: 0x74, name: 'F5' };
    hotkeyConfig.f6 = { key: 'F6', vkCode: 0x75, name: 'F6' };
    hotkeyConfig.f7 = { key: 'F7', vkCode: 0x76, name: 'F7' };
    hotkeyConfig.f8 = { key: 'F8', vkCode: 0x77, name: 'F8' };

    // Mettre à jour l'affichage
    for (const [id, config] of Object.entries(hotkeyConfig)) {
        const kbdElement = document.getElementById(`hotkey-${id}`);
        if (kbdElement) {
            kbdElement.textContent = config.name;
            kbdElement.classList.remove('waiting');
        }
    }

    log('✓ Raccourcis réinitialisés');
    updateStatusText('Raccourcis réinitialisés. Cliquez sur "Appliquer" pour sauvegarder.');
}

// Rendre les fonctions globales pour les boutons HTML
window.configureHotkey = configureHotkey;
window.applyHotkeys = applyHotkeys;
window.resetHotkeys = resetHotkeys;
