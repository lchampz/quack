import { EventEmitter, createEventHandler } from '@shared/event-system';
import { WebRTCConfig, MediaConfig, ConnectionState } from '@shared/types';

export interface WebRTCEvents {
  'connection-state-changed': ConnectionState;
  'remote-stream': MediaStream | null;
  'ice-candidate': RTCIceCandidate;
  'error': Error;
}

export class WebRTCService extends EventEmitter {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private config: WebRTCConfig;
  private mediaConfig: MediaConfig;

  constructor(config: WebRTCConfig, mediaConfig: MediaConfig) {
    super();
    this.config = config;
    this.mediaConfig = mediaConfig;
  }

  async createPeerConnection(): Promise<RTCPeerConnection> {
    this.closeExistingConnection();

    const pc = new RTCPeerConnection({ iceServers: this.config.iceServers });
    this.peerConnection = pc;

    this.setupPeerConnectionEvents(pc);
    
    console.log('[WebRTC] Nova conexão criada');
    return pc;
  }

  private setupPeerConnectionEvents(pc: RTCPeerConnection): void {
    pc.onicecandidate = createEventHandler((event: RTCPeerConnectionIceEvent) => {
      if (event.candidate) {
        console.log('[WebRTC] ICE candidate gerado:', event.candidate);
        this.emit('ice-candidate', event.candidate);
      } else {
        console.log('[WebRTC] ICE gathering completo');
      }
    });

    pc.ontrack = createEventHandler((event: RTCTrackEvent) => {
      console.log('[WebRTC] Track remoto recebido:', event.track.kind);
      const stream = event.streams[0] ?? null;
      this.emit('remote-stream', stream);
    });

    pc.onconnectionstatechange = createEventHandler(() => {
      const state = pc.connectionState;
      const connectionState: ConnectionState = {
        isConnecting: state === 'connecting',
        isConnected: state === 'connected',
        isMuted: false, // Será gerenciado externamente
        isServerStarting: false, // Será gerenciado externamente
      };
      this.emit('connection-state-changed', connectionState);
    });

    pc.onsignalingstatechange = createEventHandler(() => {
      console.log(`[WebRTC] Signaling state: ${pc.signalingState}`);
    });
  }

  async getLocalMediaStream(): Promise<MediaStream> {
    if (this.localStream) {
      return this.localStream;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(this.mediaConfig);
      this.localStream = stream;
      return stream;
    } catch (error) {
      console.error('[WebRTC] Erro ao acessar mídia:', error);
      throw error;
    }
  }

  async addLocalTracksToConnection(): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('PeerConnection não existe');
    }

    // Obter stream primeiro
    const stream = await this.getLocalMediaStream();
    
    // Verificar se ainda temos uma conexão válida
    if (!this.isPeerConnectionValid()) {
      console.warn('[WebRTC] PeerConnection foi fechado durante getLocalMediaStream, pulando adição de tracks');
      return;
    }
    
    // Verificar se já temos senders para evitar duplicação
    const existingSenders = this.peerConnection.getSenders();
    const existingTrackIds = new Set(existingSenders.map(sender => sender.track?.id).filter(Boolean));
    
    // Adicionar apenas tracks que ainda não foram adicionados
    stream.getTracks().forEach(track => {
      if (this.isPeerConnectionValid() && !existingTrackIds.has(track.id)) {
        try {
          this.peerConnection!.addTrack(track, stream);
          console.log(`[WebRTC] Track ${track.kind} adicionado com sucesso`);
        } catch (error) {
          console.warn('[WebRTC] Erro ao adicionar track:', error);
        }
      } else if (existingTrackIds.has(track.id)) {
        console.log(`[WebRTC] Track ${track.kind} já existe, pulando adição`);
      } else {
        console.warn('[WebRTC] PeerConnection inválido durante adição de track');
      }
    });
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error('PeerConnection não existe');
    }

    console.log('[WebRTC] Criando offer...');
    await this.addLocalTracksToConnection();
    
    if (!this.isPeerConnectionValid()) {
      throw new Error('PeerConnection foi fechado durante createOffer');
    }
    
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    console.log('[WebRTC] Offer criado e local description definida');
    return offer;
  }

  async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error('PeerConnection não existe');
    }

    try {
      console.log('[WebRTC] Processando offer...');
      
      // Definir remote description
      await this.peerConnection.setRemoteDescription(offer);
      console.log('[WebRTC] Remote description definida');
      
      // Adicionar tracks locais (pode falhar se conexão foi fechada)
      try {
        await this.addLocalTracksToConnection();
        console.log('[WebRTC] Tracks locais adicionados');
      } catch (error) {
        console.warn('[WebRTC] Erro ao adicionar tracks locais:', error);
        // Continuar mesmo se falhar
      }
      
      // Verificar se ainda temos uma conexão válida
      if (!this.isPeerConnectionValid()) {
        throw new Error('PeerConnection foi fechado durante o processamento');
      }
      
      // Criar answer
      const answer = await this.peerConnection.createAnswer();
      console.log('[WebRTC] Answer criado');
      
      // Verificar novamente antes de setLocalDescription
      if (!this.isPeerConnectionValid()) {
        throw new Error('PeerConnection foi fechado durante createAnswer');
      }
      
      await this.peerConnection.setLocalDescription(answer);
      console.log('[WebRTC] Local description definida');
      
      return answer;
    } catch (error) {
      console.error('[WebRTC] Erro ao processar offer:', error);
      throw error;
    }
  }

  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      console.warn('[WebRTC] Tentativa de processar answer sem PeerConnection');
      return;
    }

    if (this.peerConnection.connectionState === 'closed') {
      console.warn('[WebRTC] Tentativa de processar answer em conexão fechada');
      return;
    }

    try {
      await this.peerConnection.setRemoteDescription(answer);
    } catch (error) {
      console.error('[WebRTC] Erro ao definir remote description (answer):', error);
    }
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) {
      console.warn('[WebRTC] Tentativa de adicionar ICE candidate sem PeerConnection');
      return;
    }

    if (this.peerConnection.connectionState === 'closed') {
      console.warn('[WebRTC] Tentativa de adicionar ICE candidate em conexão fechada');
      return;
    }

    try {
      await this.peerConnection.addIceCandidate(candidate);
    } catch (error) {
      console.warn('[WebRTC] Erro ao adicionar ICE candidate:', error);
    }
  }

  toggleMute(mute: boolean): void {
    if (!this.localStream) return;
    
    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = !mute;
    });
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getConnectionState(): RTCPeerConnectionState | null {
    return this.peerConnection?.connectionState ?? null;
  }

  getSignalingState(): RTCSignalingState | null {
    return this.peerConnection?.signalingState ?? null;
  }

  isPeerConnectionValid(): boolean {
    return this.peerConnection !== null && 
           this.peerConnection.connectionState !== 'closed' &&
           this.peerConnection.signalingState !== 'closed';
  }

  private closeExistingConnection(): void {
    if (this.peerConnection) {
      console.log('[WebRTC] Fechando conexão existente...');
      
      // Remover todos os senders primeiro
      this.peerConnection.getSenders().forEach(sender => {
        try {
          this.peerConnection!.removeTrack(sender);
        } catch (error) {
          console.warn('[WebRTC] Erro ao remover sender:', error);
        }
        if (sender.track) {
          sender.track.stop();
        }
      });
      
      this.peerConnection.close();
      this.peerConnection = null;
      console.log('[WebRTC] Conexão fechada');
    }
  }

  cleanup(): void {
    this.closeExistingConnection();
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    this.removeAllListeners();
  }
}
