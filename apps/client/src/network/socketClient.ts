import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { makePlayerId } from 'game-engine';
import type { GameAction, GameState, PlayerId, StartGameAction } from 'game-engine';

export interface RoomInfo {
  roomId: string;
  slots: { P1: boolean; P2: boolean };
  inProgress: boolean;
}

export interface NetworkCallbacks {
  onStateUpdate: (state: GameState) => void;
  onRoomJoined?: (state: GameState, assignedPlayerId: PlayerId) => void;
  onError: (msg: string) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onRoomList?: (rooms: RoomInfo[]) => void;
  /** Opponent disconnected — reconnectDeadline is a Unix timestamp (ms) */
  onPlayerDisconnected?: (info: { playerId: string; reconnectDeadline: number }) => void;
  /** Opponent reconnected before the deadline */
  onPlayerReconnected?: (info: { playerId: string }) => void;
}

export class SocketClient {
  private socket: Socket;

  constructor(serverUrl: string, callbacks: NetworkCallbacks) {
    this.socket = io(serverUrl, { autoConnect: true });

    this.socket.on('RoomJoined', ({ state, assignedPlayerId }: { state: GameState; assignedPlayerId?: string }) => {
      const pid = makePlayerId(assignedPlayerId ?? 'P1');
      callbacks.onRoomJoined?.(state, pid);
      callbacks.onStateUpdate(state);
    });

    this.socket.on('StateUpdated', ({ state }: { state: GameState }) => {
      callbacks.onStateUpdate(state);
    });

    this.socket.on('ActionError', ({ message }: { code: string; message: string }) => {
      callbacks.onError(message);
    });

    this.socket.on('RoomList', ({ rooms }: { rooms: RoomInfo[] }) => {
      callbacks.onRoomList?.(rooms);
    });

    this.socket.on('PlayerDisconnected', (info: { playerId: string; reconnectDeadline: number }) => {
      callbacks.onPlayerDisconnected?.(info);
    });

    this.socket.on('PlayerReconnected', (info: { playerId: string }) => {
      callbacks.onPlayerReconnected?.(info);
    });

    this.socket.on('connect', () => {
      callbacks.onConnect?.();
    });

    this.socket.on('disconnect', () => {
      callbacks.onDisconnect?.();
    });

    this.socket.on('connect_error', (err: Error) => {
      callbacks.onDisconnect?.();
      callbacks.onError(`Connexion impossible : ${err.message}`);
    });
  }

  joinRoom(roomId: string, startAction?: StartGameAction): void {
    this.socket.emit('JoinRoom', { roomId, startAction });
  }

  sendAction(roomId: string, action: GameAction): void {
    this.socket.emit('SendAction', { roomId, action });
  }

  listRooms(): void {
    this.socket.emit('ListRooms');
  }

  disconnect(): void {
    this.socket.disconnect();
  }
}
