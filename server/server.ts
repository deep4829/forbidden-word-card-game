// Load environment variables FIRST before any other imports
import 'dotenv/config';

import express from 'express';
import { createServer } from 'http';
import { createSecureServer } from 'http2';
import * as fs from 'fs';
import * as path from 'path';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { Room, Player, Card } from './types/game';
import { loadAndShuffleDeck } from './lib/supabase';
import { checkForbidden, normalize } from './utils/forbiddenCheck';
import { computePoints } from './utils/scoring';

const app = express();

// Check if HTTPS certificate is available
const certPath = path.join(__dirname, '..', 'localhost.crt');
const pfxPath = path.join(__dirname, '..', 'localhost.pfx');
const useHttps = fs.existsSync(pfxPath) || fs.existsSync(certPath);

let httpServer;

if (useHttps && fs.existsSync(pfxPath)) {
  try {
    const pfxData = fs.readFileSync(pfxPath);
    const https = require('https');
    httpServer = https.createServer(
      {
        pfx: pfxData,
        passphrase: 'localhost123'
      },
      app
    );
    console.log('✅ Using HTTPS with self-signed certificate');
  } catch (err) {
    console.warn('⚠️  Failed to create HTTPS server, falling back to HTTP:', (err as Error).message);
    httpServer = createServer(app);
  }
} else {
  httpServer = createServer(app);
}

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const PORT = process.env.PORT || 4000;

// In-memory storage for rooms
const rooms = new Map<string, Room>();

// Store shuffled deck for each room
const roomDecks = new Map<string, Card[]>();

// Store round number for each room
const roomRounds = new Map<string, number>();

// Store clue count for current round in each room
const roomClueCount = new Map<string, number>();

// Store all clues given in current round per room (for duplicate prevention)
const roomCluesGiven = new Map<string, Set<string>>();

// Store all guesses made in current round per room (for duplicate prevention)
const roomGuessesGiven = new Map<string, Set<string>>();

// Helper function to create a new player
function createPlayer(socketId: string, name: string, avatar: string = '🎮'): Player {
  return {
    id: socketId,
    name,
    avatar,
    isReady: false,
    team: null,
    score: 0,
    guessesUsed: 0,
  };
}

// Helper function to create a new room
function createRoom(roomId: string, hostPlayer: Player): Room {
  return {
    id: roomId,
    players: [hostPlayer],
    currentClueGiver: null,
    currentCard: null,
    teamAScore: 0,
    teamBScore: 0,
    gameStarted: false,
    roundInProgress: false,
  };
}

// Helper function to get room by ID
function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

// Helper function to find room by player ID
function findRoomByPlayerId(playerId: string): Room | undefined {
  for (const room of rooms.values()) {
    if (room.players.some((p) => p.id === playerId)) {
      return room;
    }
  }
  return undefined;
}

// Helper function to get room by socket ID
function getRoomBySocketId(socketId: string): Room | undefined {
  return findRoomByPlayerId(socketId);
}

// Helper function to add player to room
function addPlayerToRoom(room: Room, player: Player): boolean {
  // Check if player already exists in room
  const existingPlayer = room.players.find((p) => p.id === player.id);
  if (existingPlayer) {
    return false;
  }

  room.players.push(player);
  return true;
}

// Helper function to remove player from room
function removePlayerFromRoom(room: Room, playerId: string): boolean {
  const initialLength = room.players.length;
  room.players = room.players.filter((p) => p.id !== playerId);
  return room.players.length < initialLength;
}

