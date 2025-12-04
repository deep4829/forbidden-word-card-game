/**
 * Test script to verify word matching algorithms work correctly
 * Run with: npx ts-node testWordMatching.ts
 */

import { isMatchingGuess } from './utils/compareWords';

console.log('\n🧪 ===== WORD MATCHING TEST SUITE =====\n');

// Test cases: [guess, target, shouldMatch]
const testCases: Array<[string, string, boolean]> = [
  // Exact matches
  ['airplane', 'airplane', true],
  ['AIRPLANE', 'airplane', true],
  ['Air-Plane', 'airplane', true],
  
  // Spelling variations (the main issue)
  ['aeroplane', 'airplane', true],
  ['airplane', 'aeroplane', true],
  
  // British vs American spelling
  ['colour', 'color', true],
  ['color', 'colour', true],
  ['theatre', 'theater', true],
  ['theater', 'theatre', true],
  
  // Common typos
  ['airplan', 'airplane', true],
  ['airplne', 'airplane', true],
  ['colr', 'color', true],
  
  // Phonetically similar
  ['gray', 'grey', true],
  ['grey', 'gray', true],
  ['donut', 'doughnut', true],
  ['doughnut', 'donut', true],
  
  // Should NOT match
  ['car', 'airplane', false],
  ['house', 'home', false],
  ['red', 'blue', false],
  ['cat', 'dog', false],
  
  // Edge cases
  ['air plane', 'airplane', true],
  ['air-plane', 'airplane', true],
  ['  airplane  ', 'airplane', true],
];

let passed = 0;
let failed = 0;

console.log('Running tests...\n');

testCases.forEach(([guess, target, expected], index) => {
  const result = isMatchingGuess(guess, target);
  const testPassed = result === expected;
  
  if (testPassed) {
    passed++;
    console.log(`✅ Test ${index + 1}: PASSED`);
  } else {
    failed++;
    console.log(`❌ Test ${index + 1}: FAILED`);
    console.log(`   Expected: "${guess}" ${expected ? 'SHOULD' : 'SHOULD NOT'} match "${target}"`);
    console.log(`   Got: ${result ? 'MATCH' : 'NO MATCH'}\n`);
  }
});

console.log('\n===== TEST RESULTS =====');
console.log(`✅ Passed: ${passed}/${testCases.length}`);
console.log(`❌ Failed: ${failed}/${testCases.length}`);
console.log(`📊 Success Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);
console.log('========================\n');

if (failed === 0) {
  console.log('🎉 All tests passed! Word matching is working correctly.\n');
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed. Review the configuration or thresholds.\n');
  process.exit(1);
}
