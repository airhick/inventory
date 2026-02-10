'use client';
/**
 * Filtres avancés pour le tableau - style Supabase
 * Permet de filtrer et trier par n'importe quelle colonne
 */

import {
  Box,
  Button,
  VStack,
  HStack,
  Text,
  IconButton,
  Input,
  Select,
  FormControl,
  FormLabel,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  Badge,
  Flex,
  Tooltip,
  Icon,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  Checkbox,
  CheckboxGroup,
  Stack,
} from '@chakra-ui/react';
import { useState, useMemo } from 'react';
import { 
  MdFilterList, 
  MdClose, 
  MdAdd, 
  MdArrowUpward, 
  MdArrowDownward,
  MdSort,
} from 'react-icons/md';
import type { CustomField } from 'lib/api';

export interface FilterRule {
  id: string;
  column: string;
  columnType: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'greaterThan' | 'lessThan' | 'in' | 'notEmpty' | 'isEmpty';
  value: string | string[];
}

export interface SortRule {
  column: string;
  direction: 'asc' | 'desc';
}

interface AdvancedFiltersProps {
  columns: CustomField[];
  standardColumns?: Array<{ key: string; label: string; type: string; options?: string[] }>;
  filters: FilterRule[];
  sorts: SortRule[];
  onFiltersChange: (filters: FilterRule[]) => void;
  onSortsChange: (sorts: SortRule[]) => void;
  onApply: () => void;
}

const OPERATOR_LABELS: Record<string, string> = {
  equals: 'Est égal à',
  contains: 'Contient',
  startsWith: 'Commence par',
  greaterThan: 'Plus grand que',
  lessThan: 'Plus petit que',
  in: 'Dans la liste',
  notEmpty: 'N\'est pas vide',
  isEmpty: 'Est vide',
};

const OPERATORS_BY_TYPE: Record<string, string[]> = {
  text: ['equals', 'contains', 'startsWith', 'notEmpty', 'isEmpty'],
  number: ['equals', 'greaterThan', 'lessThan', 'notEmpty', 'isEmpty'],
  date: ['equals', 'greaterThan', 'lessThan', 'notEmpty', 'isEmpty'],
  select: ['equals', 'in', 'notEmpty', 'isEmpty'],
  checkbox: ['equals'],
  textarea: ['contains', 'notEmpty', 'isEmpty'],
  url: ['equals', 'contains', 'notEmpty', 'isEmpty'],
  email: ['equals', 'contains', 'notEmpty', 'isEmpty'],
};

