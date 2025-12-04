declare module 'natural' {
  export function metaphone(str: string): string;
  export function soundex(str: string): string;
  export function LevenshteinDistance(str1: string, str2: string): number;
}
