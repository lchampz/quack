import { EventEmitter } from '@shared/event-system';
import { WebRTCService } from './WebRTCService';
import { WebSocketService } from './WebSocketService';
import { IMessageSignal, ISystemMessage, IncomingMessage, MessageType } from '@shared/types';

export interface SignalingEvents {
  'connection-state-changed': {
    isConnecting: boolean;
    isConnected: boolean;
    isMuted: boolean;
    isServerStarting: boolean;
  };
  'remote-stream': MediaStream | null;
  'user-joined': string;
  'user-left': string;
  'error': Error;
}

export class SignalingService extends EventEmitter {
  private webRTCService: WebRTCService;
  private webSocketService: WebSocketService;
  private userId: string;
  private roomId: string = '';

  constructor(
    webRTCService: WebRTCService,
    webSocketService: WebSocketService,
    userId: string
  ) {
    super();
    this.webRTCService = webRTCService;
    this.webSocketService = webSocketService;
    this.userId = userId;

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // WebRTC Events
    this.webRTCService.on('connection-state-changed', (state) => {
      this.emit('connection-state-changed', {
        ...state,
        isServerStarting: this.webSocketService.isConnected() ? false : state.isServerStarting,
      });
    });

    this.webRTCService.on('remote-stream', (stream) => {
      this.emit('remote-stream', stream);
    });

    this.webRTCService.on('ice-candidate', (candidate) => {
      this.sendSignal('candidate', candidate);
    });

    this.webRTCService.on('error', (error) => {
      this.emit('error', error);
    });

    // WebSocket Events
    this.webSocketService.on('connected', () => {
      console.log('[Signaling] WebSocket conectado, roomId:', this.roomId);
      if (this.roomId) {
        this.joinRoom(this.roomId);
      }
    });

    this.webSocketService.on('disconnected', () => {
      this.emit('connection-state-changed', {
        isConnecting: false,
        isConnected: false,
        isMuted: false,
        isServerStarting: false,
      });
    });

    this.webSocketService.on('message', (message: IncomingMessage) => {
      this.handleIncomingMessage(message);
    });

    this.webSocketService.on('server-starting', () => {
      this.emit('connection-state-changed', {
        isConnecting: false,
        isConnected: false,
        isMuted: false,
        isServerStarting: true,
      });
    });

    this.webSocketService.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  async connect(roomId: string): Promise<void> {
    if (this.roomId === roomId && this.webSocketService.isConnected()) {
      console.log('[Signaling] Já conectado à sala:', roomId);
      return;
    }
    
    this.roomId = roomId;
    this.webSocketService.connect();
  }

  private joinRoom(roomId: string): void {
    this.sendSignal('join', { roomId });
    console.log(`[Signaling] Usuário ${this.userId} entrou na sala ${roomId}`);
    
    // Emitir estado conectado
    this.emit('connection-state-changed', {
      isConnecting: false,
      isConnected: true,
      isMuted: false,
      isServerStarting: false,
    });
  }

  private sendSignal(type: MessageType, payload: any, targetId?: string): void {
    const signal: IMessageSignal = {
      type,
      senderId: this.userId,
      targetId,
      payload,
    };
    this.webSocketService.send(signal);
  }

  private async handleIncomingMessage(message: IncomingMessage): Promise<void> {
    // Mensagens do sistema
    if (this.isSystemMessage(message)) {
      this.handleSystemMessage(message);
      return;
    }

    // Mensagens de sinalização
    const signal = message as IMessageSignal;
    if (signal.senderId === this.userId) return; // Ignorar próprias mensagens

    try {
      await this.handleSignalingMessage(signal);
    } catch (error) {
      console.error('[Signaling] Erro ao processar mensagem:', error);
      this.emit('error', error as Error);
    }
  }

  private isSystemMessage(message: IncomingMessage): message is ISystemMessage {
    return message.type === 'user-joined' || message.type === 'user-left';
  }

  private handleSystemMessage(message: ISystemMessage): void {
    if (message.senderId === this.userId) return;

    switch (message.type) {
      case 'user-joined':
        console.log(`[Signaling] Usuário entrou: ${message.senderId}`);
        this.emit('user-joined', message.senderId);
        break;
      case 'user-left':
        console.log(`[Signaling] Usuário saiu: ${message.senderId}`);
        this.emit('user-left', message.senderId);
        break;
    }
  }

  private async handleSignalingMessage(signal: IMessageSignal): Promise<void> {
    switch (signal.type) {
      case 'offer':
        await this.handleOffer(signal.payload);
        break;
      case 'answer':
        await this.handleAnswer(signal.payload);
        break;
      case 'candidate':
        await this.handleIceCandidate(signal.payload);
        break;
    }
  }

  private async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    try {
      console.log('[Signaling] Processando offer recebido...');
      
      // Sempre criar uma nova PeerConnection para receber offer
      // (não reutilizar para evitar conflitos de estado)
      console.log('[Signaling] Criando nova PeerConnection para receber offer...');
      await this.webRTCService.createPeerConnection();
      
      const answer = await this.webRTCService.handleOffer(offer);
      console.log('[Signaling] Enviando answer...');
      this.sendSignal('answer', answer);
    } catch (error) {
      console.error('[Signaling] Erro ao processar offer:', error);
      this.emit('error', error as Error);
    }
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.webRTCService.isPeerConnectionValid()) {
      console.warn('[Signaling] Tentativa de processar answer sem PeerConnection válido');
      return;
    }
    try {
      await this.webRTCService.handleAnswer(answer);
    } catch (error) {
      console.error('[Signaling] Erro ao processar answer:', error);
      this.emit('error', error as Error);
    }
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.webRTCService.isPeerConnectionValid()) {
      console.warn('[Signaling] Tentativa de adicionar ICE candidate sem PeerConnection válido');
      return;
    }
    try {
      await this.webRTCService.addIceCandidate(candidate);
    } catch (error) {
      console.error('[Signaling] Erro ao adicionar ICE candidate:', error);
      this.emit('error', error as Error);
    }
  }

  async startCall(): Promise<void> {
    if (!this.webSocketService.isConnected()) {
      throw new Error('WebSocket não está conectado');
    }

    console.log('[Signaling] Iniciando chamada...');
    await this.webRTCService.createPeerConnection();
    console.log('[Signaling] PeerConnection criada, criando offer...');
    const offer = await this.webRTCService.createOffer();
    console.log('[Signaling] Offer criado, enviando...', offer.type);
    this.sendSignal('offer', offer);
  }

  toggleMute(mute: boolean): void {
    this.webRTCService.toggleMute(mute);
  }

  getLocalStream(): MediaStream | null {
    return this.webRTCService.getLocalStream();
  }

  disconnect(): void {
    console.log('[Signaling] Desconectando serviços...');
    this.webRTCService.cleanup();
    this.webSocketService.cleanup();
    this.roomId = '';
  }

  cleanup(): void {
    console.log('[Signaling] Limpando SignalingService...');
    this.disconnect();
    this.removeAllListeners();
  }
}
