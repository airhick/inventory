/**
 * Hook pour gérer la hiérarchie parent-enfant des items
 * Drag & drop simplifié : déposer un item sur un autre le rend enfant
 * Les sous-items sont toujours visibles (pas de collapse)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Item, setItemParent } from 'lib/api';
import { buildItemHierarchy, flattenHierarchy, HierarchicalItem } from 'utils/hierarchyUtils';
import { useToast } from '@chakra-ui/react';

export const useItemHierarchy = (items: Item[], onItemsChange?: (items: Item[]) => void) => {
  const [draggedItem, setDraggedItem] = useState<Item | null>(null);
  const [dropTargetId, setDropTargetId] = useState<number | null>(null);
  const [localItems, setLocalItems] = useState<Item[]>(items);
  const [displayItems, setDisplayItems] = useState<HierarchicalItem[]>([]);
  const toast = useToast();
  const skipNextSyncRef = useRef(false);
  const itemsRef = useRef(items);

  // Sync local items with props
  useEffect(() => {
    if (items !== itemsRef.current) {
      if (skipNextSyncRef.current) {
        skipNextSyncRef.current = false;
        itemsRef.current = items;
        return;
      }
      setLocalItems(items);
      itemsRef.current = items;
    }
  }, [items]);

  // Construire et aplatir la hiérarchie - tous les items visibles
  useEffect(() => {
    const hierarchy = buildItemHierarchy(localItems);
    const flattened = flattenHierarchy(hierarchy);
    setDisplayItems(flattened); // Tous visibles, pas de filtrage
  }, [localItems]);

  const hasChildren = useCallback((itemId: number) => {
    return localItems.some(item => item.parentId === itemId);
  }, [localItems]);

  // Drag & drop
  const handleDragStart = useCallback((item: Item) => {
    setDraggedItem(item);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, targetItem: Item) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.id === targetItem.id) {
      setDropTargetId(null);
      return;
    }
    // Ne pas permettre de déposer sur un descendant
    const isDescendant = (parentId: number | null | undefined, childId: number): boolean => {
      if (!parentId) return false;
      if (parentId === childId) return true;
      const parent = localItems.find(i => i.id === parentId);
      return parent ? isDescendant(parent.parentId, childId) : false;
    };
    if (isDescendant(targetItem.parentId, draggedItem.id!)) {
      setDropTargetId(null);
      return;
    }
    if (targetItem.parentId === draggedItem.id) {
      setDropTargetId(null);
      return;
    }
    setDropTargetId(targetItem.id!);
  }, [draggedItem, localItems]);

  const handleDragLeave = useCallback(() => {
    setDropTargetId(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetItem: Item) => {
    e.preventDefault();
    setDropTargetId(null);

    if (!draggedItem || draggedItem.id === targetItem.id) {
      setDraggedItem(null);
      return;
    }

    // Vérifier cycle
    const wouldCreateCycle = (itemId: number, newParentId: number): boolean => {
      let currentId: number | null | undefined = newParentId;
      while (currentId) {
        if (currentId === itemId) return true;
        const item = localItems.find(i => i.id === currentId);
        currentId = item?.parentId;
      }
      return false;
    };

    if (wouldCreateCycle(draggedItem.id!, targetItem.id!)) {
      toast({
        title: 'Impossible',
        description: 'Cela créerait une relation circulaire',
        status: 'error',
        duration: 2000,
      });
      setDraggedItem(null);
      return;
    }

    // Mise à jour optimiste
    skipNextSyncRef.current = true;
    const updatedItems = localItems.map(item =>
      item.id === draggedItem.id
        ? { ...item, parentId: targetItem.id }
        : item
    );
    setLocalItems(updatedItems);
    
    if (onItemsChange) {
      onItemsChange(updatedItems);
    }

    try {
      await setItemParent(draggedItem.id!, targetItem.id!, 0);
      toast({
        title: 'Sous-item créé',
        description: `${draggedItem.name} est maintenant sous ${targetItem.name}`,
        status: 'success',
        duration: 2000,
      });
    } catch (error) {
      console.error('Erreur:', error);
      setLocalItems(localItems);
      if (onItemsChange) {
        onItemsChange(localItems);
      }
      toast({
        title: 'Erreur',
        description: 'Impossible de créer le sous-item',
        status: 'error',
        duration: 3000,
      });
    }

    setDraggedItem(null);
  }, [draggedItem, localItems, toast, onItemsChange]);

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
    setDropTargetId(null);
  }, []);

  const removeFromGroup = useCallback(async (itemId: number) => {
    const item = localItems.find(i => i.id === itemId);
    if (!item) return;

    skipNextSyncRef.current = true;
    const updatedItems = localItems.map(i =>
      i.id === itemId ? { ...i, parentId: null } : i
    );
    setLocalItems(updatedItems);
    if (onItemsChange) {
      onItemsChange(updatedItems);
    }

    try {
      await setItemParent(itemId, null, 0);
      toast({
        title: 'Item retiré du groupe',
        status: 'success',
        duration: 2000,
      });
    } catch (error) {
      console.error('Erreur:', error);
      setLocalItems(localItems);
      if (onItemsChange) {
        onItemsChange(localItems);
      }
      toast({
        title: 'Erreur',
        description: 'Impossible de retirer l\'item',
        status: 'error',
        duration: 3000,
      });
    }
  }, [localItems, toast, onItemsChange]);

  return {
    displayItems,
    draggedItem,
    dropTargetId,
    hasChildren,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
    removeFromGroup,
  };
};
