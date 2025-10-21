// Sistema de eventos funcional

export type EventHandler<T = any> = (data: T) => void | Promise<void>;
export type EventMap = Record<string, EventHandler[]>;

export class EventEmitter {
  private events: EventMap = {};

  on<T = any>(event: string, handler: EventHandler<T>): () => void {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(handler);

    // Retorna função para remover o listener
    return () => this.off(event, handler);
  }

  off(event: string, handler: EventHandler): void {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(h => h !== handler);
  }

  emit<T = any>(event: string, data?: T): void {
    if (!this.events[event]) return;
    this.events[event].forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Erro no handler do evento ${event}:`, error);
      }
    });
  }

  async emitAsync<T = any>(event: string, data?: T): Promise<void> {
    if (!this.events[event]) return;
    await Promise.all(
      this.events[event].map(async handler => {
        try {
          await handler(data);
        } catch (error) {
          console.error(`Erro no handler async do evento ${event}:`, error);
        }
      })
    );
  }

  removeAllListeners(event?: string): void {
    if (event) {
      delete this.events[event];
    } else {
      this.events = {};
    }
  }
}

// Utilitários para criar event handlers específicos
export const createEventHandler = <T>(
  handler: EventHandler<T>
): EventHandler<T> => handler;

export const createAsyncEventHandler = <T>(
  handler: EventHandler<T>
): EventHandler<T> => async (data: T) => {
  try {
    await handler(data);
  } catch (error) {
    console.error('Erro em event handler async:', error);
  }
};
