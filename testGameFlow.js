const { chromium } = require('playwright');

(async () => {
  try {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    
    const player1 = await context.newPage();

    player1.on('console', msg => {
      const text = msg.text();
      if (text.includes('Room') || text.includes('emit') || text.includes('[')) {
        console.log('[PAGE]', text);
      }
    });

    const gameUrl = 'http://localhost:3000/join';

    console.log('\n===== PLAYER 1: Creating Room =====');
    await player1.goto(gameUrl);
    
    // Wait for connected
    await player1.waitForSelector('text=Connected', { timeout: 10000 });
    console.log('✓ Connected to socket');

    // Step 1: Fill player name in menu mode
    console.log('✓ Filling player name...');
    await player1.fill('input[placeholder="Enter your name"]', 'Player 1');

    // Step 2: Click "Create New Room" button to switch to create mode
    console.log('✓ Switching to create mode...');
    await player1.locator('button', { hasText: 'Create New Room' }).first().click();
    
    // Wait for create form to appear
    await player1.waitForSelector('form', { timeout: 5000 });
    console.log('✓ Create form appeared');

    // Step 3: Click the actual submit button in the form (which also says "Create Room")
    console.log('✓ Clicking Create Room submit button...');
    const createFormBtn = player1.locator('form').first().locator('button[type="submit"]');
    
    // Wait for navigation
    await Promise.all([
      player1.waitForURL(/\/room\//, { timeout: 15000 }).catch(() => 'timeout'),
      createFormBtn.click()
    ]);

    const roomId = player1.url().split('/').pop();
    if (roomId.includes('join')) {
      console.log('❌ Navigation failed, still on join page');
      process.exit(1);
    }

    console.log(`✅ Room created: ${roomId}`);

    // ===== OTHER PLAYERS =====
    const players = [];
    for (let i = 2; i <= 4; i++) {
      console.log(`\n===== PLAYER ${i}: Joining Room =====`);
      const player = await context.newPage();
      players.push(player);

      await player.goto(gameUrl);
      await player.waitForSelector('text=Connected', { timeout: 10000 });
      console.log('✓ Connected');

      // Fill name
      await player.fill('input[placeholder="Enter your name"]', `Player ${i}`);

      // Click "Join Existing Room"
      await player.locator('button', { hasText: 'Join Existing Room' }).first().click();
      await player.waitForSelector('input[placeholder="Enter room ID"]', { timeout: 5000 });
      console.log('✓ Join form appeared');

      // Fill room ID
      await player.fill('input[placeholder="Enter room ID"]', roomId);

      // Click Join button
      const joinBtn = player.locator('form').first().locator('button[type="submit"]');
      await Promise.all([
        player.waitForURL(/\/room\//, { timeout: 15000 }),
        joinBtn.click()
      ]);

      console.log(`✅ Player ${i} joined`);
    }

    console.log('\n===== ALL PLAYERS READY =====');
    await player1.waitForTimeout(2000);

    // Player 1 starts game
    console.log('✓ Starting game...');
    const startBtn = player1.locator('button', { hasText: 'Start Game' });
    
    await Promise.all([
      player1.waitForURL(/\/game/, { timeout: 15000 }),
      startBtn.click()
    ]);

    console.log('✅ Game started');

    // Wait for others
    for (const player of players) {
      await player.waitForURL(/\/game/, { timeout: 15000 });
    }

    console.log('✅ All players on game page');

    // Check for card display
    const cardDisplay = await player1.waitForSelector('text=Your Card', { timeout: 10000 });
    console.log('✅ Card displayed for speaker!');

    console.log('\n🎉 TEST PASSED! 🎉\n');
    console.log('========================================');
    console.log('Browser will stay open for 2 minutes');
    console.log('You can now test the game manually!');
    console.log('========================================\n');

    // Wait for 2 minutes (120 seconds)
    await player1.waitForTimeout(120000);

    console.log('\nClosing browser...');
    await browser.close();
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
})();