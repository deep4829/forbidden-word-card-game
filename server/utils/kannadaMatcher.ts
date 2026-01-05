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
  import { GoogleGenerativeAI } from '@google/generative-ai';
  import { compareTwoStrings } from 'string-similarity';
  import { normalize } from './forbiddenCheck';

    // Check for exact match
  const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
  let model: any = null;
  if (GEMINI_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(GEMINI_KEY);
      model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    } catch (e) {
      console.warn('Gemini init failed, will fallback to local similarity checks:', e);
      model = null;
    }
  }
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
  /**
   * Local fuzzy forbidden-word check to avoid false positives from the model
   */
  function locallyViolatesForbidden(guess: string, forbiddenWords: string[], threshold = 0.75): boolean {
    const g = normalize(guess.trim());
    for (const w of forbiddenWords) {
      const fw = normalize(w.trim());
      if (!fw) continue;
      if (g === fw) return true;
      const score = compareTwoStrings(g, fw);
      if (score >= threshold) return true;
    }
    return false;
  }

  /**
   * Check if two Kannada words are similar using Gemini API (if available)
   * Falls back to local similarity when Gemini is not configured or fails
   */
  export async function checkKannadaSimilarity(
    guess: string,
    target: string,
    forbiddenWords: string[] = []
  ): Promise<{ isSimilar: boolean; score: number; reason: string; violatesForbidden?: boolean }> {
    const cleanGuess = guess.trim();
    const cleanTarget = target.trim();

    // Exact match shortcut
    if (cleanGuess === cleanTarget) {
      return { isSimilar: true, score: 1.0, reason: 'Exact match' };
    }

    // Local forbidden check first (prevents model false positives)
    if (forbiddenWords && forbiddenWords.length > 0) {
      if (locallyViolatesForbidden(cleanGuess, forbiddenWords, 0.78)) {
        return { isSimilar: false, score: 0, reason: 'Locally detected forbidden word', violatesForbidden: true };
      }
    }

    // If Gemini model not configured, fall back to local similarity check
    if (!model) {
      const score = compareTwoStrings(normalize(cleanGuess), normalize(cleanTarget));
      const isSimilar = score >= 0.75;
      return { isSimilar, score, reason: 'Local similarity fallback', violatesForbidden: false };
    }

    // Conservative model prompt: ask for numeric similarity only and to avoid false positives
    const forbiddenList = forbiddenWords && forbiddenWords.length ? forbiddenWords.join(', ') : 'none';
    const prompt = `You are a strict Kannada word similarity judge for a word-guessing game.\n\nTarget: "${cleanTarget}"\nGuess: "${cleanGuess}"\nForbidden words: "${forbiddenList}"\n\nReturn ONLY valid JSON with these fields: {"isSimilar": boolean, "score": number, "reason": string, "violatesForbidden": boolean}.\n- Score must be between 0 and 1.\n- Be conservative: avoid marking guesses as forbidden unless they clearly match a forbidden word (>0.85).\n- Consider score >= 0.80 as a match.\n`;

    try {
      const result = await model.generateContent(prompt);
      // Different SDKs return different shapes; attempt to extract text safely
      let responseText = '';
      try {
        if (result?.response?.text) {
          responseText = result.response.text();
        } else if (typeof result === 'string') {
          responseText = result;
        } else if (result?.text) {
          responseText = result.text;
        } else {
          responseText = JSON.stringify(result);
        }
      } catch (e) {
        responseText = JSON.stringify(result);
      }

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('Unable to parse Gemini response, falling back to local similarity:', responseText);
        const score = compareTwoStrings(normalize(cleanGuess), normalize(cleanTarget));
        return { isSimilar: score >= 0.75, score, reason: 'Fallback local similarity (parse failure)', violatesForbidden: false };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.violatesForbidden) {
        return { isSimilar: false, score: 0, reason: 'Model flagged forbidden', violatesForbidden: true };
      }

      const score = typeof parsed.score === 'number' ? parsed.score : 0;
      const isSimilar = parsed.isSimilar || score >= 0.80;
      return { isSimilar, score, reason: parsed.reason || 'Gemini result', violatesForbidden: false };
    } catch (error) {
      console.error('Gemini error, falling back to local similarity:', error);
      const score = compareTwoStrings(normalize(cleanGuess), normalize(cleanTarget));
      return { isSimilar: score >= 0.75, score, reason: 'Fallback local similarity (exception)', violatesForbidden: false };
    }
  }

  /**
   * Wrapper function to check if text is Kannada and use appropriate matcher
   */
  export async function checkKannadaMatch(guess: string, target: string, forbiddenWords: string[] = []): Promise<boolean> {
    if (!isKannada(guess) && !isKannada(target)) return false;
    try {
      const result = await checkKannadaSimilarity(guess, target, forbiddenWords);
      return result.isSimilar && !result.violatesForbidden;
    } catch (e) {
      console.error('Error in Kannada matching:', e);
      return normalize(guess.trim()) === normalize(target.trim());
    }
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
