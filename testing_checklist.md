# End-to-End Manual Testing Checklist

## Overview
This document provides a comprehensive manual testing guide for the Forbidden Word Card Game. Follow these steps to verify all game mechanics, state management, scoring, and real-time synchronization across multiple clients.

---

## Test Environment Setup

### Requirements
- 4 distinct browser windows or tabs (or 4 different devices)
- Modern browser with WebRTC/Speech Recognition support (Chrome, Edge, or Safari recommended)
- Server running on `http://localhost:4000`
- Web client running on `http://localhost:3000`

### Browser Window Setup
Open 4 browser windows/tabs and assign roles:

| Window | Player Name | Role Assignment | Browser Instance |
|--------|-------------|----------------|------------------|
| Window 1 | Alice | Host/Player 1 | Chrome Tab 1 |
| Window 2 | Bob | Player 2 | Chrome Tab 2 |
| Window 3 | Charlie | Player 3 | Firefox Tab 1 |
| Window 4 | Diana | Player 4 | Edge Tab 1 |

**Tip:** Use browser profiles or incognito windows to simulate truly separate users.

---

## Phase 1: Initial Setup and Lobby Testing

### 1.1 Room Creation (Window 1 - Alice)
- [ ] Navigate to `http://localhost:3000/join`
- [ ] Verify connection status indicator shows "Connected"
- [ ] Enter name "Alice" in the player name field
- [ ] Click "Create New Room" button
- [ ] Verify redirect to `/room/[roomId]` page
- [ ] Note the Room ID displayed (e.g., `abc123-def456`)
- [ ] Verify Alice is shown as "Host" in player list
- [ ] Verify player count shows "1 / 4"
- [ ] Verify "Start Game" button is NOT visible (requires 4 players)

**Expected Results:**
- Room created successfully
- Alice marked as host with badge
- Room ID is displayed and copyable
- Waiting message shown for more players

### 1.2 Room Joining (Windows 2, 3, 4)

#### Window 2 - Bob
- [ ] Navigate to `http://localhost:3000/join`
- [ ] Enter name "Bob"
- [ ] Click "Join Existing Room"
- [ ] Enter the Room ID from Alice's window
- [ ] Click "Join Room" button
- [ ] Verify redirect to the room lobby page
- [ ] Verify Bob appears in the player list

#### Window 3 - Charlie
- [ ] Repeat joining process with name "Charlie"
- [ ] Verify Charlie appears in all 3 windows' player lists

#### Window 4 - Diana
- [ ] Repeat joining process with name "Diana"
- [ ] Verify Diana appears in all 4 windows' player lists

### 1.3 Lobby Synchronization Check
Verify in ALL 4 windows:
- [ ] All 4 players are displayed in the player list
- [ ] Player count shows "4 / 4"
- [ ] Alice has "Host" badge
- [ ] Each window correctly shows "You" badge for the respective player
- [ ] No empty player slots are shown

### 1.4 Start Game (Window 1 - Alice only)
- [ ] Verify "Start Game" button is now visible and green
- [ ] Verify button shows "🎮 Start Game" text
- [ ] Click "Start Game" button
- [ ] Verify all 4 windows redirect to `/room/[roomId]/game`

**Expected Results:**
- All players redirected to game page simultaneously
- Game started successfully

---

## Phase 2: Round 1 - Successful Guess on Clue 2

### 2.1 Initial Game State Verification
Verify in ALL 4 windows:
- [ ] ScoreBoard displays "Round 1"
- [ ] Current speaker is identified (should be Alice - first player)
- [ ] Team A Score: 0
- [ ] Team B Score: 0
- [ ] All 4 player avatars visible with scores (all 0)

### 2.2 Speaker View (Window 1 - Alice)
Verify Alice's window shows:
- [ ] "Your Card 🎴" section visible
- [ ] Target word is displayed (e.g., "Ocean")
- [ ] Forbidden words list displayed (e.g., "water", "sea", "blue", "fish", "beach")
- [ ] "Voice Control 🎤" section visible
- [ ] Blue microphone button (not recording)
- [ ] Text shows "Tap to Start Speaking"

