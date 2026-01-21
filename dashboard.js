// Gestion du dashboard
let allItems = [];
let filteredItems = [];
let currentPage = 1;
const itemsPerPage = 20;
let sortColumn = null;
let sortDirection = 'asc';
let lastSyncTimestamp = Date.now();
let syncInterval = null;

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    loadItems();
    setupEventListeners();
    renderTable();
    setupRealtimeSync();
});

function setupEventListeners() {
    document.getElementById('exportCSVBtn').addEventListener('click', exportToCSV);
    document.getElementById('manageCategoriesBtn').addEventListener('click', toggleCategoryDropdown);
    document.getElementById('addCategoryBtn').addEventListener('click', addCategoryFromDropdown);
    
    // Fermer le dropdown si on clique ailleurs
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('categoryDropdown');
        const btn = document.getElementById('manageCategoriesBtn');
        if (dropdown && btn && !dropdown.contains(e.target) && !btn.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
    document.getElementById('importCSVInput').addEventListener('change', handleCSVImport);
    document.getElementById('searchBtn').addEventListener('click', filterItems);
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            filterItems();
        }
    });
    document.getElementById('selectAll').addEventListener('change', toggleSelectAll);
    document.getElementById('prevPage').addEventListener('click', () => changePage(-1));
    document.getElementById('nextPage').addEventListener('click', () => changePage(1));
    
    // Gestion du tri
    document.querySelectorAll('.sort-icon').forEach(icon => {
        icon.addEventListener('click', () => {
            const column = icon.getAttribute('data-sort');
            sortTable(column);
        });
    });
}

function loadItems() {
    const stored = localStorage.getItem('dashboardItems');
    allItems = stored ? JSON.parse(stored) : [];
    filteredItems = [...allItems];
    updateTotalItems();
}

function updateTotalItems() {
    document.getElementById('totalItems').textContent = allItems.length;
}

function filterItems() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    
    if (!searchTerm) {
        filteredItems = [...allItems];
    } else {
        filteredItems = allItems.filter(item => {
            return (
                item.name.toLowerCase().includes(searchTerm) ||
                item.serialNumber.toLowerCase().includes(searchTerm) ||
                (item.category && item.category.toLowerCase().includes(searchTerm)) ||
                (item.categoryDetails && item.categoryDetails.toLowerCase().includes(searchTerm)) ||
                (item.scannedCode && item.scannedCode.toLowerCase().includes(searchTerm))
            );
        });
    }
    
    currentPage = 1;
    renderTable();
}

function sortTable(column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc';
    }
    
    filteredItems.sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];
        
        if (column === 'quantity') {
            aVal = parseInt(aVal) || 0;
            bVal = parseInt(bVal) || 0;
        } else {
            aVal = (aVal || '').toString().toLowerCase();
            bVal = (bVal || '').toString().toLowerCase();
        }
        
        if (sortDirection === 'asc') {
            return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        } else {
            return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
        }
    });
    
    updateSortIcons();
    renderTable();
}

function updateSortIcons() {
    document.querySelectorAll('.sort-icon').forEach(icon => {
        const column = icon.getAttribute('data-sort');
        if (column === sortColumn) {
            icon.textContent = sortDirection === 'asc' ? '↑' : '↓';
        } else {
            icon.textContent = '↕';
        }
    });
}

