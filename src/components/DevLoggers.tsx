'use client';
/**
 * En développement : enregistre les erreurs globales (non gérées) et les
 * rejets de promesses dans la console du navigateur pour faciliter le debug.
 */
import { useEffect } from 'react';

const isDev = typeof window !== 'undefined' && process.env.NODE_ENV === 'development';
const PREFIX = '[CRM]';

export default function DevLoggers() {
  useEffect(() => {
    if (!isDev) return;

    const handleError = (event: ErrorEvent) => {
      console.error(
        `${PREFIX} [ERREUR]`,
        event.message,
        event.filename != null ? `@ ${event.filename}:${event.lineno}:${event.colno}` : '',
        event.error != null ? event.error : ''
      );
      if (event.error?.stack) {
        console.error(`${PREFIX} Stack:`, event.error.stack);
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error(
        `${PREFIX} [PROMESSE REJETÉE]`,
        event.reason instanceof Error ? event.reason.message : event.reason
      );
      if (event.reason instanceof Error && event.reason.stack) {
        console.error(`${PREFIX} Stack:`, event.reason.stack);
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return null;
}
