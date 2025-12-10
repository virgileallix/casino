import { auth, signOut, onAuthStateChanged } from '../core/firebase-config.js';
import { initializeUserBalance, subscribeToUserData, applyGameResult } from '../core/balance-manager.js';

let currentUser = null;
let unsubscribeBalance = null;

// Check if user is logged in
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'pages/auth/login.html';
    } else {
        currentUser = user;
        await initializeUserBalance(user);

        // Subscribe to real-time balance updates
        unsubscribeBalance = subscribeToUserData(user.uid, (data) => {
            if (!data) return;
            balance = data.balance;
            balanceLoaded = true;
            syncStatsFromData(data);
            updateBalance();
            setPlayingState(false);
        });
    }
});

// Logout functionality
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    try {
        if (unsubscribeBalance) unsubscribeBalance();
        await signOut(auth);
        window.location.href = 'pages/auth/login.html';
    } catch (error) {
        console.error('Error signing out:', error);
    }
});

// Matter.js setup
const { Engine, World, Bodies, Body, Events, Runner, Composite } = Matter;

// Game state
let engine;
let runner;
let world;
let pins = [];
let multiplierBodies = [];
let balls = [];
let particles = []; // For visual effects
let currentRisk = 'medium';
let currentRows = 16;
let isPlaying = false;
let balance = 0;
let balanceLoaded = false;
let activeBetAmount = 0;

// Stats
let gamesPlayed = 0;
let totalWon = 0;
let biggestWin = 0;

// Canvas
const canvas = document.getElementById('plinkoCanvas');
const ctx = canvas.getContext('2d');
let canvasWidth = 800;
let canvasHeight = 840; // Increased height for better layout

function resizeCanvas() {
    const container = canvas.parentElement;
    if (container) {
        // Adjust width based on container, but keep aspect ratio roughly?
        // Actually, Plinko needs a fixed coordinate system for physics to be consistent across devices
        // So we scale the rendering, not the physics world.
        // For simplicity, we'll keep internal resolution high and let CSS handle display size.
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
    }
}
resizeCanvas();

function setPlayingState(playing) {
    isPlaying = playing;
    const playBtn = document.getElementById('playBtn');
    if (playBtn) {
        playBtn.disabled = playing || !balanceLoaded;
        playBtn.innerHTML = playing ? '<span>Drop en cours...</span>' : '<span>Lancer la bille</span>';
    }
}

function syncStatsFromData(data) {
    gamesPlayed = data.plinkoGamesPlayed ?? 0;
    totalWon = data.plinkoTotalWon ?? 0;
    biggestWin = data.plinkoBestWin ?? 0;
    updateStats();
}

function updateMetaLabels() {
    const riskLabel = document.getElementById('currentRiskLabel');
    const rowsLabel = document.getElementById('currentRowsLabel');
    const riskTextMap = { low: 'Risque faible', medium: 'Risque moyen', high: 'Risque élevé' };
    if (riskLabel) riskLabel.textContent = riskTextMap[currentRisk] ?? 'Risque';
    if (rowsLabel) rowsLabel.textContent = `${currentRows} lignes`;
}

// Multipliers
const multipliers = {
    low: {
        8: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
        12: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
        16: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16]
    },
    medium: {
        8: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
        12: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
        16: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110]
    },
    high: {
        8: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
        12: [76, 18, 4, 1.7, 0.4, 0.2, 0.2, 0.2, 0.4, 1.7, 4, 18, 76],
        16: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000]
    }
};

function getCurrentMultipliers() {
    return multipliers[currentRisk][currentRows] ?? [];
}

function getMultiplierColor(multiplier) {
    if (multiplier >= 100) return '#8b5cf6'; // Purple
    if (multiplier >= 10) return '#ff4444'; // Red
    if (multiplier >= 2) return '#ffa500'; // Orange
    if (multiplier >= 1) return '#00e701'; // Green
    return '#2d3748'; // Dark Grey for loss/low
}

