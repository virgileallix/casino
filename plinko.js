import { auth, signOut, onAuthStateChanged } from './firebase-config.js';

// Check if user is logged in
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'login.html';
    }
});

// Logout functionality
document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Error signing out:', error);
    }
});

// Matter.js setup
const { Engine, Render, World, Bodies, Body, Events, Runner } = Matter;

// Game state
let engine;
let render;
let runner;
let world;
let pins = [];
let balls = [];
let currentRisk = 'medium';
let currentRows = 16;
let isPlaying = false;
let balance = 1000;

// Stats
let gamesPlayed = 0;
let totalWon = 0;
let biggestWin = 0;

// Canvas dimensions
const canvas = document.getElementById('plinkoCanvas');
const canvasWidth = 600;
const canvasHeight = 800;

// Multipliers for different risk levels and rows
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

// Colors for multipliers
const multiplierColors = {
    low: '#00d084',
    medium: '#ffa500',
    high: '#ff4444'
};

// Initialize game
function initGame() {
    // Create engine
    engine = Engine.create();
    world = engine.world;
    world.gravity.y = 1;

    // Create renderer
    render = Render.create({
        canvas: canvas,
        engine: engine,
        options: {
            width: canvasWidth,
            height: canvasHeight,
            wireframes: false,
            background: '#1a1f2e'
        }
    });

    // Create runner
    runner = Runner.create();

    setupBoard();
    updateMultipliers();

    Render.run(render);
    Runner.run(runner, engine);

    // Ball collision detection
    Events.on(engine, 'collisionStart', (event) => {
        event.pairs.forEach((pair) => {
            const { bodyA, bodyB } = pair;

            // Check if ball hit a multiplier box
            if (bodyA.label === 'ball' && bodyB.label && bodyB.label.startsWith('multiplier')) {
                handleBallLanding(bodyA, bodyB);
            } else if (bodyB.label === 'ball' && bodyA.label && bodyA.label.startsWith('multiplier')) {
                handleBallLanding(bodyB, bodyA);
            }
        });
    });
}

// Setup board with pins and multiplier boxes
function setupBoard() {
    // Clear existing pins and boxes
    pins.forEach(pin => World.remove(world, pin));
    pins = [];

    const pinRadius = 4;
    const pinGap = 35;
    const startY = 100;
    const rows = currentRows;

    // Create pins
    for (let row = 0; row < rows; row++) {
        const pinsInRow = row + 3;
        const rowWidth = (pinsInRow - 1) * pinGap;
        const startX = (canvasWidth - rowWidth) / 2;

        for (let col = 0; col < pinsInRow; col++) {
            const x = startX + col * pinGap;
            const y = startY + row * pinGap;

            const pin = Bodies.circle(x, y, pinRadius, {
                isStatic: true,
                restitution: 0.8,
                render: {
                    fillStyle: '#4a5568'
                }
            });
            pins.push(pin);
            World.add(world, pin);
        }
    }

    // Create multiplier boxes at bottom
    const numBoxes = rows + 3;
    const boxWidth = 40;
    const boxHeight = 60;
    const boxGap = 5;
    const totalWidth = numBoxes * boxWidth + (numBoxes - 1) * boxGap;
    const startXBox = (canvasWidth - totalWidth) / 2;
    const boxY = canvasHeight - 80;

    const currentMultipliers = multipliers[currentRisk][rows];

    for (let i = 0; i < numBoxes; i++) {
        const x = startXBox + i * (boxWidth + boxGap) + boxWidth / 2;
        const multiplier = currentMultipliers[i];

        // Determine color based on multiplier value
        let color;
        if (multiplier >= 10) {
            color = '#ff4444';
        } else if (multiplier >= 2) {
            color = '#ffa500';
        } else if (multiplier >= 1) {
            color = '#00d084';
        } else {
            color = '#4a5568';
        }

        const box = Bodies.rectangle(x, boxY, boxWidth, boxHeight, {
            isStatic: true,
            label: `multiplier-${i}`,
            render: {
                fillStyle: color,
                strokeStyle: color,
                lineWidth: 2
            },
            multiplier: multiplier
        });
        pins.push(box);
        World.add(world, box);
    }

    // Create walls
    const wallThickness = 20;
    const leftWall = Bodies.rectangle(-10, canvasHeight / 2, wallThickness, canvasHeight, {
        isStatic: true,
        render: { fillStyle: '#2d3748' }
    });
    const rightWall = Bodies.rectangle(canvasWidth + 10, canvasHeight / 2, wallThickness, canvasHeight, {
        isStatic: true,
        render: { fillStyle: '#2d3748' }
    });

    World.add(world, [leftWall, rightWall]);
}

