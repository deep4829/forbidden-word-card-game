/**
 * Represents a forbidden word card in the game
 */
export interface Card {
  id: string;
  mainWord: string;
  forbiddenWords: string[];
}

/**
 * Represents a player in the game room
 */
export interface Player {
  id: string;
  name: string;
  isReady: boolean;
  team: 'A' | 'B' | null;
  score: number;
}

/**
 * Represents a game room
 */
export interface Room {
  id: string;
  players: Player[];
  currentClueGiver: string | null;
  currentCard: Card | null;
  teamAScore: number;
  teamBScore: number;
  gameStarted: boolean;
  roundInProgress: boolean;
}
