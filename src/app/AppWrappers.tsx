'use client';
import React, { ReactNode } from 'react';
import 'styles/App.css';
import 'styles/Contact.css';
import 'styles/MiniCalendar.css';
import { ChakraProvider } from '@chakra-ui/react';
import theme from '../theme/theme';

export default function AppWrappers({ children }: { children: ReactNode }) {
  // Toujours rendre ChakraProvider + children pour éviter un "swap" d'arbre après
  // le premier rendu, qui provoquait un blocage des clics après la première interaction.
  return (
    <ChakraProvider theme={theme}>
      {children}
    </ChakraProvider>
  );
}