function renderTable() {
    const tbody = document.getElementById('tableBody');
    
    if (filteredItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="empty-state">
                    <h2>[AUCUN ITEM]</h2>
                    <p>Aucun item trouvé. Scannez des codes-barres pour commencer.</p>
                </td>
            </tr>
        `;
        updatePagination();
        return;
    }
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageItems = filteredItems.slice(startIndex, endIndex);
    
    // Charger les catégories disponibles (exclure les supprimées)
    const customCategories = JSON.parse(localStorage.getItem('customCategories') || '[]');
    const deletedCategories = JSON.parse(localStorage.getItem('deletedCategories') || '[]');
    const defaultCategories = ['drone', 'video', 'audio', 'streaming', 'robot', 'autre'];
    const availableDefaultCategories = defaultCategories.filter(cat => !deletedCategories.includes(cat));
    const availableCustomCategories = customCategories.filter(cat => !deletedCategories.includes(cat));
    const allCategories = [...availableDefaultCategories, ...availableCustomCategories];
    
    tbody.innerHTML = pageItems.map((item, index) => {
        const imageHtml = item.image 
            ? `<img src="${item.image}" alt="${item.name}" onerror="this.parentElement.innerHTML='<div class=\\'image-placeholder-cell\\'>NO IMG</div>'">`
            : '<div class="image-placeholder-cell">NO IMG</div>';
        
        const categoryLabels = {
            'drone': 'DRONE',
            'video': 'VIDEO',
            'audio': 'AUDIO',
            'streaming': 'STREAMING',
            'robot': 'ROBOT',
            'autre': 'AUTRE'
        };
        const category = item.category || 'autre';
        const categoryLabel = categoryLabels[category] || category.toUpperCase();
        
        // Vérifier si l'item a été modifié
        const isEdited = item.lastUpdated && item.createdAt && item.lastUpdated !== item.createdAt;
        const editedClass = isEdited ? 'item-edited' : '';
        const editedTimeAgo = isEdited ? getTimeAgo(item.lastUpdated) : '';
        
        return `
            <tr data-index="${startIndex + index}" class="${editedClass}">
                <td>
                    <input type="checkbox" class="item-checkbox" data-serial="${item.serialNumber}">
                </td>
                <td class="item-name-cell editable-cell">
                    <input type="text" class="editable-input" value="${escapeHtml(item.name)}" data-serial="${item.serialNumber}" data-field="name" onblur="updateItemField('${item.serialNumber}', 'name', this.value)" onkeypress="if(event.key==='Enter') this.blur()">
                    ${isEdited ? `<span class="edited-badge">edited ${editedTimeAgo}</span>` : ''}
                </td>
                <td>${imageHtml}</td>
                <td class="quantity-cell editable-cell">
                    <input type="number" class="editable-input" value="${item.quantity || 1}" min="1" data-serial="${item.serialNumber}" data-field="quantity" onblur="updateItemField('${item.serialNumber}', 'quantity', this.value)" onkeypress="if(event.key==='Enter') this.blur()">
                </td>
                <td class="type-cell category-cell-editable">
                    <div class="category-select-wrapper">
                        <select class="category-select" data-serial="${item.serialNumber}" onchange="updateItemCategory('${item.serialNumber}', this.value)">
                            ${allCategories.map(cat => {
                                const label = categoryLabels[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
                                return `<option value="${cat}" ${cat === category ? 'selected' : ''}>${label}</option>`;
                            }).join('')}
                        </select>
                    </div>
                </td>
                <td class="details-cell" title="${escapeHtml(item.categoryDetails || '')}">
                    ${escapeHtml(item.categoryDetails || '-')}
                </td>
                <td class="serial-number-cell editable-cell">
                    <input type="text" class="editable-input" value="${escapeHtml(item.serialNumber)}" data-serial="${item.serialNumber}" data-field="serialNumber" onblur="updateItemField('${item.serialNumber}', 'serialNumber', this.value)" onkeypress="if(event.key==='Enter') this.blur()">
                </td>
                <td class="code-scanned-cell editable-cell">
                    <input type="text" class="editable-input" value="${escapeHtml(item.scannedCode || item.serialNumber)}" data-serial="${item.serialNumber}" data-field="scannedCode" onblur="updateItemField('${item.serialNumber}', 'scannedCode', this.value)" onkeypress="if(event.key==='Enter') this.blur()">
                </td>
                <td class="actions-cell">
                    <button class="action-btn delete" onclick="deleteItem('${item.serialNumber}')">
                        SUPPR
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    updatePagination();
}

function updatePagination() {
    const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
    document.getElementById('pageInfo').textContent = `PAGE ${currentPage} SUR ${totalPages || 1}`;
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage >= totalPages || totalPages === 0;
}

function changePage(direction) {
    const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
    const newPage = currentPage + direction;
    
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        renderTable();
    }
}

function toggleSelectAll() {
    const selectAll = document.getElementById('selectAll');
    const checkboxes = document.querySelectorAll('.item-checkbox');
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
        const row = checkbox.closest('tr');
        if (selectAll.checked) {
            row.classList.add('selected');
        } else {
            row.classList.remove('selected');
        }
    });
}

