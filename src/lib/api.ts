/**
 * Module API pour communiquer avec le backend Flask
 * Adapté depuis api.js pour TypeScript/Next.js
 */

// En mode statique, utiliser une URL relative (même serveur)
// En mode dev, utiliser localhost:5000
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';
const isDev = typeof process !== 'undefined' && process.env.NODE_ENV === 'development';
const LOG_PREFIX = '[API]';

/**
 * Nettoyer un message d'erreur pour éviter les problèmes d'encodage Unicode
 */
function sanitizeErrorMessage(message: string): string {
  if (!message) return message;
  
  // Remplacer les caractères Unicode problématiques par des équivalents ASCII
  const replacements: Record<string, string> = {
    '\u2192': '->',  // →
    '\u2190': '<-',  // ←
    '\u2191': '^',   // ↑
    '\u2193': 'v',   // ↓
    '\u2026': '...', // …
    '\u2013': '-',   // –
    '\u2014': '-',   // —
    '\u201C': '"',   // "
    '\u201D': '"',   // "
    '\u2018': "'",   // '
    '\u2019': "'",   // '
  };
  
  let sanitized = message;
  for (const [unicode, ascii] of Object.entries(replacements)) {
    sanitized = sanitized.replace(new RegExp(unicode, 'g'), ascii);
  }
  
  return sanitized;
}

// URL de base pour SSE (doit être absolue pour EventSource)
export const getSSEUrl = (): string => {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
  // Si URL relative, la convertir en absolue
  if (baseUrl.startsWith('/')) {
    // En mode browser, utiliser l'origine actuelle
    if (typeof window !== 'undefined') {
      return `${window.location.origin}${baseUrl}/events`;
    }
    return '/api/events';
  }
  // Si URL absolue, ajouter /events
  return `${baseUrl}/events`;
};

// Types
export interface Item {
  id?: number;
  itemId?: string;
  hexId?: string;
  serialNumber: string;
  barcode?: string;
  scannedCode?: string;
  name: string;
  category?: string;
  categoryDetails?: string;
  quantity: number;
  description?: string;
  image?: string;
  media?: string;
  // Nouveaux champs pour la location
  status?: string; // 'en_stock' | 'loue'
  itemType?: string; // ordi, casque_vr, drone, etc.
  brand?: string;
  model?: string;
  rentalEndDate?: string;
  currentRentalId?: number;
  // Hiérarchie / Groupes d'items
  parentId?: number | null;
  displayOrder?: number;
  // Champs personnalisés
  customData?: Record<string, any>;
  createdAt?: string;
  lastUpdated?: string;
}

export interface CustomField {
  id: number;
  name: string;
  fieldKey: string;
  fieldType: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'textarea' | 'url' | 'email';
  options?: string[];
  required: boolean;
  displayOrder: number;
  createdAt: string;
}

export interface Notification {
  id: number;
  message: string;
  type: string;
  itemSerialNumber?: string;
  itemHexId?: string;
  timestamp: string;
  created_at: string;
}

export interface Category {
  name: string;
}

export interface Rental {
  id: number;
  renterName: string;
  renterEmail: string;
  renterPhone: string;
  renterAddress?: string;
  rentalPrice: number;
  rentalDeposit: number;
  rentalDuration: number;
  startDate: string;
  endDate: string;
  status: string;
  itemsData: any[];
  attachments?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Fonction utilitaire pour les requêtes API
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  try {
    if (typeof endpoint !== 'string') {
      throw new Error('Endpoint doit être une chaîne');
    }
    
    const url = `${API_BASE_URL}${endpoint}`;
    const method = options.method || 'GET';
    console.log(`${LOG_PREFIX} Requête:`, method, url);
    if (isDev && options.body && method !== 'GET') {
      try {
        console.log(`${LOG_PREFIX} Body:`, JSON.parse(options.body as string));
      } catch {
        console.log(`${LOG_PREFIX} Body:`, options.body);
      }
    }

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
    
    console.log(`${LOG_PREFIX} Réponse:`, response.status, response.statusText, url);
    
    if (!response.ok) {
      const errorText = await response.text();
      // Nettoyer le message d'erreur avant de l'afficher dans la console
      const sanitizedErrorText = sanitizeErrorMessage(errorText);
      console.error(`${LOG_PREFIX} Erreur HTTP:`, response.status, url, sanitizedErrorText);
      if (isDev && errorText) {
        console.error(`${LOG_PREFIX} Réponse brute:`, errorText.slice(0, 500));
      }
      let errorData;
      try {
        errorData = JSON.parse(errorText);
        // Nettoyer aussi le message d'erreur dans l'objet JSON
        if (errorData.error) {
          errorData.error = sanitizeErrorMessage(errorData.error);
        }
      } catch (e) {
        errorData = { error: sanitizedErrorText || `Erreur HTTP: ${response.status}` };
      }
      // Nettoyer le message avant de le lancer comme erreur
      const cleanError = sanitizeErrorMessage(errorData.error || `Erreur HTTP: ${response.status}`);
      throw new Error(cleanError);
    }
    
    const data = await response.json();
    if (isDev) {
      console.log(`${LOG_PREFIX} Données reçues:`, data);
    }
    return data as T;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Failed to fetch') ||
        error.message.includes('ERR_CONNECTION_REFUSED') ||
        error.message.includes('NetworkError'))
    ) {
      console.error(`${LOG_PREFIX} Erreur de connexion: Impossible de se connecter au backend.`);
      throw new Error(
        'Backend non disponible. Veuillez démarrer le serveur Flask (python server.py).'
      );
    }
    console.error(`${LOG_PREFIX} Erreur:`, error);
    if (isDev && error instanceof Error && error.stack) {
      console.error(`${LOG_PREFIX} Stack:`, error.stack);
    }
    throw error;
  }
}

