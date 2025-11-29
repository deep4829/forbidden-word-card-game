import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { Room, Player, Card } from './types/game';
import { loadAndShuffleDeck } from './data/deck';
import { checkForbidden, normalize } from './utils/forbiddenCheck';
import { computePoints } from './utils/scoring';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
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

// Helper function to create a new player
function createPlayer(socketId: string, name: string): Player {
  return {
    id: socketId,
    name,
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
function startGame(room: Room): boolean {
  // Validate room size (must have 4 players)
  if (room.players.length !== 4) {
    return false;
  }
  
  // Initialize game state
  room.gameStarted = true;
  room.roundInProgress = false;
  roomRounds.set(room.id, 1);
  roomClueCount.set(room.id, 0);
  
  // Assign first speaker (first player in the list)
  room.currentClueGiver = room.players[0].id;
  
  // Load and shuffle deck for this room
  const deck = loadAndShuffleDeck();
  roomDecks.set(room.id, deck);
  
  // Draw first card
  const firstCard = drawNextCard(room);
  room.currentCard = firstCard;
  
  return true;
}

// Helper function to draw next card
function drawNextCard(room: Room): Card | null {
  const deck = roomDecks.get(room.id);
  if (!deck || deck.length === 0) {
    return null;
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
  socket.on('create-room', (playerName: string) => {
    const roomId = uuidv4();
    const player = createPlayer(socket.id, playerName);
    const room = createRoom(roomId, player);
    
    rooms.set(roomId, room);
    socket.join(roomId);
    
    socket.emit('room-created', { roomId, room });
    io.to(roomId).emit('room-updated', room);
    
    console.log(`Room created: ${roomId} by ${playerName}`);
  });

  // Handle join-room event
  socket.on('join-room', (data: { roomId: string; playerName: string }) => {
    const { roomId, playerName } = data;
    const room = getRoom(roomId);
    
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    // Add player to room using helper function
    const player = createPlayer(socket.id, playerName);
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

  // Handle start-game event
  socket.on('start-game', (roomId: string) => {
    const room = getRoom(roomId);
    
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    // Validate room size (must have exactly 4 players)
    if (room.players.length !== 4) {
      socket.emit('error', { message: 'Game requires exactly 4 players to start' });
      return;
    }
    
    // Start the game
    const started = startGame(room);
    
    if (!started) {
      socket.emit('error', { message: 'Failed to start game' });
      return;
    }
    
    // Emit game-started to all players in the room
    io.to(roomId).emit('game-started', {
      room,
      roundNumber: roomRounds.get(roomId),
      currentClueGiver: room.currentClueGiver,
    });
    
    // Emit card-assigned only to the current speaker
    if (room.currentClueGiver && room.currentCard) {
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
  socket.on('guesser-guess', (data: { roomId: string; guess: string }) => {
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
    
    // Update guesses used
    guesser.guessesUsed = (guesser.guessesUsed || 0) + 1;
    
    // Normalize both the guess and the target word
    const normalizedGuess = normalize(guess);
    const normalizedTarget = normalize(room.currentCard.mainWord);
    
    // Check if guess is correct
    if (normalizedGuess === normalizedTarget) {
      // Correct guess!
      const clueCount = roomClueCount.get(roomId) || 0;
      const points = computePoints(clueCount);
      const targetWord = room.currentCard.mainWord;
      
      // Award points using endRound helper
      let bonuses = { speakerBonus: 0, guesserBonus: 0 };
      if (room.currentClueGiver) {
        bonuses = endRound(room, room.currentClueGiver, socket.id);
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
        speakerId: room.currentClueGiver,
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
      
      console.log(`Correct guess in room ${roomId}: "${guess}" by ${guesser.name}`);
    } else {
      // Incorrect guess
      const maxGuesses = 3; // Maximum guesses per player per round
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
