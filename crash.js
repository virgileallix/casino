import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { updateBalance, getUserBalance } from './balance-manager.js';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

let currentUser = null;
let gameState = 'waiting';
let currentMultiplier = 1.00;
let betAmount = 0;
let hasBet = false;
let gameInterval = null;
let startTime = 0;
let crashPoint = 0;
let history = [];
let stats = { totalWagered: 0, totalWon: 0, gamesPlayed: 0, bestCashout: 0 };

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await loadUserBalance();
        await loadStats();
        initializeGame();
    } else {
        window.location.href = 'login.html';
    }
});

async function loadUserBalance() {
    const balance = await getUserBalance(currentUser.uid);
    document.getElementById('userBalance').textContent = balance.toFixed(2) + ' €';
}

async function loadStats() {
    const userRef = doc(db, 'users', currentUser.uid);
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
        const data = userDoc.data();
        const gameStats = data.gameStats?.crash || {};
        stats.totalWagered = gameStats.totalWagered || 0;
        stats.totalWon = gameStats.totalWon || 0;
        stats.gamesPlayed = gameStats.gamesPlayed || 0;
        stats.bestCashout = gameStats.biggestMultiplier || 0;
        updateStatsDisplay();
    }
}

function updateStatsDisplay() {
    document.getElementById('totalWagered').textContent = stats.totalWagered.toFixed(2) + ' €';
    document.getElementById('totalWon').textContent = stats.totalWon.toFixed(2) + ' €';
    const profit = stats.totalWon - stats.totalWagered;
    document.getElementById('totalProfit').textContent = profit.toFixed(2) + ' €';
    document.getElementById('totalProfit').style.color = profit >= 0 ? 'var(--accent-primary)' : 'var(--error-color)';
    document.getElementById('gamesPlayed').textContent = stats.gamesPlayed;
    document.getElementById('bestCashout').textContent = stats.bestCashout.toFixed(2) + 'x';
}

function initializeGame() {
    document.getElementById('betHalf').addEventListener('click', () => {
        const input = document.getElementById('betAmount');
        input.value = Math.max(0.10, (parseFloat(input.value) / 2).toFixed(2));
    });

    document.getElementById('betDouble').addEventListener('click', async () => {
        const input = document.getElementById('betAmount');
        const balance = await getUserBalance(currentUser.uid);
        input.value = Math.min(balance, parseFloat(input.value) * 2).toFixed(2);
    });

    document.getElementById('autoCashoutEnabled').addEventListener('change', (e) => {
        document.getElementById('autoCashoutValue').disabled = !e.target.checked;
    });

    document.getElementById('placeBetBtn').addEventListener('click', placeBet);
    document.getElementById('cashoutBtn').addEventListener('click', cashout);

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        auth.signOut().then(() => window.location.href = 'login.html');
    });

    document.getElementById('profileBtn')?.addEventListener('click', () => {
        window.location.href = 'profile.html';
    });

    startGame();
}

async function placeBet() {
    const bet = parseFloat(document.getElementById('betAmount').value);
    const balance = await getUserBalance(currentUser.uid);

    if (bet <= 0 || bet > balance) {
        alert('Mise invalide ou solde insuffisant');
        return;
    }

    if (gameState !== 'waiting') {
        alert('Attendez la prochaine manche');
        return;
    }

    await updateBalance(currentUser.uid, -bet);
    await loadUserBalance();

    betAmount = bet;
    hasBet = true;
    stats.totalWagered += bet;
    stats.gamesPlayed += 1;
    updateStatsDisplay();

    document.getElementById('placeBetBtn').classList.add('hidden');
    document.getElementById('cashoutBtn').classList.remove('hidden');
}

