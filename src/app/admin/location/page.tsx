'use client';
/*!
=========================================================
* Code Bar CRM - Location Management Page
=========================================================
*/

import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Input,
  Select,
  Textarea,
  useColorModeValue,
  VStack,
  HStack,
  Icon,
  useToast,
  Badge,
  Text,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Checkbox,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Grid,
  GridItem,
  Image,
  Divider,
  InputGroup,
  InputLeftElement,
  IconButton,
  Tooltip,
} from '@chakra-ui/react';
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  MdAdd,
  MdCalendarToday,
  MdPerson,
  MdSearch,
  MdAttachFile,
  MdDelete,
  MdEdit,
  MdCheckCircle,
  MdCancel,
  MdChevronLeft,
  MdChevronRight,
  MdDownload,
} from 'react-icons/md';
import Card from 'components/card/Card';
import { getItems, getRentals, createRental, updateRental, deleteRental, downloadRentalCautionDoc, Item, getSSEUrl } from 'lib/api';

interface Rental {
  id: number;
  renterName: string;
  renterEmail: string;
  renterPhone: string;
  renterAddress: string;
  rentalPrice: number;
  rentalDeposit: number;
  rentalDuration: number;
  startDate: string;
  endDate: string;
  status: string;
  itemsData: any[];
  attachments?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  en_cours: 'blue',
  a_venir: 'purple',
  termine: 'green',
  annule: 'red',
};

const STATUS_LABELS: Record<string, string> = {
  en_cours: 'En cours',
  a_venir: 'À venir',
  termine: 'Terminé',
  annule: 'Annulé',
};

// Map pour stocker les quantités sélectionnées : serialNumber => quantity
type SelectedItemsMap = Map<string, number>;

