'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import socket from '@/lib/socket';
import { useSpeechRecognition } from '@/lib/speech';
import playSound from '@/lib/sounds';
import HowToPlayButton from '@/app/components/HowToPlayButton';
import type { Room, Player, Card } from '@/types/game';

interface ClueHistory {
  transcript: string;
  clueCount: number;
  speakerId: string;
}

interface GuessResult {
  correct: boolean;
  guesserId: string;
  guesserName: string;
  guess: string;
  targetWord?: string;
  clueCount?: number;
  points?: { speaker: number; guesser: number };
  guessesUsed?: number;
  isExhausted?: boolean;
  room?: Room;
}

interface ForbiddenDetected {
  playerId: string;
  playerName: string;
  violations: string[];
  penalty: number;
}

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;
  const resultsStorageKey = `game_results_${roomId}`;

  const [room, setRoom] = useState<Room | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState<string>('');
  const [currentCard, setCurrentCard] = useState<Card | null>(null);
  const [clueHistory, setClueHistory] = useState<ClueHistory[]>([]);
  const [guessInput, setGuessInput] = useState('');
  const [manualClueInput, setManualClueInput] = useState('');
  const [roundNumber, setRoundNumber] = useState(1);
  const [feedback, setFeedback] = useState<string>('');
  const [feedbackType, setFeedbackType] = useState<'success' | 'error' | 'info'>('info');
  const [roundActive, setRoundActive] = useState(false);
  const [useManualInput, setUseManualInput] = useState(false);
  const [role, setRole] = useState<'speaker' | 'guesser' | null>(null);
  // NEW: Track game phase (speaker giving clue or guessers guessing)
  // Default to 'speaker' to avoid premature "waiting" state before server event arrives
  const [gamePhase, setGamePhase] = useState<'speaker' | 'guessing' | null>('speaker');
  // NEW: Track if current player has already guessed this clue
  const [playerHasGuessed, setPlayerHasGuessed] = useState(false);

  const actualSpeaker = room?.currentClueGiver === currentPlayerId;
  const isSpeaker = role ? role === 'speaker' : !!actualSpeaker;

  const attemptRejoin = useCallback((): boolean => {
    if (!roomId) return false;
    if (typeof window === 'undefined') return false;

    const playerName = localStorage.getItem('playerName');
    const playerAvatar = localStorage.getItem('playerAvatar');

    if (playerName && playerAvatar) {
      console.log('Attempting auto-rejoin on game page:', { roomId, playerName });
      socket.emit('join-room', { roomId, playerName, playerAvatar });
      return true;
    }

    console.log('No stored player info found, requesting room data:', roomId);
    socket.emit('get-room', roomId);
    return false;
  }, [roomId]);

  // Persist game state to localStorage
  useEffect(() => {
    if (room && roomId) {
      const gameState = {
        room,
        currentCard,
        clueHistory,
        roundNumber,
        playerHasGuessed,
        gamePhase,
        role: role || (currentCard ? 'speaker' : 'guesser'),
        playerId: currentPlayerId,
        timestamp: new Date().getTime(),
      };
      localStorage.setItem(`game_${roomId}`, JSON.stringify(gameState));
    }
  }, [room, roomId, currentCard, clueHistory, roundNumber, playerHasGuessed, gamePhase, role, currentPlayerId]);

  // Restore game state from localStorage on mount
  useEffect(() => {
    const savedGameState = localStorage.getItem(`game_${roomId}`);
    if (savedGameState) {
      try {
        const parsed = JSON.parse(savedGameState);
        setRoom(parsed.room);
        setCurrentCard(parsed.currentCard);
        setClueHistory(parsed.clueHistory);
        setRoundNumber(parsed.roundNumber);
        setPlayerHasGuessed(parsed.playerHasGuessed);
        setGamePhase(parsed.gamePhase || 'speaker');
        if (parsed.role === 'speaker' || parsed.role === 'guesser') {
          setRole(parsed.role);
        } else if (parsed.currentCard) {
          setRole('speaker');
        } else {
          setRole('guesser');
        }
        console.log('✅ Game state restored from localStorage:', {
          room: parsed.room,
          roundNumber: parsed.roundNumber,
          gamePhase: parsed.gamePhase,
          currentClueGiver: parsed.room?.currentClueGiver,
        });
      } catch (e) {
        console.error('Failed to restore game state:', e);
      }
    }
  }, [roomId]);

  // Refs to store latest state for speech recognition callback
  const isSpeakerRef = useRef(isSpeaker);
  const roundActiveRef = useRef(roundActive);
  const guessesUsedRef = useRef(0);
  const roomIdRef = useRef(roomId);

  // Update refs when state changes
  useEffect(() => {
    isSpeakerRef.current = isSpeaker;
  }, [isSpeaker]);

  useEffect(() => {
    roundActiveRef.current = roundActive;
  }, [roundActive]);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    if (!room || !currentPlayerId) {
      return;
    }

    const playerInRoom = room.players.some((p) => p.id === currentPlayerId);
    if (!playerInRoom) {
      return;
    }

    const newRole: 'speaker' | 'guesser' = room.currentClueGiver === currentPlayerId ? 'speaker' : 'guesser';
    setRole((prev) => (prev !== newRole ? newRole : prev));
  }, [room, currentPlayerId]);

  // Refs for game phase and player guess state
  const gamePhaseRef = useRef<'speaker' | 'guessing' | null>('speaker');
  const playerHasGuessedRef = useRef(false);

  useEffect(() => {
    gamePhaseRef.current = gamePhase;
  }, [gamePhase]);

  useEffect(() => {
    playerHasGuessedRef.current = playerHasGuessed;
  }, [playerHasGuessed]);

  // Create stable callbacks for speech recognition
  const handleSpeechResult = useCallback((text: string) => {
    console.log('handleSpeechResult called with text:', text, 'isSpeaker:', isSpeakerRef.current, 'roundActive:', roundActiveRef.current);
    const trimmedText = text.trim();
    if (!trimmedText) return;
    
    if (isSpeakerRef.current && roundActiveRef.current) {
      console.log('📤 Speaker sending clue:', trimmedText);
      socket.emit('speaker-transcript', { roomId: roomIdRef.current, transcript: trimmedText });
      showFeedback('Clue sent!', 'success');
    } else if (!isSpeakerRef.current) {
      // NEW: Check if it's the guessing phase
      if (gamePhaseRef.current !== 'guessing') {
        showFeedback('Waiting for the speaker to give a clue...', 'info');
        return;
      }
      // NEW: Check if player has already guessed this clue
      if (playerHasGuessedRef.current) {
        showFeedback('You have already guessed this clue. Waiting for other players...', 'info');
        return;
      }
      // Guesser voice guess
      console.log('🎯 Guesser sending guess:', trimmedText);
      if (guessesUsedRef.current >= 10) {
        showFeedback('No guesses left!', 'error');
        return;
      }
      socket.emit('guesser-guess', { roomId: roomIdRef.current, guess: trimmedText });
      // NEW: Mark that player has guessed
      setPlayerHasGuessed(true);
      if (guessesUsedRef.current + 1 >= 10) {
        showFeedback('You used all 10 voice guesses.', 'info');
      }
    } else {
      console.log('⚠️ handleSpeechResult: not in active state');
    }
  }, []);

  const handleSpeechError = useCallback((error: string) => {
    console.error('🎤 Speech error:', error);
    if (error === 'not-allowed' || error === 'permission-denied') {
      showFeedback('Microphone permission denied. Please allow microphone access.', 'error');
    } else if (error === 'no-speech') {
      showFeedback('No speech detected. Try speaking again.', 'info');
    } else {
      showFeedback(`Speech recognition error: ${error}`, 'error');
    }
  }, []);

  // Speech Recognition Hook with stable callbacks
  const { isListening, isSupported, transcript, start, stop } = useSpeechRecognition({
    onResult: handleSpeechResult,
    onError: handleSpeechError,
  });

  // Set current player ID when socket connects and attempt auto-rejoin
  useEffect(() => {
    if (!roomId) return;

    const handleConnect = () => {
      setCurrentPlayerId(socket.id || '');
      const rejoined = attemptRejoin();
      if (!rejoined) {
        socket.emit('get-game-state', roomId);
      }
    };

    if (socket.connected) {
      handleConnect();
    }

    socket.on('connect', handleConnect);
    return () => {
      socket.off('connect', handleConnect);
    };
  }, [roomId, attemptRejoin]);

  // Create refs for latest state values
  const isListeningRef = useRef(isListening);
  const stopRef = useRef(stop);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  // Socket event listeners
  useEffect(() => {
    // NEW: Handle game-state-synced event (full sync on reconnect)
    const onGameStateSynced = (data: {
      room: Room;
      roundNumber: number;
      currentClueGiver: string;
      phase: 'speaker' | 'guessing';
      clueCount: number;
      playersWhoGuessed?: string[];
      timestamp: number;
    }) => {
      console.log('✅ Game state synced from server:', {
        roundNumber: data.roundNumber,
        currentClueGiver: data.currentClueGiver,
        phase: data.phase,
        isSpeaker: data.currentClueGiver === currentPlayerId,
        playerHasGuessed: data.playersWhoGuessed?.includes(currentPlayerId) || false,
      });
      
      setRoom(data.room);
      setRoundNumber(data.roundNumber);
      setGamePhase(data.phase);
      
      // Sync whether current player has guessed
      const playerHasGuessedSync = data.playersWhoGuessed?.includes(currentPlayerId) || false;
      setPlayerHasGuessed(playerHasGuessedSync);
      if (currentPlayerId) {
        const resolvedRole: 'speaker' | 'guesser' = data.currentClueGiver === currentPlayerId ? 'speaker' : 'guesser';
        setRole(resolvedRole);
      }
      
      // Reset clue history based on server state
      // The clue history should be rebuilt from room data or cleared to sync with server
      if (data.phase === 'guessing') {
        setClueHistory((prev) => {
          // Keep local clue history if phase matches, but sync with what server knows
          return prev.length > 0 ? prev : [];
        });
      } else {
        setClueHistory([]);
      }
      
      // If this player is the new speaker, request the card
      if (data.currentClueGiver === currentPlayerId && data.room.currentCard) {
        console.log('Player is speaker, current card available');
        setCurrentCard(data.room.currentCard);
      } else if (data.currentClueGiver === currentPlayerId && !data.room.currentCard) {
        console.log('Player is speaker but no card yet, requesting card...');
        socket.emit('get-game-state', roomId);
      }
    };

    // Room updated event
    const onRoomUpdated = (updatedRoom: Room) => {
      console.log('✅ onRoomUpdated received:', updatedRoom);
      setRoom(updatedRoom);
      // Also set the current card if it exists
      if (updatedRoom.currentCard) {
        console.log('Card from room update:', updatedRoom.currentCard);
        setCurrentCard(updatedRoom.currentCard);
      }
    };

    // Card assigned event (for speaker only)
    const onCardAssigned = (data: { card: Card }) => {
      console.log('Card assigned:', data.card);
      setCurrentCard(data.card);
      setRole('speaker');
    };

    // Clue broadcast event
    const onClueBroadcast = (data: ClueHistory & { phase?: string }) => {
      console.log('✅ onClueBroadcast received:', data);
      // NEW: Update game phase if included in the event
      if (data.phase && (data.phase === 'speaker' || data.phase === 'guessing')) {
        setGamePhase(data.phase);
      }
      // NEW: Reset playerHasGuessed when a new clue comes
      setPlayerHasGuessed(false);
      setClueHistory((prev) => {
        const updated = [...prev, data];
        console.log('Updated clueHistory:', updated);
        // Stop microphone if 10 clues have been given
        if (updated.length >= 10 && isListeningRef.current) {
          stopRef.current();
          showFeedback('Maximum clues reached! Waiting for guesses...', 'info');
        }
        return updated;
      });
    };

    // Forbidden detected event
    const onForbiddenDetected = (data: ForbiddenDetected) => {
      showFeedback(
        `Forbidden word detected! ${data.playerName} said: ${data.violations.join(', ')} (${data.penalty} points)`,
        'error'
      );
      // Stop microphone if the current player said the forbidden word
      if (data.playerId === currentPlayerId && isListeningRef.current) {
        stopRef.current();
      }
    };

    // Guess result event
    const onGuessResult = (data: GuessResult) => {
      console.log('✅ onGuessResult received:', data);
      // Update room state with latest player data (includes guessesUsed)
      if (data.room) {
        console.log('Updating room from guess result:', data.room);
        setRoom(data.room);
      }
      
      if (data.correct) {
        showFeedback(
          `Correct! ${data.guesserName} guessed "${data.targetWord}" in ${data.clueCount} clues!`,
          'success'
        );
      } else {
        showFeedback(
          `Incorrect guess: "${data.guess}" by ${data.guesserName}`,
          'error'
        );
      }
    };

    // Round ended event
    const onRoundEnded = (data: any) => {
      if (data.reason === 'All guesses exhausted') {
        showFeedback('All guesses used! Moving to next round...', 'info');
      } else if (data.success) {
        showFeedback('Correct guess! Round ended!', 'success');
      } else {
        showFeedback('Round ended! Preparing next round...', 'success');
      }
      
      // Hard reset local per-round state to avoid stale locks
      setGamePhase('speaker');
      setPlayerHasGuessed(false);
      setClueHistory([]);
      setCurrentCard(null);
      setGuessInput('');
      setRoundActive(false);
      stopRef.current(); // Stop microphone if it's active
      
      // Request fresh room state to get the new speaker
      socket.emit('get-room', roomId);
      
      // Update round number
      setTimeout(() => {
        setRoundNumber((prev) => prev + 1);
      }, 2000);
    };

    // Score updated event
    const onScoreUpdated = (data: { room: Room }) => {
      setRoom(data.room);
    };

    // Game started event
    const onGameStarted = (data: { room: Room; roundNumber: number; currentClueGiver: string; phase?: 'speaker' | 'guessing' }) => {
      console.log('Game started:', data);
      setRoom(data.room);
      setRoundNumber(data.roundNumber);
      // NEW: Use phase from server if provided, otherwise default to speaker
      setGamePhase(data.phase || 'speaker');
      try {
        localStorage.removeItem(resultsStorageKey);
      } catch (e) {
        // ignore storage errors
      }
      if (currentPlayerId) {
        const resolvedRole: 'speaker' | 'guesser' = data.currentClueGiver === currentPlayerId ? 'speaker' : 'guesser';
        setRole(resolvedRole);
      }
      // Ensure local state resets at round start
      setPlayerHasGuessed(false);
      setRoundActive(false);
      setClueHistory([]);
      stopRef.current();
      
      // If the current player is the speaker, request the card
      // This handles the race condition where card-assigned was emitted before listener was ready
      if (data.currentClueGiver === currentPlayerId && roomId) {
        console.log('Player is speaker, requesting card assignment...');
        socket.emit('get-room', roomId);
      }
    };

    // NEW: Phase changed event (speaker phase or guessing phase)
    const onPhaseChanged = (data: { phase: 'speaker' | 'guessing'; message: string }) => {
      console.log('🎮 Phase changed:', data.phase);
      setGamePhase(data.phase);
      // Reset playerHasGuessed when switching back to speaker phase
      if (data.phase === 'speaker') {
        setPlayerHasGuessed(false);
      }
      showFeedback(data.message, 'info');
    };

    // Error event
    const onError = (data: { message: string }) => {
      showFeedback(data.message, 'error');
    };

    const onGameEnded = (data: {
      roomId: string;
      room: Room;
      leaderboard: Player[];
      totalRounds: number;
      reason: string;
      finishedRound: number;
    }) => {
      console.log('🏁 Game ended payload:', data);

      setRoom(data.room);
      setGamePhase(null);
      setPlayerHasGuessed(false);
      setRoundActive(false);
      setRole(null);
      setClueHistory([]);
      setCurrentCard(null);
      stopRef.current();

      try {
        const payload = {
          room: data.room,
          leaderboard: data.leaderboard,
          totalRounds: data.totalRounds,
          reason: data.reason,
          finishedRound: data.finishedRound,
          timestamp: Date.now(),
        };
        localStorage.setItem(resultsStorageKey, JSON.stringify(payload));
        localStorage.removeItem(`game_${roomId}`);
      } catch (e) {
        console.warn('Failed to persist game results:', e);
      }

      if (data.roomId === roomId) {
        router.push(`/room/${roomId}/results`);
      }
    };

    socket.on('room-updated', onRoomUpdated);
    socket.on('game-state-synced', onGameStateSynced);
    socket.on('card-assigned', onCardAssigned);
    socket.on('clue-broadcast', onClueBroadcast);
    socket.on('forbidden-detected', onForbiddenDetected);
    socket.on('guess-result', onGuessResult);
    socket.on('round-ended', onRoundEnded);
    socket.on('score-updated', onScoreUpdated);
    socket.on('game-started', onGameStarted);
    socket.on('phase-changed', onPhaseChanged);
    socket.on('error', onError);
    socket.on('game-ended', onGameEnded);
    
    console.log('🔗 Socket listeners registered for room:', roomId, 'player:', currentPlayerId);

    return () => {
      socket.off('room-updated', onRoomUpdated);
      socket.off('game-state-synced', onGameStateSynced);
      socket.off('card-assigned', onCardAssigned);
      socket.off('clue-broadcast', onClueBroadcast);
      socket.off('forbidden-detected', onForbiddenDetected);
      socket.off('guess-result', onGuessResult);
      socket.off('round-ended', onRoundEnded);
      socket.off('score-updated', onScoreUpdated);
      socket.off('game-started', onGameStarted);
      socket.off('phase-changed', onPhaseChanged);
      socket.off('error', onError);
      socket.off('game-ended', onGameEnded);
    };
  }, [roomId, currentPlayerId, clueHistory.length, router, resultsStorageKey]);

  // Request initial room data when page loads (or when dependencies change)
  useEffect(() => {
    if (!roomId) return;

    if (!socket.connected) {
      console.warn('Socket not ready - connected:', socket.connected, 'roomId:', roomId);
      return;
    }

    const rejoined = attemptRejoin();
    if (!rejoined) {
      console.log('🔗 Fetching game state for game page:', roomId);
      socket.emit('get-game-state', roomId);
    }
  }, [roomId, attemptRejoin]);

  const showFeedback = (message: string, type: 'success' | 'error' | 'info') => {
    setFeedback(message);
    setFeedbackType(type);
    // Play a short sound for feedback (non-blocking)
    try {
      if (type === 'success') playSound('success');
      else if (type === 'error') playSound('error');
      else playSound('info');
    } catch (e) {
      // ignore sound errors
    }
    setTimeout(() => setFeedback(''), 5000);
  };

  const handleGuessSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guessInput.trim()) return;

    // NEW: Check if it's the guessing phase
    if (gamePhase !== 'guessing') {
      showFeedback('Waiting for the speaker to give a clue...', 'info');
      return;
    }

    // NEW: Check if player has already guessed this clue
    if (playerHasGuessed) {
      showFeedback('You have already guessed this clue. Waiting for other players...', 'info');
      return;
    }

    socket.emit('guesser-guess', { roomId, guess: guessInput.trim() });
    // NEW: Mark that player has guessed
    setPlayerHasGuessed(true);
    setGuessInput('');
  };

  const handleManualClueSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualClueInput.trim()) return;

    const clue = manualClueInput.trim();
    console.log('Sending manual clue:', clue);
    socket.emit('speaker-transcript', { roomId, transcript: clue });
    setManualClueInput('');
    showFeedback('Clue sent!', 'success');
  };

  const handleStartRound = () => {
    if (!currentCard) {
      showFeedback('Waiting for card...', 'error');
      return;
    }
    setRoundActive(true);
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
    const isMobile = /iphone|ipad|ipod|android/.test(ua);
    if (isMobile) {
      // On mobile, do not auto-start to ensure manual stop semantics
      showFeedback('Round started! Tap mic to speak, tap again to send.', 'success');
    } else {
      showFeedback('Round started! Microphone activated. Start speaking!', 'success');
      // Auto-start microphone on desktop
      setTimeout(() => {
        if (isSupported) {
          console.log('🎤 Auto-starting microphone for speaker');
          start();
        }
      }, 500);
    }
  };

  const toggleMic = () => {
    console.log('toggleMic called - isListening:', isListening, 'isSupported:', isSupported, 'roundActive:', roundActive, 'clueCount:', clueHistory.length);
    
    if (!roundActive) {
      showFeedback('Please start the round first!', 'error');
      return;
    }
    
    // NEW: Check if speaker can give clues (only in speaker phase)
    if (isSpeaker && gamePhase === 'guessing') {
      showFeedback('Waiting for all players to guess before next clue...', 'info');
      return;
    }
    
    if (clueHistory.length >= 10) {
      showFeedback('Maximum 10 clues already given!', 'error');
      return;
    }
    
    console.log('About to toggle mic - isListening:', isListening);
    if (isListening) {
      console.log('Stopping microphone...');
      stop();
    } else {
      console.log('Starting microphone...');
      start();
    }
  };

  const currentPlayer = room?.players.find((p) => p.id === currentPlayerId);
  const speaker = room?.players.find((p) => p.id === room.currentClueGiver);
  const guessesUsed = (currentPlayer as Player & { guessesUsed?: number })?.guessesUsed || 0;
  const maxGuesses = 10;

  // Update guesses ref
  useEffect(() => {
    guessesUsedRef.current = guessesUsed;
  }, [guessesUsed]);

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-purple-900">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white mb-4"></div>
          <p className="text-white text-xl font-semibold">Loading game...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-indigo-900 p-3 sm:p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* ScoreBoard Component */}
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-center justify-between gap-3 sm:gap-4">
            {/* Round Info */}
            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 w-full sm:w-auto">
              <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-3 sm:px-8 sm:py-4 rounded-xl font-bold text-lg sm:text-xl shadow-lg min-h-[48px] flex items-center justify-center">
                Round {roundNumber}
              </div>
              <div className="text-gray-800 text-center sm:text-left flex items-center gap-3">
                <span className="font-semibold text-base sm:text-lg">Speaker:</span>
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-yellow-500 flex items-center justify-center text-xl sm:text-2xl font-bold shadow-md">
                    {speaker?.avatar || speaker?.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-purple-700 font-bold text-base sm:text-lg">{speaker?.name || 'Unknown'}</span>
                </div>
              </div>
            </div>

            {/* Player Rankings */}
            <div className="w-full sm:w-auto">
              <div className="flex flex-col gap-2">
                {room.players
                  .sort((a, b) => b.score - a.score)
                  .map((player, index) => (
                    <div
                      key={player.id}
                      className={`px-4 py-3 rounded-lg flex items-center justify-between gap-3 shadow-md transition-all ${
                        player.id === currentPlayerId
                          ? 'bg-purple-600 text-white ring-2 ring-purple-300'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg">{index + 1}.</span>
                        <span className="text-2xl">{player.avatar}</span>
                        <div>
                          <p className="font-bold text-sm">{player.name}</p>
                        </div>
                      </div>
                      <p className="text-xl font-black min-w-[50px] text-right">{Math.round(player.score)}</p>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div
            className={`rounded-xl p-4 sm:p-5 mb-4 sm:mb-6 font-bold text-center text-base sm:text-lg shadow-2xl min-h-[60px] flex items-center justify-center ${
              feedbackType === 'success'
                ? 'bg-green-600 text-white border-2 border-green-400'
                : feedbackType === 'error'
                ? 'bg-red-600 text-white border-2 border-red-400'
                : 'bg-blue-600 text-white border-2 border-blue-400'
            }`}
          >
            {feedback}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            {isSpeaker ? (
              /* Speaker View */
              <>
                {/* Card View Component */}
                <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl p-5 sm:p-8">
                  <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-4 sm:mb-6 text-center">
                    Your Card 🎴
                  </h2>
                  
                  {currentCard ? (
                    <div className="space-y-4 sm:space-y-6">
                      {/* Target Word */}
                      <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl sm:rounded-2xl p-6 sm:p-10 text-center shadow-lg border-4 border-green-400">
                        <p className="text-white text-xs sm:text-sm font-bold mb-2 uppercase tracking-widest">
                          Target Word
                        </p>
                        <p className="text-white text-3xl sm:text-5xl md:text-6xl font-black break-words">
                          {currentCard.mainWord}
                        </p>
                      </div>

                      {/* Forbidden Words */}
                      <div className="bg-red-50 rounded-xl sm:rounded-2xl p-5 sm:p-6 border-4 border-red-400 shadow-lg">
                        <p className="text-red-800 text-sm sm:text-base font-bold mb-4 uppercase tracking-wider text-center">
                          🚫 Forbidden Words
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {currentCard.forbiddenWords.map((word, index) => (
                            <div
                              key={index}
                              className="bg-red-200 text-red-900 font-bold text-center py-4 px-4 rounded-lg border-2 border-red-400 text-base sm:text-lg min-h-[56px] flex items-center justify-center shadow-md"
                            >
                              {word}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="text-6xl sm:text-7xl mb-4">🎴</div>
                      <p className="text-gray-600 text-lg font-medium">Waiting for card...</p>
                    </div>
                  )}
                </div>

                {/* Mic Control Component */}
                <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl p-5 sm:p-8">
                  <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">
                      Voice Control 🎤
                    </h3>
                    {isSupported && roundActive && (
                      <button
                        onClick={() => setUseManualInput(!useManualInput)}
                        className={`text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-lg font-bold transition-all ${
                          useManualInput
                            ? 'bg-orange-600 text-white ring-2 ring-orange-300'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {useManualInput ? '📝 Text Mode' : '🎤 Mic Mode'}
                      </button>
                    )}
                  </div>
                  
                  {!isSupported ? (
                    <div className="text-center py-8 space-y-4">
                      <p className="text-red-700 font-bold text-base sm:text-lg">
                        ⚠️ Speech recognition is not supported in your browser
                      </p>
                      <p className="text-gray-700 text-sm sm:text-base mb-4">
                        Recommended: Chrome, Edge, or Safari
                      </p>
                      <p className="text-gray-600 text-sm">
                        You can still play using manual text input below!
                      </p>
                      <button
                        onClick={() => setUseManualInput(true)}
                        className="px-6 py-3 bg-orange-600 text-white font-bold rounded-lg hover:bg-orange-700 transition-colors"
                      >
                        Switch to Manual Input
                      </button>
                    </div>
                  ) : !roundActive ? (
                    /* Start Round Button - Shown before round starts */
                    <div className="text-center py-8 space-y-6">
                      <div className="text-6xl sm:text-7xl mb-4">🎯</div>
                      <p className="text-gray-700 text-base sm:text-lg font-medium mb-6">
                        Ready to give clues? Start the round when you&apos;re prepared!
                      </p>
                      <button
                        onClick={handleStartRound}
                        disabled={!currentCard}
                        className="px-8 py-5 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-xl sm:text-2xl font-bold rounded-xl hover:from-green-600 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all transform hover:scale-105 active:scale-95 shadow-2xl min-h-[64px] uppercase tracking-wide"
                      >
                        🚀 Start Round
                      </button>
                      {!currentCard && (
                        <p className="text-sm text-gray-500 mt-2">Waiting for card assignment...</p>
                      )}
                    </div>
                  ) : useManualInput ? (
                    /* Manual Text Input Mode */
                    <form onSubmit={handleManualClueSubmit} className="space-y-6">
                      <div>
                        <label htmlFor="manualClue" className="block text-sm font-bold text-gray-700 mb-3">
                          Type your clue:
                        </label>
                        <textarea
                          id="manualClue"
                          value={manualClueInput}
                          onChange={(e) => setManualClueInput(e.target.value)}
                          placeholder="Type a clue to help guessers find the word..."
                          className="w-full px-4 sm:px-5 py-3 sm:py-4 text-base sm:text-lg border-4 border-gray-300 rounded-xl focus:ring-4 focus:ring-orange-500 focus:border-orange-500 outline-none transition text-gray-900 font-medium placeholder-gray-500 shadow-inner min-h-[100px] resize-none"
                          disabled={clueHistory.length >= 10 || gamePhase === 'guessing'}
                          maxLength={200}
                        />
                        <p className="text-xs text-gray-500 mt-2">
                          {manualClueInput.length}/200 characters
                        </p>
                      </div>

                      <div className="space-y-3">
                        <button
                          type="submit"
                          disabled={!manualClueInput.trim() || clueHistory.length >= 10 || gamePhase === 'guessing'}
                          className="w-full py-4 sm:py-5 bg-gradient-to-r from-orange-600 to-red-600 text-white text-lg sm:text-xl font-black rounded-xl hover:from-orange-700 hover:to-red-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all transform hover:scale-105 active:scale-95 shadow-2xl min-h-[56px] uppercase tracking-wide"
                        >
                          {gamePhase !== 'speaker' ? '⏳ Waiting for Guesses...' : clueHistory.length >= 10 ? '🚫 Max Clues Reached' : '📤 Submit Clue'}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setUseManualInput(false);
                            stop();
                          }}
                          className="w-full py-3 bg-gray-300 text-gray-800 font-bold rounded-lg hover:bg-gray-400 transition-colors"
                        >
                          Back to Mic
                        </button>
                      </div>

                      <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3 text-sm text-gray-700">
                        <p className="font-semibold mb-1">💡 Tips:</p>
                        <ul className="list-disc list-inside space-y-1 text-xs">
                          <li>Type clear, descriptive clues</li>
                          <li>Avoid using the forbidden words</li>
                          <li>Maximum 10 clues per round</li>
                        </ul>
                      </div>

                      <div className="flex items-center justify-center gap-3 py-3 border-t-2 border-gray-200">
                        <span className="text-sm font-medium text-gray-600">Clues given:</span>
                        <span className="text-2xl font-black text-purple-600">{clueHistory.length}</span>
                        <span className="text-sm text-gray-500">/ 10 max</span>
                      </div>
                    </form>
                  ) : (
                    /* Microphone Input Mode */
                    <div className="space-y-6">
                      {/* Mic Button */}
                      <div className="flex justify-center">
                        <button
                          onClick={toggleMic}
                          disabled={clueHistory.length >= 10 || gamePhase === 'guessing'}
                          aria-label={isListening ? 'Stop recording' : 'Start recording'}
                          className={`w-32 h-32 sm:w-36 sm:h-36 md:w-40 md:h-40 rounded-full flex items-center justify-center text-6xl sm:text-7xl transition-all transform shadow-2xl min-h-[128px] min-w-[128px] ${
                            clueHistory.length >= 10 || gamePhase !== 'speaker'
                              ? 'bg-gray-400 cursor-not-allowed'
                              : isListening
                              ? 'bg-red-600 hover:bg-red-700 animate-pulse ring-4 ring-red-300 hover:scale-110 active:scale-95'
                              : 'bg-blue-600 hover:bg-blue-700 ring-4 ring-blue-300 hover:scale-110 active:scale-95'
                          }`}
                        >
                          {clueHistory.length >= 10 ? '🚫' : gamePhase === 'guessing' ? '⏳' : isListening ? '🔴' : '🎤'}
                        </button>
                      </div>

                      {/* Status */}
                      <div className="text-center space-y-2">
                        <p className="text-base sm:text-lg md:text-xl font-bold text-gray-900">
                          {gamePhase === 'guessing' ? '⏳ Waiting for other players to guess...' : isListening ? '🎙️ Listening... Click again to send!' : 'Click mic to speak'}
                        </p>
                        <div className="flex items-center justify-center gap-3">
                          <span className="text-sm font-medium text-gray-600">Clues given:</span>
                          <span className="text-2xl font-black text-purple-600">{clueHistory.length}</span>
                          <span className="text-sm text-gray-500">/ 10 max</span>
                        </div>
                        {clueHistory.length >= 10 && (
                          <p className="text-red-600 font-bold text-sm">⚠️ Maximum clues reached!</p>
                        )}
                        {gamePhase === 'guessing' && (
                          <p className="text-orange-600 font-bold text-sm">⏳ Waiting for other players to make their guesses...</p>
                        )}
                      </div>

                      {/* Live Transcript */}
                      {transcript && (
                        <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4 sm:p-5 border-2 border-blue-300 shadow-lg animate-pulse">
                          <p className="text-xs sm:text-sm font-bold text-blue-700 mb-2 uppercase tracking-wide">
                            🎤 Live Transcript:
                          </p>
                          <p className="text-gray-900 text-base sm:text-lg italic font-medium">&quot;{transcript}&quot;</p>
                        </div>
                      )}

                      {/* Help Text */}
                      <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-3 text-sm text-gray-700">
                        <p className="font-semibold mb-1">💡 Tips:</p>
                        <ul className="list-disc list-inside space-y-1 text-xs">
                          <li>Click mic to start, speak your clue, then click again to send</li>
                          <li>Your clue is sent only when you stop the mic</li>
                          <li>Avoid forbidden words or lose points!</li>
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Guesser View */
              <>
                {/* Clue History */}
                <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl p-5 sm:p-8">
                  <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-4 sm:mb-6 text-center">
                    Clues Received 💬
                  </h2>
                  
                  {clueHistory.length > 0 ? (
                    <div className="space-y-3 max-h-80 sm:max-h-96 overflow-y-auto pr-2">
                      {clueHistory.map((clue, index) => (
                        <div
                          key={index}
                          className="bg-gradient-to-r from-blue-100 to-purple-100 rounded-xl p-4 sm:p-5 border-l-4 border-blue-600 shadow-md hover:shadow-lg transition-shadow"
                        >
                          <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                            <p className="text-gray-900 text-base sm:text-lg font-medium flex-1">
                              &quot;{clue.transcript}&quot;
                            </p>
                            <span className="bg-blue-600 text-white text-xs sm:text-sm font-bold px-3 py-2 rounded-full whitespace-nowrap shadow-md">
                              Clue #{clue.clueCount}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="text-6xl sm:text-7xl mb-4">👂</div>
                      <p className="text-gray-600 text-base sm:text-lg font-medium">Waiting for clues from the speaker...</p>
                    </div>
                  )}
                </div>

                {/* Guess Input Component */}
                <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl p-5 sm:p-8">
                  <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 mb-4 sm:mb-6 text-center">
                    Make Your Guess 🎯
                  </h3>
                  
                  {/* Guesses Remaining - Mobile-friendly compact layout */}
                  <div className="mb-6">
                    <div className="flex items-center justify-center gap-2 mb-3">
                      <span className="text-gray-900 font-bold text-base sm:text-lg">Guesses Remaining:</span>
                      <span className="font-black text-green-700">{Math.max(0, maxGuesses - guessesUsed)}</span>
                      <span className="text-gray-500">/ {maxGuesses}</span>
                    </div>
                    <div className="mx-auto max-w-full">
                      <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 sm:gap-2 place-items-center">
                        {Array.from({ length: maxGuesses }).map((_, index) => (
                          <div
                            key={index}
                            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-base sm:text-lg shadow-md ${
                              index < maxGuesses - guessesUsed
                                ? 'bg-green-600 text-white ring-2 ring-green-300'
                                : 'bg-gray-400 text-gray-700 ring-2 ring-gray-300'
                            }`}
                          >
                            {index < maxGuesses - guessesUsed ? '✓' : '✗'}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Guess Form + Mic */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <form onSubmit={handleGuessSubmit} className="space-y-4 order-2 md:order-1">
                      <input
                        type="text"
                        value={guessInput}
                        onChange={(e) => setGuessInput(e.target.value)}
                        placeholder="Type your guess..."
                        aria-label="Guess input"
                        className="w-full px-5 sm:px-6 py-4 sm:py-5 text-base sm:text-lg md:text-xl border-4 border-gray-300 rounded-xl focus:ring-4 focus:ring-purple-500 focus:border-purple-500 outline-none transition text-gray-900 font-medium placeholder-gray-500 shadow-inner min-h-[56px]"
                        disabled={guessesUsed >= maxGuesses || gamePhase !== 'guessing' || playerHasGuessed}
                        maxLength={50}
                      />
                      <button
                        type="submit"
                        disabled={!guessInput.trim() || guessesUsed >= maxGuesses || gamePhase !== 'guessing' || playerHasGuessed}
                        className="w-full py-4 sm:py-5 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-lg sm:text-xl font-black rounded-xl hover:from-purple-700 hover:to-pink-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all transform hover:scale-105 active:scale-95 shadow-2xl min-h-[56px] uppercase tracking-wide"
                      >
                        {playerHasGuessed ? '✓ You Guessed' : guessesUsed >= maxGuesses ? '🚫 No Guesses Left' : gamePhase !== 'guessing' ? '⏳ Waiting for Clue...' : '🎯 Submit Guess'}
                      </button>
                    </form>

                    {/* Guesser Mic */}
                    <div className="space-y-3 order-1 md:order-2">
                      <p className="text-center text-gray-800 font-bold">Or speak your guess 🎤</p>
                      {!isSupported ? (
                        <div className="text-center py-3 text-red-700 font-bold">Speech not supported</div>
                      ) : (
                        <div className="flex flex-col items-center gap-3">
                          <button
                            onClick={() => {
                              if (gamePhase !== 'guessing') {
                                showFeedback('Waiting for the speaker to give a clue...', 'info');
                                return;
                              }
                              if (playerHasGuessed) {
                                showFeedback('You have already guessed this clue.', 'info');
                                return;
                              }
                              if (guessesUsed >= maxGuesses) {
                                showFeedback('No guesses left!', 'error');
                                return;
                              }
                              if (isListening) {
                                stop();
                              } else {
                                start();
                              }
                            }}
                            disabled={guessesUsed >= maxGuesses || gamePhase !== 'guessing' || playerHasGuessed}
                            aria-label={isListening ? 'Stop recording' : 'Start recording'}
                            className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl transition-all transform shadow-2xl ${
                              guessesUsed >= maxGuesses || gamePhase !== 'guessing' || playerHasGuessed
                                ? 'bg-gray-400 cursor-not-allowed'
                                : isListening
                                ? 'bg-red-600 hover:bg-red-700 animate-pulse ring-4 ring-red-300'
                                : 'bg-purple-600 hover:bg-purple-700 ring-4 ring-purple-300'
                            }`}
                          >
                            {playerHasGuessed ? '✓' : guessesUsed >= maxGuesses ? '🚫' : gamePhase !== 'guessing' ? '⏳' : isListening ? '🔴' : '🎤'}
                          </button>
                          {transcript && (
                            <div className="text-center text-sm text-gray-700">
                              Heard: <span className="font-bold">{transcript}</span>
                            </div>
                          )}
                          <div className="text-xs text-gray-500 text-center">Click to start, speak, then click again to send</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Floating Controls - Always accessible (speaker & guesser) */}
          <div className="fixed bottom-6 right-6 z-[1000] space-y-3 pointer-events-auto">
            {/* Speaker floating start round */}
            {isSpeaker && !roundActive && currentCard && (
              <button
                onClick={handleStartRound}
                aria-label="Start Round"
                className="w-16 h-16 rounded-full shadow-2xl flex items-center justify-center text-2xl bg-emerald-600 text-white ring-4 ring-emerald-300 hover:bg-emerald-700 transition-all"
              >
                🚀
              </button>
            )}
            {/* Speaker floating mic */}
            {isSupported && isSpeaker && roundActive && gamePhase !== 'guessing' && (
              <button
                onClick={toggleMic}
                aria-label={isListening ? 'Stop recording' : 'Start recording'}
                className={`w-16 h-16 rounded-full shadow-2xl flex items-center justify-center text-3xl ring-4 ${
                  clueHistory.length >= 10
                    ? 'bg-gray-400 cursor-not-allowed ring-gray-300'
                    : isListening
                    ? 'bg-red-600 text-white ring-red-300 animate-pulse'
                    : 'bg-blue-600 text-white ring-blue-300 hover:bg-blue-700'
                } transition-all`}
              >
                {clueHistory.length >= 10 ? '🚫' : isListening ? '🔴' : '🎤'}
              </button>
            )}
            {/* Guesser floating mic */}
            {isSupported && !isSpeaker && gamePhase === 'guessing' && !playerHasGuessed && guessesUsed < maxGuesses && (
              <button
                onClick={() => {
                  if (isListening) {
                    stop();
                  } else {
                    start();
                  }
                }}
                aria-label={isListening ? 'Stop recording' : 'Start recording'}
                className={`w-16 h-16 rounded-full shadow-2xl flex items-center justify-center text-3xl ring-4 ${
                  isListening ? 'bg-red-600 text-white ring-red-300 animate-pulse' : 'bg-purple-600 text-white ring-purple-300 hover:bg-purple-700'
                } transition-all`}
              >
                {isListening ? '🔴' : '🎤'}
              </button>
            )}
          </div>

          {/* Sidebar - Player Details */}
          <div className="space-y-4 sm:space-y-6">
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl p-5 sm:p-6">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Players</h3>
              <div className="space-y-3">
                {room.players.map((player) => (
                  <div
                    key={player.id}
                    className={`p-4 sm:p-5 rounded-xl border-3 shadow-md transition-all hover:shadow-lg min-h-[88px] ${
                      player.id === room.currentClueGiver
                        ? 'bg-yellow-100 border-yellow-500 ring-2 ring-yellow-300'
                        : player.id === currentPlayerId
                        ? 'bg-purple-100 border-purple-500 ring-2 ring-purple-300'
                        : 'bg-gray-100 border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center text-4xl font-bold shadow-md flex-shrink-0 ${
                        player.id === room.currentClueGiver
                          ? 'bg-yellow-400'
                          : player.id === currentPlayerId
                          ? 'bg-purple-500 text-white'
                          : 'bg-gray-400'
                      }`}>
                        {player.avatar || player.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-gray-900 flex flex-wrap items-center gap-2 text-base sm:text-lg">
                          {player.name}
                          {player.id === currentPlayerId && (
                            <span className="text-xs sm:text-sm bg-purple-700 text-white px-3 py-1 rounded-full font-extrabold">
                              You
                            </span>
                          )}
                          {player.id === room.currentClueGiver && (
                            <span className="text-xs sm:text-sm bg-yellow-600 text-white px-3 py-1 rounded-full font-extrabold">
                              🎤 Speaker
                            </span>
                          )}
                        </p>
                        <p className="text-sm sm:text-base text-gray-700 font-medium mt-1">
                          <span className="font-bold">{Math.round(player.score)} pts</span>
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Game Info */}
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl p-5 sm:p-6">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Game Info</h3>
              <div className="space-y-4 text-sm sm:text-base">
                <div className="flex justify-between items-center py-2 border-b-2 border-gray-200">
                  <span className="text-gray-700 font-medium">Your Role:</span>
                  <span className="font-black text-gray-900 text-base sm:text-lg">
                    {isSpeaker ? '🎤 Speaker' : '🎯 Guesser'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b-2 border-gray-200">
                  <span className="text-gray-700 font-medium">Clues Given:</span>
                  <span className="font-black text-gray-900 text-base sm:text-lg">{clueHistory.length}</span>
                </div>
                {!isSpeaker && (
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-700 font-medium">Your Guesses:</span>
                    <span className="font-black text-gray-900 text-base sm:text-lg">
                      {guessesUsed} / {maxGuesses}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* How to Play Component */}
        <HowToPlayButton />
      </div>
    </div>
  );
}

// Cleanup function: remove saved game state when leaving the page
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    // Keep game state for 5 minutes (300000ms) in case of accidental refresh
    // After that, clear it
  });
}
