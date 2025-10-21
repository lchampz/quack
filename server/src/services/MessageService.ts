import { WebSocket } from 'ws';
import { EventEmitter } from '../shared/event-system';
import { IMessageSignal, ISystemMessage, IncomingMessage } from '../types';

export class MessageService extends EventEmitter {
  private clientMeta: WeakMap<WebSocket, { roomId: string; userId: string }> = new WeakMap();

  setClientMeta(ws: WebSocket, roomId: string, userId: string): void {
    this.clientMeta.set(ws, { roomId, userId });
  }

  getClientMeta(ws: WebSocket): { roomId: string; userId: string } | undefined {
    return this.clientMeta.get(ws);
  }

  removeClientMeta(ws: WebSocket): void {
    this.clientMeta.delete(ws);
  }

  parseMessage(rawData: string): IncomingMessage | null {
    try {
      return JSON.parse(rawData) as IncomingMessage;
    } catch (error) {
      console.error('[MessageService] Erro ao parsear mensagem:', error);
      return null;
    }
  }

  handleJoinMessage(ws: WebSocket, message: IMessageSignal): { roomId: string; userId: string } | null {
    if (message.type !== 'join') {
      return null;
    }

    const roomId = message.payload.roomId;
    const userId = message.senderId;

    if (!roomId || !userId) {
      console.error('[MessageService] Dados inválidos na mensagem de join');
      return null;
    }

    this.setClientMeta(ws, roomId, userId);
    console.log(`[MessageService] Usuário ${userId} entrou na sala ${roomId}`);
    
    return { roomId, userId };
  }

  createSystemMessage(type: 'user-joined' | 'user-left', userId: string): ISystemMessage {
    return {
      type,
      senderId: userId,
    };
  }

  isSystemMessage(message: IncomingMessage): message is ISystemMessage {
    return message.type === 'user-joined' || message.type === 'user-left';
  }

  isSignalingMessage(message: IncomingMessage): message is IMessageSignal {
    return message.type === 'offer' || message.type === 'answer' || message.type === 'candidate';
  }

  validateSignalingMessage(message: IMessageSignal): boolean {
    if (!message.senderId || !message.payload) {
      return false;
    }

    switch (message.type) {
      case 'offer':
      case 'answer':
        return typeof message.payload === 'object' && 
               message.payload.type && 
               message.payload.sdp;
      case 'candidate':
        return typeof message.payload === 'object' && 
               message.payload.candidate;
      default:
        return false;
    }
  }
}
