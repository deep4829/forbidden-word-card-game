/**
 * Main word comparison utility with multi-layered matching strategy
 * Uses local algorithms for English/Hindi, and Gemini API for Kannada
 */

import { normalize } from './textUtils';
import {
  isStringSimilar,
  isPhoneticMatch,
  isSoundexMatch,
  isCloseTypo
} from './localMatching';
import { checkKannadaMatch, checkKannadaSimilarity } from './kannadaMatcher';

/**
 * Configuration for word matching
 */
export const MATCHING_CONFIG = {
  enableExactMatch: true,
  enableStringSimilarity: true,
  enablePhoneticMatch: true,
  enableTypoTolerance: true,
  logMatchDetails: true,
};

/**
 * Result of a word comparison
 */
export interface MatchResult {
  isMatch: boolean;
  isForbidden: boolean;
  reason: string;
  score: number;
}

/**
 * Main function to check if a guess matches the target word
 * Uses multiple algorithms in order of speed (fastest first)
 * For Kannada: uses Gemini API for semantic understanding
 * 
 * @param guess - The player's guess
 * @param target - The target word from the card
 * @param forbiddenWords - Optional list of forbidden words (for Kannada matching)
 * @returns MatchResult indicating match success and forbidden violations
 */
export async function isMatchingGuess(
  guess: string,
  target: string,
  forbiddenWords: string[] = []
): Promise<MatchResult> {
  const startTime = Date.now();

  if (MATCHING_CONFIG.logMatchDetails) {
    console.log(`\n🔍 ===== WORD COMPARISON =====`);
    console.log(`   Guess:  "${guess}"`);
    console.log(`   Target: "${target}"`);
  }

  // Check if this is Kannada text (Kannada Unicode range: U+0C80 to U+0CFF)
  const kannadaRegex = /[\u0C80-\u0CFF]/;
  const isKannada = kannadaRegex.test(guess) || kannadaRegex.test(target);

  // Layer 0: Kannada matching with Gemini API (uses semantic understanding)
  if (isKannada && process.env.GEMINI_API_KEY) {
    try {
      const match = await checkKannadaSimilarity(guess, target, forbiddenWords);
      if (match.violatesForbidden) {
        return { isMatch: false, isForbidden: true, reason: 'AI detected forbidden word', score: 0 };
      }
      if (match.isSimilar) {
        if (MATCHING_CONFIG.logMatchDetails) {
          console.log(`   ✅ KANNADA GEMINI MATCH`);
          console.log(`   Time: ${Date.now() - startTime}ms`);
          console.log(`=============================\n`);
        }
        return { isMatch: true, isForbidden: false, reason: match.reason, score: match.score };
      }
    } catch (error) {
      console.error('Error in Kannada matching, falling back to local matching:', error);
      // Fall through to local matching as fallback
    }
  }

  // Pre-check forbidden words locally for non-Kannada or fallback
  const normalizedGuess = normalize(guess);
  for (const fw of forbiddenWords) {
    if (normalizedGuess === normalize(fw)) {
      return { isMatch: false, isForbidden: true, reason: `Exact match with forbidden word: ${fw}`, score: 1 };
    }
  }

  if (MATCHING_CONFIG.enableExactMatch) {
    const normalizedTarget = normalize(target);

    if (normalizedGuess === normalizedTarget) {
      if (MATCHING_CONFIG.logMatchDetails) {
        console.log(`   ✅ EXACT MATCH`);
        console.log(`   Time: ${Date.now() - startTime}ms`);
        console.log(`=============================\n`);
      }
      return { isMatch: true, isForbidden: false, reason: 'Exact match', score: 1 };
    }
  }

  // Layer 2: String similarity (fast - ~5ms)
  if (MATCHING_CONFIG.enableStringSimilarity) {
    if (isStringSimilar(guess, target)) {
      if (MATCHING_CONFIG.logMatchDetails) {
        console.log(`   ✅ STRING SIMILARITY MATCH`);
        console.log(`   Time: ${Date.now() - startTime}ms`);
        console.log(`=============================\n`);
      }
      return { isMatch: true, isForbidden: false, reason: 'String similarity', score: 0.85 };
    }
  }

  // Layer 3: Typo tolerance (very fast - ~2ms)
  if (MATCHING_CONFIG.enableTypoTolerance) {
    if (isCloseTypo(guess, target)) {
      if (MATCHING_CONFIG.logMatchDetails) {
        console.log(`   ✅ TYPO TOLERANCE MATCH`);
        console.log(`   Time: ${Date.now() - startTime}ms`);
        console.log(`=============================\n`);
      }
      return { isMatch: true, isForbidden: false, reason: 'Typo tolerance', score: 0.9 };
    }
  }

  // Layer 4: Phonetic match (fast - ~5ms)
  if (MATCHING_CONFIG.enablePhoneticMatch) {
    if (isPhoneticMatch(guess, target)) {
      if (MATCHING_CONFIG.logMatchDetails) {
        console.log(`   ✅ PHONETIC MATCH (Metaphone)`);
        console.log(`   Time: ${Date.now() - startTime}ms`);
        console.log(`=============================\n`);
      }
      return { isMatch: true, isForbidden: false, reason: 'Phonetic match (Metaphone)', score: 0.8 };
    }

    // Try Soundex as backup
    if (isSoundexMatch(guess, target)) {
      if (MATCHING_CONFIG.logMatchDetails) {
        console.log(`   ✅ PHONETIC MATCH (Soundex)`);
        console.log(`   Time: ${Date.now() - startTime}ms`);
        console.log(`=============================\n`);
      }
      return { isMatch: true, isForbidden: false, reason: 'Phonetic match (Soundex)', score: 0.8 };
    }
  }

  // No match found
  if (MATCHING_CONFIG.logMatchDetails) {
    console.log(`   ❌ NO MATCH`);
    console.log(`   Time: ${Date.now() - startTime}ms`);
    console.log(`=============================\n`);
  }

  return { isMatch: false, isForbidden: false, reason: 'No match found', score: 0 };
}

/**
 * Check if a word is in a list of words (used for forbidden word checking)
 * Uses the same matching logic as isMatchingGuess
 */
export async function isWordInList(word: string, wordList: string[]): Promise<boolean> {
  for (const listWord of wordList) {
    const result = await isMatchingGuess(word, listWord);
    if (result.isMatch) {
      return true;
    }
  }
  return false;
}