// Drop ball
function dropBall() {
    const ballRadius = 6;
    const startX = canvasWidth / 2 + (Math.random() - 0.5) * 10;
    const startY = 30;

    const ball = Bodies.circle(startX, startY, ballRadius, {
        restitution: 0.8,
        friction: 0.001,
        density: 0.002,
        label: 'ball',
        render: {
            fillStyle: '#00d084'
        }
    });

    balls.push(ball);
    World.add(world, ball);

    // Add initial random velocity
    Body.setVelocity(ball, {
        x: (Math.random() - 0.5) * 2,
        y: 0
    });
}

// Handle ball landing in multiplier box
function handleBallLanding(ball, box) {
    if (!ball.hasLanded) {
        ball.hasLanded = true;

        const betAmount = parseFloat(document.getElementById('betAmount').value);
        const multiplier = box.multiplier;
        const winAmount = betAmount * multiplier;

        balance += winAmount - betAmount;
        updateBalance();

        // Update stats
        gamesPlayed++;
        totalWon += winAmount;
        if (winAmount > biggestWin) {
            biggestWin = winAmount;
        }
        updateStats();

        // Add to history
        addToHistory(betAmount, multiplier, winAmount);

        // Remove ball after delay
        setTimeout(() => {
            World.remove(world, ball);
            balls = balls.filter(b => b !== ball);
        }, 1000);

        isPlaying = false;
    }
}

// Update balance display
function updateBalance() {
    document.getElementById('userBalance').textContent = `${balance.toFixed(2)} €`;
}

// Update stats
function updateStats() {
    document.getElementById('gamesPlayed').textContent = gamesPlayed;
    document.getElementById('totalWon').textContent = `${totalWon.toFixed(2)} €`;
    document.getElementById('biggestWin').textContent = `${biggestWin.toFixed(2)} €`;
}

// Add to history
function addToHistory(bet, multiplier, win) {
    const historyList = document.getElementById('historyList');

    // Remove "no history" message
    const noHistory = historyList.querySelector('.no-history');
    if (noHistory) {
        noHistory.remove();
    }

    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';

    let resultClass = 'loss';
    if (multiplier >= 10) {
        resultClass = 'big-win';
    } else if (multiplier >= 2) {
        resultClass = 'medium-win';
    } else if (multiplier >= 1) {
        resultClass = 'small-win';
    }

    historyItem.innerHTML = `
        <div class="history-bet">${bet.toFixed(2)} €</div>
        <div class="history-multiplier ${resultClass}">${multiplier}x</div>
        <div class="history-win ${resultClass}">${win.toFixed(2)} €</div>
    `;

    historyList.insertBefore(historyItem, historyList.firstChild);

    // Keep only last 20 items
    while (historyList.children.length > 20) {
        historyList.removeChild(historyList.lastChild);
    }
}

// Update multipliers display
function updateMultipliers() {
    const multipliersBottom = document.getElementById('multipliersBottom');
    multipliersBottom.innerHTML = '';

    const currentMultipliers = multipliers[currentRisk][currentRows];

    currentMultipliers.forEach((mult) => {
        const multiplierDiv = document.createElement('div');
        multiplierDiv.className = 'multiplier-box';

        if (mult >= 10) {
            multiplierDiv.classList.add('high');
        } else if (mult >= 2) {
            multiplierDiv.classList.add('medium');
        } else if (mult >= 1) {
            multiplierDiv.classList.add('low');
        } else {
            multiplierDiv.classList.add('very-low');
        }

        multiplierDiv.textContent = `${mult}x`;
        multipliersBottom.appendChild(multiplierDiv);
    });
}

// Event Listeners
document.getElementById('playBtn').addEventListener('click', () => {
    if (isPlaying) return;

    const betAmount = parseFloat(document.getElementById('betAmount').value);

    if (betAmount <= 0) {
        alert('Mise invalide');
        return;
    }

    if (betAmount > balance) {
        alert('Solde insuffisant');
        return;
    }

    isPlaying = true;
    dropBall();
});

// Quick bet buttons
document.querySelectorAll('.quick-bet').forEach(btn => {
    btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const betInput = document.getElementById('betAmount');
        let currentBet = parseFloat(betInput.value);

        if (action === 'half') {
            betInput.value = (currentBet / 2).toFixed(2);
        } else if (action === 'double') {
            betInput.value = (currentBet * 2).toFixed(2);
        }
    });
});

// Risk buttons
document.querySelectorAll('.risk-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.risk-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentRisk = btn.dataset.risk;
        setupBoard();
        updateMultipliers();
    });
});

// Rows buttons
document.querySelectorAll('.rows-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.rows-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentRows = parseInt(btn.dataset.rows);
        setupBoard();
        updateMultipliers();
    });
});

// Deposit button
document.getElementById('depositBtn').addEventListener('click', () => {
    const amount = prompt('Montant à déposer:');
    if (amount && !isNaN(amount) && parseFloat(amount) > 0) {
        balance += parseFloat(amount);
        updateBalance();
    }
});

// Initialize
initGame();
updateBalance();
