/**
 * Local word matching using string similarity and phonetic algorithms
 * No external API required - completely free and fast
 */

import { compareTwoStrings } from 'string-similarity';
import natural from 'natural';
import { normalize } from './forbiddenCheck';

// Configuration
const STRING_SIMILARITY_THRESHOLD = 0.85;
const USE_PHONETIC_MATCHING = true;

/**
 * Check if two strings are similar using Dice coefficient algorithm
 * Returns true if similarity score >= threshold
 */
export function isStringSimilar(str1: string, str2: string, threshold = STRING_SIMILARITY_THRESHOLD): boolean {
  const normalized1 = normalize(str1);
  const normalized2 = normalize(str2);
  
  const similarity = compareTwoStrings(normalized1, normalized2);
  
  console.log(`[String Similarity] "${str1}" vs "${str2}" = ${similarity.toFixed(3)}`);
  
  return similarity >= threshold;
}

/**
 * Check if two words sound the same using Metaphone phonetic algorithm
 * Handles: airplane/aeroplane, color/colour, theater/theatre
 */
export function isPhoneticMatch(word1: string, word2: string): boolean {
  if (!USE_PHONETIC_MATCHING) return false;
  
  const normalized1 = normalize(word1);
  const normalized2 = normalize(word2);
  
  // Metaphone is good for English words
  const metaphone = new natural.metaphone();
  const code1 = metaphone.process(normalized1);
  const code2 = metaphone.process(normalized2);
  const match = code1 === code2;
  
  console.log(`[Phonetic Match] "${word1}" (${code1}) vs "${word2}" (${code2}) = ${match}`);
  
  return match;
}

/**
 * Check if two words sound the same using Soundex phonetic algorithm
 * Alternative to Metaphone, more strict
 */
export function isSoundexMatch(word1: string, word2: string): boolean {
  if (!USE_PHONETIC_MATCHING) return false;
  
  const normalized1 = normalize(word1);
  const normalized2 = normalize(word2);
  
  const soundex = new natural.soundex();
  const code1 = soundex.process(normalized1);
  const code2 = soundex.process(normalized2);
  const match = code1 === code2;
  
  console.log(`[Soundex Match] "${word1}" (${code1}) vs "${word2}" (${code2}) = ${match}`);
  
  return match;
}

/**
 * Check if edit distance is small enough (for very close typos)
 * Good for catching: airplane/airplan, color/colr
 * Uses adaptive threshold based on word length to avoid false positives
 */
export function isCloseTypo(str1: string, str2: string): boolean {
  const normalized1 = normalize(str1);
  const normalized2 = normalize(str2);
  const distance = natural.LevenshteinDistance(normalized1, normalized2);
  
  // Adaptive threshold: longer words allow more edits
  const minLength = Math.min(normalized1.length, normalized2.length);
  let maxDistance = 2;
  
  if (minLength <= 3) {
    maxDistance = 1; // Very strict for short words (cat/dog should not match)
  } else if (minLength <= 5) {
    maxDistance = 1; // house/home should not match
  } else if (minLength <= 8) {
    maxDistance = 2; // color/colour, gray/grey should match
  } else {
    maxDistance = 3; // airplane/aeroplane should match
  }
  
  const match = distance <= maxDistance;
  console.log(`[Edit Distance] "${str1}" vs "${str2}" = ${distance} (max: ${maxDistance}, match: ${match})`);
  
  return match;
}
