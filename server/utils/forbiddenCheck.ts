import { isWordInList } from './compareWords';
import { normalize } from './textUtils';
import { isKannada, validateKannadaClue } from './kannadaMatcher';

/**
 * Checks if any forbidden words appear in the given text
 * Uses fuzzy matching for English/Hindi, and AI-powered linguistic validation for Kannada
 * @param text - The clue text to check
 * @param forbidden - Array of forbidden words
 * @param target - The main target word (optional, but recommended for Kannada validation)
 * @returns Promise<Array of original forbidden words found in the text>
 */
export async function checkForbidden(text: string, forbidden: string[], target: string = ''): Promise<string[]> {
  const normalizedText = normalize(text);

  // If Kannada is detected, use the strict holographic validator
  if (isKannada(text)) {
    console.log(`[checkForbidden] Kannada detected, using AI Validator...`);
    try {
      const result = await validateKannadaClue(text, target, forbidden);
      if (!result.isValid) {
        console.log(`[checkForbidden] Violation: ${result.violationFound} (${result.explanation})`);
        // Return the violation found (or a generic forbidden placeholder if specific word not mapped)
        return [result.violationFound || 'Kannada Violation'];
      }
      return [];
    } catch (err) {
      console.error('[checkForbidden] Kannada validation error:', err);
      // Fall through to word-by-word fuzzy check as safety fallback
    }
  }

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
