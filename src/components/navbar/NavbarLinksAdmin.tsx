'use client';
// Chakra Imports
import {
  Box,
  Button,
  Center,
  Flex,
  Icon,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Text,
  useColorMode,
  useColorModeValue,
  Badge,
  VStack,
  HStack,
  Divider,
  Spinner,
  IconButton,
} from '@chakra-ui/react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
// Custom Components
import { SidebarResponsive } from 'components/sidebar/Sidebar';
import { useAuth } from 'contexts/AuthContext';
import { IoMdMoon, IoMdSunny } from 'react-icons/io';
import { MdNotificationsNone, MdCheckCircle, MdClose } from 'react-icons/md';
import routes from 'routes';
import { getNotifications, deleteNotification, clearNotifications, Notification, getSSEUrl } from 'lib/api';

export default function HeaderLinks(props: {
  secondary: boolean;
  onOpen: boolean | any;
  fixed: boolean | any;
}) {
  const { secondary } = props;
  const router = useRouter();
  const { colorMode, toggleColorMode } = useColorMode();
  const { logout } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  
  // Chakra Color Mode
  const navbarIcon = useColorModeValue('gray.400', 'white');
  let menuBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const textColorBrand = useColorModeValue('brand.700', 'brand.400');
  const borderColor = useColorModeValue('#E6ECFA', 'rgba(135, 140, 189, 0.3)');
  const hoverBg = useColorModeValue('gray.50', 'navy.700');
  const shadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.18)',
    '14px 17px 40px 4px rgba(112, 144, 176, 0.06)',
  );

  // Charger les notifications
  const loadNotifications = async () => {
    try {
      setLoadingNotifications(true);
      const data = await getNotifications();
      setNotifications(data || []);
    } catch (error) {
      console.error('Erreur chargement notifications:', error);
    } finally {
      setLoadingNotifications(false);
    }
  };

  useEffect(() => {
    loadNotifications();
    
    // URL SSE - utiliser la configuration
    const SSE_URL = getSSEUrl();
    
    // Écouter les événements SSE pour les notifications
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    
    const connectSSE = () => {
      if (eventSource) {
        eventSource.close();
      }
      
      eventSource = new EventSource(SSE_URL);
      
      eventSource.onopen = () => {
        console.log('[SSE] Connecté aux notifications');
        reconnectAttempts = 0;
      };
      
      eventSource.onerror = () => {
        console.log('[SSE] Erreur de connexion notifications, tentative de reconnexion...');
        eventSource?.close();
        
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
          reconnectTimeout = setTimeout(connectSSE, delay);
        }
      };
      
      eventSource.addEventListener('notifications_changed', () => {
        loadNotifications();
      });
    };
    
    connectSSE();

    return () => {
      eventSource?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  // Formater la date avec heure complète
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      
      // Toujours afficher l'heure complète pour les notifications
      const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const dateStr = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      
      if (diffMins < 1) return `À l'instant (${timeStr})`;
      if (diffMins < 60) return `${timeStr} (il y a ${diffMins} min)`;
      if (diffMins < 1440) return `${timeStr} (il y a ${Math.floor(diffMins / 60)} h)`;
      
      return `${dateStr} à ${timeStr}`;
    } catch {
      return dateString;
    }
  };

  // Supprimer une notification
  const handleDeleteNotification = async (notificationId: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Empêcher le clic de déclencher la redirection
    try {
      await deleteNotification(notificationId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error('Erreur suppression notification:', error);
    }
  };

  // Rediriger vers l'item concerné (priorité à l'ID hexadécimal unique)
  const handleNotificationClick = (notification: Notification) => {
    const itemRef = notification.itemHexId || notification.itemSerialNumber;
    if (itemRef) {
      router.push(`/admin/inventory?item=${encodeURIComponent(itemRef)}`);
    }
  };

  // Effacer toutes les notifications
  const handleClearAll = async () => {
    if (!confirm('Êtes-vous sûr de vouloir effacer toutes les notifications ?')) return;
    
    try {
      await clearNotifications();
      setNotifications([]);
    } catch (error) {
      console.error('Erreur suppression notifications:', error);
    }
  };

  return (
    <Flex
      w={{ sm: '100%', md: 'auto' }}
      alignItems="center"
      flexDirection="row"
      bg={menuBg}
      flexWrap={secondary ? { base: 'wrap', md: 'nowrap' } : 'unset'}
      p="10px"
      borderRadius="30px"
      boxShadow={shadow}
    >
      <SidebarResponsive routes={routes} />
      
      {/* Notifications */}
      <Menu placement="bottom-end">
        <MenuButton p="0px" position="relative">
          <Icon
            mt="6px"
            as={MdNotificationsNone}
            color={navbarIcon}
            w="18px"
            h="18px"
            me="10px"
          />
          {notifications.length > 0 && (
            <Badge
              position="absolute"
              top="-2px"
              right="2px"
              bg="red.500"
              color="white"
              borderRadius="full"
              fontSize="xx-small"
              minW="16px"
              h="16px"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              {notifications.length > 9 ? '9+' : notifications.length}
            </Badge>
          )}
        </MenuButton>
        <MenuList
          boxShadow={shadow}
          p="20px"
          borderRadius="20px"
          bg={menuBg}
          border="none"
          mt="22px"
          me={{ base: '30px', md: '0' }}
          w={{ base: '90vw', sm: '400px', md: '450px', xl: '500px' }}
          maxW="500px"
          maxH="600px"
          overflowY="auto"
          position="relative"
          right="0"
        >
          <Flex w="100%" mb="15px" align="center" justify="space-between">
            <HStack spacing={2}>
              <Icon as={MdNotificationsNone} color="brand.500" boxSize={5} />
              <Text fontSize="lg" fontWeight="700" color={textColor}>
                Notifications
              </Text>
              {notifications.length > 0 && (
                <Badge colorScheme="brand" fontSize="sm" px={2} py={1}>
                  {notifications.length}
                </Badge>
              )}
            </HStack>
            {notifications.length > 0 && (
              <Button
                size="xs"
                variant="ghost"
                colorScheme="gray"
                onClick={handleClearAll}
                fontSize="xs"
              >
                Tout effacer
              </Button>
            )}
          </Flex>
          <Text fontSize="xs" color="gray.500" mb={3}>
            Historique des changements : quel changement, pour quel item, à quelle heure
          </Text>
          <VStack spacing={2} align="stretch" divider={<Divider />}>
            {loadingNotifications ? (
              <Center py={4}>
                <Spinner size="sm" />
              </Center>
            ) : notifications.length === 0 ? (
              <Text fontSize="sm" color={textColor} textAlign="center" py="20px">
                Aucune notification
              </Text>
            ) : (
              notifications.slice(0, 15).map((notif) => (
                <Box
                  key={notif.id}
                  p={3}
                  borderRadius="md"
                  borderLeft="3px solid"
                  borderLeftColor={notif.type === 'success' ? 'green.500' : notif.type === 'error' ? 'red.500' : 'blue.500'}
                  _hover={{ bg: hoverBg }}
                  cursor={(notif.itemHexId || notif.itemSerialNumber) ? 'pointer' : 'default'}
                  onClick={() => (notif.itemHexId || notif.itemSerialNumber) && handleNotificationClick(notif)}
                  position="relative"
                  transition="all 0.2s"
                >
                  <HStack spacing={3} align="start">
                    <Icon
                      as={MdCheckCircle}
                      color={notif.type === 'success' ? 'green.500' : notif.type === 'error' ? 'red.500' : 'blue.500'}
                      boxSize={5}
                      mt={0.5}
                      flexShrink={0}
                    />
                    <VStack align="start" spacing={1.5} flex={1} pr={8}>
                      <Text fontSize="sm" color={textColor} fontWeight="medium" noOfLines={3}>
                        {notif.message}
                      </Text>
                      <HStack spacing={2} flexWrap="wrap" fontSize="xs" color="gray.500" mt={1}>
                        {(notif.itemHexId || notif.itemSerialNumber) && (
                          <>
                            <Badge colorScheme="blue" fontSize="xx-small" px={1.5} py={0.5} borderRadius="sm">
                              📦 {notif.itemSerialNumber}
                            </Badge>
                            <Text>•</Text>
                          </>
                        )}
                        <Text fontWeight="medium">
                          🕐 {formatDate(notif.created_at || notif.timestamp)}
                        </Text>
                      </HStack>
                      {(notif.itemHexId || notif.itemSerialNumber) && (
                        <Text fontSize="xs" color="blue.500" mt={0.5} fontStyle="italic" fontWeight="medium">
                          👆 Cliquez pour voir l'item
                        </Text>
                      )}
                    </VStack>
                  </HStack>
                  <IconButton
                    aria-label="Supprimer la notification"
                    icon={<Icon as={MdClose} boxSize={3} />}
                    size="xs"
                    position="absolute"
                    top="8px"
                    right="8px"
                    variant="ghost"
                    colorScheme="gray"
                    opacity={0.5}
                    _hover={{ opacity: 1, color: 'red.500', bg: 'red.50' }}
                    onClick={(e) => handleDeleteNotification(notif.id, e)}
                    zIndex={1}
                  />
                </Box>
              ))
            )}
          </VStack>
        </MenuList>
      </Menu>

      {/* Dark/Light Mode Toggle */}
      <Button
        variant="no-hover"
        bg="transparent"
        p="0px"
        minW="unset"
        minH="unset"
        h="18px"
        w="max-content"
        onClick={toggleColorMode}
      >
        <Icon
          me="10px"
          h="18px"
          w="18px"
          color={navbarIcon}
          as={colorMode === 'light' ? IoMdMoon : IoMdSunny}
        />
      </Button>

      {/* User Menu */}
      <Menu>
        <MenuButton p="0px" style={{ position: 'relative' }}>
          <Box
            _hover={{ cursor: 'pointer' }}
            color="white"
            bg="#11047A"
            w="40px"
            h="40px"
            borderRadius={'50%'}
          />
          <Center top={0} left={0} position={'absolute'} w={'100%'} h={'100%'}>
            <Text fontSize={'xs'} fontWeight="bold" color={'white'}>
              U
            </Text>
          </Center>
        </MenuButton>
        <MenuList
          boxShadow={shadow}
          p="0px"
          mt="10px"
          borderRadius="20px"
          bg={menuBg}
          border="none"
        >
          <Flex w="100%" mb="0px">
            <Text
              ps="20px"
              pt="16px"
              pb="10px"
              w="100%"
              borderBottom="1px solid"
              borderColor={borderColor}
              fontSize="sm"
              fontWeight="700"
              color={textColor}
            >
              👋&nbsp; Utilisateur
            </Text>
          </Flex>
          <Flex flexDirection="column" p="10px">
            <MenuItem
              _hover={{ bg: 'none' }}
              _focus={{ bg: 'none' }}
              color="red.400"
              borderRadius="8px"
              px="14px"
              onClick={logout}
            >
              <Text fontSize="sm">Déconnexion</Text>
            </MenuItem>
          </Flex>
        </MenuList>
      </Menu>
    </Flex>
  );
}
