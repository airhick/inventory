'use client';
/**
 * Gestionnaire de colonnes dynamiques - style Supabase
 * Permet d'ajouter, supprimer, et configurer des colonnes personnalisées
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
  useToast,
  Badge,
  Flex,
  Textarea,
  Divider,
  Tooltip,
  Icon,
} from '@chakra-ui/react';
import { useState } from 'react';
import { MdAdd, MdDelete, MdEdit, MdDragIndicator, MdSettings } from 'react-icons/md';
import type { CustomField } from 'lib/api';

export interface ColumnDefinition {
  id: number;
  name: string;
  fieldKey: string;
  fieldType: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'textarea' | 'url' | 'email';
  options?: string[];
  required: boolean;
  displayOrder: number;
}

interface ColumnManagerProps {
  columns: CustomField[];
  onAddColumn: (column: { 
    name: string; 
    fieldType: string; 
    options?: string[]; 
    required: boolean;
  }) => Promise<void>;
  onUpdateColumn: (id: number, updates: Partial<ColumnDefinition>) => Promise<void>;
  onDeleteColumn: (id: number) => Promise<void>;
  isOpen: boolean;
  onClose: () => void;
}

const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Texte', icon: '📝' },
  { value: 'number', label: 'Nombre', icon: '🔢' },
  { value: 'date', label: 'Date', icon: '📅' },
  { value: 'select', label: 'Liste déroulante', icon: '📋' },
  { value: 'checkbox', label: 'Case à cocher', icon: '☑️' },
  { value: 'textarea', label: 'Texte long', icon: '📄' },
  { value: 'url', label: 'URL', icon: '🔗' },
  { value: 'email', label: 'Email', icon: '✉️' },
];

export function ColumnManager({
  columns,
  onAddColumn,
  onUpdateColumn,
  onDeleteColumn,
  isOpen,
  onClose,
}: ColumnManagerProps) {
  const toast = useToast();
  const { 
    isOpen: isAddModalOpen, 
    onOpen: onAddModalOpen, 
    onClose: onAddModalClose 
  } = useDisclosure();
  
  const [newColumn, setNewColumn] = useState({
    name: '',
    fieldType: 'text',
    options: [] as string[],
    required: false,
  });
  
  const [optionsText, setOptionsText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingColumn, setEditingColumn] = useState<CustomField | null>(null);

  const handleAddColumn = async () => {
    if (!newColumn.name.trim()) {
      toast({
        title: 'Erreur',
        description: 'Le nom de la colonne est requis',
        status: 'error',
        duration: 3000,
      });
      return;
    }

    // Valider les options pour les listes déroulantes
    if (newColumn.fieldType === 'select' && optionsText.trim()) {
      const options = optionsText
        .split('\n')
        .map(opt => opt.trim())
        .filter(opt => opt.length > 0);
      
      if (options.length === 0) {
        toast({
          title: 'Erreur',
          description: 'Veuillez ajouter au moins une option pour la liste déroulante',
          status: 'error',
          duration: 3000,
        });
        return;
      }
      
      newColumn.options = options;
    }

    setIsSubmitting(true);
    try {
      await onAddColumn(newColumn);
      toast({
        title: 'Colonne ajoutée',
        description: `La colonne "${newColumn.name}" a été créée avec succès`,
        status: 'success',
        duration: 3000,
      });
      
      // Reset form
      setNewColumn({
        name: '',
        fieldType: 'text',
        options: [],
        required: false,
      });
      setOptionsText('');
      onAddModalClose();
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: error.message || 'Impossible de créer la colonne',
        status: 'error',
        duration: 5000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteColumn = async (id: number, name: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer la colonne "${name}" ? Les données associées seront conservées mais ne seront plus visibles.`)) {
      return;
    }

    try {
      await onDeleteColumn(id);
      toast({
        title: 'Colonne supprimée',
        description: `La colonne "${name}" a été supprimée`,
        status: 'success',
        duration: 3000,
      });
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: error.message || 'Impossible de supprimer la colonne',
        status: 'error',
        duration: 5000,
      });
    }
  };

  const openEditModal = (column: CustomField) => {
    setEditingColumn(column);
    setNewColumn({
      name: column.name,
      fieldType: column.fieldType,
      options: column.options || [],
      required: column.required,
    });
    if (column.options && column.options.length > 0) {
      setOptionsText(column.options.join('\n'));
    }
    onAddModalOpen();
  };

  const handleUpdateColumn = async () => {
    if (!editingColumn) return;
    
    if (!newColumn.name.trim()) {
      toast({
        title: 'Erreur',
        description: 'Le nom de la colonne est requis',
        status: 'error',
        duration: 3000,
      });
      return;
    }

    // Valider les options pour les listes déroulantes
    let options = newColumn.options;
    if (newColumn.fieldType === 'select' && optionsText.trim()) {
      options = optionsText
        .split('\n')
        .map(opt => opt.trim())
        .filter(opt => opt.length > 0);
      
      if (options.length === 0) {
        toast({
          title: 'Erreur',
          description: 'Veuillez ajouter au moins une option pour la liste déroulante',
          status: 'error',
          duration: 3000,
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onUpdateColumn(editingColumn.id, {
        name: newColumn.name,
        fieldType: newColumn.fieldType,
        options,
        required: newColumn.required,
      });
      
      toast({
        title: 'Colonne mise à jour',
        description: `La colonne a été modifiée avec succès`,
        status: 'success',
        duration: 3000,
      });
      
      // Reset form
      setEditingColumn(null);
      setNewColumn({
        name: '',
        fieldType: 'text',
        options: [],
        required: false,
      });
      setOptionsText('');
      onAddModalClose();
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: error.message || 'Impossible de modifier la colonne',
        status: 'error',
        duration: 5000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeAddModal = () => {
    setEditingColumn(null);
    setNewColumn({
      name: '',
      fieldType: 'text',
      options: [],
      required: false,
    });
    setOptionsText('');
    onAddModalClose();
  };

  const getFieldTypeLabel = (type: string) => {
    const option = FIELD_TYPE_OPTIONS.find(opt => opt.value === type);
    return option ? `${option.icon} ${option.label}` : type;
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack>
              <Icon as={MdSettings} />
              <Text>Gestion des colonnes</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          
          <ModalBody>
            <VStack align="stretch" spacing={4}>
              <Button
                leftIcon={<MdAdd />}
                colorScheme="brand"
                onClick={onAddModalOpen}
                size="md"
              >
                Ajouter une colonne
              </Button>

              <Divider />

              <Text fontSize="sm" fontWeight="medium" color="gray.600">
                Colonnes existantes ({columns.length})
              </Text>

              {columns.length === 0 ? (
                <Box p={8} textAlign="center" bg="gray.50" borderRadius="md">
                  <Text color="gray.500">Aucune colonne personnalisée</Text>
                  <Text fontSize="sm" color="gray.400" mt={2}>
                    Cliquez sur "Ajouter une colonne" pour commencer
                  </Text>
                </Box>
              ) : (
                <VStack align="stretch" spacing={2}>
                  {columns.map((column) => (
                    <Flex
                      key={column.id}
                      p={3}
                      bg="white"
                      borderWidth="1px"
                      borderRadius="md"
                      align="center"
                      justify="space-between"
                      _hover={{ bg: 'gray.50', shadow: 'sm' }}
                      transition="all 0.2s"
                    >
                      <HStack flex={1} spacing={3}>
                        <Icon as={MdDragIndicator} color="gray.400" />
                        <VStack align="start" spacing={0}>
                          <Text fontWeight="medium" fontSize="sm">
                            {column.name}
                          </Text>
                          <HStack spacing={2}>
                            <Badge colorScheme="blue" fontSize="xs">
                              {getFieldTypeLabel(column.fieldType)}
                            </Badge>
                            {column.required && (
                              <Badge colorScheme="red" fontSize="xs">
                                Requis
                              </Badge>
                            )}
                            {column.options && column.options.length > 0 && (
                              <Badge colorScheme="purple" fontSize="xs">
                                {column.options.length} options
                              </Badge>
                            )}
                          </HStack>
                        </VStack>
                      </HStack>
                      
                      <HStack spacing={1}>
                        <Tooltip label="Modifier">
                          <IconButton
                            aria-label="Modifier"
                            icon={<MdEdit />}
                            size="sm"
                            variant="ghost"
                            colorScheme="blue"
                            onClick={() => openEditModal(column)}
                          />
                        </Tooltip>
                        <Tooltip label="Supprimer">
                          <IconButton
                            aria-label="Supprimer"
                            icon={<MdDelete />}
                            size="sm"
                            variant="ghost"
                            colorScheme="red"
                            onClick={() => handleDeleteColumn(column.id, column.name)}
                          />
                        </Tooltip>
                      </HStack>
                    </Flex>
                  ))}
                </VStack>
              )}
            </VStack>
          </ModalBody>

          <ModalFooter>
            <Button onClick={onClose}>Fermer</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal pour ajouter/éditer une colonne */}
      <Modal isOpen={isAddModalOpen} onClose={closeAddModal} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            {editingColumn ? 'Modifier la colonne' : 'Ajouter une colonne'}
          </ModalHeader>
          <ModalCloseButton />
          
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <FormControl isRequired>
                <FormLabel>Nom de la colonne</FormLabel>
                <Input
                  placeholder="Ex: Prix de vente, Fournisseur, État..."
                  value={newColumn.name}
                  onChange={(e) => setNewColumn({ ...newColumn, name: e.target.value })}
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel>Type de données</FormLabel>
                <Select
                  value={newColumn.fieldType}
                  onChange={(e) => setNewColumn({ ...newColumn, fieldType: e.target.value })}
                >
                  {FIELD_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.icon} {option.label}
                    </option>
                  ))}
                </Select>
              </FormControl>

              {newColumn.fieldType === 'select' && (
                <FormControl>
                  <FormLabel>Options de la liste déroulante</FormLabel>
                  <Textarea
                    placeholder="Entrez une option par ligne&#10;Ex:&#10;Neuf&#10;Occasion&#10;Reconditionné"
                    value={optionsText}
                    onChange={(e) => setOptionsText(e.target.value)}
                    rows={6}
                  />
                  <Text fontSize="xs" color="gray.500" mt={1}>
                    Entrez une option par ligne
                  </Text>
                </FormControl>
              )}

              {/* <FormControl>
                <Flex align="center">
                  <Checkbox
                    isChecked={newColumn.required}
                    onChange={(e) => setNewColumn({ ...newColumn, required: e.target.checked })}
                  >
                    Champ requis
                  </Checkbox>
                </Flex>
              </FormControl> */}
            </VStack>
          </ModalBody>

          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={closeAddModal}>
              Annuler
            </Button>
            <Button
              colorScheme="brand"
              onClick={editingColumn ? handleUpdateColumn : handleAddColumn}
              isLoading={isSubmitting}
            >
              {editingColumn ? 'Modifier' : 'Créer'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

export default ColumnManager;