function deleteItem(serialNumber) {
    if (confirm('Supprimer cet item ?')) {
        allItems = allItems.filter(item => item.serialNumber !== serialNumber);
        localStorage.setItem('dashboardItems', JSON.stringify(allItems));
        
        // Déclencher un événement pour notifier les autres onglets
        window.dispatchEvent(new CustomEvent('dashboardItemsChanged', {
            detail: { items: allItems }
        }));
        
        loadItems();
        filterItems();
        showStatusMessage('Item supprimé', 'success');
    }
}


function exportToCSV() {
    if (filteredItems.length === 0) {
        showStatusMessage('Aucun item à exporter', 'error');
        return;
    }
    
    // En-têtes CSV
    const headers = ['Nom', 'Image', 'Quantité', 'Catégorie', 'Détails', 'Numéro de série', 'Code scanné', 'Date création', 'Dernière mise à jour'];
    
    // Créer les lignes CSV
    const rows = filteredItems.map(item => {
        return [
            escapeCSV(item.name || ''),
            escapeCSV(item.image || ''),
            item.quantity || 1,
            escapeCSV(item.category || 'autre'),
            escapeCSV(item.categoryDetails || ''),
            escapeCSV(item.serialNumber || ''),
            escapeCSV(item.scannedCode || item.serialNumber || ''),
            escapeCSV(item.createdAt || ''),
            escapeCSV(item.lastUpdated || '')
        ];
    });
    
    // Créer le contenu CSV
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');
    
    // Ajouter BOM pour Excel UTF-8
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // Créer le lien de téléchargement
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `dashboard_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showStatusMessage(`Export CSV réussi: ${filteredItems.length} items`, 'success');
}

function escapeCSV(str) {
    if (str === null || str === undefined) return '';
    const string = String(str);
    if (string.includes(',') || string.includes('"') || string.includes('\n')) {
        return `"${string.replace(/"/g, '""')}"`;
    }
    return string;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showStatusMessage(message, type) {
    const statusEl = document.getElementById('statusMessage');
    statusEl.textContent = message;
    statusEl.className = 'status-message ' + type;
    statusEl.style.display = 'block';
    
    setTimeout(() => {
        statusEl.textContent = '';
        statusEl.className = 'status-message';
        statusEl.style.display = 'none';
    }, 3000);
}

// Afficher/masquer le menu déroulant des catégories
function toggleCategoryDropdown() {
    const dropdown = document.getElementById('categoryDropdown');
    if (dropdown.style.display === 'none' || !dropdown.style.display) {
        dropdown.style.display = 'block';
        renderCategoryDropdown();
    } else {
        dropdown.style.display = 'none';
    }
}

// Rendre le menu déroulant des catégories
function renderCategoryDropdown() {
    const categoryList = document.getElementById('categoryList');
    const customCategories = JSON.parse(localStorage.getItem('customCategories') || '[]');
    const deletedCategories = JSON.parse(localStorage.getItem('deletedCategories') || '[]');
    const defaultCategories = ['drone', 'video', 'audio', 'streaming', 'robot', 'autre'];
    
    // Filtrer les catégories supprimées
    const availableDefaultCategories = defaultCategories.filter(cat => !deletedCategories.includes(cat));
    const availableCustomCategories = customCategories.filter(cat => !deletedCategories.includes(cat));
    const allCategories = [...availableDefaultCategories, ...availableCustomCategories];
    
    categoryList.innerHTML = allCategories.map(category => {
        const label = category.charAt(0).toUpperCase() + category.slice(1);
        return `
            <div class="category-item" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid #e5e5e5;">
                <span>${label}</span>
                <button class="category-delete-btn" onclick="deleteCategoryFromDropdown('${category}')" style="background: none; border: none; color: #ff4444; cursor: pointer; font-size: 18px; padding: 0 8px;">✕</button>
            </div>
        `;
    }).join('');
    
    if (allCategories.length === 0) {
        categoryList.innerHTML = '<div style="padding: 16px; text-align: center; color: #999;">Aucune catégorie disponible</div>';
    }
}

