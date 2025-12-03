/**
 * Main word comparison utility with multi-layered matching strategy
 * Uses local algorithms only - no external API needed
 */

import { normalize } from './forbiddenCheck';
import { 
  isStringSimilar, 
  isPhoneticMatch, 
  isSoundexMatch, 
  isCloseTypo 
} from './localMatching';

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
 * Main function to check if a guess matches the target word
 * Uses multiple algorithms in order of speed (fastest first)
 * 
 * @param guess - The player's guess
 * @param target - The target word from the card
 * @returns true if the guess is considered a match
 */
export function isMatchingGuess(guess: string, target: string): boolean {
  const startTime = Date.now();
  
  if (MATCHING_CONFIG.logMatchDetails) {
    console.log(`\n🔍 ===== WORD COMPARISON =====`);
    console.log(`   Guess:  "${guess}"`);
    console.log(`   Target: "${target}"`);
  }
  
  // Layer 1: Exact match (fastest - instant)
  if (MATCHING_CONFIG.enableExactMatch) {
    const normalizedGuess = normalize(guess);
    const normalizedTarget = normalize(target);
    
    if (normalizedGuess === normalizedTarget) {
      if (MATCHING_CONFIG.logMatchDetails) {
        console.log(`   ✅ EXACT MATCH`);
        console.log(`   Time: ${Date.now() - startTime}ms`);
        console.log(`=============================\n`);
      }
      return true;
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
      return true;
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
      return true;
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
      return true;
    }
    
    // Try Soundex as backup
    if (isSoundexMatch(guess, target)) {
      if (MATCHING_CONFIG.logMatchDetails) {
        console.log(`   ✅ PHONETIC MATCH (Soundex)`);
        console.log(`   Time: ${Date.now() - startTime}ms`);
        console.log(`=============================\n`);
      }
      return true;
    }
  }
  
  // No match found
  if (MATCHING_CONFIG.logMatchDetails) {
    console.log(`   ❌ NO MATCH`);
    console.log(`   Time: ${Date.now() - startTime}ms`);
    console.log(`=============================\n`);
  }
  
  return false;
}

/**
 * Check if a word is in a list of words (used for forbidden word checking)
 * Uses the same matching logic as isMatchingGuess
 */
export function isWordInList(word: string, wordList: string[]): boolean {
  for (const listWord of wordList) {
    if (isMatchingGuess(word, listWord)) {
      return true;
    }
  }
  return false;
}
