/**
 * Normalizes a string by converting to lowercase
 * Handles both English and Devanagari (Hindi) scripts
 * @param s - The input string to normalize
 * @returns The normalized string
 */
export function normalize(s: string): string {
    return s.toLowerCase().trim();
}
