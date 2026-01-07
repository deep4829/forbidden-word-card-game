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
import { loadAndShuffleDeck, warmCardCache } from './lib/supabase';
import { checkForbidden } from './utils/forbiddenCheck';
import { normalize } from './utils/textUtils';
import { computePoints } from './utils/scoring';
import { isMatchingGuess } from './utils/compareWords';
import Groq from "groq-sdk";
import { getRandomCard } from './lib/supabase';

const app = express();

// Keep-alive / health endpoint for external pings (cron-job.org, uptime monitors)
app.get('/healthz', (_req, res) => {
  res.status(200).send('OK');
});

// Root endpoint: show a simple status page so GET / on Render doesn't return 404
app.get('/', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`
    <html>
      <head><title>Forbidden Word Game</title></head>
      <body style="font-family:system-ui, -apple-system, Segoe UI, Roboto, 'Helvetica Neue', Arial; padding:24px;">
        <h1>Forbidden Word Game</h1>
        <p>Server is running. Use the <a href="/healthz">/healthz</a> endpoint for keep-alive pings.</p>
        <p>Socket server is available on the same host and port for game connections.</p>
      </body>
    </html>
  `);
});

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

const DEFAULT_PORT = 4000;
const envPort = process.env.PORT;
let PORT = DEFAULT_PORT;

if (envPort) {
  const parsedPort = Number.parseInt(envPort, 10);

  if (!Number.isNaN(parsedPort) && parsedPort > 0) {
    PORT = parsedPort;
  } else {
    console.warn(`[server] Invalid PORT value "${envPort}" provided. Falling back to ${DEFAULT_PORT}.`);
  }
} else {
  console.warn(`[server] PORT environment variable not detected. Falling back to ${DEFAULT_PORT}.`);
}

// In-memory storage for rooms
const rooms = new Map<string, Room>();

// Store shuffled deck for each room
const roomDecks = new Map<string, Card[]>();

// Store round number for each room
const roomRounds = new Map<string, number>();

// Store clue count for current round in each room
const roomClueCount = new Map<string, number>();

const groqKey = process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY; // Fallback to Gemini key name if that's what's set
const groq = groqKey ? new Groq({ apiKey: groqKey }) : null;

// Store all clues given in current round per room (for duplicate prevention)
const roomCluesGiven = new Map<string, Set<string>>();

// Store all guesses made in current round per room (for duplicate prevention)
const roomGuessesGiven = new Map<string, Set<string>>();

// Track room creation and last activity time (30 minutes timeout)
const roomActivity = new Map<string, number>();
const ROOM_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

// NEW: Track socket to room mapping for reconnections
const socketToRoom = new Map<string, string>();  // socketId -> roomId
const playerSessionData = new Map<string, { name: string; avatar: string; roomId: string }>();  // playerId (name+avatar) -> session data

// Allow players a short window to reconnect before being removed
const RECONNECT_GRACE_PERIOD = 2 * 60 * 1000; // 2 minutes
const reconnectTimeouts = new Map<string, NodeJS.Timeout>(); // playerKey -> timeout handle
const DEFAULT_MAX_ROUNDS = 10;
const MIN_ROUNDS = 1;
const MAX_ROUNDS_LIMIT = 20;

// NEW: Turn-based game flow tracking
// Track whether it's the speaker's turn or guesser's turn
const roomCluePhase = new Map<string, 'speaker' | 'guessing'>();

// Track which players have already guessed after the current clue
const roomPlayersWhoGuessed = new Map<string, Set<string>>();

// Helper function to create a new player
function createPlayer(socketId: string, name: string, avatar: string = '🎮'): Player {
  return {
    id: socketId,
    name,
    avatar,
    isReady: false,
    score: 0,
    guessesUsed: 0,
    isConnected: true,
  };
}

