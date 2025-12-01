import { auth, signOut, onAuthStateChanged } from './firebase-config.js';
import { initializeUserBalance, subscribeToUserData, addFunds, applyGameResult } from './balance-manager.js';

let currentUser = null;
let unsubscribeBalance = null;

// Check if user is logged in
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
    } else {
        currentUser = user;
        await initializeUserBalance(user);

        // Subscribe to real-time balance updates
        unsubscribeBalance = subscribeToUserData(user.uid, (data) => {
            if (!data) {
                balanceLoaded = false;
                setPlayingState(false);
                updateBalance();
                gamesPlayed = 0;
                totalWon = 0;
                biggestWin = 0;
                updateStats();
                return;
            }

            balance = data.balance;
            balanceLoaded = true;

            syncStatsFromData(data);
            updateBalance();
            setPlayingState(false);
        });
    }
});

// Logout functionality
document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        if (unsubscribeBalance) {
            unsubscribeBalance();
        }
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
let balance = 0;
let balanceLoaded = false;
let activeBetAmount = 0;

// Stats
let gamesPlayed = 0;
let totalWon = 0;
let biggestWin = 0;

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
    const riskTextMap = {
        low: 'Risque faible',
        medium: 'Risque moyen',
        high: 'Risque élevé'
    };

    if (riskLabel) {
        riskLabel.textContent = riskTextMap[currentRisk] ?? 'Risque';
    }

    if (rowsLabel) {
        rowsLabel.textContent = `${currentRows} lignes`;
    }
}

function renderMultiplierRow(containerId, values) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    values.forEach((mult) => {
        const multiplierDiv = document.createElement('div');
        multiplierDiv.className = 'multiplier-box';

        if (mult >= 100) {
            multiplierDiv.classList.add('big-win');
        } else if (mult >= 10) {
            multiplierDiv.classList.add('high');
        } else if (mult >= 2) {
            multiplierDiv.classList.add('medium');
        } else if (mult >= 1) {
            multiplierDiv.classList.add('low');
        } else {
            multiplierDiv.classList.add('very-low');
        }

        multiplierDiv.textContent = `${mult}x`;
        container.appendChild(multiplierDiv);
    });
}

// Canvas dimensions
const canvas = document.getElementById('plinkoCanvas');
const canvasWidth = 720;
const canvasHeight = 760;

// Multipliers for different risk levels and rows (based on Stake.com)
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
    if (multiplier >= 100) {
        return '#8b5cf6';
    }
    if (multiplier >= 10) {
        return '#ff6666';
    }
    if (multiplier >= 2) {
        return '#f6c657';
    }
    if (multiplier >= 1) {
        return '#00d084';
    }
    return '#4a5568';
}

function getBoardGeometry() {
    const currentMultipliers = getCurrentMultipliers();
    const slotCount = currentMultipliers.length;

    if (slotCount === 0) {
        return null;
    }

    const horizontalPadding = 80;
    const usableWidth = canvasWidth - horizontalPadding * 2;
    const slotSpacing = slotCount > 1 ? usableWidth / (slotCount - 1) : 0;
    const startX = (canvasWidth - (slotCount - 1) * slotSpacing) / 2;
    const boxWidth = Math.min(60, slotSpacing * 0.7 || 50);
    const boxHeight = 70;
    const pinGapY = 42;
    const startY = 90;

    return { slotCount, slotSpacing, startX, boxWidth, boxHeight, pinGapY, startY };
}



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
    world.gravity.y = 0.8;  // Slightly less gravity for smoother fall

    // Create renderer
    render = Render.create({
        canvas: canvas,
        engine: engine,
        options: {
            width: canvasWidth,
            height: canvasHeight,
            wireframes: false,
            background: '#1a1f2e',
            pixelRatio: window.devicePixelRatio || 1
        }
    });

    // Create runner with better timing
    runner = Runner.create({
        isFixed: false,
        delta: 1000 / 60  // 60 FPS
    });

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
    balls.forEach(ball => World.remove(world, ball));
    balls = [];

    const geometry = getBoardGeometry();
    if (!geometry) {
        return;
    }

    const { slotCount, slotSpacing, startX, boxWidth, boxHeight, pinGapY, startY } = geometry;
    const currentMultipliers = getCurrentMultipliers();
    const pinRadius = 5;

    // Create pins with better visual style
    for (let row = 0; row < currentRows; row++) {
        const pinsInRow = row + 1;
        const offset = (slotCount - pinsInRow) / 2;

        for (let col = 0; col < pinsInRow; col++) {
            const x = startX + (offset + col) * slotSpacing;
            const y = startY + row * pinGapY;

            const pin = Bodies.circle(x, y, pinRadius, {
                isStatic: true,
                restitution: 0.85,  // More bouncy pins like Stake
                friction: 0.001,
                slop: 0.05,
                render: {
                    fillStyle: '#5865f2',
                    strokeStyle: '#7289da',
                    lineWidth: 2
                }
            });
            pins.push(pin);
            World.add(world, pin);
        }
    }

    // Create multiplier boxes at bottom
    const boxY = canvasHeight - 80;

    for (let i = 0; i < slotCount; i++) {
        const x = startX + i * slotSpacing;
        const multiplier = currentMultipliers[i] ?? 0;
        const color = getMultiplierColor(multiplier);

        const box = Bodies.rectangle(x, boxY, boxWidth, boxHeight, {
            isStatic: true,
            label: `multiplier-${i}`,
            render: {
                fillStyle: color,
                strokeStyle: color,
                lineWidth: 2
            },
            multiplier
        });
        pins.push(box);
        World.add(world, box);
    }

    // Create walls
    const wallThickness = 40;
    const leftWall = Bodies.rectangle(-wallThickness / 2, canvasHeight / 2, wallThickness, canvasHeight, {
        isStatic: true,
        render: { fillStyle: '#2d3748' }
    });
    const rightWall = Bodies.rectangle(canvasWidth + wallThickness / 2, canvasHeight / 2, wallThickness, canvasHeight, {
        isStatic: true,
        render: { fillStyle: '#2d3748' }
    });

    World.add(world, [leftWall, rightWall]);
    pins.push(leftWall, rightWall);
}

