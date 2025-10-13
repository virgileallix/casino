import { auth, signOut, onAuthStateChanged } from './firebase-config.js';
import { initializeUserBalance, subscribeToUserData, applyGameResult } from './balance-manager.js';

let currentUser = null;
let unsubscribeUser = null;
let balance = 0;
let balanceLoaded = false;
let isPlaying = false;

// Game state
let selectedNumbers = new Set();
let drawnNumbers = [];
let currentRisk = 'low';
let stats = {
    gamesPlayed: 0,
    wins: 0,
    bestWin: 0
};

// Payout tables for different risk levels
const PAYOUT_TABLES = {
    classic: {
        1: [0, 3.7],
        2: [0, 1, 14],
        3: [0, 1, 2, 45],
        4: [0, 0.5, 2, 6, 95],
        5: [0, 0.5, 1, 3, 20, 200],
        6: [0, 0.5, 1, 2, 10, 60, 500],
        7: [0, 0.5, 1, 1, 5, 20, 120, 1000],
        8: [0, 0.5, 0.5, 1, 3, 12, 50, 250, 2500],
        9: [0, 0.5, 0.5, 1, 2, 7, 25, 120, 750, 5000],
        10: [0, 0, 0.5, 1, 2, 5, 15, 60, 350, 2000, 10000]
    },
    low: {
        1: [0, 2.5],
        2: [0, 1, 9],
        3: [0, 1, 2, 30],
        4: [0, 0.5, 2, 5, 60],
        5: [0, 0.5, 1, 3, 15, 120],
        6: [0, 0.5, 1, 2, 8, 40, 300],
        7: [0, 0.5, 1, 1, 4, 15, 80, 600],
        8: [0, 0.5, 0.5, 1, 3, 10, 35, 180, 1500],
        9: [0, 0.5, 0.5, 1, 2, 6, 20, 90, 500, 3000],
        10: [0, 0, 0.5, 1, 2, 4, 12, 45, 250, 1500, 7000]
    },
    high: {
        1: [0, 4.5],
        2: [0, 1, 18],
        3: [0, 1, 2, 60],
        4: [0, 0.5, 2, 7, 130],
        5: [0, 0.5, 1, 3, 25, 280],
        6: [0, 0.5, 1, 2, 12, 80, 700],
        7: [0, 0.5, 1, 1, 6, 25, 160, 1400],
        8: [0, 0.5, 0.5, 1, 3, 14, 65, 370, 3500],
        9: [0, 0.5, 0.5, 1, 2, 8, 30, 150, 1000, 7000],
        10: [0, 0, 0.5, 1, 2, 6, 18, 75, 450, 2800, 15000]
    }
};

// Initialize
function init() {
    generateBoard();
    generatePayoutTable();
    setupEventListeners();
    updatePayoutDisplay();
}

// Generate keno board
function generateBoard() {
    const board = document.getElementById('kenoBoard');
    board.innerHTML = '';

    for (let i = 1; i <= 40; i++) {
        const numberDiv = document.createElement('div');
        numberDiv.className = 'keno-number';
        numberDiv.textContent = i;
        numberDiv.dataset.number = i;

        numberDiv.addEventListener('click', () => toggleNumber(i));

        board.appendChild(numberDiv);
    }
}

// Toggle number selection
function toggleNumber(num) {
    if (isPlaying) return;

    const numberEl = document.querySelector(`[data-number="${num}"]`);

    if (selectedNumbers.has(num)) {
        selectedNumbers.delete(num);
        numberEl.classList.remove('selected');
    } else {
        if (selectedNumbers.size >= 10) {
            return; // Max 10 numbers
        }
        selectedNumbers.add(num);
        numberEl.classList.add('selected');
    }

    updateSelectedCount();
    updatePayoutDisplay();
    updatePlayButton();
}

// Update selected count display
function updateSelectedCount() {
    document.getElementById('selectedCount').textContent = selectedNumbers.size;
}

// Update play button state
function updatePlayButton() {
    const playBtn = document.getElementById('playBtn');
    playBtn.disabled = selectedNumbers.size === 0 || isPlaying || !balanceLoaded;
}