// Ajouter une catégorie depuis le dropdown
function addCategoryFromDropdown() {
    const input = document.getElementById('newCategoryInput');
    const categoryName = input.value.trim();
    
    if (!categoryName) {
        showStatusMessage('Veuillez entrer un nom de catégorie', 'error');
        return;
    }
    
    const category = categoryName.toLowerCase();
    const customCategories = JSON.parse(localStorage.getItem('customCategories') || '[]');
    
    if (customCategories.includes(category)) {
        showStatusMessage('Cette catégorie existe déjà', 'error');
        return;
    }
    
    // Vérifier que ce n'est pas une catégorie par défaut
    const defaultCategories = ['drone', 'video', 'audio', 'streaming', 'robot', 'autre'];
    if (defaultCategories.includes(category)) {
        showStatusMessage('Cette catégorie existe déjà (catégorie par défaut)', 'error');
        return;
    }
    
    customCategories.push(category);
    localStorage.setItem('customCategories', JSON.stringify(customCategories));
    
    input.value = '';
    renderCategoryDropdown();
    loadItems();
    filterItems();
    showStatusMessage(`Catégorie "${categoryName}" ajoutée`, 'success');
}

// Supprimer une catégorie depuis le dropdown
function deleteCategoryFromDropdown(categoryName) {
    if (!confirm(`Supprimer la catégorie "${categoryName}" ?`)) {
        return;
    }
    
    const category = categoryName.toLowerCase();
    
    // Ajouter à la liste des catégories supprimées
    const deletedCategories = JSON.parse(localStorage.getItem('deletedCategories') || '[]');
    if (!deletedCategories.includes(category)) {
        deletedCategories.push(category);
        localStorage.setItem('deletedCategories', JSON.stringify(deletedCategories));
    }
    
    // Si c'est une catégorie personnalisée, la retirer aussi de customCategories
    const customCategories = JSON.parse(localStorage.getItem('customCategories') || '[]');
    if (customCategories.includes(category)) {
        const updatedCategories = customCategories.filter(c => c !== category);
        localStorage.setItem('customCategories', JSON.stringify(updatedCategories));
    }
    
    // Mettre à jour tous les items qui utilisent cette catégorie vers "autre"
    const items = JSON.parse(localStorage.getItem('dashboardItems') || '[]');
    let updatedCount = 0;
    items.forEach(item => {
        if (item.category === category) {
            item.category = 'autre';
            item.lastUpdated = new Date().toISOString();
            updatedCount++;
        }
    });
    
    if (updatedCount > 0) {
        localStorage.setItem('dashboardItems', JSON.stringify(items));
        // Déclencher un événement pour notifier les autres onglets
        window.dispatchEvent(new CustomEvent('dashboardItemsChanged', {
            detail: { items: items }
        }));
    }
    
    renderCategoryDropdown();
    loadItems();
    filterItems();
    
    const message = updatedCount > 0 
        ? `Catégorie "${categoryName}" supprimée. ${updatedCount} item(s) mis à jour vers "autre".`
        : `Catégorie "${categoryName}" supprimée`;
    showStatusMessage(message, 'success');
}

// Mettre à jour la catégorie d'un item
function updateItemCategory(serialNumber, newCategory) {
    const item = allItems.find(item => item.serialNumber === serialNumber);
    if (!item) return;
    
    const oldCategory = item.category;
    item.category = newCategory;
    item.lastUpdated = new Date().toISOString();
    
    // Sauvegarder
    localStorage.setItem('dashboardItems', JSON.stringify(allItems));
    
    // Déclencher un événement pour notifier les autres onglets
    window.dispatchEvent(new CustomEvent('dashboardItemsChanged', {
        detail: { items: allItems }
    }));
    
    // Recharger et afficher
    loadItems();
    filterItems();
    
    showStatusMessage(`Catégorie mise à jour: ${oldCategory} → ${newCategory}`, 'success');
}

