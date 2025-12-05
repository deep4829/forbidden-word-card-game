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
import { checkForbidden, normalize } from './utils/forbiddenCheck';
import { computePoints } from './utils/scoring';
import { isMatchingGuess } from './utils/compareWords';

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

// Helper function to remove player from room

// Helper function to start game
async function startGame(room: Room): Promise<boolean> {
  // Validate room size (must have at least 2 players)
  if (room.players.length < 2) {
    return false;
  }

  // Ensure max rounds is within supported range
  const sanitizedMaxRounds = Math.max(MIN_ROUNDS, Math.min(MAX_ROUNDS_LIMIT, room.maxRounds ?? DEFAULT_MAX_ROUNDS));
  room.maxRounds = sanitizedMaxRounds;

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
      const playerKey = `${playerName}:${playerAvatar}`;

      // Reconnection case: update the socket ID and rejoin
      console.log(`[rejoin] Player ${playerName} reconnecting. Old socket: ${previousSocketId}, New socket: ${socket.id}`);
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
      phase: roomCluePhase.get(roomId), // NEW: Send the current phase
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

    // Check for forbidden words
    const violations = checkForbidden(transcript, [
      room.currentCard.mainWord,
      ...room.currentCard.forbiddenWords,
    ]);

    if (violations.length > 0) {
      // Remove the clue from the set since it was invalid (allow retry)
      cluesSet.delete(normalizedClue);
      
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
    // This handles spelling variations, phonetic similarities, and typos
    if (isMatchingGuess(guess, room.currentCard.mainWord)) {
      // Correct guess!
      const clueCount = roomClueCount.get(roomId) || 0;
      const points = computePoints(clueCount);
      const activeCard = room.currentCard;
      const targetWord = activeCard.mainWord;
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
