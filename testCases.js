const { io } = require('socket.io-client');

const BACKEND_URL = 'http://localhost:4000';

/**
 * Test Suite for Forbidden Word Game
 * Tests cover:
 * 1. Room Creation and Management
 * 2. Player Joining
 * 3. Game Flow
 * 4. Card Assignment
 * 5. Clue Giving and Broadcasting
 * 6. Guess Submission
 * 7. Score Calculation
 * 8. Duplicate Prevention
 * 9. Forbidden Word Detection
 * 10. 3-Guess Limit Enforcement
 */

class GameTestSuite {
  constructor() {
    this.testsPassed = 0;
    this.testsFailed = 0;
    this.results = [];
  }

  // Helper function to create a client socket
  createClient(name) {
    return io(BACKEND_URL, {
      reconnection: true,
      reconnectionDelay: 100,
      reconnectionDelayMax: 1000,
      reconnectionAttempts: 5,
    });
  }

  // Helper function to wait for event
  waitForEvent(socket, eventName, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(eventName);
        reject(new Error(`Timeout waiting for event: ${eventName}`));
      }, timeout);

      socket.once(eventName, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  // Test Helper
  async test(name, testFunc) {
    try {
      console.log(`\n▶ Running: ${name}`);
      await testFunc();
      this.testsPassed++;
      this.results.push({ name, status: '✅ PASS' });
      console.log(`✅ PASS: ${name}`);
    } catch (error) {
      this.testsFailed++;
      this.results.push({ name, status: `❌ FAIL: ${error.message}` });
      console.error(`❌ FAIL: ${name}`);
      console.error(`   Error: ${error.message}`);
    }
  }

  // TEST 1: Room Creation
  async testRoomCreation() {
    await this.test('Room Creation - Host creates room', async () => {
      const host = this.createClient('Host');
      
      try {
        await new Promise((resolve) => {
          host.on('connect', () => {
            host.emit('create-room', 'Host Player');
          });

          host.on('room-created', (data) => {
            if (!data.roomId) throw new Error('Room ID not generated');
            if (data.room.players.length !== 1) throw new Error('Room should have 1 player');
            resolve();
          });
        });
      } finally {
        host.disconnect();
      }
    });
  }

  // TEST 2: Player Joining
  async testPlayerJoining() {
    await this.test('Player Joining - Multiple players join room', async () => {
      const host = this.createClient('Host');
      let roomId = null;

      await new Promise((resolve) => {
        host.on('connect', () => {
          host.emit('create-room', 'Host');
        });

        host.on('room-created', (data) => {
          roomId = data.roomId;
          resolve();
        });
      });

      // Join 1 more player (minimum to start is 2)
      const players = [];
      for (let i = 1; i <= 1; i++) {
        const player = this.createClient(`Player ${i}`);
        players.push(player);

        await new Promise((resolve) => {
          player.on('connect', () => {
            player.emit('join-room', { roomId, playerName: `Player ${i}` });
          });

          player.on('room-joined', () => {
            resolve();
          });
        });
      }

      // Verify room has 2 players
      await new Promise((resolve) => {
        host.once('room-updated', (room) => {
          if (room.players.length !== 2) throw new Error('Room should have 2 players');
          resolve();
        });

        host.emit('get-room', roomId);
      });

      host.disconnect();
      players.forEach(p => p.disconnect());
    });
  }

  // TEST 3: Game Start
  async testGameStart() {
    await this.test('Game Start - Host starts game with 2+ players', async () => {
      const host = this.createClient('Host');
      let roomId = null;
      const players = [];

      // Create room
      await new Promise((resolve) => {
        host.on('connect', () => {
          host.emit('create-room', 'Host');
        });

        host.on('room-created', (data) => {
          roomId = data.roomId;
          resolve();
        });
      });

      // Join 1 more player (total 2)
      for (let i = 1; i <= 1; i++) {
        const player = this.createClient(`Player ${i}`);
        players.push(player);

        await new Promise((resolve) => {
          player.on('connect', () => {
            player.emit('join-room', { roomId, playerName: `Player ${i}` });
          });

          player.on('room-joined', () => {
            resolve();
          });
        });
      }

      // Start game
      let gameStarted = false;
      await new Promise((resolve) => {
        host.on('game-started', (data) => {
          gameStarted = true;
          if (!data.room) throw new Error('Game started event missing room data');
          if (!data.currentClueGiver) throw new Error('No current clue giver assigned');
          resolve();
        });

        host.emit('start-game', roomId);
      });

      if (!gameStarted) throw new Error('Game did not start');

      host.disconnect();
      players.forEach(p => p.disconnect());
    });
  }

  // TEST 4: Card Assignment to Speaker
  async testCardAssignment() {
    await this.test('Card Assignment - Speaker receives card', async () => {
      const host = this.createClient('Host');
      const guesser = this.createClient('Guesser');
      let roomId = null;
      let cardReceived = false;

      // Create and setup room
      await new Promise((resolve) => {
        host.on('connect', () => {
          host.emit('create-room', 'Host');
        });

        host.on('room-created', (data) => {
          roomId = data.roomId;
          resolve();
        });
      });

      // Add more players
      const players = [];
      for (let i = 1; i <= 3; i++) {
        const p = this.createClient(`Player ${i}`);
        players.push(p);
        await new Promise((resolve) => {
          p.on('connect', () => {
            p.emit('join-room', { roomId, playerName: `Player ${i}` });
          });
          p.on('room-joined', () => resolve());
        });
      }

      // Start game
      await new Promise((resolve) => {
        host.on('game-started', () => {
          resolve();
        });
        host.emit('start-game', roomId);
      });

      // Check if speaker receives card
      await new Promise((resolve) => {
        host.on('card-assigned', (data) => {
          if (!data.card) throw new Error('Card not assigned');
          if (!data.card.mainWord) throw new Error('Card missing main word');
          cardReceived = true;
          resolve();
        });
      });

      if (!cardReceived) throw new Error('Card was not received by speaker');

      host.disconnect();
      guesser.disconnect();
      players.forEach(p => p.disconnect());
    });
  }

  // TEST 5: Clue Submission
  async testClueSubmission() {
    await this.test('Clue Submission - Speaker gives valid clue', async () => {
      const host = this.createClient('Speaker');
      const players = [];
      let roomId = null;
      let clueReceived = false;

      // Setup game
      await new Promise((resolve) => {
        host.on('connect', () => {
          host.emit('create-room', 'Speaker');
        });

        host.on('room-created', (data) => {
          roomId = data.roomId;
          resolve();
        });
      });

      for (let i = 1; i <= 3; i++) {
        const p = this.createClient(`Player ${i}`);
        players.push(p);
        await new Promise((resolve) => {
          p.on('connect', () => {
            p.emit('join-room', { roomId, playerName: `Player ${i}` });
          });
          p.on('room-joined', () => resolve());
        });
      }

      // Start game
      await new Promise((resolve) => {
        host.on('game-started', () => resolve());
        host.emit('start-game', roomId);
      });

      // Wait for card
      await new Promise((resolve) => {
        host.on('card-assigned', () => resolve());
      });

      // Submit clue
      await new Promise((resolve) => {
        players[0].on('clue-broadcast', (data) => {
          if (!data.transcript) throw new Error('Clue not broadcast');
          if (data.clueCount !== 1) throw new Error('Clue count should be 1');
          clueReceived = true;
          resolve();
        });

        host.emit('speaker-transcript', { roomId, transcript: 'yellow fruit' });
      });

      if (!clueReceived) throw new Error('Clue was not broadcast to players');

      host.disconnect();
      players.forEach(p => p.disconnect());
    });
  }

  // TEST 6: Duplicate Clue Prevention
  async testDuplicateCluePrevention() {
    await this.test('Duplicate Prevention - Same clue rejected', async () => {
      const host = this.createClient('Speaker');
      const players = [];
      let roomId = null;
      let errorReceived = false;

      // Setup game
      await new Promise((resolve) => {
        host.on('connect', () => {
          host.emit('create-room', 'Speaker');
        });

        host.on('room-created', (data) => {
          roomId = data.roomId;
          resolve();
        });
      });

      for (let i = 1; i <= 3; i++) {
        const p = this.createClient(`Player ${i}`);
        players.push(p);
        await new Promise((resolve) => {
          p.on('connect', () => {
            p.emit('join-room', { roomId, playerName: `Player ${i}` });
          });
          p.on('room-joined', () => resolve());
        });
      }

      // Start game
      await new Promise((resolve) => {
        host.on('game-started', () => resolve());
        host.emit('start-game', roomId);
      });

      // Wait for card
      await new Promise((resolve) => {
        host.on('card-assigned', () => resolve());
      });

      // Submit first clue
      await new Promise((resolve) => {
        players[0].once('clue-broadcast', () => resolve());
        host.emit('speaker-transcript', { roomId, transcript: 'yellow fruit' });
      });

      // Try to submit same clue again (case-insensitive)
      await new Promise((resolve) => {
        host.on('error', (data) => {
          if (data.message.includes('already gave')) {
            errorReceived = true;
          }
          resolve();
        });

        host.emit('speaker-transcript', { roomId, transcript: 'YELLOW FRUIT' });
      });

      if (!errorReceived) throw new Error('Duplicate clue was not rejected');

      host.disconnect();
      players.forEach(p => p.disconnect());
    });
  }

  // TEST 7: Guess Submission
  async testGuessSubmission() {
    await this.test('Guess Submission - Guesser submits guess', async () => {
      const speaker = this.createClient('Speaker');
      const guesser = this.createClient('Guesser');
      const players = [];
      let roomId = null;
      let guessResult = null;

      // Setup game
      await new Promise((resolve) => {
        speaker.on('connect', () => {
          speaker.emit('create-room', 'Speaker');
        });

        speaker.on('room-created', (data) => {
          roomId = data.roomId;
          resolve();
        });
      });

      // Add players
      players.push(guesser);
      for (let i = 1; i <= 2; i++) {
        const p = this.createClient(`Player ${i}`);
        players.push(p);
      }

      for (let i = 0; i < players.length; i++) {
        await new Promise((resolve) => {
          players[i].on('connect', () => {
            players[i].emit('join-room', { roomId, playerName: `Player ${i}` });
          });
          players[i].on('room-joined', () => resolve());
        });
      }

      // Start game
      await new Promise((resolve) => {
        speaker.on('game-started', () => resolve());
        speaker.emit('start-game', roomId);
      });

      // Wait for card
      let targetCard = null;
      await new Promise((resolve) => {
        speaker.on('card-assigned', (data) => {
          targetCard = data.card;
          resolve();
        });
      });

      // Give a clue
      await new Promise((resolve) => {
        players[0].once('clue-broadcast', () => resolve());
        speaker.emit('speaker-transcript', { roomId, transcript: 'test clue' });
      });

      // Make a guess
      await new Promise((resolve) => {
        guesser.on('guess-result', (data) => {
          guessResult = data;
          resolve();
        });

        guesser.emit('guesser-guess', { roomId, guess: 'wrong answer' });
      });

      if (!guessResult) throw new Error('Guess result not received');
      if (guessResult.correct) throw new Error('Wrong answer marked as correct');
      if (guessResult.guessesUsed !== 1) throw new Error('Guess count should be 1');

      speaker.disconnect();
      players.forEach(p => p.disconnect());
    });
  }

  // TEST 8: Duplicate Guess Prevention
  async testDuplicateGuessPrevention() {
    await this.test('Duplicate Prevention - Same guess rejected', async () => {
      const speaker = this.createClient('Speaker');
      const guesser = this.createClient('Guesser');
      const players = [];
      let roomId = null;
      let errorReceived = false;

      // Setup game
      await new Promise((resolve) => {
        speaker.on('connect', () => {
          speaker.emit('create-room', 'Speaker');
        });

        speaker.on('room-created', (data) => {
          roomId = data.roomId;
          resolve();
        });
      });

      // Add players
      players.push(guesser);
      for (let i = 1; i <= 2; i++) {
        const p = this.createClient(`Player ${i}`);
        players.push(p);
      }

      for (let i = 0; i < players.length; i++) {
        await new Promise((resolve) => {
          players[i].on('connect', () => {
            players[i].emit('join-room', { roomId, playerName: `Player ${i}` });
          });
          players[i].on('room-joined', () => resolve());
        });
      }

      // Start game
      await new Promise((resolve) => {
        speaker.on('game-started', () => resolve());
        speaker.emit('start-game', roomId);
      });

      // Wait for card
      await new Promise((resolve) => {
        speaker.on('card-assigned', () => resolve());
      });

      // Give a clue
      await new Promise((resolve) => {
        players[0].once('clue-broadcast', () => resolve());
        speaker.emit('speaker-transcript', { roomId, transcript: 'test clue' });
      });

      // First guess
      await new Promise((resolve) => {
        guesser.once('guess-result', () => resolve());
        guesser.emit('guesser-guess', { roomId, guess: 'wrong' });
      });

      // Try same guess again
      await new Promise((resolve) => {
        guesser.on('error', (data) => {
          if (data.message.includes('already made')) {
            errorReceived = true;
          }
          resolve();
        });

        guesser.emit('guesser-guess', { roomId, guess: 'WRONG' }); // Case-insensitive
      });

      if (!errorReceived) throw new Error('Duplicate guess was not rejected');

      speaker.disconnect();
      players.forEach(p => p.disconnect());
    });
  }

  // TEST 9: 3-Guess Limit
  async testGuessLimit() {
    await this.test('Guess Limit - Only 3 guesses per round', async () => {
      const speaker = this.createClient('Speaker');
      const guesser = this.createClient('Guesser');
      const players = [];
      let roomId = null;

      // Setup game
      await new Promise((resolve) => {
        speaker.on('connect', () => {
          speaker.emit('create-room', 'Speaker');
        });

        speaker.on('room-created', (data) => {
          roomId = data.roomId;
          resolve();
        });
      });

      // Add players
      players.push(guesser);
      for (let i = 1; i <= 2; i++) {
        const p = this.createClient(`Player ${i}`);
        players.push(p);
      }

      for (let i = 0; i < players.length; i++) {
        await new Promise((resolve) => {
          players[i].on('connect', () => {
            players[i].emit('join-room', { roomId, playerName: `Player ${i}` });
          });
          players[i].on('room-joined', () => resolve());
        });
      }

      // Start game
      await new Promise((resolve) => {
        speaker.on('game-started', () => resolve());
        speaker.emit('start-game', roomId);
      });

      // Wait for card
      await new Promise((resolve) => {
        speaker.on('card-assigned', () => resolve());
      });

      // Give a clue
      await new Promise((resolve) => {
        players[0].once('clue-broadcast', () => resolve());
        speaker.emit('speaker-transcript', { roomId, transcript: 'test clue' });
      });

      // Make 3 different guesses
      for (let i = 1; i <= 3; i++) {
        await new Promise((resolve) => {
          guesser.once('guess-result', (data) => {
            if (data.guessesUsed !== i) throw new Error(`Guess count should be ${i}`);
            resolve();
          });

          guesser.emit('guesser-guess', { roomId, guess: `guess${i}` });
        });
      }

      // Try 4th guess
      let fourthGuessRejected = false;
      await new Promise((resolve) => {
        guesser.on('error', (data) => {
          if (data.message.includes('Maximum guesses')) {
            fourthGuessRejected = true;
          }
          resolve();
        });

        guesser.emit('guesser-guess', { roomId, guess: 'guess4' });
      });

      if (!fourthGuessRejected) throw new Error('4th guess was not rejected');

      speaker.disconnect();
      players.forEach(p => p.disconnect());
    });
  }

  // TEST 10: Forbidden Word Detection
  async testForbiddenWordDetection() {
    await this.test('Forbidden Word Detection - Penalty applied', async () => {
      const speaker = this.createClient('Speaker');
      const players = [];
      let roomId = null;
      let forbiddenDetected = false;

      // Setup game
      await new Promise((resolve) => {
        speaker.on('connect', () => {
          speaker.emit('create-room', 'Speaker');
        });

        speaker.on('room-created', (data) => {
          roomId = data.roomId;
          resolve();
        });
      });

      // Add players
      for (let i = 1; i <= 3; i++) {
        const p = this.createClient(`Player ${i}`);
        players.push(p);
      }

      for (let i = 0; i < players.length; i++) {
        await new Promise((resolve) => {
          players[i].on('connect', () => {
            players[i].emit('join-room', { roomId, playerName: `Player ${i}` });
          });
          players[i].on('room-joined', () => resolve());
        });
      }

      // Start game
      await new Promise((resolve) => {
        speaker.on('game-started', () => resolve());
        speaker.emit('start-game', roomId);
      });

      // Wait for card
      let mainWord = null;
      await new Promise((resolve) => {
        speaker.on('card-assigned', (data) => {
          mainWord = data.card.mainWord;
          resolve();
        });
      });

      // Try to give clue with forbidden word (the main word itself)
      await new Promise((resolve) => {
        players[0].on('forbidden-detected', (data) => {
          forbiddenDetected = true;
          if (data.penalty !== -5) throw new Error('Penalty should be -5');
          resolve();
        });

        speaker.emit('speaker-transcript', { roomId, transcript: mainWord });
      });

      if (!forbiddenDetected) throw new Error('Forbidden word was not detected');

      speaker.disconnect();
      players.forEach(p => p.disconnect());
    });
  }

  // TEST 11: Clue Limit (4 clues max)
  async testClueLimit() {
    await this.test('Clue Limit - Maximum 4 clues per round', async () => {
      const speaker = this.createClient('Speaker');
      const players = [];
      let roomId = null;

      // Setup game
      await new Promise((resolve) => {
        speaker.on('connect', () => {
          speaker.emit('create-room', 'Speaker');
        });

        speaker.on('room-created', (data) => {
          roomId = data.roomId;
          resolve();
        });
      });

      // Add players
      for (let i = 1; i <= 3; i++) {
        const p = this.createClient(`Player ${i}`);
        players.push(p);
      }

      for (let i = 0; i < players.length; i++) {
        await new Promise((resolve) => {
          players[i].on('connect', () => {
            players[i].emit('join-room', { roomId, playerName: `Player ${i}` });
          });
          players[i].on('room-joined', () => resolve());
        });
      }

      // Start game
      await new Promise((resolve) => {
        speaker.on('game-started', () => resolve());
        speaker.emit('start-game', roomId);
      });

      // Wait for card
      await new Promise((resolve) => {
        speaker.on('card-assigned', () => resolve());
      });

      // Give 4 clues
      for (let i = 1; i <= 4; i++) {
        await new Promise((resolve) => {
          players[0].once('clue-broadcast', (data) => {
            if (data.clueCount !== i) throw new Error(`Clue count should be ${i}`);
            resolve();
          });

          speaker.emit('speaker-transcript', { roomId, transcript: `clue${i}` });
        });
      }

      // Try 5th clue
      let fifthClueRejected = false;
      await new Promise((resolve) => {
        speaker.on('error', (data) => {
          if (data.message.includes('Maximum clues')) {
            fifthClueRejected = true;
          }
          resolve();
        });

        speaker.emit('speaker-transcript', { roomId, transcript: 'clue5' });
      });

      if (!fifthClueRejected) throw new Error('5th clue was not rejected');

      speaker.disconnect();
      players.forEach(p => p.disconnect());
    });
  }

  // TEST 12: Error Handling - Invalid Room
  async testInvalidRoomError() {
    await this.test('Error Handling - Invalid room rejection', async () => {
      const player = this.createClient('Player');
      let errorReceived = false;

      await new Promise((resolve) => {
        player.on('connect', () => {
          player.emit('join-room', { roomId: 'invalid-room-id', playerName: 'Player' });
        });

        player.on('error', (data) => {
          if (data.message.includes('Room not found')) {
            errorReceived = true;
          }
          resolve();
        });
      });

      if (!errorReceived) throw new Error('Invalid room error not received');

      player.disconnect();
    });
  }

  // Run all tests
  async runAllTests() {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║   Forbidden Word Game - Test Suite            ║');
    console.log('║   Testing all game features                   ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    await this.testRoomCreation();
    await this.testPlayerJoining();
    await this.testGameStart();
    await this.testCardAssignment();
    await this.testClueSubmission();
    await this.testDuplicateCluePrevention();
    await this.testGuessSubmission();
    await this.testDuplicateGuessPrevention();
    await this.testGuessLimit();
    await this.testForbiddenWordDetection();
    await this.testClueLimit();
    await this.testInvalidRoomError();

    // Print summary
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║         TEST SUITE SUMMARY                    ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    this.results.forEach((result) => {
      console.log(`${result.status} ${result.name}`);
    });

    console.log('\n' + '═'.repeat(50));
    console.log(`Total Tests: ${this.testsPassed + this.testsFailed}`);
    console.log(`✅ Passed: ${this.testsPassed}`);
    console.log(`❌ Failed: ${this.testsFailed}`);
    console.log('═'.repeat(50));

    if (this.testsFailed === 0) {
      console.log('\n🎉 All tests passed!');
    } else {
      console.log(`\n⚠️  ${this.testsFailed} test(s) failed.`);
    }

    process.exit(this.testsFailed > 0 ? 1 : 0);
  }
}

// Run the test suite
const suite = new GameTestSuite();
suite.runAllTests().catch((error) => {
  console.error('Fatal error running test suite:', error);
  process.exit(1);
});
