import { auth, signOut, onAuthStateChanged } from 'js/core/firebase-config.js';
import { initializeUserBalance, subscribeToUserData, addFunds, applyGameResult } from 'js/core/balance-manager.js';

const TOTAL_TILES = 25;
const GRID_SIZE = 5;

let currentUser = null;
let unsubscribeUser = null;
let balance = 0;
let balanceLoaded = false;

let roundActive = false;
let board = [];
let revealedTiles = new Set();
let currentMines = 5;
let currentBet = 0;
let currentMultiplier = 1;
let pendingResult = false;

const stats = {
    gamesPlayed: 0,
    cashouts: 0,
    bestMultiplier: 0,
    totalProfit: 0
};

const elements = {
    userBalance: document.getElementById('userBalance'),
    depositBtn: document.getElementById('depositBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    betInput: document.getElementById('betAmount'),
    startBtn: document.getElementById('startBtn'),
    cashoutBtn: document.getElementById('cashoutBtn'),
    minesButtons: Array.from(document.querySelectorAll('.mines-btn')),
    minesRange: document.getElementById('minesRange'),
    minesRangeValue: document.getElementById('minesRangeValue'),
    status: document.getElementById('gameStatus'),
    multiplier: document.getElementById('currentMultiplier'),
    potential: document.getElementById('potentialPayout'),
    grid: document.getElementById('minesGrid'),
    historyList: document.getElementById('historyList'),
    stats: {
        games: document.getElementById('minesGamesPlayed'),
        cashouts: document.getElementById('minesCashouts'),
        bestMultiplier: document.getElementById('minesBestMultiplier'),
        totalProfit: document.getElementById('minesTotalProfit')
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
    stats.gamesPlayed = userData.minesGamesPlayed ?? 0;
    stats.cashouts = userData.minesCashouts ?? 0;
    stats.bestMultiplier = userData.minesBestMultiplier ?? 0;
    stats.totalProfit = parseFloat((userData.minesTotalProfit ?? 0).toFixed(2));
    updateStatsDisplay();
}

function createGrid() {
    elements.grid.innerHTML = '';
    for (let i = 0; i < TOTAL_TILES; i++) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.dataset.index = i;
        const content = document.createElement('div');
        content.className = 'tile-content';
        tile.appendChild(content);
        tile.addEventListener('click', () => revealTile(i));
        elements.grid.appendChild(tile);
    }
}

function resetBoardUI() {
    revealedTiles.clear();
    currentMultiplier = 1;
    elements.multiplier.textContent = '1.00x';
    elements.potential.textContent = '0.00 €';
    elements.cashoutBtn.disabled = true;

    Array.from(elements.grid.children).forEach(tile => {
        tile.className = 'tile';
        tile.querySelector('.tile-content').textContent = '';
        tile.classList.add('pending');
        setTimeout(() => tile.classList.remove('pending'), 500);
    });
}

function generateBoard(mines) {
    const positions = new Set();
    while (positions.size < mines) {
        positions.add(Math.floor(Math.random() * TOTAL_TILES));
    }
    board = Array.from({ length: TOTAL_TILES }, (_, index) => positions.has(index));
}

function calculateMultiplier(safeRevealed, mineCount) {
    if (safeRevealed === 0) return 1;

    const houseEdge = 0.03; // 3% house edge
    const safeTiles = TOTAL_TILES - mineCount;

    let multiplier = 1;
    for (let i = 0; i < safeRevealed; i++) {
        const tilesLeft = TOTAL_TILES - i;
        const safeTilesLeft = safeTiles - i;

        // Probability of hitting a safe tile = safeTilesLeft / tilesLeft
        const probability = safeTilesLeft / tilesLeft;

        // Multiplier for this pick = (1 - houseEdge) / probability
        multiplier *= (1 - houseEdge) / probability;
    }

    return Math.max(1.01, multiplier);
}

function updateMultiplierUI() {
    elements.multiplier.textContent = `${currentMultiplier.toFixed(2)}x`;
    const potential = currentBet * currentMultiplier;
    elements.potential.textContent = `${potential.toFixed(2)} €`;
}

function highlightMines() {
    Array.from(elements.grid.children).forEach((tile, index) => {
        if (board[index]) {
            tile.classList.add('revealed', 'mine');
            tile.querySelector('.tile-content').textContent = '💣';
        }
    });
}

function revealTile(index) {
    if (!roundActive || pendingResult) return;
    if (revealedTiles.has(index)) return;
    const tile = elements.grid.children[index];
    tile.classList.remove('pending');

    revealedTiles.add(index);
    tile.classList.add('revealed');

    if (board[index]) {
        tile.classList.add('mine');
        tile.querySelector('.tile-content').textContent = '💣';
        pendingResult = true;
        highlightMines();
        settleRound(false);
    } else {
        tile.classList.add('safe');
        tile.querySelector('.tile-content').textContent = '💎';
        currentMultiplier = calculateMultiplier(revealedTiles.size, currentMines);
        updateMultiplierUI();
        elements.cashoutBtn.disabled = false;
        setStatus('Continue ou encaisse ton gain.', 'info');

        if (revealedTiles.size >= TOTAL_TILES - currentMines) {
            pendingResult = true;
            settleRound(true);
        }
    }
}

async function settleRound(cashout) {
    const payout = cashout ? currentBet * currentMultiplier : 0;
    const roundedPayout = parseFloat(payout.toFixed(2));
    const profit = parseFloat((roundedPayout - currentBet).toFixed(2));
    const multiplierUsed = cashout ? currentMultiplier : 0;

    setStatus(cashout ? `Cashout réussi ! ${multiplierUsed.toFixed(2)}x` : 'Boom ! Mine trouvée.', cashout ? 'success' : 'warning');

    try {
        const outcome = await applyGameResult(currentUser.uid, {
            betAmount: currentBet,
            payout: roundedPayout,
            game: 'mines',
            metadata: {
                cashout,
                multiplier: parseFloat(multiplierUsed.toFixed(2))
            }
        });
        balance = outcome.balance;
        balanceLoaded = true;
        updateBalanceDisplay();
    } catch (error) {
        console.error('Error applying mines result:', error);
        setStatus('Erreur lors de la mise à jour du solde.', 'warning');
    }

    stats.gamesPlayed += 1;
    if (cashout) {
        stats.cashouts += 1;
        stats.bestMultiplier = Math.max(stats.bestMultiplier, multiplierUsed);
    }
    stats.totalProfit = parseFloat((stats.totalProfit + profit).toFixed(2));
    updateStatsDisplay();
    appendHistory(cashout, multiplierUsed, profit);

    endRoundState();
}

function appendHistory(cashout, multiplier, profit) {
    const noHistory = elements.historyList.querySelector('.no-history');
    if (noHistory) {
        noHistory.remove();
    }
    const entry = document.createElement('div');
    entry.className = `history-item ${cashout ? 'win' : 'loss'}`;
    entry.innerHTML = `
        <span>${cashout ? 'Cashout' : 'Explosion'}</span>
        <span>${multiplier ? `${multiplier.toFixed(2)}x` : '0.00x'}</span>
        <span>${profit >= 0 ? '+' : ''}${profit.toFixed(2)} €</span>
    `;
    elements.historyList.prepend(entry);
    while (elements.historyList.children.length > 15) {
        elements.historyList.removeChild(elements.historyList.lastChild);
    }
}

function endRoundState() {
    roundActive = false;
    pendingResult = false;
    elements.startBtn.disabled = false;
    elements.cashoutBtn.disabled = true;
    currentBet = 0;
}

function resetRound() {
    roundActive = false;
    pendingResult = false;
    currentBet = 0;
    elements.cashoutBtn.disabled = true;
    if (elements.startBtn) {
        elements.startBtn.disabled = !balanceLoaded;
    }
    setStatus('Choisis ta mise et clique sur Commencer.');
    resetBoardUI();
}

function startRound() {
    if (!balanceLoaded || !currentUser) {
        setStatus('Connexion au solde en cours...', 'warning');
        return;
    }
    if (roundActive) {
        setStatus('Termine la manche en cours avant de recommencer.', 'warning');
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
    currentMultiplier = 1;
    elements.startBtn.disabled = true;
    elements.cashoutBtn.disabled = true;
    revealedTiles.clear();

    generateBoard(currentMines);
    resetBoardUI();
    setStatus(`Bonne chance ! ${currentMines} mines en jeu.`, 'info');
}

function cashout() {
    if (!roundActive || pendingResult) return;
    if (revealedTiles.size === 0) {
        setStatus('Révèle au moins une gemme avant de cashout.', 'warning');
        return;
    }
    pendingResult = true;
    settleRound(true);
}

function handleMinesButtonClick(mines) {
    currentMines = mines;
    elements.minesRange.value = mines;
    elements.minesRangeValue.textContent = `${mines} mines`;
    elements.minesButtons.forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.mines, 10) === mines);
    });
    if (!roundActive) {
        setStatus(`Prêt pour une partie avec ${mines} mines.`);
    }
}

function setupEventListeners() {
    elements.startBtn.addEventListener('click', startRound);
    elements.cashoutBtn.addEventListener('click', cashout);

    elements.minesButtons.forEach(btn => {
        btn.addEventListener('click', () => handleMinesButtonClick(parseInt(btn.dataset.mines, 10)));
    });

    elements.minesRange.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        handleMinesButtonClick(value);
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
                default:
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
                //await addFunds(currentUser.uid, depositAmount);
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
            window.location.href = 'pages/auth/login.html';
        } catch (error) {
            console.error('Error signing out:', error);
        }
    });
}

function init() {
    createGrid();
    handleMinesButtonClick(currentMines);
    setStatus('Choisis ta mise et clique sur Commencer.');
    updateStatsDisplay();
    setupEventListeners();
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'pages/auth/login.html';
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
            resetRound();
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
