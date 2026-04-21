import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { GameAction, GameState, PlayerId, StartGameAction } from 'game-engine';

export interface NetworkCallbacks {
  onStateUpdate: (state: GameState) => void;
  onError: (msg: string) => void;
}

export class SocketClient {
  private socket: Socket;

  constructor(serverUrl: string, callbacks: NetworkCallbacks) {
    this.socket = io(serverUrl, { autoConnect: true });

    this.socket.on('RoomJoined', ({ state }: { state: GameState }) => {
      callbacks.onStateUpdate(state);
    });

    this.socket.on('StateUpdated', ({ state }: { state: GameState }) => {
      callbacks.onStateUpdate(state);
    });

    this.socket.on('ActionError', ({ message }: { code: string; message: string }) => {
      callbacks.onError(message);
    });

    this.socket.on('connect_error', (err: Error) => {
      callbacks.onError(`Connexion impossible : ${err.message}`);
    });
  }

  joinRoom(roomId: string, playerId: PlayerId, startAction?: StartGameAction): void {
    this.socket.emit('JoinRoom', { roomId, playerId: playerId as string, startAction });
  }

  sendAction(roomId: string, action: GameAction): void {
    this.socket.emit('SendAction', { roomId, action });
  }

  disconnect(): void {
    this.socket.disconnect();
  }
}