export default function LocationPage() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<Item[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [selectedItems, setSelectedItems] = useState<SelectedItemsMap>(new Map());
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedRental, setSelectedRental] = useState<Rental | null>(null);
  const [detailRental, setDetailRental] = useState<Rental | null>(null);
  const [isEditingRental, setIsEditingRental] = useState(false);
  const [editedRental, setEditedRental] = useState<Rental | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  
  // Formulaire de location
  const [formData, setFormData] = useState({
    renterName: '',
    renterEmail: '',
    renterPhone: '',
    renterAddress: '',
    rentalPrice: 0,
    rentalDeposit: 0,
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    notes: '',
  });

  // Charger les données de commande vocale si présentes
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam) {
      setActiveTabIndex(parseInt(tabParam) || 0);
    }

    const voiceData = sessionStorage.getItem('voiceCommandData');
    if (voiceData) {
      try {
        const data = JSON.parse(voiceData);
        
        // Pré-remplir le formulaire
        setFormData(prev => ({
          ...prev,
          renterName: data.renterName || '',
          startDate: data.startDate || prev.startDate,
          endDate: data.endDate || '',
          rentalPrice: data.rentalPrice || 0,
          rentalDeposit: data.rentalDeposit || 0,
          notes: data.notes || '',
        }));

        // Pré-sélectionner les items après chargement des items
        if (data.items && data.items.length > 0) {
          sessionStorage.setItem('voiceCommandItems', JSON.stringify(data.items));
        }

        // Nettoyer sessionStorage
        sessionStorage.removeItem('voiceCommandData');
      } catch (e) {
        console.error('Erreur parsing voiceCommandData:', e);
      }
    }
  }, [searchParams]);
  
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isDetailOpen, onOpen: onDetailOpen, onClose: onDetailClose } = useDisclosure();

  const openRentalDetail = (rental: Rental) => {
    setDetailRental(rental);
    setSelectedRental(rental);
    setIsEditingRental(false);
    setEditedRental(null);
    onDetailOpen();
  };

  const closeRentalDetail = () => {
    onDetailClose();
    setDetailRental(null);
    setIsEditingRental(false);
    setEditedRental(null);
  };

  // Activer le mode édition
  const startEditingRental = () => {
    if (detailRental) {
      setEditedRental({ ...detailRental });
      setIsEditingRental(true);
    }
  };

  // Annuler l'édition
  const cancelEditingRental = () => {
    setIsEditingRental(false);
    setEditedRental(null);
  };

  // Sauvegarder les modifications
  const saveRentalEdits = async () => {
    if (!editedRental || !detailRental) return;

    try {
      await updateRental(detailRental.id, editedRental);
      
      toast({
        title: 'Succès',
        description: 'Location mise à jour',
        status: 'success',
        duration: 3000,
      });

      // Recharger les données
      await loadData();
      
      // Mettre à jour le détail affiché
      setDetailRental(editedRental);
      setIsEditingRental(false);
      setEditedRental(null);
    } catch (error) {
      console.error('Erreur MAJ location:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de mettre à jour la location',
        status: 'error',
        duration: 5000,
      });
    }
  };

  // Modifier un champ de la location
  const updateRentalField = (field: string, value: any) => {
    if (editedRental) {
      setEditedRental({ ...editedRental, [field]: value });
    }
  };

  // Modifier un item dans la liste
  const updateRentalItem = (index: number, updates: any) => {
    if (editedRental && editedRental.itemsData) {
      const newItems = [...editedRental.itemsData];
      newItems[index] = { ...newItems[index], ...updates };
      setEditedRental({ ...editedRental, itemsData: newItems });
    }
  };

  // Supprimer un item de la liste
  const removeRentalItem = (index: number) => {
    if (editedRental && editedRental.itemsData) {
      const newItems = editedRental.itemsData.filter((_, i) => i !== index);
      setEditedRental({ ...editedRental, itemsData: newItems });
    }
  };
  
  const toast = useToast();
  const bg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const cardBg = useColorModeValue('gray.50', 'navy.700');

  // Charger les données
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [itemsData, rentalsData] = await Promise.all([
        getItems(),
        getRentals(),
      ]);
      setItems(itemsData);
      setRentals(rentalsData);

      // Après chargement, vérifier s'il y a des items à pré-sélectionner
      const voiceItems = sessionStorage.getItem('voiceCommandItems');
      if (voiceItems) {
        try {
          const itemsToSelect = JSON.parse(voiceItems);
          const newSelectedItems = new Map<string, number>();

          itemsToSelect.forEach((voiceItem: any) => {
            // Normaliser l'identifiant vocal (enlever espaces, mettre en minuscule)
            const voiceId = (voiceItem.itemId || voiceItem.serialNumber || '').toString().toLowerCase().trim();
            const voiceName = (voiceItem.name || '').toLowerCase().trim();
            
            // Chercher l'item par hexId, itemId, serialNumber ou nom
            const foundItem = itemsData.find((item: Item) => {
              // Correspondance exacte sur hexId (c15, C15, etc.)
              if (item.hexId && item.hexId.toLowerCase() === voiceId) return true;
              // Correspondance sur hexId sans le préfixe (15 = C15)
              if (item.hexId && voiceId && item.hexId.toLowerCase().replace(/^c/i, '') === voiceId.replace(/^c/i, '')) return true;
              // Correspondance exacte sur itemId
              if (item.itemId && item.itemId.toLowerCase() === voiceId) return true;
              // Correspondance exacte sur serialNumber
              if (item.serialNumber && item.serialNumber.toLowerCase() === voiceId) return true;
              // Correspondance partielle sur nom
              if (voiceName && item.name?.toLowerCase().includes(voiceName)) return true;
              return false;
            });

            if (foundItem) {
              const qty = Math.min(voiceItem.quantity || 1, foundItem.quantity || 1);
              newSelectedItems.set(foundItem.serialNumber, qty);
              console.log('[VOICE] Item trouvé:', foundItem.hexId, foundItem.name, 'qty:', qty);
            } else {
              console.log('[VOICE] Item non trouvé:', voiceId, voiceName);
            }
          });

          if (newSelectedItems.size > 0) {
            setSelectedItems(newSelectedItems);
          }

          sessionStorage.removeItem('voiceCommandItems');
        } catch (e) {
          console.error('Erreur parsing voiceCommandItems:', e);
        }
      }
    } catch (error) {
      console.error('Erreur chargement données:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de charger les données',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // URL SSE - utiliser la configuration
  const SSE_URL = getSSEUrl();

  useEffect(() => {
    // Chargement initial
    loadData();
    
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
        console.log('[SSE] Connecté aux événements temps réel');
        reconnectAttempts = 0;
      };
      
      eventSource.onerror = () => {
        console.log('[SSE] Erreur de connexion, tentative de reconnexion...');
        eventSource?.close();
        
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
          reconnectTimeout = setTimeout(connectSSE, delay);
        }
      };
      
      eventSource.addEventListener('items_changed', () => {
        // Recharger les items car ils peuvent affecter les locations (statut, etc.)
        loadData();
      });
      
      eventSource.addEventListener('rentals_changed', () => {
        // Recharger les locations quand elles changent
        loadData();
      });
    };
    
    connectSSE();
    
    return () => {
      eventSource?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  // Fonction pour vérifier si un item correspond à la recherche
  const itemMatchesSearch = (item: Item, term: string): boolean => {
    return item.name?.toLowerCase().includes(term) ||
      item.serialNumber?.toLowerCase().includes(term) ||
      item.brand?.toLowerCase().includes(term) ||
      item.model?.toLowerCase().includes(term) ||
      item.hexId?.toLowerCase().includes(term) ||
      item.itemId?.toLowerCase().includes(term) ||
      false;
  };

  // Filtrer les items disponibles (garder les groupes visibles si un enfant correspond)
  const matchedItemIds = new Set<number>();
  const parentsToInclude = new Set<number>();

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    // Trouver tous les items qui correspondent
    items.forEach(item => {
      if (itemMatchesSearch(item, term) && item.id) {
        matchedItemIds.add(item.id);
      }
    });
    // Trouver tous les parents des items correspondants
    matchedItemIds.forEach(itemId => {
      let currentItem = items.find(i => i.id === itemId);
      while (currentItem?.parentId) {
        parentsToInclude.add(currentItem.parentId);
        currentItem = items.find(i => i.id === currentItem!.parentId);
      }
    });
  }

  const availableItems = items.filter(item => {
    const isAvailable = item.status === 'en_stock' || !item.status;
    if (!isAvailable) return false;

    if (!searchTerm) return true;
    
    // Garder si correspond OU si c'est un parent d'un item qui correspond
    return (item.id && matchedItemIds.has(item.id)) || (item.id && parentsToInclude.has(item.id));
  });

  // Items en location
  const rentedItems = items.filter(item => item.status === 'loue');

  // Toggle sélection item avec quantité
  const toggleItemSelection = (serialNumber: string) => {
    setSelectedItems(prev => {
      const newMap = new Map(prev);
      if (newMap.has(serialNumber)) {
        newMap.delete(serialNumber);
      } else {
        const item = items.find(i => i.serialNumber === serialNumber);
        const availableQty = item?.quantity || 1;
        newMap.set(serialNumber, Math.min(1, availableQty));
      }
      return newMap;
    });
  };

  // Mettre à jour la quantité d'un item sélectionné
  const updateItemQuantity = (serialNumber: string, quantity: number) => {
    const item = items.find(i => i.serialNumber === serialNumber);
    const maxQty = item?.quantity || 1;
    const validQty = Math.max(1, Math.min(quantity, maxQty));
    
    setSelectedItems(prev => {
      const newMap = new Map(prev);
      newMap.set(serialNumber, validQty);
      return newMap;
    });
  };

  // Créer une location
  const handleCreateRental = async () => {
    if (selectedItems.size === 0) {
      toast({
        title: 'Erreur',
        description: 'Sélectionnez au moins un item',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    if (!formData.renterName || !formData.renterEmail || !formData.endDate) {
      toast({
        title: 'Erreur',
        description: 'Remplissez tous les champs obligatoires',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    try {
      const selectedItemsData = Array.from(selectedItems.entries()).map(([serialNumber, quantity]) => {
        const item = items.find(i => i.serialNumber === serialNumber);
        return {
          serialNumber: item?.serialNumber || serialNumber,
          name: item?.name || '',
          brand: item?.brand || '',
          model: item?.model || '',
          itemType: item?.itemType || '',
          quantity: quantity,
        };
      });

      const rentalData = {
        renterName: formData.renterName,
        renterEmail: formData.renterEmail,
        renterPhone: formData.renterPhone,
        renterAddress: formData.renterAddress,
        rentalPrice: formData.rentalPrice,
        rentalDeposit: formData.rentalDeposit,
        rentalDuration: Math.ceil(
          (new Date(formData.endDate).getTime() - new Date(formData.startDate).getTime()) / (1000 * 60 * 60 * 24)
        ),
        startDate: formData.startDate,
        endDate: formData.endDate,
        status: new Date(formData.startDate) > new Date() ? 'a_venir' : 'en_cours',
        itemsData: selectedItemsData,
        notes: formData.notes,
      };

      const result = await createRental(rentalData) as { success?: boolean; id?: number };
      
      toast({
        title: 'Succès',
        description: 'Location créée avec succès',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      if (result?.id) {
        try {
          await downloadRentalCautionDoc(result.id);
          toast({
            title: 'PDF téléchargé',
            description: 'Le document de caution (PDF) a été téléchargé avec les infos du locataire.',
            status: 'success',
            duration: 4000,
            isClosable: true,
          });
        } catch (e) {
          console.error('Erreur téléchargement PDF caution:', e);
          toast({
            title: 'PDF non téléchargé',
            description: 'Location créée. Vous pouvez télécharger le document plus tard depuis les détails de la location.',
            status: 'info',
            duration: 4000,
            isClosable: true,
          });
        }
      }

      // Reset form
      setFormData({
        renterName: '',
        renterEmail: '',
        renterPhone: '',
        renterAddress: '',
        rentalPrice: 0,
        rentalDeposit: 0,
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        notes: '',
      });
      setSelectedItems(new Map());
      onClose();
      // Le rechargement sera géré automatiquement par SSE
    } catch (error) {
      console.error('Erreur création location:', error);
      toast({
        title: 'Erreur',
        description: 'Erreur lors de la création de la location',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  // Terminer une location
  const handleEndRental = async (rental: Rental) => {
    try {
      await updateRental(rental.id, { ...rental, status: 'termine' });
      toast({
        title: 'Succès',
        description: 'Location terminée',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
      // Le rechargement sera géré automatiquement par SSE
    } catch (error) {
      console.error('Erreur:', error);
      toast({
        title: 'Erreur',
        description: 'Erreur lors de la mise à jour',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  // Supprimer une location
  const handleDeleteRental = async (id: number) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette location ?')) return;
    
    try {
      await deleteRental(id);
      toast({
        title: 'Succès',
        description: 'Location supprimée',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
      // Le rechargement sera géré automatiquement par SSE
    } catch (error) {
      console.error('Erreur:', error);
      toast({
        title: 'Erreur',
        description: 'Erreur lors de la suppression',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  // Télécharger le document de caution
  const handleDownloadCautionDoc = async (rentalId: number) => {
    try {
      toast({
        title: 'Téléchargement...',
        description: 'Génération du document en cours',
        status: 'info',
        duration: 2000,
        isClosable: true,
      });
      
      await downloadRentalCautionDoc(rentalId);
      
      toast({
        title: 'Succès',
        description: 'Document téléchargé avec succès',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      console.error('Erreur téléchargement document:', error);
      toast({
        title: 'Erreur',
        description: 'Erreur lors du téléchargement du document',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  // Obtenir le statut calculé
  const getRentalStatus = (rental: Rental) => {
    const now = new Date();
    const start = new Date(rental.startDate);
    const end = new Date(rental.endDate);
    
    if (rental.status === 'termine' || rental.status === 'annule') {
      return rental.status;
    }
    
    if (now < start) return 'a_venir';
    if (now > end) return 'termine';
    return 'en_cours';
  };

  // Grouper les locations par statut
  const rentalsByStatus = {
    en_cours: rentals.filter(r => getRentalStatus(r) === 'en_cours'),
    a_venir: rentals.filter(r => getRentalStatus(r) === 'a_venir'),
    termine: rentals.filter(r => getRentalStatus(r) === 'termine'),
  };

  // Générer le calendrier mensuel
  const generateMonthlyCalendar = () => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay(); // 0 = Dimanche, 1 = Lundi, etc.
    
    const calendar: (Date | null)[][] = [];
    let currentWeek: (Date | null)[] = [];
    
    // Ajouter les jours vides du début du mois
    for (let i = 0; i < startingDayOfWeek; i++) {
      currentWeek.push(null);
    }
    
    // Ajouter tous les jours du mois
    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push(new Date(currentYear, currentMonth, day));
      
      // Si on arrive à dimanche (6) ou si c'est le dernier jour du mois
      if (currentWeek.length === 7 || day === daysInMonth) {
        // Remplir la semaine si nécessaire
        while (currentWeek.length < 7) {
          currentWeek.push(null);
        }
        calendar.push(currentWeek);
        currentWeek = [];
      }
    }
    
    return calendar;
  };

  const monthlyCalendar = generateMonthlyCalendar();
  
  // Navigation entre les mois
  const goToPreviousMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
  };
  
  const monthNames = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];
  
  const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

  // Vérifier si une location est active pour un jour donné
  const getRentalsForDay = (date: Date) => {
    return rentals.filter(rental => {
      const start = new Date(rental.startDate);
      const end = new Date(rental.endDate);
      return date >= start && date <= end && rental.status !== 'annule';
    });
  };

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      <Tabs variant="soft-rounded" colorScheme="brand" index={activeTabIndex} onChange={setActiveTabIndex}>
        <TabList mb={4}>
          <Tab>
            <Icon as={MdCalendarToday} mr={2} />
            Calendrier
          </Tab>
          <Tab>
            <Icon as={MdPerson} mr={2} />
            Locations ({rentals.length})
          </Tab>
          <Tab>
            <Icon as={MdAdd} mr={2} />
            Nouvelle Location
          </Tab>
        </TabList>

        <TabPanels>
          {/* Onglet Calendrier */}
          <TabPanel p={0}>
            <Card>
              {/* En-tête avec navigation */}
              <Flex justify="space-between" align="center" mb={4} flexWrap="wrap" gap={4}>
                <HStack spacing={2}>
                  <IconButton
                    aria-label="Mois précédent"
                    icon={<Icon as={MdChevronLeft} />}
                    onClick={goToPreviousMonth}
                    variant="ghost"
                    size="sm"
                  />
                  <VStack spacing={0} align="center">
                    <Text fontSize="xl" fontWeight="bold">
                      {monthNames[currentMonth]} {currentYear}
                    </Text>
                  </VStack>
                  <IconButton
                    aria-label="Mois suivant"
                    icon={<Icon as={MdChevronRight} />}
                    onClick={goToNextMonth}
                    variant="ghost"
                    size="sm"
                  />
                </HStack>
                <Button size="sm" onClick={goToToday} variant="outline">
                  Aujourd'hui
                </Button>
              </Flex>
              
              {/* Calendrier mensuel */}
              <Box overflowX="auto">
                <Table variant="simple" size="sm">
                  <Thead>
                    <Tr>
                      {dayNames.map((day, index) => (
                        <Th key={index} textAlign="center" fontSize="xs" fontWeight="bold" py={2} w="14%">
                          {day}
                        </Th>
                      ))}
                    </Tr>
                  </Thead>
                  <Tbody>
                    {monthlyCalendar.map((week, weekIndex) => (
                      <Tr key={weekIndex}>
                        {week.map((day, dayIndex) => {
                          if (!day) {
                            return <Td key={dayIndex} h="120px" bg="gray.50" />;
                          }
                          
                          const dayRentals = getRentalsForDay(day);
                          const isToday = day.toDateString() === new Date().toDateString();
                          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                          const isCurrentMonth = day.getMonth() === currentMonth;
                          
                          return (
                            <Td
                              key={dayIndex}
                              w="14%"
                              h="120px"
                              p={1}
                              verticalAlign="top"
                              bg={isToday ? 'brand.50' : isWeekend ? 'gray.50' : isCurrentMonth ? 'white' : 'gray.100'}
                              border={isToday ? '2px solid' : '1px solid'}
                              borderColor={isToday ? 'brand.500' : 'gray.200'}
                              position="relative"
                            >
                              <Text
                                fontSize="sm"
                                fontWeight={isToday ? 'bold' : 'normal'}
                                color={isCurrentMonth ? (isToday ? 'brand.600' : 'gray.700') : 'gray.400'}
                                mb={1}
                              >
                                {day.getDate()}
                              </Text>
                              <VStack spacing={0.5} align="stretch" maxH="90px" overflowY="auto">
                                {dayRentals.slice(0, 2).map((rental, idx) => (
                                  <Tooltip key={idx} label="Cliquer pour voir les détails de la location" hasArrow>
                                    <Box
                                      w="100%"
                                      p={1}
                                      bg={`${STATUS_COLORS[getRentalStatus(rental)]}.200`}
                                      borderRadius="sm"
                                      cursor="pointer"
                                      _hover={{ opacity: 0.8 }}
                                      onClick={() => openRentalDetail(rental)}
                                      role="button"
                                      tabIndex={0}
                                      onKeyDown={(e) => e.key === 'Enter' && openRentalDetail(rental)}
                                    >
                                      <Text fontSize="xx-small" noOfLines={1} fontWeight="medium">
                                        {rental.renterName}
                                      </Text>
                                    </Box>
                                  </Tooltip>
                                ))}
                                {dayRentals.length > 2 && (
                                  <Text fontSize="xx-small" color="gray.500" textAlign="center">
                                    +{dayRentals.length - 2}
                                  </Text>
                                )}
                              </VStack>
                            </Td>
                          );
                        })}
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
              
              {/* Légende */}
              <HStack spacing={4} mt={4} justify="center" fontSize="sm" flexWrap="wrap">
                <HStack>
                  <Box w="16px" h="16px" bg="blue.200" borderRadius="sm" />
                  <Text>En cours</Text>
                </HStack>
                <HStack>
                  <Box w="16px" h="16px" bg="purple.200" borderRadius="sm" />
                  <Text>À venir</Text>
                </HStack>
                <HStack>
                  <Box w="16px" h="16px" bg="green.200" borderRadius="sm" />
                  <Text>Terminé</Text>
                </HStack>
              </HStack>
            </Card>
          </TabPanel>

          {/* Onglet Locations */}
          <TabPanel p={0}>
            <Grid templateColumns={{ base: '1fr', lg: 'repeat(3, 1fr)' }} gap={4}>
              {/* En cours */}
              <GridItem>
                <Card>
                  <HStack mb={4}>
                    <Badge colorScheme="blue" fontSize="md" px={3} py={1}>
                      En cours ({rentalsByStatus.en_cours.length})
                    </Badge>
                  </HStack>
                  <VStack spacing={3} align="stretch">
                    {rentalsByStatus.en_cours.map(rental => (
                      <RentalCard
                        key={rental.id}
                        rental={rental}
                        onView={() => openRentalDetail(rental)}
                        onEnd={() => handleEndRental(rental)}
                        onDelete={() => handleDeleteRental(rental.id)}
                      />
                    ))}
                    {rentalsByStatus.en_cours.length === 0 && (
                      <Text color="gray.500" textAlign="center" py={4}>
                        Aucune location en cours
                      </Text>
                    )}
                  </VStack>
                </Card>
              </GridItem>

              {/* À venir */}
              <GridItem>
                <Card>
                  <HStack mb={4}>
                    <Badge colorScheme="purple" fontSize="md" px={3} py={1}>
                      À venir ({rentalsByStatus.a_venir.length})
                    </Badge>
                  </HStack>
                  <VStack spacing={3} align="stretch">
                    {rentalsByStatus.a_venir.map(rental => (
                      <RentalCard
                        key={rental.id}
                        rental={rental}
                        onView={() => openRentalDetail(rental)}
                        onDelete={() => handleDeleteRental(rental.id)}
                      />
                    ))}
                    {rentalsByStatus.a_venir.length === 0 && (
                      <Text color="gray.500" textAlign="center" py={4}>
                        Aucune location à venir
                      </Text>
                    )}
                  </VStack>
                </Card>
              </GridItem>

              {/* Terminées */}
              <GridItem>
                <Card>
                  <HStack mb={4}>
                    <Badge colorScheme="green" fontSize="md" px={3} py={1}>
                      Terminées ({rentalsByStatus.termine.length})
                    </Badge>
                  </HStack>
                  <VStack spacing={3} align="stretch" maxH="500px" overflowY="auto">
                    {rentalsByStatus.termine.slice(0, 10).map(rental => (
                      <RentalCard
                        key={rental.id}
                        rental={rental}
                        onView={() => openRentalDetail(rental)}
                        onDelete={() => handleDeleteRental(rental.id)}
                        isCompleted
                      />
                    ))}
                    {rentalsByStatus.termine.length === 0 && (
                      <Text color="gray.500" textAlign="center" py={4}>
                        Aucune location terminée
                      </Text>
                    )}
                  </VStack>
                </Card>
              </GridItem>
            </Grid>
          </TabPanel>

          {/* Onglet Nouvelle Location */}
          <TabPanel p={0}>
            <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={4}>
              {/* Sélection des items */}
              <GridItem>
                <Card>
                  <Text fontSize="lg" fontWeight="bold" mb={4}>
                    1. Sélectionner les items
                  </Text>
                  
                  <InputGroup mb={4}>
                    <InputLeftElement>
                      <Icon as={MdSearch} />
                    </InputLeftElement>
                    <Input
                      placeholder="Rechercher un item..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </InputGroup>

                  {selectedItems.size > 0 && (
                    <VStack mb={4} align="stretch" spacing={2}>
                      <Text fontWeight="bold">Sélectionnés ({selectedItems.size}):</Text>
                      <VStack align="stretch" spacing={2} maxH="150px" overflowY="auto">
                        {Array.from(selectedItems.entries()).map(([sn, qty]) => {
                          const item = items.find(i => i.serialNumber === sn);
                          return (
                            <HStack key={sn} p={2} bg="brand.50" borderRadius="md" justify="space-between">
                              <HStack flex={1}>
                                <Text fontSize="sm" fontWeight="medium">{item?.name}</Text>
                                <Badge colorScheme="brand" fontSize="xs">×{qty}</Badge>
                              </HStack>
                              <HStack spacing={1}>
                                <Input
                                  type="number"
                                  min={1}
                                  max={item?.quantity || 1}
                                  value={qty}
                                  onChange={(e) => updateItemQuantity(sn, parseInt(e.target.value) || 1)}
                                  onClick={(e) => e.stopPropagation()}
                                  size="sm"
                                  w="60px"
                                  textAlign="center"
                                />
                                <IconButton
                                  aria-label="Retirer"
                                  icon={<Icon as={MdDelete} />}
                                  size="sm"
                                  colorScheme="red"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleItemSelection(sn);
                                  }}
                                />
                              </HStack>
                            </HStack>
                          );
                        })}
                      </VStack>
                    </VStack>
                  )}

                  <TableContainer maxH="400px" overflowY="auto">
                    <Table size="sm">
                      <Thead position="sticky" top={0} bg={bg} zIndex={1}>
                        <Tr>
                          <Th w="40px"></Th>
                          <Th>Photo</Th>
                          <Th>Nom</Th>
                          <Th>Type</Th>
                          <Th>Marque/Modèle</Th>
                          <Th>Qté Dispo</Th>
                          <Th>Statut</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {availableItems.map(item => {
                          const isMatch = searchTerm && item.id ? matchedItemIds.has(item.id) : false;
                          const isContextOnly = searchTerm && !isMatch; // Parent affiché pour contexte
                          return (
                          <Tr 
                            key={item.serialNumber}
                            cursor="pointer"
                            bg={selectedItems.has(item.serialNumber) ? 'brand.50' : isMatch ? 'green.100' : isContextOnly ? 'gray.100' : undefined}
                            borderLeft={isMatch ? '4px solid' : undefined}
                            borderLeftColor={isMatch ? 'green.500' : undefined}
                            opacity={isContextOnly ? 0.6 : 1}
                            onClick={() => toggleItemSelection(item.serialNumber)}
                            _hover={{ bg: 'gray.50', opacity: 1 }}
                          >
                            <Td>
                              <Flex align="center" gap={1}>
                                {isMatch && (
                                  <Icon as={MdSearch} color="green.500" boxSize={4} />
                                )}
                                <Checkbox
                                  isChecked={selectedItems.has(item.serialNumber)}
                                  onChange={() => toggleItemSelection(item.serialNumber)}
                                />
                              </Flex>
                            </Td>
                            <Td>
                              {item.image ? (
                                <Image
                                  src={item.image}
                                  alt={item.name}
                                  w="40px"
                                  h="40px"
                                  objectFit="cover"
                                  borderRadius="md"
                                />
                              ) : (
                                <Box w="40px" h="40px" bg="gray.200" borderRadius="md" />
                              )}
                            </Td>
                            <Td>
                              <Text fontWeight="medium">{item.name}</Text>
                              <Text fontSize="xs" color="gray.500">{item.serialNumber}</Text>
                            </Td>
                            <Td>
                              <Badge>{item.itemType || item.category || '-'}</Badge>
                            </Td>
                            <Td>
                              <Text fontSize="sm">{item.brand || '-'}</Text>
                              <Text fontSize="xs" color="gray.500">{item.model || '-'}</Text>
                            </Td>
                            <Td>
                              <Badge colorScheme={item.quantity && item.quantity > 5 ? 'green' : 'orange'}>
                                {item.quantity || 1}
                              </Badge>
                            </Td>
                            <Td>
                              <Badge colorScheme="green">Disponible</Badge>
                            </Td>
                          </Tr>
                        );
                        })}
                      </Tbody>
                    </Table>
                  </TableContainer>
                </Card>
              </GridItem>

              {/* Formulaire de location */}
              <GridItem>
                <Card>
                  <Text fontSize="lg" fontWeight="bold" mb={4}>
                    2. Informations de location
                  </Text>

                  <VStack spacing={4} align="stretch">
                    <FormControl isRequired>
                      <FormLabel>Nom du locataire</FormLabel>
                      <Input
                        value={formData.renterName}
                        onChange={(e) => setFormData({ ...formData, renterName: e.target.value })}
                        placeholder="Nom complet"
                      />
                    </FormControl>

                    <HStack>
                      <FormControl isRequired>
                        <FormLabel>Email</FormLabel>
                        <Input
                          type="email"
                          value={formData.renterEmail}
                          onChange={(e) => setFormData({ ...formData, renterEmail: e.target.value })}
                          placeholder="email@exemple.com"
                        />
                      </FormControl>

                      <FormControl>
                        <FormLabel>Téléphone</FormLabel>
                        <Input
                          value={formData.renterPhone}
                          onChange={(e) => setFormData({ ...formData, renterPhone: e.target.value })}
                          placeholder="06 XX XX XX XX"
                        />
                      </FormControl>
                    </HStack>

                    <FormControl>
                      <FormLabel>Adresse</FormLabel>
                      <Textarea
                        value={formData.renterAddress}
                        onChange={(e) => setFormData({ ...formData, renterAddress: e.target.value })}
                        placeholder="Adresse complète"
                        rows={2}
                      />
                    </FormControl>

                    <Divider />

                    <HStack>
                      <FormControl isRequired>
                        <FormLabel>Date de début</FormLabel>
                        <Input
                          type="date"
                          value={formData.startDate}
                          onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                        />
                      </FormControl>

                      <FormControl isRequired>
                        <FormLabel>Date de fin</FormLabel>
                        <Input
                          type="date"
                          value={formData.endDate}
                          onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                          min={formData.startDate}
                        />
                      </FormControl>
                    </HStack>

                    <HStack>
                      <FormControl>
                        <FormLabel>Prix de location (€)</FormLabel>
                        <Input
                          type="number"
                          value={formData.rentalPrice}
                          onChange={(e) => setFormData({ ...formData, rentalPrice: parseFloat(e.target.value) || 0 })}
                          placeholder="0.00"
                        />
                      </FormControl>

                      <FormControl>
                        <FormLabel>Caution (€)</FormLabel>
                        <Input
                          type="number"
                          value={formData.rentalDeposit}
                          onChange={(e) => setFormData({ ...formData, rentalDeposit: parseFloat(e.target.value) || 0 })}
                          placeholder="0.00"
                        />
                      </FormControl>
                    </HStack>

                    <FormControl>
                      <FormLabel>Notes</FormLabel>
                      <Textarea
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Notes additionnelles..."
                        rows={3}
                      />
                    </FormControl>

                    <Button
                      colorScheme="brand"
                      size="lg"
                      onClick={handleCreateRental}
                      isDisabled={selectedItems.size === 0}
                      leftIcon={<Icon as={MdAdd} />}
                    >
                      Créer la location ({selectedItems.size} item{selectedItems.size > 1 ? 's' : ''})
                    </Button>
                  </VStack>
                </Card>
              </GridItem>
            </Grid>
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* Modal détails location - affiche toutes les infos remplies pour ce locataire */}
      <Modal isOpen={isDetailOpen} onClose={closeRentalDetail} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack align="center" flexWrap="wrap">
              <Text>Détails de la location</Text>
              {detailRental && (
                <>
                  <Text fontWeight="bold" color="brand.600">— {detailRental.renterName}</Text>
                  <Badge ml={2} colorScheme={STATUS_COLORS[getRentalStatus(detailRental)]}>
                    {STATUS_LABELS[getRentalStatus(detailRental)]}
                  </Badge>
                </>
              )}
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {detailRental && (
              <VStack spacing={4} align="stretch">
                <Box>
                  <Text fontWeight="bold" mb={2}>
                    <Icon as={MdPerson} mr={2} />
                    Locataire
                  </Text>
                  <VStack align="stretch" spacing={1} pl={6}>
                    <Text><strong>Nom :</strong> {detailRental.renterName}</Text>
                    <Text color="gray.600"><strong>Email :</strong> {detailRental.renterEmail}</Text>
                    <Text color="gray.600"><strong>Téléphone :</strong> {detailRental.renterPhone || '—'}</Text>
                    {detailRental.renterAddress && (
                      <Text color="gray.600"><strong>Adresse :</strong> {detailRental.renterAddress}</Text>
                    )}
                  </VStack>
                </Box>

                <Divider />

                <HStack justify="space-between" align="flex-start" flexWrap="wrap" gap={4}>
                  <Box>
                    <Text fontWeight="bold" mb={1}>Période</Text>
                    <Text>
                      {new Date(detailRental.startDate).toLocaleDateString('fr-FR')} →{' '}
                      {new Date(detailRental.endDate).toLocaleDateString('fr-FR')}
                    </Text>
                    <Text color="gray.500" fontSize="sm">({detailRental.rentalDuration} jours)</Text>
                  </Box>
                  <Box textAlign="right">
                    <Text fontWeight="bold" mb={1}>Tarifs</Text>
                    <Text>Location : {detailRental.rentalPrice}€</Text>
                    <Text color="orange.600">Caution : {detailRental.rentalDeposit}€</Text>
                  </Box>
                </HStack>

                <Divider />

                <Box>
                  <Text fontWeight="bold" mb={2}>Items loués ({detailRental.itemsData?.length || 0})</Text>
                  <VStack spacing={2} align="stretch">
                    {detailRental.itemsData?.map((item: any, index: number) => (
                      <HStack key={index} p={2} bg={cardBg} borderRadius="md">
                        <Box flex={1}>
                          <Text fontWeight="medium">{item.name}</Text>
                          <Text fontSize="sm" color="gray.500">
                            {item.brand} {item.model} • {item.serialNumber}
                          </Text>
                        </Box>
                        <Badge>{item.itemType}</Badge>
                      </HStack>
                    ))}
                  </VStack>
                </Box>

                {detailRental.notes && (
                  <>
                    <Divider />
                    <Box>
                      <Text fontWeight="bold" mb={2}>Notes</Text>
                      <Text whiteSpace="pre-wrap">{detailRental.notes}</Text>
                    </Box>
                  </>
                )}

                {detailRental.attachments && (
                  <>
                    <Divider />
                    <Box>
                      <Text fontWeight="bold" mb={2}>
                        <Icon as={MdAttachFile} mr={2} />
                        Pièces jointes
                      </Text>
                      <Text fontSize="sm" color="gray.600">{detailRental.attachments}</Text>
                    </Box>
                  </>
                )}
              </VStack>
            )}
          </ModalBody>
          <ModalFooter 
            display="flex" 
            flexDirection={{ base: 'column', md: 'row' }}
            gap={3}
            justifyContent="flex-end"
            alignItems="stretch"
          >
            {detailRental && (
              <>
                <Button
                  colorScheme="brand"
                  onClick={() => handleDownloadCautionDoc(detailRental.id)}
                  leftIcon={<Icon as={MdDownload} />}
                  size={{ base: 'sm', md: 'md' }}
                  flex={{ base: '1', md: 'initial' }}
                >
                  Contrat PDF
                </Button>
                {getRentalStatus(detailRental) === 'en_cours' && (
                  <Button
                    colorScheme="green"
                    onClick={() => {
                      handleEndRental(detailRental);
                      closeRentalDetail();
                    }}
                    leftIcon={<Icon as={MdCheckCircle} />}
                    size={{ base: 'sm', md: 'md' }}
                    flex={{ base: '1', md: 'initial' }}
                  >
                    Terminer
                  </Button>
                )}
              </>
            )}
            <Button 
              variant="ghost" 
              onClick={closeRentalDetail}
              size={{ base: 'sm', md: 'md' }}
              flex={{ base: '1', md: 'initial' }}
            >
              Fermer
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

// Composant carte de location
function RentalCard({
  rental,
  onView,
  onEnd,
  onDelete,
  isCompleted,
}: {
  rental: Rental;
  onView: () => void;
  onEnd?: () => void;
  onDelete: () => void;
  isCompleted?: boolean;
}) {
  const cardBg = useColorModeValue('gray.50', 'navy.700');
  
  return (
    <Box
      p={3}
      bg={cardBg}
      borderRadius="md"
      cursor="pointer"
      onClick={onView}
      _hover={{ shadow: 'md' }}
      opacity={isCompleted ? 0.7 : 1}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onView()}
    >
      <HStack justify="space-between" mb={2}>
        <VStack align="start" spacing={0}>
          <Text fontWeight="bold">{rental.renterName}</Text>
          <Text fontSize="xs" color="blue.500" fontStyle="italic">Cliquer pour voir les détails</Text>
        </VStack>
        <Text fontSize="sm" color="gray.500">
          {rental.rentalDeposit}€ caution
        </Text>
      </HStack>
      
      <Text fontSize="sm" color="gray.500" mb={2}>
        {new Date(rental.startDate).toLocaleDateString('fr-FR')} →{' '}
        {new Date(rental.endDate).toLocaleDateString('fr-FR')}
      </Text>
      
      <HStack flexWrap="wrap" gap={1} mb={2}>
        {rental.itemsData?.slice(0, 2).map((item: any, idx: number) => (
          <Badge key={idx} size="sm" variant="outline">
            {item.name}
          </Badge>
        ))}
        {(rental.itemsData?.length || 0) > 2 && (
          <Badge size="sm" variant="subtle">
            +{rental.itemsData.length - 2}
          </Badge>
        )}
      </HStack>

      <HStack justify="flex-end" spacing={2} onClick={(e) => e.stopPropagation()}>
        {onEnd && !isCompleted && (
          <Button size="xs" colorScheme="green" onClick={onEnd}>
            Terminer
          </Button>
        )}
        <Button size="xs" colorScheme="red" variant="ghost" onClick={onDelete}>
          <Icon as={MdDelete} />
        </Button>
      </HStack>
    </Box>
  );
}
