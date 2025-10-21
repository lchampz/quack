import { EventEmitter, createEventHandler } from '@shared/event-system';
import { IMessageSignal, IncomingMessage } from '@shared/types';

export interface WebSocketEvents {
  'connected': void;
  'disconnected': void;
  'message': IncomingMessage;
  'error': Error;
  'server-starting': void;
}

export interface WebSocketConfig {
  urls: string[];
  maxRetries: number;
  retryDelay: number;
}

export class WebSocketService extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private isConnecting = false;
  private retryCount = 0;
  private currentUrlIndex = 0;
  private messageQueue: string[] = [];

  constructor(config: WebSocketConfig) {
    super();
    this.config = config;
  }

  connect(): void {
    if (this.isConnecting || this.isConnected()) {
      return;
    }

    this.tryConnect();
  }

  private tryConnect(): void {
    if (this.isConnecting) return;

    const url = this.config.urls[this.currentUrlIndex];
    if (!url) {
      console.error('[WebSocket] Sem URLs disponíveis');
      return;
    }

    this.isConnecting = true;
    console.log(`[WebSocket] Conectando a: ${url}`);

    // Mostrar loading para servidor remoto
    if (url.includes('onrender.com') && this.retryCount === 0) {
      console.log('[WebSocket] Servidor remoto detectado, emitindo server-starting');
      this.emit('server-starting');
    }

    try {
      const ws = new WebSocket(url);
      this.ws = ws;
      this.setupWebSocketEvents(ws);
    } catch (error) {
      this.handleConnectionError(error as Error);
    }
  }

  private setupWebSocketEvents(ws: WebSocket): void {
    ws.onopen = createEventHandler(() => {
      console.log('[WebSocket] Conectado com sucesso!');
      this.isConnecting = false;
      this.retryCount = 0;
      this.emit('connected');
      this.flushMessageQueue();
    });

    ws.onmessage = createEventHandler((event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data) as IncomingMessage;
        this.emit('message', message);
      } catch (error) {
        console.error('[WebSocket] Erro ao parsear mensagem:', error);
      }
    });

    ws.onclose = createEventHandler(() => {
      console.log('[WebSocket] Desconectado');
      this.isConnecting = false;
      this.emit('disconnected');
      this.handleReconnection();
    });

    ws.onerror = createEventHandler((event: Event) => {
      console.error('[WebSocket] Erro:', event);
      this.isConnecting = false;
      this.emit('error', new Error('WebSocket connection error'));
    });
  }

  private handleConnectionError(error: Error): void {
    this.isConnecting = false;
    this.retryCount++;
    
    console.error(`[WebSocket] Erro de conexão (tentativa ${this.retryCount}):`, error.message);
    
    if (this.retryCount < this.config.maxRetries) {
      // Para servidores remotos, usar delay mais curto
      const isRemote = this.config.urls[this.currentUrlIndex]?.includes('onrender.com');
      const baseDelay = isRemote ? 2000 : this.config.retryDelay;
      const delay = Math.min(this.retryCount * baseDelay, 10000); // Max 10s
      
      console.log(`[WebSocket] Tentativa ${this.retryCount}/${this.config.maxRetries} em ${delay}ms (${isRemote ? 'remoto' : 'local'})`);
      setTimeout(() => this.tryConnect(), delay);
    } else {
      this.tryNextUrl();
    }
  }

  private handleReconnection(): void {
    if (this.retryCount < this.config.maxRetries) {
      const delay = this.retryCount * this.config.retryDelay;
      setTimeout(() => this.tryConnect(), delay);
    } else {
      this.tryNextUrl();
    }
  }

  private tryNextUrl(): void {
    this.currentUrlIndex++;
    this.retryCount = 0;
    
    if (this.currentUrlIndex < this.config.urls.length) {
      setTimeout(() => this.tryConnect(), 1000);
    } else {
      console.error('[WebSocket] Todas as URLs falharam');
    }
  }

  send(message: IMessageSignal): void {
    const data = JSON.stringify(message);
    
    if (this.isConnected()) {
      this.ws!.send(data);
    } else {
      this.messageQueue.push(data);
    }
  }

  private flushMessageQueue(): void {
    if (!this.isConnected()) return;
    
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.ws!.send(message);
      }
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnecting = false;
    this.messageQueue = [];
  }

  cleanup(): void {
    this.disconnect();
    this.removeAllListeners();
  }
}
