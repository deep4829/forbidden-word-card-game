'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import socket from '@/lib/socket';
import { useSound } from '@/lib/useSound';
import EditProfileModal from '@/components/EditProfileModal';
import HowToPlayButton from '@/app/components/HowToPlayButton';
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
  const [shareMethod, setShareMethod] = useState<'copy' | 'link' | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [selectedRounds, setSelectedRounds] = useState<number>(10);
  const ROUND_OPTIONS = [1, 2, 3, 5, 7, 10, 12, 15, 20];

  // Restore room data from localStorage on mount
  useEffect(() => {
    const savedRoomData = localStorage.getItem(`room_${roomId}`);
    if (savedRoomData) {
      try {
        const parsedRoom = JSON.parse(savedRoomData);
        setRoom(parsedRoom);
        if (parsedRoom?.maxRounds) {
          setSelectedRounds(parsedRoom.maxRounds);
        }
        setIsLoading(false);
      } catch (e) {
        console.error('Failed to parse saved room data:', e);
      }
    }
  }, [roomId]);

  // Get the invite URL based on deployment environment
  const getInviteUrl = () => {
    if (typeof window === 'undefined') return '';
    
    // Use current origin to support both local and deployed environments
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const port = window.location.port;
    const baseUrl = `${protocol}//${hostname}${port ? ':' + port : ''}`;
    
    return `${baseUrl}/join?roomId=${roomId}`;
  };

  const isShareAPIAvailable = typeof navigator !== 'undefined' && !!navigator.share;

  // Compute invite URL
  const inviteUrl = getInviteUrl();

  useEffect(() => {
    if (room?.maxRounds) {
      setSelectedRounds(room.maxRounds);
    }
  }, [room?.maxRounds]);

  const attemptRejoin = useCallback(() => {
    if (!roomId) {
      return;
    }

    const playerName = localStorage.getItem('playerName');
    const playerAvatar = localStorage.getItem('playerAvatar');

    if (playerName && playerAvatar) {
      console.log('[room] attemptRejoin sending join-room', { roomId, playerName });
      socket.emit('join-room', { roomId, playerName, playerAvatar });
    } else {
      console.log('[room] attemptRejoin fallback get-room', roomId);
      socket.emit('get-room', roomId);
    }
  }, [roomId]);

  // Set current player ID when socket connects and ensure we rejoin
  useEffect(() => {
    if (socket.connected) {
      setCurrentPlayerId(socket.id || '');
      attemptRejoin();
    }

    const onConnect = () => {
      setCurrentPlayerId(socket.id || '');
      attemptRejoin();
    };

    socket.on('connect', onConnect);
    return () => {
      socket.off('connect', onConnect);
    };
  }, [attemptRejoin]);

  const { play } = useSound();

  const handleRoundsChange = (value: number) => {
    const sanitized = Math.max(1, Math.min(20, Math.round(value)));
    setSelectedRounds(sanitized);

    if (!roomId || room?.maxRounds === sanitized) {
      return;
    }

    try { play('click'); } catch (e) {}
    socket.emit('update-round-settings', { roomId, maxRounds: sanitized });
  };

  // Persist room data to localStorage
  useEffect(() => {
    if (room && roomId) {
      localStorage.setItem(`room_${roomId}`, JSON.stringify(room));
    }
  }, [room, roomId]);

  // Clean up localStorage when game starts (successful transition to game page)
  useEffect(() => {
    const onGameStarted = (data: any) => {
      // Clear room data after successful game start
      setTimeout(() => {
        localStorage.removeItem(`room_${roomId}`);
      }, 500);
    };

    socket.on('game-started', onGameStarted);
    return () => {
      socket.off('game-started', onGameStarted);
    };
  }, [roomId]);

  // Socket event listeners
  useEffect(() => {
    // Listen for room updates
    const onRoomUpdated = (updatedRoom: Room) => {
      console.log('Room updated:', updatedRoom);
      setRoom(updatedRoom);
      setIsLoading(false);
      setError(''); // Clear any error when room loads successfully
    };

    // Listen for game started
    const onGameStarted = (data: { room: Room; roundNumber: number; currentClueGiver: string }) => {
      console.log('Game started:', data);
      router.push(`/room/${roomId}/game`);
    };

    // Listen for errors
    const onError = (data: { message: string }) => {
      setError(data.message);
      try { play('error'); } catch (e) {}
      setIsLoading(false);
    };

    const onRoundSettingsUpdated = (payload: { roomId: string; maxRounds: number }) => {
      setSelectedRounds(payload.maxRounds);
    };

    socket.on('room-updated', onRoomUpdated);
    socket.on('game-started', onGameStarted);
    socket.on('error', onError);
    socket.on('round-settings-updated', onRoundSettingsUpdated);

    return () => {
      socket.off('room-updated', onRoomUpdated);
      socket.off('game-started', onGameStarted);
      socket.off('error', onError);
       socket.off('round-settings-updated', onRoundSettingsUpdated);
    };
  }, [roomId, router]);

  // Request room data on mount
  useEffect(() => {
    if (roomId && socket.connected) {
      attemptRejoin();
    }

    // Set loading to false after a timeout if no response
    const timeout = setTimeout(() => {
      setIsLoading(false);
      if (!room) {
        setError('');
        try { play('error'); } catch (e) {}
      }
    }, 3000);

    return () => {
      clearTimeout(timeout);
    };
  }, [roomId, attemptRejoin]);

  // Keep room alive by sending periodic pings
  useEffect(() => {
    if (!roomId) return;

    // Send keep-alive ping every 5 minutes
    const keepAliveInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('get-room', roomId);
        console.log(`[keep-alive] Pinged room ${roomId}`);
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => {
      clearInterval(keepAliveInterval);
    };
  }, [roomId]);

  const handleStartGame = () => {
    if (!room || room.players.length < 2) {
      setError('Game requires at least 2 players to start');
      play('error');
      return;
    }

    play('start');
    socket.emit('start-game', roomId);
  };

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopySuccess(true);
      try { play('click'); } catch (e) {}
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy room ID:', err);
    }
  };

  const openEditModal = () => {
    const player = room?.players.find((p) => p.id === currentPlayerId);
    if (player) {
      setCurrentPlayer(player);
      setIsEditModalOpen(true);
      play('click');
    }
  };

  const handleProfileSave = (newName: string, newAvatar: string) => {
    socket.emit('update-player', {
      roomId,
      playerName: newName,
      playerAvatar: newAvatar,
    });
    setIsEditModalOpen(false);
  };

  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopySuccess(true);
      setShareMethod('link');
      try { play('click'); } catch (e) {}
      setTimeout(() => {
        setCopySuccess(false);
        setShareMethod(null);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy invite link:', err);
    }
  };

  const shareInviteLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join Forbidden Word Game',
          text: 'Come play the Forbidden Word Game with me!',
          url: inviteUrl,
        });
        try { play('click'); } catch (e) {}
      } catch (err) {
        console.error('Failed to share:', err);
      }
    }
  };

  const isRoomCreator = room && room.players.length > 0 && room.players[0].id === currentPlayerId;
  const canStartGame = room && room.players.length >= 2 && isRoomCreator && !room.gameStarted;

  if (isLoading) {
    return (
      <div className="min-h-screen min-h-dvh overflow-y-auto flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white mb-4"></div>
          <p className="text-white text-xl font-semibold">Loading room...</p>
        </div>
      </div>
    );
  }

  if (error && !room) {
    return (
      <div className="min-h-screen min-h-dvh overflow-y-auto flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 p-4">
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
    <div className="min-h-screen min-h-dvh overflow-y-auto lg:overflow-hidden lg:h-screen lg:max-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 p-3 sm:p-4 md:p-6 py-6 sm:py-8 pb-24 lg:pb-6 lg:flex lg:flex-col">
      <div className="max-w-4xl mx-auto lg:flex lg:flex-col lg:flex-1 lg:overflow-hidden lg:w-full">
        {/* Header Section */}
        <div className="bg-white rounded-lg sm:rounded-2xl shadow-2xl p-4 sm:p-6 md:p-8 lg:p-4 mb-4 sm:mb-6 lg:mb-3 lg:flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6 lg:gap-3 mb-4 sm:mb-6 lg:mb-3">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl lg:text-xl font-bold text-gray-800 mb-1 sm:mb-2 lg:mb-0">Game Lobby</h1>
              <p className="text-sm sm:text-base lg:text-xs text-gray-600">Waiting for players to join...</p>
            </div>
            <button
              onClick={() => { play('click'); router.push('/join'); }}
              className="px-3 sm:px-4 lg:px-3 py-2 lg:py-1 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium text-sm sm:text-base lg:text-xs whitespace-nowrap"
            >
              Leave Room
            </button>
          </div>

          {/* Room ID and Invite Link - Side by side on desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
            {/* Room ID Display */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg sm:rounded-xl p-4 sm:p-6 lg:p-3 border-2 border-indigo-200">
              <p className="text-xs sm:text-sm lg:text-xs font-medium text-gray-600 mb-2 lg:mb-1">Room ID</p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 lg:gap-2 mb-2 sm:mb-3 lg:mb-1">
                <code className="text-lg sm:text-2xl lg:text-base font-bold text-indigo-600 tracking-wider flex-1 break-all">
                  {roomId}
                </code>
                <button
                  onClick={copyRoomId}
                  className="px-3 sm:px-4 lg:px-2 py-2 lg:py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm lg:text-xs whitespace-nowrap w-full sm:w-auto"
                >
                  {copySuccess && shareMethod !== 'link' ? '✓ Copied!' : '📋 Copy ID'}
                </button>
              </div>
              <p className="text-xs sm:text-sm lg:text-xs text-gray-500 hidden lg:block">
                Share this ID with friends
              </p>
              <p className="text-xs sm:text-sm text-gray-500 lg:hidden">
                Share this ID with friends to invite them to the game
              </p>
            </div>

            {/* Invite Link Display */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg sm:rounded-xl p-4 sm:p-6 lg:p-3 border-2 border-green-200">
              <p className="text-xs sm:text-sm lg:text-xs font-medium text-gray-600 mb-2 sm:mb-3 lg:mb-1">📩 Shareable Invite Link</p>
              <div className="space-y-2 sm:space-y-3 lg:space-y-1">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 lg:gap-1">
                  <input
                    type="text"
                    value={inviteUrl}
                    readOnly
                    className="flex-1 px-3 lg:px-2 py-2 lg:py-1 bg-white border border-gray-300 rounded-lg text-xs sm:text-sm lg:text-xs text-gray-600 truncate min-w-0"
                  />
                  <button
                    onClick={copyInviteLink}
                    className="px-3 sm:px-4 lg:px-2 py-2 lg:py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm lg:text-xs whitespace-nowrap w-full sm:w-auto"
                  >
                    {copySuccess && shareMethod === 'link' ? '✓ Copied!' : 'Copy Link'}
                  </button>
                </div>
                {isShareAPIAvailable && (
                  <button
                    onClick={shareInviteLink}
                    className="w-full px-3 sm:px-4 lg:px-2 py-2 lg:py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium text-sm lg:text-xs"
                  >
                    🔗 Share Invite
                  </button>
                )}
              </div>
              <p className="text-xs sm:text-sm lg:text-xs text-gray-500 mt-2 sm:mt-3 lg:mt-1 hidden lg:block">
                Share link for instant join
              </p>
              <p className="text-xs sm:text-sm text-gray-500 mt-2 sm:mt-3 lg:hidden">
                Share this link directly with friends - they'll join the room automatically!
              </p>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border-2 border-red-200 rounded-lg sm:rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
            <p className="text-red-700 text-center font-medium text-sm sm:text-base lg:text-xs">{error}</p>
          </div>
        )}

        {/* Scrollable content area on desktop */}
        <div className="lg:flex-1 lg:overflow-y-auto lg:pr-2 desktop-scroll space-y-4 sm:space-y-6 lg:space-y-3">
          {room && isRoomCreator && !room.gameStarted && (
            <div className="bg-white rounded-lg sm:rounded-2xl shadow-2xl p-4 sm:p-6 md:p-8 lg:p-4">
              <h3 className="text-lg sm:text-xl lg:text-base font-bold text-gray-800 mb-4 lg:mb-2">Game Settings</h3>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 lg:gap-2">
                <div className="flex-1">
                  <p className="text-sm sm:text-base lg:text-xs text-gray-600 mb-2 lg:mb-1">Rounds to play</p>
                  <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-9 gap-2 lg:gap-1">
                    {ROUND_OPTIONS.map((value) => (
                      <button
                        key={value}
                        onClick={() => handleRoundsChange(value)}
                        disabled={room.maxRounds === value}
                        className={`py-2 lg:py-1 rounded-lg font-semibold text-sm lg:text-xs transition-colors border-2 lg:border ${
                          selectedRounds === value
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-400'
                        } ${room.maxRounds === value ? 'cursor-default opacity-80' : ''}`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="w-full sm:w-auto">
                  <label htmlFor="customRounds" className="block text-sm lg:text-xs font-medium text-gray-600 mb-2 lg:mb-1">
                    Custom
                  </label>
                  <input
                    id="customRounds"
                    type="number"
                    min={1}
                    max={20}
                    value={selectedRounds}
                    onChange={(e) => handleRoundsChange(Number(e.target.value))}
                    className="w-full sm:w-28 lg:w-20 px-3 lg:px-2 py-2 lg:py-1 border-2 lg:border border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-center text-sm lg:text-xs"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3 lg:mt-2">Max 20 rounds. Settings lock once the game starts.</p>
            </div>
          )}

          {/* Players Section */}
          <div className="bg-white rounded-lg sm:rounded-2xl shadow-2xl p-4 sm:p-6 md:p-8 lg:p-4">
            <div className="flex items-center justify-between mb-4 sm:mb-6 lg:mb-2">
              <h2 className="text-xl sm:text-2xl lg:text-base font-bold text-gray-800">Players</h2>
              <div className="flex items-center gap-2 lg:gap-1 px-3 sm:px-4 lg:px-2 py-2 lg:py-1 bg-indigo-100 rounded-full">
                <span className="text-xl sm:text-2xl lg:text-base font-bold text-indigo-600">
                  {room?.players.length || 0}
                </span>
                <span className="text-xs sm:text-sm lg:text-xs text-gray-600 font-medium">/ 2+</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-2">
              {room?.players.map((player, index) => (
                <div
                  key={player.id}
                  className={`p-3 sm:p-4 lg:p-2 rounded-lg sm:rounded-xl lg:rounded-lg border-2 lg:border transition-all ${
                    player.id === currentPlayerId
                      ? 'bg-indigo-50 border-indigo-300'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 lg:gap-2 lg:flex-row">
                    <div className="flex items-center gap-3 lg:gap-2 min-w-0 flex-1">
                      <div className={`w-10 h-10 sm:w-12 sm:h-12 lg:w-8 lg:h-8 rounded-full flex items-center justify-center text-xl sm:text-2xl lg:text-base font-bold flex-shrink-0 ${
                      index === 0 ? 'bg-yellow-500' : 'bg-indigo-500'
                    }`}>
                      {player.avatar || player.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-800 flex items-center gap-2 lg:gap-1 flex-wrap text-sm sm:text-base lg:text-xs">
                        <span className="truncate">{player.name}</span>
                        {player.id === currentPlayerId && (
                          <span className="text-xs lg:text-[10px] bg-indigo-600 text-white px-2 py-1 lg:px-1 lg:py-0.5 rounded-full whitespace-nowrap">
                            You
                          </span>
                        )}
                        {index === 0 && (
                          <span className="text-xs lg:text-[10px] bg-yellow-500 text-white px-2 py-1 lg:px-1 lg:py-0.5 rounded-full whitespace-nowrap">
                            Host
                          </span>
                        )}
                      </p>
                      <p className="text-xs sm:text-sm lg:text-xs text-gray-500">
                        {player.isReady ? '✓ Ready' : 'Waiting...'}
                      </p>
                    </div>
                  </div>
                  {player.id === currentPlayerId && (
                    <button
                      onClick={openEditModal}
                      className="px-3 lg:px-2 py-2 lg:py-1 bg-indigo-600 text-white text-sm lg:text-xs rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap font-medium w-full sm:w-auto lg:w-auto"
                    >
                      ✏️ Edit
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Empty Slots - Only show if less than 4 players, hidden on desktop */}
            {room && room.players.length < 4 && Array.from({ length: 4 - (room?.players.length || 0) }).map((_, index) => (
              <div
                key={`empty-${index}`}
                className="p-3 sm:p-4 lg:p-2 rounded-lg sm:rounded-xl lg:rounded-lg border-2 lg:border border-dashed border-gray-300 bg-gray-50 lg:hidden"
              >
                <div className="flex items-center gap-3 lg:gap-2">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-8 lg:h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-500 flex-shrink-0 text-lg sm:text-xl lg:text-base">
                    ?
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-400 text-sm sm:text-base lg:text-xs">Waiting for player...</p>
                    <p className="text-xs sm:text-sm lg:text-xs text-gray-400">Empty slot</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

          {/* Start Game Button */}
          {canStartGame && (
            <div className="bg-white rounded-lg sm:rounded-2xl shadow-2xl p-4 sm:p-8 lg:p-4">
              <button
                onClick={handleStartGame}
                className="w-full py-4 sm:py-6 lg:py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-lg sm:text-2xl lg:text-base font-bold rounded-lg sm:rounded-xl lg:rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all transform hover:scale-105 shadow-lg"
              >
                🎮 Start Game
              </button>
              <p className="text-center text-gray-600 mt-2 sm:mt-4 lg:mt-2 text-xs sm:text-sm lg:text-xs">
                All players are ready! Click to begin the game.
              </p>
            </div>
          )}

          {/* Waiting Message */}
          {room && room.players.length < 2 && (
            <div className="bg-white rounded-lg sm:rounded-2xl shadow-2xl p-6 sm:p-8 lg:p-4 text-center">
              <div className="text-5xl sm:text-6xl md:text-7xl lg:text-4xl mb-3 sm:mb-4 lg:mb-2">⏳</div>
              <h3 className="text-lg sm:text-xl lg:text-sm font-bold text-gray-800 mb-1 sm:mb-2 lg:mb-1">
                Waiting for {2 - room.players.length} more player{2 - room.players.length !== 1 ? 's' : ''}
              </h3>
              <p className="text-sm sm:text-base lg:text-xs text-gray-600">
                Share the room ID with your friend to get started! (Minimum 2 players)
              </p>
            </div>
          )}

          {/* Ready to Start Message */}
          {room && room.players.length >= 2 && room.players.length < 4 && !canStartGame && (
            <div className="bg-white rounded-lg sm:rounded-2xl shadow-2xl p-6 sm:p-8 lg:p-4 text-center">
              <div className="text-5xl sm:text-6xl md:text-7xl lg:text-4xl mb-3 sm:mb-4 lg:mb-2">✅</div>
              <h3 className="text-lg sm:text-xl lg:text-sm font-bold text-gray-800 mb-1 sm:mb-2 lg:mb-1">
                Ready to Play!
              </h3>
              <p className="text-sm sm:text-base lg:text-xs text-gray-600">
                You have {room.players.length} player{room.players.length !== 1 ? 's' : ''}. The host can start the game anytime.
              </p>
            </div>
          )}

          {/* Info Message for Non-Host with Enough Players */}
          {room && room.players.length >= 2 && !isRoomCreator && !canStartGame && (
            <div className="bg-white rounded-lg sm:rounded-2xl shadow-2xl p-6 sm:p-8 lg:p-4 text-center">
              <div className="text-5xl sm:text-6xl md:text-7xl lg:text-4xl mb-3 sm:mb-4 lg:mb-2">🎯</div>
              <h3 className="text-lg sm:text-xl lg:text-sm font-bold text-gray-800 mb-1 sm:mb-2 lg:mb-1">
                Ready to Play!
              </h3>
              <p className="text-sm sm:text-base lg:text-xs text-gray-600">
                Waiting for the host to start the game...
              </p>
            </div>
          )}
        </div>

        {/* Edit Profile Modal */}
        {currentPlayer && (
          <EditProfileModal
            player={currentPlayer}
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            onSave={handleProfileSave}
          />
        )}

        {/* How to Play Button */}
        <HowToPlayButton />
      </div>
    </div>
  );
}
