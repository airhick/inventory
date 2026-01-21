// Configuration et état de l'application
let html5QrcodeScanner = null;
let quaggaScanner = null;
let isScanning = false;
let currentScannedCode = null;
const DEFAULT_WEBHOOK_URL = 'https://n8n.goreview.fr/webhook-test/acff1955-9ed2-4e48-b989-5a17d78b4452';
let webhookUrl = localStorage.getItem('webhookUrl') || DEFAULT_WEBHOOK_URL;

// Credentials de connexion
const LOGIN_CREDENTIALS = {
    username: 'global',
    password: 'vision'
};

// Vérifier si l'utilisateur est déjà connecté
function checkAuth() {
    return sessionStorage.getItem('authenticated') === 'true';
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    // Vérifier l'authentification
    if (checkAuth()) {
        showMainApp();
    } else {
        showLogin();
    }
});

function showLogin() {
    document.getElementById('loginContainer').style.display = 'flex';
    document.getElementById('mainContainer').style.display = 'none';
    
    // Event listener pour le formulaire de connexion
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
}

function showMainApp() {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('mainContainer').style.display = 'block';
    initializeApp();
}

function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const errorDiv = document.getElementById('loginError');
    
    // Réinitialiser l'erreur
    errorDiv.classList.remove('show');
    errorDiv.textContent = '';
    
    // Vérifier les credentials
    if (username === LOGIN_CREDENTIALS.username && password === LOGIN_CREDENTIALS.password) {
        // Connexion réussie
        sessionStorage.setItem('authenticated', 'true');
        showMainApp();
    } else {
        // Erreur de connexion
        errorDiv.textContent = 'INVALID CREDENTIALS';
        errorDiv.classList.add('show');
        
        // Réinitialiser les champs
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        document.getElementById('username').focus();
    }
}

function initializeApp() {
    // Event listeners
    document.getElementById('startScanBtn').addEventListener('click', startScan);
    document.getElementById('stopScanBtn').addEventListener('click', stopScan);
    document.getElementById('manualInputBtn').addEventListener('click', toggleManualInput);
    document.getElementById('inventoryBtn').addEventListener('click', () => {
        window.location.href = 'dashboard.html';
    });
    document.getElementById('submitManualBtn').addEventListener('click', handleManualInput);
    document.getElementById('cancelManualBtn').addEventListener('click', hideManualInput);
    document.getElementById('searchBarcodeBtn').addEventListener('click', handleManualBarcodeSearch);
    document.getElementById('sendWebhookBtn').addEventListener('click', sendToWebhook);
    document.getElementById('scanAnotherBtn').addEventListener('click', scanAnother);
    
    // Validation du formulaire
    document.getElementById('productForm').addEventListener('submit', (e) => {
        e.preventDefault();
        sendToWebhook();
    });
}

// Démarrer le scan
async function startScan() {
    if (isScanning) return;

    try {
        // Utiliser QuaggaJS pour les codes-barres (EAN, UPC, Code128, etc.)
        if (typeof Quagga !== 'undefined') {
            await startQuaggaScan();
        } else {
            // Fallback sur html5-qrcode si Quagga n'est pas disponible
            await startQRCodeScan();
        }
    } catch (err) {
        console.error("Erreur lors du démarrage du scan:", err);
        
        let errorMessage = 'Erreur: Impossible d\'accéder à la caméra.';
        
        if (err.name === 'NotAllowedError' || err.message?.includes('NotAllowedError')) {
            errorMessage = 'Permission refusée. Veuillez autoriser l\'accès à la caméra dans les paramètres de votre navigateur.';
        } else if (err.name === 'NotFoundError' || err.message?.includes('NotFoundError')) {
            errorMessage = 'Aucune caméra trouvée. Vérifiez que votre appareil possède une caméra.';
        } else if (err.name === 'NotReadableError' || err.message?.includes('NotReadableError')) {
            errorMessage = 'La caméra est déjà utilisée par une autre application. Fermez les autres applications utilisant la caméra et réessayez.';
        } else if (err.message) {
            errorMessage = 'Erreur: ' + err.message;
        }
        
        showStatusMessage(errorMessage, 'error');
        
        // Réactiver le bouton de démarrage
        document.getElementById('startScanBtn').disabled = false;
        document.getElementById('stopScanBtn').disabled = true;
    }
}

