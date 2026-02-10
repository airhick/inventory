'use client';

import React, { ReactNode } from 'react';
import AppWrappers from './AppWrappers';
import { AuthProvider } from 'contexts/AuthContext';
import DevLoggers from 'components/DevLoggers';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        {/* Préchargement de la police Google pour éviter le blocage du rendu */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" 
          rel="stylesheet"
        />
        <title>Code Bar CRM</title>
        <meta name="description" content="Système de gestion d'inventaire par code-barres" />
      </head>
      <body id={'root'}>
        <DevLoggers />
        <AuthProvider>
          <AppWrappers>{children}</AppWrappers>
        </AuthProvider>
      </body>
    </html>
  );
}
