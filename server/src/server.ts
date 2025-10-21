import http from 'http';
import { EventEmitter } from './shared/event-system';
import { RoomService } from './services/RoomService';
import { MessageService } from './services/MessageService';
import { WebSocketService } from './services/WebSocketService';
import { HttpService } from './services/HttpService';

export class QuackServer extends EventEmitter {
  private server!: http.Server;
  private roomService!: RoomService;
  private messageService!: MessageService;
  private webSocketService!: WebSocketService;
  private httpService!: HttpService;
  private port: number;

  constructor(port: number = 3000) {
    super();
    this.port = port;
    this.initializeServices();
    this.setupEventHandlers();
  }

  private initializeServices(): void {
    // Criar servidor HTTP
    this.server = http.createServer();
    
    // Inicializar serviços
    this.roomService = new RoomService();
    this.messageService = new MessageService();
    this.webSocketService = new WebSocketService(this.server, this.roomService, this.messageService);
    this.httpService = new HttpService(this.webSocketService);

    // Configurar Express no servidor HTTP
    this.server.on('request', this.httpService.getApp());
  }

  private setupEventHandlers(): void {
    // WebSocket service events
    this.webSocketService.on('client-joined', (data) => {
      console.log(`[QuackServer] Cliente ${data.userId} entrou na sala ${data.roomId}`);
      this.emit('client-joined', data);
    });

    this.webSocketService.on('client-left', (data) => {
      console.log(`[QuackServer] Cliente ${data.userId} saiu da sala ${data.roomId}`);
      this.emit('client-left', data);
    });

    this.webSocketService.on('message-received', (data) => {
      this.emit('message-received', data);
    });

    this.webSocketService.on('error', (error) => {
      console.error('[QuackServer] Erro no WebSocket:', error);
      this.emit('error', error);
    });

    // Server events
    this.server.on('error', (error: Error) => {
      console.error('[QuackServer] Erro no servidor:', error);
      this.emit('error', error);
    });
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Configurar timeouts para evitar 502 errors
      this.server.keepAliveTimeout = 120000; // 120 segundos
      this.server.headersTimeout = 120000;   // 120 segundos
      
      this.server.listen(this.port, '0.0.0.0', () => {
        console.log(`🚀 Servidor Quack rodando na porta ${this.port}`);
        console.log(`📡 WebSocket disponível em ws://localhost:${this.port}/ws`);
        console.log(`🌐 HTTP disponível em http://localhost:${this.port}`);
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.webSocketService.close();
      this.server.close(() => {
        console.log('[QuackServer] Servidor parado');
        resolve();
      });
    });
  }

  getStats() {
    return this.webSocketService.getStats();
  }
}

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const server = new QuackServer(PORT);

process.on('SIGTERM', async () => {
  console.log('[QuackServer] SIGTERM recebido, parando servidor...');
  await server.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[QuackServer] SIGINT recebido, parando servidor...');
  await server.stop();
  process.exit(0);
});

server.start().catch((error) => {
  console.error('[QuackServer] Erro ao iniciar servidor:', error);
  console.error('[QuackServer] Stack trace:', error.stack);
  process.exit(1);
});
