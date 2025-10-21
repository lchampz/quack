import { useState, useRef, useCallback, useEffect } from "react";
import { WebRTCService } from "../services/WebRTCService";
import { WebSocketService } from "../services/WebSocketService";
import { SignalingService } from "../services/SignalingService";
import { WebRTCConfig, MediaConfig } from "@shared/types";
import { WebSocketConfig } from "../services/WebSocketService";
    
const STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" }
];

const webRTCConfig: WebRTCConfig = {
  iceServers: STUN_SERVERS,
};

const mediaConfig: MediaConfig = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
};

const getWebSocketUrls = (): string[] => {
  const urls: string[] = [];
  
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const isProduction = window.location.hostname.includes('vercel.app') || window.location.hostname.includes('netlify.app');
  
  if (isLocal) {
    console.log('[WebSocket] Ambiente local detectado');
    urls.push('ws://localhost:3000/ws');
  } else if (isProduction) {
    // @ts-ignore
    const serverUrl = (import.meta as any).env?.VITE_WEBSOCKET_URL || 'wss://quack-server-e0lt.onrender.com/ws';
    console.log('[WebSocket] Ambiente de produção detectado, URL:', serverUrl);
    urls.push(serverUrl);
  } else {
    // @ts-ignore
    const serverUrl = (import.meta as any).env?.VITE_WEBSOCKET_URL || 'wss://quack-server-e0lt.onrender.com/ws';
    console.log('[WebSocket] Outro ambiente detectado, URL:', serverUrl);
    urls.push(serverUrl);
  }
  
  return urls;
};

const webSocketConfig: WebSocketConfig = {
  urls: getWebSocketUrls(),
  maxRetries: 10, // Mais tentativas para servidores remotos
  retryDelay: 1000,
};

export const useWebSocket = (roomId: string, userId: string) => {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isServerStarting, setIsServerStarting] = useState<boolean>(false);
  const [hasStartedCall, setHasStartedCall] = useState<boolean>(false);
  
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const signalingServiceRef = useRef<SignalingService | null>(null);
  const hasInitializedRef = useRef<boolean>(false);
  const currentRoomIdRef = useRef<string>('');

  // Inicializar serviços
  const initializeServices = useCallback(() => {
    if (signalingServiceRef.current) {
      signalingServiceRef.current.cleanup();
    }

    const webRTCService = new WebRTCService(webRTCConfig, mediaConfig);
    const webSocketService = new WebSocketService(webSocketConfig);
    const signalingService = new SignalingService(webRTCService, webSocketService, userId);
    
    signalingServiceRef.current = signalingService;

    // Configurar event handlers
    signalingService.on('connection-state-changed', (state) => {
      setIsConnecting(state.isConnecting);
      setIsConnected(state.isConnected);
      setIsMuted(state.isMuted);
      setIsServerStarting(state.isServerStarting);
      
      // Se conectou, marcar que iniciou a chamada
      if (state.isConnected) {
        setHasStartedCall(true);
      }
    });

    signalingService.on('remote-stream', (stream) => {
      console.log('[useWebSocket] Stream remoto recebido');
      setRemoteStream(stream);
      const el = remoteAudioRef.current;
      if (el && stream) {
        el.srcObject = stream;
        el.play().catch(() => {/* autoplay blocked */});
      }
    });

    signalingService.on('user-joined', (userId) => {
      console.log('[useWebSocket] Usuário entrou na sala:', userId);
      // Iniciar chamada automaticamente quando outro usuário entra
      if (!hasStartedCall) {
        console.log('[useWebSocket] Iniciando chamada automaticamente...');
        startCall();
      }
    });

    signalingService.on('error', (error) => {
      console.error('[useWebSocket] Erro:', error);
    });

    return signalingService;
  }, [userId]);

  // Conectar à sala
  const connectToRoom = useCallback(async (roomId: string) => {
    if (!roomId || roomId.trim() === '') {
      console.log('[useWebSocket] Sem sala ativa, pulando conexão');
      return;
    }

    // Evitar execução múltipla para o mesmo roomId
    if (hasInitializedRef.current && currentRoomIdRef.current === roomId) {
      console.log('[useWebSocket] Já inicializado para este roomId, pulando');
      return;
    }

    console.log('[useWebSocket] Conectando à sala:', roomId);
    hasInitializedRef.current = true;
    currentRoomIdRef.current = roomId;

    const signalingService = initializeServices();
    await signalingService.connect(roomId);
  }, [initializeServices]);

  useEffect(() => {
    console.log('[useWebSocket] useEffect executado para roomId:', roomId);
    
    if (!roomId || roomId.trim() === '') {
      console.log('[useWebSocket] Sem sala ativa, limpando conexões');
      hasInitializedRef.current = false;
      currentRoomIdRef.current = '';
      if (signalingServiceRef.current) {
        signalingServiceRef.current.cleanup();
        signalingServiceRef.current = null;
      }
      return;
    }

    // Só conectar se for uma sala diferente
    if (currentRoomIdRef.current !== roomId) {
      connectToRoom(roomId);
    }

    // Função de limpeza - só limpar se mudou de sala
    return () => {
      if (currentRoomIdRef.current !== roomId) {
        console.log('[useWebSocket] Limpeza do useEffect - mudança de sala');
        if (signalingServiceRef.current) {
          signalingServiceRef.current.cleanup();
          signalingServiceRef.current = null;
        }
        hasInitializedRef.current = false;
        currentRoomIdRef.current = '';
      }
    };
  }, [roomId, connectToRoom]);

  // Limpeza quando não há sala ativa
  useEffect(() => {
    if (!roomId || roomId.trim() === '') {
      setIsServerStarting(false);
      setIsConnecting(false);
      setIsConnected(false);
    }
  }, [roomId]);

  const startCall = useCallback(async () => {
    try {
      console.log('[useWebSocket] Iniciando chamada...');
      
      if (!signalingServiceRef.current) {
        console.warn('[useWebSocket] Serviço de sinalização não está disponível');
        return;
      }

      if (hasStartedCall) {
        console.log('[useWebSocket] Chamada já foi iniciada');
        return;
      }

      await signalingServiceRef.current.startCall();
      setHasStartedCall(true);
    } catch (error) {
      console.error('[useWebSocket] Erro ao iniciar a chamada:', error);
    }
  }, [hasStartedCall]);

  const toggleMute = useCallback((mute: boolean) => {
    if (signalingServiceRef.current) {
      signalingServiceRef.current.toggleMute(mute);
      setIsMuted(mute);
    }
  }, []);

  return {
    localStream: signalingServiceRef.current?.getLocalStream() ?? null,
    remoteStream,
    startCall,
    toggleMute,
    isConnecting,
    isConnected,
    isMuted,
    isServerStarting,
    hasStartedCall,
    localAudioRef,
    remoteAudioRef,
  };
};
