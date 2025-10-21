import { EventEmitter } from '../shared/event-system';
import { Room, WebSocketClient, IMessageSignal, ISystemMessage } from '../types';

export class RoomService extends EventEmitter {
  private rooms: Map<string, Room> = new Map();

  createRoom(roomId: string): Room {
    if (this.rooms.has(roomId)) {
      return this.rooms.get(roomId)!;
    }

    const room: Room = {
      id: roomId,
      clients: new Set(),
    };

    this.rooms.set(roomId, room);
    console.log(`[RoomService] Sala criada: ${roomId}`);
    return room;
  }

  addClientToRoom(roomId: string, client: WebSocketClient): void {
    const room = this.getOrCreateRoom(roomId);
    room.clients.add(client);
    
    console.log(`[RoomService] Cliente ${client.meta.userId} adicionado à sala ${roomId}`);
    this.emit('client-joined', { roomId, userId: client.meta.userId });
  }

  removeClientFromRoom(roomId: string, client: WebSocketClient): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.clients.delete(client);
    
    console.log(`[RoomService] Cliente ${client.meta.userId} removido da sala ${roomId}`);
    this.emit('client-left', { roomId, userId: client.meta.userId });

    // Limpar sala se estiver vazia
    if (room.clients.size === 0) {
      this.rooms.delete(roomId);
      console.log(`[RoomService] Sala ${roomId} removida (vazia)`);
    }
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getOrCreateRoom(roomId: string): Room {
    return this.rooms.get(roomId) || this.createRoom(roomId);
  }

  broadcastToRoom(roomId: string, message: IMessageSignal | ISystemMessage, excludeClient?: WebSocketClient): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const messageStr = JSON.stringify(message);
    
    for (const client of room.clients) {
      if (client !== excludeClient && client.ws.readyState === 1) { // WebSocket.OPEN = 1
        try {
          client.ws.send(messageStr);
        } catch (error) {
          console.error(`[RoomService] Erro ao enviar mensagem para cliente ${client.meta.userId}:`, error);
        }
      }
    }
  }

  getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  getTotalClients(): number {
    let total = 0;
    for (const room of this.rooms.values()) {
      total += room.clients.size;
    }
    return total;
  }
}
