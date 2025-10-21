import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from '../shared/event-system';
import { RoomService } from './RoomService';
import { MessageService } from './MessageService';
import { WebSocketClient, ServerEvents } from '../types';

export class WebSocketService extends EventEmitter {
  private wss: WebSocketServer;
  private roomService: RoomService;
  private messageService: MessageService;

  constructor(server: any, roomService: RoomService, messageService: MessageService) {
    super();
    this.roomService = roomService;
    this.messageService = messageService;
    
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[WebSocketService] Nova conexão estabelecida');
      this.handleConnection(ws);
    });

    // Room service events
    this.roomService.on('client-joined', (data) => {
      this.emit('client-joined', data);
    });

    this.roomService.on('client-left', (data) => {
      this.emit('client-left', data);
    });
  }

  private handleConnection(ws: WebSocket): void {
    ws.on('message', (rawData: Buffer) => {
      this.handleMessage(ws, rawData.toString());
    });

    ws.on('close', () => {
      this.handleDisconnection(ws);
    });

    ws.on('error', (error: Error) => {
      console.error('[WebSocketService] Erro na conexão:', error);
      this.emit('error', error);
    });
  }

  private handleMessage(ws: WebSocket, rawData: string): void {
    try {
      const message = this.messageService.parseMessage(rawData);
      if (!message) return;

    // Verificar se é mensagem de join
    if (message.type === 'join') {
      const joinData = this.messageService.handleJoinMessage(ws, message);
      if (joinData) {
        const client: WebSocketClient = {
          ws,
          meta: {
            roomId: joinData.roomId,
            userId: joinData.userId,
          },
        };

        this.roomService.addClientToRoom(joinData.roomId, client);
        
        // Notificar outros clientes
        const systemMessage = this.messageService.createSystemMessage('user-joined', joinData.userId);
        this.roomService.broadcastToRoom(joinData.roomId, systemMessage, client);
      }
      return;
    }

    // Mensagens de sinalização
    const clientMeta = this.messageService.getClientMeta(ws);
    if (!clientMeta) {
      console.warn('[WebSocketService] Mensagem recebida de cliente sem meta');
      return;
    }

    if (this.messageService.isSignalingMessage(message)) {
      if (!this.messageService.validateSignalingMessage(message)) {
        console.warn('[WebSocketService] Mensagem de sinalização inválida');
        return;
      }

      console.log(`[WebSocketService] Broadcast ${message.type} de ${message.senderId} para sala ${clientMeta.roomId}`);
      // Broadcast para outros clientes na sala
      this.roomService.broadcastToRoom(clientMeta.roomId, message, { ws, meta: clientMeta });
      this.emit('message-received', { roomId: clientMeta.roomId, message });
    }
    } catch (error) {
      console.error('[WebSocketService] Erro ao processar mensagem:', error);
      this.emit('error', error as Error);
    }
  }

  private handleDisconnection(ws: WebSocket): void {
    const clientMeta = this.messageService.getClientMeta(ws);
    if (!clientMeta) return;

    const client: WebSocketClient = {
      ws,
      meta: clientMeta,
    };

    this.roomService.removeClientFromRoom(clientMeta.roomId, client);
    this.messageService.removeClientMeta(ws);

    // Notificar outros clientes
    const systemMessage = this.messageService.createSystemMessage('user-left', clientMeta.userId);
    this.roomService.broadcastToRoom(clientMeta.roomId, systemMessage);
  }

  getStats(): { connections: number; rooms: number; totalClients: number } {
    return {
      connections: this.wss.clients.size,
      rooms: this.roomService.getRoomCount(),
      totalClients: this.roomService.getTotalClients(),
    };
  }

  close(): void {
    this.wss.close();
  }
}
