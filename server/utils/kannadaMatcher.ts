/**
 * Kannada word matching using Google Gemini API
 * Handles Kannada script similarity checking with semantic understanding
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { compareTwoStrings } from 'string-similarity';
import { normalize } from './textUtils';

// Initialize Gemini API (if key present)
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
let model: any = null;
if (GEMINI_KEY) {
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  } catch (e) {
    console.warn('Gemini init failed, will fallback to local similarity checks:', e);
    model = null;
  }
}

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
 * Detect if a string contains Kannada (Kannada script) characters
 */
export function isKannada(str: string): boolean {
  const kannadaRegex = /[\u0C80-\u0CFF]/;
  return kannadaRegex.test(str);
}

/**
 * Strict Kannada Clue Validator for Gameplay
 * Handles agglutination, synonyms, and translations to detect cheating
 */
export async function validateKannadaClue(
  clue: string,
  target: string,
  forbiddenWords: string[]
): Promise<{ isValid: boolean; violationFound: string | null; explanation: string }> {
  // If no model, fallback to a basic local check (though less powerful)
  if (!model) {
    const isForbidden = locallyViolatesForbidden(clue, [target, ...forbiddenWords], 0.8);
    return {
      isValid: !isForbidden,
      violationFound: isForbidden ? 'Local fuzzy match' : null,
      explanation: 'AI model not available. Used local fuzzy matching.'
    };
  }

  const forbiddenList = forbiddenWords.join(', ');
  const prompt = `Act as a strict Kannada Linguistic Judge for the game "Antigravity." Your job is to determine if a player's clue is legal or illegal.

Inputs Provided:
Target Word: ${target}
Forbidden Words: ${forbiddenList}
Player's Clue: ${clue}

Validation Rules:
1. Direct Match: If the clue contains the Target or any Forbidden Word (even in English script).
2. Grammar/Inflection: In Kannada, words change suffixes (e.g., "ಮನೆಯಲ್ಲಿ", "ಮನೆಯಿಂದ", "ಮನೆ"). If the root word is the same as any forbidden word, it is a violation (INVALID).
3. Semantic Meaning: If the clue is a direct synonym (Samanarthaka) of a forbidden word, it is INVALID.
4. Translation: If the player uses the English version of a forbidden word, it is INVALID.

Output strictly in JSON: { "is_valid": boolean, "violation_found": "string or null", "explanation": "Brief reason in Kannada why it was accepted or rejected" }`;

  try {
    const result = await model.generateContent(prompt);
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
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      isValid: !!parsed.is_valid,
      violationFound: parsed.violation_found || null,
      explanation: parsed.explanation || ''
    };
  } catch (error) {
    console.error('validateKannadaClue error:', error);
    // Fallback to local check
    const isForbidden = locallyViolatesForbidden(clue, [target, ...forbiddenWords], 0.8);
    return {
      isValid: !isForbidden,
      violationFound: isForbidden ? 'Local fallback' : null,
      explanation: 'ವ್ಯಾಲಿಡೇಶನ್ ಸಮಯದಲ್ಲಿ ದೋಷ ಸಂಭವಿಸಿದೆ. ಸ್ಥಳೀಯ ತಪಾಸಣೆ ಬಳಸಲಾಗಿದೆ.'
    };
  }
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

  // Robust linguistic prompt: handle agglutination, root words, and synonyms
  const forbiddenList = forbiddenWords && forbiddenWords.length ? forbiddenWords.join(', ') : 'none';
  const prompt = `Act as a Kannada Linguistic Judge for a word-guessing game. Your job is to determine if the player's guess matches the target word.

Inputs:
Target Word: ${cleanTarget}
Player's Guess: ${cleanGuess}
Forbidden Words: ${forbiddenList}

Rules:
1. Strict Forbidden Check (PRIMARY): If the guess matches ANY Forbidden Word (directly or root word), you MUST set violatesForbidden to true and isSimilar to false. This is an "Illegal Guess".
2. Root Word Match: If not forbidden, and the guess and target share the same root word, it's a MATCH.
3. Synonyms: If not forbidden, and the guess is a direct synonym (Samanarthaka) for the target, it's a MATCH.
4. Translation: If not forbidden, and the player guesses the English version of the Kannada target, it's a MATCH.

Return ONLY valid JSON: { "isSimilar": boolean, "score": number, "reason": "string", "violatesForbidden": boolean }
- violatesForbidden MUST be true if the guess matches a forbidden word, even if it also matches the target.
- isSimilar MUST be false if violatesForbidden is true. village.`;

  try {
    const result = await model.generateContent(prompt);
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
    return { isSimilar, score, reason: parsed.reason || 'Gemini linguistic result', violatesForbidden: false };
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
}