// Helper function to start game
async function startGame(room: Room): Promise<boolean> {
  // Validate room size (must have at least 2 players)
  if (room.players.length < 2) {
    return false;
  }

  // Initialize game state
  room.gameStarted = true;
  room.roundInProgress = false;
  roomRounds.set(room.id, 1);
  roomClueCount.set(room.id, 0);

  // Assign first speaker (first player in the list)
  room.currentClueGiver = room.players[0].id;

  try {
    // Load and shuffle deck for this room (now async from Supabase)
    const deck = await loadAndShuffleDeck();
    if (!deck || deck.length === 0) {
      console.warn(`[startGame] Supabase returned no cards. Using fallback deck for room ${room.id}.`);
      const fallback: Card[] = [
        { id: 'fallback-1', mainWord: 'Sample', forbiddenWords: ['example', 'test', 'demo', 'mock'] },
        { id: 'fallback-2', mainWord: 'Alpha', forbiddenWords: ['beta', 'gamma', 'delta', 'epsilon'] }
      ];
      roomDecks.set(room.id, fallback);
    } else {
      roomDecks.set(room.id, deck);
    }

    // Draw first card
    console.log(`[startGame] Drawing first card for room ${room.id}`);
    const firstCard = await drawNextCard(room);
    room.currentCard = firstCard;
    console.log(`[startGame] First card set: ${firstCard ? firstCard.id : 'null'}`);

    return true;
  } catch (error) {
    console.error(`Error loading deck for room ${room.id}:`, error);
    return false;
  }
}

// Helper function to draw next card
async function drawNextCard(room: Room): Promise<Card | null> {
  const deck = roomDecks.get(room.id);
  if (!deck || deck.length === 0) {
    // Ensure the deck is initialized if missing
    console.warn(`Deck for room ${room.id} is empty or missing. Reinitializing...`);
    try {
      const newDeck = await loadAndShuffleDeck();
      roomDecks.set(room.id, newDeck);
      return newDeck.shift() || null;
    } catch (error) {
      console.error(`Error reloading deck for room ${room.id}:`, error);
      return null;
    }
  }

  // Pop the first card from the deck
  const card = deck.shift();
  return card || null;
}

// Placeholder: Helper function to handle clue submission
function handleClueSubmission(room: Room, clue: string): { valid: boolean; violations?: string[] } {
  // TODO: Implement clue validation logic
  return { valid: true };
}