// Mettre à jour un champ d'un item (nom, quantité, numéro de série, code scanné)
function updateItemField(serialNumber, fieldName, newValue) {
    const item = allItems.find(item => item.serialNumber === serialNumber);
    if (!item) return;
    
    // Validation selon le champ
    if (fieldName === 'name' && !newValue.trim()) {
        showStatusMessage('Le nom ne peut pas être vide', 'error');
        // Restaurer la valeur précédente
        const input = document.querySelector(`input[data-serial="${serialNumber}"][data-field="name"]`);
        if (input) input.value = item.name;
        return;
    }
    
    if (fieldName === 'serialNumber' && !newValue.trim()) {
        showStatusMessage('Le numéro de série ne peut pas être vide', 'error');
        // Restaurer la valeur précédente
        const input = document.querySelector(`input[data-serial="${serialNumber}"][data-field="serialNumber"]`);
        if (input) input.value = item.serialNumber;
        return;
    }
    
    if (fieldName === 'quantity') {
        const qty = parseInt(newValue);
        if (isNaN(qty) || qty < 1) {
            showStatusMessage('La quantité doit être un nombre supérieur à 0', 'error');
            // Restaurer la valeur précédente
            const input = document.querySelector(`input[data-serial="${serialNumber}"][data-field="quantity"]`);
            if (input) input.value = item.quantity || 1;
            return;
        }
        newValue = qty;
    }
    
    // Vérifier si la valeur a changé
    const oldValue = item[fieldName];
    if (oldValue === newValue || (fieldName === 'quantity' && oldValue === parseInt(newValue))) {
        return; // Pas de changement
    }
    
    // Mettre à jour le champ
    item[fieldName] = newValue;
    item.lastUpdated = new Date().toISOString();
    
    // Si le numéro de série change, mettre à jour aussi le code scanné si c'était le même
    if (fieldName === 'serialNumber' && item.scannedCode === oldValue) {
        item.scannedCode = newValue;
    }
    
    // Sauvegarder
    localStorage.setItem('dashboardItems', JSON.stringify(allItems));
    
    // Déclencher un événement pour notifier les autres onglets
    window.dispatchEvent(new CustomEvent('dashboardItemsChanged', {
        detail: { items: allItems }
    }));
    
    // Recharger et afficher
    loadItems();
    filterItems();
    
    const fieldLabels = {
        'name': 'Nom',
        'quantity': 'Quantité',
        'serialNumber': 'Numéro de série',
        'scannedCode': 'Code scanné'
    };
    
    showStatusMessage(`${fieldLabels[fieldName]} mis à jour`, 'success');
}

// Parser le CSV
function parseCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };
    
    // Parser la première ligne comme en-têtes
    const headers = parseCSVLine(lines[0]);
    
    // Parser les lignes de données
    const rows = lines.slice(1).map(line => parseCSVLine(line));
    
    return { headers, rows };
}

// Parser une ligne CSV en tenant compte des guillemets
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                // Guillemet échappé
                current += '"';
                i++;
            } else {
                // Toggle inQuotes
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // Fin du champ
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    // Ajouter le dernier champ
    result.push(current.trim());
    
    return result;
}

// Mapper les colonnes CSV aux colonnes de la base de données
function mapCSVColumnsToDB(csvHeaders) {
    // Colonnes existantes dans la base de données
    const dbColumns = {
        'nom': 'name',
        'name': 'name',
        'image': 'image',
        'quantité': 'quantity',
        'quantity': 'quantity',
        'qty': 'quantity',
        'type': 'type',
        'catégorie': 'category',
        'category': 'category',
        'détails': 'categoryDetails',
        'categorydetails': 'categoryDetails',
        'category details': 'categoryDetails',
        'numéro de série': 'serialNumber',
        'serialnumber': 'serialNumber',
        'serial number': 'serialNumber',
        'numéro série': 'serialNumber',
        'numero de serie': 'serialNumber',
        'code scanné': 'scannedCode',
        'scannedcode': 'scannedCode',
        'scanned code': 'scannedCode',
        'code scanne': 'scannedCode',
        'date création': 'createdAt',
        'createdat': 'createdAt',
        'created at': 'createdAt',
        'date creation': 'createdAt',
        'dernière mise à jour': 'lastUpdated',
        'lastupdated': 'lastUpdated',
        'last updated': 'lastUpdated',
        'derniere mise a jour': 'lastUpdated'
    };
    
    const mapping = {};
    
    csvHeaders.forEach((csvHeader, index) => {
        const normalizedHeader = csvHeader.toLowerCase().trim();
        if (dbColumns[normalizedHeader]) {
            mapping[index] = dbColumns[normalizedHeader];
        }
    });
    
    return mapping;
}

