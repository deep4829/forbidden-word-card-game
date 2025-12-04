'use client';

import { useState } from 'react';

export default function HowToPlayButton() {
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  return (
    <>
      {/* How to Play Button - Fixed Top Left */}
      <button
        onClick={() => setShowHowToPlay(true)}
        className="fixed top-6 left-6 z-[999] w-12 h-12 sm:w-14 sm:h-14 rounded-full shadow-2xl flex items-center justify-center text-2xl sm:text-3xl bg-indigo-600 text-white ring-4 ring-indigo-300 hover:bg-indigo-700 transition-all hover:scale-110"
        title="How to Play"
        aria-label="How to Play"
      >
        ❓
      </button>

      {/* How to Play Modal */}
      {showHowToPlay && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 sm:p-8 flex items-center justify-between sticky top-0">
              <div className="flex items-center gap-3">
                <span className="text-4xl">🎮</span>
                <h2 className="text-2xl sm:text-3xl font-black">How to Play</h2>
              </div>
              <button
                onClick={() => setShowHowToPlay(false)}
                className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-all"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-6 sm:p-8 space-y-6">
              {/* Game Overview */}
              <div className="space-y-3">
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <span>📋</span> Game Overview
                </h3>
                <p className="text-gray-700 text-sm sm:text-base">
                  This is a team-based word guessing game where one player (Speaker) gives clues to help their team guess a secret word. 
                  Players take turns being the speaker and guesser.
                </p>
              </div>

              {/* Two Roles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Speaker Role */}
                <div className="bg-yellow-50 border-3 border-yellow-400 rounded-xl p-4 sm:p-6">
                  <h3 className="text-lg font-bold text-yellow-900 mb-3 flex items-center gap-2">
                    <span>🎤</span> Speaker Role
                  </h3>
                  <ul className="space-y-2 text-sm text-gray-800">
                    <li className="flex gap-2">
                      <span>1️⃣</span>
                      <span><strong>See the word:</strong> You get a secret word to describe</span>
                    </li>
                    <li className="flex gap-2">
                      <span>2️⃣</span>
                      <span><strong>Give clues:</strong> Give up to 10 clues using voice or text</span>
                    </li>
                    <li className="flex gap-2">
                      <span>3️⃣</span>
                      <span><strong>Avoid forbidden words:</strong> Never say forbidden words or lose points!</span>
                    </li>
                    <li className="flex gap-2">
                      <span>4️⃣</span>
                      <span><strong>Earn points:</strong> Earn points when someone guesses correctly</span>
                    </li>
                  </ul>
                </div>

                {/* Guesser Role */}
                <div className="bg-blue-50 border-3 border-blue-400 rounded-xl p-4 sm:p-6">
                  <h3 className="text-lg font-bold text-blue-900 mb-3 flex items-center gap-2">
                    <span>🎯</span> Guesser Role
                  </h3>
                  <ul className="space-y-2 text-sm text-gray-800">
                    <li className="flex gap-2">
                      <span>1️⃣</span>
                      <span><strong>Listen to clues:</strong> Wait for the speaker's clues</span>
                    </li>
                    <li className="flex gap-2">
                      <span>2️⃣</span>
                      <span><strong>Make guesses:</strong> You have 10 attempts to guess</span>
                    </li>
                    <li className="flex gap-2">
                      <span>3️⃣</span>
                      <span><strong>Use voice or text:</strong> Speak or type your guess</span>
                    </li>
                    <li className="flex gap-2">
                      <span>4️⃣</span>
                      <span><strong>Earn points:</strong> Earn points for correct guesses!</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Game Flow */}
              <div className="bg-purple-50 border-3 border-purple-400 rounded-xl p-4 sm:p-6 space-y-3">
                <h3 className="text-lg font-bold text-purple-900 flex items-center gap-2">
                  <span>⚡</span> Game Flow
                </h3>
                <div className="space-y-2 text-sm text-gray-800">
                  <div className="flex gap-3">
                    <span className="font-bold text-purple-600">Step 1:</span>
                    <span>Speaker gets a card with a secret word and forbidden words</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="font-bold text-purple-600">Step 2:</span>
                    <span>Speaker gives clues one at a time (voice or text)</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="font-bold text-purple-600">Step 3:</span>
                    <span>After each clue, all guessers get ONE chance to guess</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="font-bold text-purple-600">Step 4:</span>
                    <span>If someone guesses correctly, round ends and points are awarded</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="font-bold text-purple-600">Step 5:</span>
                    <span>If all 10 guesses are used, round ends (guessers lose)</span>
                  </div>
                </div>
              </div>

              {/* Tips & Tricks */}
              <div className="bg-green-50 border-3 border-green-400 rounded-xl p-4 sm:p-6 space-y-3">
                <h3 className="text-lg font-bold text-green-900 flex items-center gap-2">
                  <span>💡</span> Tips & Tricks
                </h3>
                <ul className="space-y-2 text-sm text-gray-800">
                  <li className="flex gap-2">
                    <span>✓</span>
                    <span><strong>As Speaker:</strong> Give creative clues but avoid obvious or forbidden words</span>
                  </li>
                  <li className="flex gap-2">
                    <span>✓</span>
                    <span><strong>As Guesser:</strong> Ask clarifying questions through clues to narrow down options</span>
                  </li>
                  <li className="flex gap-2">
                    <span>✓</span>
                    <span><strong>Mobile:</strong> Tap the mic button to start, speak, then tap again to send</span>
                  </li>
                  <li className="flex gap-2">
                    <span>✓</span>
                    <span><strong>Forbidden Words:</strong> If spoken, you lose points immediately</span>
                  </li>
                  <li className="flex gap-2">
                    <span>✓</span>
                    <span><strong>Teamwork:</strong> Coordinate with your team for better strategy</span>
                  </li>
                </ul>
              </div>

              {/* Scoring */}
              <div className="bg-orange-50 border-3 border-orange-400 rounded-xl p-4 sm:p-6 space-y-3">
                <h3 className="text-lg font-bold text-orange-900 flex items-center gap-2">
                  <span>⭐</span> Scoring System
                </h3>
                <div className="space-y-2 text-sm text-gray-800">
                  <div className="flex justify-between items-center py-2 px-3 bg-white rounded border border-orange-200">
                    <span>Correct guess (1 clue)</span>
                    <span className="font-bold text-orange-600">10 points</span>
                  </div>
                  <div className="flex justify-between items-center py-2 px-3 bg-white rounded border border-orange-200">
                    <span>Correct guess (3 clues)</span>
                    <span className="font-bold text-orange-600">7 points</span>
                  </div>
                  <div className="flex justify-between items-center py-2 px-3 bg-white rounded border border-orange-200">
                    <span>Correct guess (5+ clues)</span>
                    <span className="font-bold text-orange-600">4 points</span>
                  </div>
                  <div className="flex justify-between items-center py-2 px-3 bg-red-100 rounded border border-red-300">
                    <span>Forbidden word penalty</span>
                    <span className="font-bold text-red-600">-5 points</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gray-100 border-t-2 border-gray-200 p-4 sm:p-6 flex gap-3 justify-end sticky bottom-0">
              <button
                onClick={() => setShowHowToPlay(false)}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-lg hover:shadow-lg transition-all"
              >
                Got It! 🎮
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
