import { isWordInList } from './compareWords';
import { normalize } from './textUtils';

/**
 * Checks if any forbidden words appear in the given text
 * Uses fuzzy matching to catch similar variations, typos, and phonetic matches
 * Works with both English and Hindi text
 * @param text - The clue text to check
 * @param forbidden - Array of forbidden words
 * @returns Promise<Array of original forbidden words found in the text>
 */
export async function checkForbidden(text: string, forbidden: string[]): Promise<string[]> {
  const normalizedText = normalize(text);
  const foundWords: string[] = [];

  // Split text into individual words
  const textWords = normalizedText.split(/\s+/).filter(w => w.length > 0);

  for (const textWord of textWords) {
    for (const forbiddenWord of forbidden) {
      // Use fuzzy matching (same as guess validation) to catch variations
      if (await isWordInList(textWord, [forbiddenWord])) {
        foundWords.push(forbiddenWord);
        break; // Don't add the same forbidden word twice
      }
    }
  }

  return foundWords;
}

// Re-export normalize for backward compatibility if needed, though updated files should import from textUtils
export { normalize };