async function cashout() {
    if (!hasBet || gameState !== 'running') return;

    const winAmount = betAmount * currentMultiplier;
    await updateBalance(currentUser.uid, winAmount);
    await loadUserBalance();

    stats.totalWon += winAmount;
    stats.bestCashout = Math.max(stats.bestCashout, currentMultiplier);
    updateStatsDisplay();
    await saveGameStats(betAmount, winAmount, currentMultiplier);

    hasBet = false;
    document.getElementById('cashoutBtn').classList.add('hidden');
    document.getElementById('placeBetBtn').classList.remove('hidden');
}

function startGame() {
    gameState = 'waiting';
    currentMultiplier = 1.00;
    document.getElementById('crashStatus').textContent = 'Nouvelle manche dans 5s...';
    document.getElementById('crashMultiplier').textContent = '1.00x';
    document.getElementById('crashMultiplier').classList.remove('crashed');

    setTimeout(() => {
        gameState = 'running';
        crashPoint = generateCrashPoint();
        startTime = Date.now();
        document.getElementById('crashStatus').textContent = 'En cours...';
        runGame();
    }, 5000);
}

function generateCrashPoint() {
    const r = Math.random();
    return Math.max(1.01, Math.pow(0.99 / r, 0.5));
}

function runGame() {
    gameInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        currentMultiplier = Math.pow(1.0595, elapsed);

        document.getElementById('crashMultiplier').textContent = currentMultiplier.toFixed(2) + 'x';

        if (hasBet) {
            const potential = betAmount * currentMultiplier;
            document.getElementById('cashoutAmount').textContent = potential.toFixed(2) + ' €';

            if (document.getElementById('autoCashoutEnabled').checked) {
                const autoCashoutValue = parseFloat(document.getElementById('autoCashoutValue').value);
                if (currentMultiplier >= autoCashoutValue) {
                    cashout();
                }
            }
        }

        if (currentMultiplier >= crashPoint) {
            crash();
        }
    }, 50);
}

async function crash() {
    clearInterval(gameInterval);
    gameState = 'crashed';

    document.getElementById('crashStatus').textContent = 'CRASHED!';
    document.getElementById('crashMultiplier').textContent = crashPoint.toFixed(2) + 'x';
    document.getElementById('crashMultiplier').classList.add('crashed');

    if (hasBet) {
        hasBet = false;
        await saveGameStats(betAmount, 0, crashPoint);
        document.getElementById('cashoutBtn').classList.add('hidden');
        document.getElementById('placeBetBtn').classList.remove('hidden');
    }

    addToHistory(crashPoint);
    setTimeout(() => startGame(), 3000);
}

function addToHistory(multiplier) {
    history.unshift(multiplier);
    if (history.length > 10) history.pop();

    const historyEl = document.getElementById('crashHistory');
    const items = history.map(m => {
        const className = m < 2 ? 'low' : m < 5 ? 'medium' : 'high';
        const value = m.toFixed(2);
        return '<div class="history-item ' + className + '">' + value + 'x</div>';
    }).join('');
    historyEl.innerHTML = items;
}

async function saveGameStats(wagered, won, multiplier) {
    try {
        const userRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userRef);

        if (!userDoc.exists()) {
            await setDoc(userRef, {
                gameStats: {
                    crash: {
                        gamesPlayed: 1,
                        totalWagered: wagered,
                        totalWon: won,
                        biggestMultiplier: multiplier,
                        lastPlayed: serverTimestamp()
                    }
                }
            }, { merge: true });
        } else {
            const currentStats = userDoc.data().gameStats?.crash || {};
            await updateDoc(userRef, {
                'gameStats.crash': {
                    gamesPlayed: (currentStats.gamesPlayed || 0) + 1,
                    totalWagered: (currentStats.totalWagered || 0) + wagered,
                    totalWon: (currentStats.totalWon || 0) + won,
                    biggestMultiplier: Math.max(currentStats.biggestMultiplier || 0, multiplier),
                    lastPlayed: serverTimestamp()
                }
            });
        }
    } catch (error) {
        console.error('Error saving stats:', error);
    }
}