// Scanner avec QuaggaJS (codes-barres)
function startQuaggaScan() {
    return new Promise((resolve, reject) => {
        Quagga.init({
            inputStream: {
                name: "Live",
                type: "LiveStream",
                target: document.querySelector('#reader'),
                constraints: {
                    width: 640,
                    height: 480,
                    facingMode: "environment"
                }
            },
            locator: {
                patchSize: "medium",
                halfSample: true
            },
            numOfWorkers: 2,
            decoder: {
                readers: [
                    "ean_reader",
                    "ean_8_reader",
                    "code_128_reader",
                    "code_39_reader",
                    "code_39_vin_reader",
                    "codabar_reader",
                    "upc_reader",
                    "upc_e_reader",
                    "i2of5_reader"
                ]
            },
            locate: true
        }, function(err) {
            if (err) {
                console.error("Erreur Quagga:", err);
                
                // Si c'est une erreur NotReadableError, essayer avec la caméra avant
                if (err.name === 'NotReadableError' || err.message?.includes('NotReadableError') || err.message?.includes('Could not start video source')) {
                    console.log("Caméra arrière indisponible, essai avec la caméra avant...");
                    showStatusMessage('Caméra arrière indisponible, essai avec la caméra avant...', 'info');
                    
                    // Réessayer avec la caméra avant
                    const configUser = {
                        inputStream: {
                            name: "Live",
                            type: "LiveStream",
                            target: document.querySelector('#reader'),
                            constraints: {
                                width: { min: 640, ideal: 1280, max: 1920 },
                                height: { min: 480, ideal: 720, max: 1080 },
                                facingMode: "user"
                            }
                        },
                        locator: {
                            patchSize: "medium",
                            halfSample: true
                        },
                        numOfWorkers: 2,
                        decoder: {
                            readers: [
                                "ean_reader",
                                "ean_8_reader",
                                "code_128_reader",
                                "code_39_reader",
                                "code_39_vin_reader",
                                "codabar_reader",
                                "upc_reader",
                                "upc_e_reader",
                                "i2of5_reader"
                            ]
                        },
                        locate: true
                    };
                    
                    Quagga.init(configUser, function(err2) {
                        if (err2) {
                            console.error("Erreur avec caméra avant aussi:", err2);
                            showStatusMessage('Erreur: La caméra est déjà utilisée par une autre application. Fermez les autres applications et réessayez.', 'error');
                            // Fallback sur html5-qrcode
                            startQRCodeScan().then(resolve).catch(reject);
                            return;
                        }
                        
                        console.log("Quagga initialisé avec succès (caméra avant)");
                        try {
                            Quagga.start();
                            setupQuaggaDetector(resolve);
                        } catch (startErr) {
                            console.error("Erreur lors du démarrage:", startErr);
                            showStatusMessage('Erreur: Impossible de démarrer la caméra.', 'error');
                            reject(startErr);
                        }
                    });
                    return;
                }
                
                // Autre erreur, fallback sur html5-qrcode
                showStatusMessage('Erreur caméra. Essai avec une autre méthode...', 'info');
                startQRCodeScan().then(resolve).catch(reject);
                return;
            }
            
            console.log("Quagga initialisé avec succès");
            try {
                Quagga.start();
                setupQuaggaDetector(resolve);
            } catch (startErr) {
                console.error("Erreur lors du démarrage:", startErr);
                showStatusMessage('Erreur: Impossible de démarrer la caméra.', 'error');
                reject(startErr);
            }
        });
    });
}

// Configurer le détecteur Quagga
function setupQuaggaDetector(resolve) {
    // Détecter les codes-barres
    Quagga.onDetected(function(result) {
        console.log("=== Code-barres détecté ===");
        console.log("Résultat complet:", result);
        const code = result.codeResult ? result.codeResult.code : null;
        console.log("Code extrait:", code);
        if (result.codeResult) {
            console.log("Format:", result.codeResult.format);
        }
        if (code && code.trim() !== '') {
            stopScan();
            processScannedCode(code);
        } else {
            console.warn("Code vide ou invalide détecté");
        }
    });
    
    isScanning = true;
    document.getElementById('startScanBtn').disabled = true;
    document.getElementById('stopScanBtn').disabled = false;
    hideManualInput();
    hideProductForm();
    showStatusMessage('Scan en cours... Pointez la caméra vers le code-barres', 'info');
    setTimeout(() => {
        showStatusMessage('', '');
    }, 3000);
    resolve();
}

// Scanner avec html5-qrcode (QR codes)
async function startQRCodeScan() {
    html5QrcodeScanner = new Html5Qrcode("reader");
    
    await html5QrcodeScanner.start(
        { facingMode: "environment" },
        {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA]
        },
        onScanSuccess,
        onScanError
    );

    isScanning = true;
    document.getElementById('startScanBtn').disabled = true;
    document.getElementById('stopScanBtn').disabled = false;
    hideManualInput();
    hideProductForm();
}

// Arrêter le scan
function stopScan() {
    if (isScanning) {
        // Arrêter Quagga si actif
        if (typeof Quagga !== 'undefined' && Quagga.initialized) {
            try {
                Quagga.stop();
                quaggaScanner = null;
            } catch (err) {
                console.error("Erreur arrêt Quagga:", err);
            }
        }
        
        // Arrêter html5-qrcode si actif
        if (html5QrcodeScanner) {
            html5QrcodeScanner.stop().then(() => {
                html5QrcodeScanner.clear();
                html5QrcodeScanner = null;
            }).catch(err => {
                console.error("Erreur arrêt html5-qrcode:", err);
            });
        }
        
        isScanning = false;
        document.getElementById('startScanBtn').disabled = false;
        document.getElementById('stopScanBtn').disabled = true;
    }
}

// Callback de succès du scan (QR codes)
async function onScanSuccess(decodedText, decodedResult) {
    console.log("QR Code scanné:", decodedText);
    console.log("Résultat complet:", decodedResult);
    stopScan();
    await processScannedCode(decodedText);
}

// Callback d'erreur du scan
function onScanError(errorMessage) {
    // Loguer seulement les erreurs importantes
    if (errorMessage && !errorMessage.includes('NotFoundException')) {
        console.log("Scan en cours...", errorMessage);
    }
}

// Afficher/masquer la saisie manuelle
function toggleManualInput() {
    const section = document.getElementById('manualInputSection');
    if (section.style.display === 'none') {
        section.style.display = 'block';
        stopScan();
        hideProductForm();
        // Setup autocomplete pour le champ nom
        setTimeout(() => {
            const productNameInput = document.getElementById('manualProductName');
            const serialNumberInput = document.getElementById('manualSerialNumber');
            
            if (productNameInput) {
                setupAutocomplete(productNameInput);
            }
            
            // Setup recherche automatique par code-barres
            if (serialNumberInput) {
                setupBarcodeLookup(serialNumberInput);
            }
        }, 100);
    } else {
        section.style.display = 'none';
    }
}

