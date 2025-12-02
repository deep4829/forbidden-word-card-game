'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import socket from '@/lib/socket';

export default function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  // Check for roomId in query params (from invite link)
  useEffect(() => {
    const inviteRoomId = searchParams.get('roomId');
    if (inviteRoomId) {
      setRoomId(inviteRoomId);
      setMode('join');
    }
  }, [searchParams]);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2">🎮</h1>
          <h2 className="text-4xl font-bold text-white mb-2">Forbidden Word</h2>
          <p className="text-indigo-100 text-lg">Game Lobby</p>
        </div>

        {/* Connection Status */}
        <div className={`mb-6 p-3 rounded-lg text-center font-medium ${isConnected ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
          }`}>
          {isConnected ? '✅ Connected to server' : '⏳ Connecting...'}
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Menu Mode */}
          {mode === 'menu' && (
            <div>
              <h3 className="text-2xl font-bold text-gray-800 mb-6 text-center">Welcome!</h3>
              <div className="space-y-4">
                <button
                  onClick={() => {
                    setMode('create');
                    setError('');
                  }}
                  className="w-full py-4 px-6 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-lg rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all transform hover:scale-105 shadow-lg"
                >
                  ➕ Create Room
                </button>
                <button
                  onClick={() => {
                    setMode('join');
                    setError('');
                  }}
                  className="w-full py-4 px-6 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold text-lg rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all transform hover:scale-105 shadow-lg"
                >
                  🚪 Join Room
                </button>
              </div>
            </div>
          )}

          {/* Create Room Mode */}
          {mode === 'create' && (
            <div>
              <button
                onClick={() => {
                  setMode('menu');
                  setError('');
                }}
                className="text-indigo-600 hover:text-indigo-700 font-medium mb-4"
              >
                ← Back
              </button>
              <h3 className="text-2xl font-bold text-gray-800 mb-6">Create Room</h3>
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
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-gray-900 placeholder-gray-500"
                    disabled={isLoading}
                  />
                </div>
                {error && (
                  <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm font-medium">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={isLoading || !isConnected}
                  className="w-full py-3 px-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Creating...' : 'Create Room'}
                </button>
              </form>
            </div>
          )}

          {/* Join Room Mode */}
          {mode === 'join' && (
            <div>
              <button
                onClick={() => {
                  setMode('menu');
                  setError('');
                }}
                className="text-indigo-600 hover:text-indigo-700 font-medium mb-4"
              >
                ← Back
              </button>
              <h3 className="text-2xl font-bold text-gray-800 mb-6">Join Room</h3>
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
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-gray-900 placeholder-gray-500"
                    disabled={isLoading}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Room ID
                  </label>
                  <input
                    type="text"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                    placeholder="Enter room ID or paste invite link"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none font-mono text-center text-gray-900 placeholder-gray-500"
                    disabled={isLoading}
                  />
                </div>
                {error && (
                  <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm font-medium">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={isLoading || !isConnected}
                  className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Joining...' : 'Join Room'}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-indigo-100">
          <p className="text-sm">
            Play, guess, and have fun with friends! 🎉
          </p>
        </div>
      </div>
    </div>
  );
}
