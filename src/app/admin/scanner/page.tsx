'use client';
/*!
=========================================================
* Code Bar CRM - Scanner Page
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
  IconButton,
  Select,
  Textarea,
  useColorModeValue,
  VStack,
  HStack,
  Image,
  Icon,
  useToast,
  Spinner,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  Text,
  Badge,
  Divider,
  Checkbox,
} from '@chakra-ui/react';
import { useState, useRef, useEffect } from 'react';
import { MdQrCodeScanner, MdCameraAlt, MdSearch, MdDocumentScanner, MdTextFields, MdPhotoLibrary, MdClose, MdCheckCircle, MdAutoAwesome } from 'react-icons/md';
import Card from 'components/card/Card';
import { saveItem, searchProductByBarcode, searchItemByCode, recognizeImage, analyzeLabelAI, OcrResult, getCategories, getCustomFields, CustomField, getSSEUrl, fetchImageAsBase64, uploadImage } from 'lib/api';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';

export default function ScannerPage() {
  const [isScanning, setIsScanning] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('materiel');
  const [categories, setCategories] = useState<string[]>([]);
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [description, setDescription] = useState('');
  const [media, setMedia] = useState<string[]>([]); // URLs pour l'affichage
  const [mediaFiles, setMediaFiles] = useState<File[]>([]); // Fichiers à uploader
  const [showManualInput, setShowManualInput] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [ocrImage, setOcrImage] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [isOcrCameraActive, setIsOcrCameraActive] = useState(false);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  
  // Champs personnalisés
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customData, setCustomData] = useState<Record<string, any>>({});
  
  const { isOpen: isOcrModalOpen, onOpen: onOcrModalOpen, onClose: onOcrModalClose } = useDisclosure();
  const { isOpen: isOcrCameraOpen, onOpen: onOcrCameraOpen, onClose: onOcrCameraClose } = useDisclosure();
  const { isOpen: isOcrMappingOpen, onOpen: onOcrMappingOpen, onClose: onOcrMappingClose } = useDisclosure();
  
  // Mapping OCR
  const [ocrMapping, setOcrMapping] = useState<Record<string, string>>({});
  const [draggedOcrField, setDraggedOcrField] = useState<string | null>(null);
  const [editableOcrFields, setEditableOcrFields] = useState<Record<string, string>>({});
  
  // Détection automatique de codes-barres
  const [detectedBarcodes, setDetectedBarcodes] = useState<any[]>([]);
  const [lastDetectedCode, setLastDetectedCode] = useState<string>('');
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [scanDuration, setScanDuration] = useState<number>(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const ocrInputRef = useRef<HTMLInputElement>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const barcodeImageInputRef = useRef<HTMLInputElement>(null);
  const ocrVideoRef = useRef<HTMLVideoElement>(null);
  const ocrStreamRef = useRef<MediaStream | null>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const scanAttemptsRef = useRef<number>(0);
  
  const toast = useToast();
  const bg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const searchBtnBg = useColorModeValue('brand.500', 'brand.400');
  const searchBtnHover = useColorModeValue('brand.600', 'brand.500');

  // Scanner en continu les codes-barres depuis la vidéo avec ZXing
  const scanBarcodesFromVideo = async () => {
    if (!videoRef.current || !canvasRef.current || !isScanning) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Vérifier que la vidéo est prête
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      scanIntervalRef.current = window.requestAnimationFrame(scanBarcodesFromVideo);
      return;
    }
    
    // Ajuster le canvas à la taille de la vidéo
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    
    if (videoWidth > 0 && videoHeight > 0) {
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      // Toujours dessiner la vidéo en premier
      ctx.clearRect(0, 0, videoWidth, videoHeight);
      ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
      
      try {
        // Utiliser ZXing pour détecter les codes-barres depuis le canvas
        if (!codeReaderRef.current) {
          codeReaderRef.current = new BrowserMultiFormatReader();
          console.log('[BARCODE] Lecteur ZXing initialisé - Tous formats supportés');
        }
        
        // Incrémenter le compteur de tentatives
        scanAttemptsRef.current++;
        if (scanAttemptsRef.current % 30 === 0) {
          console.log(`[BARCODE] ${scanAttemptsRef.current} tentatives de détection...`);
        }
        
        // Essayer de décoder directement d'abord (plus rapide)
        let result = null;
        try {
          result = await codeReaderRef.current.decodeFromCanvas(canvas);
        } catch (e) {
          // Si échec, essayer avec amélioration du contraste
          const imageData = ctx.getImageData(0, 0, videoWidth, videoHeight);
          const data = imageData.data;
          
          // Augmenter le contraste et la luminosité
          const contrastFactor = 1.3;
          const brightnessFactor = 20;
          
          for (let i = 0; i < data.length; i += 4) {
            // Appliquer contraste et luminosité
            data[i] = Math.max(0, Math.min(255, ((data[i] - 128) * contrastFactor) + 128 + brightnessFactor));       // R
            data[i + 1] = Math.max(0, Math.min(255, ((data[i + 1] - 128) * contrastFactor) + 128 + brightnessFactor)); // G
            data[i + 2] = Math.max(0, Math.min(255, ((data[i + 2] - 128) * contrastFactor) + 128 + brightnessFactor)); // B
          }
          ctx.putImageData(imageData, 0, 0);
          
          // Réessayer avec l'image améliorée
          try {
            result = await codeReaderRef.current.decodeFromCanvas(canvas);
          } catch (e2) {
            // Toujours pas trouvé, on continue la boucle
            throw e2;
          }
        }
        
        // Redessiner la vidéo normale pour l'affichage
        ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
        
        if (result) {
          // Code-barres détecté
          const detectedCode = result.getText();
          const resultPoints = result.getResultPoints();
          
          console.log('[BARCODE] ✓ Code détecté:', detectedCode, '| Points:', resultPoints?.length);
          
          // Redessiner la vidéo pour effacer les anciennes détections
          ctx.clearRect(0, 0, videoWidth, videoHeight);
          ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
          
          if (resultPoints && resultPoints.length >= 2) {
            // Calculer la bounding box à partir des points
            const xs = resultPoints.map(p => p.getX());
            const ys = resultPoints.map(p => p.getY());
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            
            const boxWidth = maxX - minX;
            const boxHeight = maxY - minY;
            
            console.log('[BARCODE] Rectangle:', { minX, minY, boxWidth, boxHeight });
            
            // Dessiner un rectangle rouge TRÈS VISIBLE avec effet lumineux
            ctx.strokeStyle = '#FF0000';
            ctx.lineWidth = 8;
            ctx.shadowColor = '#FF0000';
            ctx.shadowBlur = 20;
            ctx.strokeRect(minX - 15, minY - 15, boxWidth + 30, boxHeight + 30);
            
            // Dessiner les coins pour un effet plus marqué
            ctx.shadowBlur = 0;
            ctx.lineWidth = 12;
            const cornerSize = 30;
            
            // Coin haut-gauche
            ctx.beginPath();
            ctx.moveTo(minX - 15, minY - 15 + cornerSize);
            ctx.lineTo(minX - 15, minY - 15);
            ctx.lineTo(minX - 15 + cornerSize, minY - 15);
            ctx.stroke();
            
            // Coin haut-droit
            ctx.beginPath();
            ctx.moveTo(maxX + 15 - cornerSize, minY - 15);
            ctx.lineTo(maxX + 15, minY - 15);
            ctx.lineTo(maxX + 15, minY - 15 + cornerSize);
            ctx.stroke();
            
            // Coin bas-gauche
            ctx.beginPath();
            ctx.moveTo(minX - 15, maxY + 15 - cornerSize);
            ctx.lineTo(minX - 15, maxY + 15);
            ctx.lineTo(minX - 15 + cornerSize, maxY + 15);
            ctx.stroke();
            
            // Coin bas-droit
            ctx.beginPath();
            ctx.moveTo(maxX + 15 - cornerSize, maxY + 15);
            ctx.lineTo(maxX + 15, maxY + 15);
            ctx.lineTo(maxX + 15, maxY + 15 - cornerSize);
            ctx.stroke();
            
            // Ajouter un fond semi-transparent pour le texte
            const textX = minX - 15;
            const textY = minY - 30;
            
            ctx.font = 'bold 24px Arial';
            const textWidth = ctx.measureText(detectedCode).width;
            ctx.fillStyle = 'rgba(255, 0, 0, 0.9)';
            ctx.fillRect(textX - 8, textY - 30, textWidth + 16, 38);
            
            // Afficher le texte du code-barres
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(detectedCode, textX, textY);
          }
          
          setDetectedBarcodes([{ rawValue: detectedCode }]);
          
          // Si un nouveau code est détecté, l'utiliser
          if (detectedCode !== lastDetectedCode) {
            console.log('[BARCODE] ✓ Nouveau code:', detectedCode);
            setLastDetectedCode(detectedCode);
            setBarcode(detectedCode);
            
            toast({
              title: '✅ Code-barres détecté',
              description: `Code: ${detectedCode}`,
              status: 'success',
              duration: 2000,
              isClosable: true,
              position: 'top',
            });
            
            // Rechercher automatiquement
            await handleSerialNumberSearch(detectedCode);
            
            // Arrêter immédiatement la détection pour éviter les doublons
            if (scanIntervalRef.current !== null) {
              window.cancelAnimationFrame(scanIntervalRef.current);
              scanIntervalRef.current = null;
            }
            
            // Arrêter la caméra automatiquement après détection
            console.log('[BARCODE] Fermeture automatique de la caméra dans 1.5s...');
            setTimeout(() => {
              stopScan();
              toast({
                title: '📷 Caméra fermée',
                description: 'Le code-barres a été scanné avec succès',
                status: 'info',
                duration: 2000,
                isClosable: true,
              });
            }, 1500); // Délai de 1.5 secondes pour voir le rectangle rouge
            
            // Ne pas continuer la boucle après détection
            return;
          }
        } else {
          // Pas de code-barres détecté
          if (detectedBarcodes.length > 0) {
            setDetectedBarcodes([]);
          }
        }
      } catch (error) {
        // NotFoundException est normal quand aucun code n'est trouvé
        if (!(error instanceof NotFoundException)) {
          console.error('Erreur détection code-barres:', error);
        }
        setDetectedBarcodes([]);
      }
    }
    
    // Continuer la détection
    scanIntervalRef.current = window.requestAnimationFrame(scanBarcodesFromVideo);
  };

  // Démarrer le scanner (caméra)
  const startScan = async () => {
    try {
      setIsCameraLoading(true);
      
      // Détecter si on est sur mobile ou ordinateur
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      // Configuration vidéo haute qualité pour meilleure détection
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1920, min: 1280 },
        height: { ideal: 1080, min: 720 },
        aspectRatio: { ideal: 16/9 },
        focusMode: 'continuous',
        advanced: [{ focusMode: 'continuous' }]
      };
      
      // Sur mobile, utiliser la caméra arrière (environment)
      // Sur ordinateur, laisser le navigateur choisir la meilleure caméra (généralement la webcam)
      if (isMobile) {
        videoConstraints.facingMode = 'environment';
      }
      
      console.log('[CAMERA] Configuration haute qualité:', videoConstraints);
      
      console.log('[CAMERA] Demande d\'accès à la caméra...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints
      });
      
      console.log('[CAMERA] ✓ Accès accordé, initialisation...');
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Attendre que la vidéo soit chargée avant de commencer la détection
        videoRef.current.onloadedmetadata = () => {
          console.log('[CAMERA] ✓ Métadonnées chargées, démarrage lecture...');
          videoRef.current?.play().then(() => {
            console.log('[CAMERA] ✓ Vidéo en cours de lecture');
            setIsScanning(true);
            setIsCameraLoading(false);
            
            // Démarrer la détection automatique après un petit délai
            setTimeout(() => {
              console.log('[CAMERA] ✓ Démarrage détection codes-barres...');
              scanAttemptsRef.current = 0;
              setScanDuration(0);
              scanBarcodesFromVideo();
              
              // Démarrer le compteur de durée
              const startTime = Date.now();
              const durationInterval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                setScanDuration(elapsed);
                
                // Afficher un conseil après 5 secondes sans détection
                if (elapsed === 5 && lastDetectedCode === '') {
                  console.log('[BARCODE] ⚠️ Aucune détection après 5s - Vérifiez l\'éclairage et la distance');
                }
                
                // Arrêter le compteur si la caméra est fermée
                if (!isScanning) {
                  clearInterval(durationInterval);
                }
              }, 1000);
            }, 500);
            
            toast({
              title: '📷 Caméra active',
              description: 'Pointez vers un code-barres pour le scanner automatiquement',
              status: 'success',
              duration: 3000,
              isClosable: true,
            });
          }).catch((err) => {
            console.error('[CAMERA] Erreur lecture vidéo:', err);
            setIsCameraLoading(false);
          });
        };
      }
    } catch (error: any) {
      console.error('[CAMERA] ✗ Erreur accès caméra:', error);
      setIsCameraLoading(false);
      setIsScanning(false);
      
      let errorTitle = 'Erreur d\'accès à la caméra';
      let errorDescription = 'Impossible d\'accéder à la caméra.';
      
      // Détecter le type d'erreur et donner des solutions spécifiques
      if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        errorTitle = 'Caméra déjà utilisée';
        errorDescription = 'La caméra est déjà utilisée par une autre application. Fermez les autres applications utilisant la caméra (Teams, Skype, Zoom, OBS, etc.) et réessayez.';
      } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorTitle = 'Permission refusée';
        errorDescription = 'Vous devez autoriser l\'accès à la caméra. Cliquez sur l\'icône de caméra dans la barre d\'adresse et autorisez l\'accès.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorTitle = 'Aucune caméra détectée';
        errorDescription = 'Aucune caméra n\'a été trouvée. Vérifiez qu\'une caméra est connectée et activée.';
      } else if (error.name === 'OverconstrainedError') {
        errorTitle = 'Caméra incompatible';
        errorDescription = 'La caméra ne supporte pas la résolution demandée. Essayez avec une autre caméra.';
      }
      
      toast({
        title: errorTitle,
        description: errorDescription,
        status: 'error',
        duration: 8000,
        isClosable: true,
      });
    }
  };


  // Scanner un code-barres depuis une image
  const handleBarcodeImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Créer une image à partir du fichier
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (!event.target?.result) return;
        
        const img = new Image();
        img.onload = async () => {
          try {
            // Utiliser l'API native BarcodeDetector si disponible
            if ('BarcodeDetector' in window) {
              const barcodeDetector = new (window as any).BarcodeDetector({
                formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code', 'upc_a', 'upc_e']
              });
              
              const barcodes = await barcodeDetector.detect(img);
              
              if (barcodes && barcodes.length > 0) {
                const barcodeValue = barcodes[0].rawValue;
                setBarcode(barcodeValue);
                toast({
                  title: 'Code-barres détecté',
                  description: `Code: ${barcodeValue}. Cliquez sur 🔍 pour rechercher.`,
                  status: 'success',
                  duration: 3000,
                  isClosable: true,
                });
              } else {
                toast({
                  title: 'Aucun code-barres détecté',
                  description: 'Aucun code-barres trouvé dans l\'image',
                  status: 'warning',
                  duration: 3000,
                  isClosable: true,
                });
              }
            } else {
              // Fallback: utiliser la caméra ou afficher un message
              toast({
                title: 'Fonctionnalité non disponible',
                description: 'La détection de code-barres depuis une image nécessite un navigateur moderne. Utilisez la caméra à la place.',
                status: 'info',
                duration: 5000,
                isClosable: true,
              });
              // Proposer d'ouvrir la caméra
              await startScan();
            }
          } catch (error) {
            console.error('Erreur détection code-barres:', error);
            toast({
              title: 'Erreur',
              description: 'Erreur lors de la détection du code-barres',
              status: 'error',
              duration: 3000,
              isClosable: true,
            });
          }
        };
        img.src = event.target.result as string;
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Erreur lecture fichier:', error);
      toast({
        title: 'Erreur',
        description: 'Erreur lors de la lecture de l\'image',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
    
    // Réinitialiser l'input pour permettre de sélectionner le même fichier
    if (barcodeImageInputRef.current) {
      barcodeImageInputRef.current.value = '';
    }
  };

  // Arrêter le scanner
  const stopScan = () => {
    console.log(`[CAMERA] Arrêt du scan après ${scanAttemptsRef.current} tentatives et ${scanDuration}s`);
    
    // Arrêter la détection continue
    if (scanIntervalRef.current !== null) {
      window.cancelAnimationFrame(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    
    // Réinitialiser le code reader
    if (codeReaderRef.current) {
      codeReaderRef.current.reset();
      codeReaderRef.current = null; // Libérer la référence
    }
    
    // Arrêter le stream vidéo
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('[CAMERA] ✓ Track vidéo arrêté:', track.label);
      });
      streamRef.current = null;
    }
    
    // Nettoyer la vidéo
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.pause();
    }
    
    // Nettoyer le canvas
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
    
    setIsScanning(false);
    setIsCameraLoading(false);
    setDetectedBarcodes([]);
    setLastDetectedCode('');
    setScanDuration(0);
    scanAttemptsRef.current = 0;
  };

  // Rechercher un produit par code-barres (API externe)
  const handleBarcodeSearch = async (barcodeValue: string) => {
    if (!barcodeValue || barcodeValue.length < 8) return;
    
    try {
      const product = await searchProductByBarcode(barcodeValue);
      if (product && product.success && product.name) {
        // Pré-remplir avec les données trouvées
        setName(product.name);
        
        if (product.brand) {
          setBrand(product.brand);
        }
        
        // Récupérer et convertir l'image du produit si disponible
        let imageUrl: string | null = null;
        
        // Différents formats possibles selon l'API
        if (product.images && Array.isArray(product.images) && product.images.length > 0) {
          imageUrl = product.images[0];
        } else if (product.image && typeof product.image === 'string') {
          imageUrl = product.image;
        } else if (product.imageUrl && typeof product.imageUrl === 'string') {
          imageUrl = product.imageUrl;
        }
        
        if (imageUrl && imageUrl.startsWith('http')) {
          try {
            console.log('[UPC] Récupération image depuis:', imageUrl);
            
            // Utiliser le proxy serveur pour éviter les problèmes CORS
            const result = await fetchImageAsBase64(imageUrl);
            
            if (result.success && result.image) {
              setMedia(prev => [...prev, result.image!]);
              
              toast({
                title: '📷 Image récupérée',
                description: 'L\'image du produit a été ajoutée',
                status: 'info',
                duration: 2000,
                isClosable: true,
              });
              
              console.log('[UPC] ✓ Image convertie et ajoutée aux médias');
            } else {
              console.error('[UPC] Erreur récupération image:', result.error);
            }
          } catch (imageError) {
            console.error('[UPC] Erreur récupération image:', imageError);
            // Ne pas afficher d'erreur à l'utilisateur, l'image n'est pas critique
          }
        }
        
        toast({
          title: 'Produit trouvé',
          description: `"${product.name}" via ${product.source || 'API externe'}`,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      }
    } catch (error) {
      console.error('Erreur recherche produit:', error);
    }
  };

  // Rechercher un item existant dans la base locale par numéro de série
  const handleSerialNumberSearch = async (codeValue?: string | any) => {
    // Vérifier si codeValue est un événement React ou un objet
    const codeString = (typeof codeValue === 'string') ? codeValue : undefined;
    const searchValue = codeString || serialNumber.trim() || barcode.trim();
    if (!searchValue) {
      toast({
        title: 'Erreur',
        description: 'Veuillez entrer un numéro de série ou code-barres',
        status: 'warning',
        duration: 2000,
        isClosable: true,
      });
      return;
    }

    setIsSearching(true);
    try {
      const result = await searchItemByCode(searchValue);
      
      if (result.found && result.item) {
        // Pré-remplir les champs avec les données trouvées
        setName(result.item.name || '');
        setBarcode(result.item.scannedCode || result.item.serialNumber || '');
        setSerialNumber(result.item.serialNumber || '');
        setCategory(result.item.category || 'materiel');
        setBrand(result.item.brand || '');
        setModel(result.item.model || '');
        setDescription(result.item.categoryDetails || '');
        
        // Si l'item a une image, l'ajouter aux médias
        let hasLocalImage = false;
        if (result.item.image) {
          try {
            const images = JSON.parse(result.item.image);
            if (Array.isArray(images)) {
              setMedia(images);
              hasLocalImage = images.length > 0;
            } else if (typeof result.item.image === 'string' && (result.item.image.startsWith('data:') || result.item.image.startsWith('/api/images/'))) {
              setMedia([result.item.image]);
              hasLocalImage = true;
            }
          } catch {
            if (result.item.image.startsWith('data:') || result.item.image.startsWith('/api/images/')) {
              setMedia([result.item.image]);
              hasLocalImage = true;
            }
          }
        }

        // Pré-remplir les champs personnalisés (colonnes)
        if (result.item.customData && typeof result.item.customData === 'object') {
          setCustomData(result.item.customData);
        } else {
          setCustomData({});
        }

        toast({
          title: 'Item trouvé',
          description: `"${result.item.name}" - Les champs ont été pré-remplis`,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
        
        // Si l'item n'a pas d'image locale, essayer de récupérer depuis l'API externe
        if (!hasLocalImage && searchValue.length >= 8) {
          console.log('[SEARCH] Item sans image, recherche API externe...');
          await handleBarcodeSearch(searchValue);
        }
      } else {
        toast({
          title: 'Aucun item trouvé',
          description: 'Aucun item existant avec ce code dans la base de données',
          status: 'info',
          duration: 2000,
          isClosable: true,
        });
        
        // Si pas trouvé localement, essayer la recherche externe
        if (searchValue.length >= 8) {
          await handleBarcodeSearch(searchValue);
        }
      }
    } catch (error) {
      console.error('Erreur recherche item:', error);
      toast({
        title: 'Erreur',
        description: 'Erreur lors de la recherche',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Gérer les fichiers média - stocke les fichiers directement (pas de Base64)
  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      // Créer une URL temporaire pour l'affichage
      const previewUrl = URL.createObjectURL(file);
      setMedia(prev => [...prev, previewUrl]);
      setMediaFiles(prev => [...prev, file]);
    });
  };

  // Supprimer un média
  const removeMedia = (index: number) => {
    // Libérer l'URL blob si c'est une URL temporaire
    if (media[index]?.startsWith('blob:')) {
      URL.revokeObjectURL(media[index]);
    }
    setMedia(prev => prev.filter((_, i) => i !== index));
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
  };

  // ==================== OCR ====================
  
  // Sélectionner une image pour l'OCR
  const handleOcrImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setOcrImage(event.target.result as string);
        setOcrResult(null);
        onOcrModalOpen();
      }
    };
    reader.readAsDataURL(file);
  };

  // Arrêter la caméra OCR
  const stopOcrCamera = () => {
    if (ocrStreamRef.current) {
      ocrStreamRef.current.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      ocrStreamRef.current = null;
    }
    if (ocrVideoRef.current) {
      ocrVideoRef.current.srcObject = null;
      ocrVideoRef.current.pause();
    }
    setIsOcrCameraActive(false);
    onOcrCameraClose();
  };

  // Capturer l'image depuis la caméra OCR
  const captureOcrPhoto = () => {
    if (!ocrVideoRef.current) return;
    
    const video = ocrVideoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0);
    
    // Convertir en base64
    const imageData = canvas.toDataURL('image/jpeg', 0.9);
    setOcrImage(imageData);
    setOcrResult(null);
    
    // Arrêter la caméra et ouvrir le modal de résultats
    stopOcrCamera();
    onOcrModalOpen();
  };

  // Lancer la reconnaissance OCR
  // Analyser une image d'étiquette avec l'IA (OpenRouter)
  const analyzeWithAI = async (imageData: string) => {
    setIsAiAnalyzing(true);
    try {
      console.log('[AI-Label] Début analyse IA...');
      const result = await analyzeLabelAI(imageData);
      
      if (result.success && result.parsed) {
        console.log('[AI-Label] Données extraites:', result.parsed);
        
        // Remplir automatiquement les champs du formulaire standard
        if (result.parsed.name) setName(result.parsed.name);
        if (result.parsed.serialNumber) setSerialNumber(result.parsed.serialNumber);
        if (result.parsed.brand) setBrand(result.parsed.brand);
        if (result.parsed.model) setModel(result.parsed.model);
        if (result.parsed.barcode) setBarcode(result.parsed.barcode);
        if (result.parsed.description) setDescription(result.parsed.description);
        if (result.parsed.category) setCategory(result.parsed.category);
        if (result.parsed.quantity) setQuantity(result.parsed.quantity);
        
        // Remplir les champs personnalisés
        if (result.customFields && result.customFields.length > 0) {
          const newCustomData: Record<string, any> = { ...customData };
          let customFieldsFilledCount = 0;
          
          result.customFields.forEach((field: any) => {
            const fieldKey = field.fieldKey;
            if (result.parsed[fieldKey] !== undefined && result.parsed[fieldKey] !== null) {
              newCustomData[fieldKey] = result.parsed[fieldKey];
              customFieldsFilledCount++;
              console.log(`[AI-Label] Champ personnalisé rempli: ${field.name} = ${result.parsed[fieldKey]}`);
            }
          });
          
          if (customFieldsFilledCount > 0) {
            setCustomData(newCustomData);
            console.log(`[AI-Label] ${customFieldsFilledCount} champs personnalisés remplis`);
          }
        }
        
        // Ajouter l'image aux médias si pas déjà présente
        if (!media.includes(imageData)) {
          setMedia(prev => [...prev, imageData]);
        }
        
        // Préparer le message de succès
        let successMessage = 'Champs remplis automatiquement';
        if (result.parsed.barcode && result.parsed.name) {
          successMessage += ` (UPC: ${result.parsed.barcode})`;
        }
        
        toast({
          title: '✨ Analyse IA réussie!',
          description: successMessage,
          status: 'success',
          duration: 5000,
          isClosable: true,
        });
      } else {
        toast({
          title: 'Erreur analyse IA',
          description: result.error || 'Impossible d\'analyser l\'image',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    } catch (error: any) {
      console.error('[AI-Label] Erreur:', error);
      toast({
        title: 'Erreur analyse IA',
        description: error.message || 'Une erreur est survenue',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsAiAnalyzing(false);
    }
  };
  
  // Handler pour l'upload d'image pour analyse IA
  const handleAiImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result as string;
      analyzeWithAI(imageData);
    };
    reader.readAsDataURL(file);
  };

  const processOcr = async () => {
    if (!ocrImage) return;

    setIsOcrProcessing(true);
    try {
      const result = await recognizeImage(ocrImage);
      setOcrResult(result);

      // Initialiser les champs éditables avec les valeurs OCR détectées
      const initialFields: Record<string, string> = {};
      if (result.parsed) {
        if (result.parsed.name) initialFields['name'] = result.parsed.name;
        if (result.parsed.serialNumber) initialFields['serialNumber'] = result.parsed.serialNumber;
        if (result.parsed.brand) initialFields['brand'] = result.parsed.brand;
        if (result.parsed.model) initialFields['model'] = result.parsed.model;
        if (result.parsed.barcode) initialFields['barcode'] = result.parsed.barcode;
        if (result.parsed.description) initialFields['description'] = result.parsed.description;
      }
      if (result.rawText && result.rawText.trim()) {
        initialFields['rawText'] = result.rawText;
      }
      setEditableOcrFields(initialFields);

      if (result.success && result.parsed) {
        toast({
          title: 'Texte reconnu',
          description: 'Cliquez sur "Appliquer" pour remplir les champs',
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      } else {
        toast({
          title: 'Erreur OCR',
          description: result.error || 'Impossible de reconnaître le texte',
          status: 'error',
          duration: 3000,
          isClosable: true,
        });
      }
    } catch (error) {
      console.error('Erreur OCR:', error);
      toast({
        title: 'Erreur',
        description: 'Erreur lors de la reconnaissance',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsOcrProcessing(false);
    }
  };

  // Extraire les champs OCR disponibles (avec valeurs éditables)
  const getOcrFields = (): Array<{ key: string; label: string; value: string }> => {
    if (!ocrResult) return [];
    
    const fields: Array<{ key: string; label: string; value: string }> = [];
    
    // Ajouter les champs parsés
    if (ocrResult.parsed) {
      if (ocrResult.parsed.name) {
        const key = 'name';
        fields.push({ 
          key, 
          label: 'Nom', 
          value: editableOcrFields[key] !== undefined ? editableOcrFields[key] : ocrResult.parsed.name 
        });
      }
      if (ocrResult.parsed.serialNumber) {
        const key = 'serialNumber';
        fields.push({ 
          key, 
          label: 'N° Série', 
          value: editableOcrFields[key] !== undefined ? editableOcrFields[key] : ocrResult.parsed.serialNumber 
        });
      }
      if (ocrResult.parsed.brand) {
        const key = 'brand';
        fields.push({ 
          key, 
          label: 'Marque', 
          value: editableOcrFields[key] !== undefined ? editableOcrFields[key] : ocrResult.parsed.brand 
        });
      }
      if (ocrResult.parsed.model) {
        const key = 'model';
        fields.push({ 
          key, 
          label: 'Modèle', 
          value: editableOcrFields[key] !== undefined ? editableOcrFields[key] : ocrResult.parsed.model 
        });
      }
      if (ocrResult.parsed.barcode) {
        const key = 'barcode';
        fields.push({ 
          key, 
          label: 'Code-barres', 
          value: editableOcrFields[key] !== undefined ? editableOcrFields[key] : ocrResult.parsed.barcode 
        });
      }
      if (ocrResult.parsed.description) {
        const key = 'description';
        fields.push({ 
          key, 
          label: 'Description', 
          value: editableOcrFields[key] !== undefined ? editableOcrFields[key] : ocrResult.parsed.description 
        });
      }
    }
    
    // Ajouter le texte brut comme option supplémentaire
    if (ocrResult.rawText && ocrResult.rawText.trim()) {
      const key = 'rawText';
      fields.push({ 
        key, 
        label: 'Texte brut', 
        value: editableOcrFields[key] !== undefined ? editableOcrFields[key] : ocrResult.rawText 
      });
    }
    
    return fields;
  };

  // Colonnes disponibles pour le mapping
  const getAvailableInventoryColumns = () => {
    return [
      { key: '', label: '-- Ne pas importer --' },
      { key: 'name', label: 'Nom', required: true },
      { key: 'serialNumber', label: 'Numéro de série', required: true },
      { key: 'scannedCode', label: 'Code-barres' },
      { key: 'brand', label: 'Marque' },
      { key: 'model', label: 'Modèle' },
      { key: 'category', label: 'Catégorie' },
      { key: 'quantity', label: 'Quantité' },
      { key: 'description', label: 'Description' },
      { key: 'itemType', label: 'Type' },
      ...customFields.map(f => ({ key: `custom_${f.fieldKey}`, label: `[Perso] ${f.name}` })),
    ];
  };

  // Mettre à jour le mapping OCR
  const updateOcrMapping = (ocrFieldKey: string, inventoryField: string) => {
    setOcrMapping(prev => ({
      ...prev,
      [ocrFieldKey]: inventoryField
    }));
  };

  // Mettre à jour un champ OCR éditable
  const updateEditableOcrField = (key: string, value: string) => {
    setEditableOcrFields(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Auto-mapping intelligent basé sur les noms de champs
  const autoMapOcrFields = () => {
    if (!ocrResult) return;
    
    const autoMapping: Record<string, string> = {};
    const ocrFields = getOcrFields();
    
    ocrFields.forEach(field => {
      const fieldKey = field.key.toLowerCase();
      if (fieldKey === 'name') autoMapping[field.key] = 'name';
      else if (fieldKey.includes('serie') || fieldKey.includes('serial')) autoMapping[field.key] = 'serialNumber';
      else if (fieldKey === 'barcode' || fieldKey.includes('code')) autoMapping[field.key] = 'scannedCode';
      else if (fieldKey.includes('brand') || fieldKey.includes('marque')) autoMapping[field.key] = 'brand';
      else if (fieldKey.includes('model') || fieldKey.includes('modele')) autoMapping[field.key] = 'model';
      else if (fieldKey.includes('description') || fieldKey.includes('desc')) autoMapping[field.key] = 'description';
    });
    
    setOcrMapping(autoMapping);
  };

  // Ouvrir la modal de mapping
  const openOcrMapping = () => {
    if (!ocrResult?.success) return;
    
    // Auto-mapping initial
    autoMapOcrFields();
    onOcrMappingOpen();
  };

  // Appliquer le mapping OCR aux champs
  const applyOcrMapping = () => {
    if (!ocrResult) return;

    const ocrFields = getOcrFields();
    const mappedFields = Object.values(ocrMapping);
    
    if (mappedFields.filter(f => f).length === 0) {
      toast({
        title: 'Aucun mapping',
        description: 'Veuillez mapper au moins un champ',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    // Appliquer les valeurs mappées
    Object.entries(ocrMapping).forEach(([ocrFieldKey, inventoryField]) => {
      if (!inventoryField) return;
      
      const ocrField = ocrFields.find(f => f.key === ocrFieldKey);
      if (!ocrField) return;
      
      const value = ocrField.value;
      
      // Mapper aux champs du formulaire
      switch (inventoryField) {
        case 'name':
          setName(value);
          break;
        case 'serialNumber':
          setSerialNumber(value);
          break;
        case 'scannedCode':
          setBarcode(value);
          break;
        case 'brand':
          setBrand(value);
          break;
        case 'model':
          setModel(value);
          break;
        case 'description':
          setDescription(value);
          break;
        case 'category':
          setCategory(value);
          break;
        case 'quantity':
          const qty = parseInt(value) || 1;
          setQuantity(qty);
          break;
        default:
          // Champs personnalisés
          if (inventoryField.startsWith('custom_')) {
            const fieldKey = inventoryField.replace('custom_', '');
            setCustomData(prev => ({
              ...prev,
              [fieldKey]: value
            }));
          }
          break;
      }
    });

    // Ajouter l'image OCR aux médias
    if (ocrImage) {
      setMedia(prev => [...prev, ocrImage]);
    }

    toast({
      title: 'Champs remplis',
      description: 'Les données ont été appliquées au formulaire',
      status: 'success',
      duration: 2000,
      isClosable: true,
    });

    onOcrMappingClose();
    onOcrModalClose();
    setOcrImage(null);
    setOcrResult(null);
    setOcrMapping({});
  };

  // Soumettre le formulaire
  const handleSubmit = async () => {
    if (!name) {
      toast({
        title: 'Erreur',
        description: 'Veuillez remplir au moins le nom',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Uploader les images (fichiers locaux + base64 + blob)
      const imagePaths: string[] = [];
      const itemSerialNumber = serialNumber.trim() || `IMP-${Date.now()}`;

      // Uploader les fichiers locaux (File objects du file picker)
      for (let i = 0; i < mediaFiles.length; i++) {
        const file = mediaFiles[i];
        const path = await uploadImage(file, itemSerialNumber);
        if (path) {
          imagePaths.push(path);
        }
      }

      // Uploader les images base64 et récupérer les chemins API existants
      // (les blob: URLs sont déjà gérées via mediaFiles ci-dessus)
      for (let i = 0; i < media.length; i++) {
        const m = media[i];
        if (m.startsWith('/api/images/')) {
          // Déjà uploadé sur le serveur
          imagePaths.push(m);
        } else if (m.startsWith('data:image/')) {
          // Image base64 (récupérée via UPC lookup ou AI) — convertir en File et uploader
          try {
            const res = await fetch(m);
            const blob = await res.blob();
            const ext = blob.type.split('/')[1] || 'jpg';
            const file = new File([blob], `img_${i}.${ext}`, { type: blob.type });
            const path = await uploadImage(file, itemSerialNumber);
            if (path) imagePaths.push(path);
          } catch (e) {
            console.error('[Scanner] Erreur upload image base64:', e);
          }
        }
        // blob: URLs sont ignorées ici car déjà uploadées via mediaFiles
      }

      // 2. Créer un item pour chaque unité
      for (let i = 0; i < quantity; i++) {
        const itemData = {
          scannedCode: barcode.trim() || null,
          serialNumber: i === 0 ? itemSerialNumber : `${itemSerialNumber}-${i}`,
          name: name.trim(),
          category: category,
          brand: brand.trim() || null,
          model: model.trim() || null,
          quantity: 1,
          categoryDetails: description.trim() || '',
          image: imagePaths.length > 0 ? JSON.stringify(imagePaths) : null,
          customData: Object.keys(customData).length > 0 ? customData : undefined,
        };

        await saveItem(itemData);
      }

      toast({
        title: 'Succès',
        description: `${quantity} item(s) enregistré(s) avec succès`,
        status: 'success',
        duration: 2000,
        isClosable: true,
      });

      // Réinitialiser le formulaire (libérer les URLs blob)
      media.forEach(m => {
        if (m.startsWith('blob:')) URL.revokeObjectURL(m);
      });
      setBarcode('');
      setSerialNumber('');
      setName('');
      setCategory('materiel');
      setBrand('');
      setModel('');
      setQuantity(1);
      setDescription('');
      setMedia([]);
      setMediaFiles([]);
      setCustomData({});
    } catch (error) {
      console.error('Erreur enregistrement:', error);
      toast({
        title: 'Erreur',
        description: 'Erreur lors de l\'enregistrement',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    return () => {
      stopScan();
    };
  }, []);

  // URL SSE - utiliser la configuration
  const SSE_URL = getSSEUrl();

  // Charger les catégories et champs personnalisés au montage
  useEffect(() => {
    const loadCategoriesData = async () => {
      try {
        const data = await getCategories();
        // data.categories contient déjà toutes les catégories (default + custom)
        // On déduplique pour éviter les erreurs React de clés dupliquées
        const uniqueCategories = Array.from(new Set(data.categories || []));
        setCategories(uniqueCategories);
      } catch (error) {
        console.error('Erreur chargement catégories:', error);
        // Catégories par défaut en cas d'erreur
        setCategories(['materiel', 'drone', 'video', 'audio', 'streaming', 'robot', 'ordinateur', 'casque_vr', 'camera', 'eclairage', 'accessoire', 'autre']);
      }
    };
    
    const loadCustomFieldsData = async () => {
      try {
        const data = await getCustomFields();
        setCustomFields(data.fields || []);
      } catch (error) {
        console.error('Erreur chargement champs personnalisés:', error);
        setCustomFields([]);
      }
    };
    
    // Chargement initial
    loadCategoriesData();
    loadCustomFieldsData();
    
    // Écouter les événements SSE pour recharger uniquement lors de changements
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
        console.log('[SSE] Connecté aux événements temps réel');
        reconnectAttempts = 0;
      };
      
      eventSource.onerror = () => {
        console.log('[SSE] Erreur de connexion, tentative de reconnexion...');
        eventSource?.close();
        
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
          reconnectTimeout = setTimeout(connectSSE, delay);
        }
      };
      
      eventSource.addEventListener('categories_changed', () => {
        loadCategoriesData();
      });
      
      eventSource.addEventListener('custom_fields_changed', () => {
        loadCustomFieldsData();
      });
    };
    
    connectSSE();
    
    return () => {
      eventSource?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  // Gérer le stream de la caméra OCR quand le modal s'ouvre
  useEffect(() => {
    if (isOcrCameraOpen && ocrStreamRef.current && ocrVideoRef.current) {
      // S'assurer que le stream est assigné
      if (ocrVideoRef.current.srcObject !== ocrStreamRef.current) {
        ocrVideoRef.current.srcObject = ocrStreamRef.current;
        ocrVideoRef.current.play().catch(err => {
          console.error('Erreur lecture vidéo OCR:', err);
        });
      }
    }
    
    // Nettoyer quand le modal se ferme
    return () => {
      if (!isOcrCameraOpen && ocrStreamRef.current) {
        ocrStreamRef.current.getTracks().forEach(track => track.stop());
        ocrStreamRef.current = null;
      }
      if (ocrVideoRef.current && !isOcrCameraOpen) {
        ocrVideoRef.current.srcObject = null;
      }
    };
  }, [isOcrCameraOpen]);

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }} w="100%" overflowX="hidden">
      <Card mb="20px" w="100%">
        <VStack spacing={4} align="stretch" w="100%">
          <Flex justify="space-between" align="center">
            <Box>
              <Icon as={MdQrCodeScanner} w="32px" h="32px" color="brand.500" />
            </Box>
            <HStack flexWrap="wrap" gap={2}>
              {/* Bouton Analyse IA - Analyse intelligente avec OpenRouter */}
              <Button
                colorScheme="teal"
                leftIcon={<Icon as={MdAutoAwesome} />}
                onClick={() => aiInputRef.current?.click()}
                isLoading={isAiAnalyzing}
                loadingText="Analyse IA..."
                size="lg"
              >
                ✨ Analyse IA
              </Button>
              <input
                type="file"
                ref={aiInputRef}
                accept="image/*"
                onChange={handleAiImageUpload}
                style={{ display: 'none' }}
              />
            </HStack>
          </Flex>

          {/* Zone de scan vidéo avec overlay */}
          {(isScanning || isCameraLoading) && (
            <Box
              w="100%"
              maxW="800px"
              mx="auto"
              borderRadius="xl"
              overflow="hidden"
              bg="gray.900"
              position="relative"
              boxShadow="2xl"
              border="3px solid"
              borderColor={isCameraLoading ? 'orange.500' : 'brand.500'}
              minH="400px"
            >
              {/* Titre de la zone de scan */}
              <Box
                position="absolute"
                top="0"
                left="0"
                right="0"
                bg={isCameraLoading ? 'orange.500' : 'brand.500'}
                color="white"
                px={4}
                py={2}
                zIndex={10}
                fontSize="sm"
                fontWeight="bold"
                textAlign="center"
              >
                {isCameraLoading ? '⏳ Initialisation de la caméra...' : '📷 Scanner en direct - Positionnez un code-barres devant la caméra'}
              </Box>
              
              {/* Spinner de chargement */}
              {isCameraLoading && (
                <Flex
                  position="absolute"
                  top="0"
                  left="0"
                  right="0"
                  bottom="0"
                  alignItems="center"
                  justifyContent="center"
                  bg="blackAlpha.700"
                  zIndex={5}
                >
                  <VStack spacing={4}>
                    <Spinner size="xl" color="orange.500" thickness="4px" />
                    <Text color="white" fontSize="lg" fontWeight="bold">
                      Chargement de la caméra...
                    </Text>
                    <Text color="gray.300" fontSize="sm">
                      Autorisez l'accès si demandé
                    </Text>
                  </VStack>
                </Flex>
              )}
              
              {/* Vidéo en arrière-plan */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ 
                  width: '100%', 
                  height: 'auto',
                  minHeight: '400px',
                  maxHeight: '600px',
                  display: 'block',
                  objectFit: 'contain',
                  backgroundColor: '#000'
                }}
              />
              
              {/* Canvas overlay pour afficher les détections */}
              <canvas
                ref={canvasRef}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  zIndex: 2
                }}
              />
              
              {/* Indicateur de détection ou durée */}
              {detectedBarcodes.length > 0 ? (
                <Box
                  position="absolute"
                  top="60px"
                  left="50%"
                  transform="translateX(-50%)"
                  bg="green.500"
                  color="white"
                  px={6}
                  py={3}
                  borderRadius="lg"
                  fontWeight="bold"
                  fontSize="md"
                  boxShadow="xl"
                  animation="pulse 2s infinite"
                  zIndex={10}
                >
                  ✓ Code détecté ! Fermeture automatique...
                </Box>
              ) : (
                <Box
                  position="absolute"
                  top="60px"
                  left="50%"
                  transform="translateX(-50%)"
                  bg={scanDuration > 8 ? 'orange.500' : 'blackAlpha.700'}
                  color="white"
                  px={4}
                  py={2}
                  borderRadius="md"
                  fontSize="sm"
                  boxShadow="lg"
                  zIndex={10}
                >
                  {scanDuration > 8 ? (
                    <VStack spacing={1}>
                      <Text fontWeight="bold">⚠️ Aucune détection après {scanDuration}s</Text>
                      <Text fontSize="xs">Vérifiez l'éclairage, la distance et la stabilité</Text>
                    </VStack>
                  ) : (
                    <Text>
                      🔍 Scan en cours... {scanDuration}s
                    </Text>
                  )}
                </Box>
              )}
              
              {/* Instructions permanentes */}
              {detectedBarcodes.length === 0 && !isCameraLoading && (
                <Box
                  position="absolute"
                  top="50%"
                  left="50%"
                  transform="translate(-50%, -50%)"
                  bg="blackAlpha.800"
                  color="white"
                  px={6}
                  py={5}
                  borderRadius="xl"
                  fontSize="md"
                  textAlign="center"
                  maxW="85%"
                  border="3px dashed"
                  borderColor="brand.400"
                  boxShadow="xl"
                  zIndex={3}
                >
                  <VStack spacing={3}>
                    <Icon as={MdQrCodeScanner} w={10} h={10} color="brand.400" />
                    <Text fontWeight="bold" fontSize="lg">En attente de code-barres...</Text>
                    <VStack spacing={1} fontSize="sm" color="gray.300">
                      <Text>📸 Tenez le code-barres bien droit</Text>
                      <Text>🔆 Assurez un bon éclairage</Text>
                      <Text>📏 Distance: 15-30 cm de la caméra</Text>
                      <Text>⏱️ Maintenez stable 2-3 secondes</Text>
                    </VStack>
                    <Text fontSize="xs" color="yellow.300" fontWeight="bold" mt={2}>
                      Un rectangle rouge apparaîtra automatiquement
                    </Text>
                  </VStack>
                </Box>
              )}
              
              {/* Indicateur de scan actif (coins animés) */}
              {!isCameraLoading && detectedBarcodes.length === 0 && (
                <Box
                  position="absolute"
                  top="50%"
                  left="50%"
                  transform="translate(-50%, -50%)"
                  w="300px"
                  h="200px"
                  border="2px solid"
                  borderColor="brand.400"
                  borderRadius="lg"
                  pointerEvents="none"
                  zIndex={1}
                  opacity={0.3}
                  animation="pulse 2s ease-in-out infinite"
                />
              )}
            </Box>
          )}

          {/* Formulaire de saisie manuelle */}
          {showManualInput && (
            <VStack spacing={4} align="stretch" mt={4}>
              <FormControl>
                <FormLabel>Code-barres (optionnel)</FormLabel>
                <InputGroup>
                  <Input
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="Scanner ou saisir le code-barres"
                  />
                  <InputRightElement width="3rem">
                    <IconButton
                      aria-label="Rechercher item"
                      icon={isSearching ? <Spinner size="sm" /> : <Icon as={MdSearch} />}
                      size="sm"
                      bg={searchBtnBg}
                      color="white"
                      _hover={{ bg: searchBtnHover }}
                      onClick={handleSerialNumberSearch}
                      isDisabled={isSearching}
                      borderRadius="md"
                    />
                  </InputRightElement>
                </InputGroup>
              </FormControl>

              <FormControl>
                <FormLabel>Numéro de série (optionnel)</FormLabel>
                <InputGroup>
                  <Input
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    placeholder="Numéro de série"
                  />
                  <InputRightElement width="3rem">
                    <IconButton
                      aria-label="Rechercher item"
                      icon={isSearching ? <Spinner size="sm" /> : <Icon as={MdSearch} />}
                      size="sm"
                      bg={searchBtnBg}
                      color="white"
                      _hover={{ bg: searchBtnHover }}
                      onClick={handleSerialNumberSearch}
                      isDisabled={isSearching}
                      borderRadius="md"
                    />
                  </InputRightElement>
                </InputGroup>
              </FormControl>

              <FormControl isRequired>
                <FormLabel>Nom</FormLabel>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nom de l'item"
                />
              </FormControl>

              <FormControl>
                <FormLabel>Catégorie</FormLabel>
                <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {categories.length > 0 ? (
                    categories.map((cat, index) => (
                      <option key={`${cat}-${index}`} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1).replace('_', ' ')}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="materiel">Matériel</option>
                      <option value="autre">Autre</option>
                    </>
                  )}
                </Select>
              </FormControl>

              <HStack spacing={4} flexDirection={{ base: 'column', md: 'row' }} align="stretch">
                <FormControl flex={1}>
                  <FormLabel>Marque</FormLabel>
                  <Input
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="Ex: Apple, DJI, Meta..."
                  />
                </FormControl>

                <FormControl flex={1}>
                  <FormLabel>Modèle</FormLabel>
                  <Input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="Ex: MacBook Pro, Quest 3..."
                  />
                </FormControl>
              </HStack>

              <FormControl>
                <FormLabel>Quantité</FormLabel>
                <Input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  min={1}
                />
              </FormControl>

              <FormControl>
                <FormLabel>Description</FormLabel>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description de l'item"
                  rows={3}
                />
              </FormControl>

              <FormControl>
                <FormLabel>Images/Vidéos</FormLabel>
                <HStack>
                  <Button
                    leftIcon={<Icon as={MdCameraAlt} />}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Ajouter média
                  </Button>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={handleMediaSelect}
                    display="none"
                  />
                </HStack>
                {media.length > 0 && (
                  <Flex wrap="wrap" gap={2} mt={2}>
                    {media.map((item, index) => (
                      <Box key={index} position="relative">
                        <Image
                          src={item}
                          alt={`Media ${index + 1}`}
                          w="100px"
                          h="100px"
                          objectFit="cover"
                          borderRadius="md"
                        />
                        <Button
                          size="xs"
                          colorScheme="red"
                          position="absolute"
                          top={1}
                          right={1}
                          onClick={() => removeMedia(index)}
                        >
                          ×
                        </Button>
                      </Box>
                    ))}
                  </Flex>
                )}
              </FormControl>

              {/* Champs personnalisés (colonnes définies dans Inventaire > Colonne) */}
              {customFields.length > 0 && (
                <Box w="100%" mt={4}>
                  <Divider mb={4} />
                  <Text fontWeight="bold" fontSize={{ base: 'lg', md: 'md' }} color="brand.500" mb={2}>
                    <Icon as={MdTextFields} mr={2} />
                    Champs personnalisés
                  </Text>
                  <Text fontSize={{ base: 'sm', md: 'xs' }} color="gray.500" mb={4}>
                    Ces colonnes sont définies dans Inventaire → Colonne. Chaque champ apparaît ici en saisie.
                  </Text>
                  <VStack spacing={4} align="stretch" w="100%">
                    {customFields
                      .sort((a, b) => a.displayOrder - b.displayOrder)
                      .map((field) => {
                        const fieldKey = field.fieldKey;
                        const value = customData[fieldKey] || '';
                        
                        return (
                          <FormControl key={field.id} isRequired={field.required} w="100%">
                          <FormLabel>
                            {field.name}
                            {field.required && <Text as="span" color="red.500"> *</Text>}
                          </FormLabel>
                          {field.fieldType === 'text' && (
                            <Input
                              value={value}
                              onChange={(e) =>
                                setCustomData({ ...customData, [fieldKey]: e.target.value })
                              }
                              placeholder={`Saisir ${field.name.toLowerCase()}`}
                            />
                          )}
                          {field.fieldType === 'textarea' && (
                            <Textarea
                              value={value}
                              onChange={(e) =>
                                setCustomData({ ...customData, [fieldKey]: e.target.value })
                              }
                              placeholder={`Saisir ${field.name.toLowerCase()}`}
                              rows={3}
                            />
                          )}
                          {field.fieldType === 'number' && (
                            <Input
                              type="number"
                              value={value}
                              onChange={(e) =>
                                setCustomData({ ...customData, [fieldKey]: e.target.value })
                              }
                              placeholder={`Saisir ${field.name.toLowerCase()}`}
                            />
                          )}
                          {field.fieldType === 'date' && (
                            <Input
                              type="date"
                              value={value}
                              onChange={(e) =>
                                setCustomData({ ...customData, [fieldKey]: e.target.value })
                              }
                            />
                          )}
                          {field.fieldType === 'select' && (
                            <Select
                              value={value}
                              onChange={(e) =>
                                setCustomData({ ...customData, [fieldKey]: e.target.value })
                              }
                              placeholder={`Sélectionner ${field.name.toLowerCase()}`}
                            >
                              {field.options?.map((option, idx) => (
                                <option key={idx} value={option}>
                                  {option}
                                </option>
                              ))}
                            </Select>
                          )}
                          {field.fieldType === 'checkbox' && (
                            <Checkbox
                              isChecked={value === true || value === 'true'}
                              onChange={(e) =>
                                setCustomData({ ...customData, [fieldKey]: e.target.checked })
                              }
                            >
                              {field.name}
                            </Checkbox>
                          )}
                          {field.fieldType === 'url' && (
                            <Input
                              type="url"
                              value={value}
                              onChange={(e) =>
                                setCustomData({ ...customData, [fieldKey]: e.target.value })
                              }
                              placeholder="https://..."
                            />
                          )}
                          {field.fieldType === 'email' && (
                            <Input
                              type="email"
                              value={value}
                              onChange={(e) =>
                                setCustomData({ ...customData, [fieldKey]: e.target.value })
                              }
                              placeholder="email@example.com"
                            />
                          )}
                        </FormControl>
                      );
                    })}
                  </VStack>
                  <Divider mt={4} />
                </Box>
              )}

              <Button
                colorScheme="brand"
                size="lg"
                onClick={handleSubmit}
                isLoading={isSubmitting}
                loadingText="Enregistrement..."
              >
                Enregistrer
              </Button>
            </VStack>
          )}
        </VStack>
      </Card>

      {/* Modal OCR */}
      <Modal isOpen={isOcrModalOpen} onClose={onOcrModalClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack>
              <Icon as={MdDocumentScanner} color="purple.500" />
              <Text>Reconnaissance d'étiquette (OCR)</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              {/* Image capturée */}
              {ocrImage && (
                <Box
                  borderRadius="md"
                  overflow="hidden"
                  border="1px solid"
                  borderColor="gray.200"
                >
                  <Image
                    src={ocrImage}
                    alt="Image à analyser"
                    maxH="300px"
                    w="100%"
                    objectFit="contain"
                  />
                </Box>
              )}

              {/* Bouton lancer OCR */}
              {!ocrResult && (
                <Button
                  colorScheme="purple"
                  onClick={processOcr}
                  isLoading={isOcrProcessing}
                  loadingText="Analyse en cours..."
                  leftIcon={<Icon as={MdTextFields} />}
                >
                  Analyser l'image
                </Button>
              )}

              {/* Résultats OCR */}
              {ocrResult && ocrResult.success && (
                <Box>
                  <Text fontWeight="bold" mb={2}>Données détectées :</Text>
                  
                  <VStack spacing={2} align="stretch">
                    {ocrResult.parsed?.name && (
                      <HStack>
                        <Badge colorScheme="blue">Nom</Badge>
                        <Text>{ocrResult.parsed.name}</Text>
                      </HStack>
                    )}
                    {ocrResult.parsed?.serialNumber && (
                      <HStack>
                        <Badge colorScheme="green">N° Série</Badge>
                        <Text fontFamily="mono">{ocrResult.parsed.serialNumber}</Text>
                      </HStack>
                    )}
                    {ocrResult.parsed?.brand && (
                      <HStack>
                        <Badge colorScheme="purple">Marque</Badge>
                        <Text>{ocrResult.parsed.brand}</Text>
                      </HStack>
                    )}
                    {ocrResult.parsed?.model && (
                      <HStack>
                        <Badge colorScheme="orange">Modèle</Badge>
                        <Text>{ocrResult.parsed.model}</Text>
                      </HStack>
                    )}
                    {ocrResult.parsed?.barcode && (
                      <HStack>
                        <Badge colorScheme="teal">Code-barres</Badge>
                        <Text fontFamily="mono">{ocrResult.parsed.barcode}</Text>
                      </HStack>
                    )}
                    {ocrResult.parsed?.description && (
                      <Box>
                        <Badge colorScheme="gray" mb={1}>Description</Badge>
                        <Text fontSize="sm" color="gray.600">{ocrResult.parsed.description}</Text>
                      </Box>
                    )}
                  </VStack>

                  <Divider my={3} />
                  
                  <Text fontWeight="bold" mb={2}>Texte brut détecté :</Text>
                  <Box
                    bg="gray.50"
                    p={3}
                    borderRadius="md"
                    maxH="150px"
                    overflowY="auto"
                    fontSize="sm"
                    fontFamily="mono"
                    whiteSpace="pre-wrap"
                  >
                    {ocrResult.rawText}
                  </Box>
                </Box>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <HStack spacing={3}>
              <Button variant="ghost" onClick={onOcrModalClose}>
                Annuler
              </Button>
              {ocrResult && ocrResult.success && (
                <Button colorScheme="brand" onClick={openOcrMapping}>
                  Mapper les champs
                </Button>
              )}
              {!ocrResult && (
                <Button
                  variant="outline"
                  onClick={() => ocrInputRef.current?.click()}
                >
                  Changer d'image
                </Button>
              )}
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal Caméra OCR */}
      <Modal isOpen={isOcrCameraOpen} onClose={stopOcrCamera} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack justify="space-between">
              <HStack>
                <Icon as={MdCameraAlt} color="purple.500" />
                <Text>Prendre une photo de l'étiquette</Text>
              </HStack>
              <IconButton
                aria-label="Fermer"
                icon={<Icon as={MdClose} />}
                size="sm"
                variant="ghost"
                onClick={stopOcrCamera}
              />
            </HStack>
          </ModalHeader>
          <ModalBody>
            <VStack spacing={4}>
              {/* Instructions */}
              <Box bg="purple.50" p={3} borderRadius="md" w="100%">
                <Text fontSize="sm" color="purple.700">
                  Positionnez l'étiquette bien en face de la caméra, avec un bon éclairage.
                  Le texte doit être lisible et net.
                </Text>
              </Box>

              {/* Aperçu caméra */}
              <Box
                w="100%"
                borderRadius="lg"
                overflow="hidden"
                bg="black"
                position="relative"
                minH="300px"
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                {!isOcrCameraActive && (
                  <VStack spacing={3}>
                    <Spinner size="xl" color="purple.500" thickness="4px" />
                    <Text color="white" fontSize="sm">
                      Initialisation de la caméra...
                    </Text>
                  </VStack>
                )}
                
                <video
                  ref={ocrVideoRef}
                  autoPlay
                  playsInline
                  muted
                  controls={false}
                  style={{ 
                    width: '100%', 
                    height: 'auto',
                    maxHeight: '400px',
                    minHeight: '300px',
                    objectFit: 'contain',
                    display: isOcrCameraActive ? 'block' : 'none'
                  }}
                  onLoadedMetadata={() => {
                    if (ocrVideoRef.current) {
                      ocrVideoRef.current.play().catch(err => {
                        console.error('Erreur auto-play:', err);
                      });
                    }
                  }}
                />
                
                {/* Cadre de visée */}
                {isOcrCameraActive && (
                  <Box
                    position="absolute"
                    top="50%"
                    left="50%"
                    transform="translate(-50%, -50%)"
                    w="80%"
                    h="60%"
                    border="2px dashed"
                    borderColor="purple.400"
                    borderRadius="md"
                    pointerEvents="none"
                    boxShadow="0 0 0 9999px rgba(0, 0, 0, 0.3)"
                  />
                )}
              </Box>

              {/* Bouton de capture */}
              <Button
                colorScheme="purple"
                size="lg"
                leftIcon={<Icon as={MdCameraAlt} boxSize={6} />}
                onClick={captureOcrPhoto}
                w="100%"
                isDisabled={!isOcrCameraActive}
                isLoading={!isOcrCameraActive}
                loadingText="Initialisation..."
              >
                Capturer l'image
              </Button>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Modal Mapping OCR */}
      <Modal 
        isOpen={isOcrMappingOpen} 
        onClose={onOcrMappingClose} 
        size={{ base: 'full', md: '4xl' }}
        scrollBehavior="inside"
      >
        <ModalOverlay />
        <ModalContent maxH={{ base: '100vh', md: '90vh' }}>
          <ModalHeader>
            <HStack>
              <Icon as={MdDocumentScanner} color="purple.500" />
              <Text fontSize={{ base: 'md', md: 'lg' }}>Mapper les champs OCR</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <VStack spacing={4} align="stretch">
              {/* Instructions */}
              <Box bg="purple.50" p={3} borderRadius="md">
                <VStack align="start" spacing={1}>
                  <Text fontSize="sm" fontWeight="semibold" color="purple.700">
                    Instructions :
                  </Text>
                  <Text fontSize="xs" color="purple.600">
                    Modifiez le texte détecté si nécessaire, puis associez chaque champ à une colonne de l'inventaire.
                  </Text>
                </VStack>
              </Box>

              {/* Mapping avec Drag & Drop (masqué sur mobile) */}
              <Box display={{ base: 'none', md: 'block' }}>
                <Text fontWeight="bold" mb={3}>Correspondance des champs (Glissez-déposez) :</Text>
                
                <Flex gap={4} direction={{ base: 'column', md: 'row' }}>
                  {/* Champs OCR (Source - Draggable) */}
                  <Box flex={1} minW="300px">
                    <Text fontSize="sm" fontWeight="semibold" mb={2} color="blue.600">
                      Champs OCR détectés ({getOcrFields().length})
                    </Text>
                    <VStack spacing={2} align="stretch" maxH="400px" overflowY="auto" p={2} bg="blue.50" borderRadius="md">
                      {getOcrFields().map((field) => {
                        const mappedTo = ocrMapping[field.key];
                        const mappedColumn = getAvailableInventoryColumns().find(col => col.key === mappedTo);
                        return (
                          <Box
                            key={field.key}
                            draggable
                            onDragStart={(e) => {
                              setDraggedOcrField(field.key);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => setDraggedOcrField(null)}
                            p={3}
                            bg={mappedTo ? 'green.100' : 'white'}
                            border="2px solid"
                            borderColor={mappedTo ? 'green.400' : 'gray.200'}
                            borderRadius="md"
                            cursor="grab"
                            _active={{ cursor: 'grabbing' }}
                            _hover={{ shadow: 'md', transform: 'translateY(-2px)' }}
                            transition="all 0.2s"
                          >
                            <HStack justify="space-between">
                              <VStack align="start" spacing={0} flex={1}>
                                <HStack>
                                  <Badge colorScheme="blue" fontSize="xs">{field.label}</Badge>
                                </HStack>
                                <Text fontSize="xs" color="gray.600" noOfLines={2} mt={1}>
                                  {field.value}
                                </Text>
                              </VStack>
                              {mappedTo && (
                                <Badge colorScheme="green" fontSize="xs">
                                  → {mappedColumn?.label || mappedTo}
                                </Badge>
                              )}
                            </HStack>
                          </Box>
                        );
                      })}
                    </VStack>
                  </Box>

                  {/* Colonnes Inventaire (Destination - Drop Zones) */}
                  <Box flex={1} minW="300px">
                    <Text fontSize="sm" fontWeight="semibold" mb={2} color="purple.600">
                      Colonnes de l'inventaire
                    </Text>
                    <VStack spacing={2} align="stretch" maxH="400px" overflowY="auto" p={2} bg="purple.50" borderRadius="md">
                      {getAvailableInventoryColumns().map((col) => {
                        const ocrFieldKey = Object.keys(ocrMapping).find(
                          key => ocrMapping[key] === col.key
                        );
                        const ocrField = ocrFieldKey ? getOcrFields().find(f => f.key === ocrFieldKey) : null;
                        
                        return (
                          <Box
                            key={col.key}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (draggedOcrField !== null) {
                                updateOcrMapping(draggedOcrField, col.key);
                              }
                              setDraggedOcrField(null);
                            }}
                            p={3}
                            bg={ocrFieldKey !== undefined ? 'green.100' : 'white'}
                            border="2px dashed"
                            borderColor={ocrFieldKey !== undefined ? 'green.400' : 'gray.300'}
                            borderRadius="md"
                            minH="60px"
                            display="flex"
                            alignItems="center"
                            transition="all 0.2s"
                            _hover={{ borderColor: 'purple.400', bg: 'purple.50' }}
                          >
                            <VStack align="start" spacing={0} flex={1}>
                              <HStack>
                                <Text fontWeight="semibold" fontSize="sm">
                                  {col.label}
                                </Text>
                                {col.required && (
                                  <Badge colorScheme="red" fontSize="xx-small">*</Badge>
                                )}
                              </HStack>
                              {ocrField && (
                                <HStack mt={1}>
                                  <Badge colorScheme="blue" fontSize="xx-small">←</Badge>
                                  <Text fontSize="xs" color="gray.600" noOfLines={1}>
                                    {ocrField.value}
                                  </Text>
                                </HStack>
                              )}
                            </VStack>
                          </Box>
                        );
                      })}
                    </VStack>
                  </Box>
                </Flex>
              </Box>

              {/* Interface mobile/compacte : Champs éditables + Select */}
              <Box mt={4} p={{ base: 2, md: 3 }} bg="gray.50" borderRadius="md">
                <Text fontSize="sm" fontWeight="semibold" mb={3}>
                  Champs détectés (modifiables) :
                </Text>
                <VStack spacing={3} align="stretch">
                  {getOcrFields().map((field) => (
                    <Box 
                      key={field.key} 
                      p={3} 
                      bg="white" 
                      borderRadius="md" 
                      border="1px solid"
                      borderColor="gray.200"
                      _hover={{ borderColor: 'purple.300', shadow: 'sm' }}
                      transition="all 0.2s"
                    >
                      <VStack align="stretch" spacing={2}>
                        {/* Label du champ */}
                        <HStack justify="space-between">
                          <Badge colorScheme="blue" fontSize="xs">{field.label}</Badge>
                          {ocrMapping[field.key] && (
                            <Badge colorScheme="green" fontSize="xs">
                              → {getAvailableInventoryColumns().find(c => c.key === ocrMapping[field.key])?.label}
                            </Badge>
                          )}
                        </HStack>
                        
                        {/* Input éditable pour le texte OCR */}
                        {field.key === 'description' || field.key === 'rawText' ? (
                          <Textarea
                            value={field.value}
                            onChange={(e) => updateEditableOcrField(field.key, e.target.value)}
                            size="sm"
                            minH="60px"
                            placeholder="Modifier le texte détecté..."
                            fontSize="xs"
                            bg="blue.50"
                            borderColor="blue.200"
                            _focus={{ borderColor: 'purple.400', bg: 'white' }}
                          />
                        ) : (
                          <Input
                            value={field.value}
                            onChange={(e) => updateEditableOcrField(field.key, e.target.value)}
                            size="sm"
                            placeholder="Modifier le texte détecté..."
                            fontSize="xs"
                            bg="blue.50"
                            borderColor="blue.200"
                            _focus={{ borderColor: 'purple.400', bg: 'white' }}
                          />
                        )}
                        
                        {/* Select pour choisir la colonne de destination */}
                        <Select
                          size="sm"
                          value={ocrMapping[field.key] || ''}
                          onChange={(e) => updateOcrMapping(field.key, e.target.value)}
                          bg={ocrMapping[field.key] ? 'green.50' : 'white'}
                          borderColor={ocrMapping[field.key] ? 'green.300' : 'gray.200'}
                          fontSize="xs"
                          placeholder="→ Associer à une colonne..."
                        >
                          {getAvailableInventoryColumns().map((col) => (
                            <option key={col.key} value={col.key}>
                              {col.label} {col.required ? '*' : ''}
                            </option>
                          ))}
                        </Select>
                      </VStack>
                    </Box>
                  ))}
                </VStack>
              </Box>

              {/* Légende */}
              <HStack spacing={4} fontSize="xs" color="gray.500" flexWrap="wrap">
                <HStack>
                  <Icon as={MdCheckCircle} color="green.500" />
                  <Text>
                    {Object.keys(ocrMapping).filter(k => ocrMapping[k]).length} / {getOcrFields().length} champs mappés
                  </Text>
                </HStack>
              </HStack>
            </VStack>
          </ModalBody>
          <ModalFooter flexWrap="wrap" gap={2}>
            <Button 
              variant="ghost" 
              onClick={onOcrMappingClose}
              size={{ base: 'sm', md: 'md' }}
              flex={{ base: '1', md: 'initial' }}
            >
              Annuler
            </Button>
            <Button 
              variant="outline" 
              onClick={autoMapOcrFields}
              size={{ base: 'sm', md: 'md' }}
              flex={{ base: '1', md: 'initial' }}
            >
              Auto-mapping
            </Button>
            <Button 
              colorScheme="brand" 
              onClick={applyOcrMapping}
              size={{ base: 'sm', md: 'md' }}
              flex={{ base: '1', md: 'initial' }}
            >
              Appliquer
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
