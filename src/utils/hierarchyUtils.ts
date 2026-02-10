/**
 * Utilitaires pour gérer la hiérarchie des items (groupes parent-enfant)
 */

import { Item } from 'lib/api';

export interface HierarchicalItem extends Item {
  children?: HierarchicalItem[];
  level?: number;
}

/**
 * Organiser les items en hiérarchie (arbre)
 * @param items Liste plate des items
 * @returns Liste hiérarchique avec les enfants imbriqués
 */
export function buildItemHierarchy(items: Item[]): HierarchicalItem[] {
  const itemMap = new Map<number, HierarchicalItem>();
  const rootItems: HierarchicalItem[] = [];

  // Créer une map de tous les items
  items.forEach(item => {
    itemMap.set(item.id!, { ...item, children: [] });
  });

  // Construire la hiérarchie
  items.forEach(item => {
    const hierarchicalItem = itemMap.get(item.id!);
    if (!hierarchicalItem) return;

    if (item.parentId === null || item.parentId === undefined) {
      // Item racine (pas de parent)
      rootItems.push(hierarchicalItem);
    } else {
      // Item enfant, l'ajouter à son parent
      const parent = itemMap.get(item.parentId);
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(hierarchicalItem);
      } else {
        // Parent introuvable, traiter comme racine
        rootItems.push(hierarchicalItem);
      }
    }
  });

  // Trier les enfants par displayOrder
  const sortChildren = (item: HierarchicalItem) => {
    if (item.children && item.children.length > 0) {
      item.children.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
      item.children.forEach(sortChildren);
    }
  };

  rootItems.forEach(sortChildren);
  rootItems.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  return rootItems;
}

/**
 * Aplatir la hiérarchie en liste avec niveaux
 * @param items Liste hiérarchique
 * @param level Niveau actuel (pour la récursion)
 * @returns Liste plate avec le niveau de chaque item
 */
export function flattenHierarchy(items: HierarchicalItem[], level: number = 0): HierarchicalItem[] {
  const result: HierarchicalItem[] = [];

  items.forEach(item => {
    result.push({ ...item, level });
    
    if (item.children && item.children.length > 0) {
      result.push(...flattenHierarchy(item.children, level + 1));
    }
  });

  return result;
}

/**
 * Obtenir tous les descendants d'un item
 * @param itemId ID de l'item parent
 * @param items Liste de tous les items
 * @returns Liste des IDs des descendants
 */
export function getDescendantIds(itemId: number, items: Item[]): number[] {
  const descendants: number[] = [];
  const children = items.filter(item => item.parentId === itemId);

  children.forEach(child => {
    if (child.id) {
      descendants.push(child.id);
      descendants.push(...getDescendantIds(child.id, items));
    }
  });

  return descendants;
}

/**
 * Vérifier si un item peut être déplacé vers un nouveau parent
 * (éviter les boucles circulaires)
 * @param itemId ID de l'item à déplacer
 * @param newParentId ID du nouveau parent
 * @param items Liste de tous les items
 * @returns true si le déplacement est autorisé
 */
export function canMoveItem(itemId: number, newParentId: number | null, items: Item[]): boolean {
  if (newParentId === null) return true;
  if (itemId === newParentId) return false;

  // Vérifier que le nouveau parent n'est pas un descendant de l'item
  const descendants = getDescendantIds(itemId, items);
  return !descendants.includes(newParentId);
}

/**
 * Calculer les nouveaux ordres d'affichage après un drag & drop
 * @param items Liste des items
 * @param draggedItemId ID de l'item déplacé
 * @param targetItemId ID de l'item cible
 * @param position 'before' | 'after' | 'child' - Position relative à la cible
 * @returns Mise à jour des items avec nouveaux parent_id et display_order
 */
export function calculateNewOrder(
  items: Item[],
  draggedItemId: number,
  targetItemId: number,
  position: 'before' | 'after' | 'child'
): Array<{ id: number; parentId: number | null; displayOrder: number }> {
  const updates: Array<{ id: number; parentId: number | null; displayOrder: number }> = [];

  const draggedItem = items.find(i => i.id === draggedItemId);
  const targetItem = items.find(i => i.id === targetItemId);

  if (!draggedItem || !targetItem) return updates;

  if (position === 'child') {
    // Placer comme enfant de la cible
    const siblings = items.filter(i => i.parentId === targetItemId);
    updates.push({
      id: draggedItemId,
      parentId: targetItemId,
      displayOrder: siblings.length,
    });

    // Réorganiser les anciens frères (ceux qui avaient le même parent que l'item déplacé)
    const oldParentId = draggedItem.parentId ?? null;
    const oldSiblings = items.filter(
      i => (i.parentId ?? null) === oldParentId && i.id !== draggedItemId
    );
    oldSiblings
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
      .forEach((sibling, index) => {
        updates.push({
          id: sibling.id!,
          parentId: oldParentId,
          displayOrder: index,
        });
      });
  } else {
    // Placer avant ou après la cible (même parent que la cible)
    const newParentId = targetItem.parentId ?? null;
    const siblings = items.filter(
      i => (i.parentId ?? null) === newParentId && i.id !== draggedItemId
    );

    siblings.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

    const targetIndex = siblings.findIndex(i => i.id === targetItemId);
    const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;

    // Insérer l'item déplacé à la bonne position
    siblings.splice(insertIndex, 0, draggedItem);

    // Mettre à jour les display_order de tous les siblings
    siblings.forEach((sibling, index) => {
      updates.push({
        id: sibling.id!,
        parentId: newParentId,
        displayOrder: index,
      });
    });
  }

  return updates;
}
