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
let cachedCards: Card[] | null = null;
let cacheExpiresAt = 0;

const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const cacheTtlMs = Number(process.env.CARD_CACHE_TTL_MS || DEFAULT_CACHE_TTL_MS);

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
 * @param language - The language for cards ('en' or 'hi')
 * @returns Array of cards from the database
 */
export async function fetchAllCards(language: 'en' | 'hi' | 'kn' = 'en'): Promise<Card[]> {
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

    // Transform database format to Card format - keep English, Hindi and Kannada versions
    return data.map((card: any) => {
      return {
        id: card.id,
        mainWord: card.main_word,
        forbiddenWords: card.forbidden_words || [],
        mainWordHi: card.main_word_hi,
        forbiddenWordsHi: card.forbidden_words_hi,
        mainWordKn: card.main_word_kn,
        forbiddenWordsKn: card.forbidden_words_kn,
        language: language,
        imageUrl: card.image_url,
        forbiddenWordImageUrls: card.forbidden_word_image_urls,
      };
    });
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
 * @param language - The language for cards ('en' or 'hi')
 * @returns Shuffled array of cards
 */
export async function loadAndShuffleDeck(language: 'en' | 'hi' | 'kn' = 'en'): Promise<Card[]> {
  const now = Date.now();
  const cacheKey = `cards_${language}`;

  if (!cachedCards || now >= cacheExpiresAt) {
    const cards = await fetchAllCards(language);
    cachedCards = cards;
    cacheExpiresAt = now + cacheTtlMs;
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[supabase] Refreshed ${language} card cache with ${cards.length} cards (TTL ${cacheTtlMs}ms)`);
    }
  }

  const cards = cachedCards;
  return shuffleArray(cards);
}

/**
 * Fetches a single random card from Supabase
 * @returns A random card
 */
export async function getRandomCard(): Promise<Card> {
  const cards = await loadAndShuffleDeck();
  if (cards.length === 0) {
    throw new Error('No cards available in Supabase');
  }
  return cards[Math.floor(Math.random() * cards.length)];
}

/**
 * Fetches multiple random cards from Supabase
 * @param count - Number of cards to fetch
 * @returns Array of random cards
 */
export async function getRandomCards(count: number): Promise<Card[]> {
  const shuffled = await loadAndShuffleDeck();
  if (shuffled.length === 0) {
    throw new Error('No cards available in Supabase');
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function clearCardCache() {
  cachedCards = null;
  cacheExpiresAt = 0;
}

export async function warmCardCache(): Promise<void> {
  try {
    await loadAndShuffleDeck();
  } catch (error) {
    console.warn('[supabase] Failed to warm card cache:', error);
  }
}
