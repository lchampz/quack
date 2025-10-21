import express, { Express, Request, Response, NextFunction } from 'express';
import { EventEmitter } from '../shared/event-system';
import { WebSocketService } from './WebSocketService';

export class HttpService extends EventEmitter {
  private app: Express;
  private webSocketService: WebSocketService;

  constructor(webSocketService: WebSocketService) {
    super();
    this.app = express();
    this.webSocketService = webSocketService;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // CORS
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });

    // JSON parsing
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/', (req: Request, res: Response) => {
      const stats = this.webSocketService.getStats();
      res.json({
        message: 'Quack WebSocket Server is running!',
        timestamp: new Date().toISOString(),
        status: 'healthy',
        stats,
      });
    });

    // Stats endpoint
    this.app.get('/stats', (req: Request, res: Response) => {
      const stats = this.webSocketService.getStats();
      res.json({
        timestamp: new Date().toISOString(),
        ...stats,
      });
    });

    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`,
        timestamp: new Date().toISOString(),
      });
    });
  }

  getApp(): Express {
    return this.app;
  }
}
