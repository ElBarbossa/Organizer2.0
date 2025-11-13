// ===== CHARGEMENT DU SCRIPT =====
console.log('[Organizer 2.0] ========================================');
console.log('[Organizer 2.0] Script app.js chargé !');
console.log('[Organizer 2.0] ========================================');

// Attendre que l'API Tauri soit disponible
async function waitForTauri() {
    console.log('[Organizer 2.0] Attente de l\'API Tauri...');

    let attempts = 0;
    const maxAttempts = 50; // 5 secondes max

    while (!window.__TAURI__ && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    if (!window.__TAURI__) {
        console.error('[Organizer 2.0] ERREUR: API Tauri non disponible après 5 secondes');
        alert('ERREUR: L\'API Tauri n\'a pas pu être chargée.\n\nVérifiez que withGlobalTauri est activé dans tauri.conf.json');
        throw new Error('Tauri API not available');
    }

    console.log('[Organizer 2.0] API Tauri trouvée après', attempts * 100, 'ms');
}

// Variables pour les API Tauri (seront initialisées dans initTauriApis)
let invoke, listen;

// Initialiser les APIs Tauri
async function initTauriApis() {
    await waitForTauri();
    invoke = window.__TAURI__.tauri.invoke;
    listen = window.__TAURI__.event.listen;
    console.log('[Organizer 2.0] API Tauri importées avec succès');
}

// Application State
let windowList = [];
let orderChanged = false; // Track if order has been modified
let currentDraggedItem = null;
let isDragging = false;
let dragStartY = 0;
let dragStartX = 0;
let currentProfileName = null; // Track current profile name
let autoLoadProfile = localStorage.getItem('rustfocus_auto_load_profile') || null; // Profile to load on startup
let excludedWindows = new Set(); // Track windows excluded from hotkeys

// Mode Debug
const DEBUG = true;

function log(...args) {
    if (DEBUG) {
        console.log('[Organizer 2.0]', ...args);
    }
}

function logError(...args) {
    console.error('[Organizer 2.0 ERROR]', ...args);
}

// Load application version from Tauri
async function loadAppVersion() {
    try {
        if (window.__TAURI__ && window.__TAURI__.app) {
            const { getVersion } = window.__TAURI__.app;
            const version = await getVersion();
            const versionElement = document.getElementById('current-version');
            if (versionElement) {
                versionElement.textContent = version;
                log('Version de l\'application chargée:', version);
            }
        } else {
            // En mode dev, afficher "dev"
            const versionElement = document.getElementById('current-version');
            if (versionElement) {
                versionElement.textContent = 'dev';
            }
            log('Mode développement - API Tauri non disponible');
        }
    } catch (error) {
        logError('Erreur lors du chargement de la version:', error);
        const versionElement = document.getElementById('current-version');
        if (versionElement) {
            versionElement.textContent = '?';
        }
    }
}

// Initialize the application
async function init() {
    console.log('[Organizer 2.0] ========================================');
    console.log('[Organizer 2.0] DEBUT DE INIT() !');
    console.log('[Organizer 2.0] ========================================');

    // Initialiser les APIs Tauri en premier
    await initTauriApis();

    log('Initialisation de l\'application...');

    // Charger la version de l'application depuis Tauri
    await loadAppVersion();

    // Charger la configuration des hotkeys depuis localStorage
    loadSavedHotkeyConfig();

    // Charger les fenêtres exclues depuis localStorage
    await loadExcludedWindows();

    setupTabs();
    setupEventListeners();

    log('Application initialisée avec succès');

    // Check if there's a current profile loaded in the backend (Rust)
    let profileLoadedFromBackend = false;
    try {
        const currentProfile = await invoke('get_current_profile');
        log('Profil actuel chargé côté Rust:', currentProfile);

        if (currentProfile && currentProfile.name !== "temp") {
            log('Synchronisation avec le profil chargé côté Rust:', currentProfile.name);
            currentProfileName = currentProfile.name;
            profileLoadedFromBackend = true;

            // Update profile display
            updateCurrentProfileDisplay(currentProfile.name);

            // Load the profile data from localStorage to sync UI state
            const saved = localStorage.getItem(`rustfocus_profile_${currentProfile.name}`);
            if (saved) {
                try {
                    const config = JSON.parse(saved);
                    log('Configuration du profil synchronisée:', config);

                    // Apply window order from the loaded profile
                    if (config.windowOrder && config.windowOrder.length > 0) {
                        log('Ordre des fenêtres appliqué depuis le profil:', config.windowOrder);
                        // This will be used when loadWindows() is called
                    }
                } catch (error) {
                    logError('Erreur lors de la synchronisation du profil:', error);
                }
            }
        } else {
            log('Aucun profil chargé côté Rust');
        }
    } catch (error) {
        logError('Erreur lors de la vérification du profil actuel:', error);
        // Continue without failing
    }

    // Auto-load profile on startup if configured (only if no profile is loaded from backend)
    if (autoLoadProfile && !profileLoadedFromBackend) {
        log('Chargement automatique du profil au démarrage:', autoLoadProfile);
        try {
            // Load profile directly from localStorage (same as manual loading)
            await loadProfileWithHotkeys(autoLoadProfile);
            currentProfileName = autoLoadProfile;

            // Apply the profile's window order to the taskbar before loading windows
            const saved = localStorage.getItem(`rustfocus_profile_${autoLoadProfile}`);
            if (saved) {
                const config = JSON.parse(saved);
                if (config.windowOrder && config.windowOrder.length > 0) {
                    await invoke('update_window_order', { order: config.windowOrder });
                    log('Ordre du profil appliqué à la taskbar avant chargement des fenêtres');
                }
            }

            log('Profil chargé automatiquement depuis localStorage');

            // Update profile display immediately after loading
            updateCurrentProfileDisplay(autoLoadProfile);

            // Load profiles list after auto-load to update selectors
            await loadProfiles();

        } catch (error) {
            logError('Échec du chargement automatique du profil:', error);
            // If auto-load fails, still load profiles list
            await loadProfiles();
        }
    } else {
        // No auto-load, load profiles list normally
        await loadProfiles();
    }

    // Now load windows (after profile loading)
    await loadWindows();

    // Order is already applied in auto-load, no need to reapply

    await setupHotkeys();

    // Bring app to front after all initialization is complete
    setTimeout(async () => {
        try {
            log('Ramenant l\'application au premier plan après l\'initialisation...');
            const appWindow = window.__TAURI__.window.getCurrent();
            await appWindow.show();
            await new Promise(resolve => setTimeout(resolve, 100));
            await appWindow.unminimize();
            await new Promise(resolve => setTimeout(resolve, 100));
            await appWindow.setFocus();
            log('Application ramenée au premier plan avec succès');
        } catch (error) {
            logError('Erreur lors du ramenage au premier plan:', error);
            // Fallback
            try {
                await invoke('show_window');
                log('Application affichée via commande système');
            } catch (fallbackError) {
                logError('Erreur du fallback aussi:', fallbackError);
            }
        }
    }, 500); // Small delay to ensure everything is loaded

    // Listen for window focus events from backend
    await listen('window-focused', (event) => {
        log('Fenêtre focalisée:', event.payload);
        updateStatusText(`Fenêtre focalisée: ${event.payload}`);
    });

    // Ensure profile display is updated after everything is loaded (fallback)
    setTimeout(() => {
        updateCurrentProfileDisplay(currentProfileName);
    }, 1500);

    // Initialize auto-travel checkbox from localStorage
    const autoTravelCheckbox = document.getElementById('auto-travel-checkbox');
    if (autoTravelCheckbox) {
        const autoTravelEnabled = localStorage.getItem('auto_travel_enabled') === 'true';
        autoTravelCheckbox.checked = autoTravelEnabled;
        autoTravelCheckbox.addEventListener('change', toggleAutoTravel);

        // Start monitoring if enabled
        if (autoTravelEnabled) {
            toggleAutoTravel();
        }
        log('Auto-travel checkbox initialisée:', autoTravelEnabled);
    }
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

            // Reset any ongoing drag operation and cursor state
            if (isDragging) {
                isDragging = false;
                if (currentDraggedItem) {
                    currentDraggedItem.classList.remove('dragging');
                    currentDraggedItem = null;
                }
                document.removeEventListener('mousemove', handleGlobalMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            }
            // Always reset cursor when changing tabs
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

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

// Switch between settings sections (for sidebar menu)
function switchSettingsSection(sectionName) {
    log('Changement de section de paramètres:', sectionName);

    // Remove active class from all menu items
    const menuItems = document.querySelectorAll('.settings-menu-item');
    menuItems.forEach(item => {
        item.classList.remove('active');
    });

    // Add active class to clicked menu item
    const activeMenuItem = document.querySelector(`.settings-menu-item[data-section="${sectionName}"]`);
    if (activeMenuItem) {
        activeMenuItem.classList.add('active');
    }

    // Hide all content sections
    const contentSections = document.querySelectorAll('.settings-content-section');
    contentSections.forEach(section => {
        section.classList.remove('active');
    });

    // Show the selected content section
    const targetSection = document.getElementById(`section-${sectionName}`);
    if (targetSection) {
        targetSection.classList.add('active');
        log('Section affichée:', `section-${sectionName}`);
    } else {
        logError('SECTION NON TROUVEE:', `section-${sectionName}`);
    }
}

// Setup event listeners
function setupEventListeners() {
    log('Configuration des écouteurs d\'événements...');

    // Refresh windows button
    document.getElementById('refresh-btn').addEventListener('click', async () => {
        log('Bouton actualiser cliqué');
        await loadWindows();
    });

    // Apply order button
    document.getElementById('apply-order-btn').addEventListener('click', async () => {
        log('Bouton "Appliquer l\'Ordre" cliqué');
        await applyWindowOrder();
    });

    // Load profile from windows tab
    document.getElementById('load-window-profile-btn').addEventListener('click', async () => {
        const selectElement = document.getElementById('window-profile-select');
        const profileName = selectElement.value;

        if (!profileName) {
            alert('Veuillez sélectionner un profil');
            return;
        }

        log('Chargement du profil depuis onglet Fenêtres:', profileName);
        try {
            await loadProfileWithHotkeys(profileName);
            updateStatusText(`Profil "${profileName}" chargé avec succès`);

            // IMPORTANT: Recharger les fenêtres APRÈS avoir chargé le profil pour appliquer l'ordre sauvegardé
            log('Rechargement des fenêtres après chargement du profil...');
            await loadWindows();

            // Apply the loaded order to the taskbar immediately
            const characterNames = windowList.map(w => w.character_name);
            log('Application automatique de l\'ordre après chargement du profil:', characterNames);
            await invoke('update_window_order', { order: characterNames });
            log('Ordre appliqué automatiquement à la barre des tâches');

            // Réafficher la fenêtre de l'application si elle était réduite
            try {
                log('Tentative de réaffichage de la fenêtre...');
                const appWindow = window.__TAURI__.window.getCurrent();
                await appWindow.show();
                await new Promise(resolve => setTimeout(resolve, 100));
                await appWindow.unminimize();
                await new Promise(resolve => setTimeout(resolve, 100));
                await appWindow.setFocus();
                log('Fenêtre de l\'application réaffichée après chargement du profil');
            } catch (error) {
                logError('Erreur lors de la réaffichage de la fenêtre:', error);
                // Fallback: utiliser les commandes système
                try {
                    await invoke('show_window');
                    log('Fenêtre affichée via commande système');
                } catch (fallbackError) {
                    logError('Erreur du fallback aussi:', fallbackError);
                }
            }

            // Update selector to show the loaded profile
            selectElement.value = profileName;

            // Reset orderChanged flag when loading a profile
            orderChanged = false;
            toggleApplyOrderButton(false);

            // Si on est sur l'onglet Fenêtres, mettre à jour l'affichage
            if (document.querySelector('.tab-btn[data-tab="windows"]').classList.contains('active')) {
                log('Mise à jour de l\'affichage de l\'onglet Fenêtres');
                renderWindowList();
            }

        } catch (error) {
            logError('Échec du chargement du profil:', error);
            alert(`Échec du chargement du profil: ${error}`);
        }
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
            // Sauvegarder le profil avec la configuration des touches et l'ordre actuel des fenêtres
            await saveProfileWithHotkeys(profileName);
            log('Profil sauvegardé avec succès:', profileName);

            // Set this as current profile
            currentProfileName = profileName;
            updateCurrentProfileDisplay(profileName);

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

        // If we have a current profile, try to get its order from backend
        if (currentProfileName) {
            log('Profil actuel détecté:', currentProfileName);

            try {
                // Try to get the current profile from backend first
                const currentProfile = await invoke('get_current_profile');
                log('Profil récupéré du backend:', currentProfile);

                if (currentProfile && currentProfile.window_order && currentProfile.window_order.length > 0) {
                    log('Utilisation de l\'ordre du profil backend:', currentProfile.window_order);

                    // Reorder windows based on backend profile order
                    const orderedWindows = [];
                    for (const charName of currentProfile.window_order) {
                        const window = windows.find(w => w.character_name === charName);
                        if (window) {
                            orderedWindows.push(window);
                            log('Fenêtre trouvée et ajoutée:', charName);
                        } else {
                            log('Fenêtre non trouvée dans l\'ordre du profil:', charName);
                        }
                    }
                    // Add any windows not in the profile order
                    for (const window of windows) {
                        if (!orderedWindows.find(w => w.handle === window.handle)) {
                            orderedWindows.push(window);
                            log('Fenêtre supplémentaire ajoutée:', window.character_name);
                        }
                    }
                    windowList = orderedWindows;
                    log('Fenêtres réorganisées selon l\'ordre du profil backend. Nouvel ordre:', windowList.map(w => w.character_name));
                } else {
                    // Fallback to localStorage if backend doesn't have order
                    log('Aucun ordre trouvé dans le profil backend, tentative avec localStorage');
                    const saved = localStorage.getItem(`rustfocus_profile_${currentProfileName}`);
                    if (saved) {
                        const config = JSON.parse(saved);
                        if (config.windowOrder && config.windowOrder.length > 0) {
                            log('Ordre trouvé dans localStorage:', config.windowOrder);

                            const orderedWindows = [];
                            for (const charName of config.windowOrder) {
                                const window = windows.find(w => w.character_name === charName);
                                if (window) {
                                    orderedWindows.push(window);
                                }
                            }
                            // Add any windows not in the saved order
                            for (const window of windows) {
                                if (!orderedWindows.find(w => w.handle === window.handle)) {
                                    orderedWindows.push(window);
                                }
                            }
                            windowList = orderedWindows;
                            log('Fenêtres réorganisées selon localStorage');
                        } else {
                            windowList = windows;
                        }
                    } else {
                        windowList = windows;
                    }
                }
            } catch (error) {
                logError('Erreur lors de la récupération du profil backend:', error);
                // Fallback to localStorage
                const saved = localStorage.getItem(`rustfocus_profile_${currentProfileName}`);
                if (saved) {
                    try {
                        const config = JSON.parse(saved);
                        if (config.windowOrder && config.windowOrder.length > 0) {
                            const orderedWindows = [];
                            for (const charName of config.windowOrder) {
                                const window = windows.find(w => w.character_name === charName);
                                if (window) {
                                    orderedWindows.push(window);
                                }
                            }
                            for (const window of windows) {
                                if (!orderedWindows.find(w => w.handle === window.handle)) {
                                    orderedWindows.push(window);
                                }
                            }
                            windowList = orderedWindows;
                            log('Fenêtres réorganisées selon localStorage (fallback)');
                        } else {
                            windowList = windows;
                        }
                    } catch (localStorageError) {
                        logError('Erreur localStorage aussi:', localStorageError);
                        windowList = windows;
                    }
                } else {
                    windowList = windows;
                }
            }
        } else {
            log('Aucun profil actuel, utilisation de l\'ordre par défaut');
            windowList = windows;
        }

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

    // Retirer les anciens listeners du conteneur pour éviter les doublons
    const newListElement = listElement.cloneNode(true);
    listElement.parentNode.replaceChild(newListElement, listElement);

    if (windowList.length === 0) {
        newListElement.innerHTML = `
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
        li.dataset.index = index;
        li.dataset.handle = window.handle;

        const isExcluded = excludedWindows.has(window.handle);
        if (isExcluded) {
            li.classList.add('excluded');
        }

        li.innerHTML = `
            <div class="window-index-container">
                <div class="window-index">${index + 1}</div>
            </div>
            <div class="window-info">
                <div class="window-name">${escapeHtml(window.character_name)}</div>
            </div>
            <div class="window-actions">
                <div class="hotkey-toggle">
                    <span class="toggle-label" title="Inclure dans les raccourcis clavier">⌨️</span>
                    <label class="toggle-switch">
                        <input type="checkbox" class="hotkey-checkbox" data-handle="${window.handle}" ${isExcluded ? '' : 'checked'}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <button class="icon-btn focus-btn" data-handle="${window.handle}">
                    👁️ Focus
                </button>
            </div>
        `;

        // Add custom drag event listeners (compatible with Tauri/WebView2)
        li.addEventListener('mousedown', handleMouseDown);
        li.addEventListener('mousemove', handleMouseMove);

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

        // Add hotkey toggle listener
        li.querySelector('.hotkey-checkbox').addEventListener('change', (e) => {
            const handle = parseInt(e.target.dataset.handle);
            const isChecked = e.target.checked;

            if (isChecked) {
                excludedWindows.delete(handle);
                li.classList.remove('excluded');
                log('Fenêtre incluse dans les raccourcis:', window.character_name);
                updateStatusText(`${window.character_name} incluse dans les raccourcis`);
            } else {
                excludedWindows.add(handle);
                li.classList.add('excluded');
                log('Fenêtre exclue des raccourcis:', window.character_name);
                updateStatusText(`${window.character_name} exclue des raccourcis`);
            }

            // Save excluded windows to localStorage
            saveExcludedWindows();
        });

        newListElement.appendChild(li);
    });

    // Les event listeners drag sont maintenant gérés individuellement sur chaque élément

    log('Liste des fenêtres rendue:', windowList.length, 'éléments');

    // Update space+paste window select dropdown
    updateSpacePasteWindowSelect();
}

// Show/Hide Apply Order button
function toggleApplyOrderButton(show) {
    const applyBtn = document.getElementById('apply-order-btn');
    if (applyBtn) {
        applyBtn.style.display = show ? 'flex' : 'none';
    }
}

// Mark order as changed
function markOrderChanged() {
    orderChanged = true;
    toggleApplyOrderButton(true);
    updateStatusText('Ordre modifié - Cliquez sur "Appliquer l\'Ordre" pour mettre à jour la barre des tâches');

    // Reset profile selector to "Personnalisé" when order is changed via drag & drop or arrows
    const profileSelect = document.getElementById('window-profile-select');
    if (profileSelect) {
        profileSelect.value = '';
        log('Sélecteur de profil remis à "Personnalisé" après modification d\'ordre');
    }

    // NE PAS sauvegarder automatiquement dans le profil actuel lors du drag & drop
    // Cela sera fait uniquement quand on clique sur "Appliquer l'Ordre"
}

// Move window up in the list
function moveWindowUp(index) {
    if (index <= 0 || index >= windowList.length) return;

    // Swap with previous element
    const temp = windowList[index];
    windowList[index] = windowList[index - 1];
    windowList[index - 1] = temp;

    // Mark order as changed
    markOrderChanged();

    // Re-render the list
    renderWindowList();
}

// Move window down in the list
function moveWindowDown(index) {
    if (index < 0 || index >= windowList.length - 1) return;

    // Swap with next element
    const temp = windowList[index];
    windowList[index] = windowList[index + 1];
    windowList[index + 1] = temp;

    // Mark order as changed
    markOrderChanged();

    // Re-render the list
    renderWindowList();
}

// Update the window select dropdown for space+paste feature
function updateSpacePasteWindowSelect() {
    const select = document.getElementById('space-paste-window-select');
    if (!select) return;

    // Clear existing options except the first one
    select.innerHTML = '<option value="">Sélectionnez une fenêtre...</option>';

    // Add an option for each window
    windowList.forEach((window, index) => {
        const option = document.createElement('option');
        option.value = window.handle;
        option.textContent = `${index + 1}. ${window.character_name}`;
        select.appendChild(option);
    });

    log('Dropdown space+paste mis à jour avec', windowList.length, 'fenêtres');
}

// Variables for clipboard monitoring
let lastClipboardContent = '';
let clipboardCheckInterval = null;

// Send space + paste + enter sequence to selected window
async function sendSpacePasteEnter(withFocus) {
    const select = document.getElementById('space-paste-window-select');
    const selectedHandle = select.value;

    if (!selectedHandle) {
        alert('Veuillez sélectionner une fenêtre cible');
        return;
    }

    try {
        log('Envoi de la séquence espace+coller+entrée à la fenêtre:', selectedHandle, 'avec focus:', withFocus);
        await invoke('send_space_paste_enter', {
            handle: parseInt(selectedHandle),
            withFocus: withFocus
        });
        log('Séquence espace+coller+entrée envoyée avec succès');

        // Show success feedback
        const btn = withFocus ? document.getElementById('send-space-paste-btn') : document.getElementById('send-space-paste-test-btn');
        const originalText = btn.textContent;
        btn.textContent = '✅ Envoyé !';
        btn.disabled = true;

        setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
        }, 2000);
    } catch (error) {
        logError('Erreur lors de l\'envoi de la séquence:', error);
        alert(`Erreur: ${error}`);
    }
}

// Check clipboard for /travel and auto-send
async function checkClipboardForTravel() {
    try {
        // Use Tauri clipboard API instead of navigator.clipboard
        const clipboardText = await invoke('read_clipboard');

        // Check if clipboard changed and contains /travel
        if (clipboardText !== lastClipboardContent && clipboardText.includes('/travel')) {
            log('Détection de /travel dans le presse-papier:', clipboardText);
            lastClipboardContent = clipboardText;

            // Get selected window
            const select = document.getElementById('space-paste-window-select');
            const selectedHandle = select.value;

            if (selectedHandle) {
                log('Envoi automatique de la séquence pour /travel');
                await invoke('send_space_paste_enter', {
                    handle: parseInt(selectedHandle),
                    withFocus: false  // Don't focus for auto-send
                });
                log('Séquence /travel envoyée automatiquement');
            } else {
                log('Aucune fenêtre sélectionnée pour l\'envoi automatique');
            }
        } else if (clipboardText !== lastClipboardContent) {
            // Update last content even if it doesn't contain /travel
            lastClipboardContent = clipboardText;
        }
    } catch (error) {
        // Ignore clipboard access errors (happens when clipboard is empty)
        // This is normal and expected
    }
}

// Toggle auto-travel monitoring
function toggleAutoTravel() {
    const checkbox = document.getElementById('auto-travel-checkbox');

    if (checkbox.checked) {
        log('Activation de la surveillance du presse-papier pour /travel');
        // Check clipboard every 500ms
        clipboardCheckInterval = setInterval(checkClipboardForTravel, 500);
        localStorage.setItem('auto_travel_enabled', 'true');
    } else {
        log('Désactivation de la surveillance du presse-papier');
        if (clipboardCheckInterval) {
            clearInterval(clipboardCheckInterval);
            clipboardCheckInterval = null;
        }
        localStorage.setItem('auto_travel_enabled', 'false');
    }
}

// Custom Drag and Drop handlers (compatible with Tauri/WebView2)
function handleMouseDown(e) {
    // Only start drag if clicking on the main area (not buttons or arrows)
    if (e.target.closest('.icon-btn') || e.target.closest('.arrow-btn')) {
        return; // Ignore clicks on buttons
    }

    isDragging = false;
    currentDraggedItem = e.currentTarget;
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    // Prevent default to avoid any browser behaviors
    e.preventDefault();
    e.stopPropagation();
}

function handleMouseMove(e) {
    if (!currentDraggedItem) {
        return;
    }

    if (isDragging) {
        handleGlobalMouseMove(e);
        return;
    }

    // Check if moved enough to start dragging
    const deltaX = Math.abs(e.clientX - dragStartX);
    const deltaY = Math.abs(e.clientY - dragStartY);

    if (deltaX > 5 || deltaY > 5) {
        // Start dragging
        isDragging = true;
        currentDraggedItem.classList.add('dragging');

        // Add global mouse event listeners
        document.addEventListener('mousemove', handleGlobalMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        // Prevent text selection and unwanted behaviors
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'move';

        // Prevent default to avoid browser drag
        e.preventDefault();
        e.stopPropagation();
    }
}

function handleGlobalMouseMove(e) {
    if (!isDragging || !currentDraggedItem) return;

    const container = currentDraggedItem.closest('.window-list');
    const scrollContainer = currentDraggedItem.closest('.window-list-container');

    if (!container || !scrollContainer) return;

    // Auto-scroll when dragging near edges
    const containerRect = scrollContainer.getBoundingClientRect();
    const scrollThreshold = 50; // pixels from edge to start scrolling
    const scrollSpeed = 6; // pixels per frame

    if (e.clientY < containerRect.top + scrollThreshold) {
        // Scroll up
        scrollContainer.scrollTop -= scrollSpeed;
    } else if (e.clientY > containerRect.bottom - scrollThreshold) {
        // Scroll down
        scrollContainer.scrollTop += scrollSpeed;
    }

    // Prevent default to avoid browser behaviors
    e.preventDefault();

    // Clear previous drop indicators
    const allItems = container.querySelectorAll('.window-item');
    allItems.forEach(item => {
        item.classList.remove('drop-before', 'drop-after');
    });

    // Déterminer où insérer l'élément avec un indicateur visuel
    const dropInfo = getDragAfterElement(container, e.clientY);

    if (dropInfo) {
        const { element: afterElement, position } = dropInfo;

        // Show visual indicator
        if (afterElement && position === 'before') {
            afterElement.classList.add('drop-before');
        } else if (afterElement && position === 'after') {
            afterElement.classList.add('drop-after');
        }

        // Actually move the element in the DOM for visual feedback
        // Only move if the position actually changes
        const currentIndex = Array.from(container.children).indexOf(currentDraggedItem);
        let targetIndex;

        if (afterElement) {
            if (position === 'before') {
                targetIndex = Array.from(container.children).indexOf(afterElement);
            } else {
                targetIndex = Array.from(container.children).indexOf(afterElement) + 1;
            }
        } else {
            targetIndex = container.children.length;
        }

        if (targetIndex !== currentIndex && targetIndex !== currentIndex + 1) {
            if (afterElement) {
                if (position === 'before') {
                    // Insert before the target element
                    container.insertBefore(currentDraggedItem, afterElement);
                } else {
                    // Insert after the target element
                    const nextElement = afterElement.nextSibling;
                    if (nextElement) {
                        container.insertBefore(currentDraggedItem, nextElement);
                    } else {
                        container.appendChild(currentDraggedItem);
                    }
                }
            } else {
                // Drop at the end
                container.appendChild(currentDraggedItem);
            }

            // Update all index numbers after DOM change
            updateIndexNumbers(container);
        }
    }
}

function handleMouseUp(e) {
    if (!isDragging) {
        currentDraggedItem = null;
        return;
    }

    // Remove dragging state
    if (currentDraggedItem) {
        currentDraggedItem.classList.remove('dragging');
    }

    // Clear all drop indicators
    const container = currentDraggedItem?.closest('.window-list');
    if (container) {
        const allItems = container.querySelectorAll('.window-item');
        allItems.forEach(item => {
            item.classList.remove('drop-before', 'drop-after');
        });
    }

    // Reset body styles
    document.body.style.userSelect = '';
    document.body.style.cursor = '';

    // Mark order as changed instead of applying immediately
    updateWindowListFromDOM();
    markOrderChanged();

    // Clean up
    isDragging = false;
    currentDraggedItem = null;

    // Remove global listeners
    document.removeEventListener('mousemove', handleGlobalMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.window-item:not(.dragging)')];

    if (draggableElements.length === 0) {
        return { element: null, position: 'after' };
    }

    // Find the element the mouse is over or closest to
    let closestElement = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    let position = 'after';

    for (const element of draggableElements) {
        const box = element.getBoundingClientRect();
        const elementCenter = box.top + box.height / 2;
        const distanceFromTop = Math.abs(y - box.top);
        const distanceFromBottom = Math.abs(y - box.bottom);
        const distanceFromCenter = Math.abs(y - elementCenter);

        // Determine if mouse is in the top half or bottom half of the element
        if (y >= box.top && y <= box.bottom) {
            // Mouse is over this element
            closestElement = element;
            position = (y < elementCenter) ? 'before' : 'after';
            break;
        } else if (distanceFromTop < closestDistance || distanceFromBottom < closestDistance) {
            // Mouse is between elements, find the closest one
            if (distanceFromTop < distanceFromBottom && distanceFromTop < closestDistance) {
                closestDistance = distanceFromTop;
                closestElement = element;
                position = 'before';
            } else if (distanceFromBottom < closestDistance) {
                closestDistance = distanceFromBottom;
                closestElement = element;
                position = 'after';
            }
        }
    }

    // If no element found, drop at the end
    if (!closestElement) {
        const lastElement = draggableElements[draggableElements.length - 1];
        return { element: lastElement, position: 'after' };
    }

    return { element: closestElement, position };
}

// Update windowList from current DOM order (after drag-and-drop)
// Update index numbers for all window items
function updateIndexNumbers(container) {
    const items = container.querySelectorAll('.window-item');
    items.forEach((item, index) => {
        const indexElement = item.querySelector('.window-index');
        if (indexElement) {
            indexElement.textContent = index + 1;
        }
    });
}

function updateWindowListFromDOM() {
    const items = document.querySelectorAll('.window-item');
    const newOrder = [];

    items.forEach((item) => {
        const handle = parseInt(item.dataset.handle);
        const window = windowList.find(w => w.handle === handle);
        if (window) {
            newOrder.push(window);
        }
    });

    windowList = newOrder;
    log('Ordre mis à jour depuis le DOM:', windowList.map(w => w.character_name));
}

// Apply window order and send to backend (called by Apply Order button)
async function applyWindowOrder() {
    log('=== APPLY WINDOW ORDER CALLED ===');

    if (!orderChanged) {
        log('Aucun changement d\'ordre détecté, annulation');
        return;
    }

    const characterNames = windowList.map(w => w.character_name);
    log('Ordre à appliquer:', characterNames);

    try {
        log('🔄 APPEL DU BACKEND pour réorganiser la barre des tâches...');
        const result = await invoke('update_window_order', { order: characterNames });
        log('✅ Backend response:', result);
        log('✅ Réorganisation de la barre des tâches terminée');

        // IMPORTANT: NE PLUS sauvegarder automatiquement dans le profil actuel lors de l'application de l'ordre
        // Le profil ne doit être modifié que VIA LE BOUTON SAUVEGARDER dans l'onglet Profils
        log('ℹ️ Application de l\'ordre à la barre des tâches uniquement, profil non modifié');

        // Reset order changed flag and hide button
        orderChanged = false;
        toggleApplyOrderButton(false);

        // Réafficher la fenêtre de l'application si elle était réduite
        try {
            log('Tentative de réaffichage de la fenêtre...');
            const appWindow = window.__TAURI__.window.getCurrent();
            await appWindow.show();
            await new Promise(resolve => setTimeout(resolve, 100)); // Petit délai
            await appWindow.unminimize();
            await new Promise(resolve => setTimeout(resolve, 100)); // Petit délai
            await appWindow.setFocus();
            log('Fenêtre de l\'application réaffichée après application de l\'ordre');
        } catch (error) {
            logError('Erreur lors de la réaffichage de la fenêtre:', error);
            // Fallback: utiliser les commandes système
            try {
                await invoke('show_window');
                log('Fenêtre affichée via commande système');
            } catch (fallbackError) {
                logError('Erreur du fallback aussi:', fallbackError);
            }
        }

        updateStatusText('Ordre appliqué - Barre des tâches réorganisée');
    } catch (error) {
        logError('❌ Échec de la mise à jour de l\'ordre:', error);
        alert(`Erreur lors de la mise à jour de l'ordre: ${error}`);
    }
}

// Setup default hotkeys
async function setupHotkeys() {
    log('Configuration des raccourcis clavier...');
    try {
        // Utiliser la configuration actuelle (chargée depuis localStorage ou profil)
        const customHotkeys = [];

        if (hotkeyConfig.next) {
            customHotkeys.push({
                id: 1,
                modifiers: 0,
                key_code: hotkeyConfig.next.vkCode,
                action: "NextWindow"
            });
        }

        if (hotkeyConfig.prev) {
            customHotkeys.push({
                id: 2,
                modifiers: 0,
                key_code: hotkeyConfig.prev.vkCode,
                action: "PreviousWindow"
            });
        }

        for (let i = 0; i < 8; i++) {
            const key = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'][i];
            if (hotkeyConfig[key]) {
                customHotkeys.push({
                    id: 10 + i,
                    modifiers: 0,
                    key_code: hotkeyConfig[key].vkCode,
                    action: { DirectWindow: i }
                });
            }
        }

        if (customHotkeys.length > 0) {
            await invoke('setup_custom_hotkeys', { hotkeys: customHotkeys });
            log('✓ Configuration personnalisée appliquée');
        } else {
            await invoke('setup_default_hotkeys');
            log('✓ Configuration par défaut appliquée');
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
    let profiles = [];

    try {
        profiles = await invoke('list_profiles');
        log('Profils chargés depuis Rust:', profiles.length, profiles);
    } catch (error) {
        logError('Échec du chargement des profils depuis Rust, utilisation de localStorage uniquement:', error);
        profiles = [];
    }

    // Always check localStorage for profiles saved there
    const localProfiles = listSavedProfiles();
    log('Profils dans localStorage:', localProfiles.length, localProfiles.map(p => p.name));

    // Merge profiles from Rust and localStorage
    const allProfiles = [...new Set([...profiles, ...localProfiles.map(p => p.name)])];
    log('Profils fusionnés:', allProfiles.length, allProfiles);

    renderProfileList(allProfiles);
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

                // Mettre à jour l'indication du profil actif
                updateCurrentProfileDisplay(name);

                // IMPORTANT: Recharger les fenêtres APRÈS avoir chargé le profil pour appliquer l'ordre sauvegardé
                log('Rechargement des fenêtres après chargement du profil...');
                await loadWindows();

                // Apply the loaded order to the taskbar immediately
                const characterNames = windowList.map(w => w.character_name);
                log('Application automatique de l\'ordre après chargement du profil:', characterNames);
                await invoke('update_window_order', { order: characterNames });
                log('Ordre appliqué automatiquement à la barre des tâches');

                // Reset orderChanged flag when loading a profile
                orderChanged = false;
                toggleApplyOrderButton(false);

                // Réafficher la fenêtre de l'application si elle était réduite
                try {
                    log('Tentative de réaffichage de la fenêtre...');
                    const appWindow = window.__TAURI__.window.getCurrent();
                    await appWindow.show();
                    await new Promise(resolve => setTimeout(resolve, 100));
                    await appWindow.unminimize();
                    await new Promise(resolve => setTimeout(resolve, 100));
                    await appWindow.setFocus();
                    log('Fenêtre de l\'application réaffichée après chargement du profil');
                } catch (error) {
                    logError('Erreur lors de la réaffichage de la fenêtre:', error);
                    // Fallback: utiliser les commandes système
                    try {
                        await invoke('show_window');
                        log('Fenêtre affichée via commande système');
                    } catch (fallbackError) {
                        logError('Erreur du fallback aussi:', fallbackError);
                    }
                }

                // Si on est sur l'onglet Fenêtres, mettre à jour l'affichage
                if (document.querySelector('.tab-btn[data-tab="windows"]').classList.contains('active')) {
                    log('Mise à jour de l\'affichage de l\'onglet Fenêtres');
                    renderWindowList();
                }

                // Mettre à jour le sélecteur de profil dans l'onglet Fenêtres
                await loadProfiles();
                updateWindowsProfileSelector(profiles);

            } catch (error) {
                logError('Échec du chargement du profil:', error);
                alert(`Échec du chargement du profil: ${error}`);
            }
        });

        // Delete profile button
        li.querySelector('.delete-profile-btn').addEventListener('click', async (e) => {
            const name = e.target.dataset.name;
            log('Tentative de suppression du profil:', name);

            // Use Tauri dialog instead of browser confirm
            try {
                const confirmed = await window.__TAURI__.dialog.confirm(
                    `Voulez-vous vraiment supprimer le profil "${name}" ?`,
                    'Confirmation de suppression'
                );

                if (!confirmed) {
                    log('Suppression annulée par l\'utilisateur');
                    return;
                }

                log('Suppression confirmée, suppression du profil:', name);

                // Delete from localStorage only (since Rust backend fails)
                localStorage.removeItem(`rustfocus_profile_${name}`);
                log('Profil supprimé de localStorage');

                updateStatusText(`Profil "${name}" supprimé`);
                await loadProfiles();

                // Try Rust backend but don't fail if it doesn't work
                try {
                    await invoke('delete_profile', { name });
                    log('Profil supprimé côté Rust (succès)');
                } catch (rustError) {
                    log('Note: Suppression côté Rust a échoué, mais localStorage a été nettoyé');
                }
            } catch (error) {
                logError('Échec de la suppression du profil:', error);
                alert(`Échec de la suppression du profil: ${error}`);
            }
        });

        listElement.appendChild(li);
    });

    log('Liste des profils rendue:', profiles.length, 'éléments');

    // Update auto-load profile selector
    updateAutoLoadProfileSelector(profiles);

    // Update windows tab profile selector
    updateWindowsProfileSelector(profiles);
}

// Update the auto-load profile selector with current profiles
function updateAutoLoadProfileSelector(profiles) {
    const selectElement = document.getElementById('auto-load-profile-select');
    if (!selectElement) return;

    // Clear existing options except the first one
    while (selectElement.children.length > 1) {
        selectElement.removeChild(selectElement.lastChild);
    }

    // Add profile options
    profiles.forEach(profileName => {
        const option = document.createElement('option');
        option.value = profileName;
        option.textContent = profileName;

        // Select if this is the current auto-load profile
        if (profileName === autoLoadProfile) {
            option.selected = true;
        }

        selectElement.appendChild(option);
    });

    // Add event listener for changes
    selectElement.addEventListener('change', (e) => {
        const selectedProfile = e.target.value;
        if (selectedProfile) {
            localStorage.setItem('rustfocus_auto_load_profile', selectedProfile);
            autoLoadProfile = selectedProfile;
            updateStatusText(`Profil "${selectedProfile}" défini comme lancement automatique`);
        } else {
            localStorage.removeItem('rustfocus_auto_load_profile');
            autoLoadProfile = null;
            updateStatusText('Lancement automatique désactivé');
        }
    });
}

// Update the windows tab profile selector with current profiles
function updateWindowsProfileSelector(profiles) {
    const selectElement = document.getElementById('window-profile-select');
    if (!selectElement) return;

    // Clear all options
    selectElement.innerHTML = '';

    // Add "Personnalisé" as first option (disabled, for display only)
    const personnaliseOption = document.createElement('option');
    personnaliseOption.value = '';
    personnaliseOption.textContent = 'Personnalisé';
    personnaliseOption.disabled = true;
    selectElement.appendChild(personnaliseOption);

    // Add profile options
    profiles.forEach(profileName => {
        const option = document.createElement('option');
        option.value = profileName;
        option.textContent = profileName;

        selectElement.appendChild(option);
    });

    // Select current active profile if it exists, otherwise "Personnalisé" (disabled option)
    if (currentProfileName && profiles.includes(currentProfileName)) {
        selectElement.value = currentProfileName;
        log('Sélecteur mis à jour avec le profil actif:', currentProfileName);
    } else {
        personnaliseOption.selected = true; // Show "Personnalisé" as selected but disabled
        log('Sélecteur mis à jour avec "Personnalisé"');
    }
}

// Update status text
function updateStatusText(text) {
    log('Mise à jour du statut:', text);
    const statusElement = document.getElementById('status-text');
    statusElement.textContent = text;

    // Add warning class for order modified messages
    if (text.toLowerCase().includes('ordre modifié') || text.toLowerCase().includes('ordre modifie')) {
        statusElement.classList.add('status-warning');
    } else {
        statusElement.classList.remove('status-warning');
    }

    // Reset to "Ready" after 5 seconds
    setTimeout(() => {
        statusElement.textContent = 'Prêt';
        statusElement.classList.remove('status-warning');
    }, 5000);
}

// Update the current profile display in the header
function updateCurrentProfileDisplay(profileName) {
    log('Mise à jour de l\'affichage du profil actif:', profileName);

    // Find the profile indicator element in the header and remove it if it exists
    let profileIndicator = document.getElementById('current-profile-indicator');
    if (profileIndicator) {
        profileIndicator.remove();
    }

    // Don't create the indicator anymore
    log('Indicateur de profil supprimé');
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Save excluded windows to localStorage and update backend
async function saveExcludedWindows() {
    const excluded = Array.from(excludedWindows);
    localStorage.setItem('rustfocus_excluded_windows', JSON.stringify(excluded));
    log('Fenêtres exclues sauvegardées:', excluded);

    // Update backend Rust with excluded windows
    try {
        await invoke('update_excluded_windows', { excludedHandles: excluded });
        log('Backend mis à jour avec les fenêtres exclues:', excluded);
    } catch (error) {
        logError('Erreur lors de la mise à jour des fenêtres exclues dans le backend:', error);
    }
}

// Load excluded windows from localStorage and update backend
async function loadExcludedWindows() {
    try {
        const saved = localStorage.getItem('rustfocus_excluded_windows');
        if (saved) {
            const excluded = JSON.parse(saved);
            excludedWindows = new Set(excluded);
            log('Fenêtres exclues chargées:', excluded);

            // Update backend with loaded exclusions
            try {
                await invoke('update_excluded_windows', { excludedHandles: excluded });
                log('Backend initialisé avec les fenêtres exclues:', excluded);
            } catch (error) {
                logError('Erreur lors de l\'initialisation des fenêtres exclues dans le backend:', error);
            }
        }
    } catch (error) {
        logError('Erreur lors du chargement des exclusions:', error);
        excludedWindows = new Set();
    }
}

// Initialize when DOM is ready
console.log('[Organizer 2.0] document.readyState:', document.readyState);
if (document.readyState === 'loading') {
    console.log('[Organizer 2.0] DOM pas encore chargé, attente de DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[Organizer 2.0] DOMContentLoaded déclenché, appel de init()...');
        init();
    });
} else {
    console.log('[Organizer 2.0] DOM déjà chargé, appel direct de init()...');
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
    log('Ordre actuel des fenêtres:', windowList.map(w => w.character_name));

    // Vérifier si le profil existe déjà pour préserver ses données
    const existingProfile = localStorage.getItem(`rustfocus_profile_${profileName}`);
    let existingConfig = null;

    if (existingProfile) {
        try {
            existingConfig = JSON.parse(existingProfile);
            log('Profil existant trouvé, préservation des données');
        } catch (error) {
            logError('Erreur parsing profil existant:', error);
        }
    }

    // Récupérer l'état du travel automatique
    const autoTravelCheckbox = document.getElementById('auto-travel-checkbox');
    const autoTravelWindowSelect = document.getElementById('space-paste-window-select');

    // Sauvegarder la configuration dans localStorage pour persistance
    // On ne met à jour que CE profil spécifique, pas tous les autres
    const configToSave = {
        profileName,
        hotkeyConfig: hotkeyConfig,
        windowOrder: windowList.map(w => w.character_name), // Ordre actuel des fenêtres
        autoTravelEnabled: autoTravelCheckbox ? autoTravelCheckbox.checked : false,
        autoTravelWindow: autoTravelWindowSelect ? autoTravelWindowSelect.value : '',
        timestamp: Date.now()
    };

    localStorage.setItem(`rustfocus_profile_${profileName}`, JSON.stringify(configToSave));
    log('✓ Profil sauvegardé dans localStorage:', configToSave);

    // Sauvegarder aussi via l'API Rust (pour le window_order)
    try {
        await invoke('save_profile', { name: profileName });
        log('✓ Profil sauvegardé côté Rust');
    } catch (error) {
        logError('Erreur sauvegarde Rust:', error);
        // Ne pas échouer si Rust échoue, localStorage suffit
    }

    log('✓ Profil sauvegardé avec succès:', profileName);
}

// Charger un profil avec la configuration des touches
async function loadProfileWithHotkeys(profileName) {
    log('Chargement du profil avec configuration des touches:', profileName);

    // Set current profile name
    currentProfileName = profileName;

    // Charger d'abord le profil côté backend pour synchroniser les raccourcis
    try {
        await invoke('load_profile', { name: profileName });
        log('✓ Profil chargé côté backend avec succès');
    } catch (error) {
        logError('Erreur lors du chargement du profil côté backend:', error);
        // Continuer malgré l'erreur - l'interface utilisateur sera chargée depuis localStorage
    }

    // Charger depuis localStorage
    const saved = localStorage.getItem(`rustfocus_profile_${profileName}`);
    let config = null;

    if (saved) {
        try {
            config = JSON.parse(saved);
            log('Configuration chargée depuis localStorage:', config);
            log('Ordre des fenêtres dans le profil:', config.windowOrder);

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

                // Réappliquer les hotkeys avec la configuration personnalisée
                const customHotkeys = [];

                if (config.hotkeyConfig.next) {
                    customHotkeys.push({
                        id: 1,
                        modifiers: 0,
                        key_code: config.hotkeyConfig.next.vkCode,
                        action: "NextWindow"
                    });
                }

                if (config.hotkeyConfig.prev) {
                    customHotkeys.push({
                        id: 2,
                        modifiers: 0,
                        key_code: config.hotkeyConfig.prev.vkCode,
                        action: "PreviousWindow"
                    });
                }

                for (let i = 0; i < 8; i++) {
                    const key = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'][i];
                    if (config.hotkeyConfig[key]) {
                        customHotkeys.push({
                            id: 10 + i,
                            modifiers: 0,
                            key_code: config.hotkeyConfig[key].vkCode,
                            action: { DirectWindow: i }
                        });
                    }
                }

                await invoke('setup_custom_hotkeys', { hotkeys: customHotkeys });
                log('✓ Raccourcis personnalisés réenregistrés');
            }

            // Restaurer l'ordre des fenêtres si disponible
            if (config.windowOrder && config.windowOrder.length > 0) {
                log('✓ Ordre des fenêtres restauré depuis localStorage:', config.windowOrder);
                // L'ordre sera appliqué lors du chargement des fenêtres
                // IMPORTANT: Il faut s'assurer que loadWindows() utilise cet ordre
            } else {
                log('Aucun ordre de fenêtres trouvé dans le profil');
            }

            // Restaurer l'état du travel automatique
            const autoTravelCheckbox = document.getElementById('auto-travel-checkbox');
            const autoTravelWindowSelect = document.getElementById('space-paste-window-select');

            if (autoTravelCheckbox && config.autoTravelEnabled !== undefined) {
                autoTravelCheckbox.checked = config.autoTravelEnabled;
                // Déclencher l'activation/désactivation du mode auto
                if (config.autoTravelEnabled) {
                    clipboardCheckInterval = setInterval(checkClipboardForTravel, 500);
                } else {
                    if (clipboardCheckInterval) {
                        clearInterval(clipboardCheckInterval);
                    }
                }
                log('✓ État du travel automatique restauré:', config.autoTravelEnabled);
            }

            if (autoTravelWindowSelect && config.autoTravelWindow) {
                autoTravelWindowSelect.value = config.autoTravelWindow;
                log('✓ Fenêtre cible du travel automatique restaurée:', config.autoTravelWindow);
            }
        } catch (error) {
            logError('Erreur lors du parsing de la configuration:', error);
        }
    }

    // Retourner un profil factice basé sur les données localStorage
    if (config) {
        return {
            name: profileName,
            window_order: config.windowOrder || [],
            hotkeys: [] // Les hotkeys sont déjà chargées depuis localStorage
        };
    } else {
        return {
            name: profileName,
            window_order: [],
            hotkeys: []
        };
    }
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
    // Lettres A-Z
    'KeyA': 0x41, 'KeyB': 0x42, 'KeyC': 0x43, 'KeyD': 0x44, 'KeyE': 0x45,
    'KeyF': 0x46, 'KeyG': 0x47, 'KeyH': 0x48, 'KeyI': 0x49, 'KeyJ': 0x4A,
    'KeyK': 0x4B, 'KeyL': 0x4C, 'KeyM': 0x4D, 'KeyN': 0x4E, 'KeyO': 0x4F,
    'KeyP': 0x50, 'KeyQ': 0x51, 'KeyR': 0x52, 'KeyS': 0x53, 'KeyT': 0x54,
    'KeyU': 0x55, 'KeyV': 0x56, 'KeyW': 0x57, 'KeyX': 0x58, 'KeyY': 0x59, 'KeyZ': 0x5A,

    // Chiffres 0-9 (pavé principal)
    'Digit0': 0x30, 'Digit1': 0x31, 'Digit2': 0x32, 'Digit3': 0x33, 'Digit4': 0x34,
    'Digit5': 0x35, 'Digit6': 0x36, 'Digit7': 0x37, 'Digit8': 0x38, 'Digit9': 0x39,

    // Pavé numérique
    'Numpad0': 0x60, 'Numpad1': 0x61, 'Numpad2': 0x62, 'Numpad3': 0x63, 'Numpad4': 0x64,
    'Numpad5': 0x65, 'Numpad6': 0x66, 'Numpad7': 0x67, 'Numpad8': 0x68, 'Numpad9': 0x69,
    'NumpadMultiply': 0x6A, 'NumpadAdd': 0x6B, 'NumpadSubtract': 0x6D,
    'NumpadDecimal': 0x6E, 'NumpadDivide': 0x6F,

    // Touches de fonction
    'F1': 0x70, 'F2': 0x71, 'F3': 0x72, 'F4': 0x73,
    'F5': 0x74, 'F6': 0x75, 'F7': 0x76, 'F8': 0x77,
    'F9': 0x78, 'F10': 0x79, 'F11': 0x7A, 'F12': 0x7B,
    'F13': 0x7C, 'F14': 0x7D, 'F15': 0x7E, 'F16': 0x7F,
    'F17': 0x80, 'F18': 0x81, 'F19': 0x82, 'F20': 0x83,
    'F21': 0x84, 'F22': 0x85, 'F23': 0x86, 'F24': 0x87,

    // Navigation
    'ArrowUp': 0x26, 'ArrowDown': 0x28, 'ArrowLeft': 0x25, 'ArrowRight': 0x27,
    'PageUp': 0x21, 'PageDown': 0x22,
    'Home': 0x24, 'End': 0x23,
    'Insert': 0x2D, 'Delete': 0x2E,

    // Touches spéciales
    'Space': 0x20, 'Enter': 0x0D, 'Tab': 0x09, 'Escape': 0x1B,
    'Backspace': 0x08,

    // Symboles
    'Minus': 0xBD, 'Equal': 0xBB,
    'BracketLeft': 0xDB, 'BracketRight': 0xDD,
    'Semicolon': 0xBA, 'Quote': 0xDE,
    'Backslash': 0xDC, 'Comma': 0xBC, 'Period': 0xBE, 'Slash': 0xBF,
    'Backquote': 0xC0,
};