// Physics & Board Setup
function getBoardGeometry() {
    const currentMultipliers = getCurrentMultipliers();
    const slotCount = currentMultipliers.length;
    if (slotCount === 0) return null;

    const horizontalPadding = 40;
    const usableWidth = canvasWidth - horizontalPadding * 2;
    const slotSpacing = slotCount > 1 ? usableWidth / (slotCount - 1) : 0;
    const startX = (canvasWidth - (slotCount - 1) * slotSpacing) / 2;
    const boxWidth = Math.min(50, slotSpacing * 0.9); // Slight gap
    const boxHeight = 40;
    const pinGapY = 44; // Vertical distance between rows
    const startY = 50;  // Top margin

    return { slotCount, slotSpacing, startX, boxWidth, boxHeight, pinGapY, startY };
}

function initGame() {
    engine = Engine.create();
    world = engine.world;
    world.gravity.y = 1.2; // Stronger gravity for snappier feel

    // Custom Runner loop
    runner = Runner.create();

    setupBoard();
    updateMetaLabels();

    // Start rendering loop
    requestAnimationFrame(renderLoop);

    // Start physics runner
    Runner.run(runner, engine);

    // Collision Events
    Events.on(engine, 'collisionStart', (event) => {
        event.pairs.forEach((pair) => {
            const { bodyA, bodyB } = pair;

            // Ball hits Pin
            if ((bodyA.label === 'ball' && bodyB.label === 'pin') || (bodyB.label === 'ball' && bodyA.label === 'pin')) {
                const pin = bodyA.label === 'pin' ? bodyA : bodyB;
                triggerPinGlow(pin);
            }

            // Ball hits Multiplier
            if (bodyA.label === 'ball' && bodyB.label && bodyB.label.startsWith('multiplier')) {
                handleBallLanding(bodyA, bodyB);
            } else if (bodyB.label === 'ball' && bodyA.label && bodyA.label.startsWith('multiplier')) {
                handleBallLanding(bodyB, bodyA);
            }
        });
    });
}

function triggerPinGlow(pin) {
    pin.glowIntensity = 1.0;
    // Spawn small particle burst
    for (let i = 0; i < 3; i++) {
        particles.push({
            x: pin.position.x,
            y: pin.position.y,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            life: 1.0,
            color: '#ffffff'
        });
    }
}

function setupBoard() {
    World.clear(world);
    Engine.clear(engine);
    pins = [];
    multiplierBodies = [];
    balls = [];
    particles = [];

    const geometry = getBoardGeometry();
    if (!geometry) return;

    const { slotCount, slotSpacing, startX, boxWidth, boxHeight, pinGapY, startY } = geometry;
    const currentMultipliers = getCurrentMultipliers();
    const pinRadius = 4; // Smaller for cleaner look

    // Pins
    for (let row = 0; row < currentRows; row++) {
        const pinsInRow = row + 1 + 2; // +2 To make it essentially an infinite pyramid feeling
        // Actually standard plinko is line 1 = 3 pins, line 2 = 4 pins... 
        // Let's stick to standard: Row 0 = 3 pins? No, Stake is Row 0 = 3 gaps (so 2 pins?)
        // Let's stick to: Row 0 has 3 pins.

        // Wait, standard plinko pyramid:
        // Row 0: 1 pin (at top)? No, usually the ball drops from a single point above row 0.
        // Let's use the logic: Row 0 has 3 pins.
        // The implementation:
        const count = 3 + row;
        const rowWidth = (count - 1) * slotSpacing;
        const rowStartX = (canvasWidth - rowWidth) / 2;

        for (let col = 0; col < count; col++) {
            const x = rowStartX + col * slotSpacing;
            const y = startY + row * pinGapY;

            const pin = Bodies.circle(x, y, pinRadius, {
                isStatic: true,
                label: 'pin',
                restitution: 0.5,
                friction: 0,
                render: { visible: false } // We render manually
            });
            pin.glowIntensity = 0;
            pins.push(pin);
            World.add(world, pin);
        }
    }

    // Multipliers (Sensors)
    const boxY = startY + currentRows * pinGapY + 20;

    for (let i = 0; i < slotCount; i++) {
        // Calculate X based on the last row of pins to align perfectly
        // The last row has (3 + currentRows - 1) pins => (currentRows + 2) pins
        // Spaces: currentRows + 1 gaps. 
        // This math is tricky. Let's align with the `getBoardGeometry` logic which centers the bottom row.

        // Let's re-calculate precise positions based on the Pyramidal expansion
        // Center of canvas is x=400. 
        // Bottom row width = (slotCount-1) * spacing.
        // It should match.

        const x = startX + i * slotSpacing;
        const multiplier = currentMultipliers[i];
        const color = getMultiplierColor(multiplier);

        const box = Bodies.rectangle(x, boxY, boxWidth, boxHeight, {
            isStatic: true,
            isSensor: true, // Ball passes through, but triggers collision
            label: `multiplier-${i}`,
            multiplier: multiplier,
            color: color,
            render: { visible: false }
        });
        multiplierBodies.push(box);
        World.add(world, box);
    }
}

