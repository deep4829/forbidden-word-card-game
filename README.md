# Forbidden Word Card Game

A real-time multiplayer word guessing game where players give clues without using forbidden words!

## 🔧 Initial Setup (Required)

### ⚠️ Important: Configure Supabase First

This game uses **Supabase** to manage game cards securely. Before running:

1. **[Follow the Supabase Setup Guide](SUPABASE_SETUP.md)** (takes 5 minutes)
2. Create `.env.local` in the `server/` directory with your credentials
3. Add at least 10 cards to your Supabase table

This prevents exposing cards.json during deployment.

---

##  Running with HTTPS (Recommended for Microphone)

For full microphone support and encrypted connections, use HTTPS:

```bash
# Option 1: Quick start with PowerShell
.\START_HTTPS.ps1

# Option 2: Manual start
# Terminal 1
cd server && npm run dev:https

# Terminal 2  
cd web && npm run dev:https
```

Then visit: **https://localhost:3000**

See [HTTPS_QUICK_START.md](HTTPS_QUICK_START.md) for complete setup guide.

---

## 🎮 How to Play

### Setup (HTTP)
1. **Server is running on**: http://localhost:4000
2. **Game is running on**: http://localhost:3000

### Setup (HTTPS - Recommended)
1. **Server is running on**: https://localhost:4000
2. **Game is running on**: https://localhost:3000

### Quick Start

1. **Open the game**: Navigate to http://localhost:3000 (or https://localhost:3000)

2. **Create a Room** (Player 1):
   - Enter your name
   - Click "Create New Room"
   - Share the Room ID with your friends

3. **Join the Room** (Players 2-4):
   - Enter your name
   - Click "Join Existing Room"
   - Enter the Room ID
   - Click "Join Room"

4. **Start the Game**:
   - Wait for all 4 players to join
   - The host (first player) clicks "Start Game"

### Game Rules

#### As the Speaker (Clue Giver):
- You'll see a **Target Word** (the word guessers need to guess)
- You'll see **Forbidden Words** (words you cannot say)
- **Option 1:** Click 🎤 microphone button and speak your clues
- **Option 2:** Click 📝 "Text Mode" and type your clues
- Be careful! If you say a forbidden word, you lose 5 points
- Give clear clues without using forbidden words

#### As a Guesser:
- Listen to the speaker's clues
- You have **3 guesses** per round
- Type your guess and submit
- Correct guess = points for you and the speaker!
- Wrong guess = try again (if you have guesses left)

### Scoring System

**Base Points (depends on clues used):**
- 1-2 clues: Speaker +6, Guesser +4
- 3-4 clues: Speaker +5, Guesser +3
- 5+ clues: No points

**Bonus Points:**
- Speaker: +1 per unused clue (max 4 clues)
- Guesser: +0.5 per unused guess (max 3 guesses)

**Penalties:**
- Forbidden word: -5 points per word

### Example Round

**Target Word**: Ocean  
**Forbidden Words**: water, sea, blue, fish, beach

**Good Clues:**
- "Large body of salty liquid" ✅
- "Where ships sail and waves crash" ✅

**Bad Clues:**
- "Blue water with fish" ❌ (contains forbidden words)

## 🎯 Testing the Game

### Quick Test (Single Browser)
1. Open 4 tabs/windows in your browser
2. Go to http://localhost:3000 (or https://localhost:3000) in each
3. Create room in Tab 1, join from Tabs 2-4
4. Start playing!

### Multi-Device Test
1. Get the Network URL from terminal (e.g., http://192.168.1.6:3000)
2. Open on different devices on same network
3. Create/join rooms and play together

## 🔧 Technical Details

### Architecture
- **Frontend**: Next.js 16 with TypeScript, Tailwind CSS
- **Backend**: Node.js with Socket.IO for real-time communication
- **Speech Recognition**: Web Speech API (Chrome/Edge/Safari)

### Key Features
- ✅ Real-time multiplayer (4 players)
- ✅ Voice-based clue giving
- ✅ Forbidden word detection
- ✅ Automatic scoring calculation
- ✅ Round-robin speaker rotation
- ✅ Responsive design (mobile/tablet/desktop)
- ✅ Team scoring system

## 📱 Browser Support

### Recommended Browsers
- **Google Chrome** (Best support for speech recognition)
- **Microsoft Edge** (Full support)
- **Safari** (macOS/iOS - Full support)

### Limited Support
- **Firefox** (No speech recognition - can only play as guesser)

## 🐛 Troubleshooting

### Can't connect to server
- Ensure server is running on port 4000
- Check terminal for "Server is running on port 4000"

### Speech recognition not working
- Use Chrome, Edge, or Safari
- Allow microphone permissions when prompted
- Check browser console for errors

### Room not found
- Double-check the Room ID
- Make sure the room creator hasn't left
- Create a new room if needed

### Port already in use
- Kill the process: `Stop-Process -Id [PID] -Force`
- Or use a different port in the .env.local file

## 🎨 Game Features

### Speaker View
- Card display with target word
- Forbidden words highlighted in red
- Voice control with microphone button
- Live transcript of your speech

### Guesser View
- Real-time clue history
- Guess input form
- Remaining guesses tracker
- Team and individual scores

### Scoreboard
- Current round number
- Active speaker indicator
- Team A & Team B scores
- Individual player scores
- Player role indicators

## 🏆 Winning Strategy

1. **As Speaker**:
   - Give concise, clear clues
   - Use 1-2 clues for maximum points
   - Avoid words similar to forbidden words
   - Think before speaking!

2. **As Guesser**:
   - Listen carefully to ALL clues
   - Think about word associations
   - Save guesses - you only get 3!
   - Consider the category/context

## 🎉 Have Fun!

The game is now fully playable! Gather 3 friends and start playing at:

**http://localhost:3000**

Enjoy the game! 🎮✨