### 2.3 Guesser View (Windows 2, 3, 4)
Verify Bob, Charlie, and Diana's windows show:
- [ ] "Clues Received 💬" section visible
- [ ] Empty state message: "Waiting for clues from the speaker..."
- [ ] "Make Your Guess 🎯" section visible
- [ ] "Guesses Remaining: 3/3" (3 green checkmarks)
- [ ] Guess input field is enabled
- [ ] Submit button is enabled

### 2.4 First Clue (Window 1 - Alice)
Alice gives first clue:
- [ ] Click microphone button (turns red and pulses)
- [ ] Status changes to "Listening..."
- [ ] Speak clearly: **"Large body of salty liquid"**
- [ ] Verify "Live Transcript" shows the spoken text
- [ ] Wait for clue to be processed (auto-sent when finalized)

**Verification in ALL guesser windows (2, 3, 4):**
- [ ] First clue appears in "Clues Received" section
- [ ] Clue text: "Large body of salty liquid"
- [ ] Badge shows "Clue #1"
- [ ] Blue gradient background with left border

### 2.5 Incorrect Guess (Window 2 - Bob)
Bob makes an incorrect guess:
- [ ] Type "Lake" in the guess input field
- [ ] Click "🎯 Submit Guess" button
- [ ] Verify input field clears

**Verification in ALL 4 windows:**
- [ ] Red feedback banner appears: "Incorrect guess: 'Lake' by Bob"
- [ ] Bob's guesses remaining: 2/3 (2 green, 1 gray X)
- [ ] No score changes
- [ ] Round continues

### 2.6 Second Clue (Window 1 - Alice)
Alice gives second clue:
- [ ] Click microphone button again
- [ ] Speak clearly: **"Where ships sail and waves crash"**
- [ ] Verify clue appears in transcript

**Verification in guesser windows:**
- [ ] Second clue appears below first clue
- [ ] Badge shows "Clue #2"

### 2.7 Correct Guess (Window 3 - Charlie)
Charlie makes the correct guess:
- [ ] Type "Ocean" in the guess input field
- [ ] Click "🎯 Submit Guess" button

**Verification in ALL 4 windows:**
- [ ] Green feedback banner: "Correct! Charlie guessed 'Ocean' in 2 clues!"
- [ ] Additional green banner: "Round ended! Preparing next round..."
- [ ] ScoreBoard updates:
  - Alice (Speaker): +7 points (6 base + 1 bonus for 2 unused clues)
  - Charlie (Guesser): +5.5 points (4 base + 1.5 bonus for 2 unused guesses)
- [ ] Team scores updated based on player teams
- [ ] Clue history cleared after ~2 seconds
- [ ] Round number increments to "Round 2"
- [ ] New speaker rotated (should be Bob - second player)

**Scoring Verification:**
- Base points for 2 clues: Speaker +6, Guesser +4
- Speaker bonus: +1 (2 unused clues: 4 max - 2 used = 2 × 0.5)
- Guesser bonus: +1.5 (2 unused guesses: 3 max - 1 used = 2 × 0.5)
- **Alice total: +7**
- **Charlie total: +5.5**

---

## Phase 3: Round 2 - Forbidden Word Penalty

### 3.1 Round 2 Setup Verification
Verify in ALL 4 windows:
- [ ] ScoreBoard displays "Round 2"
- [ ] Current speaker is Bob (second player)
- [ ] Bob's window shows the new card
- [ ] Other windows show guesser views

### 3.2 Speaker View (Window 2 - Bob)
Verify Bob's window shows:
- [ ] New target word displayed (e.g., "Pizza")
- [ ] New forbidden words (e.g., "cheese", "Italian", "dough", "slice", "pepperoni")

