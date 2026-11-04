import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { config } from './config';

import authRouter from './routes/auth';
import catalogRouter from './routes/catalog';
import devicesRouter from './routes/devices';
import repairsRouter from './routes/repairs';
import qcRouter from './routes/qc';
import claimsRouter from './routes/claims';
import teamRouter from './routes/team';
import analyticsRouter from './routes/analytics';

const app: Application = express();

// Security & Parsing Middlewares
app.use(helmet());
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Generous Rate Limiting for multi-user workshop operations (eliminates 429 throttling)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100000, // generous quota for concurrent technician/manager polling
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health' || req.headers['x-lab-id'] !== undefined,
});
app.use('/api/', limiter);

// Serve uploads locally
app.use('/uploads', express.static(path.resolve(config.uploadDir)));

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'iLab Manager Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Mount Feature Routes
app.use('/api/auth', authRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/repairs', repairsRouter);
app.use('/api/qc', qcRouter);
app.use('/api/claims', claimsRouter);
app.use('/api/team', teamRouter);
app.use('/api/analytics', analyticsRouter);

// Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Unhandled Error]:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    console.log(`[iLab Manager] Production Backend Server listening on port ${config.port}`);
  });
}

export default app;
