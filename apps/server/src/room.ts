import { applyAction, isGameError, makeEmptyState, makePlayerId } from 'game-engine';
import type { GameState, GameAction, PlayerId, StartGameAction, GameError } from 'game-engine';

const RECONNECT_TIMEOUT_MS = 60_000;

interface Room {
  state: GameState;
  /** playerId → socketId (latest connection) */
  sockets: Map<PlayerId, string>;
}

export interface RoomInfo {
  roomId: string;
  slots: { P1: boolean; P2: boolean };
  inProgress: boolean;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private socketToPlayer = new Map<string, { roomId: string; playerId: PlayerId }>();
  private disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Register a socket for a player in a room.
   * Returns the current GameState if the room already exists (reconnection), null otherwise.
   */
  joinSocket(roomId: string, playerId: PlayerId, socketId: string): GameState | null {
    const room = this.rooms.get(roomId);
    if (room === undefined) return null;
    room.sockets.set(playerId, socketId);
    this.socketToPlayer.set(socketId, { roomId, playerId });
    return room.state;
  }

  /**
   * Start a new game in a room using a StartGame action.
   * Overwrites any existing room state.
   */
  startGame(roomId: string, action: StartGameAction): GameState | GameError {
    const seed = makeEmptyState(action.player1.id, action.player2.id);
    const result = applyAction(seed, action);
    if (isGameError(result)) return result;

    const existing = this.rooms.get(roomId);
    this.rooms.set(roomId, {
      state: result,
      sockets: existing?.sockets ?? new Map(),
    });
    return result;
  }

  /**
   * Apply a GameAction to the room's state.
   * Returns the new GameState on success, a GameError on failure.
   */
  applyAction(roomId: string, action: GameAction): GameState | GameError {
    const room = this.rooms.get(roomId);
    if (room === undefined) {
      return { kind: 'GameError', code: 'NO_ROOM', message: `Salle inconnue : ${roomId}` };
    }
    const result = applyAction(room.state, action);
    if (isGameError(result)) return result;
    room.state = result;
    return result;
  }

  /**
   * List all active rooms with slot availability.
   */
  listRooms(): RoomInfo[] {
    return [...this.rooms.entries()].map(([roomId, room]) => ({
      roomId,
      slots: {
        P1: room.sockets.has(makePlayerId('P1')),
        P2: room.sockets.has(makePlayerId('P2')),
      },
      inProgress: room.state.phase !== 'Mulligan' && room.state.winner === null,
    }));
  }

  /**
   * Check whether a given slot (playerId) is already taken in a room.
   */
  isSlotTaken(roomId: string, playerId: PlayerId): boolean {
    const room = this.rooms.get(roomId);
    if (room === undefined) return false;
    return room.sockets.has(playerId);
  }

  /**
   * Find the first free player slot in a room (P1 → P2).
   * Returns null if room doesn't exist or both slots are taken.
   */
  getFreeSlot(roomId: string): PlayerId | null {
    const room = this.rooms.get(roomId);
    if (room === undefined) return null;
    const p1 = makePlayerId('P1');
    const p2 = makePlayerId('P2');
    if (!room.sockets.has(p1)) return p1;
    if (!room.sockets.has(p2)) return p2;
    return null;
  }

  /**
   * Look up which room and player a socket belongs to.
   */
  getSocketPlayer(socketId: string): { roomId: string; playerId: PlayerId } | undefined {
    return this.socketToPlayer.get(socketId);
  }

  /**
   * Get the current state of a room (used for forfeit broadcast).
   */
  getState(roomId: string): GameState | null {
    return this.rooms.get(roomId)?.state ?? null;
  }

  /**
   * Remove a socket on disconnect: clears both maps and returns info for the caller
   * to start a reconnect timer if needed.
   */
  removeSocket(socketId: string): { roomId: string; playerId: PlayerId; gameInProgress: boolean } | undefined {
    const info = this.socketToPlayer.get(socketId);
    if (info === undefined) return undefined;

    const room = this.rooms.get(info.roomId);
    let gameInProgress = false;
    if (room !== undefined) {
      room.sockets.delete(info.playerId);
      gameInProgress = room.state.winner === null;
    }
    this.socketToPlayer.delete(socketId);

    return { roomId: info.roomId, playerId: info.playerId, gameInProgress };
  }

  /**
   * Start or reset the forfeit countdown for a disconnected player.
   */
  setDisconnectTimer(roomId: string, playerId: PlayerId, timer: ReturnType<typeof setTimeout>): void {
    const key = `${String(playerId)}:${roomId}`;
    this.clearDisconnectTimer(roomId, playerId);
    this.disconnectTimers.set(key, timer);
  }

  /**
   * Cancel a pending forfeit timer (e.g. player reconnected in time).
   */
  clearDisconnectTimer(roomId: string, playerId: PlayerId): void {
    const key = `${String(playerId)}:${roomId}`;
    const existing = this.disconnectTimers.get(key);
    if (existing !== undefined) {
      clearTimeout(existing);
      this.disconnectTimers.delete(key);
    }
  }

  /**
   * Declare a winner by forfeit (opponent failed to reconnect).
   * Returns the updated GameState, or null if the room no longer exists / already has a winner.
   */
  forfeit(roomId: string, winnerId: PlayerId): GameState | null {
    const room = this.rooms.get(roomId);
    if (room === undefined || room.state.winner !== null) return null;
    const newState: GameState = { ...room.state, winner: winnerId };
    room.state = newState;
    return newState;
  }

  static readonly RECONNECT_TIMEOUT_MS = RECONNECT_TIMEOUT_MS;
}
