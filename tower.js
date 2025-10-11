import { auth, signOut, onAuthStateChanged } from './firebase-config.js';
import { initializeUserBalance, subscribeToUserData, addFunds, applyGameResult } from './balance-manager.js';

const TOTAL_LEVELS = 8;

let currentUser = null;
let unsubscribeUser = null;
let balance = 0;
let balanceLoaded = false;

let roundActive = false;
let currentLevel = 0;
let currentBet = 0;
let currentMultiplier = 1;
let currentDifficulty = 'medium'; // easy, medium, hard
let pendingResult = false;

// Board structure: board[level] = correctTileIndex
let board = [];

const stats = {
    gamesPlayed: 0,
    cashouts: 0,
    bestMultiplier: 0,
    totalProfit: 0
};

const difficultyConfig = {
    easy: { tiles: 4, correctTiles: 3, houseEdge: 0.04 },
    medium: { tiles: 4, correctTiles: 2, houseEdge: 0.03 },
    hard: { tiles: 4, correctTiles: 1, houseEdge: 0.02 }
};

const elements = {
    userBalance: document.getElementById('userBalance'),
    depositBtn: document.getElementById('depositBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    betInput: document.getElementById('betAmount'),
    startBtn: document.getElementById('startBtn'),
    cashoutBtn: document.getElementById('cashoutBtn'),
    difficultyButtons: Array.from(document.querySelectorAll('.difficulty-btn')),
    status: document.getElementById('gameStatus'),
    currentLevel: document.getElementById('currentLevel'),
    multiplier: document.getElementById('currentMultiplier'),
    potential: document.getElementById('potentialPayout'),
    grid: document.getElementById('towerGrid'),
    ladder: document.getElementById('multiplierLadder'),
    stats: {
        games: document.getElementById('towerGamesPlayed'),
        cashouts: document.getElementById('towerCashouts'),
        bestMultiplier: document.getElementById('towerBestMultiplier'),
        totalProfit: document.getElementById('towerTotalProfit')
    }
};

function setStatus(message, tone = 'neutral') {
    elements.status.textContent = message;
    elements.status.className = `status-pill ${tone}`;
}

function updateBalanceDisplay() {
    if (!elements.userBalance) return;
    if (!balanceLoaded) {
        elements.userBalance.textContent = '---';
        return;
    }
    elements.userBalance.textContent = `${balance.toFixed(2)} €`;
}

function updateStatsDisplay() {
    elements.stats.games.textContent = stats.gamesPlayed;
    elements.stats.cashouts.textContent = stats.cashouts;
    elements.stats.bestMultiplier.textContent = `${stats.bestMultiplier.toFixed(2)}x`;
    elements.stats.totalProfit.textContent = `${stats.totalProfit.toFixed(2)} €`;
}

function syncStatsFromUser(userData) {
    stats.gamesPlayed = userData.towerGamesPlayed ?? 0;
    stats.cashouts = userData.towerCashouts ?? 0;
    stats.bestMultiplier = userData.towerBestMultiplier ?? 0;
    stats.totalProfit = parseFloat((userData.towerTotalProfit ?? 0).toFixed(2));
    updateStatsDisplay();
}

function calculateMultiplier(level, difficulty) {
    if (level === 0) return 1;

    const config = difficultyConfig[difficulty];
    const { tiles, correctTiles, houseEdge } = config;

    let multiplier = 1;
    for (let i = 0; i < level; i++) {
        const probability = correctTiles / tiles;
        multiplier *= (1 - houseEdge) / probability;
    }

    return Math.max(1.01, multiplier);
}

function generateBoard(difficulty) {
    const config = difficultyConfig[difficulty];
    board = [];

    for (let level = 0; level < TOTAL_LEVELS; level++) {
        // Generate correct tile indices
        const correctIndices = new Set();
        while (correctIndices.size < config.correctTiles) {
            correctIndices.add(Math.floor(Math.random() * config.tiles));
        }
        board.push(Array.from(correctIndices));
    }
}

function createGrid() {
    elements.grid.innerHTML = '';

    const config = difficultyConfig[currentDifficulty];

    for (let level = 0; level < TOTAL_LEVELS; level++) {
        const levelDiv = document.createElement('div');
        levelDiv.className = 'tower-level';
        levelDiv.dataset.level = level + 1;

        for (let tile = 0; tile < config.tiles; tile++) {
            const tileDiv = document.createElement('div');
            tileDiv.className = 'tower-tile disabled';
            tileDiv.dataset.level = level;
            tileDiv.dataset.tile = tile;

            const content = document.createElement('div');
            content.className = 'tower-tile-content';
            tileDiv.appendChild(content);

            tileDiv.addEventListener('click', () => handleTileClick(level, tile));
            levelDiv.appendChild(tileDiv);
        }

        elements.grid.appendChild(levelDiv);
    }
}

function createMultiplierLadder() {
    elements.ladder.innerHTML = '';

    for (let level = TOTAL_LEVELS; level >= 1; level--) {
        const stepDiv = document.createElement('div');
        stepDiv.className = 'multiplier-step';
        stepDiv.dataset.level = level;

        const multiplier = calculateMultiplier(level, currentDifficulty);

        stepDiv.innerHTML = `
            <span class="step-level">Lvl ${level}</span>
            <span class="step-multiplier">${multiplier.toFixed(2)}x</span>
        `;

        elements.ladder.appendChild(stepDiv);
    }

    const headerDiv = document.createElement('div');
    headerDiv.className = 'ladder-header';
    headerDiv.textContent = 'Échelle des gains';
    elements.ladder.appendChild(headerDiv);
}

function updateMultiplierUI() {
    elements.multiplier.textContent = `${currentMultiplier.toFixed(2)}x`;
    const potential = currentBet * currentMultiplier;
    elements.potential.textContent = `${potential.toFixed(2)} €`;

    // Update ladder
    document.querySelectorAll('.multiplier-step').forEach((step, index) => {
        const level = parseInt(step.dataset.level);
        step.classList.remove('active', 'completed');

        if (level === currentLevel) {
            step.classList.add('active');
        } else if (level < currentLevel) {
            step.classList.add('completed');
        }
    });
}

function updateLevelDisplay() {
    elements.currentLevel.textContent = `${currentLevel}/${TOTAL_LEVELS}`;
}

function enableLevel(level) {
    const tiles = document.querySelectorAll(`[data-level="${level}"]`);
    tiles.forEach(tile => {
        if (tile.classList.contains('tower-tile')) {
            tile.classList.remove('disabled');
        }
    });
}

function disableAllTiles() {
    document.querySelectorAll('.tower-tile').forEach(tile => {
        tile.classList.add('disabled');
    });
}

function revealAllTiles() {
    for (let level = 0; level < TOTAL_LEVELS; level++) {
        const tiles = document.querySelectorAll(`[data-level="${level}"]`);
        const correctIndices = board[level];

        tiles.forEach((tile, index) => {
            if (!tile.classList.contains('tower-tile')) return;
            if (tile.classList.contains('safe')) return; // Already revealed

            const content = tile.querySelector('.tower-tile-content');
            if (correctIndices.includes(index)) {
                tile.classList.add('inactive');
                content.textContent = '💎';
            } else {
                tile.classList.add('inactive');
                content.textContent = '💣';
            }
        });
    }
}

function handleTileClick(level, tileIndex) {
    if (!roundActive || pendingResult || level !== currentLevel) return;

    const tile = document.querySelector(`[data-level="${level}"][data-tile="${tileIndex}"]`);
    if (!tile || tile.classList.contains('revealed') || tile.classList.contains('disabled')) return;

    pendingResult = true;
    disableAllTiles();

    const correctIndices = board[level];
    const isCorrect = correctIndices.includes(tileIndex);

    tile.classList.add('revealed');
    const content = tile.querySelector('.tower-tile-content');

    if (isCorrect) {
        tile.classList.add('safe');
        content.textContent = '💎';

        currentLevel++;
        currentMultiplier = calculateMultiplier(currentLevel, currentDifficulty);
        updateMultiplierUI();
        updateLevelDisplay();

        if (currentLevel >= TOTAL_LEVELS) {
            // Won the game!
            setStatus('🎉 Tour complétée ! Encaissement automatique.', 'success');
            setTimeout(() => settleRound(true, true), 1000);
        } else {
            setStatus(`Niveau ${currentLevel}/${TOTAL_LEVELS} - Continue ou encaisse !`, 'success');
            elements.cashoutBtn.disabled = false;
            pendingResult = false;
            enableLevel(currentLevel);
        }
    } else {
        tile.classList.add('fail');
        content.textContent = '💣';
        setStatus('💥 Boom ! Tu as perdu.', 'warning');
        revealAllTiles();
        setTimeout(() => settleRound(false), 1500);
    }
}

async function settleRound(cashout, wonAll = false) {
    const payout = cashout ? currentBet * currentMultiplier : 0;
    const roundedPayout = parseFloat(payout.toFixed(2));
    const profit = parseFloat((roundedPayout - currentBet).toFixed(2));
    const multiplierUsed = cashout ? currentMultiplier : 0;

    if (wonAll) {
        setStatus(`🏆 Tour complétée ! ${multiplierUsed.toFixed(2)}x`, 'success');
    }

    try {
        const outcome = await applyGameResult(currentUser.uid, {
            betAmount: currentBet,
            payout: roundedPayout,
            game: 'tower',
            metadata: {
                cashout,
                multiplier: parseFloat(multiplierUsed.toFixed(2)),
                level: currentLevel,
                difficulty: currentDifficulty
            }
        });
        balance = outcome.balance;
        balanceLoaded = true;
        updateBalanceDisplay();
    } catch (error) {
        console.error('Error applying tower result:', error);
        setStatus('Erreur lors de la mise à jour du solde.', 'warning');
    }

    stats.gamesPlayed += 1;
    if (cashout) {
        stats.cashouts += 1;
        stats.bestMultiplier = Math.max(stats.bestMultiplier, multiplierUsed);
    }
    stats.totalProfit = parseFloat((stats.totalProfit + profit).toFixed(2));
    updateStatsDisplay();

    endRoundState();
}

function endRoundState() {
    roundActive = false;
    pendingResult = false;
    currentBet = 0;
    currentLevel = 0;
    currentMultiplier = 1;
    elements.startBtn.disabled = false;
    elements.cashoutBtn.disabled = true;
    updateMultiplierUI();
    updateLevelDisplay();
}

function startRound() {
    if (!balanceLoaded || !currentUser) {
        setStatus('Connexion au solde en cours...', 'warning');
        return;
    }
    if (roundActive) {
        setStatus('Termine la manche en cours.', 'warning');
        return;
    }

    const bet = parseFloat(elements.betInput.value);
    if (isNaN(bet) || bet <= 0) {
        setStatus('Mise invalide.', 'warning');
        return;
    }
    if (bet > balance) {
        setStatus('Solde insuffisant.', 'warning');
        return;
    }

    currentBet = parseFloat(bet.toFixed(2));
    roundActive = true;
    pendingResult = false;
    currentLevel = 0;
    currentMultiplier = 1;

    elements.startBtn.disabled = true;
    elements.cashoutBtn.disabled = true;

    generateBoard(currentDifficulty);
    createGrid();
    createMultiplierLadder();

    enableLevel(0);
    updateMultiplierUI();
    updateLevelDisplay();

    setStatus('Choisis une tuile pour commencer !', 'info');
}

function cashout() {
    if (!roundActive || pendingResult) return;
    if (currentLevel === 0) {
        setStatus('Monte au moins un niveau avant de cashout.', 'warning');
        return;
    }
    pendingResult = true;
    disableAllTiles();
    revealAllTiles();
    settleRound(true);
}

function handleDifficultyChange(difficulty) {
    if (roundActive) {
        setStatus('Termine la partie en cours avant de changer.', 'warning');
        return;
    }

    currentDifficulty = difficulty;
    elements.difficultyButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.difficulty === difficulty);
    });

    createGrid();
    createMultiplierLadder();
    setStatus(`Difficulté ${difficulty === 'easy' ? 'Facile' : difficulty === 'medium' ? 'Moyenne' : 'Difficile'} sélectionnée.`);
}

