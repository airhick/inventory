'use client';
/**
 * Tableau d'inventaire avec colonnes redimensionnables
 * À utiliser dans la page inventory pour remplacer le tableau existant
 */

import { ResizableTable, ResizableColumn } from './ResizableTable';
import { Badge, Image, Box, Text, IconButton, Icon, HStack } from '@chakra-ui/react';
import { MdEdit, MdDelete } from 'react-icons/md';

interface Item {
  serialNumber: string;
  name: string;
  brand?: string;
  model?: string;
  itemType?: string;
  category?: string;
  purchasePrice?: number;
  rentalPrice?: number;
  status?: string;
  image?: string;
  customFields?: Record<string, any>;
  [key: string]: any;
}

interface InventoryTableProps {
  items: Item[];
  onRowClick?: (item: Item) => void;
  onEdit?: (item: Item, e: React.MouseEvent) => void;
  onDelete?: (item: Item, e: React.MouseEvent) => void;
  highlightedSerialNumber?: string;
  showActions?: boolean;
  visibleColumns?: string[]; // Pour contrôler quelles colonnes afficher
}

const STATUS_COLORS: Record<string, string> = {
  en_stock: 'green',
  loue: 'blue',
  maintenance: 'orange',
  vendu: 'purple',
  perdu: 'red',
};

const STATUS_LABELS: Record<string, string> = {
  en_stock: 'En stock',
  loue: 'Loué',
  maintenance: 'Maintenance',
  vendu: 'Vendu',
  perdu: 'Perdu',
};

export function InventoryTable({ 
  items, 
  onRowClick, 
  onEdit, 
  onDelete,
  highlightedSerialNumber,
  showActions = true,
  visibleColumns,
}: InventoryTableProps) {
  
  // Définition de toutes les colonnes disponibles
  const allColumns: ResizableColumn[] = [
    {
      key: 'image',
      label: 'Photo',
      minWidth: 60,
      defaultWidth: 80,
      render: (item: Item) => (
        item.image ? (
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
        )
      ),
    },
    {
      key: 'name',
      label: 'Nom',
      minWidth: 150,
      defaultWidth: 250,
      render: (item: Item) => (
        <Box>
          <Text fontWeight="medium" fontSize="sm" noOfLines={2}>
            {item.name}
          </Text>
          <Text fontSize="xs" color="gray.500" fontFamily="mono">
            {item.serialNumber}
          </Text>
        </Box>
      ),
    },
    {
      key: 'itemType',
      label: 'Type',
      minWidth: 80,
      defaultWidth: 120,
      render: (item: Item) => (
        <Badge colorScheme="blue" fontSize="xs">
          {item.itemType || item.category || '-'}
        </Badge>
      ),
    },
    {
      key: 'brand',
      label: 'Marque / Modèle',
      minWidth: 120,
      defaultWidth: 180,
      render: (item: Item) => (
        <Box>
          <Text fontSize="sm" fontWeight="medium">
            {item.brand || '-'}
          </Text>
          {item.model && (
            <Text fontSize="xs" color="gray.500">
              {item.model}
            </Text>
          )}
        </Box>
      ),
    },
    {
      key: 'purchasePrice',
      label: 'Prix d\'achat',
      minWidth: 100,
      defaultWidth: 130,
      render: (item: Item) => (
        <Text fontSize="sm" fontWeight="medium" color="green.600">
          {item.purchasePrice ? `${item.purchasePrice}€` : '-'}
        </Text>
      ),
    },
    {
      key: 'rentalPrice',
      label: 'Prix location',
      minWidth: 100,
      defaultWidth: 130,
      render: (item: Item) => (
        <Text fontSize="sm" fontWeight="medium" color="blue.600">
          {item.rentalPrice ? `${item.rentalPrice}€/j` : '-'}
        </Text>
      ),
    },
    {
      key: 'status',
      label: 'Statut',
      minWidth: 100,
      defaultWidth: 130,
      render: (item: Item) => {
        const status = item.status || 'en_stock';
        return (
          <Badge
            colorScheme={STATUS_COLORS[status] || 'gray'}
            fontSize="xs"
            px={2}
            py={1}
            borderRadius="md"
          >
            {STATUS_LABELS[status] || status}
          </Badge>
        );
      },
    },
  ];

  // Ajouter la colonne Actions si nécessaire
  if (showActions && (onEdit || onDelete)) {
    allColumns.push({
      key: 'actions',
      label: 'Actions',
      minWidth: 80,
      defaultWidth: 100,
      render: (item: Item) => (
        <HStack spacing={1} onClick={(e) => e.stopPropagation()}>
          {onEdit && (
            <IconButton
              aria-label="Modifier"
              icon={<Icon as={MdEdit} />}
              size="sm"
              variant="ghost"
              colorScheme="brand"
              onClick={(e) => onEdit(item, e)}
            />
          )}
          {onDelete && (
            <IconButton
              aria-label="Supprimer"
              icon={<Icon as={MdDelete} />}
              size="sm"
              variant="ghost"
              colorScheme="red"
              onClick={(e) => onDelete(item, e)}
            />
          )}
        </HStack>
      ),
    });
  }

  // Filtrer les colonnes si visibleColumns est défini
  const columns = visibleColumns
    ? allColumns.filter(col => visibleColumns.includes(col.key))
    : allColumns;

  return (
    <ResizableTable
      columns={columns}
      data={items}
      storageKey="inventory-items"
      onRowClick={onRowClick}
      highlightedRowIndex={items.findIndex(i => i.serialNumber === highlightedSerialNumber)}
      tableProps={{ size: 'sm', variant: 'simple' }}
      theadProps={{ 
        position: 'sticky', 
        top: 0, 
        bg: 'white', 
        zIndex: 1,
        boxShadow: 'sm',
      }}
    />
  );
}

export default InventoryTable;
