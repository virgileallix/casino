import { auth, db, onAuthStateChanged, doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, addDoc, query, orderBy, limit, onSnapshot } from './firebase-config.js';
import { updateBalance, getUserBalance } from './balance-manager.js';

let currentUser = null;
let currentGameId = null;
let gameStateListener = null;
let betsListener = null;
let myBetId = null;
let myBetAmount = 0;
let stats = { totalWagered: 0, totalWon: 0, gamesPlayed: 0, bestCashout: 0 };
let animationInterval = null;
let currentGameData = null;

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await loadUserBalance();
        await loadStats();
        initializeGame();
        listenToGameState();
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
    // Bet controls
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

    // Initialize game state
    ensureGameExists();
}

// Listen to global game state
function listenToGameState() {
    const gameRef = doc(db, 'crashGame', 'current');

    gameStateListener = onSnapshot(gameRef, async (docSnap) => {
        if (!docSnap.exists()) {
            await ensureGameExists();
            return;
        }

        const gameData = docSnap.data();
        currentGameId = gameData.gameId;

        if (gameData.state === 'waiting') {
            handleWaitingState(gameData);
        } else if (gameData.state === 'running') {
            handleRunningState(gameData);
        } else if (gameData.state === 'crashed') {
            handleCrashedState(gameData);
        }

        // Listen to bets for this game
        listenToBets(currentGameId);
    });
}

function handleWaitingState(gameData) {
    // Stop animation
    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }
    currentGameData = null;

    const timeLeft = Math.max(0, 5 - ((Date.now() - gameData.startTime) / 1000));
    document.getElementById('crashStatus').textContent = `Prochaine manche dans ${Math.ceil(timeLeft)}s`;
    document.getElementById('crashMultiplier').textContent = '1.00x';
    document.getElementById('crashMultiplier').classList.remove('crashed');

    // Enable betting
    if (!myBetId) {
        document.getElementById('placeBetBtn').disabled = false;
        document.getElementById('placeBetBtn').classList.remove('hidden');
        document.getElementById('cashoutBtn').classList.add('hidden');
    }
}

function handleRunningState(gameData) {
    document.getElementById('crashStatus').textContent = 'EN COURS...';
    currentGameData = gameData;

    // Disable betting
    document.getElementById('placeBetBtn').disabled = true;

    // Start continuous animation
    startMultiplierAnimation();
}

function startMultiplierAnimation() {
    // Clear any existing animation
    if (animationInterval) {
        clearInterval(animationInterval);
    }

    // Update multiplier every 50ms for smooth animation
    animationInterval = setInterval(() => {
        if (!currentGameData || currentGameData.state !== 'running') {
            clearInterval(animationInterval);
            animationInterval = null;
            return;
        }

        // Calculate current multiplier
        const elapsed = (Date.now() - currentGameData.runStartTime) / 1000;
        const multiplier = Math.pow(1.0595, elapsed);

        document.getElementById('crashMultiplier').textContent = multiplier.toFixed(2) + 'x';
        document.getElementById('crashMultiplier').classList.remove('crashed');

        // Update cashout button
        if (myBetId) {
            const potential = myBetAmount * multiplier;
            document.getElementById('cashoutAmount').textContent = potential.toFixed(2) + ' €';
            document.getElementById('cashoutBtn').classList.remove('hidden');

            // Auto cashout
            if (document.getElementById('autoCashoutEnabled').checked) {
                const autoCashoutValue = parseFloat(document.getElementById('autoCashoutValue').value);
                if (multiplier >= autoCashoutValue && myBetId) {
                    cashout();
                }
            }
        }

        // Check if should crash
        if (multiplier >= currentGameData.crashPoint) {
            clearInterval(animationInterval);
            animationInterval = null;
        }
    }, 50);
}

function handleCrashedState(gameData) {
    // Stop animation
    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }
    currentGameData = null;

    document.getElementById('crashStatus').textContent = 'CRASHED!';
    document.getElementById('crashMultiplier').textContent = gameData.crashPoint.toFixed(2) + 'x';
    document.getElementById('crashMultiplier').classList.add('crashed');

    // If we had a bet and didn't cash out, we lost
    if (myBetId) {
        handleLostBet();
    }

    // Add to history
    addToHistory(gameData.crashPoint);
}

async function ensureGameExists() {
    const gameRef = doc(db, 'crashGame', 'current');
    const gameDoc = await getDoc(gameRef);

    if (!gameDoc.exists()) {
        // Create initial game
        await setDoc(gameRef, {
            gameId: Date.now().toString(),
            state: 'waiting',
            startTime: Date.now(),
            crashPoint: generateCrashPoint(),
            runStartTime: null
        });

        // Start game loop (only if no one else started it)
        setTimeout(() => startGameLoop(), 5000);
    } else {
        // Check if game is stuck
        const gameData = gameDoc.data();
        if (gameData.state === 'waiting' && (Date.now() - gameData.startTime) > 10000) {
            // Restart game
            await updateDoc(gameRef, {
                state: 'running',
                runStartTime: Date.now()
            });
        }
    }
}

