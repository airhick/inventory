'use client';
/*!
=========================================================
* Code Bar CRM - Inventory Dashboard Page
=========================================================
*/

import {
  Box,
  Button,
  Flex,
  Input,
  Select,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  useColorModeValue,
  HStack,
  VStack,
  Icon,
  useToast,
  Badge,
  Text,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  FormControl,
  FormLabel,
  IconButton,
  Tooltip,
  Checkbox,
  Image,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Textarea,
  Divider,
} from '@chakra-ui/react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { MdSearch, MdEdit, MdDelete, MdDownload, MdUpload, MdAdd, MdMoreVert, MdFileUpload, MdCheckCircle, MdWarning, MdBrush, MdChevronLeft, MdChevronRight, MdPhotoLibrary, MdViewColumn, MdClose, MdDragIndicator, MdDeleteSweep, MdAccountTree, MdArrowUpward, MdArrowDownward, MdSort } from 'react-icons/md';
import Card from 'components/card/Card';
import {
  getItems,
  updateItem,
  deleteItem,
  deleteAllItems,
  getCategories,
  getCustomFields,
  saveItem,
  Item,
  CustomField,
  getSSEUrl,
  createCustomField,
  deleteCustomField,
  updateCustomField,
  createCategory,
  deleteCategory,
} from 'lib/api';
import { ColumnManager } from 'components/table/ColumnManager';
import { AdvancedFilters, FilterRule, SortRule } from 'components/table/AdvancedFilters';
import { applyFiltersAndSorts } from 'utils/filterUtils';
import { HierarchicalInventoryRow } from 'components/table/HierarchicalInventoryRow';
import { useItemHierarchy } from 'hooks/useItemHierarchy';

const ITEMS_PER_PAGE = 20;

// Statuts par défaut (colonne Statut - liste déroulante)
const DEFAULT_STATUS_OPTIONS: Array<{ value: string; label: string; color: string }> = [
  { value: 'en_stock', label: 'En stock', color: 'green' },
  { value: 'out', label: 'Out', color: 'blue' },
  { value: 'plus_dispo', label: 'Plus dispo', color: 'red' },
];

const STATUS_COLORS: Record<string, string> = {
  en_stock: 'green',
  out: 'blue',
  plus_dispo: 'red',
  // Anciens statuts (rétrocompatibilité)
  en_location: 'blue',
  location_future: 'purple',
  maintenance: 'orange',
  vendu: 'gray',
  perdu: 'red',
};

const STATUS_LABELS: Record<string, string> = {
  en_stock: 'En stock',
  out: 'Out',
  plus_dispo: 'Plus dispo',
  en_location: 'En location',
  location_future: 'Location future',
  maintenance: 'Maintenance',
  vendu: 'Vendu',
  perdu: 'Perdu',
};

const CUSTOM_STATUSES_STORAGE_KEY = 'inventory_custom_statuses';

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Texte',
  number: 'Nombre',
  date: 'Date',
  select: 'Liste déroulante',
  checkbox: 'Case à cocher',
  textarea: 'Texte long',
  url: 'URL',
  email: 'Email',
};

