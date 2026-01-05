/**
 * Represents a forbidden word card in the game
 */
export interface Card {
  id: string;
  mainWord: string;
  forbiddenWords: string[];
  mainWordHi?: string;
  forbiddenWordsHi?: string[];
  language?: 'en' | 'hi' | 'kn';
}

/**
 * Represents a player in the game room
 */
export interface Player {
  id: string;
  name: string;
  avatar: string;
  isReady: boolean;
  score: number;
  guessesUsed?: number;
  isConnected?: boolean;
}

/**
 * Represents a game room
 */
export interface Room {
  id: string;
  players: Player[];
  currentClueGiver: string | null;
  currentCard: Card | null;
  gameStarted: boolean;
  roundInProgress: boolean;
  maxRounds: number;
  language?: 'en' | 'hi' | 'kn';
}
