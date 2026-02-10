# Composants de Table Redimensionnable

Ce dossier contient des composants de table avec colonnes redimensionnables par glisser-déposer (drag).

## 📦 Fichiers

- **`ResizableTable.tsx`** - Composant de base réutilisable
- **`RentalsTable.tsx`** - Table spécialisée pour les locations
- **`USAGE_EXAMPLE.tsx`** - Exemples d'utilisation
- **`README.md`** - Cette documentation

## 🎯 Fonctionnalités

✅ **Colonnes redimensionnables** - Glissez le bord droit d'une colonne pour la redimensionner  
✅ **Indicateur visuel** - Ligne bleue qui apparaît au survol du bord  
✅ **Largeur minimale** - Empêche les colonnes de devenir trop petites  
✅ **Sauvegarde automatique** - Les largeurs sont sauvegardées dans localStorage  
✅ **Rendu personnalisé** - Contenu riche dans chaque cellule (images, badges, etc.)  
✅ **Responsive** - S'adapte à différentes tailles d'écran  

## 🚀 Utilisation rapide

### Exemple 1: Table simple

```tsx
import { ResizableTable, ResizableColumn } from 'components/table/ResizableTable';

const columns: ResizableColumn[] = [
  {
    key: 'name',
    label: 'Nom',
    minWidth: 100,
    defaultWidth: 200,
  },
  {
    key: 'email',
    label: 'Email',
    minWidth: 150,
    defaultWidth: 250,
  },
];

<ResizableTable
  columns={columns}
  data={items}
  storageKey="my-table"
  onRowClick={(item) => console.log('Cliqué:', item)}
/>
```

### Exemple 2: Avec rendu personnalisé

```tsx
const columns: ResizableColumn[] = [
  {
    key: 'user',
    label: 'Utilisateur',
    minWidth: 150,
    defaultWidth: 220,
    render: (item) => (
      <Box>
        <Text fontWeight="bold">{item.name}</Text>
        <Text fontSize="xs" color="gray.500">{item.email}</Text>
      </Box>
    ),
  },
  {
    key: 'status',
    label: 'Statut',
    minWidth: 100,
    defaultWidth: 130,
    render: (item) => (
      <Badge colorScheme={item.active ? 'green' : 'red'}>
        {item.active ? 'Actif' : 'Inactif'}
      </Badge>
    ),
  },
];
```

## 📝 Props de ResizableTable

| Prop | Type | Obligatoire | Description |
|------|------|-------------|-------------|
| `columns` | `ResizableColumn[]` | ✅ | Définition des colonnes |
| `data` | `any[]` | ✅ | Données à afficher |
| `storageKey` | `string` | ❌ | Clé pour sauvegarder les largeurs (localStorage) |
| `onRowClick` | `(item, index) => void` | ❌ | Fonction appelée au clic sur une ligne |
| `highlightedRowIndex` | `number` | ❌ | Index de la ligne à mettre en surbrillance |
| `tableProps` | `object` | ❌ | Props supplémentaires pour `<Table>` |
| `theadProps` | `object` | ❌ | Props supplémentaires pour `<Thead>` |
| `tbodyProps` | `object` | ❌ | Props supplémentaires pour `<Tbody>` |

## 🔧 Interface ResizableColumn

```tsx
interface ResizableColumn {
  key: string;                              // Clé unique de la colonne
  label: ReactNode;                         // Libellé affiché dans l'en-tête
  minWidth?: number;                        // Largeur minimale (défaut: 50px)
  defaultWidth?: number;                    // Largeur par défaut (défaut: 150px)
  render?: (item: any, index: number) => ReactNode;  // Fonction de rendu personnalisé
}
```

## 🎨 Comment redimensionner

1. **Survolez** le bord droit d'un en-tête de colonne
2. Le **curseur change** en curseur de redimensionnement (↔)
3. **Cliquez et glissez** vers la gauche ou la droite
4. **Relâchez** pour fixer la nouvelle largeur
5. Les largeurs sont **automatiquement sauvegardées** (si `storageKey` est défini)

## 🔄 Remplacer vos tables existantes

### Avant (Table Chakra UI standard):

```tsx
<TableContainer>
  <Table size="sm">
    <Thead>
      <Tr>
        <Th>Nom</Th>
        <Th>Email</Th>
        <Th>Statut</Th>
      </Tr>
    </Thead>
    <Tbody>
      {items.map(item => (
        <Tr key={item.id} onClick={() => handleClick(item)}>
          <Td>{item.name}</Td>
          <Td>{item.email}</Td>
          <Td><Badge>{item.status}</Badge></Td>
        </Tr>
      ))}
    </Tbody>
  </Table>
</TableContainer>
```

### Après (ResizableTable):

```tsx
import { ResizableTable, ResizableColumn } from 'components/table/ResizableTable';

const columns: ResizableColumn[] = [
  { key: 'name', label: 'Nom', defaultWidth: 200 },
  { key: 'email', label: 'Email', defaultWidth: 250 },
  { 
    key: 'status', 
    label: 'Statut', 
    defaultWidth: 130,
    render: (item) => <Badge>{item.status}</Badge>
  },
];

<ResizableTable
  columns={columns}
  data={items}
  storageKey="users-table"
  onRowClick={handleClick}
  tableProps={{ size: 'sm' }}
/>
```

## 🎯 Tables spécialisées disponibles

### RentalsTable

Table optimisée pour afficher les locations avec colonnes pré-configurées:

```tsx
import { RentalsTable } from 'components/table/RentalsTable';

<RentalsTable
  rentals={rentals}
  onRowClick={(rental) => openDetailModal(rental)}
  highlightedId={selectedRentalId}
/>
```

## 💡 Astuces

1. **Largeur minimale** - Utilisez `minWidth` pour empêcher les colonnes d'être trop étroites
2. **StorageKey unique** - Chaque table devrait avoir un `storageKey` unique
3. **Rendu personnalisé** - Utilisez `render` pour un contenu riche (images, badges, liens, etc.)
4. **Sticky header** - Pour fixer l'en-tête: `theadProps={{ position: 'sticky', top: 0, bg: 'white', zIndex: 1 }}`
5. **Réinitialiser les largeurs** - Supprimez la clé du localStorage: `localStorage.removeItem('resizable-table-YOUR-KEY')`

## 🐛 Dépannage

**Les largeurs ne se sauvegardent pas ?**
- Vérifiez que `storageKey` est défini
- Vérifiez que localStorage est disponible (pas en mode privé)

**Les colonnes sont trop larges/petites ?**
- Ajustez `defaultWidth` et `minWidth` dans la définition des colonnes
- Ou supprimez les largeurs sauvegardées: `localStorage.removeItem('resizable-table-YOUR-KEY')`

**Le contenu déborde ?**
- Les cellules ont `overflow: hidden` et `text-overflow: ellipsis` par défaut
- Pour afficher plus de contenu, augmentez la `defaultWidth` de la colonne

## 📚 Exemples complets

Voir `USAGE_EXAMPLE.tsx` pour des exemples complets avec:
- Table d'inventaire
- Table de locations
- Rendu personnalisé avancé
