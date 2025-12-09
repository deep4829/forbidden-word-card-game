/**
 * Local word matching using string similarity and phonetic algorithms
 * No external API required - completely free and fast
 * Supports both English and Hindi languages
 */

import { compareTwoStrings } from 'string-similarity';
import natural from 'natural';
import { normalize } from './forbiddenCheck';

// Configuration
const STRING_SIMILARITY_THRESHOLD = 0.85;
const HINDI_SIMILARITY_THRESHOLD = 0.80; // Slightly lower for Hindi due to script variations
const USE_PHONETIC_MATCHING = true;

/**
 * Detect if a string contains Hindi (Devanagari) characters
 */
function isHindi(str: string): boolean {
  // Devanagari Unicode range: U+0900 to U+097F
  const devanagariRegex = /[\u0900-\u097F]/;
  return devanagariRegex.test(str);
}

/**
 * Calculate similarity score for Hindi words
 * Takes into account common Devanagari variations
 */
function getHindiSimilarityScore(str1: string, str2: string): number {
  const normalized1 = normalize(str1);
  const normalized2 = normalize(str2);
  
  // Direct character-by-character comparison
  const baseScore = compareTwoStrings(normalized1, normalized2);
  
  // Additional bonus for common Hindi variations
  // In Hindi, some diacritics can be omitted or written differently
  // e.g., "बुखार" can be written as "बुखार" (slight variations in anusvara, visarga, etc.)
  
  // Check for prefix/suffix matches (common in Hindi word variations)
  const minLen = Math.min(normalized1.length, normalized2.length);
  if (minLen >= 3) {
    // Check if 80% of characters match in order (more lenient for Hindi)
    let matchCount = 0;
    for (let i = 0; i < Math.min(normalized1.length, normalized2.length); i++) {
      if (normalized1[i] === normalized2[i]) matchCount++;
    }
    const charMatchScore = matchCount / Math.max(normalized1.length, normalized2.length);
    return Math.max(baseScore, charMatchScore);
  }
  
  return baseScore;
}

/**
 * Check if two strings are similar using Dice coefficient algorithm
 * Adapts threshold based on language (English vs Hindi)
 */
export function isStringSimilar(str1: string, str2: string, threshold?: number): boolean {
  const normalized1 = normalize(str1);
  const normalized2 = normalize(str2);
  
  // Auto-detect language and adjust threshold
  const isHindiText = isHindi(str1) || isHindi(str2);
  const effectiveThreshold = threshold ?? (isHindiText ? HINDI_SIMILARITY_THRESHOLD : STRING_SIMILARITY_THRESHOLD);
  
  let similarity: number;
  if (isHindiText) {
    similarity = getHindiSimilarityScore(normalized1, normalized2);
  } else {
    similarity = compareTwoStrings(normalized1, normalized2);
  }
  
  console.log(`[String Similarity] "${str1}" vs "${str2}" = ${similarity.toFixed(3)} (threshold: ${effectiveThreshold}, isHindi: ${isHindiText})`);
  
  return similarity >= effectiveThreshold;
}

/**
 * Check if two words sound the same using Metaphone phonetic algorithm
 * Only works for English - skipped for Hindi
 * Handles: airplane/aeroplane, color/colour, theater/theatre
 */
export function isPhoneticMatch(word1: string, word2: string): boolean {
  if (!USE_PHONETIC_MATCHING) return false;
  
  // Skip phonetic matching for Hindi - not applicable to Devanagari
  if (isHindi(word1) || isHindi(word2)) {
    console.log(`[Phonetic Match] Skipped for Hindi text`);
    return false;
  }
  
  const normalized1 = normalize(word1);
  const normalized2 = normalize(word2);
  
  // Metaphone is good for English words
  // Cast to any to access runtime class while staying compatible with TypeScript typings
  const naturalAny = natural as any;
  const metaphone = new naturalAny.Metaphone();
  const code1 = metaphone.process(normalized1);
  const code2 = metaphone.process(normalized2);
  const match = code1 === code2;
  
  console.log(`[Phonetic Match] "${word1}" (${code1}) vs "${word2}" (${code2}) = ${match}`);
  
  return match;
}

/**
 * Check if two words sound the same using Soundex phonetic algorithm
 * Only works for English - skipped for Hindi
 * Alternative to Metaphone, more strict
 */
export function isSoundexMatch(word1: string, word2: string): boolean {
  if (!USE_PHONETIC_MATCHING) return false;
  
  // Skip phonetic matching for Hindi - not applicable to Devanagari
  if (isHindi(word1) || isHindi(word2)) {
    console.log(`[Soundex Match] Skipped for Hindi text`);
    return false;
  }
  
  const normalized1 = normalize(word1);
  const normalized2 = normalize(word2);
  
  const naturalAny = natural as any;
  const soundex = new naturalAny.SoundEx();
  const code1 = soundex.process(normalized1);
  const code2 = soundex.process(normalized2);
  const match = code1 === code2;
  
  console.log(`[Soundex Match] "${word1}" (${code1}) vs "${word2}" (${code2}) = ${match}`);
  
  return match;
}

/**
 * Check if edit distance is small enough (for very close typos)
 * Adapts for both English and Hindi typing variations
 * Uses adaptive threshold based on word length to avoid false positives
 */
export function isCloseTypo(str1: string, str2: string): boolean {
  const normalized1 = normalize(str1);
  const normalized2 = normalize(str2);
  const distance = natural.LevenshteinDistance(normalized1, normalized2);
  
  // Check if Hindi
  const isHindiText = isHindi(str1) || isHindi(str2);
  
  // Adaptive threshold: longer words allow more edits
  const minLength = Math.min(normalized1.length, normalized2.length);
  let maxDistance = 2;
  
  if (isHindiText) {
    // For Hindi, be slightly more lenient due to script complexities
    if (minLength <= 2) {
      maxDistance = 0; // Single character words must match exactly
    } else if (minLength <= 4) {
      maxDistance = 1; // Very strict for short words
    } else if (minLength <= 7) {
      maxDistance = 2; // Allow 2 edits for medium words
    } else {
      maxDistance = 3; // Allow 3 edits for longer words
    }
  } else {
    // English thresholds (original)
    if (minLength <= 3) {
      maxDistance = 1; // Very strict for short words (cat/dog should not match)
    } else if (minLength <= 5) {
      maxDistance = 1; // house/home should not match
    } else if (minLength <= 8) {
      maxDistance = 2; // color/colour, gray/grey should match
    } else {
      maxDistance = 3; // airplane/aeroplane should match
    }
  }
  
  const match = distance <= maxDistance;
  console.log(`[Edit Distance] "${str1}" vs "${str2}" = ${distance} (max: ${maxDistance}, isHindi: ${isHindiText}, match: ${match})`);
  
  return match;
}