import { fetchImageForWord } from './services/imageService';
import { translateWord } from './services/translationService';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Helper function to create a new room
function createRoom(roomId: string, hostPlayer: Player): Room {
  return {
    id: roomId,
    players: [hostPlayer],
    currentClueGiver: null,
    currentCard: null,
    gameStarted: false,
    roundInProgress: false,
    maxRounds: DEFAULT_MAX_ROUNDS,
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
  const index = room.players.findIndex((p) => p.id === playerId);
  if (index === -1) {
    return false;
  }

  const [removedPlayer] = room.players.splice(index, 1);

  if (room.currentClueGiver === playerId) {
    if (room.players.length > 0) {
      const nextIndex = index % room.players.length;
      room.currentClueGiver = room.players[nextIndex].id;
    } else {
      room.currentClueGiver = null;
      room.currentCard = null;
      room.gameStarted = false;
      room.roundInProgress = false;
    }
  }

  // Clean up session tracking if this was a permanent removal
  if (removedPlayer) {
    const playerKey = `${removedPlayer.name}:${removedPlayer.avatar}`;
    playerSessionData.delete(playerKey);
  }

  return true;
}

// Helper function to update room activity timestamp
function updateRoomActivity(roomId: string) {
  roomActivity.set(roomId, Date.now());
}

// Helper function to clean up expired rooms
function cleanupExpiredRooms() {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [roomId, lastActivity] of roomActivity.entries()) {
    if (now - lastActivity > ROOM_TIMEOUT) {
      console.log(`[cleanup] Removing expired room: ${roomId}`);

      // Clean up all maps related to this room
      rooms.delete(roomId);
      roomDecks.delete(roomId);
      roomRounds.delete(roomId);
      roomClueCount.delete(roomId);
      roomCluesGiven.delete(roomId);
      roomGuessesGiven.delete(roomId);
      roomCluePhase.delete(roomId);
      roomPlayersWhoGuessed.delete(roomId);
      roomActivity.delete(roomId);

      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`[cleanup] Cleaned up ${cleanedCount} expired rooms`);
  }
}

// Helper function to get language-specific main word from card
function getCardWord(card: Card, language?: 'en' | 'hi' | 'kn'): string {
  if (language === 'hi' && card.mainWordHi) {
    return card.mainWordHi;
  }
  if (language === 'kn' && card.mainWordKn) {
    return card.mainWordKn;
  }
  return card.mainWord;
}

// Helper function to get language-specific forbidden words from card
function getCardForbiddenWords(card: Card, language?: 'en' | 'hi' | 'kn'): string[] {
  if (language === 'hi' && card.forbiddenWordsHi) {
    return card.forbiddenWordsHi;
  }
  if (language === 'kn' && card.forbiddenWordsKn) {
    return card.forbiddenWordsKn;
  }
  return card.forbiddenWords;
}

// Helper function to remove player from room

