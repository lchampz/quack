// Tipos específicos do servidor
import { WebSocket } from 'ws';
import { IMessageSignal, ISystemMessage, IncomingMessage, RoomMeta } from '../shared/types';

export { IMessageSignal, ISystemMessage, IncomingMessage, RoomMeta };

export interface WebSocketClient {
  ws: WebSocket;
  meta: RoomMeta;
}

export interface Room {
  id: string;
  clients: Set<WebSocketClient>;
}

export interface ServerEvents {
  'client-joined': { roomId: string; userId: string };
  'client-left': { roomId: string; userId: string };
  'message-received': { roomId: string; message: IncomingMessage };
  'error': Error;
}
