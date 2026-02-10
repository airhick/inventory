/**
 * EXEMPLE D'UTILISATION du composant ResizableTable
 * 
 * Ce fichier montre comment utiliser ResizableTable dans vos pages existantes
 */

import { ResizableTable, ResizableColumn } from './ResizableTable';
import { Badge, Image, Box, Text } from '@chakra-ui/react';

// Exemple 1: Table d'inventaire simple
function InventoryTableExample({ items }: { items: any[] }) {
  const columns: ResizableColumn[] = [
    {
      key: 'image',
      label: 'Photo',
      minWidth: 60,
      defaultWidth: 80,
      render: (item) => (
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
      minWidth: 100,
      defaultWidth: 200,
      render: (item) => (
        <Box>
          <Text fontWeight="medium">{item.name}</Text>
          <Text fontSize="xs" color="gray.500">{item.serialNumber}</Text>
        </Box>
      ),
    },
    {
      key: 'itemType',
      label: 'Type',
      minWidth: 80,
      defaultWidth: 120,
      render: (item) => <Badge>{item.itemType || item.category || '-'}</Badge>,
    },
    {
      key: 'brand',
      label: 'Marque/Modèle',
      minWidth: 100,
      defaultWidth: 150,
      render: (item) => (
        <Box>
          <Text fontSize="sm">{item.brand || '-'}</Text>
          <Text fontSize="xs" color="gray.500">{item.model || '-'}</Text>
        </Box>
      ),
    },
    {
      key: 'purchasePrice',
      label: 'Prix d'achat',
      minWidth: 80,
      defaultWidth: 120,
      render: (item) => item.purchasePrice ? `${item.purchasePrice}€` : '-',
    },
    {
      key: 'status',
      label: 'Statut',
      minWidth: 100,
      defaultWidth: 130,
      render: (item) => (
        <Badge
          colorScheme={
            item.status === 'en_stock' ? 'green' :
            item.status === 'loue' ? 'blue' :
            item.status === 'maintenance' ? 'orange' : 'gray'
          }
        >
          {item.status || 'En stock'}
        </Badge>
      ),
    },
  ];

  return (
    <ResizableTable
      columns={columns}
      data={items}
      storageKey="inventory" // Sauvegarde les largeurs dans localStorage
      onRowClick={(item) => {
        console.log('Item cliqué:', item);
        // Gérer le clic sur une ligne
      }}
    />
  );
}

// Exemple 2: Table de locations simple
function LocationTableExample({ rentals }: { rentals: any[] }) {
  const columns: ResizableColumn[] = [
    {
      key: 'renterName',
      label: 'Locataire',
      minWidth: 120,
      defaultWidth: 180,
      render: (rental) => (
        <Box>
          <Text fontWeight="bold">{rental.renterName}</Text>
          <Text fontSize="xs" color="gray.500">{rental.renterEmail}</Text>
        </Box>
      ),
    },
    {
      key: 'dates',
      label: 'Période',
      minWidth: 150,
      defaultWidth: 200,
      render: (rental) => (
        <Box>
          <Text fontSize="sm">
            {new Date(rental.startDate).toLocaleDateString('fr-FR')} →{' '}
            {new Date(rental.endDate).toLocaleDateString('fr-FR')}
          </Text>
          <Text fontSize="xs" color="gray.500">
            {rental.rentalDuration} jours
          </Text>
        </Box>
      ),
    },
    {
      key: 'items',
      label: 'Items',
      minWidth: 100,
      defaultWidth: 150,
      render: (rental) => (
        <Text fontSize="sm">
          {rental.itemsData?.length || 0} item(s)
        </Text>
      ),
    },
    {
      key: 'price',
      label: 'Prix / Caution',
      minWidth: 100,
      defaultWidth: 130,
      render: (rental) => (
        <Box>
          <Text fontSize="sm">{rental.rentalPrice}€</Text>
          <Text fontSize="xs" color="orange.600">{rental.rentalDeposit}€ caution</Text>
        </Box>
      ),
    },
    {
      key: 'status',
      label: 'Statut',
      minWidth: 100,
      defaultWidth: 120,
      render: (rental) => {
        const statusColors: Record<string, string> = {
          en_cours: 'blue',
          a_venir: 'purple',
          termine: 'green',
          annule: 'red',
        };
        const statusLabels: Record<string, string> = {
          en_cours: 'En cours',
          a_venir: 'À venir',
          termine: 'Terminé',
          annule: 'Annulé',
        };
        return (
          <Badge colorScheme={statusColors[rental.status] || 'gray'}>
            {statusLabels[rental.status] || rental.status}
          </Badge>
        );
      },
    },
  ];

  return (
    <ResizableTable
      columns={columns}
      data={rentals}
      storageKey="locations" // Sauvegarde les largeurs dans localStorage
      onRowClick={(rental) => {
        console.log('Location cliquée:', rental);
        // Ouvrir le modal de détails par exemple
      }}
    />
  );
}

/**
 * COMMENT REMPLACER VOS TABLES EXISTANTES :
 * 
 * 1. Dans votre fichier, importez le composant :
 *    import { ResizableTable, ResizableColumn } from 'components/table/ResizableTable';
 * 
 * 2. Définissez vos colonnes :
 *    const columns: ResizableColumn[] = [
 *      { key: 'name', label: 'Nom', defaultWidth: 200, minWidth: 100 },
 *      { key: 'status', label: 'Statut', defaultWidth: 120 },
 *    ];
 * 
 * 3. Remplacez votre <TableContainer><Table>... par :
 *    <ResizableTable
 *      columns={columns}
 *      data={items}
 *      storageKey="unique-key"
 *      onRowClick={(item) => handleItemClick(item)}
 *    />
 * 
 * 4. Si vous aviez des props personnalisées sur <Table>, passez-les via tableProps :
 *    <ResizableTable
 *      columns={columns}
 *      data={items}
 *      tableProps={{ size: 'sm', variant: 'simple' }}
 *      theadProps={{ position: 'sticky', top: 0 }}
 *    />
 */

export { InventoryTableExample, LocationTableExample };