export function AdvancedFilters({
  columns,
  standardColumns = [],
  filters,
  sorts,
  onFiltersChange,
  onSortsChange,
  onApply,
}: AdvancedFiltersProps) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [editingFilters, setEditingFilters] = useState<FilterRule[]>(filters);
  const [editingSorts, setEditingSorts] = useState<SortRule[]>(sorts);

  // Combiner les colonnes standard et personnalisées
  const allColumns = useMemo(() => {
    const standard = standardColumns.map(col => ({
      key: col.key,
      label: col.label,
      type: col.type,
      options: col.options,
    }));
    
    const custom = columns.map(col => ({
      key: col.fieldKey,
      label: col.name,
      type: col.fieldType,
      options: col.options,
    }));
    
    return [...standard, ...custom];
  }, [columns, standardColumns]);

  const getColumnByKey = (key: string) => {
    return allColumns.find(col => col.key === key);
  };

  const addFilter = () => {
    const newFilter: FilterRule = {
      id: `filter-${Date.now()}`,
      column: allColumns[0]?.key || '',
      columnType: allColumns[0]?.type || 'text',
      operator: 'contains',
      value: '',
    };
    setEditingFilters([...editingFilters, newFilter]);
  };

  const updateFilter = (id: string, updates: Partial<FilterRule>) => {
    setEditingFilters(editingFilters.map(filter => {
      if (filter.id === id) {
        const updated = { ...filter, ...updates };
        
        // Si la colonne change, mettre à jour le type et l'opérateur
        if (updates.column && updates.column !== filter.column) {
          const column = getColumnByKey(updates.column);
          if (column) {
            updated.columnType = column.type;
            const validOps = OPERATORS_BY_TYPE[column.type] || ['equals'];
            updated.operator = validOps[0] as any;
            updated.value = '';
          }
        }
        
        return updated;
      }
      return filter;
    }));
  };

  const removeFilter = (id: string) => {
    setEditingFilters(editingFilters.filter(f => f.id !== id));
  };

  const addSort = () => {
    if (allColumns.length === 0) return;
    
    const newSort: SortRule = {
      column: allColumns[0].key,
      direction: 'asc',
    };
    setEditingSorts([...editingSorts, newSort]);
  };

  const updateSort = (index: number, updates: Partial<SortRule>) => {
    setEditingSorts(editingSorts.map((sort, i) => {
      if (i === index) {
        return { ...sort, ...updates };
      }
      return sort;
    }));
  };

  const removeSort = (index: number) => {
    setEditingSorts(editingSorts.filter((_, i) => i !== index));
  };

  const handleApply = () => {
    onFiltersChange(editingFilters);
    onSortsChange(editingSorts);
    onApply();
    onClose();
  };

  const handleReset = () => {
    setEditingFilters([]);
    setEditingSorts([]);
    onFiltersChange([]);
    onSortsChange([]);
    onApply();
  };

  const openModal = () => {
    setEditingFilters(filters);
    setEditingSorts(sorts);
    onOpen();
  };

  const activeFiltersCount = filters.length;
  const activeSortsCount = sorts.length;

  return (
    <>
      <Button
        leftIcon={<MdFilterList />}
        onClick={openModal}
        size="sm"
        variant="outline"
        position="relative"
      >
        Filtres et Tri
        {(activeFiltersCount > 0 || activeSortsCount > 0) && (
          <Badge
            position="absolute"
            top="-8px"
            right="-8px"
            colorScheme="red"
            borderRadius="full"
            fontSize="xs"
          >
            {activeFiltersCount + activeSortsCount}
          </Badge>
        )}
      </Button>

      <Modal isOpen={isOpen} onClose={onClose} size="3xl" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack>
              <Icon as={MdFilterList} />
              <Text>Filtres et Tri</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          
          <ModalBody>
            <VStack align="stretch" spacing={6}>
              {/* Section Filtres */}
              <Box>
                <HStack justify="space-between" mb={3}>
                  <Text fontSize="md" fontWeight="bold">
                    Filtres
                  </Text>
                  <Button
                    leftIcon={<MdAdd />}
                    size="sm"
                    colorScheme="blue"
                    onClick={addFilter}
                  >
                    Ajouter un filtre
                  </Button>
                </HStack>

                {editingFilters.length === 0 ? (
                  <Box p={6} textAlign="center" bg="gray.50" borderRadius="md">
                    <Text color="gray.500" fontSize="sm">
                      Aucun filtre actif
                    </Text>
                  </Box>
                ) : (
                  <VStack align="stretch" spacing={3}>
                    {editingFilters.map((filter, index) => (
                      <FilterRow
                        key={filter.id}
                        filter={filter}
                        columns={allColumns}
                        onUpdate={(updates) => updateFilter(filter.id, updates)}
                        onRemove={() => removeFilter(filter.id)}
                        showAnd={index > 0}
                      />
                    ))}
                  </VStack>
                )}
              </Box>

              {/* Section Tri */}
              <Box>
                <HStack justify="space-between" mb={3}>
                  <Text fontSize="md" fontWeight="bold">
                    Ordre de tri
                  </Text>
                  <Button
                    leftIcon={<MdAdd />}
                    size="sm"
                    colorScheme="purple"
                    onClick={addSort}
                  >
                    Ajouter un tri
                  </Button>
                </HStack>

                {editingSorts.length === 0 ? (
                  <Box p={6} textAlign="center" bg="gray.50" borderRadius="md">
                    <Text color="gray.500" fontSize="sm">
                      Aucun tri actif
                    </Text>
                  </Box>
                ) : (
                  <VStack align="stretch" spacing={3}>
                    {editingSorts.map((sort, index) => (
                      <SortRow
                        key={index}
                        sort={sort}
                        columns={allColumns}
                        onUpdate={(updates) => updateSort(index, updates)}
                        onRemove={() => removeSort(index)}
                        showThen={index > 0}
                      />
                    ))}
                  </VStack>
                )}
              </Box>
            </VStack>
          </ModalBody>

          <ModalFooter>
            <HStack spacing={2}>
              <Button
                variant="ghost"
                onClick={handleReset}
                isDisabled={editingFilters.length === 0 && editingSorts.length === 0}
              >
                Réinitialiser
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Annuler
              </Button>
              <Button colorScheme="brand" onClick={handleApply}>
                Appliquer
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

// Composant pour une ligne de filtre
interface FilterRowProps {
  filter: FilterRule;
  columns: Array<{ key: string; label: string; type: string; options?: string[] }>;
  onUpdate: (updates: Partial<FilterRule>) => void;
  onRemove: () => void;
  showAnd: boolean;
}

function FilterRow({ filter, columns, onUpdate, onRemove, showAnd }: FilterRowProps) {
  const column = columns.find(col => col.key === filter.column);
  const operators = OPERATORS_BY_TYPE[filter.columnType] || ['equals'];

  return (
    <Box>
      {showAnd && (
        <Text fontSize="xs" fontWeight="bold" color="blue.600" mb={1} ml={2}>
          ET
        </Text>
      )}
      <Flex
        p={3}
        bg="white"
        borderWidth="1px"
        borderRadius="md"
        gap={2}
        align="center"
      >
        <FormControl flex={1}>
          <Select
            size="sm"
            value={filter.column}
            onChange={(e) => onUpdate({ column: e.target.value })}
          >
            {columns.map(col => (
              <option key={col.key} value={col.key}>
                {col.label}
              </option>
            ))}
          </Select>
        </FormControl>

        <FormControl flex={1}>
          <Select
            size="sm"
            value={filter.operator}
            onChange={(e) => onUpdate({ operator: e.target.value as any })}
          >
            {operators.map(op => (
              <option key={op} value={op}>
                {OPERATOR_LABELS[op]}
              </option>
            ))}
          </Select>
        </FormControl>

        {filter.operator !== 'notEmpty' && filter.operator !== 'isEmpty' && (
          <FormControl flex={1}>
            {filter.operator === 'in' && column?.options ? (
              <Menu closeOnSelect={false}>
                <MenuButton
                  as={Button}
                  size="sm"
                  variant="outline"
                  textAlign="left"
                  fontWeight="normal"
                >
                  {Array.isArray(filter.value) && filter.value.length > 0
                    ? `${filter.value.length} sélectionné(s)`
                    : 'Sélectionner...'}
                </MenuButton>
                <MenuList maxH="300px" overflowY="auto">
                  <Box px={3} py={2}>
                    <CheckboxGroup
                      value={Array.isArray(filter.value) ? filter.value : []}
                      onChange={(values) => onUpdate({ value: values as string[] })}
                    >
                      <Stack spacing={2}>
                        {column.options.map(option => (
                          <Checkbox key={option} value={option}>
                            {option}
                          </Checkbox>
                        ))}
                      </Stack>
                    </CheckboxGroup>
                  </Box>
                </MenuList>
              </Menu>
            ) : filter.columnType === 'select' && column?.options ? (
              <Select
                size="sm"
                value={typeof filter.value === 'string' ? filter.value : ''}
                onChange={(e) => onUpdate({ value: e.target.value })}
              >
                <option value="">Sélectionner...</option>
                {column.options.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            ) : filter.columnType === 'checkbox' ? (
              <Select
                size="sm"
                value={typeof filter.value === 'string' ? filter.value : ''}
                onChange={(e) => onUpdate({ value: e.target.value })}
              >
                <option value="">Sélectionner...</option>
                <option value="true">Oui</option>
                <option value="false">Non</option>
              </Select>
            ) : (
              <Input
                size="sm"
                type={filter.columnType === 'number' ? 'number' : filter.columnType === 'date' ? 'date' : 'text'}
                placeholder="Valeur..."
                value={typeof filter.value === 'string' ? filter.value : ''}
                onChange={(e) => onUpdate({ value: e.target.value })}
              />
            )}
          </FormControl>
        )}

        <Tooltip label="Supprimer">
          <IconButton
            aria-label="Supprimer"
            icon={<MdClose />}
            size="sm"
            variant="ghost"
            colorScheme="red"
            onClick={onRemove}
          />
        </Tooltip>
      </Flex>
    </Box>
  );
}

// Composant pour une ligne de tri
interface SortRowProps {
  sort: SortRule;
  columns: Array<{ key: string; label: string; type: string }>;
  onUpdate: (updates: Partial<SortRule>) => void;
  onRemove: () => void;
  showThen: boolean;
}

function SortRow({ sort, columns, onUpdate, onRemove, showThen }: SortRowProps) {
  return (
    <Box>
      {showThen && (
        <Text fontSize="xs" fontWeight="bold" color="purple.600" mb={1} ml={2}>
          PUIS
        </Text>
      )}
      <Flex
        p={3}
        bg="white"
        borderWidth="1px"
        borderRadius="md"
        gap={2}
        align="center"
      >
        <FormControl flex={1}>
          <Select
            size="sm"
            value={sort.column}
            onChange={(e) => onUpdate({ column: e.target.value })}
          >
            {columns.map(col => (
              <option key={col.key} value={col.key}>
                {col.label}
              </option>
            ))}
          </Select>
        </FormControl>

        <FormControl flex="0 0 200px">
          <Select
            size="sm"
            value={sort.direction}
            onChange={(e) => onUpdate({ direction: e.target.value as 'asc' | 'desc' })}
          >
            <option value="asc">↑ Croissant (A-Z, 1-9)</option>
            <option value="desc">↓ Décroissant (Z-A, 9-1)</option>
          </Select>
        </FormControl>

        <Tooltip label="Supprimer">
          <IconButton
            aria-label="Supprimer"
            icon={<MdClose />}
            size="sm"
            variant="ghost"
            colorScheme="red"
            onClick={onRemove}
          />
        </Tooltip>
      </Flex>
    </Box>
  );
}

export default AdvancedFilters;