function hideManualInput() {
    document.getElementById('manualInputSection').style.display = 'none';
    // Réinitialiser le formulaire
    const manualForm = document.getElementById('manualForm');
    if (manualForm) {
        manualForm.reset();
    }
}

// Fonction utilitaire pour charger une image avec proxy pour éviter les erreurs 403
function loadImageWithProxy(imgElement, imageUrl, placeholderElement) {
    if (!imgElement || !imageUrl) return;
    
    // Liste des proxies d'images à essayer en fallback
    const imageProxies = [
        `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(imageUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(imageUrl)}`
    ];
    
    let currentProxyIndex = 0;
    
    const tryNextProxy = () => {
        if (currentProxyIndex >= imageProxies.length) {
            // Tous les proxies ont échoué, essayer l'image originale
            imgElement.src = imageUrl;
            imgElement.onerror = () => {
                // Si l'image originale échoue aussi, afficher le placeholder
                if (imgElement.classList) {
                    imgElement.classList.remove('show');
                }
                if (placeholderElement) {
                    if (placeholderElement.classList) {
                        placeholderElement.classList.remove('hidden');
                    }
                    placeholderElement.textContent = 'Image non disponible';
                }
            };
            return;
        }
        
        const proxyUrl = imageProxies[currentProxyIndex];
        currentProxyIndex++;
        
        imgElement.src = proxyUrl;
        imgElement.onload = () => {
            if (imgElement.classList) {
                imgElement.classList.add('show');
            }
            if (placeholderElement && placeholderElement.classList) {
                placeholderElement.classList.add('hidden');
            }
        };
        imgElement.onerror = () => {
            // Ce proxy ne fonctionne pas, essayer le suivant
            tryNextProxy();
        };
    };
    
    // Commencer avec le premier proxy
    tryNextProxy();
}

// Recherche manuelle par code-barres (bouton)
async function handleManualBarcodeSearch() {
    const serialNumberInput = document.getElementById('manualSerialNumber');
    if (!serialNumberInput) {
        console.error('Champ serialNumber non trouvé');
        return;
    }
    
    const barcode = serialNumberInput.value.trim();
    
    if (!barcode) {
        showStatusMessage('Veuillez entrer un code-barres', 'error');
        serialNumberInput.focus();
        return;
    }
    
    if (!/^\d+$/.test(barcode) || barcode.length < 8) {
        showStatusMessage('Code-barres invalide. Veuillez entrer un code-barres numérique d\'au moins 8 chiffres', 'error');
        serialNumberInput.focus();
        return;
    }
    
    await fetchProductFromBarcode(barcode, true);
}

// Gérer la saisie manuelle
async function handleManualInput() {
    const productName = document.getElementById('manualProductName').value.trim();
    const serialNumber = document.getElementById('manualSerialNumber').value.trim();
    const productType = document.getElementById('manualProductType').value;
    const categoryDetails = document.getElementById('manualCategoryDetails').value.trim();
    const imageUrl = document.getElementById('manualImageUrl').value.trim();
    
    // Validation
    if (!productName) {
        showStatusMessage('Le nom du produit est obligatoire', 'error');
        document.getElementById('manualProductName').focus();
        return;
    }
    
    if (!serialNumber) {
        showStatusMessage('Le numéro de série est obligatoire', 'error');
        document.getElementById('manualSerialNumber').focus();
        return;
    }
    
    if (!productType) {
        showStatusMessage('Le type est obligatoire', 'error');
        document.getElementById('manualProductType').focus();
        return;
    }
    
    // Sauvegarder dans le dashboard
    saveItemToDashboard({
        name: productName,
        serialNumber: serialNumber,
        type: productType,
        categoryDetails: categoryDetails || null,
        image: imageUrl || null,
        scannedCode: serialNumber
    });
    
    // Envoyer au webhook
    await sendManualToWebhook({
        name: productName,
        serialNumber: serialNumber,
        type: productType,
        categoryDetails: categoryDetails || null,
        image: imageUrl || null,
        scannedCode: serialNumber
    });
    
    // Masquer le formulaire et afficher un message de succès
    hideManualInput();
    showStatusMessage('✅ Item enregistré avec succès!', 'success');
}