// Noms lisibles des touches
const keyNames = {
    // Lettres
    'KeyA': 'A', 'KeyB': 'B', 'KeyC': 'C', 'KeyD': 'D', 'KeyE': 'E',
    'KeyF': 'F', 'KeyG': 'G', 'KeyH': 'H', 'KeyI': 'I', 'KeyJ': 'J',
    'KeyK': 'K', 'KeyL': 'L', 'KeyM': 'M', 'KeyN': 'N', 'KeyO': 'O',
    'KeyP': 'P', 'KeyQ': 'Q', 'KeyR': 'R', 'KeyS': 'S', 'KeyT': 'T',
    'KeyU': 'U', 'KeyV': 'V', 'KeyW': 'W', 'KeyX': 'X', 'KeyY': 'Y', 'KeyZ': 'Z',

    // Chiffres
    'Digit0': '0', 'Digit1': '1', 'Digit2': '2', 'Digit3': '3', 'Digit4': '4',
    'Digit5': '5', 'Digit6': '6', 'Digit7': '7', 'Digit8': '8', 'Digit9': '9',

    // Pavé numérique
    'Numpad0': 'Num 0', 'Numpad1': 'Num 1', 'Numpad2': 'Num 2', 'Numpad3': 'Num 3', 'Numpad4': 'Num 4',
    'Numpad5': 'Num 5', 'Numpad6': 'Num 6', 'Numpad7': 'Num 7', 'Numpad8': 'Num 8', 'Numpad9': 'Num 9',
    'NumpadMultiply': 'Num *', 'NumpadAdd': 'Num +', 'NumpadSubtract': 'Num -',
    'NumpadDecimal': 'Num .', 'NumpadDivide': 'Num /',

    // Fonctions
    'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4',
    'F5': 'F5', 'F6': 'F6', 'F7': 'F7', 'F8': 'F8',
    'F9': 'F9', 'F10': 'F10', 'F11': 'F11', 'F12': 'F12',
    'F13': 'F13', 'F14': 'F14', 'F15': 'F15', 'F16': 'F16',
    'F17': 'F17', 'F18': 'F18', 'F19': 'F19', 'F20': 'F20',
    'F21': 'F21', 'F22': 'F22', 'F23': 'F23', 'F24': 'F24',

    // Navigation
    'ArrowUp': '↑', 'ArrowDown': '↓', 'ArrowLeft': '←', 'ArrowRight': '→',
    'PageUp': 'Page Up', 'PageDown': 'Page Down',
    'Home': 'Home', 'End': 'End',
    'Insert': 'Insert', 'Delete': 'Delete',

    // Spéciales
    'Space': 'Espace', 'Enter': 'Entrée', 'Tab': 'Tab', 'Escape': 'Echap',
    'Backspace': 'Retour',

    // Symboles
    'Minus': '-', 'Equal': '=',
    'BracketLeft': '[', 'BracketRight': ']',
    'Semicolon': ';', 'Quote': "'",
    'Backslash': '\\', 'Comma': ',', 'Period': '.', 'Slash': '/',
    'Backquote': '`',
};

