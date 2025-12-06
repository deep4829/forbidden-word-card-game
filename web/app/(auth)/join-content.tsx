'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import socket from '@/lib/socket';
import { useSound } from '@/lib/useSound';
import { AVATARS, getRandomAvatar } from '@/lib/avatars';
import HowToPlayButton from '@/app/components/HowToPlayButton';
import InstallAppButton from '@/app/components/InstallAppButton';

export default function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [playerName, setPlayerName] = useState('');
  const [playerAvatar, setPlayerAvatar] = useState('');
  const [roomId, setRoomId] = useState('');
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  // Initialize from localStorage or generate random avatar on mount
  useEffect(() => {
    const savedName = localStorage.getItem('playerName');
    const savedAvatar = localStorage.getItem('playerAvatar');
    
    if (savedName) {
      setPlayerName(savedName);
    }
    
    if (savedAvatar) {
      setPlayerAvatar(savedAvatar);
    } else {
      setPlayerAvatar(getRandomAvatar());
    }
  }, []);

  const { play } = useSound();

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
      try { play('error'); } catch (e) {}
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

    // Save to localStorage
    localStorage.setItem('playerName', playerName.trim());
    localStorage.setItem('playerAvatar', playerAvatar);

    setIsLoading(true);
    setError('');
    socket.emit('create-room', { playerName: playerName.trim(), playerAvatar });
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

    // Save to localStorage
    localStorage.setItem('playerName', playerName.trim());
    localStorage.setItem('playerAvatar', playerAvatar);

    setIsLoading(true);
    setError('');
    socket.emit('join-room', { roomId: roomId.trim(), playerName: playerName.trim(), playerAvatar });
  };

  return (
    <div className="h-screen h-dvh max-h-screen max-h-dvh overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md lg:max-w-lg flex flex-col max-h-full">
        {/* Logo/Title */}
        <div className="text-center mb-3 sm:mb-4 lg:mb-4 flex-shrink-0">
          <h1 className="text-3xl sm:text-4xl lg:text-3xl font-bold text-white mb-1">🎮</h1>
          <h2 className="text-2xl sm:text-3xl lg:text-2xl font-bold text-white mb-1">Forbidden Word</h2>
          <p className="text-indigo-100 text-sm sm:text-base lg:text-sm mb-3 sm:mb-4">Game Lobby</p>
          <InstallAppButton />
        </div>

        {/* Connection Status */}
        <div className={`mb-3 sm:mb-4 lg:mb-3 p-2 rounded-lg text-center font-medium text-xs sm:text-sm lg:text-xs flex-shrink-0 ${isConnected ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
          }`}>
          {isConnected ? '✅ Connected to server' : '⏳ Connecting...'}
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-xl sm:rounded-2xl lg:rounded-xl shadow-2xl p-4 sm:p-6 lg:p-5 flex-1 overflow-y-auto mobile-scroll">
          {/* Menu Mode */}
          {mode === 'menu' && (
            <div className="flex flex-col justify-center h-full">
              <h3 className="text-xl sm:text-2xl lg:text-xl font-bold text-gray-800 mb-4 sm:mb-6 lg:mb-4 text-center">Welcome!</h3>
              <div className="space-y-3 sm:space-y-4 lg:space-y-3">
                <button
                  onClick={() => {
                    setMode('create');
                    setError('');
                    try { play('click'); } catch (e) {}
                  }}
                  className="w-full py-3 sm:py-4 lg:py-3 px-4 sm:px-6 lg:px-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-base sm:text-lg lg:text-base rounded-lg sm:rounded-xl lg:rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all transform hover:scale-105 shadow-lg"
                >
                  ➕ Create Room
                </button>
                <button
                  onClick={() => {
                    setMode('join');
                    setError('');
                    try { play('click'); } catch (e) {}
                  }}
                  className="w-full py-3 sm:py-4 lg:py-3 px-4 sm:px-6 lg:px-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold text-base sm:text-lg lg:text-base rounded-lg sm:rounded-xl lg:rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all transform hover:scale-105 shadow-lg"
                >
                  🚪 Join Room
                </button>
              </div>
            </div>
          )}

          {/* Create Room Mode */}
          {mode === 'create' && (
            <div className="flex flex-col h-full">
              <button
                onClick={() => {
                  setMode('menu');
                  setError('');
                }}
                className="text-indigo-600 hover:text-indigo-700 font-medium mb-2 text-xs sm:text-sm lg:text-xs flex-shrink-0"
              >
                ← Back
              </button>
              <h3 className="text-lg sm:text-xl lg:text-lg font-bold text-gray-800 mb-3 sm:mb-4 lg:mb-3 flex-shrink-0">Create Room</h3>
              <form onSubmit={handleCreateRoom} className="space-y-2 sm:space-y-3 lg:space-y-3 flex-1 flex flex-col">
                <div className="flex-shrink-0">
                  <label className="block text-xs sm:text-sm lg:text-xs font-medium text-gray-700 mb-1">
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-gray-900 placeholder-gray-500 text-sm sm:text-base lg:text-sm"
                    disabled={isLoading}
                  />
                </div>
                <div className="flex-shrink-0">
                  <label className="block text-xs sm:text-sm lg:text-xs font-medium text-gray-700 mb-1">
                    Choose Avatar
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="text-2xl sm:text-3xl lg:text-2xl">{playerAvatar}</div>
                    <button
                      type="button"
                      onClick={() => setPlayerAvatar(getRandomAvatar())}
                      className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors font-medium text-xs sm:text-sm lg:text-xs"
                    >
                      🔄 Random
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-7 gap-1">
                    {AVATARS.map((avatar, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => { setPlayerAvatar(avatar); try { play('click'); } catch (e) {} }}
                        className={`text-lg sm:text-xl lg:text-xl p-1 rounded-lg transition-all ${ playerAvatar === avatar ? 'bg-indigo-500 scale-110' : 'bg-gray-200 hover:bg-gray-300'}`}
                      >
                        {avatar}
                      </button>
                    ))}
                  </div>
                </div>
                {error && (
                  <div className="p-2 bg-red-100 text-red-700 rounded-lg text-xs sm:text-sm lg:text-xs font-medium flex-shrink-0">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={isLoading || !isConnected}
                  className="w-full py-2 sm:py-3 lg:py-2 px-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-sm sm:text-base lg:text-sm rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-auto flex-shrink-0"
                >
                  {isLoading ? 'Creating...' : 'Create Room'}
                </button>
              </form>
            </div>
          )}

          {/* Join Room Mode */}
          {mode === 'join' && (
            <div className="flex flex-col h-full">
              <button
                onClick={() => {
                  setMode('menu');
                  setError('');
                }}
                className="text-indigo-600 hover:text-indigo-700 font-medium mb-2 text-xs sm:text-sm lg:text-xs flex-shrink-0"
              >
                ← Back
              </button>
              <h3 className="text-lg sm:text-xl lg:text-lg font-bold text-gray-800 mb-3 sm:mb-4 lg:mb-3 flex-shrink-0">Join Room</h3>
              <form onSubmit={handleJoinRoom} className="space-y-2 sm:space-y-3 lg:space-y-3 flex-1 flex flex-col">
                <div className="flex-shrink-0">
                  <label className="block text-xs sm:text-sm lg:text-xs font-medium text-gray-700 mb-1">
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-gray-900 placeholder-gray-500 text-sm sm:text-base lg:text-sm"
                    disabled={isLoading}
                  />
                </div>
                <div className="flex-shrink-0">
                  <label className="block text-xs sm:text-sm lg:text-xs font-medium text-gray-700 mb-1">
                    Choose Avatar
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="text-2xl sm:text-3xl lg:text-2xl">{playerAvatar}</div>
                    <button
                      type="button"
                      onClick={() => setPlayerAvatar(getRandomAvatar())}
                      className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors font-medium text-xs sm:text-sm lg:text-xs"
                    >
                      🔄 Random
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-7 gap-1">
                    {AVATARS.map((avatar, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setPlayerAvatar(avatar)}
                        className={`text-lg sm:text-xl lg:text-xl p-1 rounded-lg transition-all ${playerAvatar === avatar ? 'bg-indigo-500 scale-110' : 'bg-gray-200 hover:bg-gray-300'}`}
                      >
                        {avatar}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <label className="block text-xs sm:text-sm lg:text-xs font-medium text-gray-700 mb-1">
                    Room ID
                  </label>
                  <input
                    type="text"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                    placeholder="Enter room ID"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none font-mono text-center text-gray-900 placeholder-gray-500 text-sm sm:text-base lg:text-sm"
                    disabled={isLoading}
                  />
                </div>
                {error && (
                  <div className="p-2 bg-red-100 text-red-700 rounded-lg text-xs sm:text-sm lg:text-xs font-medium flex-shrink-0">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={isLoading || !isConnected}
                  className="w-full py-2 sm:py-3 lg:py-2 px-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold text-sm sm:text-base lg:text-sm rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-auto flex-shrink-0"
                >
                  {isLoading ? 'Joining...' : 'Join Room'}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-2 sm:mt-3 lg:mt-4 text-indigo-100 flex-shrink-0">
          <p className="text-xs sm:text-sm lg:text-xs">
            Play, guess, and have fun with friends! 🎉
          </p>
        </div>

        {/* How to Play Button */}
        <HowToPlayButton />
      </div>
    </div>
  );
}
