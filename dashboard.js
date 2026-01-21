// Gestion du dashboard
let allItems = [];
let filteredItems = [];
let currentPage = 1;
const itemsPerPage = 20;
let sortColumn = null;
let sortDirection = 'asc';

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    loadItems();
    setupEventListeners();
    renderTable();
});

function setupEventListeners() {
    document.getElementById('exportCSVBtn').addEventListener('click', exportToCSV);
    document.getElementById('clearAllBtn').addEventListener('click', clearAllItems);
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
                item.type.toLowerCase().includes(searchTerm) ||
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
    
    tbody.innerHTML = pageItems.map((item, index) => {
        const typeLabels = {
            'location': 'LOCATION',
            'vente': 'VENTE',
            'utilisation': 'UTILISATION'
        };
        
        const typeClass = `type-${item.type}`;
        const imageHtml = item.image 
            ? `<img src="${item.image}" alt="${item.name}" onerror="this.parentElement.innerHTML='<div class=\\'image-placeholder-cell\\'>NO IMG</div>'">`
            : '<div class="image-placeholder-cell">NO IMG</div>';
        
        return `
            <tr data-index="${startIndex + index}">
                <td>
                    <input type="checkbox" class="item-checkbox" data-serial="${item.serialNumber}">
                </td>
                <td>${escapeHtml(item.name)}</td>
                <td>${imageHtml}</td>
                <td class="quantity-cell">${item.quantity || 1}</td>
                <td class="type-cell">
                    <span class="${typeClass}">${typeLabels[item.type] || item.type.toUpperCase()}</span>
                </td>
                <td class="details-cell" title="${escapeHtml(item.categoryDetails || '')}">
                    ${escapeHtml(item.categoryDetails || '-')}
                </td>
                <td class="serial-number-cell">${escapeHtml(item.serialNumber)}</td>
                <td class="code-scanned-cell">${escapeHtml(item.scannedCode || item.serialNumber)}</td>
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
        loadItems();
        filterItems();
        showStatusMessage('Item supprimé', 'success');
    }
}

function clearAllItems() {
    if (confirm('Supprimer TOUS les items ? Cette action est irréversible.')) {
        localStorage.removeItem('dashboardItems');
        allItems = [];
        filteredItems = [];
        loadItems();
        renderTable();
        showStatusMessage('Tous les items ont été supprimés', 'success');
    }
}

function exportToCSV() {
    if (filteredItems.length === 0) {
        showStatusMessage('Aucun item à exporter', 'error');
        return;
    }
    
    // En-têtes CSV
    const headers = ['Nom', 'Image', 'Quantité', 'Type', 'Détails', 'Numéro de série', 'Code scanné', 'Date création', 'Dernière mise à jour'];
    
    // Créer les lignes CSV
    const rows = filteredItems.map(item => {
        return [
            escapeCSV(item.name || ''),
            escapeCSV(item.image || ''),
            item.quantity || 1,
            escapeCSV(item.type || ''),
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