// Envoyer les données manuelles au webhook
async function sendManualToWebhook(itemData) {
    const url = webhookUrl || DEFAULT_WEBHOOK_URL;
    
    try {
        const payload = {
            timestamp: new Date().toISOString(),
            product: {
                name: itemData.name,
                serialNumber: itemData.serialNumber,
                type: itemData.type,
                categoryDetails: itemData.categoryDetails,
                image: itemData.image,
                scannedCode: itemData.scannedCode
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.log('Données manuelles envoyées au webhook avec succès');
        } else {
            console.error('Erreur lors de l\'envoi au webhook:', response.status);
        }
    } catch (error) {
        console.error("Erreur lors de l'envoi au webhook:", error);
    }
}

// Traiter le code scanné
async function processScannedCode(code) {
    console.log("=== Traitement du code scanné ===");
    console.log("Code reçu:", code);
    
    if (!code || code.trim() === '') {
        console.error("Code vide ou invalide");
        showStatusMessage('Code invalide. Veuillez réessayer.', 'error');
        return;
    }
    
    currentScannedCode = code.trim();
    
    // Remplir le numéro de série
    const serialNumberInput = document.getElementById('serialNumber');
    if (serialNumberInput) {
        serialNumberInput.value = currentScannedCode;
        console.log("Numéro de série rempli:", currentScannedCode);
    } else {
        console.error("Champ serialNumber non trouvé");
    }
    
    // Afficher le formulaire
    showProductForm();
    
    // Récupérer l'image et les infos produit
    await fetchProductImageAndInfo(currentScannedCode);
}

// Récupérer l'image et les informations du produit
async function fetchProductImageAndInfo(code) {
    showStatusMessage('Recherche des informations produit...', 'info');
    
    const imageContainer = document.getElementById('productImage');
    const imagePlaceholder = document.getElementById('imagePlaceholder');
    const productNameInput = document.getElementById('productName');
    
    // Réinitialiser l'image
    imageContainer.src = '';
    imageContainer.classList.remove('show');
    imagePlaceholder.classList.remove('hidden');
    imagePlaceholder.textContent = 'Recherche de l\'image...';
    
    try {
        // Essayer Open Food Facts pour les produits alimentaires
        const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
        const data = await response.json();

        if (data.status === 1 && data.product) {
            const product = data.product;
            
            // Récupérer l'image
            const imageUrl = product.image_url || product.image_front_url || product.image_small_url || '';
            
            if (imageUrl) {
                loadImageWithProxy(imageContainer, imageUrl, imagePlaceholder);
            } else {
                imagePlaceholder.textContent = 'Image non disponible';
            }
            
            // Remplir le nom du produit si disponible
            if (product.product_name && !productNameInput.value) {
                productNameInput.value = product.product_name;
            }
            
            showStatusMessage('Informations récupérées', 'success');
            setTimeout(() => {
                showStatusMessage('', '');
            }, 2000);
            return;
        }
    } catch (error) {
        console.error("Erreur Open Food Facts:", error);
    }
    
    // Si pas trouvé, essayer une recherche d'image générique via Google Images ou autre
    try {
        // Utiliser un service de recherche d'image basé sur le code-barres
        // Note: Pour une vraie production, utilisez une API dédiée
        const imageUrl = await searchProductImage(code);
        
        if (imageUrl) {
            loadImageWithProxy(imageContainer, imageUrl, imagePlaceholder);
        } else {
            imagePlaceholder.textContent = 'Image non disponible';
        }
    } catch (error) {
        console.error("Erreur recherche image:", error);
        imagePlaceholder.textContent = 'Image non disponible';
    }
    
    showStatusMessage('Code scanné. Veuillez remplir les informations manuellement.', 'info');
    setTimeout(() => {
        showStatusMessage('', '');
    }, 3000);
}

// Rechercher une image de produit (méthode alternative)
async function searchProductImage(code) {
    // Méthode 1: Utiliser Open Food Facts avec recherche alternative
    try {
        // Essayer différentes variantes du code
        const variations = [
            code,
            code.substring(0, code.length - 1),
            code + '0'
        ];
        
        for (const variant of variations) {
            try {
                const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${variant}.json`);
                const data = await response.json();
                
                if (data.status === 1 && data.product) {
                    const img = data.product.image_url || data.product.image_front_url || data.product.image_small_url;
                    if (img) return img;
                }
            } catch (e) {
                continue;
            }
        }
    } catch (error) {
        console.error("Erreur recherche variantes:", error);
    }
    
    // Méthode 2: Utiliser un service d'image générique (exemple avec placeholder)
    // Pour une vraie production, utilisez une API comme:
    // - Google Custom Search API
    // - Bing Image Search API
    // - Unsplash API avec le nom du produit
    
    return null;
}

function showProductForm() {
    document.getElementById('productFormSection').style.display = 'block';
    hideManualInput();
    
    // Réinitialiser la quantité à 1
    const productQtyInput = document.getElementById('productQty');
    if (productQtyInput) {
        productQtyInput.value = 1;
    }
    
    // Focus sur le champ nom produit
    setTimeout(() => {
        const productNameInput = document.getElementById('productName');
        productNameInput.focus();
        setupAutocomplete(productNameInput);
    }, 100);
}

// Configuration de l'autocomplétion Google
function setupAutocomplete(inputElement) {
    if (!inputElement) {
        console.error('Input element not found for autocomplete');
        return;
    }
    
    // Supprimer l'ancien conteneur s'il existe (pour éviter les doublons)
    const existingContainer = inputElement.parentElement.querySelector('.suggestions-container');
    if (existingContainer) {
        existingContainer.remove();
    }
    
    // Créer un nouveau conteneur de suggestions
    const suggestionsContainer = document.createElement('div');
    const containerId = 'suggestionsContainer_' + inputElement.id;
    suggestionsContainer.id = containerId;
    suggestionsContainer.className = 'suggestions-container';
    
    // S'assurer que le parent a position: relative pour le positionnement absolu
    const parent = inputElement.parentElement;
    if (getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
    }
    
    // Ajouter le conteneur après l'input
    parent.appendChild(suggestionsContainer);
    
    let debounceTimer;
    
    // Ajouter l'event listener pour l'input
    inputElement.addEventListener('input', function(e) {
        const query = e.target.value.trim();
        
        // Effacer le timer précédent
        clearTimeout(debounceTimer);
        
        // Masquer les suggestions si le champ est vide
        if (query.length < 2) {
            suggestionsContainer.style.display = 'none';
            return;
        }
        
        // Attendre 300ms avant de faire la requête (debounce)
        debounceTimer = setTimeout(async () => {
            await fetchGoogleSuggestions(query, suggestionsContainer, inputElement);
        }, 300);
    }, { once: false });
    
    // Masquer les suggestions quand on clique ailleurs
    const clickHandler = (e) => {
        if (!inputElement.contains(e.target) && !suggestionsContainer.contains(e.target)) {
            suggestionsContainer.style.display = 'none';
        }
    };
    document.addEventListener('click', clickHandler);
    
    // Gérer les touches clavier
    inputElement.addEventListener('keydown', function(e) {
        const suggestions = suggestionsContainer.querySelectorAll('.suggestion-item');
        const selected = suggestionsContainer.querySelector('.suggestion-item.selected');
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (selected) {
                selected.classList.remove('selected');
                const next = selected.nextElementSibling;
                if (next) {
                    next.classList.add('selected');
                } else {
                    suggestions[0]?.classList.add('selected');
                }
            } else {
                suggestions[0]?.classList.add('selected');
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (selected) {
                selected.classList.remove('selected');
                const prev = selected.previousElementSibling;
                if (prev) {
                    prev.classList.add('selected');
                } else {
                    suggestions[suggestions.length - 1]?.classList.add('selected');
                }
            } else {
                suggestions[suggestions.length - 1]?.classList.add('selected');
            }
        } else if (e.key === 'Enter' && selected) {
            e.preventDefault();
            selected.click();
        } else if (e.key === 'Escape') {
            suggestionsContainer.style.display = 'none';
        }
    }, { once: false });
    
    console.log('Autocomplete configuré pour:', inputElement.id);
}

// Configuration de la recherche automatique par code-barres (UPCitemdb)
function setupBarcodeLookup(inputElement) {
    let debounceTimer;
    
    inputElement.addEventListener('input', async (e) => {
        const barcode = e.target.value.trim();
        
        // Effacer le timer précédent
        clearTimeout(debounceTimer);
        
        // Si le code-barres fait au moins 8 caractères (codes-barres valides)
        if (barcode.length >= 8 && /^\d+$/.test(barcode)) {
            // Attendre 800ms après la dernière saisie (debounce plus long pour API)
            debounceTimer = setTimeout(async () => {
                await fetchProductFromBarcode(barcode);
            }, 800);
        }
    });
}

// Récupérer les informations produit via UPCitemdb
async function fetchProductFromBarcode(barcode, showLoading = false) {
    const productNameInput = document.getElementById('manualProductName');
    const categoryDetailsInput = document.getElementById('manualCategoryDetails');
    const imageUrlInput = document.getElementById('manualImageUrl');
    const searchBtn = document.getElementById('searchBarcodeBtn');
    
    // Afficher un indicateur de chargement
    if (showLoading) {
        if (productNameInput) {
            productNameInput.placeholder = 'Recherche des informations...';
            productNameInput.disabled = true;
        }
        if (searchBtn) {
            searchBtn.disabled = true;
            searchBtn.classList.add('loading');
        }
        showStatusMessage('Recherche des informations produit...', 'info');
    }
    
    try {
        // Utiliser un proxy CORS pour éviter les problèmes CORS
        const apiUrl = `https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`;
        
        // Essayer plusieurs proxies CORS en fallback
        let data = null;
        const proxies = [
            {
                url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(apiUrl)}`,
                type: 'direct'
            },
            {
                url: `https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}`,
                type: 'allorigins'
            },
            {
                url: `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`,
                type: 'direct'
            }
        ];
        
        for (const proxy of proxies) {
            try {
                const proxyResponse = await fetch(proxy.url, {
                    method: 'GET',
                    mode: 'cors',
                    cache: 'no-cache',
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                
                if (proxyResponse.ok) {
                    let responseText;
                    
                    // allorigins.win retourne les données dans .contents
                    if (proxy.type === 'allorigins') {
                        try {
                            const proxyData = await proxyResponse.json();
                            responseText = proxyData.contents || proxyData;
                        } catch (e) {
                            responseText = await proxyResponse.text();
                        }
                    } else {
                        // Autres proxies retournent directement le texte
                        responseText = await proxyResponse.text();
                    }
                    
                    // Nettoyer le texte avant de parser
                    if (typeof responseText === 'string') {
                        responseText = responseText.trim();
                        // Enlever les préfixes/suffixes JSONP si présents
                        responseText = responseText.replace(/^[^{[]*/, '').replace(/[^}\]]*$/, '');
                    }
                    
                    try {
                        data = JSON.parse(responseText);
                        // Vérifier que c'est un objet valide
                        if (data && typeof data === 'object' && !Array.isArray(data)) {
                            break; // Succès
                        }
                    } catch (parseError) {
                        // Essayer d'extraire le JSON si nécessaire
                        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            try {
                                data = JSON.parse(jsonMatch[0]);
                                if (data && typeof data === 'object') {
                                    break; // Succès
                                }
                            } catch (e) {
                                // Continuer avec le proxy suivant
                            }
                        }
                        continue; // Essayer le proxy suivant
                    }
                }
            } catch (proxyError) {
                // Essayer le proxy suivant silencieusement
                continue;
            }
        }
        
        if (!data) {
            throw new Error('Tous les proxies CORS ont échoué');
        }
        
        // Vérifier si on a trouvé un produit
        if (data && data.items && data.items.length > 0) {
            const item = data.items[0];
            
            // Remplir automatiquement les champs
            if (productNameInput) {
                const title = item.title || '';
                const brand = item.brand || '';
                const productName = brand && title ? `${brand} ${title}` : title || brand || '';
                productNameInput.value = productName;
                productNameInput.disabled = false;
                productNameInput.placeholder = 'Ex: iPhone 15 Pro';
            }
            
            if (categoryDetailsInput) {
                const description = item.description || '';
                const category = item.category || '';
                const details = category ? `${category}${description ? ' - ' + description : ''}` : description;
                if (details) {
                    categoryDetailsInput.value = details;
                }
            }
            
            if (imageUrlInput && item.images && item.images.length > 0) {
                const originalImageUrl = item.images[0];
                imageUrlInput.value = originalImageUrl;
                
                // Afficher l'image dans le conteneur avec proxy pour éviter les erreurs 403
                const imageContainer = document.getElementById('manualImageContainer');
                const img = document.getElementById('manualProductImage');
                const placeholder = document.getElementById('manualImagePlaceholder');
                
                if (imageContainer && img && placeholder) {
                    imageContainer.style.display = 'block';
                    loadImageWithProxy(img, originalImageUrl, placeholder);
                }
            }
            
            // Réactiver le champ nom si désactivé
            if (productNameInput && productNameInput.disabled) {
                productNameInput.disabled = false;
                productNameInput.placeholder = 'Ex: iPhone 15 Pro';
            }
            
            // Afficher un message de succès
            showStatusMessage('✅ Informations produit récupérées avec succès!', 'success');
            setTimeout(() => {
                showStatusMessage('', '');
            }, 3000);
        } else {
            // Produit non trouvé
            if (productNameInput) {
                productNameInput.disabled = false;
                productNameInput.placeholder = 'Ex: iPhone 15 Pro';
            }
            showStatusMessage('ℹ️ Produit non trouvé dans la base de données. Veuillez remplir manuellement.', 'info');
            setTimeout(() => {
                showStatusMessage('', '');
            }, 4000);
        }
    } catch (error) {
        console.error('Erreur lors de la récupération des informations produit:', error);
        if (productNameInput) {
            productNameInput.disabled = false;
            productNameInput.placeholder = 'Ex: iPhone 15 Pro';
        }
        showStatusMessage('Erreur lors de la récupération des informations. Veuillez remplir manuellement.', 'error');
        setTimeout(() => {
            showStatusMessage('', '');
        }, 4000);
    } finally {
        if (searchBtn) {
            searchBtn.disabled = false;
            searchBtn.classList.remove('loading');
        }
    }
}

// Récupérer les suggestions Google
async function fetchGoogleSuggestions(query, container, inputElement) {
    try {
        // Utiliser l'API Google Suggest avec proxy CORS
        const googleUrl = `http://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}&hl=fr`;
        
        // Essayer plusieurs proxies en fallback (ordre de préférence)
        const proxies = [
            {
                url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(googleUrl)}`,
                type: 'direct'
            },
            {
                url: `https://api.allorigins.win/get?url=${encodeURIComponent(googleUrl)}`,
                type: 'allorigins'
            },
            {
                url: `https://corsproxy.io/?${encodeURIComponent(googleUrl)}`,
                type: 'direct'
            }
        ];
        
        let suggestions = null;
        
        for (const proxy of proxies) {
            try {
                const response = await fetch(proxy.url, {
                    method: 'GET',
                    mode: 'cors',
                    cache: 'no-cache',
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                
                if (response.ok) {
                    let text;
                    
                    // allorigins.win retourne les données dans .contents
                    if (proxy.type === 'allorigins') {
                        try {
                            const proxyData = await response.json();
                            text = proxyData.contents || proxyData;
                        } catch (e) {
                            text = await response.text();
                        }
                    } else {
                        text = await response.text();
                    }
                    
                    // Nettoyer le texte avant de parser
                    if (typeof text === 'string') {
                        text = text.trim();
                        // Enlever les préfixes/suffixes JSONP si présents
                        text = text.replace(/^[^[]*/, '').replace(/[^\]]*$/, '');
                    }
                    
                    let data;
                    try {
                        data = JSON.parse(text);
                    } catch (e) {
                        // Essayer d'extraire le JSON si nécessaire
                        const jsonMatch = text.match(/\[[\s\S]*\]/);
                        if (jsonMatch) {
                            try {
                                data = JSON.parse(jsonMatch[0]);
                            } catch (e2) {
                                continue; // Essayer le proxy suivant
                            }
                        } else {
                            continue; // Essayer le proxy suivant
                        }
                    }
                    
                    // La structure est : ["query", ["sugg1", "sugg2"...], ...]
                    suggestions = data && Array.isArray(data) && data[1] && Array.isArray(data[1]) ? data[1] : [];
                    
                    if (suggestions && suggestions.length > 0) {
                        break; // Succès, sortir de la boucle
                    }
                }
            } catch (proxyError) {
                // Essayer le proxy suivant silencieusement
                continue;
            }
        }
        
        if (suggestions && suggestions.length > 0) {
            displaySuggestions(suggestions, container, inputElement);
        } else {
            container.style.display = 'none';
        }
    } catch (error) {
        // En cas d'erreur, masquer les suggestions silencieusement
        container.style.display = 'none';
    }
}

// Afficher les suggestions
function displaySuggestions(suggestions, container, inputElement) {
    if (suggestions.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    // Limiter à 8 suggestions
    const limitedSuggestions = suggestions.slice(0, 8);
    
    container.innerHTML = limitedSuggestions.map((suggestion, index) => {
        return `
            <div class="suggestion-item" data-index="${index}" data-value="${escapeHtml(suggestion)}">
                <span class="suggestion-icon">🔍</span>
                <span class="suggestion-text">${escapeHtml(suggestion)}</span>
            </div>
        `;
    }).join('');
    
    // Ajouter les event listeners
    container.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', async () => {
            const value = item.getAttribute('data-value');
            inputElement.value = value;
            container.style.display = 'none';
            inputElement.focus();
            
            // Si c'est le champ nom du produit dans la saisie manuelle, rechercher automatiquement le code-barres
            if (inputElement.id === 'manualProductName') {
                await searchBarcodeFromProductName(value, inputElement);
            }
        });
        
        item.addEventListener('mouseenter', () => {
            container.querySelectorAll('.suggestion-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
        });
    });
    
    container.style.display = 'block';
}

// Rechercher le code-barres depuis le nom du produit (via UPCitemdb search)
async function searchBarcodeFromProductName(productName, nameInputElement) {
    if (!productName || productName.trim() === '') {
        return;
    }
    
    const serialNumberInput = document.getElementById('manualSerialNumber');
    const searchBtn = document.getElementById('searchBarcodeBtn');
    
    // Afficher un indicateur de chargement
    if (nameInputElement) {
        nameInputElement.disabled = true;
        nameInputElement.placeholder = 'Recherche du code-barres...';
    }
    if (searchBtn) {
        searchBtn.disabled = true;
        searchBtn.classList.add('loading');
    }
    showStatusMessage('Recherche du code-barres...', 'info');
    
    try {
        // Étape 1: Rechercher le code-barres via l'API search
        const searchUrl = `https://api.upcitemdb.com/prod/trial/search?s=${encodeURIComponent(productName)}&match_mode=0&type=product`;
        
        // Essayer plusieurs proxies CORS en fallback
        let searchData = null;
        const proxies = [
            {
                url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(searchUrl)}`,
                type: 'direct'
            },
            {
                url: `https://api.allorigins.win/get?url=${encodeURIComponent(searchUrl)}`,
                type: 'allorigins'
            },
            {
                url: `https://corsproxy.io/?${encodeURIComponent(searchUrl)}`,
                type: 'direct'
            }
        ];
        
        for (const proxy of proxies) {
            try {
                const proxyResponse = await fetch(proxy.url, {
                    method: 'GET',
                    mode: 'cors',
                    cache: 'no-cache',
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                
                if (proxyResponse.ok) {
                    let responseText;
                    
                    // allorigins.win retourne les données dans .contents
                    if (proxy.type === 'allorigins') {
                        try {
                            const proxyData = await proxyResponse.json();
                            responseText = proxyData.contents || proxyData;
                        } catch (e) {
                            responseText = await proxyResponse.text();
                        }
                    } else {
                        // Autres proxies retournent directement le texte
                        responseText = await proxyResponse.text();
                    }
                    
                    // Nettoyer le texte avant de parser
                    if (typeof responseText === 'string') {
                        // Enlever les caractères de contrôle et les espaces en début/fin
                        responseText = responseText.trim();
                        // Enlever les préfixes/suffixes JSONP si présents
                        responseText = responseText.replace(/^[^{[]*/, '').replace(/[^}\]]*$/, '');
                    }
                    
                    try {
                        searchData = JSON.parse(responseText);
                        // Vérifier que c'est un objet valide avec la structure attendue
                        if (searchData && typeof searchData === 'object' && !Array.isArray(searchData)) {
                            break; // Succès
                        }
                    } catch (parseError) {
                        // Essayer d'extraire le JSON si nécessaire
                        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            try {
                                searchData = JSON.parse(jsonMatch[0]);
                                if (searchData && typeof searchData === 'object') {
                                    break; // Succès
                                }
                            } catch (e) {
                                // Continuer avec le proxy suivant
                            }
                        }
                        continue; // Essayer le proxy suivant
                    }
                }
            } catch (proxyError) {
                // Essayer le proxy suivant silencieusement
                continue;
            }
        }
        
        if (searchData && searchData.items && searchData.items.length > 0) {
            // Prendre le premier résultat le plus pertinent
            const item = searchData.items[0];
            const ean = item.ean || item.upc || null;
            
            if (ean) {
                // Remplir le champ code-barres
                if (serialNumberInput) {
                    serialNumberInput.value = ean;
                }
                
                // Étape 2: Récupérer les caractéristiques complètes via lookup
                await fetchProductFromBarcode(ean, false);
            } else {
                throw new Error('Code-barres non trouvé');
            }
        } else {
            // Aucun produit trouvé
            if (nameInputElement) {
                nameInputElement.disabled = false;
                nameInputElement.placeholder = 'Ex: iPhone 15 Pro';
            }
            if (searchBtn) {
                searchBtn.disabled = false;
                searchBtn.classList.remove('loading');
            }
            showStatusMessage('ℹ️ Aucun code-barres trouvé pour ce produit. Veuillez entrer le code-barres manuellement.', 'info');
            setTimeout(() => {
                showStatusMessage('', '');
            }, 4000);
        }
    } catch (error) {
        console.error('Erreur lors de la recherche du code-barres:', error);
        if (nameInputElement) {
            nameInputElement.disabled = false;
            nameInputElement.placeholder = 'Ex: iPhone 15 Pro';
        }
        if (searchBtn) {
            searchBtn.disabled = false;
            searchBtn.classList.remove('loading');
        }
        showStatusMessage('Erreur lors de la recherche. Veuillez entrer le code-barres manuellement.', 'error');
        setTimeout(() => {
            showStatusMessage('', '');
        }, 4000);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function hideProductForm() {
    document.getElementById('productFormSection').style.display = 'none';
}

// Sauvegarder un item dans le dashboard
function saveItemToDashboard(itemData) {
    let items = JSON.parse(localStorage.getItem('dashboardItems') || '[]');
    
    // La quantité à ajouter (par défaut 1 si non spécifiée)
    const quantityToAdd = itemData.quantity || 1;
    
    // Chercher si un item avec le même numéro de série existe
    const existingIndex = items.findIndex(item => item.serialNumber === itemData.serialNumber);
    
    if (existingIndex !== -1) {
        // Item existe déjà, augmenter la quantité
        items[existingIndex].quantity = (items[existingIndex].quantity || 1) + quantityToAdd;
        items[existingIndex].lastUpdated = new Date().toISOString();
    } else {
        // Nouvel item, ajouter avec la quantité spécifiée
        items.push({
            ...itemData,
            quantity: quantityToAdd,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        });
    }
    
    localStorage.setItem('dashboardItems', JSON.stringify(items));
    console.log('Item sauvegardé dans le dashboard:', itemData);
}

// Envoyer les données au webhook
async function sendToWebhook() {
    // Valider le formulaire
    const productName = document.getElementById('productName').value.trim();
    const serialNumber = document.getElementById('serialNumber').value.trim();
    const productQty = parseInt(document.getElementById('productQty').value) || 1;
    const productType = document.getElementById('productType').value;
    const categoryDetails = document.getElementById('categoryDetails').value.trim();
    
    if (!productName) {
        showStatusMessage('Le nom du produit est obligatoire', 'error');
        document.getElementById('productName').focus();
        return;
    }
    
    if (!serialNumber) {
        showStatusMessage('Le numéro de série est obligatoire', 'error');
        document.getElementById('serialNumber').focus();
        return;
    }
    
    if (!productQty || productQty < 1) {
        showStatusMessage('La quantité doit être au moins de 1', 'error');
        document.getElementById('productQty').focus();
        return;
    }
    
    if (!productType) {
        showStatusMessage('Le type est obligatoire', 'error');
        document.getElementById('productType').focus();
        return;
    }
    
    const url = webhookUrl || document.getElementById('webhookUrl').value.trim() || DEFAULT_WEBHOOK_URL;
    
    try {
        showStatusMessage('Envoi des données au webhook...', 'info');

        const productImage = document.getElementById('productImage');
        const imageUrl = productImage.classList.contains('show') ? productImage.src : '';

        const payload = {
            timestamp: new Date().toISOString(),
            product: {
                name: productName,
                serialNumber: serialNumber,
                quantity: productQty,
                type: productType,
                categoryDetails: categoryDetails || null,
                image: imageUrl || null,
                scannedCode: currentScannedCode || serialNumber
            }
        };

        // Sauvegarder dans le dashboard
        saveItemToDashboard({
            name: productName,
            serialNumber: serialNumber,
            quantity: productQty,
            type: productType,
            categoryDetails: categoryDetails || null,
            image: imageUrl || null,
            scannedCode: currentScannedCode || serialNumber
        });

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            let responseData = {};
            try {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    responseData = await response.json();
                } else {
                    responseData = { message: await response.text() };
                }
            } catch (e) {
                // Pas de réponse JSON
            }
            showStatusMessage('✅ Données envoyées avec succès!', 'success');
            console.log('Réponse du webhook:', responseData);
        } else {
            let errorText = '';
            try {
                errorText = await response.text();
            } catch (e) {
                errorText = response.statusText;
            }
            showStatusMessage(`Erreur lors de l'envoi: ${response.status} ${response.statusText}`, 'error');
            console.error('Erreur du webhook:', errorText);
        }

    } catch (error) {
        console.error("Erreur lors de l'envoi au webhook:", error);
        showStatusMessage(`Erreur: ${error.message}`, 'error');
    }
}

// Scanner un autre produit
function scanAnother() {
    hideProductForm();
    currentScannedCode = null;
    document.getElementById('productForm').reset();
    // Réinitialiser la quantité à 1 après le reset
    const productQtyInput = document.getElementById('productQty');
    if (productQtyInput) {
        productQtyInput.value = 1;
    }
    document.getElementById('manualCodeInput').value = '';
    document.getElementById('productImage').src = '';
    document.getElementById('productImage').classList.remove('show');
    document.getElementById('imagePlaceholder').classList.remove('hidden');
    document.getElementById('imagePlaceholder').textContent = 'Image en chargement...';
    showStatusMessage('', '');
}

// Sauvegarder l'URL du webhook
function saveWebhook() {
    const url = document.getElementById('webhookUrl').value.trim();
    if (!url) {
        showWebhookStatus('Veuillez entrer une URL valide', 'error');
        return;
    }

    try {
        new URL(url);
        webhookUrl = url;
        localStorage.setItem('webhookUrl', url);
        showWebhookStatus('Webhook sauvegardé avec succès!', 'saved');
    } catch (e) {
        showWebhookStatus('URL invalide. Veuillez entrer une URL complète (ex: https://...)', 'error');
    }
}

// Afficher le statut du webhook
function showWebhookStatus(message, type) {
    const statusEl = document.getElementById('webhookStatus');
    statusEl.textContent = message;
    statusEl.className = 'webhook-status ' + type;
    statusEl.style.display = 'block';
}

// Afficher un message de statut
function showStatusMessage(message, type) {
    const statusEl = document.getElementById('statusMessage');
    statusEl.textContent = message;
    statusEl.className = 'status-message ' + type;
    
    if (!message) {
        statusEl.style.display = 'none';
        return;
    }
    
    if (type === 'success') {
        setTimeout(() => {
            statusEl.textContent = '';
            statusEl.className = 'status-message';
            statusEl.style.display = 'none';
        }, 5000);
    }
}
