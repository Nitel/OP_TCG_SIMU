import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { isGameError, makePlayerId } from 'game-engine';
import type { GameAction, StartGameAction } from 'game-engine';
import { RoomManager } from './room.js';

const PORT = process.env['PORT'] !== undefined ? Number(process.env['PORT']) : 3001;

const rawOrigins = process.env['CORS_ORIGIN'];
const allowedOrigins: string[] = rawOrigins
  ? rawOrigins.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const rooms = new RoomManager();

// ─── Socket events ────────────────────────────────────────────────────────────

/**
 * JoinRoom — join an existing room (reconnect) or start a new game.
 * Payload: { roomId: string, playerId: string, startAction?: StartGameAction }
 *
 * Response:
 *   'RoomJoined'  { state: GameState }      — success
 *   'ActionError' { code, message }          — failure
 */

/**
 * SendAction — send a GameAction to the server for validation and broadcast.
 * Payload: { roomId: string, action: GameAction }
 *
 * Broadcast on success: 'StateUpdated' { state: GameState }
 * Error on failure:     'ActionError'  { code, message }
 */

io.on('connection', socket => {
  console.log(`[connect] ${socket.id}`);

  socket.on('JoinRoom', (payload: { roomId: string; playerId: string; startAction?: StartGameAction }) => {
    const { roomId, playerId: rawPlayerId, startAction } = payload;
    const playerId = makePlayerId(rawPlayerId);

    // Start a new game if startAction is provided
    if (startAction !== undefined) {
      const result = rooms.startGame(roomId, startAction);
      if (isGameError(result)) {
        socket.emit('ActionError', { code: result.code, message: result.message });
        return;
      }
      rooms.joinSocket(roomId, playerId, socket.id);
      void socket.join(roomId);
      socket.emit('RoomJoined', { state: result });
      return;
    }

    // Reconnect to existing room
    const state = rooms.joinSocket(roomId, playerId, socket.id);
    if (state === null) {
      socket.emit('ActionError', { code: 'NO_ROOM', message: `Salle inconnue : ${roomId}` });
      return;
    }
    void socket.join(roomId);
    socket.emit('RoomJoined', { state });
  });

  socket.on('SendAction', (payload: { roomId: string; action: GameAction }) => {
    const { roomId, action } = payload;
    const result = rooms.applyAction(roomId, action);
    if (isGameError(result)) {
      socket.emit('ActionError', { code: result.code, message: result.message });
      return;
    }
    io.to(roomId).emit('StateUpdated', { state: result });
  });

  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