function setupEventListeners() {
    elements.startBtn.addEventListener('click', startRound);
    elements.cashoutBtn.addEventListener('click', cashout);

    elements.difficultyButtons.forEach(btn => {
        btn.addEventListener('click', () => handleDifficultyChange(btn.dataset.difficulty));
    });

    document.querySelectorAll('.quick-bet').forEach(btn => {
        btn.addEventListener('click', () => {
            let current = parseFloat(elements.betInput.value) || 0;
            switch (btn.dataset.action) {
                case 'half':
                    elements.betInput.value = Math.max(0.5, current / 2).toFixed(2);
                    break;
                case 'double': {
                    const doubled = Math.max(0.5, current * 2);
                    const target = balanceLoaded ? Math.min(balance, doubled) : doubled;
                    elements.betInput.value = Math.max(0.5, target).toFixed(2);
                    break;
                }
                case 'min':
                    elements.betInput.value = '0.50';
                    break;
                case 'max':
                    if (balanceLoaded) {
                        elements.betInput.value = Math.max(0.5, balance).toFixed(2);
                    }
                    break;
            }
        });
    });

    elements.depositBtn.addEventListener('click', async () => {
        if (!currentUser) {
            alert('Veuillez vous connecter');
            return;
        }
        const amount = prompt('Montant à déposer (€):');
        const depositAmount = parseFloat(amount);
        if (amount && !isNaN(depositAmount) && depositAmount > 0) {
            try {
                await addFunds(currentUser.uid, depositAmount);
                alert(`${depositAmount.toFixed(2)} € ajoutés à votre solde!`);
            } catch (error) {
                console.error('Error adding funds:', error);
                alert('Erreur lors du dépôt');
            }
        }
    });

    elements.logoutBtn.addEventListener('click', async () => {
        try {
            if (unsubscribeUser) {
                unsubscribeUser();
            }
            await signOut(auth);
            window.location.href = 'login.html';
        } catch (error) {
            console.error('Error signing out:', error);
        }
    });
}

function init() {
    createGrid();
    createMultiplierLadder();
    setStatus('Choisis ta mise et clique sur Commencer.');
    updateStatsDisplay();
    updateLevelDisplay();
    setupEventListeners();
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    currentUser = user;
    await initializeUserBalance(user);

    if (unsubscribeUser) {
        unsubscribeUser();
    }

    unsubscribeUser = subscribeToUserData(user.uid, (data) => {
        if (!data) {
            balanceLoaded = false;
            updateBalanceDisplay();
            if (elements.startBtn) {
                elements.startBtn.disabled = true;
            }
            return;
        }
        balance = data.balance;
        balanceLoaded = true;
        updateBalanceDisplay();
        syncStatsFromUser(data);
        if (elements.startBtn && !roundActive) {
            elements.startBtn.disabled = false;
        }
    });
});

init();