// Importer un fichier CSV
function handleCSVImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const csvText = e.target.result;
            const { headers, rows } = parseCSV(csvText);
            
            if (headers.length === 0) {
                showStatusMessage('Le fichier CSV est vide', 'error');
                return;
            }
            
            // Mapper les colonnes CSV aux colonnes de la DB
            const columnMapping = mapCSVColumnsToDB(headers);
            
            if (Object.keys(columnMapping).length === 0) {
                showStatusMessage('Aucune colonne correspondante trouvée dans le CSV', 'error');
                return;
            }
            
            // Récupérer les colonnes requises
            const requiredColumns = ['name', 'serialNumber'];
            const missingColumns = requiredColumns.filter(col => 
                !Object.values(columnMapping).includes(col)
            );
            
            if (missingColumns.length > 0) {
                showStatusMessage(`Colonnes manquantes: ${missingColumns.join(', ')}`, 'error');
                return;
            }
            
            // Charger les items existants
            let existingItems = JSON.parse(localStorage.getItem('dashboardItems') || '[]');
            let importedCount = 0;
            let updatedCount = 0;
            let skippedCount = 0;
            
            // Traiter chaque ligne
            rows.forEach((row, rowIndex) => {
                if (row.length === 0 || row.every(cell => !cell.trim())) {
                    skippedCount++;
                    return;
                }
                
                // Créer un objet item à partir de la ligne CSV
                const item = {};
                
                Object.keys(columnMapping).forEach(csvIndex => {
                    const dbColumn = columnMapping[csvIndex];
                    const value = row[csvIndex] ? row[csvIndex].trim() : '';
                    
                    if (value) {
                        // Convertir les valeurs selon le type de colonne
                        if (dbColumn === 'quantity') {
                            item[dbColumn] = parseInt(value) || 1;
                        } else {
                            item[dbColumn] = value;
                        }
                    }
                });
                
                // Vérifier que les colonnes requises sont présentes
                if (!item.name || !item.serialNumber) {
                    skippedCount++;
                    return;
                }
                
                // Valeurs par défaut pour les colonnes manquantes
                if (!item.quantity) item.quantity = 1;
                if (!item.category) item.category = 'autre';
                if (!item.createdAt) item.createdAt = new Date().toISOString();
                item.lastUpdated = new Date().toISOString();
                
                // Vérifier si l'item existe déjà (même numéro de série)
                const existingIndex = existingItems.findIndex(
                    existing => existing.serialNumber === item.serialNumber
                );
                
                if (existingIndex !== -1) {
                    // Item existe déjà, mettre à jour
                    const existingItem = existingItems[existingIndex];
                    
                    // Mettre à jour tous les champs fournis
                    Object.keys(item).forEach(key => {
                        if (item[key] !== undefined && item[key] !== null && key !== 'quantity') {
                            existingItem[key] = item[key];
                        }
                    });
                    
                    // Augmenter la quantité
                    existingItem.quantity = 
                        (existingItem.quantity || 1) + (item.quantity || 1);
                    
                    // Mettre à jour le timestamp
                    existingItem.lastUpdated = new Date().toISOString();
                    
                    // S'assurer que createdAt existe
                    if (!existingItem.createdAt) {
                        existingItem.createdAt = existingItem.lastUpdated;
                    }
                    
                    updatedCount++;
                } else {
                    // Nouvel item
                    const now = new Date().toISOString();
                    if (!item.createdAt) item.createdAt = now;
                    item.lastUpdated = now;
                    existingItems.push(item);
                    importedCount++;
                }
            });
            
            // Sauvegarder les items
            localStorage.setItem('dashboardItems', JSON.stringify(existingItems));
            
            // Déclencher un événement pour notifier les autres onglets
            window.dispatchEvent(new CustomEvent('dashboardItemsChanged', {
                detail: { items: existingItems }
            }));
            
            // Recharger et afficher
            loadItems();
            filterItems();
            
            // Afficher le résultat
            let message = `Import terminé: ${importedCount} nouveaux items, ${updatedCount} items mis à jour`;
            if (skippedCount > 0) {
                message += `, ${skippedCount} lignes ignorées`;
            }
            showStatusMessage(message, 'success');
            
        } catch (error) {
            console.error('Erreur lors de l\'import CSV:', error);
            showStatusMessage('Erreur lors de l\'import CSV: ' + error.message, 'error');
        }
    };
    
    reader.onerror = function() {
        showStatusMessage('Erreur lors de la lecture du fichier', 'error');
    };
    
    reader.readAsText(file, 'UTF-8');
    
    // Réinitialiser l'input pour permettre de réimporter le même fichier
    event.target.value = '';
}

