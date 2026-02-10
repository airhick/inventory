'use client';
/**
 * Ligne d'item avec support hiérarchie parent-enfant
 * Drag & drop simplifié : déposer sur une ligne = créer un sous-item
 */

import {
  Tr,
  Td,
  Box,
  Icon,
  Flex,
  IconButton,
  useColorModeValue,
  Tooltip,
  Badge,
} from '@chakra-ui/react';
import { useState } from 'react';
import {
  MdDragIndicator,
  MdSubdirectoryArrowRight,
  MdSearch,
} from 'react-icons/md';
import { Item } from 'lib/api';

interface HierarchicalInventoryRowProps {
  item: Item;
  level: number;
  hasChildren: boolean;
  isDropTarget: boolean;
  isDragging: boolean;
  isSearchMatch?: boolean;
  isSearchActive?: boolean; // True si une recherche est en cours
  onDragStart: (item: Item) => void;
  onDragOver: (e: React.DragEvent, item: Item) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, item: Item) => void;
  onDragEnd: () => void;
  onRemoveFromGroup?: () => void;
  children: React.ReactNode;
}

export const HierarchicalInventoryRow: React.FC<HierarchicalInventoryRowProps> = ({
  item,
  level,
  hasChildren,
  isDropTarget,
  isDragging,
  isSearchMatch,
  isSearchActive,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onRemoveFromGroup,
  children,
}) => {
  const [isBeingDragged, setIsBeingDragged] = useState(false);

  // Couleurs
  const groupBg = useColorModeValue('purple.50', 'purple.900');
  const childBg = useColorModeValue('blue.50', 'blue.900');
  const dropTargetBg = useColorModeValue('green.100', 'green.800');
  const dropTargetBorder = useColorModeValue('green.500', 'green.400');
  const accentColor = useColorModeValue('blue.500', 'blue.400');
  const searchMatchBg = useColorModeValue('green.100', 'green.900');
  const searchMatchBorder = useColorModeValue('green.500', 'green.400');
  const contextBg = useColorModeValue('gray.100', 'gray.700'); // Parent affiché pour contexte

  const indentPx = level * 24;

  // Pendant une recherche: parent non-match = affiché pour contexte (grisé)
  const isContextOnly = isSearchActive && !isSearchMatch;

  const handleDragStart = (e: React.DragEvent) => {
    setIsBeingDragged(true);
    onDragStart(item);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.id?.toString() || '');
  };

  const handleDragEnd = () => {
    setIsBeingDragged(false);
    onDragEnd();
  };

  const getRowBg = () => {
    if (isDropTarget) return dropTargetBg;
    if (isSearchMatch) return searchMatchBg;
    if (isContextOnly) return contextBg;
    if (level > 0) return childBg;
    if (hasChildren) return groupBg;
    return undefined;
  };

  const getRowOpacity = () => {
    if (isBeingDragged || isDragging) return 0.4;
    if (isContextOnly) return 0.6; // Grisé pour les parents contextuels
    return 1;
  };

  return (
    <Tr
      draggable
      onDragStart={handleDragStart}
      onDragOver={(e) => onDragOver(e, item)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, item)}
      onDragEnd={handleDragEnd}
      opacity={getRowOpacity()}
      bg={getRowBg()}
      borderLeft={isSearchMatch ? '4px solid' : level > 0 || hasChildren ? '3px solid' : undefined}
      borderLeftColor={isSearchMatch ? searchMatchBorder : level > 0 || hasChildren ? accentColor : undefined}
      outline={isDropTarget ? '2px solid' : undefined}
      outlineColor={isDropTarget ? dropTargetBorder : undefined}
      transition="all 0.1s"
      _hover={{ bg: useColorModeValue('gray.100', 'navy.600'), opacity: 1 }}
    >
      {/* Colonne drag handle + indicateurs */}
      <Td width="50px" minW="50px" maxW="50px" p={1}>
        <Flex align="center" pl={`${indentPx}px`}>
          {/* Badge de recherche pour les résultats */}
          {isSearchMatch && (
            <Tooltip label="Résultat de recherche">
              <Box mr={1}>
                <Icon as={MdSearch} color="green.500" boxSize={4} />
              </Box>
            </Tooltip>
          )}

          {/* Icône sous-item avec action retirer */}
          {level > 0 && !isSearchMatch && (
            <Tooltip label="Retirer du groupe">
              <IconButton
                aria-label="Retirer du groupe"
                icon={<Icon as={MdSubdirectoryArrowRight} />}
                size="xs"
                variant="ghost"
                color={accentColor}
                onClick={onRemoveFromGroup}
                mr={1}
              />
            </Tooltip>
          )}

          {/* Handle drag */}
          <Tooltip label="Glisser sur un autre item pour créer un sous-item">
            <Box cursor="grab" _active={{ cursor: 'grabbing' }}>
              <Icon as={MdDragIndicator} color="gray.400" boxSize={5} />
            </Box>
          </Tooltip>
        </Flex>
      </Td>

      {children}
    </Tr>
  );
};
