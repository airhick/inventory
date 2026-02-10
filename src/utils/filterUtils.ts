/**
 * Utilitaires pour filtrer et trier les données du tableau
 */

import type { FilterRule, SortRule } from 'components/table/AdvancedFilters';

export interface Item {
  [key: string]: any;
  customFields?: Record<string, any>;
  customData?: Record<string, any>;
}

/**
 * Applique un filtre unique à un item
 */
function applyFilter(item: Item, filter: FilterRule): boolean {
  // Récupérer la valeur de la colonne (peut être dans customFields ou customData)
  let value: any = item[filter.column];
  if (value === undefined && item.customFields) {
    value = item.customFields[filter.column];
  }
  if (value === undefined && item.customData) {
    value = item.customData[filter.column];
  }

  // Gestion des valeurs vides
  if (filter.operator === 'isEmpty') {
    return value === null || value === undefined || value === '';
  }
  
  if (filter.operator === 'notEmpty') {
    return value !== null && value !== undefined && value !== '';
  }

  // Si la valeur est vide et qu'on ne teste pas isEmpty/notEmpty, le filtre échoue
  if (value === null || value === undefined || value === '') {
    return false;
  }

  // Convertir en string pour les comparaisons textuelles
  const strValue = String(value).toLowerCase();
  const filterValue = Array.isArray(filter.value) 
    ? filter.value 
    : String(filter.value).toLowerCase();

  switch (filter.operator) {
    case 'equals':
      if (filter.columnType === 'number') {
        return Number(value) === Number(filter.value);
      }
      return strValue === filterValue;

    case 'contains':
      return strValue.includes(filterValue as string);

    case 'startsWith':
      return strValue.startsWith(filterValue as string);

    case 'greaterThan':
      if (filter.columnType === 'number') {
        return Number(value) > Number(filter.value);
      }
      if (filter.columnType === 'date') {
        return new Date(value) > new Date(filter.value as string);
      }
      return value > filter.value;

    case 'lessThan':
      if (filter.columnType === 'number') {
        return Number(value) < Number(filter.value);
      }
      if (filter.columnType === 'date') {
        return new Date(value) < new Date(filter.value as string);
      }
      return value < filter.value;

    case 'in':
      if (!Array.isArray(filter.value)) {
        return false;
      }
      // Vérifier si la valeur de l'item est dans la liste des valeurs sélectionnées
      return filter.value.some(v => 
        String(v).toLowerCase() === strValue
      );

    default:
      return true;
  }
}

/**
 * Applique tous les filtres à un item (opération ET)
 */
export function applyFilters(items: Item[], filters: FilterRule[]): Item[] {
  if (filters.length === 0) {
    return items;
  }

  return items.filter(item => {
    return filters.every(filter => applyFilter(item, filter));
  });
}

/**
 * Trie les items selon les règles de tri
 */
export function applySorts(items: Item[], sorts: SortRule[]): Item[] {
  if (sorts.length === 0) {
    return items;
  }

  return [...items].sort((a, b) => {
    for (const sort of sorts) {
      // Récupérer les valeurs à comparer
      let aValue: any = a[sort.column];
      let bValue: any = b[sort.column];

      // Vérifier aussi dans customFields et customData
      if (aValue === undefined && a.customFields) {
        aValue = a.customFields[sort.column];
      }
      if (aValue === undefined && a.customData) {
        aValue = a.customData[sort.column];
      }
      if (bValue === undefined && b.customFields) {
        bValue = b.customFields[sort.column];
      }
      if (bValue === undefined && b.customData) {
        bValue = b.customData[sort.column];
      }

      // Gérer les valeurs nulles/undefined
      if (aValue === null || aValue === undefined) aValue = '';
      if (bValue === null || bValue === undefined) bValue = '';

      // Déterminer le type de comparaison
      let comparison = 0;

      // Si c'est un nombre
      if (typeof aValue === 'number' || typeof bValue === 'number') {
        const numA = Number(aValue) || 0;
        const numB = Number(bValue) || 0;
        comparison = numA - numB;
      }
      // Si c'est une date
      else if (isDateString(aValue) || isDateString(bValue)) {
        const dateA = new Date(aValue).getTime() || 0;
        const dateB = new Date(bValue).getTime() || 0;
        comparison = dateA - dateB;
      }
      // Comparaison textuelle
      else {
        const strA = String(aValue).toLowerCase();
        const strB = String(bValue).toLowerCase();
        comparison = strA.localeCompare(strB, 'fr');
      }

      // Si les valeurs sont différentes, retourner le résultat
      if (comparison !== 0) {
        return sort.direction === 'asc' ? comparison : -comparison;
      }

      // Si les valeurs sont égales, passer au tri suivant
    }

    // Si tous les tris sont égaux, conserver l'ordre
    return 0;
  });
}

/**
 * Vérifie si une chaîne est une date valide
 */
function isDateString(value: any): boolean {
  if (typeof value !== 'string') return false;
  
  // Regex simple pour détecter un format de date ISO
  const dateRegex = /^\d{4}-\d{2}-\d{2}/;
  if (!dateRegex.test(value)) return false;
  
  const date = new Date(value);
  return !isNaN(date.getTime());
}

/**
 * Applique les filtres et tris en une seule opération
 */
export function applyFiltersAndSorts(
  items: Item[],
  filters: FilterRule[],
  sorts: SortRule[]
): Item[] {
  let result = items;
  
  // Appliquer les filtres
  if (filters.length > 0) {
    result = applyFilters(result, filters);
  }
  
  // Appliquer les tris
  if (sorts.length > 0) {
    result = applySorts(result, sorts);
  }
  
  return result;
}

/**
 * Extrait les valeurs uniques d'une colonne pour les filtres
 */
export function getUniqueValues(items: Item[], columnKey: string): string[] {
  const values = new Set<string>();
  
  items.forEach(item => {
    let value = item[columnKey];
    if (value === undefined && item.customFields) {
      value = item.customFields[columnKey];
    }
    if (value === undefined && item.customData) {
      value = item.customData[columnKey];
    }
    
    if (value !== null && value !== undefined && value !== '') {
      values.add(String(value));
    }
  });
  
  return Array.from(values).sort((a, b) => a.localeCompare(b, 'fr'));
}
