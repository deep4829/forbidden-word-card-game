import { computePoints } from './scoring';

describe('computePoints', () => {
  test('should return 6 points for speaker and 4 for guesser with 1 clue', () => {
    const result = computePoints(1);
    expect(result.speaker).toBe(6);
    expect(result.guesser).toBe(4);
  });

  test('should return 6 points for speaker and 4 for guesser with 2 clues', () => {
    const result = computePoints(2);
    expect(result.speaker).toBe(6);
    expect(result.guesser).toBe(4);
  });

  test('should return 5 points for speaker and 3 for guesser with 3 clues', () => {
    const result = computePoints(3);
    expect(result.speaker).toBe(5);
    expect(result.guesser).toBe(3);
  });

  test('should return 5 points for speaker and 3 for guesser with 4 clues', () => {
    const result = computePoints(4);
    expect(result.speaker).toBe(5);
    expect(result.guesser).toBe(3);
  });

  test('should return 0 points for both speaker and guesser with 5 or more clues', () => {
    const result = computePoints(5);
    expect(result.speaker).toBe(0);
    expect(result.guesser).toBe(0);
  });

  test('should return 0 points for both speaker and guesser with 10 clues', () => {
    const result = computePoints(10);
    expect(result.speaker).toBe(0);
    expect(result.guesser).toBe(0);
  });

  test('should return 0 points for both speaker and guesser with 0 clues', () => {
    const result = computePoints(0);
    expect(result.speaker).toBe(0);
    expect(result.guesser).toBe(0);
  });
});
