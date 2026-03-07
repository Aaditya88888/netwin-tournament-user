import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { registerRoutes } from './routes.js';
dotenv.config();
const app = express();
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
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
});
registerRoutes(app);
export { app };
//# sourceMappingURL=app.js.map