'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from 'contexts/AuthContext';
import { Box, Spinner, Flex } from '@chakra-ui/react';
import { useColorModeValue } from '@chakra-ui/react';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const bg = useColorModeValue('gray.50', 'navy.900');

  useEffect(() => {
    // Vérifier l'authentification
    const auth = localStorage.getItem('codebar_crm_auth');
    if (auth === 'true') {
      router.push('/admin/scanner');
    } else {
      router.push('/login');
    }
  }, [router, isAuthenticated]);

  return (
    <Flex
      minH="100vh"
      align="center"
      justify="center"
      bg={bg}
    >
      <Spinner size="xl" color="brand.500" />
    </Flex>
  );
}
