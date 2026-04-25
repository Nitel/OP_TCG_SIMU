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

io.on('connection', socket => {
  console.log(`[connect] ${socket.id}`);

  socket.on('JoinRoom', (payload: { roomId: string; startAction?: StartGameAction }) => {
    const { roomId, startAction } = payload;

    // Start a new game if startAction is provided (P1 creating room)
    if (startAction !== undefined) {
      const playerId = makePlayerId('P1');
      // Refuse if P1's slot is already occupied by another active connection
      if (rooms.isSlotTaken(roomId, playerId)) {
        socket.emit('ActionError', {
          code: 'SLOT_TAKEN',
          message: `Slot P1 déjà pris dans la salle "${roomId}"`,
        });
        return;
      }
      const result = rooms.startGame(roomId, startAction);
      if (isGameError(result)) {
        socket.emit('ActionError', { code: result.code, message: result.message });
        return;
      }
      rooms.joinSocket(roomId, playerId, socket.id);
      void socket.join(roomId);
      socket.emit('RoomJoined', { state: result, assignedPlayerId: 'P1' });
      return;
    }

    // JOIN path — auto-assign the free slot
    const assignedSlot = rooms.getFreeSlot(roomId);
    if (assignedSlot === null) {
      const exists = rooms.getState(roomId) !== null;
      socket.emit('ActionError', {
        code: exists ? 'SLOT_TAKEN' : 'NO_ROOM',
        message: exists ? 'Tous les slots sont pris dans cette salle' : `Salle inconnue : ${roomId}`,
      });
      return;
    }

    // Cancel any pending forfeit timer for this player
    rooms.clearDisconnectTimer(roomId, assignedSlot);

    const state = rooms.joinSocket(roomId, assignedSlot, socket.id);
    if (state === null) {
      socket.emit('ActionError', { code: 'NO_ROOM', message: `Salle inconnue : ${roomId}` });
      return;
    }

    void socket.join(roomId);
    socket.emit('RoomJoined', { state, assignedPlayerId: String(assignedSlot) });

    // Notify the other player that their opponent reconnected
    socket.to(roomId).emit('PlayerReconnected', { playerId: String(assignedSlot) });
  });

  socket.on('SendAction', (payload: { roomId: string; action: GameAction }) => {
    const { roomId, action } = payload;

    // Validate action ownership
    const info = rooms.getSocketPlayer(socket.id);
    if (info === undefined || info.roomId !== roomId) {
      socket.emit('ActionError', { code: 'UNAUTHORIZED', message: 'Non autorisé' });
      return;
    }
    if ('playerId' in action && action.playerId !== info.playerId) {
      socket.emit('ActionError', { code: 'WRONG_PLAYER', message: "Ce n'est pas ton tour" });
      return;
    }

    const result = rooms.applyAction(roomId, action);
    if (isGameError(result)) {
      socket.emit('ActionError', { code: result.code, message: result.message });
      return;
    }
    io.to(roomId).emit('StateUpdated', { state: result });
  });

  socket.on('ListRooms', () => {
    socket.emit('RoomList', { rooms: rooms.listRooms() });
  });

  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);

    const info = rooms.removeSocket(socket.id);
    if (info === undefined) return;

    const deadline = Date.now() + RoomManager.RECONNECT_TIMEOUT_MS;

    // Notify the remaining player
    socket.to(info.roomId).emit('PlayerDisconnected', {
      playerId: String(info.playerId),
      reconnectDeadline: deadline,
    });

    // Only start forfeit timer if a game is actually in progress
    if (!info.gameInProgress) return;

    const timer = setTimeout(() => {
      const state = rooms.getState(info.roomId);
      if (state === null || state.winner !== null) return;

      const [p1Id, p2Id] = state.playerOrder;
      if (p1Id === undefined || p2Id === undefined) return;

      const winnerId = String(info.playerId) === String(p1Id) ? p2Id : p1Id;
      const newState = rooms.forfeit(info.roomId, winnerId);
      if (newState !== null) {
        console.log(`[forfeit] ${String(info.playerId)} didn't reconnect — ${String(winnerId)} wins`);
        io.to(info.roomId).emit('StateUpdated', { state: newState });
      }
    }, RoomManager.RECONNECT_TIMEOUT_MS);

    rooms.setDisconnectTimer(info.roomId, info.playerId, timer);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