// Calculer le temps écoulé depuis une date
function getTimeAgo(dateString) {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    
    if (diffSec < 60) {
        return 'à l\'instant';
    } else if (diffMin < 60) {
        return `il y a ${diffMin} min`;
    } else if (diffHour < 24) {
        return `il y a ${diffHour}h`;
    } else if (diffDay < 7) {
        return `il y a ${diffDay}j`;
    } else {
        const diffWeek = Math.floor(diffDay / 7);
        return `il y a ${diffWeek} sem`;
    }
}

// Synchronisation en temps réel pour plusieurs utilisateurs
function setupRealtimeSync() {
    // Écouter les changements de localStorage depuis d'autres onglets
    window.addEventListener('storage', (e) => {
        if (e.key === 'dashboardItems') {
            console.log('Changement détecté depuis un autre onglet');
            loadItems();
            filterItems();
        }
    });
    
    // Écouter les événements CustomEvent depuis le même onglet (app.js)
    window.addEventListener('dashboardItemsChanged', (e) => {
        console.log('Changement détecté depuis app.js');
        loadItems();
        filterItems();
    });
    
    // Polling périodique pour détecter les changements (toutes les 2 secondes)
    syncInterval = setInterval(() => {
        checkForChanges();
        // Mettre à jour les badges "edited" toutes les minutes
        updateEditedBadges();
    }, 2000);
    
    // Marquer le timestamp de la dernière synchronisation
    lastSyncTimestamp = Date.now();
}

// Mettre à jour les badges "edited" avec le temps écoulé
function updateEditedBadges() {
    const editedBadges = document.querySelectorAll('.edited-badge');
    editedBadges.forEach(badge => {
        const row = badge.closest('tr');
        if (row) {
            const itemIndex = parseInt(row.getAttribute('data-index'));
            const startIndex = (currentPage - 1) * itemsPerPage;
            const actualIndex = startIndex + itemIndex;
            const item = filteredItems[actualIndex];
            
            if (item && item.lastUpdated) {
                const timeAgo = getTimeAgo(item.lastUpdated);
                badge.textContent = `edited ${timeAgo}`;
            }
        }
    });
}

// Vérifier les changements dans localStorage
function checkForChanges() {
    try {
        const stored = localStorage.getItem('dashboardItems');
        const currentItems = stored ? JSON.parse(stored) : [];
        
        // Comparer avec les items actuels
        const currentItemsString = JSON.stringify(currentItems);
        const allItemsString = JSON.stringify(allItems);
        
        if (currentItemsString !== allItemsString) {
            console.log('Changements détectés, mise à jour...');
            loadItems();
            filterItems();
        }
    } catch (error) {
        console.error('Erreur lors de la vérification des changements:', error);
    }
}

// Nettoyer l'intervalle lors de la fermeture de la page
window.addEventListener('beforeunload', () => {
    if (syncInterval) {
        clearInterval(syncInterval);
    }
});