// Helper function to end the current round
function endRound(room: Room, speakerId: string, guesserId: string): { speakerBonus: number; guesserBonus: number } {
  const clueCount = roomClueCount.get(room.id) || 0;
  const points = computePoints(clueCount);

  // Award base points to speaker and guesser
  const speaker = room.players.find((p) => p.id === speakerId);
  const guesser = room.players.find((p) => p.id === guesserId);

  let speakerBonus = 0;
  let guesserBonus = 0;

  if (speaker) {
    speaker.score += points.speaker;

    // Calculate unused clues bonus: +1 per unused clue (max 4 clues)
    const unusedClues = Math.max(0, 4 - clueCount);
    speakerBonus = unusedClues;
    speaker.score += speakerBonus;
  }

  if (guesser) {
    guesser.score += points.guesser;

    // Calculate unused guesses bonus: +0.5 per unused guess (max 3 guesses)
    const guessesUsed = guesser.guessesUsed || 0;
    const unusedGuesses = Math.max(0, 3 - guessesUsed);
    guesserBonus = unusedGuesses * 0.5;
    guesser.score += guesserBonus;
  }

  // Update team scores
  if (speaker?.team === 'A') {
    room.teamAScore += points.speaker + speakerBonus;
  } else if (speaker?.team === 'B') {
    room.teamBScore += points.speaker + speakerBonus;
  }

  if (guesser?.team === 'A') {
    room.teamAScore += points.guesser + guesserBonus;
  } else if (guesser?.team === 'B') {
    room.teamBScore += points.guesser + guesserBonus;
  }

  // Reset round state
  room.roundInProgress = false;
  room.currentCard = null;
  roomClueCount.set(room.id, 0);
  
  // Clear clues and guesses for next round
  roomCluesGiven.delete(room.id);
  roomGuessesGiven.delete(room.id);

  // Reset guesses used for all players
  room.players.forEach((p) => {
    p.guessesUsed = 0;
  });

  // Transition to next speaker (round-robin)
  const currentSpeakerIndex = room.players.findIndex((p) => p.id === room.currentClueGiver);
  const nextSpeakerIndex = (currentSpeakerIndex + 1) % room.players.length;
  room.currentClueGiver = room.players[nextSpeakerIndex].id;

  // Increment round number
  const currentRound = roomRounds.get(room.id) || 1;
  roomRounds.set(room.id, currentRound + 1);

  return { speakerBonus, guesserBonus };
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Handle create-room event
  socket.on('create-room', (data: { playerName: string; playerAvatar: string } | string) => {
    // Handle both old format (just string) and new format (object with avatar)
    let playerName = '';
    let playerAvatar = '🎮';
    
    if (typeof data === 'string') {
      playerName = data;
    } else {
      playerName = data.playerName;
      playerAvatar = data.playerAvatar || '🎮';
    }
    
    console.log(`[create-room] Received request from ${socket.id} with name: ${playerName}, avatar: ${playerAvatar}`);
    const roomId = uuidv4();
    const player = createPlayer(socket.id, playerName, playerAvatar);
    const room = createRoom(roomId, player);

    rooms.set(roomId, room);
    socket.join(roomId);

    console.log(`[create-room] Emitting room-created event to socket ${socket.id} for room ${roomId}`);
    socket.emit('room-created', { roomId, room });
    io.to(roomId).emit('room-updated', room);

    console.log(`Room created: ${roomId} by ${playerName}`);
  });

  // Handle get-room event
  socket.on('get-room', (roomId: string) => {
    const room = getRoom(roomId);
    if (room) {
      socket.emit('room-updated', room);
    } else {
      socket.emit('error', { message: 'Room not found' });
    }
  });

  // Handle join-room event
  socket.on('join-room', (data: { roomId: string; playerName: string; playerAvatar?: string }) => {
    const { roomId, playerName, playerAvatar = '🎮' } = data;
    const room = getRoom(roomId);

    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    // Add player to room using helper function
    const player = createPlayer(socket.id, playerName, playerAvatar);
    const added = addPlayerToRoom(room, player);

    if (!added) {
      socket.emit('error', { message: 'You are already in this room' });
      return;
    }

    socket.join(roomId);
    socket.emit('room-joined', { roomId, room });
    io.to(roomId).emit('room-updated', room);

    console.log(`Player ${playerName} joined room: ${roomId}`);
  });

  // Handle update-player event (for editing profile)
  socket.on('update-player', (data: { roomId: string; playerName: string; playerAvatar: string }) => {
    const { roomId, playerName, playerAvatar } = data;
    const room = getRoom(roomId);

    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    // Find the player in the room
    const player = room.players.find((p) => p.id === socket.id);

    if (!player) {
      socket.emit('error', { message: 'You are not in this room' });
      return;
    }

    // Update player's name and avatar
    if (playerName.trim()) {
      player.name = playerName.trim();
    }
    if (playerAvatar) {
      player.avatar = playerAvatar;
    }

    // Broadcast updated room to all players in the room
    io.to(roomId).emit('room-updated', room);

    console.log(`Player ${socket.id} updated profile in room: ${roomId}`);
  });

  // Handle start-game event
  socket.on('start-game', async (roomId: string) => {
    const room = getRoom(roomId);

    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    // Validate room size (must have at least 2 players)
    if (room.players.length < 2) {
      socket.emit('error', { message: 'Game requires at least 2 players to start' });
      return;
    }

    // Start the game
    console.log(`[socket] start-game requested for room ${roomId}`);
    const started = await startGame(room);

    if (!started) {
      socket.emit('error', { message: 'Failed to start game' });
      console.error(`[socket] start-game failed for room ${roomId}`);
      return;
    }

    // Emit game-started to all players in the room
    console.log(`[socket] Emitting game-started for room ${roomId}`);
    io.to(roomId).emit('game-started', {
      room,
      roundNumber: roomRounds.get(roomId),
      currentClueGiver: room.currentClueGiver,
    });

    // Emit card-assigned only to the current speaker
    if (room.currentClueGiver && room.currentCard) {
      console.log(`[socket] Emitting card-assigned to speaker ${room.currentClueGiver}`);
      io.to(room.currentClueGiver).emit('card-assigned', {
        card: room.currentCard,
      });
    }

    console.log(`Game started in room ${roomId}, Speaker: ${room.currentClueGiver}`);
  });

  // Handle speaker-transcript event
  socket.on('speaker-transcript', (data: { roomId: string; transcript: string }) => {
    const { roomId, transcript } = data;
    const room = getRoom(roomId);

    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    // Verify that the sender is the current clue giver
    if (room.currentClueGiver !== socket.id) {
      socket.emit('error', { message: 'Only the current speaker can give clues' });
      return;
    }

    // Check if there's a current card
    if (!room.currentCard) {
      socket.emit('error', { message: 'No card is currently active' });
      return;
    }

    // Check clue limit (max 4 clues per round)
    const currentClueCount = roomClueCount.get(roomId) || 0;
    if (currentClueCount >= 4) {
      socket.emit('error', { message: 'Maximum clues reached (4 clues per round)' });
      return;
    }

    // Check for duplicate clues
    const normalizedClue = transcript.toLowerCase().trim();
    let cluesSet = roomCluesGiven.get(roomId);
    if (!cluesSet) {
      cluesSet = new Set();
      roomCluesGiven.set(roomId, cluesSet);
    }
    if (cluesSet.has(normalizedClue)) {
      socket.emit('error', { message: 'You already gave that clue!' });
      return;
    }
    cluesSet.add(normalizedClue);

    // Check for forbidden words
    const violations = checkForbidden(transcript, [
      room.currentCard.mainWord,
      ...room.currentCard.forbiddenWords,
    ]);

    if (violations.length > 0) {
      // Apply -5 penalty to the speaker
      const speaker = room.players.find((p) => p.id === socket.id);
      if (speaker) {
        speaker.score -= 5;

        // Broadcast forbidden word detection
        io.to(roomId).emit('forbidden-detected', {
          playerId: socket.id,
          playerName: speaker.name,
          violations,
          penalty: -5,
        });

        // Broadcast score update
        io.to(roomId).emit('score-updated', {
          playerId: socket.id,
          newScore: speaker.score,
          room,
        });

        console.log(`Forbidden words detected in room ${roomId}: ${violations.join(', ')}`);
      }
    } else {
      // Valid clue - increment clue count
      const currentClueCount = (roomClueCount.get(roomId) || 0) + 1;
      roomClueCount.set(roomId, currentClueCount);

      // Broadcast the valid clue to all players
      io.to(roomId).emit('clue-broadcast', {
        transcript,
        clueCount: currentClueCount,
        speakerId: socket.id,
      });

      console.log(`Valid clue in room ${roomId}: "${transcript}" (clue #${currentClueCount})`);
    }
  });

  // Handle guesser-guess event
  socket.on('guesser-guess', async (data: { roomId: string; guess: string }) => {
    const { roomId, guess } = data;
    const room = getRoom(roomId);

    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    // Check if there's a current card
    if (!room.currentCard) {
      socket.emit('error', { message: 'No card is currently active' });
      return;
    }

    // Verify that the sender is not the current clue giver
    if (room.currentClueGiver === socket.id) {
      socket.emit('error', { message: 'The speaker cannot make guesses' });
      return;
    }

    // Find the guesser
    const guesser = room.players.find((p) => p.id === socket.id);
    if (!guesser) {
      socket.emit('error', { message: 'Player not found in room' });
      return;
    }

    // Enforce guess limit before processing
    const maxGuesses = 3; // Maximum guesses per player per round
    const currentGuesses = guesser.guessesUsed || 0;
    if (currentGuesses >= maxGuesses) {
      socket.emit('error', { message: 'Maximum guesses reached (3 per round)' });
      return;
    }

    // Check for duplicate guesses
    const normalizedGuessForDuplicate = guess.toLowerCase().trim();
    let guessesSet = roomGuessesGiven.get(roomId);
    if (!guessesSet) {
      guessesSet = new Set();
      roomGuessesGiven.set(roomId, guessesSet);
    }
    if (guessesSet.has(normalizedGuessForDuplicate)) {
      socket.emit('error', { message: 'That guess was already made!' });
      return;
    }
    guessesSet.add(normalizedGuessForDuplicate);

    // Update guesses used
    guesser.guessesUsed = currentGuesses + 1;

    // Normalize both the guess and the target word
    const normalizedGuess = normalize(guess);
    const normalizedTarget = normalize(room.currentCard.mainWord);

    // Check if guess is correct
    if (normalizedGuess === normalizedTarget) {
      // Correct guess!
      const clueCount = roomClueCount.get(roomId) || 0;
      const points = computePoints(clueCount);
      const targetWord = room.currentCard.mainWord;
      const oldSpeakerId = room.currentClueGiver;

      // Award points using endRound helper (this updates room.currentClueGiver to the next speaker)
      let bonuses = { speakerBonus: 0, guesserBonus: 0 };
      if (room.currentClueGiver) {
        bonuses = endRound(room, room.currentClueGiver, socket.id);
      }

      // Now room.currentClueGiver is the NEW speaker
      const newSpeakerId = room.currentClueGiver;

      // Draw next card for the new speaker
      const nextCard = await drawNextCard(room);
      room.currentCard = nextCard;
      console.log(`[socket] Drew next card for new speaker ${newSpeakerId}: ${nextCard?.id || 'null'}`);

      // Broadcast correct guess result
      io.to(roomId).emit('guess-result', {
        correct: true,
        guesserId: socket.id,
        guesserName: guesser.name,
        guess,
        targetWord,
        clueCount,
        points,
        room,
      });

      // Emit round-ended event
      io.to(roomId).emit('round-ended', {
        success: true,
        targetWord,
        speakerId: oldSpeakerId,
        guesserId: socket.id,
        clueCount,
        basePoints: points,
        bonuses,
        room,
      });

      // Emit final score-updated event
      io.to(roomId).emit('score-updated', {
        room,
        teamAScore: room.teamAScore,
        teamBScore: room.teamBScore,
      });

      // Emit card-assigned to the new speaker after round ends
      if (newSpeakerId && room.currentCard) {
        console.log(`[socket] Emitting card-assigned to new speaker ${newSpeakerId} with card ${room.currentCard.id}`);
        io.to(newSpeakerId).emit('card-assigned', {
          card: room.currentCard,
        });
      } else {
        console.warn(`[socket] Could not emit card-assigned: speakerId=${newSpeakerId}, card=${room.currentCard?.id}`);
      }

      console.log(`Correct guess in room ${roomId}: "${guess}" by ${guesser.name}`);
    } else {
      // Incorrect guess
      const isExhausted = (guesser.guessesUsed || 0) >= maxGuesses;

      // Broadcast incorrect guess result
      io.to(roomId).emit('guess-result', {
        correct: false,
        guesserId: socket.id,
        guesserName: guesser.name,
        guess,
        guessesUsed: guesser.guessesUsed,
        isExhausted,
        room,
      });

      console.log(`Incorrect guess in room ${roomId}: "${guess}" by ${guesser.name} (${guesser.guessesUsed}/${maxGuesses})`);

      // Check if all guessers have exhausted their guesses
      const allGuessersExhausted = room.players
        .filter((p) => p.id !== room.currentClueGiver) // Exclude the speaker
        .every((p) => (p.guessesUsed || 0) >= maxGuesses);

      if (allGuessersExhausted) {
        console.log(`[socket] All guessers exhausted in room ${roomId}. Auto-advancing round...`);

        // End round with no correct guess
        const oldSpeakerId = room.currentClueGiver;
        endRound(room, room.currentClueGiver!, socket.id); // Use incorrect guesser for scoring
        const newSpeakerId = room.currentClueGiver;

        // Draw next card for the new speaker
        const nextCard = await drawNextCard(room);
        room.currentCard = nextCard;

        // Broadcast round ended
        io.to(roomId).emit('round-ended', {
          success: false,
          reason: 'All guesses exhausted',
          targetWord: room.currentCard?.mainWord, // Previous card
          speakerId: oldSpeakerId,
          room,
        });

        // Emit score update
        io.to(roomId).emit('score-updated', {
          room,
          teamAScore: room.teamAScore,
          teamBScore: room.teamBScore,
        });

        // Emit card to new speaker
        if (newSpeakerId && room.currentCard) {
          console.log(`[socket] Auto-advance: Emitting card to new speaker ${newSpeakerId}`);
          io.to(newSpeakerId).emit('card-assigned', {
            card: room.currentCard,
          });
        }
      }
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);

    const room = getRoomBySocketId(socket.id);
    if (room) {
      const roomId = room.id;
      const removed = removePlayerFromRoom(room, socket.id);

      if (removed) {
        // Delete room if empty
        if (room.players.length === 0) {
          rooms.delete(roomId);
          console.log(`Room ${roomId} deleted (empty)`);
        } else {
          // Broadcast updated room to remaining players
          io.to(roomId).emit('room-updated', room);
          console.log(`Player ${socket.id} removed from room ${roomId}`);
        }
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Graceful error handling
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
