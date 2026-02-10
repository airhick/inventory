'use client';
// Chakra imports
import {
  Portal,
  Box,
  useDisclosure,
  useColorModeValue,
  Spinner,
  Flex,
} from '@chakra-ui/react';
import Footer from 'components/footer/FooterAdmin';
// Layout components
import Navbar from 'components/navbar/NavbarAdmin';
import Sidebar from 'components/sidebar/Sidebar';
import { SidebarContext } from 'contexts/SidebarContext';
import { useAuth } from 'contexts/AuthContext';
import { PropsWithChildren, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import routes from 'routes';
import {
  getActiveNavbar,
  getActiveNavbarText,
  getActiveRoute,
} from 'utils/navigation';

interface DashboardLayoutProps extends PropsWithChildren {
  [x: string]: any;
}

// Custom Chakra theme
export default function AdminLayout(props: DashboardLayoutProps) {
  const { children, ...rest } = props;
  const [fixed] = useState(false);
  const [toggleSidebar, setToggleSidebar] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const { onOpen } = useDisclosure();
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const authChecked = useRef(false);

  useEffect(() => {
    window.document.documentElement.dir = 'ltr';
  }, []);

  // Vérifier l'authentification au montage (client uniquement), puis réagir si déconnexion
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (authChecked.current) {
      if (!isAuthenticated) router.push('/login');
      return;
    }
    const auth = localStorage.getItem('codebar_crm_auth');
    if (auth === 'true') {
      authChecked.current = true;
      setIsChecking(false);
    } else {
      router.push('/login');
    }
  }, [router, isAuthenticated]);

  const bg = useColorModeValue('secondaryGray.300', 'navy.900');

  // Afficher un spinner pendant la vérification
  if (isChecking || !isAuthenticated) {
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

  return (
    <Box h="100vh" w="100vw" bg={bg}>
      <SidebarContext.Provider
        value={{
          toggleSidebar,
          setToggleSidebar,
        }}
      >
        <Sidebar routes={routes} display="none" {...rest} />
        <Box
          float="right"
          minHeight="100vh"
          height="100%"
          overflow="auto"
          position="relative"
          maxHeight="100%"
          w={{ base: '100%', xl: 'calc( 100% - 290px )' }}
          maxWidth={{ base: '100%', xl: 'calc( 100% - 290px )' }}
          transition="all 0.33s cubic-bezier(0.685, 0.0473, 0.346, 1)"
          transitionDuration=".2s, .2s, .35s"
          transitionProperty="top, bottom, width"
          transitionTimingFunction="linear, linear, ease"
        >
          <Portal>
            <Box>
              <Navbar
                onOpen={onOpen}
                logoText={'Code Bar CRM'}
                brandText={getActiveRoute(routes)}
                secondary={getActiveNavbar(routes)}
                message={getActiveNavbarText(routes)}
                fixed={fixed}
                {...rest}
              />
            </Box>
          </Portal>

          <Box
            mx="auto"
            p={{ base: '20px', md: '30px' }}
            pe="20px"
            minH="100vh"
            pt="50px"
          >
            {children}
          </Box>
          <Box>
            <Footer />
          </Box>
        </Box>
      </SidebarContext.Provider>
    </Box>
  );
}
