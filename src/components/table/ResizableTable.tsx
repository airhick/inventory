'use client';
/**
 * Composant de tableau avec colonnes redimensionnables par glisser-déposer
 */

import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  useColorModeValue,
  Box,
} from '@chakra-ui/react';
import { useState, useRef, useEffect, ReactNode } from 'react';

export interface ResizableColumn {
  key: string;
  label: ReactNode;
  minWidth?: number;
  defaultWidth?: number;
  render?: (item: any, index: number) => ReactNode;
}

interface ResizableTableProps {
  columns: ResizableColumn[];
  data: any[];
  storageKey?: string; // Clé pour sauvegarder les largeurs dans localStorage
  tableProps?: any;
  theadProps?: any;
  tbodyProps?: any;
  onRowClick?: (item: any, index: number) => void;
  highlightedRowIndex?: number;
}

export function ResizableTable({
  columns,
  data,
  storageKey,
  tableProps = {},
  theadProps = {},
  tbodyProps = {},
  onRowClick,
  highlightedRowIndex,
}: ResizableTableProps) {
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');
  const hoverBg = useColorModeValue('gray.50', 'whiteAlpha.50');
  const highlightBg = useColorModeValue('brand.50', 'brand.900');
  
  // État pour les largeurs des colonnes
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    // Charger depuis localStorage si disponible
    if (storageKey && typeof window !== 'undefined') {
      const saved = localStorage.getItem(`resizable-table-${storageKey}`);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error('Erreur chargement largeurs colonnes:', e);
        }
      }
    }
    
    // Sinon, utiliser les largeurs par défaut
    const defaults: Record<string, number> = {};
    columns.forEach(col => {
      defaults[col.key] = col.defaultWidth || 150;
    });
    return defaults;
  });

  const [resizing, setResizing] = useState<{
    columnKey: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const tableRef = useRef<HTMLTableElement>(null);

  // Sauvegarder les largeurs dans localStorage
  useEffect(() => {
    if (storageKey && typeof window !== 'undefined') {
      localStorage.setItem(`resizable-table-${storageKey}`, JSON.stringify(columnWidths));
    }
  }, [columnWidths, storageKey]);

  // Gérer le redimensionnement
  const handleMouseDown = (columnKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setResizing({
      columnKey,
      startX: e.clientX,
      startWidth: columnWidths[columnKey] || 150,
    });
  };

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizing) return;

      const diff = e.clientX - resizing.startX;
      const newWidth = Math.max(
        columns.find(c => c.key === resizing.columnKey)?.minWidth || 50,
        resizing.startWidth + diff
      );

      setColumnWidths(prev => ({
        ...prev,
        [resizing.columnKey]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, columns]);

  return (
    <TableContainer>
      <Table ref={tableRef} variant="simple" {...tableProps}>
        <Thead {...theadProps}>
          <Tr>
            {columns.map((column, index) => (
              <Th
                key={column.key}
                position="relative"
                width={`${columnWidths[column.key] || column.defaultWidth || 150}px`}
                minWidth={`${column.minWidth || 50}px`}
                borderRight="1px solid"
                borderRightColor={borderColor}
                style={{
                  width: `${columnWidths[column.key] || column.defaultWidth || 150}px`,
                  minWidth: `${column.minWidth || 50}px`,
                  maxWidth: `${columnWidths[column.key] || column.defaultWidth || 150}px`,
                }}
              >
                {column.label}
                
                {/* Poignée de redimensionnement */}
                {index < columns.length - 1 && (
                  <Box
                    position="absolute"
                    right="-5px"
                    top="0"
                    bottom="0"
                    width="10px"
                    cursor="col-resize"
                    userSelect="none"
                    zIndex={10}
                    onMouseDown={(e) => handleMouseDown(column.key, e)}
                    _hover={{
                      '&::after': {
                        content: '""',
                        position: 'absolute',
                        right: '4px',
                        top: '0',
                        bottom: '0',
                        width: '2px',
                        backgroundColor: 'brand.500',
                      },
                    }}
                    _active={{
                      '&::after': {
                        content: '""',
                        position: 'absolute',
                        right: '4px',
                        top: '0',
                        bottom: '0',
                        width: '2px',
                        backgroundColor: 'brand.600',
                      },
                    }}
                  />
                )}
              </Th>
            ))}
          </Tr>
        </Thead>
        <Tbody {...tbodyProps}>
          {data.map((item, rowIndex) => (
            <Tr
              key={rowIndex}
              onClick={() => onRowClick?.(item, rowIndex)}
              cursor={onRowClick ? 'pointer' : 'default'}
              _hover={onRowClick ? { bg: hoverBg } : undefined}
              bg={highlightedRowIndex === rowIndex ? highlightBg : undefined}
            >
              {columns.map((column) => (
                <Td
                  key={column.key}
                  width={`${columnWidths[column.key] || column.defaultWidth || 150}px`}
                  minWidth={`${column.minWidth || 50}px`}
                  maxWidth={`${columnWidths[column.key] || column.defaultWidth || 150}px`}
                  borderRight="1px solid"
                  borderRightColor={borderColor}
                  style={{
                    width: `${columnWidths[column.key] || column.defaultWidth || 150}px`,
                    minWidth: `${column.minWidth || 50}px`,
                    maxWidth: `${columnWidths[column.key] || column.defaultWidth || 150}px`,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {column.render ? column.render(item, rowIndex) : item[column.key]}
                </Td>
              ))}
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableContainer>
  );
}

export default ResizableTable;
