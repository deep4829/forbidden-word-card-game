'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import socket from '@/lib/socket';
import type { Room, Player } from '@/types/game';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;

  const [room, setRoom] = useState<Room | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  // Set current player ID when socket connects
  useEffect(() => {
    if (socket.connected) {
      setCurrentPlayerId(socket.id || '');
    }

    const onConnect = () => {
      setCurrentPlayerId(socket.id || '');
    };

    socket.on('connect', onConnect);
    return () => {
      socket.off('connect', onConnect);
    };
  }, []);

  // Socket event listeners
  useEffect(() => {
    // Listen for room updates
    const onRoomUpdated = (updatedRoom: Room) => {
      console.log('Room updated:', updatedRoom);
      setRoom(updatedRoom);
      setIsLoading(false);
    };

    // Listen for game started
    const onGameStarted = (data: { room: Room; roundNumber: number; currentClueGiver: string }) => {
      console.log('Game started:', data);
      router.push(`/room/${roomId}/game`);
    };

    // Listen for errors
    const onError = (data: { message: string }) => {
      setError(data.message);
      setIsLoading(false);
    };

    socket.on('room-updated', onRoomUpdated);
    socket.on('game-started', onGameStarted);
    socket.on('error', onError);

    return () => {
      socket.off('room-updated', onRoomUpdated);
      socket.off('game-started', onGameStarted);
      socket.off('error', onError);
    };
  }, [roomId, router]);

  // Request room data on mount
  useEffect(() => {
    if (roomId && socket.connected) {
      console.log('Requesting room data for:', roomId);
      socket.emit('get-room', roomId);
    }

    // Set loading to false after a timeout if no response
    const timeout = setTimeout(() => {
      setIsLoading(false);
      if (!room) {
        setError('Failed to load room. Please check the room ID.');
      }
    }, 3000);

    return () => {
      clearTimeout(timeout);
    };
  }, [roomId]);

  const handleStartGame = () => {
    if (!room || room.players.length !== 4) {
      setError('Game requires exactly 4 players to start');
      return;
    }

    socket.emit('start-game', roomId);
  };

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy room ID:', err);
    }
  };

  const isRoomCreator = room && room.players.length > 0 && room.players[0].id === currentPlayerId;
  const canStartGame = room && room.players.length === 4 && isRoomCreator && !room.gameStarted;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white mb-4"></div>
          <p className="text-white text-xl font-semibold">Loading room...</p>
        </div>
      </div>
    );
  }

  if (error && !room) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Room Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => router.push('/join')}
            className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Back to Join
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 p-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header Section */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">Game Lobby</h1>
              <p className="text-gray-600">Waiting for players to join...</p>
            </div>
            <button
              onClick={() => router.push('/join')}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            >
              Leave Room
            </button>
          </div>

          {/* Room ID Display */}
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6 border-2 border-indigo-200">
            <p className="text-sm font-medium text-gray-600 mb-2">Room ID</p>
            <div className="flex items-center gap-4">
              <code className="text-2xl font-bold text-indigo-600 tracking-wider flex-1">
                {roomId}
              </code>
              <button
                onClick={copyRoomId}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium whitespace-nowrap"
              >
                {copySuccess ? '✓ Copied!' : 'Copy ID'}
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-3">
              Share this ID with friends to invite them to the game
            </p>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-6">
            <p className="text-red-700 text-center font-medium">{error}</p>
          </div>
        )}

        {/* Players Section */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-800">Players</h2>
            <div className="flex items-center gap-2 px-4 py-2 bg-indigo-100 rounded-full">
              <span className="text-2xl font-bold text-indigo-600">
                {room?.players.length || 0}
              </span>
              <span className="text-gray-600 font-medium">/ 4</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {room?.players.map((player, index) => (
              <div
                key={player.id}
                className={`p-4 rounded-xl border-2 transition-all ${player.id === currentPlayerId
                    ? 'bg-indigo-50 border-indigo-300'
                    : 'bg-gray-50 border-gray-200'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-white ${index === 0 ? 'bg-yellow-500' : 'bg-indigo-500'
                    }`}>
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800 flex items-center gap-2">
                      {player.name}
                      {player.id === currentPlayerId && (
                        <span className="text-xs bg-indigo-600 text-white px-2 py-1 rounded-full">
                          You
                        </span>
                      )}
                      {index === 0 && (
                        <span className="text-xs bg-yellow-500 text-white px-2 py-1 rounded-full">
                          Host
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-500">
                      {player.isReady ? '✓ Ready' : 'Waiting...'}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {/* Empty Slots */}
            {Array.from({ length: 4 - (room?.players.length || 0) }).map((_, index) => (
              <div
                key={`empty-${index}`}
                className="p-4 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center text-gray-500">
                    ?
                  </div>
                  <div>
                    <p className="font-semibold text-gray-400">Waiting for player...</p>
                    <p className="text-sm text-gray-400">Empty slot</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Start Game Button */}
        {canStartGame && (
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <button
              onClick={handleStartGame}
              className="w-full py-6 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-2xl font-bold rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all transform hover:scale-105 shadow-lg"
            >
              🎮 Start Game
            </button>
            <p className="text-center text-gray-600 mt-4 text-sm">
              All 4 players are ready! Click to begin the game.
            </p>
          </div>
        )}

        {/* Waiting Message */}
        {room && room.players.length < 4 && (
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
            <div className="text-6xl mb-4">⏳</div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">
              Waiting for {4 - room.players.length} more player{4 - room.players.length !== 1 ? 's' : ''}
            </h3>
            <p className="text-gray-600">
              Share the room ID with your friends to get started!
            </p>
          </div>
        )}

        {/* Info Message for Non-Host */}
        {room && room.players.length === 4 && !isRoomCreator && (
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
            <div className="text-6xl mb-4">🎯</div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">
              Ready to Play!
            </h3>
            <p className="text-gray-600">
              Waiting for the host to start the game...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
