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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-indigo-900 p-6">
        <div className="bg-white/90 backdrop-blur rounded-2xl shadow-2xl p-8 max-w-lg w-full text-center space-y-4">
          <h1 className="text-2xl font-bold text-gray-900">No Results Found</h1>
          <p className="text-gray-600">
            We couldn't find the latest game summary. Head back to the lobby to set up a new match.
          </p>
          <button
            onClick={handlePlayAgain}
            className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Return to Lobby
          </button>
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-indigo-900 p-6">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white mb-4"></div>
          <p className="text-white text-xl font-semibold">Loading results...</p>
        </div>
      </div>
    );
  }

  const participantCount = results.leaderboard.length;
  const isPlayerWinner = winner && playerMeta && winner.name === playerMeta.name && winner.avatar === playerMeta.avatar;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-indigo-900 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-purple-500 font-semibold">Game Complete</p>
            <h1 className="text-3xl sm:text-4xl font-black text-gray-900 mt-2">Final Standings</h1>
            <p className="text-gray-600 mt-3 text-sm sm:text-base">
              Played {results.totalRounds} round{results.totalRounds === 1 ? '' : 's'} • {participantCount} participant{participantCount === 1 ? '' : 's'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-gray-500 mb-1">Room ID</p>
            <p className="font-mono text-lg sm:text-2xl font-bold text-purple-600 tracking-wider">{roomId}</p>
          </div>
        </header>

        {winner && (
          <section className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-2xl shadow-2xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <p className="text-sm uppercase font-bold tracking-widest opacity-90">Winner</p>
              <h2 className="text-3xl sm:text-4xl font-black mt-2 flex items-center gap-3">
                <span className="text-5xl">🏆</span>
                <span>{winner.name}</span>
              </h2>
              <p className="text-lg sm:text-xl mt-2 font-semibold">{Math.round(winner.score)} pts</p>
              {isPlayerWinner && (
                <p className="mt-3 inline-flex items-center gap-1 bg-white/20 rounded-full px-3 py-1 text-sm font-bold">
                  <span>🎉</span> You won this match!
                </p>
              )}
            </div>
            <div className="text-center sm:text-right">
              <p className="text-sm font-semibold uppercase opacity-90">Reason</p>
              <p className="text-lg sm:text-xl font-bold">
                {results.reason === 'max_rounds_reached' ? 'Rounds completed' : 'Game finished'}
              </p>
              <p className="text-sm opacity-80 mt-2">Finished on round {results.finishedRound}</p>
            </div>
          </section>
        )}

        <section className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-6 sm:p-8">
          <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">Leaderboard</h3>
          <div className="space-y-3">
            {results.leaderboard.map((player, index) => {
              const isCurrentUser = playerMeta && player.name === playerMeta.name && player.avatar === playerMeta.avatar;
              return (
                <div
                  key={`${player.id}-${index}`}
                  className={`p-4 sm:p-5 rounded-xl border-2 flex items-center justify-between gap-4 transition-all ${
                    index === 0
                      ? 'bg-yellow-50 border-yellow-300'
                      : isCurrentUser
                      ? 'bg-purple-50 border-purple-300'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-lg sm:text-xl font-bold ${
                      index === 0 ? 'bg-yellow-500 text-white' : 'bg-purple-500/20 text-purple-600'
                    }`}>
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-base sm:text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <span className="text-2xl">{player.avatar}</span>
                        {player.name}
                        {isCurrentUser && <span className="text-xs bg-purple-600 text-white px-2 py-1 rounded-full">You</span>}
                      </p>
                      <p className="text-sm text-gray-500">{Math.round(player.score)} pts</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-6 sm:p-8">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">What next?</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={handlePlayAgain}
              className="py-4 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg"
            >
              🔁 Play Again in this Room
            </button>
            <button
              onClick={handleNewRoom}
              className="py-4 bg-gray-200 text-gray-800 font-semibold rounded-xl hover:bg-gray-300 transition-colors"
            >
              ➕ Create or Join Another Room
            </button>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-3 text-center sm:text-left">
            Hosts can tweak the round settings back in the lobby before starting the next match.
          </p>
        </section>

        <HowToPlayButton />
      </div>
    </div>
  );
}
