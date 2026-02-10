'use client';
/**
 * Tableau de locations avec colonnes redimensionnables
 * À utiliser dans la page location pour remplacer le tableau existant
 */

import { ResizableTable, ResizableColumn } from './ResizableTable';
import { Badge, Box, Text } from '@chakra-ui/react';

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

interface RentalsTableProps {
  rentals: Rental[];
  onRowClick?: (rental: Rental) => void;
  highlightedId?: number;
}

export function RentalsTable({ rentals, onRowClick, highlightedId }: RentalsTableProps) {
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

  const columns: ResizableColumn[] = [
    {
      key: 'renterName',
      label: 'Locataire',
      minWidth: 150,
      defaultWidth: 220,
      render: (rental: Rental) => (
        <Box>
          <Text fontWeight="bold" fontSize="sm">{rental.renterName}</Text>
          <Text fontSize="xs" color="gray.500">{rental.renterEmail}</Text>
          {rental.renterPhone && (
            <Text fontSize="xs" color="gray.500">{rental.renterPhone}</Text>
          )}
        </Box>
      ),
    },
    {
      key: 'dates',
      label: 'Période de location',
      minWidth: 180,
      defaultWidth: 240,
      render: (rental: Rental) => (
        <Box>
          <Text fontSize="sm" fontWeight="medium">
            {new Date(rental.startDate).toLocaleDateString('fr-FR', { 
              day: 'numeric', 
              month: 'short',
              year: 'numeric'
            })}
            {' → '}
            {new Date(rental.endDate).toLocaleDateString('fr-FR', { 
              day: 'numeric', 
              month: 'short',
              year: 'numeric'
            })}
          </Text>
          <Text fontSize="xs" color="gray.500">
            📅 {rental.rentalDuration} jour{rental.rentalDuration > 1 ? 's' : ''}
          </Text>
        </Box>
      ),
    },
    {
      key: 'items',
      label: 'Items loués',
      minWidth: 120,
      defaultWidth: 180,
      render: (rental: Rental) => (
        <Box>
          <Text fontSize="sm" fontWeight="medium">
            📦 {rental.itemsData?.length || 0} item{(rental.itemsData?.length || 0) > 1 ? 's' : ''}
          </Text>
          {rental.itemsData && rental.itemsData.length > 0 && (
            <Text fontSize="xs" color="gray.500" noOfLines={2}>
              {rental.itemsData.slice(0, 2).map(item => item.name).join(', ')}
              {rental.itemsData.length > 2 && ` +${rental.itemsData.length - 2}`}
            </Text>
          )}
        </Box>
      ),
    },
    {
      key: 'pricing',
      label: 'Prix / Caution',
      minWidth: 120,
      defaultWidth: 150,
      render: (rental: Rental) => (
        <Box>
          <Text fontSize="sm" fontWeight="bold">
            💰 {rental.rentalPrice}€
          </Text>
          <Text fontSize="xs" color="orange.600" fontWeight="medium">
            🔒 {rental.rentalDeposit}€ caution
          </Text>
        </Box>
      ),
    },
    {
      key: 'status',
      label: 'Statut',
      minWidth: 100,
      defaultWidth: 130,
      render: (rental: Rental) => {
        const status = getRentalStatus(rental);
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
    {
      key: 'notes',
      label: 'Notes',
      minWidth: 100,
      defaultWidth: 200,
      render: (rental: Rental) => (
        <Text fontSize="xs" color="gray.600" noOfLines={2}>
          {rental.notes || '—'}
        </Text>
      ),
    },
  ];

  return (
    <ResizableTable
      columns={columns}
      data={rentals}
      storageKey="rentals-list"
      onRowClick={onRowClick}
      highlightedRowIndex={rentals.findIndex(r => r.id === highlightedId)}
      tableProps={{ size: 'sm', variant: 'simple' }}
      theadProps={{ position: 'sticky', top: 0, bg: 'white', zIndex: 1 }}
    />
  );
}

export default RentalsTable;
