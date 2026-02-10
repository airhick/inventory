'use client';
/*!
=========================================================
* Code Bar CRM - Login Page
=========================================================
*/

import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Input,
  InputGroup,
  InputRightElement,
  Text,
  useColorModeValue,
  VStack,
  Heading,
  useToast,
  Icon,
  Image,
} from '@chakra-ui/react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from 'contexts/AuthContext';
import { MdVisibility, MdVisibilityOff } from 'react-icons/md';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();
  const toast = useToast();

  // Rediriger si déjà authentifié
  useEffect(() => {
    const auth = localStorage.getItem('codebar_crm_auth');
    if (auth === 'true') {
      router.push('/admin/scanner');
    }
  }, [router, isAuthenticated]);

  const bg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const brandColor = useColorModeValue('brand.500', 'brand.400');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Simuler un petit délai pour l'UX
    await new Promise((resolve) => setTimeout(resolve, 300));

    const success = login(username.trim(), password);

    if (success) {
      toast({
        title: 'Connexion réussie',
        description: 'Redirection en cours...',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
      router.push('/admin/scanner');
    } else {
      toast({
        title: 'Erreur de connexion',
        description: 'Identifiant ou mot de passe incorrect',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }

    setIsLoading(false);
  };

  return (
    <Flex
      minH="100vh"
      align="center"
      justify="center"
      bg={useColorModeValue('gray.50', 'navy.900')}
      px={4}
    >
      <Box
        w="100%"
        maxW="400px"
        bg={bg}
        borderRadius="xl"
        boxShadow="xl"
        p={8}
      >
        <VStack spacing={6} align="stretch">
          {/* En-tête */}
          <VStack spacing={4} align="center">
            <Image
              src="/img/logo-globalvision.png"
              alt="GlobalVision Communication"
              maxH="80px"
              objectFit="contain"
            />
            <Heading size="lg" color={textColor}>
              Code Bar CRM
            </Heading>
            <Text color="gray.500" fontSize="sm" textAlign="center">
              Connectez-vous pour accéder au dashboard
            </Text>
          </VStack>

          {/* Formulaire */}
          <form onSubmit={handleSubmit}>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel color={textColor}>Identifiant</FormLabel>
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Entrez votre identifiant"
                  size="lg"
                  autoFocus
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel color={textColor}>Mot de passe</FormLabel>
                <InputGroup size="lg">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Entrez votre mot de passe"
                  />
                  <InputRightElement>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Cacher le mot de passe' : 'Afficher le mot de passe'}
                    >
                      <Icon
                        as={showPassword ? MdVisibilityOff : MdVisibility}
                        boxSize={5}
                      />
                    </Button>
                  </InputRightElement>
                </InputGroup>
              </FormControl>

              <Button
                type="submit"
                colorScheme="brand"
                size="lg"
                w="100%"
                isLoading={isLoading}
                loadingText="Connexion..."
              >
                Se connecter
              </Button>
            </VStack>
          </form>
        </VStack>
      </Box>
    </Flex>
  );
}