// Update payout display
function updatePayoutDisplay() {
    const betAmount = parseFloat(document.getElementById('betAmount').value) || 0;
    const numSelected = selectedNumbers.size;

    if (numSelected === 0) {
        document.getElementById('payoutMultiplier').textContent = '0.00x';
        document.getElementById('payoutAmount').textContent = '0.00 €';
        return;
    }

    // Get best possible multiplier (all numbers hit)
    const payoutTable = PAYOUT_TABLES[currentRisk][numSelected];
    const maxMultiplier = payoutTable[payoutTable.length - 1];

    document.getElementById('payoutMultiplier').textContent = `${maxMultiplier.toFixed(2)}x`;
    document.getElementById('payoutAmount').textContent = `${(betAmount * maxMultiplier).toFixed(2)} €`;
}

// Generate payout table
function generatePayoutTable() {
    const table = document.getElementById('payoutTable');
    const payoutData = PAYOUT_TABLES[currentRisk];

    let html = '<thead><tr><th>Sélection</th><th>Trouvés</th><th>Multiplicateur</th></tr></thead><tbody>';

    for (let selected = 1; selected <= 10; selected++) {
        const payouts = payoutData[selected];
        for (let hits = 0; hits < payouts.length; hits++) {
            const multiplier = payouts[hits];
            if (multiplier > 0) {
                html += `<tr data-selected="${selected}" data-hits="${hits}">
                    <td>${selected}</td>
                    <td>${hits}</td>
                    <td class="multiplier">${multiplier.toFixed(2)}x</td>
                </tr>`;
            }
        }
    }

    html += '</tbody>';
    table.innerHTML = html;
}

// Play game
async function playGame() {
    if (isPlaying || selectedNumbers.size === 0 || !currentUser) return;

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
    updatePlayButton();

    // Clear previous results
    clearResults();

    // Draw 10 random numbers
    drawnNumbers = [];
    const availableNumbers = Array.from({length: 40}, (_, i) => i + 1);

    for (let i = 0; i < 10; i++) {
        const randomIndex = Math.floor(Math.random() * availableNumbers.length);
        drawnNumbers.push(availableNumbers[randomIndex]);
        availableNumbers.splice(randomIndex, 1);
    }

    // Animate drawing
    await animateDrawing();

    // Calculate results
    const hits = drawnNumbers.filter(num => selectedNumbers.has(num)).length;
    const payoutTable = PAYOUT_TABLES[currentRisk][selectedNumbers.size];
    const multiplier = payoutTable[hits] || 0;
    const payout = parseFloat((betAmount * multiplier).toFixed(2));
    const profit = parseFloat((payout - betAmount).toFixed(2));
    const won = payout > 0;

    // Show results
    displayResults(hits, multiplier, profit, won);

    // Update balance
    try {
        const result = await applyGameResult(currentUser.uid, {
            betAmount,
            payout,
            game: 'keno',
            metadata: {
                result: won ? 'win' : 'loss',
                hits,
                selected: selectedNumbers.size,
                multiplier
            }
        });

        balance = result.balance;
        updateBalanceDisplay();

        // Update stats
        stats.gamesPlayed++;
        if (won) stats.wins++;
        if (profit > stats.bestWin) stats.bestWin = profit;
        updateStats();

        // Add to history
        addToHistory(hits, multiplier, betAmount, profit, won);

    } catch (error) {
        console.error('Error applying game result:', error);
        alert('Erreur lors de la mise à jour du solde');
    } finally {
        isPlaying = false;
        updatePlayButton();
    }
}

// Animate drawing
async function animateDrawing() {
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    for (let i = 0; i < drawnNumbers.length; i++) {
        await wait(200);
        const num = drawnNumbers[i];
        const numberEl = document.querySelector(`[data-number="${num}"]`);

        if (selectedNumbers.has(num)) {
            numberEl.classList.add('hit');
        } else {
            numberEl.classList.add('drawn');
        }
    }
}