// Rendering Loop (Custom)
function renderLoop() {
    // Clear Canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw Pins
    pins.forEach(pin => {
        // Decay glow
        if (pin.glowIntensity > 0) pin.glowIntensity -= 0.05;
        if (pin.glowIntensity < 0) pin.glowIntensity = 0;

        ctx.beginPath();
        ctx.arc(pin.position.x, pin.position.y, pin.circleRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';

        // Glow effect
        if (pin.glowIntensity > 0) {
            ctx.shadowBlur = 15 * pin.glowIntensity;
            ctx.shadowColor = '#ffffff';
            ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + 0.5 * pin.glowIntensity})`;
        } else {
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        }

        ctx.fill();
        ctx.shadowBlur = 0; // Reset
    });

    // Draw Multipliers
    // We draw them on canvas for smoothness
    multiplierBodies.forEach(box => {
        const w = box.bounds.max.x - box.bounds.min.x;
        const h = box.bounds.max.y - box.bounds.min.y;

        ctx.save();
        ctx.translate(box.position.x, box.position.y);

        // Box shape
        ctx.beginPath();
        // Rounded rect
        const r = 4;
        ctx.roundRect(-w / 2, -h / 2, w, h, r);

        // Gradient fill
        const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
        grad.addColorStop(0, box.color);
        grad.addColorStop(1, adjustColor(box.color, -30)); // Darker bottom
        ctx.fillStyle = grad;

        // Glow if recently hit (we can add a hit timer prop later)
        ctx.shadowBlur = 5;
        ctx.shadowColor = 'rgba(0,0,0,0.3)';

        ctx.fill();

        // Text
        ctx.fillStyle = '#000'; // Contrast text usually black on bright colors, or white on dark
        if (box.multiplier < 2) ctx.fillStyle = '#fff';
        else ctx.fillStyle = '#000';

        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 0;
        ctx.fillText(`${box.multiplier}x`, 0, 0);

        ctx.restore();
    });

    // Draw Balls
    balls.forEach(ball => {
        ctx.beginPath();
        ctx.arc(ball.position.x, ball.position.y, ball.circleRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#00e701'; // Stake Green
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#00e701';
        ctx.fill();
        ctx.shadowBlur = 0;
    });

    // Draw Particles
    particles.forEach((p, index) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.05;

        if (p.life <= 0) {
            particles.splice(index, 1);
            return;
        }

        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    });

    requestAnimationFrame(renderLoop);
}

// Utility for color darkening
function adjustColor(color, amount) {
    return color; // Placeholder, for now just return same
}

// Drop Logic
function getWeightedMultiplierIndex(slotCount) {
    // Binomial distribution
    // This is essentially just counting left/right bounces
    // But we are using a physics sim now, so we don't force the result index directly unless we want to "rig" it.
    // However, to ensure fair distribution close to probability, we can nudge the ball slightly at spawn.
    // For a physics-first approach, we just drop it with slight random X variation.
    return 0; // Not used for physics-only drop
}

function dropBall() {
    activeBetAmount = parseFloat(document.getElementById('betAmount').value);

    const geometry = getBoardGeometry();
    if (!geometry) return;

    // Spawn point: Top center
    // We want the ball to hit the first pin (center pin of top row) and bounce randomly.
    // The top row has 3 pins. The "Apex" is actually a single pin in some setups, or a gap.
    // In our `setupBoard`, row 0 has 3 pins.
    // Let's spawn slightly above row 0, center aligned.

    const spawnX = canvasWidth / 2 + (Math.random() - 0.5) * 10; // Tiny random offset
    const spawnY = 20;

    const ball = Bodies.circle(spawnX, spawnY, 8, {
        restitution: 0.6,
        friction: 0.001,
        label: 'ball',
        collisionFilter: { group: -1 } // No ball-ball collision
    });

    balls.push(ball);
    World.add(world, ball);

    // Give it a tiny push if it's perfectly centered to ensure it doesn't balance
    Body.setVelocity(ball, { x: (Math.random() - 0.5), y: 0 });
}

// Hit Logic
async function handleBallLanding(ball, box) {
    if (ball.hasLanded) return;
    ball.hasLanded = true;

    const multiplier = box.multiplier;
    const betAmount = activeBetAmount || 0;
    const winAmount = betAmount * multiplier;

    // Remove ball physics
    World.remove(world, ball);
    // Animate ball disappearing or turning into score
    // For now instantly remove from array after a brief visual delay to sink into bucket?
    // Actually simpler to just remove:
    balls = balls.filter(b => b !== ball);

    // Update Balance
    try {
        if (currentUser) {
            const result = await applyGameResult(currentUser.uid, {
                betAmount: betAmount,
                payout: winAmount,
                game: 'plinko'
            });
            balance = result.balance;
            updateBalance();

            // Local stats
            gamesPlayed++;
            totalWon += winAmount;
            if (winAmount > biggestWin) biggestWin = winAmount;
            updateStats();
            addToHistory(betAmount, multiplier, winAmount - betAmount);
        }
    } catch (e) {
        console.error(e);
    }

    setPlayingState(false);
}

// UI Updating (Balance, etc.) - same as before
function updateBalance() {
    const el = document.getElementById('userBalance');
    if (el) el.textContent = balanceLoaded ? `${balance.toFixed(2)} €` : '---';
}

function updateStats() {
    document.getElementById('gamesPlayed').textContent = gamesPlayed;
    document.getElementById('totalWon').textContent = `${totalWon.toFixed(2)} €`;
    document.getElementById('biggestWin').textContent = `${biggestWin.toFixed(2)} €`;
}

function addToHistory(bet, multiplier, profit) {
    const list = document.getElementById('historyList');
    if (!list) return;
    const item = document.createElement('div');
    item.className = 'history-item';

    let colorClass = 'loss';
    if (multiplier >= 1) colorClass = 'small-win';
    if (multiplier >= 2) colorClass = 'medium-win';
    if (multiplier >= 10) colorClass = 'big-win';

    item.innerHTML = `
        <div class="history-bet">${bet.toFixed(2)} €</div>
        <div class="history-multiplier ${colorClass}">${multiplier}x</div>
        <div class="history-win ${profit >= 0 ? colorClass : 'loss'}">${profit > 0 ? '+' : ''}${profit.toFixed(2)} €</div>
    `;
    list.prepend(item);
    if (list.children.length > 20) list.lastChild.remove();
}

// Event Listeners
document.getElementById('playBtn')?.addEventListener('click', () => {
    if (isPlaying) return; // Prevent spam? Or allow spam? Stake allows spam.
    // We need to deduct balance locally first for responsiveness if allowing spam
    // For now, single drop at a time is safer for sync.
    // If user wants spam, we need a queue system.
    // Let's allow spam but debounce slightly?

    setPlayingState(true);
    dropBall();
    // Re-enable button quickly for rapid fire?
    setTimeout(() => setPlayingState(false), 200);
});

// Risk / Rows / Controls
document.querySelectorAll('.risk-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.risk-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentRisk = btn.dataset.risk;
        setupBoard();
        updateMetaLabels();
    });
});

document.querySelectorAll('.rows-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.rows-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentRows = parseInt(btn.dataset.rows);
        setupBoard();
        updateMetaLabels();
    });
});

document.querySelectorAll('.quick-bet').forEach(btn => {
    btn.addEventListener('click', () => {
        const input = document.getElementById('betAmount');
        let val = parseFloat(input.value) || 0;
        const action = btn.dataset.action;
        if (action === 'half') val /= 2;
        if (action === 'double') val *= 2;
        if (action === 'min') val = 0.10;
        if (action === 'max') val = balance;
        input.value = val.toFixed(2);
    });
});

document.getElementById('depositBtn')?.addEventListener('click', () => {
    // Simplified deposit
    const amount = parseFloat(prompt("Deposit Amount:", "100"));
    if (amount) {
        // Just alert for now as implemented in original
        alert("Dépôt simulé: " + amount);
    }
});

// Init
initGame();
updateStats();
updateBalance();
