'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import socket from '@/lib/socket';

export default function JoinPage() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Check socket connection status
    setIsConnected(socket.connected);

    // Listen for connection events
    const onConnect = () => {
      setIsConnected(true);
      setError('');
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    const onConnectError = () => {
      setError('Failed to connect to server. Please try again.');
      setIsLoading(false);
    };

    // Listen for room creation success
    const onRoomCreated = (data: { roomId: string; room: any }) => {
      console.log('Room created:', data.roomId);
      setIsLoading(false);
      router.push(`/room/${data.roomId}`);
    };

    // Listen for room join success
    const onRoomJoined = (data: { roomId: string; room: any }) => {
      console.log('Room joined:', data.roomId);
      setIsLoading(false);
      router.push(`/room/${data.roomId}`);
    };

    // Listen for errors
    const onError = (data: { message: string }) => {
      setError(data.message);
      setIsLoading(false);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('room-created', onRoomCreated);
    socket.on('room-joined', onRoomJoined);
    socket.on('error', onError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('room-created', onRoomCreated);
      socket.off('room-joined', onRoomJoined);
      socket.off('error', onError);
    };
  }, [router]);

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();

    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!isConnected) {
      setError('Not connected to server. Please wait...');
      return;
    }

    setIsLoading(true);
    setError('');
    socket.emit('create-room', playerName.trim());
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();

    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!roomId.trim()) {
      setError('Please enter a room ID');
      return;
    }

    if (!isConnected) {
      setError('Not connected to server. Please wait...');
      return;
    }

    setIsLoading(true);
    setError('');
    socket.emit('join-room', { roomId: roomId.trim(), playerName: playerName.trim() });
  };

  const resetToMenu = () => {
    setMode('menu');
    setError('');
    setRoomId('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-4">
      <div className="w-full max-w-md">
        {/* Connection Status */}
        <div className="mb-4 text-center">
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${isConnected
              ? 'bg-green-500 text-white'
              : 'bg-yellow-500 text-white'
            }`}>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-white' : 'bg-white animate-pulse'
              }`} />
            {isConnected ? 'Connected' : 'Connecting...'}
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h1 className="text-4xl font-bold text-center mb-2 text-gray-800">
            Forbidden Word
          </h1>
          <p className="text-center text-gray-600 mb-8">
            The Ultimate Word Guessing Game
          </p>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm text-center">{error}</p>
            </div>
          )}

          {/* Menu Mode */}
          {mode === 'menu' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="playerName" className="block text-sm font-medium text-gray-700 mb-2">
                  Your Name
                </label>
                <input
                  type="text"
                  id="playerName"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition text-gray-800"
                  maxLength={20}
                  disabled={isLoading}
                />
              </div>

              <button
                onClick={() => setMode('create')}
                disabled={!playerName.trim() || isLoading || !isConnected}
                className="w-full py-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors duration-200 shadow-lg"
              >
                Create New Room
              </button>

              <button
                onClick={() => setMode('join')}
                disabled={!playerName.trim() || isLoading || !isConnected}
                className="w-full py-4 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors duration-200 shadow-lg"
              >
                Join Existing Room
              </button>
            </div>
          )}

          {/* Create Room Mode */}
          {mode === 'create' && (
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Name
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition text-gray-800"
                  maxLength={20}
                  disabled={isLoading}
                />
              </div>

              <button
                type="submit"
                disabled={!playerName.trim() || isLoading || !isConnected}
                className="w-full py-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors duration-200 shadow-lg"
              >
                {isLoading ? 'Creating Room...' : 'Create Room'}
              </button>

              <button
                type="button"
                onClick={resetToMenu}
                disabled={isLoading}
                className="w-full py-3 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors duration-200"
              >
                Back
              </button>
            </form>
          )}

          {/* Join Room Mode */}
          {mode === 'join' && (
            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Name
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition text-gray-800"
                  maxLength={20}
                  disabled={isLoading}
                />
              </div>

              <div>
                <label htmlFor="roomId" className="block text-sm font-medium text-gray-700 mb-2">
                  Room ID
                </label>
                <input
                  type="text"
                  id="roomId"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder="Enter room ID"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition text-gray-800"
                  disabled={isLoading}
                />
              </div>

              <button
                type="submit"
                disabled={!playerName.trim() || !roomId.trim() || isLoading || !isConnected}
                className="w-full py-4 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors duration-200 shadow-lg"
              >
                {isLoading ? 'Joining Room...' : 'Join Room'}
              </button>

              <button
                type="button"
                onClick={resetToMenu}
                disabled={isLoading}
                className="w-full py-3 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors duration-200"
              >
                Back
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-white text-sm">
          <p>Connect with friends and test your word skills!</p>
        </div>
      </div>
    </div>
  );
}
