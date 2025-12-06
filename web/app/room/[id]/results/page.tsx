'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import socket from '@/lib/socket';
import HowToPlayButton from '@/app/components/HowToPlayButton';
import type { Player, Room } from '@/types/game';

interface StoredResults {
  room: Room;
  leaderboard: Player[];
  totalRounds: number;
  reason: string;
  finishedRound: number;
  timestamp: number;
}

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;

  const [results, setResults] = useState<StoredResults | null>(null);
  const [playerMeta, setPlayerMeta] = useState<{ name: string; avatar: string } | null>(null);
  const [missingData, setMissingData] = useState(false);

  const storageKey = useMemo(() => `game_results_${roomId}`, [roomId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) {
        setMissingData(true);
        return;
      }

      const parsed: StoredResults = JSON.parse(stored);
      setResults(parsed);
      setMissingData(false);
    } catch (error) {
      console.error('Failed to read stored results:', error);
      setMissingData(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const name = localStorage.getItem('playerName') || '';
    const avatar = localStorage.getItem('playerAvatar') || '';
    if (name || avatar) {
      setPlayerMeta({ name, avatar });
    }
  }, []);

  const winner = results?.leaderboard?.[0];

  const handlePlayAgain = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      // ignore storage issues for navigation
    }
    // Emit event to server to notify all players and reset room state
    socket.emit('reset-for-next-game', { roomId });
    router.push(`/room/${roomId}`);
  };

  const handleNewRoom = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      // ignore storage issues for navigation
    }
    router.push('/join');
  };

  if (missingData && !results) {
    return (
      <div className="h-dvh overflow-hidden flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-indigo-900 p-4 sm:p-6">
        <div className="bg-white/90 backdrop-blur rounded-xl sm:rounded-2xl shadow-lg sm:shadow-2xl p-4 sm:p-8 max-w-lg w-full text-center space-y-3 sm:space-y-4">
          <h1 className="text-lg sm:text-2xl font-bold text-gray-900">No Results Found</h1>
          <p className="text-gray-600 text-sm sm:text-base">
            We couldn't find the latest game summary. Head back to the lobby to set up a new match.
          </p>
          <button
            onClick={handlePlayAgain}
            className="w-full py-2 sm:py-3 bg-indigo-600 text-white font-semibold text-sm sm:text-base rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Return to Lobby
          </button>
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="h-dvh overflow-hidden flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-indigo-900 p-4 sm:p-6">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 sm:h-16 sm:w-16 border-t-4 border-b-4 border-white mb-3 sm:mb-4"></div>
          <p className="text-white text-base sm:text-xl font-semibold">Loading results...</p>
        </div>
      </div>
    );
  }

  const participantCount = results.leaderboard.length;
  const isPlayerWinner = winner && playerMeta && winner.name === playerMeta.name && winner.avatar === playerMeta.avatar;

  return (
    <div className="h-dvh overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-indigo-900 p-2 sm:p-6 lg:p-4 pb-16 sm:pb-24 lg:pb-4 flex flex-col">
      <div className="max-w-5xl mx-auto space-y-2 sm:space-y-6 lg:space-y-3 flex flex-col flex-1 overflow-hidden w-full">
        <header className="bg-white/95 backdrop-blur rounded-lg sm:rounded-2xl lg:rounded-xl shadow-lg sm:shadow-2xl p-3 sm:p-8 lg:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 lg:gap-2 flex-shrink-0">
          <div>
            <p className="text-[10px] sm:text-sm lg:text-xs uppercase tracking-wide text-purple-500 font-semibold">Game Complete</p>
            <h1 className="text-xl sm:text-4xl lg:text-2xl font-black text-gray-900 mt-1 sm:mt-2 lg:mt-1">Final Standings</h1>
            <p className="text-gray-600 mt-1 sm:mt-3 lg:mt-1 text-[10px] sm:text-base lg:text-xs">
              Played {results.totalRounds} round{results.totalRounds === 1 ? '' : 's'} • {participantCount} participant{participantCount === 1 ? '' : 's'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] sm:text-sm lg:text-xs font-medium text-gray-500 mb-0.5 sm:mb-1">Room ID</p>
            <p className="font-mono text-sm sm:text-2xl lg:text-base font-bold text-purple-600 tracking-wider">{roomId}</p>
          </div>
        </header>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto pr-1 sm:pr-2 space-y-2 sm:space-y-6 lg:space-y-3">
          {winner && (
            <section className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-lg sm:rounded-2xl lg:rounded-xl shadow-lg sm:shadow-2xl p-3 sm:p-8 lg:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-6 lg:gap-3">
              <div>
                <p className="text-[10px] sm:text-sm lg:text-xs uppercase font-bold tracking-widest opacity-90">Winner</p>
                <h2 className="text-lg sm:text-4xl lg:text-xl font-black mt-1 sm:mt-2 lg:mt-1 flex items-center gap-2 sm:gap-3 lg:gap-2">
                  <span className="text-2xl sm:text-5xl lg:text-3xl">🏆</span>
                  <span>{winner.name}</span>
                </h2>
                <p className="text-sm sm:text-xl lg:text-sm mt-1 sm:mt-2 lg:mt-1 font-semibold">{Math.round(winner.score)} pts</p>
                {isPlayerWinner && (
                  <p className="mt-2 sm:mt-3 lg:mt-2 inline-flex items-center gap-1 bg-white/20 rounded-full px-2 sm:px-3 lg:px-2 py-0.5 sm:py-1 lg:py-0.5 text-[10px] sm:text-sm lg:text-xs font-bold">
                    <span>🎉</span> You won this match!
                  </p>
                )}
              </div>
              <div className="text-left sm:text-right">
                <p className="text-[10px] sm:text-sm lg:text-xs font-semibold uppercase opacity-90">Reason</p>
                <p className="text-sm sm:text-xl lg:text-sm font-bold">
                  {results.reason === 'max_rounds_reached' ? 'Rounds completed' : 'Game finished'}
                </p>
                <p className="text-[10px] sm:text-sm lg:text-xs opacity-80 mt-1 sm:mt-2 lg:mt-1">Finished on round {results.finishedRound}</p>
              </div>
            </section>
          )}

          <section className="bg-white/95 backdrop-blur rounded-lg sm:rounded-2xl lg:rounded-xl shadow-lg sm:shadow-2xl p-3 sm:p-8 lg:p-4">
            <h3 className="text-sm sm:text-2xl lg:text-base font-bold text-gray-900 mb-2 sm:mb-4 lg:mb-2">Leaderboard</h3>
            <div className="space-y-2 sm:space-y-3 lg:space-y-2">
              {results.leaderboard.map((player, index) => {
                const isCurrentUser = playerMeta && player.name === playerMeta.name && player.avatar === playerMeta.avatar;
                return (
                  <div
                    key={`${player.id}-${index}`}
                    className={`p-2 sm:p-5 lg:p-3 rounded-lg lg:rounded-lg border flex items-center justify-between gap-2 sm:gap-4 lg:gap-2 transition-all ${
                      index === 0
                        ? 'bg-yellow-50 border-yellow-300'
                        : isCurrentUser
                        ? 'bg-purple-50 border-purple-300'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 sm:gap-4 lg:gap-2">
                      <span className={`w-7 h-7 sm:w-12 sm:h-12 lg:w-8 lg:h-8 rounded-full flex items-center justify-center text-sm sm:text-xl lg:text-sm font-bold ${
                        index === 0 ? 'bg-yellow-500 text-white' : 'bg-purple-500/20 text-purple-600'
                      }`}>
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-xs sm:text-lg lg:text-sm font-semibold text-gray-900 flex items-center gap-1 sm:gap-2 lg:gap-1">
                          <span className="text-lg sm:text-2xl lg:text-xl">{player.avatar}</span>
                          <span className="truncate max-w-[80px] sm:max-w-none">{player.name}</span>
                          {isCurrentUser && <span className="text-[8px] sm:text-xs lg:text-[10px] bg-purple-600 text-white px-1 py-0.5 sm:px-2 sm:py-1 lg:px-1 lg:py-0.5 rounded-full">You</span>}
                        </p>
                        <p className="text-[10px] sm:text-sm lg:text-xs text-gray-500">{Math.round(player.score)} pts</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="bg-white/95 backdrop-blur rounded-lg sm:rounded-2xl lg:rounded-xl shadow-lg sm:shadow-2xl p-3 sm:p-8 lg:p-4">
            <h3 className="text-sm sm:text-xl lg:text-base font-bold text-gray-900 mb-2 sm:mb-4 lg:mb-2">What next?</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 lg:gap-2">
              <button
                onClick={handlePlayAgain}
                className="py-2 sm:py-4 lg:py-2 bg-indigo-600 text-white font-semibold text-xs sm:text-base lg:text-sm rounded-lg hover:bg-indigo-700 transition-colors shadow-md sm:shadow-lg"
              >
                🔁 Play Again
              </button>
              <button
                onClick={handleNewRoom}
                className="py-2 sm:py-4 lg:py-2 bg-gray-200 text-gray-800 font-semibold text-xs sm:text-base lg:text-sm rounded-lg hover:bg-gray-300 transition-colors"
              >
                ➕ New Room
              </button>
            </div>
            <p className="text-[10px] sm:text-sm lg:text-xs text-gray-500 mt-2 sm:mt-3 lg:mt-2 text-center sm:text-left">
              Hosts can tweak round settings in the lobby before the next match.
            </p>
          </section>
        </div>

        <HowToPlayButton />
      </div>
    </div>
  );
}