// ==================== API ITEMS ====================

export async function getItems(): Promise<Item[]> {
  const data = await apiRequest<{ items: Item[] }>('/items');
  return data.items || [];
}

/**
 * Upload une image directement (pas de Base64)
 * Retourne le chemin API de l'image
 * Envoie directement à Flask pour éviter les problèmes de proxy avec les fichiers
 */
export async function uploadImage(file: File, serialNumber?: string): Promise<string | null> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    if (serialNumber) {
      formData.append('serialNumber', serialNumber);
    }

    // Upload direct vers Flask (pas via proxy Next.js qui a des problèmes avec FormData)
    const flaskUrl = 'http://localhost:5000/api/upload-image';
    const response = await fetch(flaskUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[API] Erreur upload image:', response.status, errorData);
      return null;
    }

    const data = await response.json();
    return data.success ? data.path : null;
  } catch (error) {
    console.error('[API] Erreur upload image:', error);
    return null;
  }
}

export async function saveItem(itemData: Partial<Item>): Promise<any> {
  return apiRequest('/items', {
    method: 'POST',
    body: JSON.stringify(itemData),
  });
}

export async function updateItem(
  serialNumber: string,
  updates: Partial<Item>
): Promise<any> {
  return apiRequest(`/items/${encodeURIComponent(serialNumber)}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteItem(serialNumber: string): Promise<any> {
  return apiRequest(`/items/${encodeURIComponent(serialNumber)}`, {
    method: 'DELETE',
  });
}

export async function deleteAllItems(): Promise<{ success: boolean; count: number }> {
  return apiRequest('/items/delete-all', {
    method: 'POST',
  });
}

export async function getItemHistory(serialNumber: string): Promise<any[]> {
  const data = await apiRequest<{ history: any[] }>(
    `/items/${encodeURIComponent(serialNumber)}/history`
  );
  return data.history || [];
}

export async function searchItemByCode(code: string): Promise<{ found: boolean; item: Item | null }> {
  const data = await apiRequest<{ success: boolean; found: boolean; item: Item | null }>(
    `/items/search?q=${encodeURIComponent(code)}`
  );
  return { found: data.found, item: data.item };
}

// ==================== API HIÉRARCHIE / GROUPES D'ITEMS ====================

export async function setItemParent(itemId: number, parentId: number | null, displayOrder: number = 0): Promise<any> {
  return apiRequest(`/items/${itemId}/set-parent`, {
    method: 'POST',
    body: JSON.stringify({ parentId, displayOrder }),
  });
}

export async function removeItemParent(itemId: number): Promise<any> {
  return apiRequest(`/items/${itemId}/remove-parent`, {
    method: 'POST',
  });
}

export async function reorderItemHierarchy(items: Array<{ id: number; parentId: number | null; displayOrder: number }>): Promise<any> {
  return apiRequest('/items/reorder-hierarchy', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

// ==================== API NOTIFICATIONS ====================

export async function getNotifications(): Promise<Notification[]> {
  const data = await apiRequest<{ notifications: Notification[] }>('/notifications');
  if (data.notifications) {
    return data.notifications;
  } else if (Array.isArray(data)) {
    return data as Notification[];
  } else {
    console.error('[API] Format de notifications inattendu:', data);
    return [];
  }
}

export async function clearNotifications(): Promise<any> {
  return apiRequest('/notifications', {
    method: 'DELETE',
  });
}

export async function deleteNotification(notificationId: number): Promise<any> {
  return apiRequest(`/notifications/${notificationId}`, {
    method: 'DELETE',
  });
}

// ==================== API CATEGORIES ====================

export async function getCategories(): Promise<{
  categories: string[];
  customCategories: string[];
  deletedCategories: string[];
}> {
  const data = await apiRequest<{
    categories: string[];
    customCategories: string[];
    deletedCategories: string[];
  }>('/categories');
  return {
    categories: data.categories || [],
    customCategories: data.customCategories || [],
    deletedCategories: data.deletedCategories || [],
  };
}

export async function createCategory(categoryName: string): Promise<any> {
  return apiRequest('/categories', {
    method: 'POST',
    body: JSON.stringify({ name: categoryName }),
  });
}

export async function deleteCategory(categoryName: string): Promise<any> {
  return apiRequest(`/categories/${encodeURIComponent(categoryName)}`, {
    method: 'DELETE',
  });
}

// ==================== API RENTALS ====================

export async function getRentals(status: string = ''): Promise<Rental[]> {
  const statusStr = typeof status === 'string' ? status : '';
  const endpoint = statusStr
    ? `/rentals?status=${encodeURIComponent(statusStr)}`
    : '/rentals';
  const data = await apiRequest<{ rentals: Rental[] }>(endpoint);
  return data.rentals || [];
}

export async function createRental(rentalData: Partial<Rental>): Promise<any> {
  return apiRequest('/rentals', {
    method: 'POST',
    body: JSON.stringify(rentalData),
  });
}

export async function updateRental(
  rentalId: number,
  updates: Partial<Rental>
): Promise<any> {
  return apiRequest(`/rentals/${rentalId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteRental(rentalId: number): Promise<any> {
  return apiRequest(`/rentals/${rentalId}`, {
    method: 'DELETE',
  });
}

export async function downloadRentalCautionDoc(rentalId: number): Promise<void> {
  try {
    const url = `${API_BASE_URL}/rentals/${rentalId}/caution-doc`;
    const response = await fetch(url, {
      method: 'GET',
    });
    
    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }
    
    // Récupérer le nom du fichier depuis les headers
    const contentDisposition = response.headers.get('content-disposition');
    let filename = `caution_location_${rentalId}.pdf`;
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1].replace(/['"]/g, '');
      }
    }
    
    // Télécharger le fichier
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    console.error('[API] Erreur téléchargement document caution:', error);
    throw error;
  }
}

export async function getRentalStatuses(): Promise<string[]> {
  const data = await apiRequest<{ statuses: string[] }>('/rental-statuses');
  return data.statuses || [];
}

export async function createRentalStatus(statusData: {
  name: string;
  color?: string;
}): Promise<any> {
  return apiRequest('/rental-statuses', {
    method: 'POST',
    body: JSON.stringify(statusData),
  });
}

// ==================== API PROXY (External APIs) ====================

export async function searchProductByBarcode(gtin: string): Promise<any> {
  return apiRequest(`/proxy/gtinsearch?gtin=${encodeURIComponent(gtin)}`);
}

export async function searchProductOpenFoodFacts(gtin: string): Promise<any> {
  return apiRequest(`/proxy/openfoodfacts?gtin=${encodeURIComponent(gtin)}`);
}

export async function fetchImageAsBase64(imageUrl: string): Promise<{
  success: boolean;
  image?: string;
  contentType?: string;
  error?: string;
}> {
  return apiRequest(`/proxy/image?url=${encodeURIComponent(imageUrl)}`);
}

// ==================== OCR ====================

export interface OcrResult {
  success: boolean;
  rawText?: string;
  parsed?: {
    name?: string;
    serialNumber?: string;
    brand?: string;
    model?: string;
    barcode?: string;
    description?: string;
  };
  error?: string;
}

export async function recognizeImage(imageBase64: string): Promise<OcrResult> {
  return apiRequest('/ocr', {
    method: 'POST',
    body: JSON.stringify({ image: imageBase64 }),
  });
}

export async function analyzeLabelAI(imageBase64: string): Promise<{
  success: boolean;
  parsed?: {
    name?: string | null;
    serialNumber?: string | null;
    brand?: string | null;
    model?: string | null;
    barcode?: string | null;
    description?: string | null;
    category?: string | null;
    quantity?: number;
    [key: string]: any; // Pour les champs personnalisés dynamiques
  };
  rawResponse?: string;
  model?: string;
  customFields?: Array<{
    name: string;
    fieldKey: string;
    fieldType: string;
    options?: any;
  }>;
  error?: string;
}> {
  return apiRequest('/analyze-label-ai', {
    method: 'POST',
    body: JSON.stringify({ image: imageBase64 }),
  });
}

export async function checkOcrStatus(): Promise<{ success: boolean; available: boolean }> {
  return apiRequest('/ocr/status');
}

// ==================== CUSTOM FIELDS (Colonnes personnalisées) ====================

export async function getCustomFields(): Promise<{ success: boolean; fields: CustomField[] }> {
  return apiRequest('/custom-fields');
}

export async function createCustomField(data: {
  name: string;
  fieldType: string;
  options?: string[];
  required?: boolean;
}): Promise<{ success: boolean; id?: number; fieldKey?: string; error?: string }> {
  return apiRequest('/custom-fields', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCustomField(
  fieldId: number,
  data: Partial<{
    name: string;
    fieldType: string;
    options: string[];
    required: boolean;
    displayOrder: number;
  }>
): Promise<{ success: boolean; error?: string }> {
  return apiRequest(`/custom-fields/${fieldId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCustomField(fieldId: number): Promise<{ success: boolean; error?: string }> {
  return apiRequest(`/custom-fields/${fieldId}`, {
    method: 'DELETE',
  });
}