// Generate weighted multiplier index using binomial distribution
function getWeightedMultiplierIndex(slotCount) {
    // Use binomial distribution for natural plinko outcomes
    const rows = currentRows;
    let position = 0;

    // Each row: 50% chance to go left or right (binomial)
    for (let i = 0; i < rows; i++) {
        if (Math.random() < 0.5) {
            position++;
        }
    }

    // Position is now 0 to rows, map to slot index
    return Math.min(slotCount - 1, position);
}

// Drop ball with realistic physics
function dropBall() {
    const geometry = getBoardGeometry();
    if (!geometry) {
        activeBetAmount = 0;
        setPlayingState(false);
        return;
    }

    const { slotCount, slotSpacing, startX } = geometry;

    if (!slotCount) {
        activeBetAmount = 0;
        setPlayingState(false);
        return;
    }

    const ballRadius = 7;
    const boardCenterX = startX + ((slotCount - 1) * slotSpacing) / 2;
    // Smaller random spawn variation for more consistent drops
    const spawnX = boardCenterX + (Math.random() - 0.5) * slotSpacing * 0.15;
    const startY = 30;

    // Pre-determine the outcome based on binomial probability
    const targetIndex = getWeightedMultiplierIndex(slotCount);

    const ball = Bodies.circle(spawnX, startY, ballRadius, {
        restitution: 0.75,  // Slightly less bouncy for more realistic feel
        friction: 0.002,
        frictionAir: 0.001,  // Add air resistance
        density: 0.0015,
        label: 'ball',
        targetIndex: targetIndex,
        render: {
            fillStyle: '#00d084',
            strokeStyle: '#00ff9d',
            lineWidth: 2
        },
        collisionFilter: {
            group: -1  // Prevent ball-to-ball collisions
        }
    });

    balls.push(ball);
    World.add(world, ball);

    // Add minimal initial velocity - let physics do the work
    Body.setVelocity(ball, {
        x: (Math.random() - 0.5) * 0.5,
        y: 1
    });

    // Very subtle guidance only when ball is off-course
    let lastGuidanceTime = Date.now();
    let guidanceInterval = setInterval(() => {
        if (!ball.position || ball.position.y > canvasHeight - 150) {
            clearInterval(guidanceInterval);
            return;
        }

        const now = Date.now();
        if (now - lastGuidanceTime < 100) return; // Limit guidance frequency
        lastGuidanceTime = now;

        const targetX = startX + targetIndex * slotSpacing;
        const distanceToTarget = targetX - ball.position.x;

        // Only apply force if significantly off target
        if (Math.abs(distanceToTarget) > slotSpacing * 0.8) {
            const guidanceForce = distanceToTarget * 0.00003; // Much more subtle
            Body.applyForce(ball, ball.position, {
                x: guidanceForce,
                y: 0
            });
        }
    }, 100);
}

// Handle ball landing in multiplier box
async function handleBallLanding(ball, box) {
    if (ball.hasLanded || !currentUser) {
        return;
    }

    ball.hasLanded = true;

    const betAmount = activeBetAmount;
    if (!betAmount || betAmount <= 0) {
        setPlayingState(false);
        return;
    }
    const multiplier = box.multiplier;
    const winAmount = parseFloat((betAmount * multiplier).toFixed(2));
    const profit = parseFloat((winAmount - betAmount).toFixed(2));
    let transactionSucceeded = false;

    try {
        const outcome = await applyGameResult(currentUser.uid, {
            betAmount,
            payout: winAmount,
            game: 'plinko'
        });
        balance = outcome.balance;
        updateBalance();
        transactionSucceeded = true;
    } catch (error) {
        console.error('Error applying plinko result:', error);
        if (error.message === 'INSUFFICIENT_FUNDS') {
            alert('Solde insuffisant pour valider cette mise.');
        } else {
            alert('Erreur lors de la mise à jour du solde.');
        }
    }

    if (transactionSucceeded) {
        gamesPlayed += 1;
        totalWon = parseFloat((totalWon + winAmount).toFixed(2));
        if (winAmount > biggestWin) {
            biggestWin = winAmount;
        }
        updateStats();
        addToHistory(betAmount, multiplier, profit);
    }

    // Highlight winning box
    box.render.fillStyle = '#FFD700';
    setTimeout(() => {
        box.render.fillStyle = getMultiplierColor(multiplier);
    }, 1000);

    // Remove ball after delay
    setTimeout(() => {
        World.remove(world, ball);
        balls = balls.filter(b => b !== ball);
    }, 1000);

    activeBetAmount = 0;
    setPlayingState(false);
}

