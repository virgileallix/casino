import { auth, signOut, onAuthStateChanged } from './firebase-config.js';
import { initializeUserBalance, subscribeToUserData, applyGameResult } from './balance-manager.js';

let currentUser = null;
let unsubscribeUser = null;
let balance = 0;
let balanceLoaded = false;
let isPlaying = false;

// Game state
let currentDifficulty = 'medium';
let stats = {
    gamesPlayed: 0,
    wins: 0,
    bestMultiplier: 0,
    totalProfit: 0
};

// Payout tables for each difficulty (multiplier: weight)
const PAYOUT_TABLES = {
    easy: {
        multipliers: [2, 3, 4, 5, 8, 10, 15, 20, 25],
        weights: [35, 25, 15, 10, 7, 4, 2, 1.5, 0.5]
    },
    medium: {
        multipliers: [2, 3, 5, 8, 10, 15, 20, 30, 40, 50],
        weights: [30, 20, 15, 12, 10, 6, 4, 2, 0.8, 0.2]
    },
    hard: {
        multipliers: [2, 3, 5, 10, 15, 20, 30, 50, 75, 100],
        weights: [25, 18, 15, 12, 10, 8, 6, 4, 1.5, 0.5]
    },
    expert: {
        multipliers: [2, 3, 5, 10, 20, 50, 100, 500, 1000, 10000],
        weights: [40, 25, 15, 10, 5, 3, 1.5, 0.3, 0.15, 0.05]
    }
};

// Initialize
function init() {
    setupEventListeners();
    generatePayoutTable();
    updateOpenButton();
}

// Setup event listeners
function setupEventListeners() {
    // Open button
    document.getElementById('openBtn').addEventListener('click', openCase);

    // Difficulty buttons
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentDifficulty = btn.dataset.difficulty;
            generatePayoutTable();
            updateDifficultyLabel();
        });
    });

    // Bet amount
    document.getElementById('betAmount').addEventListener('input', updateOpenButton);

    // Quick bets
    document.querySelectorAll('.quick-bet').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            const betInput = document.getElementById('betAmount');
            let currentBet = parseFloat(betInput.value) || 0;

            switch(action) {
                case 'half':
                    betInput.value = Math.max(0.10, currentBet / 2).toFixed(2);
                    break;
                case 'double':
                    betInput.value = (currentBet * 2).toFixed(2);
                    break;
                case 'min':
                    betInput.value = '0.10';
                    break;
                case 'max':
                    if (balanceLoaded) {
                        betInput.value = balance.toFixed(2);
                    }
                    break;
            }
            updateOpenButton();
        });
    });

    // Profile button
    const profileBtn = document.getElementById('profileBtn');
    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            if (currentUser) {
                window.location.href = `profile.html?uid=${currentUser.uid}`;
            }
        });
    }

    // Admin button
    const adminBtn = document.getElementById('adminBtn');
    if (adminBtn) {
        adminBtn.addEventListener('click', () => {
            window.location.href = 'admin.html';
        });
    }

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        try {
            if (unsubscribeUser) unsubscribeUser();
            await signOut(auth);
            window.location.href = 'login.html';
        } catch (error) {
            console.error('Error signing out:', error);
        }
    });
}

// Update difficulty label
function updateDifficultyLabel() {
    const labels = {
        easy: 'Facile',
        medium: 'Moyen',
        hard: 'Difficile',
        expert: 'Expert'
    };
    document.getElementById('currentDifficultyLabel').textContent = labels[currentDifficulty];
}

// Generate payout table
function generatePayoutTable() {
    const payoutGrid = document.getElementById('payoutGrid');
    const table = PAYOUT_TABLES[currentDifficulty];

    payoutGrid.innerHTML = '';

    table.multipliers.forEach((multiplier, index) => {
        const weight = table.weights[index];
        const chance = (weight / table.weights.reduce((a, b) => a + b, 0) * 100).toFixed(2);

        const item = document.createElement('div');
        item.className = 'payout-item';
        item.innerHTML = `
            <div class="payout-multiplier">${multiplier}x</div>
            <div class="payout-chance">${chance}%</div>
        `;
        payoutGrid.appendChild(item);
    });
}

// Generate carousel cases
function generateCarousel(winningMultiplier) {
    const carousel = document.getElementById('caseCarousel');
    carousel.innerHTML = '';

    const table = PAYOUT_TABLES[currentDifficulty];
    const totalCases = 21; // Show 21 cases
    const winnerIndex = Math.floor(totalCases / 2); // Winner in the middle

    for (let i = 0; i < totalCases; i++) {
        const caseDiv = document.createElement('div');
        caseDiv.className = 'case-item';

        let multiplier;
        if (i === winnerIndex) {
            multiplier = winningMultiplier;
        } else {
            // Random multiplier from the table
            const randomIndex = Math.floor(Math.random() * table.multipliers.length);
            multiplier = table.multipliers[randomIndex];
        }

        caseDiv.innerHTML = `
            <div class="case-icon">📦</div>
            <div class="case-multiplier">${multiplier}x</div>
        `;

        carousel.appendChild(caseDiv);
    }
}

// Select random multiplier based on weights
function selectMultiplier() {
    const table = PAYOUT_TABLES[currentDifficulty];
    const totalWeight = table.weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < table.multipliers.length; i++) {
        random -= table.weights[i];
        if (random <= 0) {
            return table.multipliers[i];
        }
    }

    return table.multipliers[0];
}