export default function InventoryPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const itemRef = useRef<HTMLTableRowElement | null>(null);
  const [editingCell, setEditingCell] = useState<{
    serialNumber: string;
    field: string;
    isCustom?: boolean;
  } | null>(null);
  const [editValue, setEditValue] = useState('');
  
  // Colonnes personnalisées
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const { isOpen: isImportOpen, onOpen: onImportOpen, onClose: onImportClose } = useDisclosure();
  
  // Import CSV
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvParsedRef = useRef<{ headers: string[]; data: string[][]; mapping: Record<string, string> } | null>(null);
  const wasImportOpenRef = useRef(false);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, errors: 0 });
  const [draggedCsvColumn, setDraggedCsvColumn] = useState<string | null>(null);
  const [draggedInventoryColumn, setDraggedInventoryColumn] = useState<string | null>(null);
  
  // Modal pour voir toutes les images en grand
  const { isOpen: isImageModalOpen, onOpen: onImageModalOpen, onClose: onImageModalClose } = useDisclosure();
  const [selectedItemImages, setSelectedItemImages] = useState<string[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  
  // Modal pour gérer les colonnes personnalisées
  const { isOpen: isColumnModalOpen, onOpen: onColumnModalOpen, onClose: onColumnModalClose } = useDisclosure();
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState('text');
  const [isAddingColumn, setIsAddingColumn] = useState(false);

  // Modal pour gérer les catégories
  const { isOpen: isCategoryModalOpen, onOpen: onCategoryModalOpen, onClose: onCategoryModalClose } = useDisclosure();
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [isDeletingCategory, setIsDeletingCategory] = useState<string | null>(null);

  // État de la synchronisation en temps réel
  const [isSSEConnected, setIsSSEConnected] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Ordre des colonnes (drag and drop)
  const [columnOrder, setColumnOrder] = useState<string[]>([
    'id', 'barcode', 'serialNumber', 'name', 'image', 'brand', 'model', 'category', 'quantity', 'status'
  ]);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // Largeurs par défaut des colonnes
  const defaultColumnWidths: Record<string, number> = {
    id: 70,
    barcode: 120,
    serialNumber: 130,
    name: 180,
    image: 70,
    brand: 120,
    model: 120,
    category: 110,
    quantity: 70,
    status: 110,
    actions: 100,
  };

  // Largeurs des colonnes (redimensionnables)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('inventoryColumnWidths');
      if (saved) {
        try { return JSON.parse(saved); } catch (e) { /* ignore */ }
      }
    }
    return { ...defaultColumnWidths };
  });
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [resizeStartX, setResizeStartX] = useState<number>(0);
  const [resizeStartWidth, setResizeStartWidth] = useState<number>(0);

  // Filtres et tris avancés (style Supabase)
  const [advancedFilters, setAdvancedFilters] = useState<FilterRule[]>([]);
  const [advancedSorts, setAdvancedSorts] = useState<SortRule[]>([]);

  // Callback pour mise à jour optimiste des items après drag & drop
  const handleHierarchyItemsChange = useCallback((updatedItems: Item[]) => {
    // Mettre à jour les items dans le state principal
    setItems(prevItems => {
      const updatedMap = new Map(updatedItems.map(i => [i.id, i]));
      return prevItems.map(item => updatedMap.get(item.id) || item);
    });
  }, []);
  
  const hierarchy = useItemHierarchy(filteredItems, handleHierarchyItemsChange);

  // Statuts personnalisés (liste déroulante colonne Statut)
  const [customStatuses, setCustomStatuses] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(CUSTOM_STATUSES_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_STATUSES_STORAGE_KEY, JSON.stringify(customStatuses));
    } catch {}
  }, [customStatuses]);

  // Liste complète des options de statut (défaut + personnalisés)
  const statusOptions = [
    ...DEFAULT_STATUS_OPTIONS,
    ...customStatuses.map((value) => ({
      value,
      label: value.replace(/_/g, ' '),
      color: 'gray' as const,
    })),
  ];

  const addCustomStatus = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const value = trimmed.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/gi, '');
    if (!value) return;
    if (statusOptions.some((o) => o.value === value)) return;
    setCustomStatuses((prev) => [...prev, value]);
    return value;
  };

  // Log des états des modals au montage et à chaque changement
  useEffect(() => {
    console.log('[MODAL STATE] isImportOpen:', isImportOpen);
    console.log('[MODAL STATE] isColumnModalOpen:', isColumnModalOpen);
    console.log('[MODAL STATE] isImageModalOpen:', isImageModalOpen);
    console.log('[MODAL STATE] isCategoryModalOpen:', isCategoryModalOpen);
  }, [isImportOpen, isColumnModalOpen, isImageModalOpen, isCategoryModalOpen]);

  const toast = useToast();
  const bg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  


  // Test au montage du composant
  useEffect(() => {
    console.log('[INIT] Composant Inventory monté');
    console.log('[INIT] useDisclosure pour Import:', { isImportOpen, onImportOpen, onImportClose });
    console.log('[INIT] useDisclosure pour Column:', { isColumnModalOpen, onColumnModalOpen, onColumnModalClose });
    console.log('[INIT] Chakra UI Provider présent:', !!document.querySelector('[data-chakra-ui-provider]'));
  }, []);

  // Charger les items
  const loadItems = async () => {
    try {
      setLoading(true);
      const data = await getItems();
      setItems(data);
    } catch (error) {
      console.error('Erreur chargement items:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de charger les items',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  // Charger les catégories
  const loadCategories = async () => {
    try {
      const data = await getCategories();
      // data.categories contient déjà toutes les catégories (default + custom)
      // On déduplique au cas où pour éviter les erreurs React
      const uniqueCategories = Array.from(new Set(data.categories || []));
      setCategories(uniqueCategories);
    } catch (error) {
      console.error('Erreur chargement catégories:', error);
    }
  };

  // Charger les champs personnalisés
  const loadCustomFields = async () => {
    try {
      const data = await getCustomFields();
      setCustomFields(data.fields || []);
    } catch (error) {
      console.error('Erreur chargement champs personnalisés:', error);
    }
  };

  // URL SSE - utiliser la configuration
  const SSE_URL = getSSEUrl();

  // Charger l'ordre des colonnes depuis localStorage
  useEffect(() => {
    const savedOrder = localStorage.getItem('inventoryColumnOrder');
    if (savedOrder) {
      try {
        const order = JSON.parse(savedOrder);
        console.log('[COLUMN ORDER] Ordre chargé depuis localStorage:', order);
        setColumnOrder(order);
      } catch (error) {
        console.error('[COLUMN ORDER] Erreur chargement ordre:', error);
      }
    }
  }, []);

  // Sauvegarder l'ordre des colonnes dans localStorage
  useEffect(() => {
    if (columnOrder.length > 0) {
      localStorage.setItem('inventoryColumnOrder', JSON.stringify(columnOrder));
      console.log('[COLUMN ORDER] Ordre sauvegardé:', columnOrder);
    }
  }, [columnOrder]);

  // Sauvegarder les largeurs de colonnes
  useEffect(() => {
    if (Object.keys(columnWidths).length > 0) {
      localStorage.setItem('inventoryColumnWidths', JSON.stringify(columnWidths));
    }
  }, [columnWidths]);

  // Helper pour obtenir la largeur d'une colonne avec fallback
  const getColWidth = (key: string) => columnWidths[key] || defaultColumnWidths[key] || 100;

  useEffect(() => {
    // Chargement initial
    loadItems();
    loadCategories();
    loadCustomFields();
    
    // Écouter les événements SSE pour recharger uniquement lors de changements
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    
    const connectSSE = () => {
      if (eventSource) {
        eventSource.close();
      }
      
      eventSource = new EventSource(SSE_URL);
      
      eventSource.onopen = () => {
        console.log('[SSE] ✅ Connecté aux événements temps réel');
        console.log('[SSE] URL:', SSE_URL);
        reconnectAttempts = 0;
        setIsSSEConnected(true);
        setLastSyncTime(new Date());
      };
      
      eventSource.onerror = () => {
        console.error('[SSE] ❌ Erreur de connexion, tentative de reconnexion...');
        eventSource?.close();
        setIsSSEConnected(false);
        
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
          console.log(`[SSE] Reconnexion dans ${delay}ms (tentative ${reconnectAttempts}/${maxReconnectAttempts})`);
          reconnectTimeout = setTimeout(connectSSE, delay);
        } else {
          console.error('[SSE] ❌ Échec de reconnexion après', maxReconnectAttempts, 'tentatives');
        }
      };
      
      eventSource.addEventListener('items_changed', (e) => {
        console.log('[SSE] 📦 Événement items_changed reçu:', e);
        try {
          const data = JSON.parse((e as MessageEvent).data);
          // Ne pas recharger si c'est un événement de hiérarchie (déjà géré en optimiste)
          if (data?.action === 'hierarchy_updated' || data?.action === 'hierarchy_reordered') {
            console.log('[SSE] Événement hiérarchie ignoré (mise à jour optimiste déjà appliquée)');
            setLastSyncTime(new Date());
            return;
          }
        } catch {
          // Si on ne peut pas parser, on recharge par défaut
        }
        console.log('[SSE] Rechargement automatique des items...');
        setLastSyncTime(new Date());
        loadItems();
      });
      
      eventSource.addEventListener('categories_changed', (e) => {
        console.log('[SSE] 📁 Événement categories_changed reçu:', e);
        console.log('[SSE] Rechargement automatique des catégories...');
        setLastSyncTime(new Date());
        loadCategories();
      });
      
      eventSource.addEventListener('custom_fields_changed', (e) => {
        console.log('[SSE] 📊 Événement custom_fields_changed reçu:', e);
        console.log('[SSE] Rechargement automatique des colonnes personnalisées et items...');
        setLastSyncTime(new Date());
        loadCustomFields();
        loadItems(); // Recharger aussi les items car ils contiennent les données custom
      });
    };
    
    connectSSE();
    
    return () => {
      eventSource?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  // Navigation clavier dans le modal d'images
  useEffect(() => {
    if (!isImageModalOpen || selectedItemImages.length <= 1) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const newIndex = selectedImageIndex > 0 
          ? selectedImageIndex - 1 
          : selectedItemImages.length - 1;
        setSelectedImageIndex(newIndex);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const newIndex = selectedImageIndex < selectedItemImages.length - 1 
          ? selectedImageIndex + 1 
          : 0;
        setSelectedImageIndex(newIndex);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isImageModalOpen, selectedItemImages.length, selectedImageIndex]);

  // Détecter le paramètre item dans l'URL (ID hexadécimal ou n° de série) et scroller vers cet item
  useEffect(() => {
    const itemParam = searchParams.get('item');
    if (itemParam && items.length > 0) {
      const decoded = decodeURIComponent(itemParam);
      const targetItem = items.find(
        item => item.hexId === decoded || item.serialNumber === decoded
      );
      
      if (targetItem) {
        // Filtrer pour afficher l'item (par n° de série pour le scroll)
        setSearchTerm(targetItem.serialNumber);
        setCategoryFilter('');
        setCurrentPage(1);
        
        // Scroller vers l'item après un court délai (l'élément a id item-{serialNumber})
        const serialForDom = targetItem.serialNumber;
        setTimeout(() => {
          const element = document.getElementById(`item-${serialForDom}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.style.backgroundColor = 'rgba(66, 153, 225, 0.2)';
            setTimeout(() => {
              element.style.backgroundColor = '';
            }, 2000);
          }
        }, 300);
        
        // Nettoyer l'URL
        router.replace('/admin/inventory');
      }
    }
  }, [items, searchParams, router]);

  // IDs des items qui correspondent à la recherche (pour highlight)
  const [matchedItemIds, setMatchedItemIds] = useState<Set<number>>(new Set());

  // Fonction pour vérifier si un item correspond à la recherche
  const itemMatchesSearch = (item: Item, term: string): boolean => {
    const standardFieldsMatch = 
      item.name?.toLowerCase().includes(term) ||
      item.barcode?.toLowerCase().includes(term) ||
      item.scannedCode?.toLowerCase().includes(term) ||
      item.serialNumber?.toLowerCase().includes(term) ||
      item.brand?.toLowerCase().includes(term) ||
      item.model?.toLowerCase().includes(term) ||
      item.category?.toLowerCase().includes(term) ||
      item.categoryDetails?.toLowerCase().includes(term) ||
      item.description?.toLowerCase().includes(term) ||
      item.hexId?.toLowerCase().includes(term) ||
      item.itemId?.toLowerCase().includes(term) ||
      item.status?.toLowerCase().includes(term) ||
      item.itemType?.toLowerCase().includes(term) ||
      String(item.quantity || '').includes(term);
    
    if (standardFieldsMatch) return true;
    
    if (item.customData) {
      const customDataMatch = Object.values(item.customData).some(value => {
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(term);
      });
      if (customDataMatch) return true;
    }
    
    return false;
  };

  // Filtrer les items - garder les groupes visibles si un enfant correspond
  useEffect(() => {
    let filtered = [...items];
    const matched = new Set<number>();

    if (searchTerm) {
      const term = searchTerm.toLowerCase().trim();
      
      // Trouver tous les items qui correspondent
      items.forEach(item => {
        if (itemMatchesSearch(item, term) && item.id) {
          matched.add(item.id);
        }
      });

      // Trouver tous les parents des items correspondants
      const parentsToInclude = new Set<number>();
      matched.forEach(itemId => {
        let currentItem = items.find(i => i.id === itemId);
        while (currentItem?.parentId) {
          parentsToInclude.add(currentItem.parentId);
          currentItem = items.find(i => i.id === currentItem!.parentId);
        }
      });

      // Filtrer: garder les items qui correspondent OU leurs parents
      filtered = filtered.filter(item => 
        (item.id && matched.has(item.id)) || (item.id && parentsToInclude.has(item.id))
      );
    }

    if (categoryFilter) {
      filtered = filtered.filter((item) => item.category === categoryFilter);
    }

    // Appliquer les filtres et tris avancés
    if (advancedFilters.length > 0 || advancedSorts.length > 0) {
      filtered = applyFiltersAndSorts(filtered, advancedFilters, advancedSorts);
    }

    setFilteredItems(filtered);
    setMatchedItemIds(matched);
    setCurrentPage(1);
  }, [items, searchTerm, categoryFilter, advancedFilters, advancedSorts]);

  // Pagination (avec support du mode hiérarchique)
  const itemsToDisplay = hierarchy.displayItems;
  const totalPages = Math.ceil(itemsToDisplay.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedItems = itemsToDisplay.slice(startIndex, endIndex);

  // Démarrer l'édition
  const startEdit = (serialNumber: string, field: string, currentValue: any, isCustom = false) => {
    setEditingCell({ serialNumber, field, isCustom });
    setEditValue(String(currentValue || ''));
  };

  // Sauvegarder l'édition
  const saveEdit = async () => {
    if (!editingCell) return;

    try {
      const item = items.find(i => i.serialNumber === editingCell.serialNumber);
      if (!item) return;

      if (editingCell.isCustom) {
        // Mise à jour d'un champ personnalisé
        const currentCustomData = item.customData || {};
        const updatedCustomData = {
          ...currentCustomData,
          [editingCell.field]: editValue,
        };
        await updateItem(editingCell.serialNumber, {
          customData: updatedCustomData,
        });
      } else {
        // Mise à jour d'un champ standard
        let valueToSave: any = editValue;
        
        // Convertir en nombre si c'est le champ quantity
        if (editingCell.field === 'quantity') {
          valueToSave = parseInt(editValue) || 0;
        }
        // Normaliser les numéros de série multiples (séparer par des virgules)
        else if (editingCell.field === 'serialNumber') {
          const serials = parseSerialNumbers(editValue);
          valueToSave = serials.join(', ');
        }
        // Pour barcode, utiliser scannedCode si c'est vide
        else if (editingCell.field === 'barcode') {
          // Si on édite barcode, on met à jour scannedCode
          valueToSave = editValue.trim();
        }
        
        // Mapping des champs pour l'API
        const apiFieldMap: Record<string, string> = {
          'barcode': 'scannedCode', // barcode est mappé vers scannedCode dans l'API
        };
        
        const apiField = apiFieldMap[editingCell.field] || editingCell.field;
        
        await updateItem(editingCell.serialNumber, {
          [apiField]: valueToSave,
        });
      }
      
      console.log('[EDIT] ✅ Mise à jour réussie, rechargement immédiat de l\'affichage...');
      
      // Fermer l'édition
      setEditingCell(null);
      
      // Recharger immédiatement les données pour voir le changement
      // (le SSE propagera aux autres clients)
      await loadItems();
      
      console.log('[EDIT] ✅ Affichage mis à jour!');
      
      toast({
        title: '✅ Sauvegardé',
        description: 'Les modifications sont visibles immédiatement',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
    } catch (error) {
      console.error('Erreur mise à jour:', error);
      toast({
        title: 'Erreur',
        description: 'Erreur lors de la mise à jour',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  // Supprimer un item
  const handleDelete = async (serialNumber: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet item ?')) return;

    try {
      console.log('[DELETE] 🗑️ Suppression de l\'item:', serialNumber);
      await deleteItem(serialNumber);
      
      console.log('[DELETE] ✅ Suppression réussie, rechargement immédiat...');
      
      // Recharger immédiatement les données
      await loadItems();
      
      console.log('[DELETE] ✅ Affichage mis à jour!');
      
      toast({
        title: 'Succès',
        description: 'Item supprimé',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
    } catch (error) {
      console.error('Erreur suppression:', error);
      toast({
        title: 'Erreur',
        description: 'Erreur lors de la suppression',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  // Supprimer tous les items
  const handleDeleteAll = async () => {
    try {
      console.log('[DELETE_ALL] 🗑️ Suppression de tous les items...');
      
      // Appeler l'endpoint de suppression en masse
      const result = await deleteAllItems();
      
      console.log('[DELETE_ALL] ✅ Tous les items supprimés, rechargement...');
      
      // Recharger immédiatement les données
      await loadItems();
      
      console.log('[DELETE_ALL] ✅ Inventaire vidé!');
      
      toast({
        title: 'Inventaire vidé',
        description: `${result.count} article(s) supprimé(s)`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      console.error('[DELETE_ALL] ❌ Erreur:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de supprimer tous les items',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  // Fonction pour échapper une valeur CSV selon RFC 4180 (adaptée pour point-virgule)
  const escapeCSVValue = (value: any): string => {
    if (value === null || value === undefined) {
      return '';
    }
    
    // Convertir en string
    const str = String(value);
    
    // Si la valeur contient des points-virgules, guillemets ou retours à la ligne, elle doit être entourée de guillemets
    if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r') || str.includes(',')) {
      // Échapper les guillemets en les doublant
      return `"${str.replace(/"/g, '""')}"`;
    }
    
    return str;
  };

  // Exporter en CSV (avec colonnes personnalisées)
  const exportToCSV = () => {
    const baseHeaders = ['ID Hex', 'Code-barres', 'Numéro de série', 'Nom', 'Marque', 'Modèle', 'Catégorie', 'Quantité', 'Description'];
    const customHeaders = customFields.map(f => f.name);
    const headers = [...baseHeaders, ...customHeaders];

    const rows = filteredItems.map((item) => {
      const baseRow = [
        item.hexId || item.itemId || '',
        item.barcode || item.scannedCode || '',
        item.serialNumber || '',
        item.name || '',
        item.brand || '',
        item.model || '',
        item.category || '',
        item.quantity || 0,
        item.categoryDetails || item.description || '',
      ];
      const customRow = customFields.map(f => {
        const value = item.customData?.[f.fieldKey];
        // Gérer différents types de valeurs
        if (value === null || value === undefined) return '';
        if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
      });
      return [...baseRow, ...customRow];
    });

    // Générer le contenu CSV avec échappement correct et séparateur point-virgule pour Excel
    const csvRows = [
      headers.map(escapeCSVValue).join(';'), // Point-virgule pour Excel français
      ...rows.map((row) => row.map(escapeCSVValue).join(';')),
    ];
    
    const csvContent = csvRows.join('\r\n'); // Utiliser \r\n pour compatibilité Windows/Excel
    
    // Ajouter BOM UTF-8 pour une meilleure compatibilité avec Excel
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `inventaire_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: 'Export réussi',
      description: `${filteredItems.length} item(s) exporté(s)`,
      status: 'success',
      duration: 2000,
      isClosable: true,
    });
  };

  // Obtenir la valeur d'un champ personnalisé
  const getCustomFieldValue = (item: Item, fieldKey: string) => {
    return item.customData?.[fieldKey] || '';
  };

  // Parser plusieurs numéros de série (séparés par virgules, points-virgules, ou sauts de ligne)
  const parseSerialNumbers = (value: string | null | undefined): string[] => {
    if (!value) return [];
    return value
      .split(/[,;\n\r]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  };

  // Formater plusieurs numéros de série pour l'affichage
  const formatSerialNumbers = (value: string | null | undefined): string => {
    const serials = parseSerialNumbers(value);
    if (serials.length === 0) return '-';
    if (serials.length === 1) return serials[0];
    return serials.join(', ');
  };

  // Obtenir toutes les images d'un item
  const getItemImages = (item: Item): string[] => {
    if (!item.image) return [];
    
    try {
      // Si c'est une string JSON
      if (typeof item.image === 'string') {
        // Essayer de parser comme JSON
        if (item.image.startsWith('[') || item.image.startsWith('{')) {
          const parsed = JSON.parse(item.image);
          if (Array.isArray(parsed)) {
            // Si c'est un tableau de strings
            if (parsed.length > 0 && typeof parsed[0] === 'string') {
              return parsed;
            }
            // Si c'est un tableau d'objets
            if (parsed.length > 0 && typeof parsed[0] === 'object') {
              return parsed.map((img: any) => img.url || img.src || '').filter(Boolean);
            }
          }
        } else if (item.image.startsWith('data:image') || item.image.startsWith('http') || item.image.startsWith('/api/images/')) {
          // Si c'est déjà une URL base64, http ou chemin API local (une seule image)
          return [item.image];
        }
      }
    } catch (e) {
      // Si le parsing échoue, retourner la string comme une seule image
      return [item.image as string];
    }
    
    return [];
  };

  // Ajouter une nouvelle colonne personnalisée
  const handleAddColumn = async () => {
    if (!newColumnName.trim()) {
      toast({
        title: 'Erreur',
        description: 'Veuillez entrer un nom de colonne',
        status: 'warning',
        duration: 2000,
        isClosable: true,
      });
      return;
    }

    setIsAddingColumn(true);
    try {
      // Générer une clé unique pour le champ
      const fieldKey = newColumnName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Supprimer les accents
        .replace(/[^a-z0-9]+/g, '_') // Remplacer les caractères spéciaux par _
        .replace(/^_+|_+$/g, ''); // Supprimer les _ au début et à la fin

      await createCustomField({
        name: newColumnName.trim(),
        fieldKey: fieldKey,
        fieldType: newColumnType,
        required: false,
        displayOrder: customFields.length,
      });

      toast({
        title: 'Succès',
        description: `Colonne "${newColumnName}" ajoutée`,
        status: 'success',
        duration: 2000,
        isClosable: true,
      });

      setNewColumnName('');
      setNewColumnType('text');
      
      // Recharger immédiatement les colonnes et items
      console.log('[COLUMN] ✅ Colonne créée, rechargement immédiat...');
      await loadCustomFields();
      await loadItems(); // Car les items contiennent les données custom
      console.log('[COLUMN] ✅ Affichage mis à jour!');
    } catch (error) {
      console.error('Erreur ajout colonne:', error);
      toast({
        title: 'Erreur',
        description: 'Erreur lors de l\'ajout de la colonne',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsAddingColumn(false);
    }
  };

  // Supprimer une colonne personnalisée
  const handleDeleteColumn = async (field: CustomField) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer la colonne "${field.name}" ? Les données de cette colonne seront perdues pour tous les items.`)) {
      return;
    }

    try {
      console.log('[COLUMN] 🗑️ Suppression de la colonne:', field.name);
      await deleteCustomField(field.id);
      
      // Recharger immédiatement
      console.log('[COLUMN] ✅ Colonne supprimée, rechargement immédiat...');
      await loadCustomFields();
      await loadItems();
      console.log('[COLUMN] ✅ Affichage mis à jour!');
      
      toast({
        title: 'Succès',
        description: `Colonne "${field.name}" supprimée`,
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
    } catch (error) {
      console.error('Erreur suppression colonne:', error);
      toast({
        title: 'Erreur',
        description: 'Erreur lors de la suppression de la colonne',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  // Nouvelles fonctions pour le ColumnManager
  const handleAddColumnNew = async (column: { 
    name: string; 
    fieldType: string; 
    options?: string[]; 
    required: boolean;
  }) => {
    await createCustomField(column);
    await loadCustomFields();
    await loadItems();
  };

  const handleUpdateColumn = async (id: number, updates: any) => {
    await updateCustomField(id, updates);
    await loadCustomFields();
    await loadItems();
  };

  const handleDeleteColumnNew = async (id: number) => {
    await deleteCustomField(id);
    await loadCustomFields();
    await loadItems();
  };

  // Fonction pour appliquer les filtres et tris
  const handleApplyFilters = () => {
    // Le useEffect se charge automatiquement de la mise à jour
    console.log('[FILTERS] Filtres appliqués:', advancedFilters);
    console.log('[SORTS] Tris appliqués:', advancedSorts);
  };

  // Ajouter une nouvelle catégorie
  const handleAddCategory = async () => {
    console.log('[CATEGORY DEBUG] ====================================');
    console.log('[CATEGORY DEBUG] Tentative d\'ajout de catégorie');
    console.log('[CATEGORY DEBUG] Nom:', newCategoryName);
    
    if (!newCategoryName.trim()) {
      console.log('[CATEGORY DEBUG] Nom vide, annulation');
      toast({
        title: 'Erreur',
        description: 'Veuillez entrer un nom de catégorie',
        status: 'warning',
        duration: 2000,
        isClosable: true,
      });
      return;
    }

    // Vérifier si la catégorie existe déjà
    const categoryExists = categories.some(
      cat => cat.toLowerCase() === newCategoryName.trim().toLowerCase()
    );
    
    if (categoryExists) {
      console.log('[CATEGORY DEBUG] Catégorie existe déjà');
      toast({
        title: 'Erreur',
        description: 'Cette catégorie existe déjà',
        status: 'warning',
        duration: 2000,
        isClosable: true,
      });
      return;
    }

    setIsAddingCategory(true);
    try {
      console.log('[CATEGORY DEBUG] Appel API createCategory...');
      await createCategory(newCategoryName.trim());
      console.log('[CATEGORY DEBUG] Catégorie créée avec succès');
      
      // Recharger immédiatement
      console.log('[CATEGORY DEBUG] Rechargement immédiat des catégories...');
      await loadCategories();
      console.log('[CATEGORY DEBUG] Affichage mis à jour!');
      
      toast({
        title: 'Succès',
        description: `Catégorie "${newCategoryName}" ajoutée et visible`,
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
      
      setNewCategoryName('');
    } catch (error) {
      console.error('[CATEGORY ERROR] Erreur ajout catégorie:', error);
      toast({
        title: 'Erreur',
        description: 'Erreur lors de l\'ajout de la catégorie',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsAddingCategory(false);
    }
    console.log('[CATEGORY DEBUG] ====================================');
  };

  // Supprimer une catégorie
  const handleDeleteCategory = async (categoryName: string) => {
    console.log('[CATEGORY DEBUG] ====================================');
    console.log('[CATEGORY DEBUG] Tentative de suppression de catégorie');
    console.log('[CATEGORY DEBUG] Nom:', categoryName);
    
    if (!confirm(`Êtes-vous sûr de vouloir supprimer la catégorie "${categoryName}" ?`)) {
      console.log('[CATEGORY DEBUG] Suppression annulée par l\'utilisateur');
      return;
    }

    setIsDeletingCategory(categoryName);
    try {
      console.log('[CATEGORY DEBUG] Appel API deleteCategory...');
      await deleteCategory(categoryName);
      console.log('[CATEGORY DEBUG] Catégorie supprimée avec succès');
      
      // Recharger immédiatement
      console.log('[CATEGORY DEBUG] Rechargement immédiat des catégories et items...');
      await loadCategories();
      await loadItems(); // Car les items peuvent avoir été mis à jour
      console.log('[CATEGORY DEBUG] Affichage mis à jour!');
      
      toast({
        title: 'Succès',
        description: `Catégorie "${categoryName}" supprimée`,
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
    } catch (error) {
      console.error('[CATEGORY ERROR] Erreur suppression catégorie:', error);
      toast({
        title: 'Erreur',
        description: 'Erreur lors de la suppression de la catégorie',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsDeletingCategory(null);
    }
    console.log('[CATEGORY DEBUG] ====================================');
  };

  // Handlers pour le drag and drop des colonnes
  const handleColumnDragStart = (e: React.DragEvent, columnKey: string) => {
    console.log('[DRAG] Début drag colonne:', columnKey);
    setDraggedColumn(columnKey);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', columnKey);
    
    // Style du curseur
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleColumnDragEnd = (e: React.DragEvent) => {
    console.log('[DRAG] Fin drag');
    setDraggedColumn(null);
    setDragOverColumn(null);
    
    // Réinitialiser le style
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  };

  const handleColumnDragOver = (e: React.DragEvent, columnKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (draggedColumn && draggedColumn !== columnKey) {
      setDragOverColumn(columnKey);
    }
  };

  const handleColumnDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleColumnDrop = (e: React.DragEvent, targetColumnKey: string) => {
    e.preventDefault();
    console.log('[DRAG] Drop colonne:', draggedColumn, '→', targetColumnKey);
    
    if (!draggedColumn || draggedColumn === targetColumnKey) {
      setDragOverColumn(null);
      return;
    }

    // Réorganiser les colonnes
    const newOrder = [...columnOrder];
    const draggedIndex = newOrder.indexOf(draggedColumn);
    const targetIndex = newOrder.indexOf(targetColumnKey);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      // Retirer la colonne de sa position actuelle
      newOrder.splice(draggedIndex, 1);
      // Insérer à la nouvelle position
      newOrder.splice(targetIndex, 0, draggedColumn);
      
      console.log('[DRAG] Nouvel ordre:', newOrder);
      setColumnOrder(newOrder);
      
      toast({
        title: '✅ Colonnes réorganisées',
        description: 'L\'ordre des colonnes a été sauvegardé',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
    }

    setDragOverColumn(null);
    setDraggedColumn(null);
  };

  // Tri au clic sur l'en-tête de colonne (réutilise advancedSorts / applyFiltersAndSorts)
  const getSortForColumn = (columnKey: string): 'asc' | 'desc' | null => {
    const rule = advancedSorts.find((s) => s.column === columnKey);
    return rule ? rule.direction : null;
  };

  const handleColumnSortClick = (columnKey: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const current = getSortForColumn(columnKey);
    let nextSorts: SortRule[];
    if (!current) {
      nextSorts = [{ column: columnKey, direction: 'asc' }];
    } else if (current === 'asc') {
      nextSorts = [{ column: columnKey, direction: 'desc' }];
    } else {
      nextSorts = [];
    }
    setAdvancedSorts(nextSorts);
  };

  // Fonctions de redimensionnement des colonnes
  const handleResizeStart = (e: React.MouseEvent, columnKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const th = (e.target as HTMLElement).closest('th');
    if (!th) return;
    
    const currentWidth = th.offsetWidth;
    
    setResizingColumn(columnKey);
    setResizeStartX(e.clientX);
    setResizeStartWidth(currentWidth);
    
    console.log('[RESIZE] Début resize:', columnKey, 'Largeur actuelle:', currentWidth);
    
    // Désactiver la sélection de texte pendant le resize
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    
    // Ajouter des écouteurs globaux
    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const diff = moveEvent.clientX - e.clientX;
      const newWidth = Math.max(80, currentWidth + diff); // Minimum 80px
      
      setColumnWidths(prev => ({
        ...prev,
        [columnKey]: newWidth
      }));
    };
    
    const handleMouseUp = () => {
      console.log('[RESIZE] Fin resize:', columnKey);
      setResizingColumn(null);
      
      // Restaurer le curseur et la sélection
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Définition des colonnes avec leur configuration
  const columnDefinitions: Record<string, { label: string; isNumeric?: boolean }> = {
    id: { label: 'ID' },
    barcode: { label: 'Code' },
    serialNumber: { label: 'N° Série' },
    name: { label: 'Nom' },
    image: { label: 'Image' },
    brand: { label: 'Marque' },
    model: { label: 'Modèle' },
    category: { label: 'Catégorie' },
    quantity: { label: 'Qté', isNumeric: true },
    status: { label: 'Statut' },
  };

  // Fonction pour rendre une cellule selon sa clé de colonne
  const renderCell = (item: Item, columnKey: string) => {
    const w = `${getColWidth(columnKey)}px`;
    const cellStyle = {
      width: w,
      minW: w,
      maxW: w,
    };
    
    switch (columnKey) {
      case 'id':
        return <Td key="id" fontSize="xs" fontFamily="mono" fontWeight="bold" color="purple.600" {...cellStyle}>{item.hexId || '-'}</Td>;
      
      case 'barcode':
        return (
          <Td key="barcode" fontSize="xs" fontFamily="mono" {...cellStyle}>
            {editingCell?.serialNumber === item.serialNumber &&
            editingCell?.field === 'barcode' && !editingCell?.isCustom ? (
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') saveEdit();
                }}
                size="xs"
                autoFocus
                fontFamily="mono"
              />
            ) : (
              <Box position="relative" _hover={{ '& > button': { opacity: 1 } }}>
                <Text pr="20px" fontSize="xs" fontFamily="mono">
                  {item.scannedCode || item.barcode || '-'}
                </Text>
                <IconButton
                  aria-label="Modifier le code"
                  icon={<Icon as={MdBrush} boxSize={3} />}
                  size="xs"
                  position="absolute"
                  top="0"
                  right="0"
                  variant="ghost"
                  colorScheme="gray"
                  opacity={0.3}
                  _hover={{ opacity: 1, color: 'blue.500' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(item.serialNumber, 'barcode', item.scannedCode || item.barcode || '');
                  }}
                  h="16px"
                  minW="16px"
                />
              </Box>
            )}
          </Td>
        );
      
      case 'serialNumber':
        return (
          <Td key="serialNumber" fontSize="xs" fontFamily="mono" {...cellStyle}>
            {editingCell?.serialNumber === item.serialNumber &&
            editingCell?.field === 'serialNumber' && !editingCell?.isCustom ? (
              <Textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={saveEdit}
                size="xs"
                autoFocus
                fontFamily="mono"
                minH="60px"
                placeholder="Entrez un ou plusieurs n° de série (un par ligne)"
              />
            ) : (
              <Box position="relative" _hover={{ '& > button': { opacity: 1 } }}>
                {item.serialNumber.includes(',') ? (
                  <VStack align="start" spacing={0}>
                    {item.serialNumber.split(',').map((sn, i) => (
                      <Text key={i} fontSize="xs" fontFamily="mono">{sn.trim()}</Text>
                    ))}
                  </VStack>
                ) : (
                  <Text pr="20px" fontSize="xs" fontFamily="mono">{item.serialNumber}</Text>
                )}
                <IconButton
                  aria-label="Modifier le n° série"
                  icon={<Icon as={MdBrush} boxSize={3} />}
                  size="xs"
                  position="absolute"
                  top="0"
                  right="0"
                  variant="ghost"
                  colorScheme="gray"
                  opacity={0.3}
                  _hover={{ opacity: 1, color: 'blue.500' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(item.serialNumber, 'serialNumber', item.serialNumber);
                  }}
                  h="16px"
                  minW="16px"
                />
              </Box>
            )}
          </Td>
        );
      
      case 'name':
        return (
          <Td key="name" fontSize="xs" {...cellStyle}>
            {editingCell?.serialNumber === item.serialNumber &&
            editingCell?.field === 'name' && !editingCell?.isCustom ? (
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') saveEdit();
                }}
                size="xs"
                autoFocus
              />
            ) : (
              <Box position="relative" _hover={{ '& > button': { opacity: 1 } }}>
                <Text pr="20px" fontSize="xs">{item.name}</Text>
                <IconButton
                  aria-label="Modifier le nom"
                  icon={<Icon as={MdBrush} boxSize={3} />}
                  size="xs"
                  position="absolute"
                  top="0"
                  right="0"
                  variant="ghost"
                  colorScheme="gray"
                  opacity={0.3}
                  _hover={{ opacity: 1, color: 'blue.500' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(item.serialNumber, 'name', item.name);
                  }}
                  h="16px"
                  minW="16px"
                />
              </Box>
            )}
          </Td>
        );
      
      case 'image':
        // Code de la cellule image (complexe avec plusieurs images)
        const images: string[] = [];
        if (item.image) {
          if (Array.isArray(item.image)) {
            images.push(...item.image);
          } else if (typeof item.image === 'string') {
            if (item.image.startsWith('[') && item.image.endsWith(']')) {
              try {
                const parsed = JSON.parse(item.image);
                if (Array.isArray(parsed)) images.push(...parsed);
                else images.push(item.image);
              } catch {
                images.push(item.image);
              }
            } else {
              images.push(item.image);
            }
          }
        }
        
        return (
          <Td key="image" {...cellStyle}>
            {images.length > 0 ? (
              <HStack spacing={1} flexWrap="wrap" align="flex-start" maxW="220px">
                {images.map((imgSrc, idx) => (
                  <Box
                    key={idx}
                    position="relative"
                    w="40px"
                    h="40px"
                    borderRadius="md"
                    overflow="hidden"
                    border="1px solid"
                    borderColor="gray.200"
                    cursor="pointer"
                    onClick={() => {
                      setSelectedItemImages(images);
                      setSelectedImageIndex(idx);
                      onImageModalOpen();
                    }}
                    _hover={{
                      transform: 'scale(1.05)',
                      borderColor: 'blue.400',
                      boxShadow: 'md',
                    }}
                    transition="all 0.2s"
                  >
                    <Image src={imgSrc} alt={`Image ${idx + 1}`} w="100%" h="100%" objectFit="cover" />
                    {images.length > 1 && (
                      <Badge
                        position="absolute"
                        top="2px"
                        right="2px"
                        fontSize="xx-small"
                        colorScheme="blue"
                      >
                        {idx + 1}/{images.length}
                      </Badge>
                    )}
                  </Box>
                ))}
              </HStack>
            ) : (
              <Box
                w="40px"
                h="40px"
                borderRadius="md"
                bg="gray.100"
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                <Icon as={MdPhotoLibrary} color="gray.400" />
              </Box>
            )}
          </Td>
        );
      
      case 'category':
        return (
          <Td key="category" fontSize="xs" {...cellStyle}>
            {editingCell?.serialNumber === item.serialNumber &&
            editingCell?.field === 'category' && !editingCell?.isCustom ? (
              <Select
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={saveEdit}
                size="xs"
                autoFocus
              >
                <option value="">-- Sélectionner --</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </Select>
            ) : (
              <Box position="relative" _hover={{ '& > button': { opacity: 1 } }}>
                <Text pr="20px" fontSize="xs">{item.category || '-'}</Text>
                <IconButton
                  aria-label="Modifier la catégorie"
                  icon={<Icon as={MdBrush} boxSize={3} />}
                  size="xs"
                  position="absolute"
                  top="0"
                  right="0"
                  variant="ghost"
                  colorScheme="gray"
                  opacity={0.3}
                  _hover={{ opacity: 1, color: 'blue.500' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(item.serialNumber, 'category', item.category || '');
                  }}
                  h="16px"
                  minW="16px"
                />
              </Box>
            )}
          </Td>
        );
      
      case 'brand':
      case 'model':
        return (
          <Td key={columnKey} fontSize="xs" {...cellStyle}>
            {editingCell?.serialNumber === item.serialNumber &&
            editingCell?.field === columnKey && !editingCell?.isCustom ? (
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') saveEdit();
                }}
                size="xs"
                autoFocus
              />
            ) : (
              <Box position="relative" _hover={{ '& > button': { opacity: 1 } }}>
                <Text pr="20px" fontSize="xs">{(item as any)[columnKey] || '-'}</Text>
                <IconButton
                  aria-label={`Modifier ${columnKey}`}
                  icon={<Icon as={MdBrush} boxSize={3} />}
                  size="xs"
                  position="absolute"
                  top="0"
                  right="0"
                  variant="ghost"
                  colorScheme="gray"
                  opacity={0.3}
                  _hover={{ opacity: 1, color: 'blue.500' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(item.serialNumber, columnKey, (item as any)[columnKey] || '');
                  }}
                  h="16px"
                  minW="16px"
                />
              </Box>
            )}
          </Td>
        );
      
      case 'quantity':
        return (
          <Td key="quantity" isNumeric {...cellStyle}>
            {editingCell?.serialNumber === item.serialNumber &&
            editingCell?.field === 'quantity' && !editingCell?.isCustom ? (
              <NumberInput
                value={editValue}
                onChange={(valueString) => setEditValue(valueString)}
                onBlur={saveEdit}
                size="xs"
                min={0}
              >
                <NumberInputField autoFocus onKeyPress={(e) => {
                  if (e.key === 'Enter') saveEdit();
                }} />
                <NumberInputStepper>
                  <NumberIncrementStepper />
                  <NumberDecrementStepper />
                </NumberInputStepper>
              </NumberInput>
            ) : (
              <Box position="relative" _hover={{ '& > button': { opacity: 1 } }}>
                <Text pr="20px">{item.quantity}</Text>
                <IconButton
                  aria-label="Modifier la quantité"
                  icon={<Icon as={MdBrush} boxSize={3} />}
                  size="xs"
                  position="absolute"
                  top="0"
                  right="0"
                  variant="ghost"
                  colorScheme="gray"
                  opacity={0.3}
                  _hover={{ opacity: 1, color: 'blue.500' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(item.serialNumber, 'quantity', item.quantity.toString());
                  }}
                  h="16px"
                  minW="16px"
                />
              </Box>
            )}
          </Td>
        );
      
      case 'status': {
        const currentStatus = item.status || 'en_stock';

        return (
          <Td key="status" {...cellStyle}>
            <Select
              size="sm"
              value={currentStatus}
              onChange={async (e) => {
                const value = e.target.value;
                if (value === '__add__') {
                  const label = window.prompt('Nouveau statut :');
                  if (label) {
                    const newValue = addCustomStatus(label);
                    if (newValue) {
                      try {
                        await updateItem(item.serialNumber, { status: newValue });
                        await loadItems();
                        toast({ title: 'Statut ajouté et appliqué', status: 'success', duration: 2000 });
                      } catch (err) {
                        toast({ title: 'Erreur', status: 'error', duration: 3000 });
                      }
                    }
                  }
                  return;
                }
                try {
                  await updateItem(item.serialNumber, { status: value });
                  await loadItems();
                } catch (err) {
                  toast({ title: 'Erreur mise à jour statut', status: 'error', duration: 3000 });
                }
              }}
              borderColor="gray.200"
              _hover={{ borderColor: 'gray.300' }}
              maxW="160px"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
              <option value="__add__">➕ Ajouter un statut...</option>
            </Select>
          </Td>
        );
      }
      
      default:
        return <Td key={columnKey} {...cellStyle}>-</Td>;
    }
  };

  // Nombre total de colonnes pour le colspan
  const totalColumns = columnOrder.length + customFields.length + 1; // +1 pour Actions

  // Colonnes disponibles pour le mapping
  const availableColumns = [
    { key: '', label: '-- Ne pas importer --' },
    { key: 'name', label: 'Nom', required: true },
    { key: 'serialNumber', label: 'Numéro de série', required: true },
    { key: 'scannedCode', label: 'Code-barres' },
    { key: 'brand', label: 'Marque' },
    { key: 'model', label: 'Modèle' },
    { key: 'category', label: 'Catégorie' },
    { key: 'quantity', label: 'Quantité' },
    { key: 'categoryDetails', label: 'Description' },
    { key: 'itemType', label: 'Type' },
    ...customFields.map(f => ({ key: `custom_${f.fieldKey}`, label: `[Perso] ${f.name}` })),
  ];

  // Parser le CSV
  const parseCSV = (text: string): string[][] => {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    return lines.map(line => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if ((char === ',' || char === ';') && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    });
  };

  // Trouver les en-têtes de colonnes en cherchant la première valeur non vide
  const detectColumnHeaders = (parsed: string[][]): string[] => {
    if (parsed.length === 0) return [];
    
    const numColumns = Math.max(...parsed.map(row => row.length));
    const headers: string[] = [];
    
    // Pour chaque colonne, chercher la première valeur non vide
    for (let colIndex = 0; colIndex < numColumns; colIndex++) {
      let headerFound = false;
      
      // Parcourir les lignes jusqu'à trouver une valeur non vide
      for (let rowIndex = 0; rowIndex < parsed.length; rowIndex++) {
        const cellValue = parsed[rowIndex][colIndex]?.trim() || '';
        
        if (cellValue !== '') {
          headers[colIndex] = cellValue;
          headerFound = true;
          break;
        }
      }
      
      // Si aucune valeur trouvée, utiliser un nom par défaut
      if (!headerFound) {
        headers[colIndex] = `Colonne ${colIndex + 1}`;
      }
    }
    
    return headers;
  };

  // Trouver la première ligne de données (après les en-têtes)
  const findDataStartRow = (parsed: string[][], headers: string[]): number => {
    if (parsed.length === 0) return 0;
    
    // Trouver la première ligne qui contient les en-têtes
    let headerRow = -1;
    for (let rowIndex = 0; rowIndex < Math.min(5, parsed.length); rowIndex++) {
      const row = parsed[rowIndex];
      
      // Vérifier si cette ligne contient au moins 2 en-têtes (pour être sûr)
      const headerMatches = headers.filter((header, colIndex) => {
        const cellValue = row[colIndex]?.trim() || '';
        return cellValue === header && header !== '' && !header.startsWith('Colonne ');
      }).length;
      
      if (headerMatches >= 2) {
        headerRow = rowIndex;
        break;
      }
    }
    
    // Si aucun en-tête n'est trouvé, supposer que les données commencent à la ligne 1 (pas d'en-tête)
    if (headerRow === -1) {
      console.log('[CSV] Aucun en-tête trouvé, les données commencent à la ligne 0');
      return 0;
    }
    
    // Les données commencent après la ligne d'en-tête
    const dataStart = headerRow + 1;
    console.log('[CSV] En-tête trouvé à la ligne', headerRow, '→ données commencent à la ligne', dataStart);
    return dataStart;
  };

  // Gérer la sélection du fichier CSV
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      
      if (parsed.length < 1) {
        toast({
          title: 'Erreur',
          description: 'Le fichier CSV est vide',
          status: 'error',
          duration: 3000,
          isClosable: true,
        });
        return;
      }

      // Détecter les en-têtes en cherchant la première valeur non vide pour chaque colonne
      const detectedHeaders = detectColumnHeaders(parsed);
      
      // Trouver où commencent les données
      const dataStartRow = findDataStartRow(parsed, detectedHeaders);
      
      const dataRows = parsed.slice(dataStartRow);
      
      console.log('[CSV IMPORT] Lignes parsées:', parsed.length);
      console.log('[CSV IMPORT] En-têtes détectés:', detectedHeaders);
      console.log('[CSV IMPORT] Début des données à la ligne:', dataStartRow);
      console.log('[CSV IMPORT] Nombre de lignes de données:', dataRows.length);
      console.log('[CSV IMPORT] Premières lignes:', dataRows.slice(0, 3));
      
      // Auto-mapping intelligent basé sur les en-têtes détectés
      const autoMapping: Record<string, string> = {};
      detectedHeaders.forEach((header, index) => {
        const headerLower = header.toLowerCase().trim();
        if (headerLower.includes('nom') || headerLower === 'name') {
          autoMapping[index.toString()] = 'name';
        } else if (headerLower.includes('série') || headerLower.includes('serial')) {
          autoMapping[index.toString()] = 'serialNumber';
        } else if (headerLower.includes('code') || headerLower.includes('barcode') || headerLower.includes('ean') || headerLower.includes('gtin')) {
          autoMapping[index.toString()] = 'scannedCode';
        } else if (headerLower.includes('marque') || headerLower === 'brand') {
          autoMapping[index.toString()] = 'brand';
        } else if (headerLower.includes('modèle') || headerLower.includes('model')) {
          autoMapping[index.toString()] = 'model';
        } else if (headerLower.includes('catégorie') || headerLower.includes('category')) {
          autoMapping[index.toString()] = 'category';
        } else if (headerLower.includes('quantité') || headerLower.includes('qty') || headerLower === 'quantity') {
          autoMapping[index.toString()] = 'quantity';
        } else if (headerLower.includes('description') || headerLower.includes('détails')) {
          autoMapping[index.toString()] = 'categoryDetails';
        } else if (headerLower.includes('type')) {
          autoMapping[index.toString()] = 'itemType';
        }
      });

      // Stocker dans la ref pour affichage immédiat dans le modal (avant que le state soit à jour)
      csvParsedRef.current = { headers: detectedHeaders, data: dataRows, mapping: autoMapping };
      setCsvHeaders(detectedHeaders);
      setCsvData(dataRows);
      setColumnMapping(autoMapping);

      toast({
        title: 'CSV analysé',
        description: `${detectedHeaders.length} colonnes détectées, ${dataRows.length} lignes de données`,
        status: 'info',
        duration: 2000,
        isClosable: true,
      });
      // Le modal est déjà ouvert, pas besoin d'appeler onImportOpen()
    };
    reader.onerror = () => {
      toast({
        title: 'Erreur',
        description: 'Impossible de lire le fichier',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    };
    reader.readAsText(file, 'UTF-8');
    
    // Reset l'input pour permettre de re-sélectionner le même fichier
    event.target.value = '';
  };

  // Suivi ouverture/fermeture du modal (pour sync ref -> state)
  useEffect(() => {
    wasImportOpenRef.current = isImportOpen;
  }, [isImportOpen]);

  // Quand un fichier vient d'être parsé, synchroniser le state depuis la ref si besoin
  useEffect(() => {
    if (isImportOpen && csvParsedRef.current && csvHeaders.length === 0) {
      const p = csvParsedRef.current;
      setCsvHeaders(p.headers);
      setCsvData(p.data);
      setColumnMapping(p.mapping);
    }
  }, [isImportOpen, csvHeaders.length]);

  // À la fermeture du modal, vider la ref
  useEffect(() => {
    if (!isImportOpen) {
      csvParsedRef.current = null;
    }
  }, [isImportOpen]);

  // Mettre à jour le mapping d'une colonne
  const updateColumnMapping = (csvIndex: string, inventoryField: string) => {
    setColumnMapping(prev => ({
      ...prev,
      [csvIndex]: inventoryField,
    }));
  };

  // Importer les données
  const handleImport = async () => {
    // Vérifier que les champs obligatoires sont mappés
    const mappedFields = Object.values(columnMapping);
    if (!mappedFields.includes('name')) {
      toast({
        title: 'Erreur',
        description: 'Le champ "Nom" est obligatoire',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    if (!mappedFields.includes('serialNumber')) {
      toast({
        title: 'Erreur',
        description: 'Le champ "Numéro de série" est obligatoire',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: csvData.length, errors: 0 });

    console.log('[IMPORT] Début import de', csvData.length, 'lignes');
    console.log('[IMPORT] Mapping:', columnMapping);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      console.log(`[IMPORT] Ligne ${i + 1}/${csvData.length}:`, row);
      
      try {
        const itemData: Partial<Item> = {};
        const customData: Record<string, any> = {};

        // Construire l'item à partir du mapping
        Object.entries(columnMapping).forEach(([csvIndex, inventoryField]) => {
          if (!inventoryField) return;
          
          const value = row[parseInt(csvIndex)] || '';
          
          if (inventoryField.startsWith('custom_')) {
            const customKey = inventoryField.replace('custom_', '');
            customData[customKey] = value;
          } else if (inventoryField === 'quantity') {
            itemData[inventoryField] = parseInt(value) || 1;
          } else if (value.trim()) {
            // N'assigner que si la valeur n'est pas vide
            (itemData as any)[inventoryField] = value.trim();
          }
        });

        // Ajouter les champs personnalisés
        if (Object.keys(customData).length > 0) {
          itemData.customData = customData;
        }

        // Générer un numéro de série si vide
        if (!itemData.serialNumber || !itemData.serialNumber.trim()) {
          itemData.serialNumber = `IMP-${Date.now()}-${i}`;
        }

        // Générer un nom si vide (en utilisant d'autres champs disponibles)
        if (!itemData.name || !itemData.name.trim()) {
          if (itemData.brand && itemData.model) {
            itemData.name = `${itemData.brand} ${itemData.model}`;
          } else if (itemData.brand) {
            itemData.name = itemData.brand;
          } else if (itemData.model) {
            itemData.name = itemData.model;
          } else if (itemData.scannedCode) {
            itemData.name = `Produit ${itemData.scannedCode}`;
          } else {
            itemData.name = `Article ${itemData.serialNumber}`;
          }
        }

        // Vérifier que les données sont valides avant d'importer
        if (!itemData.name || !itemData.serialNumber) {
          console.warn(`[IMPORT] Ligne ${i + 1} ignorée: nom ou numéro de série manquant`, itemData);
          errorCount++;
          continue;
        }

        console.log(`[IMPORT] Création de l'item:`, itemData);
        // Créer l'item
        await saveItem(itemData);
        successCount++;
        console.log(`[IMPORT] ✓ Item ${i + 1} créé avec succès`);
      } catch (error) {
        console.error(`[IMPORT] ✗ Erreur import ligne ${i + 1}:`, error);
        errorCount++;
      }

      setImportProgress({ current: i + 1, total: csvData.length, errors: errorCount });
    }
    
    console.log('[IMPORT] Terminé:', successCount, 'succès,', errorCount, 'erreurs');

    setIsImporting(false);
    
    // Recharger immédiatement les données pour voir les nouveaux items
    console.log('[IMPORT] ✅ Import terminé, rechargement immédiat...');
    await loadItems();
    console.log('[IMPORT] ✅ Affichage mis à jour!');
    
    onImportClose();
    
    toast({
      title: '✅ Import terminé',
      description: `${successCount} items importés et visibles${errorCount > 0 ? `, ${errorCount} erreurs` : ''}`,
      status: errorCount > 0 ? 'warning' : 'success',
      duration: 5000,
      isClosable: true,
    });
    
    // Reset
    setCsvData([]);
    setCsvHeaders([]);
    setColumnMapping({});
  };

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      <Card mb="20px">
        <VStack spacing={4} align="stretch">
          {/* Filtres */}
          <Flex gap={4} wrap="wrap" align="center">
            {/* Barre de recherche globale */}
            <Tooltip 
              label="Recherche dans tous les champs : nom, code-barres, numéro de série, marque, modèle, catégorie, description et champs personnalisés"
              placement="bottom-start"
              hasArrow
            >
              <InputGroup maxW={{ base: '100%', md: '400px' }} flex={{ base: '1', md: 'initial' }}>
                <InputLeftElement pointerEvents="none">
                  <Icon as={MdSearch} color="gray.400" />
                </InputLeftElement>
                <Input
                  placeholder="Rechercher dans tous les champs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  bg={useColorModeValue('white', 'navy.800')}
                  border="1px solid"
                  borderColor={useColorModeValue('gray.200', 'whiteAlpha.100')}
                  _focus={{
                    borderColor: useColorModeValue('brand.500', 'brand.400'),
                    boxShadow: '0 0 0 1px ' + useColorModeValue('brand.500', 'brand.400'),
                  }}
                  _hover={{
                    borderColor: useColorModeValue('gray.300', 'whiteAlpha.200'),
                  }}
                />
                {searchTerm && (
                  <InputRightElement>
                    <IconButton
                      aria-label="Effacer la recherche"
                      icon={<Icon as={MdClose} />}
                      size="sm"
                      variant="ghost"
                      onClick={() => setSearchTerm('')}
                    />
                  </InputRightElement>
                )}
              </InputGroup>
            </Tooltip>

            <HStack spacing={2}>
              <Select
                placeholder="Toutes les catégories"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                w="200px"
              >
                {categories.map((cat, index) => (
                  <option key={`${cat}-${index}`} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1).replace('_', ' ')}
                  </option>
                ))}
              </Select>
              <Tooltip label="Gérer les catégories">
                <IconButton
                  aria-label="Gérer les catégories"
                  icon={<Icon as={MdEdit} />}
                  size="md"
                  variant="outline"
                  onClick={(e) => {
                    console.log('[CATEGORY DEBUG] Ouverture modal catégories');
                    onCategoryModalOpen();
                  }}
                />
              </Tooltip>
            </HStack>

            {/* Indicateur de résultats */}
            {searchTerm && (
              <Badge 
                colorScheme={filteredItems.length > 0 ? 'green' : 'red'} 
                fontSize="xs"
                px={3}
                py={1}
                borderRadius="md"
              >
                {filteredItems.length} résultat{filteredItems.length > 1 ? 's' : ''} trouvé{filteredItems.length > 1 ? 's' : ''}
              </Badge>
            )}

            <HStack spacing={2} flexWrap="wrap">
              <Button
                leftIcon={<Icon as={MdViewColumn} />}
                onClick={onColumnModalOpen}
                colorScheme="purple"
              >
                Gérer les colonnes
              </Button>
              
              {/* Nouveau composant de filtres avancés */}
              <AdvancedFilters
                columns={customFields}
                standardColumns={[
                  { key: 'name', label: 'Nom', type: 'text' },
                  { key: 'serialNumber', label: 'Numéro de série', type: 'text' },
                  { key: 'brand', label: 'Marque', type: 'text' },
                  { key: 'model', label: 'Modèle', type: 'text' },
                  { key: 'category', label: 'Catégorie', type: 'select', options: categories },
                  { key: 'quantity', label: 'Quantité', type: 'number' },
                  { key: 'status', label: 'Statut', type: 'select', options: [...DEFAULT_STATUS_OPTIONS.map(s => s.value), ...customStatuses] },
                ]}
                filters={advancedFilters}
                sorts={advancedSorts}
                onFiltersChange={setAdvancedFilters}
                onSortsChange={setAdvancedSorts}
                onApply={handleApplyFilters}
              />

              <Button
                leftIcon={<Icon as={MdUpload} />}
                onClick={exportToCSV}
                variant="outline"
              >
                Exporter
              </Button>
              <Button
                leftIcon={<Icon as={MdDownload} />}
                colorScheme="green"
                onClick={(e) => {
                  console.log('[DEBUG] ====================================');
                  console.log('[DEBUG] Bouton "Importer CSV" cliqué!');
                  console.log('[DEBUG] Event:', e);
                  console.log('[DEBUG] isImportOpen avant:', isImportOpen);
                  console.log('[DEBUG] onImportOpen function:', onImportOpen);
                  try {
                    setCsvHeaders([]);
                    setCsvData([]);
                    setColumnMapping({});
                    csvParsedRef.current = null;
                    console.log('[DEBUG] States réinitialisés');
                    onImportOpen();
                    console.log('[DEBUG] onImportOpen() appelé avec succès');
                    setTimeout(() => {
                      console.log('[DEBUG] isImportOpen après 100ms:', isImportOpen);
                    }, 100);
                  } catch (error) {
                    console.error('[ERROR] Erreur lors de onImportOpen():', error);
                  }
                  console.log('[DEBUG] ====================================');
                }}
              >
                Importer CSV
              </Button>

              
              {/* Bouton Tout supprimer - Discret */}
              <IconButton
                aria-label="Tout supprimer"
                icon={<Icon as={MdDeleteSweep} />}
                size="sm"
                variant="ghost"
                colorScheme="red"
                opacity={0.4}
                _hover={{ opacity: 1, bg: 'red.50' }}
                onClick={() => {
                  if (window.confirm('⚠️ ATTENTION ⚠️\n\nVoulez-vous vraiment supprimer TOUS les articles de l\'inventaire?\n\nCette action est IRRÉVERSIBLE et supprimera:\n- Tous les articles\n- Toutes les images\n- Toutes les données personnalisées\n\nÊtes-vous absolument certain(e)?')) {
                    if (window.confirm('🚨 DERNIÈRE CONFIRMATION 🚨\n\nCeci est votre dernière chance!\n\nCliquez sur OK pour TOUT SUPPRIMER définitivement.')) {
                      handleDeleteAll();
                    }
                  }
                }}
              />
            </HStack>
          </Flex>


          {/* Conteneur extérieur : scroll horizontal toujours visible en bas */}
          <Box
            className="inventory-table-scroll"
            maxH="calc(100vh - 280px)"
            minH="320px"
            overflow="auto"
            borderWidth="1px"
            borderRadius="md"
            borderColor={useColorModeValue('gray.200', 'whiteAlpha.200')}
            bg={useColorModeValue('gray.50', 'navy.900')}
          >
              <Table
              variant="simple"
              size="sm"
              sx={{
                '& th, & td': {
                  borderRight: '1px solid',
                  borderColor: 'gray.200',
                  position: 'relative',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  py: 1,
                  px: 2,
                },
                '& th:last-child, & td:last-child': {
                  borderRight: 'none'
                }
              }}
            >
              <Thead>
                <Tr>
                  {/* Colonne hiérarchie/drag (toujours visible) */}
                  <Th width="50px" minW="50px" maxW="50px" p={1}>
                    <Tooltip label="Glissez les lignes pour créer des sous-items">
                      <Box>
                        <Icon as={MdAccountTree} color="gray.400" boxSize={4} />
                      </Box>
                    </Tooltip>
                  </Th>
                  
                  {/* Colonnes standards réorganisables */}
                  {columnOrder.map((columnKey) => {
                    const colDef = columnDefinitions[columnKey];
                    if (!colDef) return null;
                    
                    return (
                      <Th
                        key={columnKey}
                        isNumeric={colDef.isNumeric}
                        draggable={!resizingColumn}
                        onDragStart={(e) => handleColumnDragStart(e, columnKey)}
                        onDragEnd={handleColumnDragEnd}
                        onDragOver={(e) => handleColumnDragOver(e, columnKey)}
                        onDragLeave={handleColumnDragLeave}
                        onDrop={(e) => handleColumnDrop(e, columnKey)}
                        cursor={resizingColumn ? 'col-resize' : 'grab'}
                        position="relative"
                        bg={dragOverColumn === columnKey ? 'blue.50' : undefined}
                        borderLeft={dragOverColumn === columnKey ? '3px solid' : undefined}
                        borderColor={dragOverColumn === columnKey ? 'blue.500' : undefined}
                        transition="all 0.2s"
                        _hover={{ bg: 'gray.50' }}
                        _active={{ cursor: resizingColumn ? 'col-resize' : 'grabbing' }}
                        width={`${getColWidth(columnKey)}px`}
                        minW={`${getColWidth(columnKey)}px`}
                        maxW={`${getColWidth(columnKey)}px`}
                        userSelect={resizingColumn === columnKey ? 'none' : undefined}
                      >
                        <HStack spacing={1} justify="space-between" pr="10px">
                          <HStack spacing={1} flex={1}>
                            <Icon
                              as={MdDragIndicator}
                              color="gray.400"
                              cursor="grab"
                              _hover={{ color: 'gray.600' }}
                            />
                            <Box
                              as="button"
                              type="button"
                              onClick={(e: React.MouseEvent) => handleColumnSortClick(columnKey, e)}
                              display="flex"
                              alignItems="center"
                              gap={1}
                              cursor="pointer"
                              _hover={{ color: 'brand.500' }}
                              title={getSortForColumn(columnKey) ? `Tri: ${getSortForColumn(columnKey) === 'asc' ? 'A→Z' : 'Z→A'} (cliquer pour changer)` : 'Cliquer pour trier'}
                            >
                              <Text>{colDef.label}</Text>
                              {getSortForColumn(columnKey) === 'asc' && <Icon as={MdArrowUpward} boxSize={3} color="brand.500" />}
                              {getSortForColumn(columnKey) === 'desc' && <Icon as={MdArrowDownward} boxSize={3} color="brand.500" />}
                              {!getSortForColumn(columnKey) && <Icon as={MdSort} boxSize={3} color="gray.400" />}
                            </Box>
                          </HStack>
                        </HStack>
                        
                        {/* Poignée de redimensionnement - zone plus large */}
                        <Box
                          position="absolute"
                          right="-5px"
                          top="0"
                          bottom="0"
                          width="10px"
                          cursor="col-resize"
                          bg="transparent"
                          _hover={{ 
                            '&::after': {
                              content: '""',
                              position: 'absolute',
                              right: '4px',
                              top: '0',
                              bottom: '0',
                              width: '2px',
                              bg: 'blue.400'
                            }
                          }}
                          sx={{
                            '&::after': resizingColumn === columnKey ? {
                              content: '""',
                              position: 'absolute',
                              right: '4px',
                              top: '0',
                              bottom: '0',
                              width: '2px',
                              bg: 'blue.500'
                            } : undefined
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleResizeStart(e, columnKey);
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          zIndex={3}
                        />
                      </Th>
                    );
                  })}
                  
                  {/* Colonnes personnalisées (non réorganisables pour l'instant) */}
                  {customFields.map((field) => (
                    <Th 
                      key={field.id}
                      position="relative"
                      width={`${getColWidth(`custom_${field.fieldKey}`)}px`}
                      minW={`${getColWidth(`custom_${field.fieldKey}`)}px`}
                      maxW={`${getColWidth(`custom_${field.fieldKey}`)}px`}
                      userSelect={resizingColumn === `custom_${field.fieldKey}` ? 'none' : undefined}
                    >
                      <HStack spacing={1} justify="space-between" pr="10px">
                        <HStack spacing={1} flex={1}>
                          <Box
                            as="button"
                            type="button"
                            onClick={(e: React.MouseEvent) => handleColumnSortClick(field.fieldKey, e)}
                            display="flex"
                            alignItems="center"
                            gap={1}
                            cursor="pointer"
                            _hover={{ color: 'brand.500' }}
                            title={getSortForColumn(field.fieldKey) ? `Tri: ${getSortForColumn(field.fieldKey) === 'asc' ? 'A→Z' : 'Z→A'}` : 'Cliquer pour trier'}
                          >
                            <Text>{field.name}</Text>
                            {getSortForColumn(field.fieldKey) === 'asc' && <Icon as={MdArrowUpward} boxSize={3} color="brand.500" />}
                            {getSortForColumn(field.fieldKey) === 'desc' && <Icon as={MdArrowDownward} boxSize={3} color="brand.500" />}
                            {!getSortForColumn(field.fieldKey) && <Icon as={MdSort} boxSize={3} color="gray.400" />}
                          </Box>
                          <Badge size="sm" colorScheme="purple" fontSize="xx-small">
                            {FIELD_TYPE_LABELS[field.fieldType] || field.fieldType}
                          </Badge>
                        </HStack>
                      </HStack>
                      
                      {/* Poignée de redimensionnement - zone plus large */}
                      <Box
                        position="absolute"
                        right="-5px"
                        top="0"
                        bottom="0"
                        width="10px"
                        cursor="col-resize"
                        bg="transparent"
                        _hover={{ 
                          '&::after': {
                            content: '""',
                            position: 'absolute',
                            right: '4px',
                            top: '0',
                            bottom: '0',
                            width: '2px',
                            bg: 'blue.400'
                          }
                        }}
                        sx={{
                          '&::after': resizingColumn === `custom_${field.fieldKey}` ? {
                            content: '""',
                            position: 'absolute',
                            right: '4px',
                            top: '0',
                            bottom: '0',
                            width: '2px',
                            bg: 'blue.500'
                          } : undefined
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleResizeStart(e, `custom_${field.fieldKey}`);
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        zIndex={3}
                      />
                    </Th>
                  ))}
                  
                  {/* Colonne Actions (fixe) */}
                  <Th
                    position="relative"
                    width={`${getColWidth('actions')}px`}
                    minW={`${getColWidth('actions')}px`}
                    maxW={`${getColWidth('actions')}px`}
                    userSelect={resizingColumn === 'actions' ? 'none' : undefined}
                  >
                    <HStack spacing={1} justify="space-between" pr="10px">
                      <Text flex={1}>Actions</Text>
                    </HStack>
                    
                    {/* Poignée de redimensionnement - zone plus large */}
                    <Box
                      position="absolute"
                      right="-5px"
                      top="0"
                      bottom="0"
                      width="10px"
                      cursor="col-resize"
                      bg="transparent"
                      _hover={{ 
                        '&::after': {
                          content: '""',
                          position: 'absolute',
                          right: '4px',
                          top: '0',
                          bottom: '0',
                          width: '2px',
                          bg: 'blue.400'
                        }
                      }}
                      sx={{
                        '&::after': resizingColumn === 'actions' ? {
                          content: '""',
                          position: 'absolute',
                          right: '4px',
                          top: '0',
                          bottom: '0',
                          width: '2px',
                          bg: 'blue.500'
                        } : undefined
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleResizeStart(e, 'actions');
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      zIndex={3}
                    />
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {loading ? (
                  <Tr>
                    <Td colSpan={totalColumns} textAlign="center">
                      Chargement...
                    </Td>
                  </Tr>
                ) : paginatedItems.length === 0 ? (
                  <Tr>
                    <Td colSpan={totalColumns} textAlign="center">
                      Aucun item trouvé
                    </Td>
                  </Tr>
                ) : (
                  paginatedItems.map((item, index) => {
                    const level = (item as any).level || 0;
                    const hasItemChildren = hierarchy.hasChildren(item.id!);
                    const isDropTarget = hierarchy.dropTargetId === item.id;
                    const isDragging = hierarchy.draggedItem?.id === item.id;
                    const isSearchMatch = searchTerm && item.id ? matchedItemIds.has(item.id) : false;

                    return (
                        <HierarchicalInventoryRow
                          key={item.serialNumber}
                          item={item}
                          level={level}
                          hasChildren={hasItemChildren}
                          isDropTarget={isDropTarget}
                          isDragging={isDragging}
                          isSearchMatch={isSearchMatch}
                          isSearchActive={!!searchTerm}
                          onDragStart={hierarchy.handleDragStart}
                          onDragOver={hierarchy.handleDragOver}
                          onDragLeave={hierarchy.handleDragLeave}
                          onDrop={hierarchy.handleDrop}
                          onDragEnd={hierarchy.handleDragEnd}
                          onRemoveFromGroup={level > 0 ? () => hierarchy.removeFromGroup(item.id!) : undefined}
                        >
                          {/* Colonnes standards dans l'ordre défini */}
                          {columnOrder.map((columnKey) => renderCell(item, columnKey))}

                      {/* Valeurs des colonnes personnalisées */}
                      {customFields.map((field) => (
                        <Td
                          key={field.id}
                          width={`${getColWidth(`custom_${field.fieldKey}`)}px`}
                          minW={`${getColWidth(`custom_${field.fieldKey}`)}px`}
                          maxW={`${getColWidth(`custom_${field.fieldKey}`)}px`}
                        >
                          {editingCell?.serialNumber === item.serialNumber &&
                          editingCell?.field === field.fieldKey && editingCell?.isCustom ? (
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={saveEdit}
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') saveEdit();
                              }}
                              size="xs"
                              autoFocus
                              type={field.fieldType === 'number' ? 'number' : field.fieldType === 'date' ? 'date' : 'text'}
                            />
                          ) : (
                            <Box position="relative" _hover={{ '& > button': { opacity: 1 } }}>
                              {field.fieldType === 'checkbox' ? (
                                <Box pr="20px">
                                  <Checkbox isChecked={getCustomFieldValue(item, field.fieldKey) === 'true'} isReadOnly />
                                </Box>
                              ) : (
                                <Text pr="20px" fontSize="sm">
                                  {getCustomFieldValue(item, field.fieldKey) || '-'}
                                </Text>
                              )}
                              <IconButton
                                aria-label="Modifier"
                                icon={<Icon as={MdBrush} boxSize={3} />}
                                size="xs"
                                position="absolute"
                                top="0"
                                right="0"
                                variant="ghost"
                                colorScheme="gray"
                                opacity={0.3}
                                _hover={{ opacity: 1, color: 'blue.500' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEdit(item.serialNumber, field.fieldKey, getCustomFieldValue(item, field.fieldKey), true);
                                }}
                                h="16px"
                                minW="16px"
                              />
                            </Box>
                          )}
                        </Td>
                      ))}

                      {/* Colonne Actions (fixe) */}
                      <Td
                        width={`${getColWidth('actions')}px`}
                        minW={`${getColWidth('actions')}px`}
                        maxW={`${getColWidth('actions')}px`}
                      >
                        <HStack spacing={1}>
                          <IconButton
                            aria-label="Modifier"
                            icon={<Icon as={MdEdit} />}
                            size="xs"
                            onClick={() => startEdit(item.serialNumber, 'name', item.name)}
                          />
                          <IconButton
                            aria-label="Supprimer"
                            icon={<Icon as={MdDelete} />}
                            size="xs"
                            colorScheme="red"
                            onClick={() => handleDelete(item.serialNumber)}
                          />
                        </HStack>
                      </Td>
                        </HierarchicalInventoryRow>
                      );
                  })
                )}
              </Tbody>
            </Table>
          </Box>

          {/* Pagination */}
          {totalPages > 1 && (
            <Flex justify="space-between" align="center">
              <Text fontSize="sm">
                Page {currentPage} sur {totalPages} ({filteredItems.length} items)
              </Text>
              <HStack>
                <IconButton
                  aria-label="Page précédente"
                  icon={<Icon as={MdChevronLeft} />}
                  onClick={() => setCurrentPage(currentPage - 1)}
                  isDisabled={currentPage === 1}
                  size="sm"
                />
                <Text fontSize="sm">
                  {currentPage}
                </Text>
                <IconButton
                  aria-label="Page suivante"
                  icon={<Icon as={MdChevronRight} />}
                  onClick={() => setCurrentPage(currentPage + 1)}
                  isDisabled={currentPage === totalPages}
                  size="sm"
                />
              </HStack>
            </Flex>
          )}
        </VStack>
      </Card>

      {/* Modals */}
      
      {/* Modal Import CSV - fermeture possible par clic extérieur ou Échap */}
      <Modal isOpen={isImportOpen} onClose={onImportClose} size="xl" scrollBehavior="inside" closeOnOverlayClick closeOnEsc>
        <ModalOverlay />
        <ModalContent maxW="800px">
          <ModalHeader>
            <HStack>
              <Icon as={MdFileUpload} color="green.500" />
              <Text>Importer un fichier CSV</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {(() => {
              // Afficher depuis la ref si le state n'est pas encore à jour (évite écran vide)
              const displayHeaders = csvHeaders.length > 0 ? csvHeaders : (csvParsedRef.current?.headers ?? []);
              const displayData = csvData.length > 0 ? csvData : (csvParsedRef.current?.data ?? []);
              const displayMapping = Object.keys(columnMapping).length > 0 ? columnMapping : (csvParsedRef.current?.mapping ?? {});
              const hasFile = displayHeaders.length > 0 || (csvParsedRef.current?.headers?.length ?? 0) > 0;

              // Étape 1 : aucun fichier sélectionné → afficher le sélecteur de fichier  
              if (!hasFile) {
                return (
                  <VStack spacing={4} align="stretch">
                    <Text fontSize="sm" color="gray.600">
                      Choisissez un fichier CSV pour lancer l'import et définir la correspondance des colonnes.
                    </Text>
                    <input
                      type="file"
                      accept=".csv"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                    />
                    <Button
                      leftIcon={<Icon as={MdFileUpload} />}
                      onClick={() => fileInputRef.current?.click()}
                      size="lg"
                      colorScheme="green"
                    >
                      Choisir un fichier CSV
                    </Button>
                  </VStack>
                );
              }

              // Étape 2 : fichier chargé → afficher le mapping
              return (
                <VStack spacing={4} align="stretch">
                  {/* Info et reset */}
                  <Box bg="blue.50" p={3} borderRadius="md">
                    <VStack align="stretch" spacing={2}>
                      <HStack justify="space-between" flexWrap="wrap">
                        <Text fontSize="sm" fontWeight="semibold" color="blue.700">
                          Fichier chargé : {displayHeaders.length} colonnes, {displayData.length} lignes
                        </Text>
                        <Button
                          size="xs"
                          variant="ghost"
                          colorScheme="red"
                          onClick={() => {
                            setCsvHeaders([]);
                            setCsvData([]);
                            setColumnMapping({});
                            csvParsedRef.current = null;
                          }}
                        >
                          Changer de fichier
                        </Button>
                      </HStack>
                    </VStack>
                  </Box>

                  {/* Zone de glisser-déposer pour le mapping */}
                  <Flex gap={6}>
                    {/* Colonnes CSV */}
                    <Box flex={1}>
                      <Text fontSize="sm" fontWeight="semibold" mb={2}>Colonnes CSV</Text>
                      <VStack align="stretch" spacing={2}>
                        {displayHeaders.map((header, index) => {
                          const isAssigned = Object.values(displayMapping).includes(displayMapping[index.toString()]);
                          
                          return (
                            <Box
                              key={index}
                              draggable
                              onDragStart={(e) => {
                                setDraggedCsvColumn(index.toString());
                                e.dataTransfer.effectAllowed = 'move';
                              }}
                              onDragEnd={() => setDraggedCsvColumn(null)}
                              p={3}
                              bg={displayMapping[index.toString()] ? 'green.100' : 'white'}
                              border="2px solid"
                              borderColor={displayMapping[index.toString()] ? 'green.400' : 'gray.300'}
                              borderRadius="md"
                              cursor="grab"
                              _active={{ cursor: 'grabbing' }}
                              _hover={{ borderColor: 'purple.400', bg: 'purple.50' }}
                              transition="all 0.2s"
                            >
                              <HStack justify="space-between">
                                <VStack align="start" spacing={0} flex={1}>
                                  <HStack>
                                    <Badge colorScheme="gray">{index + 1}</Badge>
                                    <Text fontWeight="semibold" fontSize="sm">{header}</Text>
                                  </HStack>
                                  <Text fontSize="xs" color="gray.500">
                                    Exemple: {displayData[0]?.[index] || '-'}
                                  </Text>
                                </VStack>
                                {displayMapping[index.toString()] && (
                                  <Badge colorScheme="green" fontSize="xx-small">
                                    Mappé
                                  </Badge>
                                )}
                              </HStack>
                            </Box>
                          );
                        })}
                      </VStack>
                    </Box>

                    {/* Colonnes Inventaire (cibles) */}
                    <Box flex={1}>
                      <Text fontSize="sm" fontWeight="semibold" mb={2}>Champs Inventaire</Text>
                      <VStack align="stretch" spacing={2}>
                        {availableColumns.filter(col => col.key !== '').map((col) => {
                          const csvIndex = Object.keys(displayMapping).find(
                            (key) => displayMapping[key] === col.key
                          );
                          const csvHeader = csvIndex !== undefined ? displayHeaders[parseInt(csvIndex)] : null;
                          
                          return (
                            <Box
                              key={col.key}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                setDraggedInventoryColumn(col.key);
                              }}
                              onDragLeave={() => setDraggedInventoryColumn(null)}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (draggedCsvColumn !== null) {
                                  updateColumnMapping(draggedCsvColumn, col.key);
                                }
                                setDraggedCsvColumn(null);
                                setDraggedInventoryColumn(null);
                              }}
                              p={3}
                              bg={csvIndex !== undefined ? 'green.100' : draggedInventoryColumn === col.key ? 'yellow.100' : 'white'}
                              border="2px dashed"
                              borderColor={csvIndex !== undefined ? 'green.400' : draggedInventoryColumn === col.key ? 'yellow.400' : 'gray.300'}
                              borderRadius="md"
                              minH="60px"
                              display="flex"
                              alignItems="center"
                              transition="all 0.2s"
                              _hover={{ borderColor: 'purple.400', bg: 'purple.50' }}
                            >
                              <VStack align="start" spacing={0} flex={1}>
                                <HStack>
                                  <Text fontWeight="semibold" fontSize="sm">
                                    {col.label}
                                  </Text>
                                  {col.required && (
                                    <Badge colorScheme="red" fontSize="xx-small">*</Badge>
                                  )}
                                </HStack>
                                {csvHeader && (
                                  <HStack mt={1}>
                                    <Badge 
                                      colorScheme="blue" 
                                      fontSize="xx-small"
                                      cursor="pointer"
                                      _hover={{ bg: 'red.500', color: 'white' }}
                                      title="Cliquer pour supprimer ce mapping"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        console.log('[MAPPING DEBUG] ====================================');
                                        console.log('[MAPPING DEBUG] Clic sur la flèche de suppression');
                                        console.log('[MAPPING DEBUG] Colonne inventaire:', col.key);
                                        console.log('[MAPPING DEBUG] Colonne CSV mappée:', csvHeader);
                                        console.log('[MAPPING DEBUG] Index CSV:', csvIndex);
                                        console.log('[MAPPING DEBUG] Mapping actuel:', columnMapping);
                                        
                                        if (csvIndex !== undefined) {
                                          try {
                                            // Supprimer le mapping
                                            setColumnMapping(prev => {
                                              const newMapping = { ...prev };
                                              delete newMapping[csvIndex];
                                              console.log('[MAPPING DEBUG] Nouveau mapping après suppression:', newMapping);
                                              return newMapping;
                                            });
                                            console.log('[MAPPING DEBUG] Mapping supprimé avec succès!');
                                            
                                            toast({
                                              title: 'Mapping supprimé',
                                              description: `"${csvHeader}" n'est plus lié à "${col.label}"`,
                                              status: 'info',
                                              duration: 2000,
                                              isClosable: true,
                                            });
                                          } catch (error) {
                                            console.error('[MAPPING ERROR] Erreur lors de la suppression:', error);
                                          }
                                        }
                                        console.log('[MAPPING DEBUG] ====================================');
                                      }}
                                    >
                                      ✕
                                    </Badge>
                                    <Text fontSize="xs" color="gray.600">{csvHeader}</Text>
                                  </HStack>
                                )}
                                {!csvHeader && draggedInventoryColumn === col.key && (
                                  <Text fontSize="xs" color="yellow.700" fontStyle="italic" mt={1}>
                                    Déposez ici
                                  </Text>
                                )}
                              </VStack>
                            </Box>
                          );
                        })}
                      </VStack>
                    </Box>
                  </Flex>

                  {/* Alternative: Select pour chaque colonne CSV */}
                  <Box mt={4} p={3} bg="gray.50" borderRadius="md">
                    <Text fontSize="sm" fontWeight="semibold" mb={2}>
                      Ou utilisez les menus déroulants :
                    </Text>
                    <TableContainer>
                      <Table size="sm" variant="simple">
                        <Thead>
                          <Tr>
                            <Th>Colonne CSV</Th>
                            <Th>Exemple</Th>
                            <Th>Champ inventaire</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {displayHeaders.map((header, index) => (
                            <Tr key={index}>
                              <Td>
                                <HStack>
                                  <Badge colorScheme="gray">{index + 1}</Badge>
                                  <Text fontWeight="medium" fontSize="sm">{header}</Text>
                                </HStack>
                              </Td>
                              <Td>
                                <Text fontSize="xs" color="gray.500" noOfLines={1} maxW="150px">
                                  {displayData[0]?.[index] || '-'}
                                </Text>
                              </Td>
                              <Td>
                                <HStack spacing={1}>
                                  <Select
                                    size="sm"
                                    value={displayMapping[index.toString()] || ''}
                                    onChange={(e) => {
                                      const newValue = e.target.value;
                                      console.log('[SELECT DEBUG] ====================================');
                                      console.log('[SELECT DEBUG] Changement de mapping via Select');
                                      console.log('[SELECT DEBUG] Colonne CSV:', header, '(index:', index, ')');
                                      console.log('[SELECT DEBUG] Ancienne valeur:', displayMapping[index.toString()]);
                                      console.log('[SELECT DEBUG] Nouvelle valeur:', newValue);
                                      
                                      if (newValue === '') {
                                        console.log('[SELECT DEBUG] Suppression du mapping');
                                        setColumnMapping(prev => {
                                          const newMapping = { ...prev };
                                          delete newMapping[index.toString()];
                                          console.log('[SELECT DEBUG] Nouveau mapping:', newMapping);
                                          return newMapping;
                                        });
                                      } else {
                                        console.log('[SELECT DEBUG] Mise à jour du mapping');
                                        updateColumnMapping(index.toString(), newValue);
                                      }
                                      console.log('[SELECT DEBUG] ====================================');
                                    }}
                                    bg={displayMapping[index.toString()] ? 'green.50' : 'white'}
                                  >
                                    <option value="">-- Aucun --</option>
                                    {availableColumns.map((col) => (
                                      <option key={col.key} value={col.key}>
                                        {col.label} {col.required ? '*' : ''}
                                      </option>
                                    ))}
                                  </Select>
                                  {displayMapping[index.toString()] && (
                                    <IconButton
                                      aria-label="Supprimer le mapping"
                                      icon={<Icon as={MdClose} />}
                                      size="sm"
                                      colorScheme="red"
                                      variant="ghost"
                                      onClick={() => {
                                        console.log('[BUTTON DEBUG] ====================================');
                                        console.log('[BUTTON DEBUG] Clic sur bouton X de suppression');
                                        console.log('[BUTTON DEBUG] Colonne CSV:', header, '(index:', index, ')');
                                        console.log('[BUTTON DEBUG] Mapping à supprimer:', displayMapping[index.toString()]);
                                        
                                        setColumnMapping(prev => {
                                          const newMapping = { ...prev };
                                          delete newMapping[index.toString()];
                                          console.log('[BUTTON DEBUG] Nouveau mapping:', newMapping);
                                          return newMapping;
                                        });
                                        
                                        toast({
                                          title: 'Mapping supprimé',
                                          description: `"${header}" n'est plus lié`,
                                          status: 'info',
                                          duration: 2000,
                                          isClosable: true,
                                        });
                                        console.log('[BUTTON DEBUG] ====================================');
                                      }}
                                    />
                                  )}
                                </HStack>
                              </Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    </TableContainer>
                  </Box>

                  {/* Légende */}
                  <HStack spacing={4} fontSize="sm" color="gray.500">
                    <HStack>
                      <Icon as={MdCheckCircle} color="green.500" />
                      <Text>Champs obligatoires: Nom, Numéro de série</Text>
                    </HStack>
                  </HStack>

                  {/* Barre de progression */}
                  {isImporting && (
                    <Box>
                      <Flex justify="space-between" mb={2}>
                        <Text fontSize="sm">Import en cours...</Text>
                        <Text fontSize="sm">
                          {importProgress.current} / {importProgress.total}
                          {importProgress.errors > 0 && (
                            <Text as="span" color="red.500" ml={2}>
                              ({importProgress.errors} erreurs)
                            </Text>
                          )}
                        </Text>
                      </Flex>
                      <Box
                        h="8px"
                        bg="gray.200"
                        borderRadius="full"
                        overflow="hidden"
                      >
                        <Box
                          h="100%"
                          bg={importProgress.errors > 0 ? 'orange.400' : 'green.400'}
                          w={`${(importProgress.current / importProgress.total) * 100}%`}
                          transition="width 0.3s"
                        />
                      </Box>
                    </Box>
                  )}

                  {/* Preview des données */}
                  <Box>
                    <Text fontSize="sm" fontWeight="semibold" mb={2}>
                      Aperçu (5 premières lignes)
                    </Text>
                    <TableContainer>
                      <Table size="sm" variant="striped">
                        <Thead>
                          <Tr>
                            {displayHeaders.map((header, i) => (
                              <Th key={i} fontSize="xs">{header}</Th>
                            ))}
                          </Tr>
                        </Thead>
                        <Tbody>
                          {displayData.slice(0, 5).map((row, rowIndex) => (
                            <Tr key={rowIndex}>
                              {row.map((cell, cellIndex) => (
                                <Td key={cellIndex} fontSize="xs">{cell}</Td>
                              ))}
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    </TableContainer>
                  </Box>
                </VStack>
              );
            })()}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onImportClose}>
              Annuler
            </Button>
            <Button
              colorScheme="green"
              onClick={handleImport}
              isDisabled={
                isImporting ||
                !Object.values(columnMapping).includes('name') ||
                !Object.values(columnMapping).includes('serialNumber')
              }
              isLoading={isImporting}
            >
              Importer {csvData.length} lignes
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal Gestion des colonnes personnalisées */}
      {/* Nouveau composant de gestion des colonnes */}
      <ColumnManager
        columns={customFields}
        onAddColumn={handleAddColumnNew}
        onUpdateColumn={handleUpdateColumn}
        onDeleteColumn={handleDeleteColumnNew}
        isOpen={isColumnModalOpen}
        onClose={onColumnModalClose}
      />

      {/* Modal plein écran : clic sur une image dans l'inventaire */}
      <Modal isOpen={isImageModalOpen} onClose={onImageModalClose} size="full">
        <ModalOverlay bg="blackAlpha.900" />
        <ModalContent bg="transparent" boxShadow="none">
          <ModalCloseButton 
            color="white" 
            size="lg" 
            zIndex={20}
            top={4}
            right={4}
            _hover={{ bg: 'whiteAlpha.300' }}
          />
          <ModalBody display="flex" alignItems="center" justifyContent="center" position="relative">
            {selectedItemImages.length > 0 && (
              <>
                {/* Image principale */}
                <Box maxW="90vw" maxH="90vh" position="relative">
                  <Image
                    src={selectedItemImages[selectedImageIndex]}
                    alt={`Image ${selectedImageIndex + 1}`}
                    maxW="100%"
                    maxH="90vh"
                    objectFit="contain"
                  />
                </Box>

                {/* Flèches de navigation (si plusieurs images) */}
                {selectedItemImages.length > 1 && (
                  <>
                    <IconButton
                      aria-label="Image précédente"
                      icon={<Icon as={MdChevronLeft} boxSize={8} />}
                      onClick={() => {
                        const newIndex = selectedImageIndex > 0 
                          ? selectedImageIndex - 1 
                          : selectedItemImages.length - 1;
                        setSelectedImageIndex(newIndex);
                      }}
                      position="fixed"
                      left={4}
                      top="50%"
                      transform="translateY(-50%)"
                      colorScheme="whiteAlpha"
                      color="white"
                      size="lg"
                      borderRadius="full"
                      zIndex={10}
                    />
                    <IconButton
                      aria-label="Image suivante"
                      icon={<Icon as={MdChevronRight} boxSize={8} />}
                      onClick={() => {
                        const newIndex = selectedImageIndex < selectedItemImages.length - 1 
                          ? selectedImageIndex + 1 
                          : 0;
                        setSelectedImageIndex(newIndex);
                      }}
                      position="fixed"
                      right={4}
                      top="50%"
                      transform="translateY(-50%)"
                      colorScheme="whiteAlpha"
                      color="white"
                      size="lg"
                      borderRadius="full"
                      zIndex={10}
                    />
                  </>
                )}

                {/* Indicateur de page (si plusieurs images) */}
                {selectedItemImages.length > 1 && (
                  <Flex
                    position="fixed"
                    bottom={20}
                    left="50%"
                    transform="translateX(-50%)"
                    bg="blackAlpha.700"
                    color="white"
                    px={4}
                    py={2}
                    borderRadius="full"
                    gap={2}
                    zIndex={10}
                    alignItems="center"
                  >
                    <Text fontWeight="bold" fontSize="sm">
                      {selectedImageIndex + 1} / {selectedItemImages.length}
                    </Text>

                    {/* Miniatures */}
                    <HStack spacing={2} maxW="400px" overflowX="auto">
                      {selectedItemImages.map((img, idx) => (
                        <Box
                          key={idx}
                          w="40px"
                          h="40px"
                          flexShrink={0}
                          borderRadius="md"
                          overflow="hidden"
                          border="2px solid"
                          borderColor={idx === selectedImageIndex ? 'white' : 'whiteAlpha.400'}
                          cursor="pointer"
                          onClick={() => setSelectedImageIndex(idx)}
                          _hover={{ opacity: 0.9, borderColor: 'whiteAlpha.700' }}
                          transition="all 0.2s"
                        >
                          <Image src={img} alt={`Miniature ${idx + 1}`} w="100%" h="100%" objectFit="cover" />
                        </Box>
                      ))}
                    </HStack>
                  </Flex>
                )}

                {/* Bouton "Ouvrir dans un nouvel onglet" en bas à droite */}
                {selectedItemImages.length > 0 && (
                  <Button
                    position="fixed"
                    bottom={4}
                    right={4}
                    zIndex={10}
                    leftIcon={<Icon as={MdDownload} />}
                    colorScheme="whiteAlpha"
                    color="white"
                    onClick={() => {
                      const imageUrl = selectedItemImages[selectedImageIndex];
                      if (imageUrl.startsWith('data:image') && imageUrl.length > 100000) {
                        const byteString = atob(imageUrl.split(',')[1]);
                        const mimeString = imageUrl.split(',')[0].split(':')[1].split(';')[0];
                        const ab = new ArrayBuffer(byteString.length);
                        const ia = new Uint8Array(ab);
                        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                        const blob = new Blob([ab], { type: mimeString });
                        const blobUrl = URL.createObjectURL(blob);
                        window.open(blobUrl, '_blank');
                        setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
                      } else {
                        window.open(imageUrl, '_blank');
                      }
                    }}
                  >
                    Ouvrir dans un nouvel onglet
                  </Button>
                )}
              </>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Modal de gestion des catégories */}
      <Modal isOpen={isCategoryModalOpen} onClose={onCategoryModalClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack>
              <Icon as={MdEdit} color="blue.500" />
              <Text>Gérer les catégories</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              {/* Info */}
              <Box bg="blue.50" p={3} borderRadius="md">
                <Text fontSize="sm" color="blue.700">
                  Les catégories permettent de classer vos articles. Elles apparaissent dans l'inventaire et le scanner.
                </Text>
              </Box>

              {/* Formulaire d'ajout */}
              <Box p={4} bg="gray.50" borderRadius="md">
                <Text fontWeight="bold" mb={3}>Ajouter une nouvelle catégorie</Text>
                <VStack spacing={3} align="stretch">
                  <FormControl>
                    <FormLabel fontSize="sm">Nom de la catégorie</FormLabel>
                    <Input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Ex: Drone, Video, Audio..."
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCategory();
                        }
                      }}
                    />
                  </FormControl>
                  <Button
                    colorScheme="blue"
                    leftIcon={<Icon as={MdAdd} />}
                    onClick={handleAddCategory}
                    isLoading={isAddingCategory}
                    loadingText="Ajout..."
                  >
                    Ajouter la catégorie
                  </Button>
                </VStack>
              </Box>

              <Divider />

              {/* Liste des catégories existantes */}
              <Box>
                <Text fontWeight="bold" mb={3}>
                  Catégories existantes ({categories.length})
                </Text>
                {categories.length === 0 ? (
                  <Text fontSize="sm" color="gray.500" textAlign="center" py={4}>
                    Aucune catégorie pour le moment
                  </Text>
                ) : (
                  <VStack spacing={2} align="stretch" maxH="300px" overflowY="auto">
                    {categories.map((cat, index) => (
                      <Flex
                        key={`${cat}-${index}`}
                        p={3}
                        bg="white"
                        borderRadius="md"
                        border="1px solid"
                        borderColor="gray.200"
                        justify="space-between"
                        align="center"
                        _hover={{ borderColor: 'blue.300', bg: 'blue.50' }}
                        transition="all 0.2s"
                      >
                        <HStack>
                          <Badge colorScheme="blue">{index + 1}</Badge>
                          <Text fontWeight="medium">
                            {cat.charAt(0).toUpperCase() + cat.slice(1).replace('_', ' ')}
                          </Text>
                        </HStack>
                        <IconButton
                          aria-label="Supprimer la catégorie"
                          icon={<Icon as={MdDelete} />}
                          size="sm"
                          colorScheme="red"
                          variant="ghost"
                          isLoading={isDeletingCategory === cat}
                          onClick={() => {
                            console.log('[CATEGORY DEBUG] Clic sur bouton supprimer:', cat);
                            handleDeleteCategory(cat);
                          }}
                          _hover={{ bg: 'red.100' }}
                        />
                      </Flex>
                    ))}
                  </VStack>
                )}
              </Box>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button onClick={onCategoryModalClose}>Fermer</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
