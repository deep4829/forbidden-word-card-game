/**
 * Kannada word matching using Google Gemini API
 * Handles Kannada script similarity checking with semantic understanding
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

/**
 * Detect if a string contains Kannada (Kannada script) characters
 */
function isKannada(str: string): boolean {
  // Kannada Unicode range: U+0C80 to U+0CFF
  const kannadaRegex = /[\u0C80-\u0CFF]/;
  return kannadaRegex.test(str);
}

/**
 * Check if two Kannada words are similar using Gemini API
 * @param guess - The player's guess (Kannada text)
 * @param target - The target word from the card (Kannada text)
 * @param forbiddenWords - List of forbidden words that shouldn't be used
 * @returns Object with { isSimilar: boolean, score: number, reason: string }
 */
export async function checkKannadaSimilarity(
  guess: string,
  target: string,
  forbiddenWords: string[] = []
): Promise<{ isSimilar: boolean; score: number; reason: string }> {
  try {
    // Trim and clean inputs
    const cleanGuess = guess.trim();
    const cleanTarget = target.trim();

    // Check for exact match
    if (cleanGuess === cleanTarget) {
      return {
        isSimilar: true,
        score: 1.0,
        reason: 'Exact match',
      };
    }

    // Create the prompt for Gemini
    const forbiddenList = forbiddenWords.join(', ');
    const prompt = `You are a Kannada word similarity checker for a word guessing game. 

Task: Determine if the guessed word is semantically or phonetically similar to the target word in Kannada.

Target word: "${target}"
Guessed word: "${cleanGuess}"
Forbidden words (must NOT be used): "${forbiddenList}"

Rules:
1. Check if the guess is too similar to any forbidden word (similarity > 80%) - if yes, return score 0
2. Check if the guess means roughly the same thing as the target word
3. Check if they sound similar when pronounced
4. Consider common Kannada spelling variations and inflections
5. Return a similarity score from 0 to 1 (0 = no match, 1 = perfect match)
6. Consider score >= 0.75 as a valid match

Respond in JSON format only:
{
  "isSimilar": boolean,
  "score": number (0 to 1),
  "reason": "brief explanation in English",
  "violatesForbidden": boolean
}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse the JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to parse Gemini response:', responseText);
      return {
        isSimilar: false,
        score: 0,
        reason: 'API response parsing error',
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Check if guess violates forbidden words list
    if (parsed.violatesForbidden) {
      return {
        isSimilar: false,
        score: 0,
        reason: 'Guess uses forbidden word',
      };
    }

    console.log(`[Kannada Similarity] "${cleanGuess}" vs "${cleanTarget}" = ${parsed.score.toFixed(3)} - ${parsed.reason}`);

    return {
      isSimilar: parsed.isSimilar || parsed.score >= 0.75,
      score: parsed.score,
      reason: parsed.reason,
    };
  } catch (error) {
    console.error('Error checking Kannada similarity with Gemini:', error);
    throw error;
  }
}

/**
 * Wrapper function to check if text is Kannada and use appropriate matcher
 */
export async function checkKannadaMatch(
  guess: string,
  target: string,
  forbiddenWords: string[] = []
): Promise<boolean> {
  if (!isKannada(guess) && !isKannada(target)) {
    return false;
  }

  try {
    const result = await checkKannadaSimilarity(guess, target, forbiddenWords);
    return result.isSimilar;
  } catch (error) {
    console.error('Error in Kannada matching:', error);
    // Fallback to exact match on error
    return guess.trim() === target.trim();
  }
}
