import * as fs from 'fs';
import * as path from 'path';

/**
 * Represents a forbidden word card in the game
 */
export interface Card {
  id: string;
  mainWord: string;
  forbiddenWords: string[];
}

/**
 * Shuffles an array using Fisher-Yates algorithm
 * @param array - The array to shuffle
 * @returns The shuffled array
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Loads cards from JSON file and returns a shuffled deck
 * @returns Shuffled array of Card objects
 */
export function loadAndShuffleDeck(): Card[] {
  const cardsPath = path.join(__dirname, 'cards.json');
  const cardsData = fs.readFileSync(cardsPath, 'utf-8');
  const cards: Card[] = JSON.parse(cardsData);
  return shuffleArray(cards);
}