### 3.3 Forbidden Word Violation (Window 2 - Bob)
Bob gives a clue with a forbidden word:
- [ ] Click microphone button
- [ ] Deliberately speak: **"Italian food with cheese and dough"**
- [ ] Wait for processing

**Verification in ALL 4 windows:**
- [ ] Red feedback banner: "Forbidden word detected! Bob said: Italian, cheese, dough (-5 points)"
- [ ] Bob's score immediately decreases by 5 points
- [ ] Clue is NOT broadcast to guessers
- [ ] No clue appears in guesser windows
- [ ] Round continues (not ended)

### 3.4 Valid Clue After Penalty (Window 2 - Bob)
Bob gives a valid clue:
- [ ] Click microphone button
- [ ] Speak: **"Round flat food that is baked"**
- [ ] Verify clue is broadcast

**Verification in guesser windows:**
- [ ] Clue appears with "Clue #1" badge
- [ ] (Previous forbidden attempt doesn't count)

### 3.5 Another Valid Clue (Window 2 - Bob)
- [ ] Give clue: **"Often delivered to your home in a box"**

### 3.6 Correct Guess (Window 4 - Diana)
Diana guesses correctly:
- [ ] Type "Pizza" in guess input
- [ ] Click submit

**Verification in ALL 4 windows:**
- [ ] Green success banner
- [ ] Bob gets points (but reduced from the -5 penalty)
- [ ] Diana gets points
- [ ] Round 3 begins
- [ ] Speaker rotates to Charlie

---

## Phase 4: Round 3 - Guesser Exhaustion

### 4.1 Round 3 Setup Verification
Verify in ALL 4 windows:
- [ ] ScoreBoard displays "Round 3"
- [ ] Current speaker is Charlie (third player)
- [ ] Charlie's window shows new card
- [ ] Scoreboard reflects all previous scores

### 4.2 Multiple Clues (Window 3 - Charlie)
Charlie gives clues for the round:
- [ ] Give Clue #1: *appropriate clue*
- [ ] Give Clue #2: *appropriate clue*
- [ ] Give Clue #3: *appropriate clue*

### 4.3 Three Incorrect Guesses (Window 1 - Alice)
Alice exhausts all guesses:

**First Guess:**
- [ ] Type incorrect word (e.g., "Car")
- [ ] Click submit
- [ ] Verify guesses remaining: 2/3

**Second Guess:**
- [ ] Type another incorrect word (e.g., "Boat")
- [ ] Click submit
- [ ] Verify guesses remaining: 1/3

**Third Guess:**
- [ ] Type another incorrect word (e.g., "Plane")
- [ ] Click submit
- [ ] Verify guesses remaining: 0/3 (all gray X marks)

**Verification in Alice's window:**
- [ ] Guess input field is disabled
- [ ] Submit button shows "🚫 No Guesses Left"
- [ ] Submit button is disabled (gray)
- [ ] Feedback shows "Incorrect guess" for each attempt

### 4.4 Other Player Correct Guess (Window 2 - Bob)
Since Alice is exhausted, Bob guesses:
- [ ] Bob still has 3 guesses available
- [ ] Bob types the correct answer
- [ ] Click submit

**Verification in ALL 4 windows:**
- [ ] Round ends successfully
- [ ] Charlie (speaker) and Bob (guesser) receive points
- [ ] Alice receives NO points (exhausted guesses)
- [ ] Round 4 begins
- [ ] Speaker rotates to Diana

---

## Phase 5: Advanced Feature Testing

### 5.1 Disconnect and Reconnect
**Test disconnection handling:**
- [ ] Close Window 4 (Diana's browser)
- [ ] Verify in remaining windows: Diana disappears from player list
- [ ] If all players disconnect: verify room is deleted
- [ ] Reopen Window 4 and reconnect (if room still exists)

### 5.2 Speech Recognition Edge Cases
Test various speech recognition scenarios:

**Partial Words:**
- [ ] Speaker says something that sounds like forbidden word
- [ ] Verify detection is based on normalized substring matching

**Case Insensitivity:**
- [ ] Speaker says "CHEESE" (all caps)
- [ ] Verify forbidden word is still detected

**Punctuation:**
- [ ] Speaker says "cheese!" with punctuation
- [ ] Verify forbidden word is detected (punctuation removed)

### 5.3 Concurrent Guessing
Test multiple guessers submitting at once:
- [ ] Have Bob, Charlie, and Diana all type guesses
- [ ] All click submit within ~1 second
- [ ] Verify only the first correct guess triggers round end
- [ ] Verify server processes guesses in order

### 5.4 Browser Compatibility
Test on different browsers:
- [ ] Chrome: Speech recognition works
- [ ] Edge: Speech recognition works
- [ ] Firefox: Falls back gracefully (no speech recognition)
- [ ] Safari: Speech recognition works (with webkit prefix)

---

## Phase 6: UI/UX Verification

### 6.1 Responsive Design
Test on different screen sizes:

**Desktop (>1024px):**
- [ ] Two-column layout: Main content (left), Sidebar (right)
- [ ] All elements properly sized
- [ ] Scoreboard horizontal layout

**Tablet (768px - 1024px):**
- [ ] Two-column layout maintained
- [ ] Text sizes adjust appropriately
- [ ] Touch targets minimum 48×48px

**Mobile (<768px):**
- [ ] Single column vertical stack
- [ ] Scoreboard elements stack vertically
- [ ] Microphone button remains large and tappable
- [ ] All buttons have adequate spacing

### 6.2 Touch Target Verification
Verify all interactive elements meet accessibility standards:
- [ ] Microphone button: ≥128×128px
- [ ] Guess submit button: ≥56px height
- [ ] Player avatars in scoreboard: ≥48×48px
- [ ] All form inputs: ≥56px height

### 6.3 Color Contrast
Verify readability:
- [ ] Target word (white on green): High contrast ✓
- [ ] Forbidden words (dark red on light red): High contrast ✓
- [ ] Score text: Dark on light backgrounds
- [ ] Buttons: Clear text on colored backgrounds

### 6.4 Loading States
- [ ] Initial room loading shows spinner
- [ ] Game loading shows spinner
- [ ] Waiting for card shows placeholder
- [ ] All states have appropriate messages

---

## Phase 7: Scoring Accuracy Tests

### 7.1 Scoring Formula Verification

**Test Case: 1 Clue Used**
- [ ] Speaker gives 1 clue
- [ ] Guesser guesses correctly on first try
- [ ] Expected: Speaker +6, Guesser +4
- [ ] Bonus: Speaker +3 (3 unused clues), Guesser +2 (2 unused guesses)
- [ ] **Total: Speaker +9, Guesser +6**

**Test Case: 3 Clues Used**
- [ ] Speaker gives 3 clues
- [ ] Guesser guesses correctly with 2 incorrect attempts
- [ ] Expected: Speaker +5, Guesser +3
- [ ] Bonus: Speaker +1 (1 unused clue), Guesser +0.5 (1 unused guess)
- [ ] **Total: Speaker +6, Guesser +3.5**

**Test Case: 5+ Clues Used**
- [ ] Speaker gives 5 or more clues
- [ ] Expected: Speaker +0, Guesser +0
- [ ] No bonuses
- [ ] **Total: 0 points each**

### 7.2 Team Score Aggregation
- [ ] Assign players to teams
- [ ] Verify individual scores sum correctly to team scores
- [ ] Team A = sum of Team A player scores
- [ ] Team B = sum of Team B player scores

### 7.3 Penalty Verification
- [ ] Each forbidden word violation: -5 points
- [ ] Multiple violations in one clue: -5 per word
- [ ] Score cannot go negative (or can - verify expected behavior)

---

## Phase 8: State Synchronization Tests

### 8.1 Real-Time Updates
Verify instant synchronization across all windows:
- [ ] Clue broadcast: All guessers see clue within 100ms
- [ ] Guess result: All players see result within 100ms
- [ ] Score update: All scoreboards update simultaneously
- [ ] Round transition: All clients transition together

### 8.2 Round Transition Integrity
- [ ] All clue history cleared properly
- [ ] Guess counts reset to 0/3
- [ ] New card assigned to new speaker
- [ ] Speaker rotation follows correct order
- [ ] Round number increments correctly

### 8.3 Player State Consistency
Verify player state is consistent across all clients:
- [ ] guessesUsed tracked per player per round
- [ ] currentClueGiver correctly identified
- [ ] Player teams remain consistent
- [ ] Scores update atomically

---

## Phase 9: Error Handling Tests

### 9.1 Invalid Actions
Test edge cases and invalid operations:

**Non-Speaker Attempts to Give Clue:**
- [ ] Guesser clicks (no mic button visible)
- [ ] Verify guessers cannot send clues

**Speaker Attempts to Guess:**
- [ ] Verify speaker has no guess input
- [ ] Speaker view shows card, not guess form

**Duplicate Room Join:**
- [ ] Try joining same room twice with same socket
- [ ] Verify error message: "You are already in this room"

**Invalid Room ID:**
- [ ] Try joining with non-existent room ID
- [ ] Verify error: "Room not found"

### 9.2 Network Issues
Simulate network problems:
- [ ] Disconnect internet briefly during game
- [ ] Verify "Connecting..." status appears
- [ ] Reconnect and verify game state syncs
- [ ] Check if missed events are handled gracefully

---

## Final Checklist

### Functional Requirements
- [ ] ✅ Room creation and joining works
- [ ] ✅ 4-player lobby enforced
- [ ] ✅ Game starts correctly
- [ ] ✅ Card distribution works
- [ ] ✅ Speech recognition captures clues
- [ ] ✅ Forbidden word detection accurate
- [ ] ✅ Clue broadcasting works
- [ ] ✅ Guess submission works
- [ ] ✅ Correct/incorrect guess handling
- [ ] ✅ Scoring calculation accurate
- [ ] ✅ Round transitions smooth
- [ ] ✅ Speaker rotation correct
- [ ] ✅ Team scores aggregate properly

### Non-Functional Requirements
- [ ] ✅ Responsive design works on all screen sizes
- [ ] ✅ Touch targets meet 48×48px minimum
- [ ] ✅ High contrast colors used
- [ ] ✅ Real-time updates < 200ms latency
- [ ] ✅ Browser compatibility verified
- [ ] ✅ Loading states appropriate
- [ ] ✅ Error messages clear and helpful

### Performance Metrics
- [ ] Page load time < 3 seconds
- [ ] Socket connection time < 1 second
- [ ] Message propagation < 200ms
- [ ] No memory leaks after 10+ rounds
- [ ] Smooth animations and transitions

---

## Bug Reporting Template

When issues are found, document using this format:

```markdown
**Bug ID:** BUG-001
**Severity:** High/Medium/Low
**Area:** Lobby/Game/Scoring/UI
**Description:** Clear description of the issue
**Steps to Reproduce:**
1. Step one
2. Step two
3. Step three
**Expected Result:** What should happen
**Actual Result:** What actually happens
**Browser/Device:** Chrome 120, Windows 11
**Screenshots:** [Attach if applicable]
**Additional Notes:** Any other relevant information
```

---

## Test Sign-Off

**Test Date:** _____________
**Tester Name:** _____________
**Test Environment:** _____________
**Overall Result:** ☐ PASS  ☐ FAIL  ☐ PASS WITH ISSUES

**Issues Found:** ___ Critical, ___ High, ___ Medium, ___ Low

**Notes:**
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________

**Approved By:** _____________  **Date:** _____________
