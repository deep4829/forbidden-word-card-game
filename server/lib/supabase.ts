import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import type { Card } from '../types/game';

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Initialize Supabase client - lazy loading
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabaseClient: ReturnType<typeof createClient> | null = null;

function initSupabase() {
  if (supabaseClient) {
    return supabaseClient;
  }

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing Supabase credentials. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env.local\n' +
      'Example:\n' +
      '  SUPABASE_URL=https://your-project.supabase.co\n' +
      '  SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...\n' +
      '\nSee SUPABASE_SETUP.md for instructions'
    );
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey);
  return supabaseClient;
}

export function getSupabaseClient() {
  return initSupabase();
}

export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get: (target, prop) => {
    return (initSupabase() as any)[prop];
  },
});

/**
 * Fetches all cards from Supabase
 * @returns Array of cards from the database
 */
export async function fetchAllCards(): Promise<Card[]> {
  try {
    const { data, error } = await supabase
      .from('cards')
      .select('*');

    if (error) {
      console.error('Supabase error fetching cards:', error);
      throw new Error(`Failed to fetch cards: ${error.message}`);
    }

    if (!data) {
      console.warn('No cards found in Supabase');
      return [];
    }

    // Transform database format to Card format
    return data.map((card: any) => ({
      id: card.id,
      mainWord: card.main_word,
      forbiddenWords: card.forbidden_words || [],
    }));
  } catch (error) {
    console.error('Error fetching cards from Supabase:', error);
    throw error;
  }
}

/**
 * Shuffles an array using Fisher-Yates algorithm
 * @param array - The array to shuffle
 * @returns The shuffled array
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Fetches and shuffles cards from Supabase
 * @returns Shuffled array of cards
 */
export async function loadAndShuffleDeck(): Promise<Card[]> {
  const cards = await fetchAllCards();
  return shuffleArray(cards);
}

/**
 * Fetches a single random card from Supabase
 * @returns A random card
 */
export async function getRandomCard(): Promise<Card> {
  const cards = await fetchAllCards();
  if (cards.length === 0) {
    throw new Error('No cards available in Supabase');
  }
  const randomIndex = Math.floor(Math.random() * cards.length);
  return cards[randomIndex];
}

/**
 * Fetches multiple random cards from Supabase
 * @param count - Number of cards to fetch
 * @returns Array of random cards
 */
export async function getRandomCards(count: number): Promise<Card[]> {
  const cards = await fetchAllCards();
  if (cards.length === 0) {
    throw new Error('No cards available in Supabase');
  }
  const shuffled = shuffleArray(cards);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