// Update balance display
function updateBalance() {
    const balanceElement = document.getElementById('userBalance');
    if (!balanceElement) return;

    if (!balanceLoaded) {
        balanceElement.textContent = '---';
        return;
    }

    balanceElement.textContent = `${balance.toFixed(2)} €`;
}

// Update stats
function updateStats() {
    document.getElementById('gamesPlayed').textContent = gamesPlayed;
    document.getElementById('totalWon').textContent = `${totalWon.toFixed(2)} €`;
    document.getElementById('biggestWin').textContent = `${biggestWin.toFixed(2)} €`;
}

// Add to history
function addToHistory(bet, multiplier, profit) {
    const historyList = document.getElementById('historyList');

    // Remove "no history" message
    const noHistory = historyList.querySelector('.no-history');
    if (noHistory) {
        noHistory.remove();
    }

    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';

    let multiplierClass = 'loss';
    if (multiplier >= 100) {
        multiplierClass = 'big-win';
    } else if (multiplier >= 10) {
        multiplierClass = 'big-win';
    } else if (multiplier >= 2) {
        multiplierClass = 'medium-win';
    } else if (multiplier >= 1) {
        multiplierClass = 'small-win';
    }

    const profitClass = profit >= 0 ? (multiplierClass === 'loss' ? 'small-win' : multiplierClass) : 'loss';
    const profitLabel = profit >= 0 ? `+${profit.toFixed(2)} €` : `${profit.toFixed(2)} €`;

    historyItem.innerHTML = `
        <div class="history-bet">${bet.toFixed(2)} €</div>
        <div class="history-multiplier ${multiplierClass}">${multiplier}x</div>
        <div class="history-win ${profitClass}">${profitLabel}</div>
    `;

    historyList.insertBefore(historyItem, historyList.firstChild);

    // Keep only last 20 items
    while (historyList.children.length > 20) {
        historyList.removeChild(historyList.lastChild);
    }
}

// Update multipliers display
function updateMultipliers() {
    const currentMultipliers = getCurrentMultipliers();
    updateMetaLabels();
    renderMultiplierRow('multipliersTop', currentMultipliers);
    renderMultiplierRow('multipliersBottom', currentMultipliers);
}

// Event Listeners
document.getElementById('playBtn').addEventListener('click', () => {
    if (isPlaying || !currentUser) return;

    const betAmount = parseFloat(document.getElementById('betAmount').value);

    if (isNaN(betAmount) || betAmount <= 0) {
        alert('Mise invalide');
        return;
    }

    if (!balanceLoaded) {
        alert('Solde en cours de synchronisation, veuillez patienter.');
        return;
    }

    if (betAmount > balance) {
        alert('Solde insuffisant');
        return;
    }

    activeBetAmount = parseFloat(betAmount.toFixed(2));
    setPlayingState(true);
    dropBall();
});

// Quick bet buttons
document.querySelectorAll('.quick-bet').forEach(btn => {
    btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const betInput = document.getElementById('betAmount');
        let currentBet = parseFloat(betInput.value);
        if (isNaN(currentBet)) {
            currentBet = 0;
        }

        switch (action) {
            case 'half': {
                betInput.value = (currentBet / 2).toFixed(2);
                break;
            }
            case 'double': {
                const doubled = currentBet * 2;
                const target = balanceLoaded ? Math.min(doubled, balance) : doubled;
                betInput.value = target.toFixed(2);
                break;
            }
            case 'min': {
                betInput.value = '0.10';
                break;
            }
            case 'max': {
                if (balanceLoaded) {
                    betInput.value = balance.toFixed(2);
                }
                break;
            }
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
        activeBetAmount = 0;
        setPlayingState(false);
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
        activeBetAmount = 0;
        setPlayingState(false);
    });
});

// Deposit button
document.getElementById('depositBtn').addEventListener('click', async () => {
    if (!currentUser) {
        alert('Veuillez vous connecter');
        return;
    }

    const amount = prompt('Montant à déposer (€):');
    const depositAmount = parseFloat(amount);
    if (amount && !isNaN(depositAmount) && depositAmount > 0) {
        try {
            //await addFunds(currentUser.uid, depositAmount);
            alert(`${depositAmount.toFixed(2)} € ajoutés à votre solde!`);
        } catch (error) {
            console.error('Error adding funds:', error);
            alert('Erreur lors du dépôt');
        }
    }
});

// Initialize
initGame();
updateStats();
updateBalance();
setPlayingState(false);