// Display results
function displayResults(hits, multiplier, profit, won) {
    const resultInfo = document.getElementById('resultInfo');

    if (won) {
        resultInfo.innerHTML = `<span style="color: var(--accent-primary)">
            ${hits}/${selectedNumbers.size} • ${multiplier.toFixed(2)}x • +${profit.toFixed(2)} €
        </span>`;
    } else {
        resultInfo.innerHTML = `<span style="color: #ff4444">
            ${hits}/${selectedNumbers.size} • 0.00x • ${profit.toFixed(2)} €
        </span>`;
    }

    // Highlight payout table row
    const tableRow = document.querySelector(`[data-selected="${selectedNumbers.size}"][data-hits="${hits}"]`);
    if (tableRow) {
        document.querySelectorAll('.payout-table tr').forEach(row => row.classList.remove('highlighted'));
        tableRow.classList.add('highlighted');
        tableRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// Clear results
function clearResults() {
    document.querySelectorAll('.keno-number').forEach(el => {
        el.classList.remove('hit', 'drawn', 'miss');
    });
    document.getElementById('resultInfo').innerHTML = '';
    document.querySelectorAll('.payout-table tr').forEach(row => row.classList.remove('highlighted'));
}

// Clear selected numbers
function clearSelection() {
    selectedNumbers.clear();
    document.querySelectorAll('.keno-number').forEach(el => {
        el.classList.remove('selected', 'hit', 'drawn');
    });
    updateSelectedCount();
    updatePayoutDisplay();
    updatePlayButton();
    document.getElementById('resultInfo').innerHTML = '';
}

// Quick pick
function quickPick() {
    if (isPlaying) return;

    clearSelection();

    const count = Math.floor(Math.random() * 10) + 1; // 1-10
    const available = Array.from({length: 40}, (_, i) => i + 1);

    for (let i = 0; i < count; i++) {
        const randomIndex = Math.floor(Math.random() * available.length);
        const num = available[randomIndex];
        available.splice(randomIndex, 1);

        selectedNumbers.add(num);
        const numberEl = document.querySelector(`[data-number="${num}"]`);
        numberEl.classList.add('selected');
    }

    updateSelectedCount();
    updatePayoutDisplay();
    updatePlayButton();
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
    const winRate = stats.gamesPlayed > 0 ? (stats.wins / stats.gamesPlayed * 100).toFixed(1) : 0;
    document.getElementById('statWinRate').textContent = `${winRate}%`;
    document.getElementById('statBestWin').textContent = `${stats.bestWin.toFixed(2)} €`;
}

// Add to history
function addToHistory(hits, multiplier, betAmount, profit, won) {
    const historyList = document.getElementById('historyList');
    const noHistory = historyList.querySelector('.no-history');
    if (noHistory) noHistory.remove();

    const item = document.createElement('div');
    item.className = 'history-item';

    item.innerHTML = `
        <div class="history-header">
            <span>${hits}/${selectedNumbers.size} trouvés</span>
            <span class="history-result ${won ? 'win' : 'loss'}">
                ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} €
            </span>
        </div>
        <div class="history-details">
            <span>Mise: ${betAmount.toFixed(2)} €</span>
            <span>Multi: ${multiplier.toFixed(2)}x</span>
        </div>
    `;

    historyList.insertBefore(item, historyList.firstChild);

    // Keep only last 10
    while (historyList.children.length > 10) {
        historyList.removeChild(historyList.lastChild);
    }
}

// Setup event listeners
function setupEventListeners() {
    // Play button
    document.getElementById('playBtn').addEventListener('click', playGame);

    // Clear button
    document.getElementById('clearBtn').addEventListener('click', clearSelection);

    // Quick pick
    document.getElementById('quickPickBtn').addEventListener('click', quickPick);

    // Risk buttons
    document.querySelectorAll('.risk-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.risk-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentRisk = btn.dataset.risk;
            generatePayoutTable();
            updatePayoutDisplay();
        });
    });

    // Bet amount
    document.getElementById('betAmount').addEventListener('input', updatePayoutDisplay);

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
            updatePayoutDisplay();
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
        stats.gamesPlayed = data.kenoGamesPlayed || 0;
        stats.wins = data.kenoWins || 0;
        stats.bestWin = data.kenoBestWin || 0;

        updateBalanceDisplay();
        updateStats();
        updatePlayButton();
    });
});

init();
