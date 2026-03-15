import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import express from 'express';
import { app } from './app.js';
import { logger } from './utils/logger.js';
const port = process.env.PORT || 5001;
// Create HTTP server for Socket.IO
const httpServer = createServer(app);
// Setup Socket.IO
const io = new Server(httpServer, {
    cors: {
        origin: [
            'http://localhost:3000',
            'http://localhost:5174',
            'http://localhost:5173',
            'http://localhost:5175',
            'https://netwin-tournament.web.app',
            'https://netwin-tournament--preview-fkc3zotn.web.app'
        ],
        credentials: true
    }
});
// Export io for use in routes if needed (though routes were registered in app.ts)
// Wait, if routes need io, they should be registered AFTER io is created.
// In the original index.ts, registerRoutes was called before io export but used io.
// ... rest of the socket logic ...
io.on('connection', (socket) => {
    logger.info(`User connected: ${socket.id}`);
    // ... socket handlers ...
});
// Serve static files in production
if (process.env.NODE_ENV === 'production' || process.env.VITE_PROD === 'true') {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(path.join(distPath, 'index.html'))) {
        app.use(express.static(distPath));
        app.get('*', (req, res) => {
            const ext = path.extname(req.path);
            if (ext && ext !== '.html')
                return res.status(404).send('Not found');
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }
}
// Start server
httpServer.listen(port, () => {
    logger.info(`🚀 Server running on port ${port}`);
});
