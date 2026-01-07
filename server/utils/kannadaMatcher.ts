import Groq from 'groq-sdk';
import { compareTwoStrings } from 'string-similarity';
import { normalize } from './textUtils';

// Initialize Groq API (if key present)
const GROQ_KEY = process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || '';
let groq: Groq | null = null;
if (GROQ_KEY) {
  try {
    groq = new Groq({ apiKey: GROQ_KEY });
  } catch (e) {
    console.warn('Groq init failed, will fallback to local similarity checks:', e);
    groq = null;
  }
}

/**
 * Detect if a string contains Kannada (Kannada script) characters
 */
function isKannada(str: string): boolean {
  const kannadaRegex = /[\u0C80-\u0CFF]/;
  return kannadaRegex.test(str);
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

  // If Groq client not configured, fall back to local similarity check
  if (!groq) {
    const score = compareTwoStrings(normalize(cleanGuess), normalize(cleanTarget));
    const isSimilar = score >= 0.75;
    return { isSimilar, score, reason: 'Local similarity fallback', violatesForbidden: false };
  }

  // Conservative model prompt: ask for numeric similarity only and to avoid false positives
  const forbiddenList = forbiddenWords && forbiddenWords.length ? forbiddenWords.join(', ') : 'none';
  const prompt = `You are a strict Kannada word similarity judge for a word-guessing game.\n\nTarget: "${cleanTarget}"\nGuess: "${cleanGuess}"\nForbidden words: "${forbiddenList}"\n\nReturn ONLY valid JSON with these fields: {"isSimilar": boolean, "score": number, "reason": string, "violatesForbidden": boolean}.\n- Score must be between 0 and 1.\n- Be conservative: avoid marking guesses as forbidden unless they clearly match a forbidden word (>0.85).\n- Consider score >= 0.80 as a match.\n`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a Kannada language expert and similarity judge."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(responseText);

    if (parsed.violatesForbidden) {
      return { isSimilar: false, score: 0, reason: 'Model flagged forbidden', violatesForbidden: true };
    }

    const score = typeof parsed.score === 'number' ? parsed.score : 0;
    const isSimilar = parsed.isSimilar || score >= 0.80;
    return { isSimilar, score, reason: parsed.reason || 'Groq result', violatesForbidden: false };
  } catch (error: any) {
    console.error('Groq error, falling back to local similarity:', error);
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
