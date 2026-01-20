// Configuration et état de l'application
let html5QrcodeScanner = null;
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
    // Charger l'URL du webhook sauvegardée ou utiliser celle par défaut
    if (webhookUrl) {
        document.getElementById('webhookUrl').value = webhookUrl;
        if (webhookUrl === DEFAULT_WEBHOOK_URL) {
            showWebhookStatus('Webhook configuré par défaut', 'saved');
        } else {
            showWebhookStatus('Webhook sauvegardé', 'saved');
        }
    }

    // Event listeners
    document.getElementById('startScanBtn').addEventListener('click', startScan);
    document.getElementById('stopScanBtn').addEventListener('click', stopScan);
    document.getElementById('manualInputBtn').addEventListener('click', toggleManualInput);
    document.getElementById('submitManualBtn').addEventListener('click', handleManualInput);
    document.getElementById('sendWebhookBtn').addEventListener('click', sendToWebhook);
    document.getElementById('scanAnotherBtn').addEventListener('click', scanAnother);
    document.getElementById('saveWebhookBtn').addEventListener('click', saveWebhook);
    
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
        html5QrcodeScanner = new Html5Qrcode("reader");
        
        await html5QrcodeScanner.start(
            { facingMode: "environment" },
            {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0
            },
            onScanSuccess,
            onScanError
        );

        isScanning = true;
        document.getElementById('startScanBtn').disabled = true;
        document.getElementById('stopScanBtn').disabled = false;
        hideManualInput();
        hideProductForm();
    } catch (err) {
        console.error("Erreur lors du démarrage du scan:", err);
        showStatusMessage('Erreur: Impossible d\'accéder à la caméra. Vérifiez les permissions.', 'error');
    }
}

// Arrêter le scan
function stopScan() {
    if (html5QrcodeScanner && isScanning) {
        html5QrcodeScanner.stop().then(() => {
            html5QrcodeScanner.clear();
            isScanning = false;
            document.getElementById('startScanBtn').disabled = false;
            document.getElementById('stopScanBtn').disabled = true;
        }).catch(err => {
            console.error("Erreur lors de l'arrêt du scan:", err);
        });
    }
}

// Callback de succès du scan
async function onScanSuccess(decodedText, decodedResult) {
    console.log("Code scanné:", decodedText);
    stopScan();
    await processScannedCode(decodedText);
}

// Callback d'erreur du scan
function onScanError(errorMessage) {
    // Ignorer les erreurs de scan continu
}

// Afficher/masquer la saisie manuelle
function toggleManualInput() {
    const section = document.getElementById('manualInputSection');
    if (section.style.display === 'none') {
        section.style.display = 'flex';
        stopScan();
    } else {
        section.style.display = 'none';
    }
}

function hideManualInput() {
    document.getElementById('manualInputSection').style.display = 'none';
}

// Gérer la saisie manuelle
async function handleManualInput() {
    const code = document.getElementById('manualCodeInput').value.trim();
    if (!code) {
        showStatusMessage('Veuillez entrer un code', 'error');
        return;
    }
    await processScannedCode(code);
}

// Traiter le code scanné
async function processScannedCode(code) {
    currentScannedCode = code;
    
    // Remplir le numéro de série
    document.getElementById('serialNumber').value = code;
    
    // Afficher le formulaire
    showProductForm();
    
    // Récupérer l'image et les infos produit
    await fetchProductImageAndInfo(code);
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
                imageContainer.src = imageUrl;
                imageContainer.onload = () => {
                    imageContainer.classList.add('show');
                    imagePlaceholder.classList.add('hidden');
                };
                imageContainer.onerror = () => {
                    imagePlaceholder.textContent = 'Image non disponible';
                    imagePlaceholder.classList.remove('hidden');
                };
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
            imageContainer.src = imageUrl;
            imageContainer.onload = () => {
                imageContainer.classList.add('show');
                imagePlaceholder.classList.add('hidden');
            };
            imageContainer.onerror = () => {
                imagePlaceholder.textContent = 'Image non disponible';
                imagePlaceholder.classList.remove('hidden');
            };
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
    
    // Focus sur le champ nom produit
    setTimeout(() => {
        document.getElementById('productName').focus();
    }, 100);
}

function hideProductForm() {
    document.getElementById('productFormSection').style.display = 'none';
}

// Envoyer les données au webhook
async function sendToWebhook() {
    // Valider le formulaire
    const productName = document.getElementById('productName').value.trim();
    const serialNumber = document.getElementById('serialNumber').value.trim();
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
                categoryDetails: categoryDetails || null,
                image: imageUrl || null
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
