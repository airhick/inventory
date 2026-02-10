'use client';
/*!
=========================================================
* Code Bar CRM - Voice Command Page
=========================================================
*/

import {
  Box,
  Button,
  Flex,
  VStack,
  HStack,
  Icon,
  useToast,
  Badge,
  Text,
  useColorModeValue,
  Progress,
  Divider,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Code,
} from '@chakra-ui/react';
import { useState, useRef, useEffect } from 'react';
import {
  MdMic,
  MdStop,
} from 'react-icons/md';
import Card from 'components/card/Card';

interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
}


export default function VoiceCommandPage() {
  const toast = useToast();
  const textColor = useColorModeValue('secondaryGray.900', 'white');

  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    audioBlob: null,
    audioUrl: null,
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const processAudioRef = useRef<(audioBlob?: Blob) => Promise<void>>();

  // Nettoyer les timers
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Démarrer l'enregistrement
  const startRecording = async () => {
    try {
      // Vérifier si l'API est disponible
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('UNSUPPORTED_BROWSER');
      }

      // Demander l'accès au microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Créer le MediaRecorder avec un format supporté
      let options: MediaRecorderOptions = { mimeType: 'audio/webm' };
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        options = { mimeType: 'audio/mp4' };
      }
      
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        setRecordingState(prev => ({
          ...prev,
          isRecording: false,
          audioBlob,
          audioUrl,
        }));

        // Arrêter le stream
        stream.getTracks().forEach(track => track.stop());
        
        // Traiter automatiquement l'audio
        processAudioRef.current?.(audioBlob);
      };

      mediaRecorder.start();
      
      setRecordingState(prev => ({
        ...prev,
        isRecording: true,
        isPaused: false,
        duration: 0,
        audioBlob: null,
        audioUrl: null,
      }));

      // Démarrer le timer
      timerRef.current = setInterval(() => {
        setRecordingState(prev => ({
          ...prev,
          duration: prev.duration + 1,
        }));
      }, 1000);

      toast({
        title: 'Enregistrement démarré',
        description: 'Parlez maintenant pour créer une location',
        status: 'info',
        duration: 3000,
      });
    } catch (error: any) {
      console.error('Erreur accès microphone:', error);
      
      let errorTitle = 'Erreur d\'accès au microphone';
      let errorDescription = 'Impossible d\'accéder au microphone.';
      
      // Détecter le type d'erreur et donner des solutions spécifiques
      if (error.message === 'UNSUPPORTED_BROWSER') {
        errorTitle = 'Navigateur non supporté';
        errorDescription = 'Votre navigateur ne supporte pas l\'enregistrement audio. Utilisez Chrome, Firefox ou Edge récent.';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        errorTitle = 'Microphone déjà utilisé';
        errorDescription = 'Le microphone est déjà utilisé par une autre application (Teams, Zoom, Skype, Discord, etc.). Fermez ces applications et réessayez.';
      } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorTitle = 'Permission refusée';
        errorDescription = 'Vous devez autoriser l\'accès au microphone. Cliquez sur l\'icône 🔒 ou 🎤 dans la barre d\'adresse et autorisez l\'accès.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorTitle = 'Aucun microphone détecté';
        errorDescription = 'Aucun microphone trouvé. Vérifications : 1) Branchez un micro ou un casque 2) Activez le micro dans Paramètres Windows > Son > Entrée 3) Vérifiez que le micro n\'est pas désactivé 4) Redémarrez votre navigateur.';
      } else if (error.name === 'OverconstrainedError') {
        errorTitle = 'Microphone incompatible';
        errorDescription = 'Le microphone ne supporte pas les paramètres requis. Essayez avec un autre microphone.';
      }
      
      toast({
        title: errorTitle,
        description: errorDescription,
        status: 'error',
        duration: 10000,
        isClosable: true,
      });
    }
  };

  // Arrêter l'enregistrement
  const stopRecording = () => {
    if (mediaRecorderRef.current && recordingState.isRecording) {
      mediaRecorderRef.current.stop();
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      toast({
        title: 'Enregistrement terminé',
        description: 'Traitement automatique en cours...',
        status: 'info',
        duration: 2000,
      });
    }
  };

  // Formater la durée (secondes → MM:SS)
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Traiter l'audio (transcription + analyse IA)
  const processAudio = async (audioBlob?: Blob) => {
    const blobToProcess = audioBlob || recordingState.audioBlob;
    if (!blobToProcess) {
      toast({
        title: 'Erreur',
        description: 'Aucun enregistrement à traiter',
        status: 'error',
        duration: 3000,
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Étape 1: Transcription audio → texte
      setProcessingStep('Transcription de l\'audio...');
      
      const formData = new FormData();
      formData.append('audio', blobToProcess, 'recording.webm');

      const transcriptionResponse = await fetch('/api/voice/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!transcriptionResponse.ok) {
        const errorData = await transcriptionResponse.json().catch(() => ({}));
        
        if (transcriptionResponse.status === 503) {
          throw new Error('Whisper non disponible. Installez faster-whisper: pip install faster-whisper et redémarrez le serveur.');
        }
        
        throw new Error(errorData.error || 'Erreur lors de la transcription');
      }

      const transcriptionData = await transcriptionResponse.json();

      toast({
        title: 'Transcription réussie',
        description: 'Analyse en cours...',
        status: 'success',
        duration: 2000,
      });

      // Étape 2: Analyse IA du texte
      setProcessingStep('Analyse IA du texte...');

      const analysisResponse = await fetch('/api/voice/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcriptionData.text }),
      });

      if (!analysisResponse.ok) {
        throw new Error('Erreur lors de l\'analyse IA');
      }

      const analysisData = await analysisResponse.json();

      toast({
        title: 'Analyse terminée',
        description: 'Redirection vers la page de location...',
        status: 'success',
        duration: 2000,
      });

      // Stocker les données pour la page location
      sessionStorage.setItem('voiceCommandData', JSON.stringify({
        items: analysisData.items,
        renterName: analysisData.renterName || '',
        startDate: analysisData.startDate,
        endDate: analysisData.endDate,
        rentalPrice: analysisData.rentalPrice || 0,
        rentalDeposit: analysisData.rentalDeposit || 0,
        notes: analysisData.notes || transcriptionData.text,
      }));

      // Rediriger vers l'onglet Nouvelle Location
      window.location.href = '/admin/location?tab=2';

    } catch (error: any) {
      console.error('Erreur traitement audio:', error);
      toast({
        title: 'Erreur',
        description: error.message || 'Impossible de traiter l\'audio',
        status: 'error',
        duration: 5000,
      });
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  // Assigner la fonction au ref pour l'appel depuis onstop
  processAudioRef.current = processAudio;

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      <Card>
        <VStack spacing={6} align="stretch">
          {/* En-tête */}
          <Flex justify="space-between" align="center">
            <VStack align="start" spacing={1}>
              <Text fontSize="2xl" fontWeight="bold" color={textColor}>
                Commande Vocale
              </Text>
              <Text fontSize="sm" color="gray.500">
                Enregistrez vos instructions vocales pour créer des locations automatiquement
              </Text>
            </VStack>
            <Badge colorScheme="purple" fontSize="md" px={3} py={1}>
              IA Activée
            </Badge>
          </Flex>

          <Divider />

          {/* Zone d'enregistrement */}
          <Card bg={useColorModeValue('gray.50', 'navy.700')} p={6}>
            <VStack spacing={4}>
              {/* Indicateur de statut */}
              {recordingState.isRecording ? (
                <Badge colorScheme="red" fontSize="lg" px={4} py={2} animation="pulse 2s infinite">
                  🔴 ENREGISTREMENT EN COURS
                </Badge>
              ) : recordingState.audioBlob ? (
                <Badge colorScheme="green" fontSize="lg" px={4} py={2}>
                  ✅ ENREGISTREMENT PRÊT
                </Badge>
              ) : (
                <Badge colorScheme="gray" fontSize="lg" px={4} py={2}>
                  ⚪ EN ATTENTE
                </Badge>
              )}

              {/* Timer */}
              {recordingState.isRecording && (
                <Text fontSize="4xl" fontWeight="bold" color="red.500" fontFamily="mono">
                  {formatDuration(recordingState.duration)}
                </Text>
              )}

              {/* Boutons de contrôle */}
              <HStack spacing={4}>
                {!recordingState.isRecording && !recordingState.audioBlob && (
                  <Button
                    leftIcon={<Icon as={MdMic} />}
                    colorScheme="red"
                    size="lg"
                    onClick={startRecording}
                    isDisabled={isProcessing}
                  >
                    Démarrer l'enregistrement
                  </Button>
                )}

                {recordingState.isRecording && (
                  <Button
                    leftIcon={<Icon as={MdStop} />}
                    colorScheme="red"
                    variant="outline"
                    size="lg"
                    onClick={stopRecording}
                  >
                    Arrêter
                  </Button>
                )}

                {recordingState.audioBlob && !isProcessing && (
                  <Button
                    leftIcon={<Icon as={MdMic} />}
                    colorScheme="red"
                    variant="outline"
                    size="lg"
                    onClick={() => {
                      setRecordingState({
                        isRecording: false,
                        isPaused: false,
                        duration: 0,
                        audioBlob: null,
                        audioUrl: null,
                      });
                      startRecording();
                    }}
                  >
                    Nouvel enregistrement
                  </Button>
                )}
              </HStack>

              {/* Lecteur audio */}
              {recordingState.audioUrl && (
                <Box w="full" mt={4}>
                  <audio
                    ref={audioRef}
                    src={recordingState.audioUrl}
                    controls
                    style={{ width: '100%' }}
                  />
                </Box>
              )}

              {/* Barre de progression du traitement */}
              {isProcessing && (
                <VStack w="full" spacing={2}>
                  <Progress size="sm" isIndeterminate colorScheme="purple" w="full" />
                  <Text fontSize="sm" color="gray.500">
                    {processingStep}
                  </Text>
                </VStack>
              )}
            </VStack>
          </Card>

          {/* Instructions */}
          <Alert status="info" borderRadius="md">
            <AlertIcon />
            <Box flex="1">
              <AlertTitle>Comment utiliser la commande vocale ?</AlertTitle>
              <AlertDescription display="block" mt={2}>
                <Text mb={2}>Dites par exemple :</Text>
                <Code display="block" p={2} whiteSpace="pre-wrap">
                  "Je veux louer 3 caméras avec l'ID CAM-001, CAM-002 et CAM-003,
                  du 5 février au 10 février, pour Jean Dupont"
                </Code>
                <Text mt={2} fontSize="sm">
                  L'IA analysera automatiquement votre demande et créera la location.
                </Text>
              </AlertDescription>
            </Box>
          </Alert>


        </VStack>
      </Card>
    </Box>
  );
}
