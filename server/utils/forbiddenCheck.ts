/**
 * Normalizes a string by converting to lowercase and removing punctuation
 * @param s - The input string to normalize
 * @returns The normalized string
 */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, '');
}

/**
 * Checks if any forbidden words appear in the given text
 * @param text - The clue text to check
 * @param forbidden - Array of forbidden words
 * @returns Array of original forbidden words found in the text
 */
export function checkForbidden(text: string, forbidden: string[]): string[] {
  const normalizedText = normalize(text);
  const foundWords: string[] = [];

  for (const word of forbidden) {
    const normalizedWord = normalize(word);
    if (normalizedText.includes(normalizedWord)) {
      foundWords.push(word);
    }
  }

  return foundWords;
}
