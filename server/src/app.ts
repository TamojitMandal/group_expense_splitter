import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import authRoutes from './routes/auth.routes';
import groupRoutes from './routes/group.routes';
import expenseRoutes from './routes/expense.routes';
import settleRoutes from './routes/settle.routes';
import activityRoutes from './routes/activity.routes';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS restricted to CLIENT_ORIGIN
  const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  app.use(
    cors({
      origin: clientOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Request logging (skip in test environment to keep test output clean)
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  // Parsers
  app.use(express.json());
  app.use(cookieParser());

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/groups/:id/expenses', expenseRoutes);
  app.use('/api/groups/:id', settleRoutes);
  app.use('/api/groups/:id/activity', activityRoutes);

  // 404 handler for undefined routes
  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'API route not found',
      },
    });
  });

  // Global error handler
  app.use(errorHandler);

  return app;
}
