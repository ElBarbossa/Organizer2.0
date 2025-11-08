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

// Initialize the application
async function init() {
    console.log('[Organizer 2.0] ========================================');
    console.log('[Organizer 2.0] DEBUT DE INIT() !');
    console.log('[Organizer 2.0] ========================================');

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

    log('Application initialisée avec succès');

    // Auto-load profile on startup if configured
    if (autoLoadProfile) {
        log('Chargement automatique du profil au démarrage:', autoLoadProfile);
        try {
            await loadProfileWithHotkeys(autoLoadProfile);
            currentProfileName = autoLoadProfile;
            log('Profil chargé automatiquement avec succès');

            // Update profile display immediately after loading
            updateCurrentProfileDisplay(autoLoadProfile);

            // Reload windows with the loaded profile's order
            await loadWindows();

            // Update profile selectors after auto-load
            await loadProfiles();

            // Setup hotkeys after profile loading
            await setupHotkeys();

        } catch (error) {
            logError('Échec du chargement automatique du profil:', error);
            // Continue without failing
        }
    }

    // Listen for window focus events from backend
    await listen('window-focused', (event) => {
        log('Fenêtre focalisée:', event.payload);
        updateStatusText(`Fenêtre focalisée: ${event.payload}`);
    });

    // Ensure profile display is updated after everything is loaded (fallback)
    setTimeout(() => {
        updateCurrentProfileDisplay(currentProfileName);
    }, 1500);
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

        // If we have a current profile and saved order, try to reorder windows
        if (currentProfileName) {
            log('Profil actuel détecté:', currentProfileName);
            const saved = localStorage.getItem(`rustfocus_profile_${currentProfileName}`);
            if (saved) {
                try {
                    const config = JSON.parse(saved);
                    log('Configuration du profil chargée:', config);
                    if (config.windowOrder && config.windowOrder.length > 0) {
                        log('Tentative de réorganisation selon l\'ordre sauvegardé:', config.windowOrder);
                        log('Fenêtres détectées:', windows.map(w => w.character_name));

                        // Reorder windows based on saved character names order
                        const orderedWindows = [];
                        for (const charName of config.windowOrder) {
                            const window = windows.find(w => w.character_name === charName);
                            if (window) {
                                orderedWindows.push(window);
                                log('Fenêtre trouvée et ajoutée:', charName);
                            } else {
                                log('Fenêtre non trouvée:', charName);
                            }
                        }
                        // Add any windows not in the saved order
                        for (const window of windows) {
                            if (!orderedWindows.find(w => w.handle === window.handle)) {
                                orderedWindows.push(window);
                                log('Fenêtre supplémentaire ajoutée:', window.character_name);
                            }
                        }
                        windowList = orderedWindows;
                        log('Fenêtres réorganisées selon l\'ordre sauvegardé. Nouvel ordre:', windowList.map(w => w.character_name));
                    } else {
                        log('Aucun ordre de fenêtres dans la configuration du profil');
                        windowList = windows;
                    }
                } catch (error) {
                    logError('Erreur lors de la réorganisation:', error);
                    windowList = windows;
                }
            } else {
                log('Aucune configuration sauvegardée trouvée pour le profil:', currentProfileName);
                windowList = windows;
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

        li.innerHTML = `
            <div class="window-index-container">
                <div class="window-reorder-arrows">
                    <button class="arrow-btn move-up-btn" data-index="${index}" ${index === 0 ? 'disabled' : ''}>▲</button>
                </div>
                <div class="window-index">${index + 1}</div>
                <div class="window-reorder-arrows">
                    <button class="arrow-btn move-down-btn" data-index="${index}" ${index === windowList.length - 1 ? 'disabled' : ''}>▼</button>
                </div>
            </div>
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

        // Add arrow button listeners
        const moveUpBtn = li.querySelector('.move-up-btn');
        const moveDownBtn = li.querySelector('.move-down-btn');

        if (moveUpBtn) {
            moveUpBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent drag from starting
                const idx = parseInt(e.target.dataset.index);
                if (idx > 0) {
                    moveWindowUp(idx);
                }
            });
        }

        if (moveDownBtn) {
            moveDownBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent drag from starting
                const idx = parseInt(e.target.dataset.index);
                if (idx < windowList.length - 1) {
                    moveWindowDown(idx);
                }
            });
        }

        newListElement.appendChild(li);
    });

    // Les event listeners drag sont maintenant gérés individuellement sur chaque élément

    log('Liste des fenêtres rendue:', windowList.length, 'éléments');
}

// Show/Hide Apply Order button
function toggleApplyOrderButton(show) {
    const applyBtn = document.getElementById('apply-order-btn');
    if (applyBtn) {
        applyBtn.style.display = show ? 'inline-flex' : 'none';
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
        // Vérifier s'il y a une configuration personnalisée sauvegardée
        const saved = localStorage.getItem('rustfocus_hotkey_config');

        if (saved) {
            // Appliquer la configuration personnalisée
            log('Application de la configuration personnalisée...');
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
        log('Profils chargés depuis Rust:', profiles.length, profiles);

        // Also check localStorage for profiles saved there
        const localProfiles = listSavedProfiles();
        log('Profils dans localStorage:', localProfiles.length, localProfiles.map(p => p.name));

        // Merge profiles from Rust and localStorage
        const allProfiles = [...new Set([...profiles, ...localProfiles.map(p => p.name)])];
        log('Profils fusionnés:', allProfiles.length, allProfiles);

        renderProfileList(allProfiles);
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

    // Reset to "Ready" after 3 seconds
    setTimeout(() => {
        statusElement.textContent = 'Prêt';
    }, 3000);
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

    // Sauvegarder la configuration dans localStorage pour persistance
    // On ne met à jour que CE profil spécifique, pas tous les autres
    const configToSave = {
        profileName,
        hotkeyConfig: hotkeyConfig,
        windowOrder: windowList.map(w => w.character_name), // Ordre actuel des fenêtres
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
        } catch (error) {
            logError('Erreur lors du parsing de la configuration:', error);
        }
    }

    // Charger aussi via l'API Rust (optionnel, ne pas échouer si ça rate)
    try {
        const profile = await invoke('load_profile', { name: profileName });
        log('Profil chargé depuis Rust:', profile);
        return profile;
    } catch (error) {
        log('Profil non trouvé côté Rust, utilisation des données localStorage uniquement');
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
    'F13': 0x7C, 'F14': 0x7D, 'F15': 0x7E, 'F16': 0x7F,
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

// Rendre les fonctions globales pour les boutons HTML
window.configureHotkey = configureHotkey;
window.applyHotkeys = applyHotkeys;
window.resetHotkeys = resetHotkeys;
window.minimizeToTray = minimizeToTray;

log('✓ Fonctions globales exposées:');
log('  - window.configureHotkey:', typeof window.configureHotkey);
log('  - window.applyHotkeys:', typeof window.applyHotkeys);
log('  - window.resetHotkeys:', typeof window.resetHotkeys);
log('  - window.minimizeToTray:', typeof window.minimizeToTray);