async function startGameLoop() {
    const gameRef = doc(db, 'crashGame', 'current');
    const gameDoc = await getDoc(gameRef);

    if (!gameDoc.exists()) return;

    const gameData = gameDoc.data();

    if (gameData.state === 'waiting') {
        // Start running
        await updateDoc(gameRef, {
            state: 'running',
            runStartTime: Date.now()
        });

        // Calculate crash time
        const crashPoint = gameData.crashPoint;
        const crashTime = Math.log(crashPoint) / Math.log(1.0595) * 1000;

        setTimeout(async () => {
            await updateDoc(gameRef, {
                state: 'crashed'
            });

            // Process all bets that didn't cash out
            await processLostBets(gameData.gameId);

            // Start new game after 3 seconds
            setTimeout(async () => {
                const newGameId = Date.now().toString();
                await setDoc(gameRef, {
                    gameId: newGameId,
                    state: 'waiting',
                    startTime: Date.now(),
                    crashPoint: generateCrashPoint(),
                    runStartTime: null
                });

                setTimeout(() => startGameLoop(), 5000);
            }, 3000);
        }, crashTime);
    }
}

function generateCrashPoint() {
    const r = Math.random();
    return Math.max(1.01, Math.pow(0.99 / r, 0.5));
}

async function placeBet() {
    const bet = parseFloat(document.getElementById('betAmount').value);
    const balance = await getUserBalance(currentUser.uid);

    if (bet <= 0 || bet > balance) {
        alert('Mise invalide ou solde insuffisant');
        return;
    }

    if (!currentGameId) {
        alert('Jeu en cours de chargement...');
        return;
    }

    // Deduct balance
    await updateBalance(currentUser.uid, -bet);
    await loadUserBalance();

    // Create bet in Firebase
    const betRef = await addDoc(collection(db, 'crashBets'), {
        gameId: currentGameId,
        userId: currentUser.uid,
        username: currentUser.email.split('@')[0],
        betAmount: bet,
        cashedOut: false,
        cashoutMultiplier: null,
        winAmount: null,
        timestamp: serverTimestamp()
    });

    myBetId = betRef.id;
    myBetAmount = bet;

    stats.totalWagered += bet;
    stats.gamesPlayed += 1;
    updateStatsDisplay();

    document.getElementById('placeBetBtn').classList.add('hidden');
    document.getElementById('cashoutBtn').classList.remove('hidden');
}

async function cashout() {
    if (!myBetId) return;

    const gameRef = doc(db, 'crashGame', 'current');
    const gameDoc = await getDoc(gameRef);

    if (!gameDoc.exists() || gameDoc.data().state !== 'running') return;

    const gameData = gameDoc.data();
    const elapsed = (Date.now() - gameData.runStartTime) / 1000;
    const multiplier = Math.pow(1.0595, elapsed);

    const winAmount = myBetAmount * multiplier;

    // Credit balance
    await updateBalance(currentUser.uid, winAmount);
    await loadUserBalance();

    // Update bet in Firebase
    const betRef = doc(db, 'crashBets', myBetId);
    await updateDoc(betRef, {
        cashedOut: true,
        cashoutMultiplier: multiplier,
        winAmount: winAmount
    });

    stats.totalWon += winAmount;
    stats.bestCashout = Math.max(stats.bestCashout, multiplier);
    updateStatsDisplay();
    await saveGameStats(myBetAmount, winAmount, multiplier);

    myBetId = null;
    myBetAmount = 0;

    document.getElementById('cashoutBtn').classList.add('hidden');
    document.getElementById('placeBetBtn').classList.remove('hidden');
}

function handleLostBet() {
    saveGameStats(myBetAmount, 0, 0);
    myBetId = null;
    myBetAmount = 0;
    document.getElementById('cashoutBtn').classList.add('hidden');
    document.getElementById('placeBetBtn').classList.remove('hidden');
}

async function processLostBets(gameId) {
    // This would be handled by cloud functions in production
    // For now, each client handles their own lost bet
}

function listenToBets(gameId) {
    if (betsListener) {
        betsListener();
    }

    const betsQuery = query(
        collection(db, 'crashBets'),
        orderBy('timestamp', 'desc'),
        limit(20)
    );

    betsListener = onSnapshot(betsQuery, (snapshot) => {
        const liveBetsList = document.getElementById('liveBetsList');
        liveBetsList.innerHTML = '';

        if (snapshot.empty) {
            liveBetsList.innerHTML = '<div class="empty-bets">Aucun pari actif</div>';
            return;
        }

        snapshot.forEach((doc) => {
            const bet = doc.data();
            if (bet.gameId === gameId) {
                const betEl = document.createElement('div');
                betEl.className = 'live-bet-item';

                let status = '';
                if (bet.cashedOut) {
                    status = `<span class="overlay-profit">${bet.cashoutMultiplier.toFixed(2)}x - ${bet.winAmount.toFixed(2)}€</span>`;
                } else {
                    status = '<span class="overlay-loss">En jeu...</span>';
                }

                betEl.innerHTML = `
                    <div>
                        <strong>${bet.username}</strong>
                        <div style="font-size: 0.8rem; color: var(--text-secondary);">${bet.betAmount.toFixed(2)}€</div>
                    </div>
                    <div>${status}</div>
                `;

                liveBetsList.appendChild(betEl);
            }
        });
    });
}

function addToHistory(multiplier) {
    const historyEl = document.getElementById('crashHistory');
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item ' + (multiplier < 2 ? 'low' : multiplier < 5 ? 'medium' : 'high');
    historyItem.textContent = multiplier.toFixed(2) + 'x';

    historyEl.insertBefore(historyItem, historyEl.firstChild);

    // Keep only last 10
    while (historyEl.children.length > 10) {
        historyEl.removeChild(historyEl.lastChild);
    }
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

// Start the game loop on page load (only one instance will actually run it)
setTimeout(() => {
    if (currentUser) {
        ensureGameExists();
    }
}, 2000);