// Open case animation
async function openCase() {
    if (isPlaying || !currentUser) return;

    const betAmount = parseFloat(document.getElementById('betAmount').value);

    if (isNaN(betAmount) || betAmount <= 0) {
        alert('Mise invalide');
        return;
    }

    if (!balanceLoaded) {
        alert('Solde en cours de synchronisation');
        return;
    }

    if (betAmount > balance) {
        alert('Solde insuffisant');
        return;
    }

    isPlaying = true;
    updateOpenButton();
    hideResultDisplay();

    // Select winning multiplier
    const winningMultiplier = selectMultiplier();
    const payout = parseFloat((betAmount * winningMultiplier).toFixed(2));
    const profit = parseFloat((payout - betAmount).toFixed(2));
    const won = profit > 0;

    // Generate carousel with winner
    generateCarousel(winningMultiplier);

    // Animate carousel
    await animateCarousel();

    // Show result
    displayResult(winningMultiplier, profit, won);

    // Update balance
    try {
        const result = await applyGameResult(currentUser.uid, {
            betAmount,
            payout,
            game: 'cases',
            metadata: {
                result: won ? 'win' : 'loss',
                multiplier: winningMultiplier,
                difficulty: currentDifficulty
            }
        });

        balance = result.balance;
        updateBalanceDisplay();

        // Update stats
        stats.gamesPlayed++;
        if (won) stats.wins++;
        if (winningMultiplier > stats.bestMultiplier) stats.bestMultiplier = winningMultiplier;
        stats.totalProfit += profit;
        updateStats();

        // Add to history
        addToHistory(winningMultiplier, betAmount, profit, won);

    } catch (error) {
        console.error('Error applying game result:', error);
        alert('Erreur lors de la mise à jour du solde');
    } finally {
        isPlaying = false;
        updateOpenButton();
    }
}

// Animate carousel spinning
async function animateCarousel() {
    const carousel = document.getElementById('caseCarousel');
    const caseItems = carousel.querySelectorAll('.case-item');
    const middleIndex = Math.floor(caseItems.length / 2);
    const caseWidth = 135; // 120px width + 15px gap

    // Calculate offset to center the winning case
    const offset = -(middleIndex * caseWidth) + (window.innerWidth / 2) - 200;

    // Spin animation
    carousel.style.transform = 'translateX(100px)';

    await new Promise(resolve => setTimeout(resolve, 100));

    carousel.style.transition = 'transform 3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    carousel.style.transform = `translateX(${offset}px)`;

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Highlight winner
    caseItems[middleIndex].classList.add('winner');

    await new Promise(resolve => setTimeout(resolve, 500));
}

// Display result
function displayResult(multiplier, profit, won) {
    const resultDisplay = document.getElementById('resultDisplay');
    const resultMultiplier = document.getElementById('resultMultiplier');
    const resultAmount = document.getElementById('resultAmount');

    resultMultiplier.textContent = `${multiplier}x`;
    resultAmount.textContent = `${profit >= 0 ? '+' : ''}${profit.toFixed(2)} €`;
    resultAmount.style.color = won ? 'var(--accent-primary)' : '#ff4444';

    resultDisplay.style.display = 'flex';
}

// Hide result display
function hideResultDisplay() {
    document.getElementById('resultDisplay').style.display = 'none';
}

// Update open button state
function updateOpenButton() {
    const openBtn = document.getElementById('openBtn');
    const betAmount = parseFloat(document.getElementById('betAmount').value);
    openBtn.disabled = isPlaying || !balanceLoaded || isNaN(betAmount) || betAmount <= 0;
}

// Update balance display
function updateBalanceDisplay() {
    const balanceEl = document.getElementById('userBalance');
    if (!balanceEl) return;
    if (!balanceLoaded) {
        balanceEl.textContent = '---';
        return;
    }
    balanceEl.textContent = `${balance.toFixed(2)} €`;
}

// Update stats display
function updateStats() {
    document.getElementById('statGames').textContent = stats.gamesPlayed;
    document.getElementById('statWins').textContent = stats.wins;
    document.getElementById('statBestMultiplier').textContent = `${stats.bestMultiplier.toFixed(2)}x`;
    document.getElementById('statTotalProfit').textContent = `${stats.totalProfit.toFixed(2)} €`;
}

// Add to history
function addToHistory(multiplier, betAmount, profit, won) {
    const historyList = document.getElementById('historyList');
    const noHistory = historyList.querySelector('.no-history');
    if (noHistory) noHistory.remove();

    const item = document.createElement('div');
    item.className = 'history-item';

    item.innerHTML = `
        <div class="history-info">
            <div class="history-multiplier">${multiplier}x</div>
            <div class="history-bet">Mise: ${betAmount.toFixed(2)} €</div>
        </div>
        <div class="history-result ${won ? 'win' : 'loss'}">
            ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} €
        </div>
    `;

    historyList.insertBefore(item, historyList.firstChild);

    // Keep only last 10
    while (historyList.children.length > 10) {
        historyList.removeChild(historyList.lastChild);
    }
}

// Auth listener
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    currentUser = user;
    await initializeUserBalance(user);

    if (unsubscribeUser) unsubscribeUser();

    unsubscribeUser = subscribeToUserData(user.uid, (data) => {
        if (!data) {
            balanceLoaded = false;
            updateBalanceDisplay();
            return;
        }

        balance = data.balance;
        balanceLoaded = true;

        // Load stats
        stats.gamesPlayed = data.casesGamesPlayed || 0;
        stats.wins = data.casesWins || 0;
        stats.bestMultiplier = data.casesBestMultiplier || 0;
        stats.totalProfit = data.casesTotalProfit || 0;

        updateBalanceDisplay();
        updateStats();
        updateOpenButton();
    });
});

init();