// Helper function to start game
async function startGame(room: Room, language: 'en' | 'hi' | 'kn' = 'en'): Promise<boolean> {
  // Validate room size (must have at least 2 players)
  if (room.players.length < 2) {
    return false;
  }

  // Ensure max rounds is within supported range
  const sanitizedMaxRounds = Math.max(MIN_ROUNDS, Math.min(MAX_ROUNDS_LIMIT, room.maxRounds ?? DEFAULT_MAX_ROUNDS));
  room.maxRounds = sanitizedMaxRounds;

  // Set room language
  room.language = language;

  // Initialize game state
  room.gameStarted = true;
  room.roundInProgress = false;
  roomRounds.set(room.id, 1);
  roomClueCount.set(room.id, 0);

  // NEW: Initialize turn-based flow - start with speaker's turn
  roomCluePhase.set(room.id, 'speaker');
  roomPlayersWhoGuessed.set(room.id, new Set());

  // Assign first speaker (first player in the list)
  room.currentClueGiver = room.players[0].id;

  try {
    // Load and shuffle deck for this room (now async from Supabase)
    const deck = await loadAndShuffleDeck(language);
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
      const language = room.language || 'en';
      const newDeck = await loadAndShuffleDeck(language);
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
function endRound(
  room: Room,
  speakerId: string,
  guesserId: string | null
): { speakerBonus: number; guesserBonus: number; gameOver: boolean; finishedRound: number; nextSpeakerId: string | null } {
  const clueCount = roomClueCount.get(room.id) || 0;
  const points = computePoints(clueCount);

  // Award base points to speaker and guesser
  const speaker = room.players.find((p) => p.id === speakerId);
  const guesser = guesserId ? room.players.find((p) => p.id === guesserId) : undefined;

  let speakerBonus = 0;
  let guesserBonus = 0;

  if (speaker) {
    speaker.score += points.speaker;

    // Calculate unused clues bonus: +1 per unused clue (max 10 clues)
    const unusedClues = Math.max(0, 10 - clueCount);
    speakerBonus = unusedClues;
    speaker.score += speakerBonus;
  }

  if (guesser) {
    guesser.score += points.guesser;

    // Calculate unused guesses bonus: +0.5 per unused guess (max 10 guesses)
    const guessesUsed = guesser.guessesUsed || 0;
    const unusedGuesses = Math.max(0, 10 - guessesUsed);
    guesserBonus = unusedGuesses * 0.5;
    guesser.score += guesserBonus;
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

  const currentRound = roomRounds.get(room.id) || 1;
  const maxRounds = Math.max(MIN_ROUNDS, Math.min(MAX_ROUNDS_LIMIT, room.maxRounds ?? DEFAULT_MAX_ROUNDS));
  room.maxRounds = maxRounds;

  let gameOver = false;
  let nextSpeakerId: string | null = null;

  const currentSpeakerIndex = room.players.findIndex((p) => p.id === room.currentClueGiver);
  if (currentRound >= maxRounds || room.players.length === 0) {
    room.currentClueGiver = null;
    room.currentCard = null;
    room.gameStarted = false;
    room.roundInProgress = false;
    gameOver = true;
    roomRounds.set(room.id, maxRounds);
  } else {
    const nextSpeakerIndex = room.players.length > 0 ? (currentSpeakerIndex + 1 + room.players.length) % room.players.length : -1;
    if (nextSpeakerIndex >= 0) {
      nextSpeakerId = room.players[nextSpeakerIndex].id;
      room.currentClueGiver = nextSpeakerId;
    } else {
      room.currentClueGiver = null;
    }
    roomRounds.set(room.id, currentRound + 1);
  }

  return { speakerBonus, guesserBonus, gameOver, finishedRound: currentRound, nextSpeakerId };
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
    updateRoomActivity(roomId);  // Track room creation time

    // Store socket-to-room mapping and player session data
    socketToRoom.set(socket.id, roomId);
    const playerKey = `${playerName}:${playerAvatar}`;
    playerSessionData.set(playerKey, { name: playerName, avatar: playerAvatar, roomId });

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
      updateRoomActivity(roomId);  // Update last activity
      socket.emit('room-updated', room);
    } else {
      socket.emit('error', { message: 'Room not found' });
    }
  });

  // NEW: Handle get-game-state event - sync full game state on reconnect during active game
  socket.on('get-game-state', (roomId: string) => {
    const room = getRoom(roomId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    updateRoomActivity(roomId);

    // Get which players have already guessed (if in guessing phase)
    const playersWhoGuessed = Array.from(roomPlayersWhoGuessed.get(roomId) || new Set());

    // Get current game state
    const gameState = {
      room,
      roundNumber: roomRounds.get(roomId) || 1,
      currentClueGiver: room.currentClueGiver,
      phase: roomCluePhase.get(roomId) || 'speaker',
      clueCount: roomClueCount.get(roomId) || 0,
      playersWhoGuessed, // Include players who have guessed
      timestamp: new Date().getTime(),
    };

    console.log(`[get-game-state] Sending game state for room ${roomId}:`, {
      roundNumber: gameState.roundNumber,
      currentClueGiver: gameState.currentClueGiver,
      phase: gameState.phase,
      clueCount: gameState.clueCount,
      playersWhoGuessed: gameState.playersWhoGuessed,
    });

    socket.emit('game-state-synced', gameState);
  });

  // Handle join-room event
  socket.on('join-room', (data: { roomId: string; playerName: string; playerAvatar?: string }) => {
    const { roomId, playerName, playerAvatar = '🎮' } = data;
    const room = getRoom(roomId);

    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    updateRoomActivity(roomId);  // Update last activity

    // Check if a player with this name and avatar already exists in the room (reconnection case)
    const existingPlayer = room.players.find((p) => p.name === playerName && p.avatar === playerAvatar);

    if (existingPlayer) {
      const previousSocketId = existingPlayer.id;

      // IMPORTANT: Only allow reconnection if the old socket is still disconnected
      // If the old socket is still active/connected, reject this as a duplicate name attempt
      if (previousSocketId !== socket.id && io.sockets.sockets.get(previousSocketId)) {
        socket.emit('error', { message: `Player name "${playerName}" is already in use in this room. Please choose a different name.` });
        console.log(`[join-room] Duplicate name+avatar rejected (player still connected): ${playerName} in room ${roomId}`);
        return;
      }

      // This is a reconnection case - same name+avatar means the same player is reconnecting
      // Allow the reconnection by updating their socket ID
      console.log(`[rejoin] Player ${playerName} reconnecting. Old socket: ${previousSocketId}, New socket: ${socket.id}`);

      const playerKey = `${playerName}:${playerAvatar}`;

      // Reconnection case: update the socket ID and rejoin
      existingPlayer.id = socket.id;  // Update socket ID
      existingPlayer.isConnected = true;

      // Cancel any pending removal for this player
      const pendingTimeout = reconnectTimeouts.get(playerKey);
      if (pendingTimeout) {
        clearTimeout(pendingTimeout);
        reconnectTimeouts.delete(playerKey);
      }

      // If this player is the current speaker, update the room's reference
      if (room.currentClueGiver === previousSocketId) {
        room.currentClueGiver = socket.id;
      }

      // Update any tracking sets that store player socket IDs
      const playersWhoGuessed = roomPlayersWhoGuessed.get(roomId);
      if (playersWhoGuessed && playersWhoGuessed.has(previousSocketId)) {
        playersWhoGuessed.delete(previousSocketId);
        playersWhoGuessed.add(socket.id);
        roomPlayersWhoGuessed.set(roomId, playersWhoGuessed);
      }

      socketToRoom.delete(previousSocketId);
      socketToRoom.set(socket.id, roomId);
      playerSessionData.set(playerKey, { name: playerName, avatar: playerAvatar, roomId });

      socket.join(roomId);
      socket.emit('room-joined', { roomId, room });
      io.to(roomId).emit('room-updated', room);

      // Provide full game state snapshot to the reconnecting client
      socket.emit('game-state-synced', {
        room,
        roundNumber: roomRounds.get(roomId) || 1,
        currentClueGiver: room.currentClueGiver,
        phase: roomCluePhase.get(roomId) || 'speaker',
        clueCount: roomClueCount.get(roomId) || 0,
        playersWhoGuessed: Array.from(roomPlayersWhoGuessed.get(roomId) || new Set()),
        timestamp: Date.now(),
      });

      if (room.currentClueGiver === socket.id && room.currentCard) {
        io.to(socket.id).emit('card-assigned', { card: room.currentCard });
      }

      console.log(`Player ${playerName} reconnected to room: ${roomId}`);
      return;
    }

    // NEW: Check if another player with the same name already exists in the room
    const duplicateName = room.players.find((p) => p.name.toLowerCase() === playerName.toLowerCase());
    if (duplicateName) {
      socket.emit('error', { message: `Player name "${playerName}" is already taken in this room. Please choose a different name.` });
      console.log(`[join-room] Duplicate name rejected: ${playerName} in room ${roomId}`);
      return;
    }

    // New player joining
    const player = createPlayer(socket.id, playerName, playerAvatar);
    const added = addPlayerToRoom(room, player);

    if (!added) {
      socket.emit('error', { message: 'Failed to add player to room' });
      return;
    }

    // Store socket-to-room mapping and player session data
    socketToRoom.set(socket.id, roomId);
    const playerKey = `${playerName}:${playerAvatar}`;
    playerSessionData.set(playerKey, { name: playerName, avatar: playerAvatar, roomId });

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

    updateRoomActivity(roomId);  // Update last activity

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

  socket.on('update-round-settings', (data: { roomId: string; maxRounds: number }) => {
    const { roomId, maxRounds } = data;
    const room = getRoom(roomId);

    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    const hostId = room.players[0]?.id;
    if (socket.id !== hostId) {
      socket.emit('error', { message: 'Only the host can change round settings' });
      return;
    }

    if (room.gameStarted) {
      socket.emit('error', { message: 'Cannot change rounds during an active game' });
      return;
    }

    const sanitizedRounds = Math.max(MIN_ROUNDS, Math.min(MAX_ROUNDS_LIMIT, Math.round(maxRounds)));
    room.maxRounds = sanitizedRounds;
    roomRounds.set(roomId, 1);

    io.to(roomId).emit('room-updated', room);
    socket.emit('round-settings-updated', { roomId, maxRounds: sanitizedRounds });

    console.log(`[round-settings] Room ${roomId} max rounds set to ${sanitizedRounds}`);
  });

  // Event: Create Custom Card
  socket.on('create-custom-card', async (data: {
    roomId: string;
    mainWord: string;
    forbiddenWords: string[]
  }) => {
    const { roomId, mainWord, forbiddenWords } = data;
    console.log(`[create-custom-card] Room ${roomId} creating card: ${mainWord}`);

    try {
      // 1. Fetch Translations (Auto-detect and translate to EN, HI, KN)
      console.log(`  - Translating ${mainWord}...`);
      const mainTrans = await translateWord(mainWord);

      const forbiddenTransStart = Date.now();
      const forbiddenTrans = await Promise.all(
        forbiddenWords.map(w => translateWord(w))
      );
      console.log(`  - Translations done in ${Date.now() - forbiddenTransStart}ms`);

      // 2. Fetch Images (Use English translation for better results)
      console.log(`  - Fetching images using "${mainTrans.en}"...`);
      const mainImage = await fetchImageForWord(mainTrans.en);

      const forbiddenImagesStart = Date.now();
      const forbiddenImages = [];
      for (const t of forbiddenTrans) {
        const img = await fetchImageForWord(t.en);
        forbiddenImages.push(img || "");
        // tiny delay to be nice to API
        await new Promise(r => setTimeout(r, 200));
      }
      console.log(`  - Images done in ${Date.now() - forbiddenImagesStart}ms`);

      // 3. Insert into Supabase
      const { data: newCard, error } = await supabase
        .from('cards')
        .insert({
          main_word: mainTrans.en,
          forbidden_words: forbiddenTrans.map(t => t.en),
          main_word_hi: mainTrans.hi,
          forbidden_words_hi: forbiddenTrans.map(t => t.hi),
          main_word_kn: mainTrans.kn,
          forbidden_words_kn: forbiddenTrans.map(t => t.kn),
          image_url: mainImage,
          forbidden_word_image_urls: forbiddenImages
        })
        .select()
        .single();

      if (error) {
        console.error('Supabase insert error:', error);
        socket.emit('error', { message: 'Failed to create card database entry.' });
        return;
      }

      console.log(`[create-custom-card] Success! Card ID: ${newCard.id}`);

      // 4. Notify Client
      socket.emit('custom-card-created', { success: true, card: newCard });

    } catch (err) {
      console.error('Error creating custom card:', err);
      socket.emit('error', { message: 'Failed to create custom card.' });
    }
  });

  // Handle request for a random card (Groq or DB)
  socket.on('request-random-card', async (data: { useGemini: boolean }) => {
    let cardData: { mainWord: string; forbiddenWords: string[] } | null = null;

    if (data.useGemini && groq) {
      try {
        console.log('[request-random-card] Using Groq to generate card...');
        const completion = await groq.chat.completions.create({
          messages: [
            {
              role: "system",
              content: "You are a helpful assistant that generates Taboo game cards in JSON format."
            },
            {
              role: "user",
              content: `Generate a random interesting concept/word for a party game like Taboo.
            The word should be in English.
            Also generate 5 forbidden words (in English) that are commonly associated with it.
            Return ONLY a valid JSON object with keys "mainWord" and "forbiddenWords". 
            Example: {"mainWord": "Beach", "forbiddenWords": ["Sand", "Ocean", "Sun", "Vacation", "Swim"]}. 
            Do not include markdown formatting or backticks.`
            }
          ],
          model: "llama-3.3-70b-versatile", // Use a fast and capable model
          response_format: { type: "json_object" }
        });

        const text = completion.choices[0]?.message?.content;
        if (text) {
          const json = JSON.parse(text);
          if (json.mainWord && json.forbiddenWords) {
            cardData = {
              mainWord: json.mainWord,
              forbiddenWords: json.forbiddenWords
            };
          }
        }
      } catch (err: any) {
        console.warn(`[request-random-card] Groq failed: ${err.message}. Moving to DB fallback.`);
      }
    }

    // If AI failed, was skipped, or didn't return valid data, use DB fallback
    if (!cardData) {
      try {
        console.log('[request-random-card] Fetching from DB...');
        const card = await getRandomCard();
        cardData = {
          mainWord: card.mainWord,
          forbiddenWords: card.forbiddenWords
        };
      } catch (err) {
        console.error('[request-random-card] DB Fallback failed:', err);
        socket.emit('error', { message: 'Failed to get random card data from AI or Database.' });
        return;
      }
    }

    // Send whatever we got (AI or DB)
    if (cardData) {
      socket.emit('random-card-data', cardData);
    }
  });

  // Handle start-game event
  socket.on('start-game', async (data: string | { roomId: string; language?: 'en' | 'hi' }) => {
    // Handle both old format (just roomId string) and new format (object with language)
    let roomId = '';
    let language: 'en' | 'hi' = 'en';

    if (typeof data === 'string') {
      roomId = data;
    } else {
      roomId = data.roomId;
      language = data.language || 'en';
    }

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
    console.log(`[socket] start-game requested for room ${roomId} with language ${language}`);
    const started = await startGame(room, language);

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
      phase: roomCluePhase.get(roomId), // NEW: Send the current phase
      language: language, // NEW: Send the language
    });

    // Emit card-assigned only to the current speaker
    if (room.currentClueGiver && room.currentCard) {
      console.log(`[socket] Emitting card-assigned to speaker ${room.currentClueGiver}`);
      io.to(room.currentClueGiver).emit('card-assigned', {
        card: room.currentCard,
      });
    }

    console.log(`Game started in room ${roomId}, Speaker: ${room.currentClueGiver}, Language: ${language}`);
  });

  // Handle speaker-transcript event
  socket.on('speaker-transcript', async (data: { roomId: string; transcript: string }) => {
    const { roomId, transcript } = data;
    console.log(`📤 speaker-transcript received: roomId=${roomId}, speaker=${socket.id}, transcript="${transcript}"`);
    const room = getRoom(roomId);

    if (!room) {
      console.log(`❌ Room not found: ${roomId}`);
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    // Verify that the sender is the current clue giver
    if (room.currentClueGiver !== socket.id) {
      console.log(`❌ Not the speaker. Expected: ${room.currentClueGiver}, Got: ${socket.id}`);
      socket.emit('error', { message: 'Only the current speaker can give clues' });
      return;
    }

    // Check if there's a current card
    if (!room.currentCard) {
      console.log(`❌ No card is currently active`);
      socket.emit('error', { message: 'No card is currently active' });
      return;
    }

    // Check clue limit (max 10 clues per round)
    const currentClueCount = roomClueCount.get(roomId) || 0;
    if (currentClueCount >= 10) {
      console.log(`❌ Maximum clues reached: ${currentClueCount}`);
      socket.emit('error', { message: 'Maximum clues reached (10 clues per round)' });
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

    // Check for forbidden words (language-aware)
    const mainWord = getCardWord(room.currentCard, room.language);
    const forbiddenWords = getCardForbiddenWords(room.currentCard, room.language);
    const violations = await checkForbidden(transcript, [mainWord, ...forbiddenWords], mainWord);

    if (violations.length > 0) {
      // Remove the clue from the set since it was invalid (allow retry)
      cluesSet.delete(normalizedClue);

      // Apply -5 penalty to the speaker
      const speaker = room.players.find((p) => p.id === socket.id);
      if (speaker) {
        speaker.score -= 5;

        // Send forbidden word detection ONLY to the speaker
        // Tell them the clue contains forbidden words and they need to try again
        socket.emit('forbidden-detected', {
          playerId: socket.id,
          playerName: speaker.name,
          violations,
          penalty: -5,
          message: `Your clue contains forbidden word(s): ${violations.join(', ')}. Try again! You lose 5 points.`,
        });

        // Broadcast score update to show penalty
        io.to(roomId).emit('score-updated', {
          playerId: socket.id,
          newScore: speaker.score,
          room,
        });

        console.log(`Forbidden words detected in room ${roomId}: ${violations.join(', ')}. Clue rejected: "${transcript}"`);
      }
      // DO NOT broadcast the clue - the speaker must try again
      return;
    } else {
      // Valid clue - increment clue count
      const currentClueCount = (roomClueCount.get(roomId) || 0) + 1;
      roomClueCount.set(roomId, currentClueCount);

      // NEW: Switch to guessing phase and reset who has guessed
      roomCluePhase.set(roomId, 'guessing');
      roomPlayersWhoGuessed.set(roomId, new Set());

      // Broadcast the valid clue to all players
      io.to(roomId).emit('clue-broadcast', {
        transcript,
        clueCount: currentClueCount,
        speakerId: socket.id,
        phase: 'guessing', // Notify all that guessing phase has started
      });

      console.log(`Valid clue in room ${roomId}: "${transcript}" (clue #${currentClueCount}). Now in GUESSING phase.`);
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

    // NEW: Check if it's the guessing phase
    const currentPhase = roomCluePhase.get(roomId);
    if (currentPhase !== 'guessing') {
      socket.emit('error', { message: 'It is not the guessing phase yet. Wait for the speaker to give a clue.' });
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

    // NEW: Check if this player has already guessed this clue
    const playersWhoGuessed = roomPlayersWhoGuessed.get(roomId) || new Set();
    if (playersWhoGuessed.has(socket.id)) {
      socket.emit('error', { message: 'You have already made your guess for this clue. Waiting for other players...' });
      return;
    }

    // Find the guesser
    const guesser = room.players.find((p) => p.id === socket.id);
    if (!guesser) {
      socket.emit('error', { message: 'Player not found in room' });
      return;
    }

    // Enforce guess limit before processing
    const maxGuesses = 10; // Maximum guesses per player per round
    const currentGuesses = guesser.guessesUsed || 0;
    if (currentGuesses >= maxGuesses) {
      socket.emit('error', { message: 'Maximum guesses reached (10 per round)' });
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

    // NEW: Mark this player as having guessed
    playersWhoGuessed.add(socket.id);
    roomPlayersWhoGuessed.set(roomId, playersWhoGuessed);

    // Check if guess matches target word using fuzzy matching
    // This handles spelling variations, phonetic similarities, typos, and for Kannada uses Gemini AI
    const targetWord = getCardWord(room.currentCard, room.language);
    const forbiddenWords = getCardForbiddenWords(room.currentCard, room.language);
    const matchResult = await isMatchingGuess(guess, targetWord, forbiddenWords);

    if (matchResult.isForbidden) {
      // Illegal guess! The player said a forbidden word.
      // Reset guess count since it was illegal (or keep it as a penalty?)
      // The user wants a "strict validation check" and reject as "Illegal Guess".
      // Let's add a penalty or just inform them.
      socket.emit('illegal-guess', {
        message: `Illegal Guess! You mentioned a forbidden word similar to: ${matchResult.reason}`,
        guess
      });

      console.log(`Illegal Guess in room ${roomId}: "${guess}" by ${guesser.name} (Forbidden word violation)`);

      // Still mark as having guessed for this clue (to prevent spamming until next clue)
      return;
    }

    if (matchResult.isMatch) {
      // Correct guess!
      const clueCount = roomClueCount.get(roomId) || 0;
      const points = computePoints(clueCount);
      const activeCard = room.currentCard;
      // Note: targetWord is already set above to language-specific word
      const oldSpeakerId = room.currentClueGiver;

      let roundOutcome = {
        speakerBonus: 0,
        guesserBonus: 0,
        gameOver: false,
        finishedRound: roomRounds.get(roomId) || 1,
        nextSpeakerId: null as string | null,
      };

      if (room.currentClueGiver) {
        roundOutcome = endRound(room, room.currentClueGiver, socket.id);
      }

      const continueGame = !roundOutcome.gameOver;
      if (continueGame) {
        const nextCard = await drawNextCard(room);
        room.currentCard = nextCard;
        console.log(`[socket] Drew next card for new speaker ${roundOutcome.nextSpeakerId}: ${nextCard?.id || 'null'}`);
      } else {
        room.currentCard = null;
        roomCluePhase.delete(roomId);
        roomPlayersWhoGuessed.delete(roomId);
      }

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
        bonuses: { speakerBonus: roundOutcome.speakerBonus, guesserBonus: roundOutcome.guesserBonus },
        room,
        roundNumber: roundOutcome.finishedRound,
        nextRoundNumber: continueGame ? (roomRounds.get(room.id) || null) : null,
      });

      if (continueGame) {
        // Reset turn-based flow for new round
        roomCluePhase.set(roomId, 'speaker');
        roomPlayersWhoGuessed.set(roomId, new Set());
      }

      // Emit final score-updated event
      io.to(roomId).emit('score-updated', {
        room,
      });

      if (continueGame && roundOutcome.nextSpeakerId && room.currentCard) {
        console.log(`[socket] Emitting card-assigned to new speaker ${roundOutcome.nextSpeakerId} with card ${room.currentCard.id}`);
        io.to(roundOutcome.nextSpeakerId).emit('card-assigned', {
          card: room.currentCard,
        });
      } else if (!continueGame) {
        const leaderboard = [...room.players].sort((a, b) => b.score - a.score);
        io.to(roomId).emit('game-ended', {
          roomId,
          room,
          leaderboard,
          totalRounds: room.maxRounds,
          reason: 'max_rounds_reached',
          finishedRound: roundOutcome.finishedRound,
        });
      } else {
        console.warn(`[socket] Could not emit card-assigned: speakerId=${roundOutcome.nextSpeakerId}, card=${room.currentCard?.id}`);
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

      // NEW: Check if all non-speaker players have guessed
      const nonSpeakerPlayers = room.players.filter((p) => p.id !== room.currentClueGiver);
      const allPlayersGuessed = nonSpeakerPlayers.every((p) => playersWhoGuessed.has(p.id));

      if (allPlayersGuessed) {
        console.log(`[socket] All players have guessed in room ${roomId}. Switching back to SPEAKER phase.`);
        // Switch back to speaker phase so they can give next clue
        roomCluePhase.set(roomId, 'speaker');
        roomPlayersWhoGuessed.set(roomId, new Set()); // Reset for next clue

        // Notify all players that it's back to speaker phase
        io.to(roomId).emit('phase-changed', {
          phase: 'speaker',
          message: 'All players have guessed! Waiting for the next clue...',
        });
      }

      // Check if all guessers have exhausted their guesses
      const allGuessersExhausted = room.players
        .filter((p) => p.id !== room.currentClueGiver) // Exclude the speaker
        .every((p) => (p.guessesUsed || 0) >= maxGuesses);

      if (allGuessersExhausted) {
        console.log(`[socket] All guessers exhausted in room ${roomId}. Auto-advancing round...`);

        const previousCard = room.currentCard;
        const oldSpeakerId = room.currentClueGiver;
        const roundOutcome = endRound(room, room.currentClueGiver!, socket.id);
        const continueGame = !roundOutcome.gameOver;

        if (continueGame) {
          const nextCard = await drawNextCard(room);
          room.currentCard = nextCard;
          roomCluePhase.set(roomId, 'speaker');
          roomPlayersWhoGuessed.set(roomId, new Set());
        } else {
          room.currentCard = null;
          roomCluePhase.delete(roomId);
          roomPlayersWhoGuessed.delete(roomId);
        }

        io.to(roomId).emit('round-ended', {
          success: false,
          reason: 'All guesses exhausted',
          targetWord: previousCard?.mainWord,
          speakerId: oldSpeakerId,
          room,
          roundNumber: roundOutcome.finishedRound,
          nextRoundNumber: continueGame ? (roomRounds.get(room.id) || null) : null,
        });

        io.to(roomId).emit('score-updated', {
          room,
        });

        if (continueGame && roundOutcome.nextSpeakerId && room.currentCard) {
          console.log(`[socket] Auto-advance: Emitting card to new speaker ${roundOutcome.nextSpeakerId}`);
          io.to(roundOutcome.nextSpeakerId).emit('card-assigned', {
            card: room.currentCard,
          });
        } else if (!continueGame) {
          const leaderboard = [...room.players].sort((a, b) => b.score - a.score);
          io.to(roomId).emit('game-ended', {
            roomId,
            room,
            leaderboard,
            totalRounds: room.maxRounds,
            reason: 'max_rounds_reached',
            finishedRound: roundOutcome.finishedRound,
          });
        }
      }
    }
  });

  // NEW: Handle reset-for-next-game event - reset room state and notify all players
  socket.on('reset-for-next-game', (data: { roomId: string }) => {
    const { roomId } = data;
    const room = getRoom(roomId);

    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    console.log(`[reset-for-next-game] Resetting room ${roomId} for next game`);

    // Reset game state
    room.gameStarted = false;
    room.roundInProgress = false;
    room.currentCard = null;
    room.currentClueGiver = null;

    // Clear all round tracking data
    roomRounds.delete(roomId);
    roomClueCount.delete(roomId);
    roomCluesGiven.delete(roomId);
    roomGuessesGiven.delete(roomId);
    roomCluePhase.delete(roomId);
    roomPlayersWhoGuessed.delete(roomId);

    // Reset player scores and state
    room.players.forEach((p) => {
      p.score = 0;
      p.guessesUsed = 0;
      p.isReady = false;
    });

    // Update activity timestamp
    updateRoomActivity(roomId);

    // Broadcast reset event to all players in the room
    io.to(roomId).emit('reset-for-next-game', { roomId });
    io.to(roomId).emit('room-updated', room);

    console.log(`[reset-for-next-game] Room ${roomId} reset complete. Players notified.`);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);

    const roomId = socketToRoom.get(socket.id);
    socketToRoom.delete(socket.id);

    const room = roomId ? getRoom(roomId) : getRoomBySocketId(socket.id);
    if (!room || !roomId) {
      return;
    }

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) {
      return;
    }

    player.isConnected = false;

    const playerKey = `${player.name}:${player.avatar}`;

    const timeout = setTimeout(() => {
      const activeRoom = getRoom(roomId);
      if (!activeRoom) {
        reconnectTimeouts.delete(playerKey);
        return;
      }

      const targetIndex = activeRoom.players.findIndex((p) => p.name === player.name && p.avatar === player.avatar);
      if (targetIndex === -1) {
        reconnectTimeouts.delete(playerKey);
        return;
      }

      const targetPlayer = activeRoom.players[targetIndex];
      if (targetPlayer.isConnected) {
        reconnectTimeouts.delete(playerKey);
        return;
      }

      const removedId = targetPlayer.id;
      const removed = removePlayerFromRoom(activeRoom, removedId);

      if (removed) {
        if (activeRoom.players.length === 0) {
          rooms.delete(roomId);
          roomDecks.delete(roomId);
          roomRounds.delete(roomId);
          roomClueCount.delete(roomId);
          roomCluesGiven.delete(roomId);
          roomGuessesGiven.delete(roomId);
          roomCluePhase.delete(roomId);
          roomPlayersWhoGuessed.delete(roomId);
          roomActivity.delete(roomId);
          console.log(`Room ${roomId} deleted after grace period (empty)`);
        } else {
          io.to(roomId).emit('room-updated', activeRoom);
          console.log(`Player ${player.name} removed from room ${roomId} after grace period`);
        }
      }

      reconnectTimeouts.delete(playerKey);
    }, RECONNECT_GRACE_PERIOD);

    reconnectTimeouts.set(playerKey, timeout);

    io.to(roomId).emit('room-updated', room);
    console.log(`[disconnect] Player ${player.name} temporarily disconnected from room ${roomId}. Waiting for reconnection up to ${RECONNECT_GRACE_PERIOD / 1000}s`);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);

  // Start cleanup interval for expired rooms
  setInterval(() => {
    cleanupExpiredRooms();
  }, CLEANUP_INTERVAL);

  console.log(`Room cleanup scheduled every ${CLEANUP_INTERVAL / 1000 / 60} minutes (timeout: ${ROOM_TIMEOUT / 1000 / 60} minutes)`);

  warmCardCache();
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
