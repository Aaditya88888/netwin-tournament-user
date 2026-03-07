import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { registerRoutes } from './routes.js';

// Load environment variables
dotenv.config();

const app = express();

// Enable CORS for frontend
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5174',
    'http://localhost:5173',
    'http://localhost:5175',
    'https://netwin-tournament.web.app',
    'https://netwin-tournament--preview-fkc3zotn.web.app'
  ],
  credentials: true
}));

app.use(express.json());

// API health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Register all API routes
registerRoutes(app);

export { app };