// Configurer une touche
function configureHotkey(hotkeyId) {
    console.log('[Organizer 2.0] ========================================');
    console.log('[Organizer 2.0] CONFIGURER HOTKEY APPELÉ:', hotkeyId);
    console.log('[Organizer 2.0] ========================================');

    log('Configuration de la touche:', hotkeyId);

    // Si on est déjà en train de configurer, annuler
    if (currentlyConfiguring) {
        log('Annulation de la configuration précédente:', currentlyConfiguring);
        cancelHotkeyConfiguration();
    }

    currentlyConfiguring = hotkeyId;
    const kbdElement = document.getElementById(`hotkey-${hotkeyId}`);

    if (!kbdElement) {
        logError('Élément kbd non trouvé:', `hotkey-${hotkeyId}`);
        return;
    }

    log('Élément kbd trouvé:', kbdElement);

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
            log('Touche non supportée détectée:', key, e.code);
            alert(`Touche non supportée: ${e.code}\n\nLa plupart des touches sont supportées (A-Z, 0-9, F1-F24, flèches, etc.).\nCette touche spécifique n'est pas reconnue.`);
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
    console.log('[Organizer 2.0] ========================================');
    console.log('[Organizer 2.0] APPLIQUER LES HOTKEYS APPELÉ !');
    console.log('[Organizer 2.0] ========================================');

    log('Application des changements de touches...');

    const applyBtn = document.getElementById('apply-hotkeys-btn');
    if (applyBtn) {
        applyBtn.disabled = true;
        applyBtn.textContent = '🔄 Application...';
        log('Bouton désactivé');
    } else {
        logError('Bouton apply-hotkeys-btn non trouvé !');
    }

    try {
        // Créer une nouvelle configuration basée sur les touches personnalisées
        const customHotkeys = [];

        log('Configuration actuelle:', hotkeyConfig);

        // Ajouter les touches personnalisées
        if (hotkeyConfig.next) {
            customHotkeys.push({
                id: 1,
                modifiers: 0,
                key_code: hotkeyConfig.next.vkCode,
                action: "NextWindow"
            });
        }

        if (hotkeyConfig.prev) {
            customHotkeys.push({
                id: 2,
                modifiers: 0,
                key_code: hotkeyConfig.prev.vkCode,
                action: "PreviousWindow"
            });
        }

        // F1-F8
        for (let i = 0; i < 8; i++) {
            const key = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'][i];
            if (hotkeyConfig[key]) {
                customHotkeys.push({
                    id: 10 + i,
                    modifiers: 0,
                    key_code: hotkeyConfig[key].vkCode,
                    action: { DirectWindow: i }
                });
            }
        }

        log('Configuration personnalisée à envoyer:', JSON.stringify(customHotkeys, null, 2));

        // Envoyer la configuration personnalisée au backend
        log('Envoi au backend...');
        await invoke('setup_custom_hotkeys', { hotkeys: customHotkeys });
        log('✓ Backend a répondu avec succès');

        // Sauvegarder la configuration dans localStorage pour persistance
        const configToSave = {
            hotkeyConfig: hotkeyConfig,
            timestamp: Date.now()
        };
        localStorage.setItem('rustfocus_hotkey_config', JSON.stringify(configToSave));
        log('✓ Configuration sauvegardée dans localStorage');

        updateStatusText('Raccourcis mis à jour avec succès ✓');

        alert('Raccourcis mis à jour avec succès !\n\nLes nouveaux raccourcis sont maintenant actifs.');
        log('✓ Raccourcis mis à jour avec succès !');
    } catch (error) {
        logError('Échec de la mise à jour des raccourcis:', error);
        logError('Stack trace:', error.stack);
        updateStatusText('Erreur lors de la mise à jour');
        alert('Erreur lors de la mise à jour des raccourcis:\n' + error);
    } finally {
        // Réactiver le bouton
        if (applyBtn) {
            applyBtn.disabled = false;
            applyBtn.textContent = '💾 Appliquer les Changements';
            log('Bouton réactivé');
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

// Minimize to system tray
async function minimizeToTray() {
    log('Réduction de l\'application dans la barre des tâches système...');
    try {
        const appWindow = window.__TAURI__.window.getCurrent();
        await appWindow.hide();
        updateStatusText('Application réduite dans la barre des tâches');
        log('✓ Application réduite avec succès');
    } catch (error) {
        logError('Échec de la réduction:', error);
        alert('Erreur lors de la réduction de l\'application');
    }
}

// ===== AUTO-UPDATE SYSTEM =====

// Check for updates using GitHub API
async function checkForUpdates() {
    log('Vérification des mises à jour via GitHub API...');
    const checkBtn = document.getElementById('check-update-btn');
    const statusDiv = document.getElementById('update-status');

    // Disable button and show loading state
    checkBtn.disabled = true;
    checkBtn.textContent = '⏳ Vérification...';
    statusDiv.className = 'update-status info';
    statusDiv.innerHTML = '🔍 Recherche de mises à jour...';

    try {
        // Get current version
        const { getVersion } = window.__TAURI__.app;
        const currentVersion = await getVersion();
        log('Version actuelle:', currentVersion);

        // Fetch latest release from GitHub API
        const response = await fetch('https://api.github.com/repos/ElBarbossa/Organizer2.0/releases/latest');
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }

        const release = await response.json();
        const latestVersion = release.tag_name.replace(/^v/, ''); // Remove 'v' prefix
        const releaseUrl = release.html_url;
        const releaseNotes = release.body || 'Aucune note de version disponible.';

        log('Version distante:', latestVersion);
        log('URL de la release:', releaseUrl);

        // Compare versions (simple string comparison for semantic versions)
        const comparisonResult = compareVersions(latestVersion, currentVersion);
        log('Comparaison des versions:');
        log('  - latestVersion:', latestVersion, '(type:', typeof latestVersion, ')');
        log('  - currentVersion:', currentVersion, '(type:', typeof currentVersion, ')');
        log('  - compareVersions() result:', comparisonResult);
        log('  - shouldUpdate:', comparisonResult > 0);

        const shouldUpdate = comparisonResult > 0;

        if (shouldUpdate) {
            log('Mise à jour disponible!');
            statusDiv.className = 'update-status success';
            statusDiv.innerHTML = `
                <div>✨ <strong>Nouvelle version disponible : ${latestVersion}</strong></div>
                <div style="margin-top: 8px; font-size: 13px; opacity: 0.9; max-height: 100px; overflow-y: auto;">
                    ${releaseNotes.split('\n').slice(0, 5).join('<br>')}
                </div>
                <button class="btn btn-primary" onclick="window.openReleaseUrl('${releaseUrl}')" style="margin-top: 10px;">
                    📥 Télécharger la mise à jour
                </button>
            `;
        } else {
            log('Application à jour');
            statusDiv.className = 'update-status info';
            statusDiv.innerHTML = `✅ Vous utilisez la dernière version disponible (${currentVersion}).`;
        }

        checkBtn.disabled = false;
        checkBtn.textContent = '🔄 Vérifier les mises à jour';
    } catch (error) {
        logError('Erreur lors de la vérification des mises à jour:', error);
        statusDiv.className = 'update-status error';

        let errorMessage = error.message || 'Impossible de vérifier les mises à jour';

        if (errorMessage.includes('fetch') || errorMessage.includes('GitHub API')) {
            errorMessage = 'Impossible de contacter GitHub. Vérifiez votre connexion Internet.';
        }

        statusDiv.innerHTML = `❌ Erreur : ${errorMessage}`;

        checkBtn.disabled = false;
        checkBtn.textContent = '🔄 Vérifier les mises à jour';
    }
}

// Compare two semantic version strings (e.g., "1.0.5" vs "1.0.4")
function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const part1 = parts1[i] || 0;
        const part2 = parts2[i] || 0;

        if (part1 > part2) return 1;
        if (part1 < part2) return -1;
    }

    return 0;
}

