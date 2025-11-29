/**
 * Computes points for both speaker and guesser based on the number of clues used
 * 
 * Scoring rules:
 * - 1-2 clues: Speaker gets +6 points, Guesser gets +4 points
 * - 3-4 clues: Speaker gets +5 points, Guesser gets +3 points
 * - 5+ clues: No points awarded
 * 
 * @param clueCount - The number of clues used to guess the word
 * @returns An object containing points for speaker and guesser
 */
export function computePoints(clueCount: number): { speaker: number; guesser: number } {
  if (clueCount >= 1 && clueCount <= 2) {
    return { speaker: 6, guesser: 4 };
  } else if (clueCount >= 3 && clueCount <= 4) {
    return { speaker: 5, guesser: 3 };
  } else {
    return { speaker: 0, guesser: 0 };
  }
}
