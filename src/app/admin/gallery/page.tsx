'use client';
/*!
=========================================================
* Code Bar CRM - Gallery Page
=========================================================
*/

import {
  Box,
  Button,
  Flex,
  Grid,
  GridItem,
  Image,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  useColorModeValue,
  VStack,
  HStack,
  Icon,
  useToast,
  Badge,
  Text,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  IconButton,
  Skeleton,
  AspectRatio,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  MdSearch,
  MdPhotoLibrary,
  MdZoomIn,
  MdChevronLeft,
  MdChevronRight,
  MdClose,
  MdInfo,
  MdFilterList,
} from 'react-icons/md';
import Card from 'components/card/Card';
import { getItems, getCategories, Item, getSSEUrl } from 'lib/api';

interface ItemWithMedia extends Item {
  mediaArray: string[];
}

export default function GalleryPage() {
  const router = useRouter();
  const [items, setItems] = useState<ItemWithMedia[]>([]);
  const [filteredItems, setFilteredItems] = useState<ItemWithMedia[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal state
  const [selectedItem, setSelectedItem] = useState<ItemWithMedia | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const { isOpen, onOpen, onClose } = useDisclosure();
  
  const toast = useToast();
  const bg = useColorModeValue('white', 'navy.800');
  const cardBg = useColorModeValue('gray.50', 'navy.700');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const borderColor = useColorModeValue('gray.200', 'navy.600');

  // Charger les données
  const loadData = async () => {
    try {
      setLoading(true);
      const [itemsData, categoriesData] = await Promise.all([
        getItems(),
        getCategories(),
      ]);
      
      // Parser les médias pour chaque item
      const itemsWithMedia: ItemWithMedia[] = itemsData
        .map((item: Item) => {
          let mediaArray: string[] = [];
          
          // Parser l'image (peut être un JSON array, un objet ou une string)
          if (item.image) {
            try {
              const parsed = JSON.parse(item.image);
              if (Array.isArray(parsed)) {
                // Extraire les URLs valides
                mediaArray = parsed
                  .map((media: any) => {
                    if (typeof media === 'string') return media;
                    if (media && typeof media === 'object' && media.url) return media.url;
                    if (media && typeof media === 'object' && media.src) return media.src;
                    return null;
                  })
                  .filter((url: any): url is string => typeof url === 'string' && url.length > 0);
              } else if (typeof parsed === 'string' && parsed.length > 0) {
                mediaArray = [parsed];
              } else if (parsed && typeof parsed === 'object' && parsed.url) {
                mediaArray = [parsed.url];
              }
            } catch {
              // Si ce n'est pas du JSON valide, utiliser directement la string
              if (typeof item.image === 'string' && item.image.length > 0) {
                mediaArray = [item.image];
              }
            }
          }
          
          return {
            ...item,
            mediaArray,
          };
        })
        .filter((item: ItemWithMedia) => item.mediaArray.length > 0); // Garder uniquement les items avec des images
      
      setItems(itemsWithMedia);
      setCategories([
        ...new Set([
          ...(categoriesData.categories || []),
          ...(categoriesData.customCategories || []),
        ]),
      ]);
    } catch (error) {
      console.error('Erreur chargement données:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de charger les données',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Chargement initial
    loadData();
    
    // Écouter les événements SSE pour recharger uniquement lors de changements
    const eventSource = new EventSource(getSSEUrl());
    
    eventSource.addEventListener('items_changed', () => {
      // Recharger les items quand ils changent (ajout/modification/suppression)
      loadData();
    });
    
    return () => {
      eventSource.close();
    };
  }, []);

  // Filtrer les items
  useEffect(() => {
    let filtered = [...items];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.name?.toLowerCase().includes(term) ||
          item.serialNumber?.toLowerCase().includes(term) ||
          item.brand?.toLowerCase().includes(term) ||
          item.model?.toLowerCase().includes(term)
      );
    }

    if (categoryFilter) {
      filtered = filtered.filter((item) => item.category === categoryFilter);
    }

    if (typeFilter) {
      filtered = filtered.filter((item) => item.itemType === typeFilter);
    }

    setFilteredItems(filtered);
  }, [items, searchTerm, categoryFilter, typeFilter]);

  // Ouvrir le modal avec une image
  const openImageModal = (item: ItemWithMedia, imageIndex: number = 0) => {
    setSelectedItem(item);
    setSelectedImageIndex(imageIndex);
    onOpen();
  };

  // Rediriger vers l'inventaire avec l'item sélectionné
  const goToInventoryItem = (item: ItemWithMedia) => {
    router.push(`/admin/inventory?item=${encodeURIComponent(item.serialNumber)}`);
  };

  // Navigation dans le carousel
  const nextImage = () => {
    if (selectedItem) {
      setSelectedImageIndex((prev) =>
        prev < selectedItem.mediaArray.length - 1 ? prev + 1 : 0
      );
    }
  };

  const prevImage = () => {
    if (selectedItem) {
      setSelectedImageIndex((prev) =>
        prev > 0 ? prev - 1 : selectedItem.mediaArray.length - 1
      );
    }
  };

  // Compter le nombre total d'images
  const totalImages = filteredItems.reduce(
    (acc, item) => acc + item.mediaArray.length,
    0
  );

  // Types d'équipement uniques
  const itemTypes = [...new Set(items.map((item) => item.itemType).filter(Boolean))];

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      <Card mb="20px">
        <VStack spacing={4} align="stretch">
          {/* En-tête avec stats */}
          <Flex justify="space-between" align="center" flexWrap="wrap" gap={4}>
            <HStack>
              <Icon as={MdPhotoLibrary} boxSize={6} color="brand.500" />
              <Text fontSize="xl" fontWeight="bold">
                Galerie
              </Text>
              <Badge colorScheme="brand" fontSize="md" px={3} py={1}>
                {filteredItems.length} items • {totalImages} photos
              </Badge>
            </HStack>
          </Flex>

          {/* Filtres */}
          <Flex gap={4} wrap="wrap" align="center">
            <InputGroup flex={1} minW="200px" maxW="400px">
              <InputLeftElement>
                <Icon as={MdSearch} color="gray.400" />
              </InputLeftElement>
              <Input
                placeholder="Rechercher par nom, marque, modèle..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </InputGroup>

            <HStack>
              <Icon as={MdFilterList} color="gray.400" />
              <Select
                placeholder="Toutes catégories"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                w="180px"
              >
                {categories.map((cat, index) => (
                  <option key={`cat-${index}-${cat}`} value={cat}>
                    {cat}
                  </option>
                ))}
              </Select>

              <Select
                placeholder="Tous types"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                w="180px"
              >
                {itemTypes.map((type, index) => (
                  <option key={`type-${index}-${type}`} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </HStack>
          </Flex>
        </VStack>
      </Card>

      {/* Grille de photos */}
      {loading ? (
        <Grid
          templateColumns={{
            base: 'repeat(2, 1fr)',
            md: 'repeat(3, 1fr)',
            lg: 'repeat(4, 1fr)',
            xl: 'repeat(5, 1fr)',
          }}
          gap={4}
        >
          {[...Array(10)].map((_, i) => (
            <GridItem key={i}>
              <Skeleton height="200px" borderRadius="lg" />
            </GridItem>
          ))}
        </Grid>
      ) : filteredItems.length === 0 ? (
        <Card>
          <VStack py={10} spacing={4}>
            <Icon as={MdPhotoLibrary} boxSize={16} color="gray.300" />
            <Text fontSize="lg" color="gray.500">
              {items.length === 0
                ? "Aucun item avec des photos dans l'inventaire"
                : 'Aucun résultat pour cette recherche'}
            </Text>
            <Text fontSize="sm" color="gray.400">
              Ajoutez des photos aux items depuis le Scanner
            </Text>
          </VStack>
        </Card>
      ) : (
        <Grid
          templateColumns={{
            base: 'repeat(2, 1fr)',
            md: 'repeat(3, 1fr)',
            lg: 'repeat(4, 1fr)',
            xl: 'repeat(5, 1fr)',
          }}
          gap={4}
        >
          {filteredItems.map((item) => (
            <GridItem key={item.serialNumber}>
              <Box
                position="relative"
                borderRadius="lg"
                overflow="hidden"
                bg={cardBg}
                border="1px solid"
                borderColor={borderColor}
                cursor="pointer"
                transition="all 0.2s"
                _hover={{
                  transform: 'scale(1.02)',
                  shadow: 'lg',
                }}
                onClick={() => goToInventoryItem(item)}
                onDoubleClick={() => openImageModal(item)}
                title="Cliquez pour aller à l'item dans l'inventaire • Double-cliquez pour voir les détails"
              >
                <AspectRatio ratio={1}>
                  <Image
                    src={item.mediaArray[0]}
                    alt={item.name}
                    objectFit="cover"
                    fallback={
                      <Flex
                        align="center"
                        justify="center"
                        bg="gray.100"
                        h="100%"
                      >
                        <Icon as={MdPhotoLibrary} boxSize={10} color="gray.400" />
                      </Flex>
                    }
                  />
                </AspectRatio>

                {/* Badge nombre de photos */}
                {item.mediaArray.length > 1 && (
                  <Badge
                    position="absolute"
                    top={2}
                    right={2}
                    colorScheme="brand"
                    fontSize="xs"
                  >
                    {item.mediaArray.length} photos
                  </Badge>
                )}

                {/* Overlay avec infos */}
                <Box
                  position="absolute"
                  bottom={0}
                  left={0}
                  right={0}
                  bg="blackAlpha.700"
                  p={3}
                  color="white"
                >
                  <Text fontWeight="bold" fontSize="sm" noOfLines={1}>
                    {item.name}
                  </Text>
                  <HStack spacing={2} mt={1}>
                    {item.brand && (
                      <Badge size="sm" colorScheme="blue" variant="solid">
                        {item.brand}
                      </Badge>
                    )}
                    {item.itemType && (
                      <Badge size="sm" colorScheme="purple" variant="solid">
                        {item.itemType}
                      </Badge>
                    )}
                  </HStack>
                </Box>

                {/* Icône zoom au survol */}
                <Flex
                  position="absolute"
                  top={0}
                  left={0}
                  right={0}
                  bottom={0}
                  align="center"
                  justify="center"
                  bg="blackAlpha.500"
                  opacity={0}
                  transition="opacity 0.2s"
                  _groupHover={{ opacity: 1 }}
                  sx={{ '.chakra-box:hover &': { opacity: 1 } }}
                >
                  <Icon as={MdZoomIn} boxSize={10} color="white" />
                </Flex>
              </Box>
            </GridItem>
          ))}
        </Grid>
      )}

      {/* Modal visualisation */}
      <Modal isOpen={isOpen} onClose={onClose} size="6xl" isCentered>
        <ModalOverlay bg="blackAlpha.800" />
        <ModalContent bg="transparent" boxShadow="none" maxW="90vw">
          <ModalCloseButton
            color="white"
            bg="blackAlpha.500"
            borderRadius="full"
            size="lg"
            top={4}
            right={4}
            zIndex={10}
          />
          <ModalBody p={0}>
            {selectedItem && (
              <Flex direction={{ base: 'column', lg: 'row' }} gap={4}>
                {/* Image principale */}
                <Box flex={2} position="relative">
                  <AspectRatio ratio={4 / 3} maxH="80vh">
                    <Image
                      src={selectedItem.mediaArray[selectedImageIndex]}
                      alt={selectedItem.name}
                      objectFit="contain"
                      borderRadius="lg"
                      bg="black"
                    />
                  </AspectRatio>

                  {/* Navigation */}
                  {selectedItem.mediaArray.length > 1 && (
                    <>
                      <IconButton
                        aria-label="Image précédente"
                        icon={<Icon as={MdChevronLeft} boxSize={8} />}
                        position="absolute"
                        left={2}
                        top="50%"
                        transform="translateY(-50%)"
                        colorScheme="whiteAlpha"
                        size="lg"
                        borderRadius="full"
                        onClick={(e) => {
                          e.stopPropagation();
                          prevImage();
                        }}
                      />
                      <IconButton
                        aria-label="Image suivante"
                        icon={<Icon as={MdChevronRight} boxSize={8} />}
                        position="absolute"
                        right={2}
                        top="50%"
                        transform="translateY(-50%)"
                        colorScheme="whiteAlpha"
                        size="lg"
                        borderRadius="full"
                        onClick={(e) => {
                          e.stopPropagation();
                          nextImage();
                        }}
                      />

                      {/* Indicateur de position */}
                      <HStack
                        position="absolute"
                        bottom={4}
                        left="50%"
                        transform="translateX(-50%)"
                        spacing={2}
                      >
                        {selectedItem.mediaArray.map((_, idx) => (
                          <Box
                            key={idx}
                            w={selectedImageIndex === idx ? 4 : 2}
                            h={2}
                            bg={selectedImageIndex === idx ? 'white' : 'whiteAlpha.500'}
                            borderRadius="full"
                            cursor="pointer"
                            transition="all 0.2s"
                            onClick={() => setSelectedImageIndex(idx)}
                          />
                        ))}
                      </HStack>
                    </>
                  )}
                </Box>

                {/* Infos item */}
                <Box
                  flex={1}
                  bg={bg}
                  p={6}
                  borderRadius="lg"
                  maxW={{ lg: '350px' }}
                >
                  <VStack align="stretch" spacing={4}>
                    <Text fontSize="xl" fontWeight="bold" color={textColor}>
                      {selectedItem.name}
                    </Text>

                    <Wrap>
                      {selectedItem.brand && (
                        <WrapItem>
                          <Badge colorScheme="blue">{selectedItem.brand}</Badge>
                        </WrapItem>
                      )}
                      {selectedItem.model && (
                        <WrapItem>
                          <Badge colorScheme="teal">{selectedItem.model}</Badge>
                        </WrapItem>
                      )}
                      {selectedItem.itemType && (
                        <WrapItem>
                          <Badge colorScheme="purple">{selectedItem.itemType}</Badge>
                        </WrapItem>
                      )}
                      {selectedItem.category && (
                        <WrapItem>
                          <Badge colorScheme="gray">{selectedItem.category}</Badge>
                        </WrapItem>
                      )}
                    </Wrap>

                    <Box>
                      <Text fontSize="sm" color="gray.500" mb={1}>
                        Numéro de série
                      </Text>
                      <Text fontFamily="mono" fontSize="sm">
                        {selectedItem.serialNumber}
                      </Text>
                    </Box>

                    {selectedItem.categoryDetails && (
                      <Box>
                        <Text fontSize="sm" color="gray.500" mb={1}>
                          Description
                        </Text>
                        <Text fontSize="sm">{selectedItem.categoryDetails}</Text>
                      </Box>
                    )}

                    <Box>
                      <Text fontSize="sm" color="gray.500" mb={1}>
                        Statut
                      </Text>
                      <Badge
                        colorScheme={
                          selectedItem.status === 'loue' ? 'orange' : 'green'
                        }
                      >
                        {selectedItem.status === 'loue' ? 'En location' : 'En stock'}
                      </Badge>
                    </Box>

                    {/* Miniatures */}
                    {selectedItem.mediaArray.length > 1 && (
                      <Box>
                        <Text fontSize="sm" color="gray.500" mb={2}>
                          Toutes les photos ({selectedItem.mediaArray.length})
                        </Text>
                        <Wrap>
                          {selectedItem.mediaArray.map((media, idx) => (
                            <WrapItem key={idx}>
                              <Image
                                src={media}
                                alt={`${selectedItem.name} ${idx + 1}`}
                                w="60px"
                                h="60px"
                                objectFit="cover"
                                borderRadius="md"
                                cursor="pointer"
                                border={
                                  selectedImageIndex === idx
                                    ? '2px solid'
                                    : '2px solid transparent'
                                }
                                borderColor={
                                  selectedImageIndex === idx
                                    ? 'brand.500'
                                    : 'transparent'
                                }
                                opacity={selectedImageIndex === idx ? 1 : 0.7}
                                _hover={{ opacity: 1 }}
                                onClick={() => setSelectedImageIndex(idx)}
                              />
                            </WrapItem>
                          ))}
                        </Wrap>
                      </Box>
                    )}
                  </VStack>
                </Box>
              </Flex>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}