// Open release URL in browser
window.openReleaseUrl = async function(url) {
    log('Ouverture de la page de release:', url);
    try {
        if (window.__TAURI__ && window.__TAURI__.shell) {
            await window.__TAURI__.shell.open(url);
            log('Page ouverte avec succès');
        } else {
            // Fallback for dev mode
            window.open(url, '_blank');
        }
    } catch (error) {
        logError('Erreur lors de l\'ouverture du lien:', error);
        alert('Impossible d\'ouvrir le lien automatiquement. Copiez cette URL : ' + url);
    }
}

// Install update
async function installUpdateNow() {
    log('Installation de la mise à jour...');
    const statusDiv = document.getElementById('update-status');

    try {
        // Vérifier que l'API est disponible
        if (!window.__TAURI__ || !window.__TAURI__.updater) {
            throw new Error('L\'API de mise à jour n\'est disponible que dans la version compilée.');
        }

        statusDiv.className = 'update-status info';
        statusDiv.innerHTML = '📥 Téléchargement et installation en cours...<br><small>L\'application va redémarrer automatiquement.</small>';

        const { installUpdate } = window.__TAURI__.updater;

        // Install and restart
        await installUpdate();

        // This line won't be reached as the app will restart
        log('✓ Mise à jour installée, redémarrage...');
    } catch (error) {
        logError('Erreur lors de l\'installation:', error);
        statusDiv.className = 'update-status error';

        // Construire un message d'erreur clair
        let errorMessage = error?.message || error?.toString() || 'Erreur inconnue';

        // Fournir des messages plus utiles selon le type d'erreur
        if (!window.__TAURI__ || !window.__TAURI__.updater) {
            errorMessage = 'Cette fonctionnalité n\'est disponible que dans la version compilée de l\'application.';
        } else if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
            errorMessage = 'Impossible de télécharger la mise à jour. Vérifiez votre connexion Internet.';
        }

        statusDiv.innerHTML = `❌ Erreur d'installation : ${errorMessage}`;
    }
}

// Rendre les fonctions globales pour les boutons HTML
window.configureHotkey = configureHotkey;
window.applyHotkeys = applyHotkeys;
window.resetHotkeys = resetHotkeys;
window.minimizeToTray = minimizeToTray;
window.checkForUpdates = checkForUpdates;
window.installUpdateNow = installUpdateNow;

log('✓ Fonctions globales exposées:');
log('  - window.configureHotkey:', typeof window.configureHotkey);
log('  - window.applyHotkeys:', typeof window.applyHotkeys);
log('  - window.resetHotkeys:', typeof window.resetHotkeys);
log('  - window.minimizeToTray:', typeof window.minimizeToTray);
