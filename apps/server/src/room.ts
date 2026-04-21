import { applyAction, isGameError, makeEmptyState } from 'game-engine';
import type { GameState, GameAction, PlayerId, StartGameAction, GameError } from 'game-engine';

interface Room {
  state: GameState;
  /** playerId → socketId (latest connection) */
  sockets: Map<PlayerId, string>;
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  /**
   * Register a socket for a player in a room.
   * Returns the current GameState if the room already exists (reconnection), null otherwise.
   */
  joinSocket(roomId: string, playerId: PlayerId, socketId: string): GameState | null {
    const room = this.rooms.get(roomId);
    if (room === undefined) return null;
    room.sockets.set(playerId, socketId);
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
}
