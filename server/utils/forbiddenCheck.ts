/**
 * Normalizes a string by converting to lowercase
 * Handles both English and Devanagari (Hindi) scripts
 * @param s - The input string to normalize
 * @returns The normalized string
 */
export function normalize(s: string): string {
  return s.toLowerCase().trim();
}

/**
 * Checks if any forbidden words appear in the given text
 * Uses fuzzy matching to catch similar variations, typos, and phonetic matches
 * Works with both English and Hindi text
 * @param text - The clue text to check
 * @param forbidden - Array of forbidden words
 * @returns Array of original forbidden words found in the text
 */
export function checkForbidden(text: string, forbidden: string[]): string[] {
  // Import the fuzzy matching function
  const { isWordInList } = require('./compareWords');
  
  const normalizedText = normalize(text);
  const foundWords: string[] = [];

  // Split text into individual words
  const textWords = normalizedText.split(/\s+/).filter(w => w.length > 0);
  
  for (const textWord of textWords) {
    for (const forbiddenWord of forbidden) {
      // Use fuzzy matching (same as guess validation) to catch variations
      if (isWordInList(textWord, [forbiddenWord])) {
        foundWords.push(forbiddenWord);
        break; // Don't add the same forbidden word twice
      }
    }
  }

  return foundWords;
}
