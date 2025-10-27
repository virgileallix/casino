import { auth, signOut, onAuthStateChanged } from './firebase-config.js';
import { initializeUserBalance, subscribeToUserData } from './balance-manager.js';

let currentUser = null;
let unsubscribeUser = null;
let userData = null;
let balance = 0;
let balanceLoaded = false;

// VIP Tiers
const VIP_TIERS = {
    bronze: { name: 'Bronze', icon: '🥉', wagerRequired: 0 },
    silver: { name: 'Argent', icon: '🥈', wagerRequired: 1000 },
    gold: { name: 'Or', icon: '🥇', wagerRequired: 5000 },
    platinum: { name: 'Platine', icon: '💎', wagerRequired: 25000 },
    diamond: { name: 'Diamant', icon: '💠', wagerRequired: 100000 }
};

function getCurrentTier(totalWager) {
    const tiers = ['diamond', 'platinum', 'gold', 'silver', 'bronze'];
    for (const tier of tiers) {
        if (totalWager >= VIP_TIERS[tier].wagerRequired) {
            return tier;
        }
    }
    return 'bronze';
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

// Update quick stats
function updateQuickStats() {
    if (!userData) return;

    document.getElementById('quickStatWagered').textContent = `${(userData.totalWagered || 0).toFixed(2)} €`;
    document.getElementById('quickStatWon').textContent = `${(userData.totalWon || 0).toFixed(2)} €`;
    document.getElementById('quickStatGames').textContent = userData.gamesPlayed || 0;

    const currentTier = getCurrentTier(userData.totalWager || 0);
    const tierInfo = VIP_TIERS[currentTier];
    document.getElementById('quickStatVIP').textContent = `${tierInfo.icon} ${tierInfo.name}`;
}

// Update game stats
function updateGameStats() {
    if (!userData) return;

    // Dice
    document.getElementById('gameDiceCount').textContent = userData.diceGamesPlayed || 0;
    const diceWinRate = userData.diceGamesPlayed > 0
        ? ((userData.diceWins / userData.diceGamesPlayed) * 100).toFixed(1)
        : 0;
    document.getElementById('gameDiceWinRate').textContent = `${diceWinRate}%`;

    // Plinko
    document.getElementById('gamePlinkoCount').textContent = userData.plinkoGamesPlayed || 0;
    document.getElementById('gamePlinkoBest').textContent = `${(userData.plinkoBestWin || 0).toFixed(2)} €`;

    // Roulette
    document.getElementById('gameRouletteCount').textContent = userData.rouletteGamesPlayed || 0;
    document.getElementById('gameRouletteBest').textContent = `${(userData.rouletteBestWin || 0).toFixed(2)} €`;

    // Mines
    document.getElementById('gameMinesCount').textContent = userData.minesGamesPlayed || 0;
    document.getElementById('gameMinesBestMulti').textContent = `${(userData.minesBestMultiplier || 0).toFixed(2)}x`;

    // Blackjack
    document.getElementById('gameBlackjackCount').textContent = userData.blackjackHandsPlayed || 0;
    document.getElementById('gameBlackjackBJ').textContent = userData.blackjackBlackjacks || 0;

    // Tower
    document.getElementById('gameTowerCount').textContent = userData.towerGamesPlayed || 0;
    document.getElementById('gameTowerBestMulti').textContent = `${(userData.towerBestMultiplier || 0).toFixed(2)}x`;

    // Keno
    document.getElementById('gameKenoCount').textContent = userData.kenoGamesPlayed || 0;
    document.getElementById('gameKenoBest').textContent = `${(userData.kenoBestWin || 0).toFixed(2)} €`;
}

// Load top players preview
async function loadTopPlayers() {
    try {
        const { collection, getDocs, query, orderBy, limit } = await import('./firebase-config.js');
        const { db } = await import('./firebase-config.js');

        const usersRef = collection(db, 'users');
        const q = query(usersRef, orderBy('totalWon', 'desc'), limit(3));
        const snapshot = await getDocs(q);

        const topPlayersContainer = document.getElementById('topPlayersPreview');
        topPlayersContainer.innerHTML = '';

        let rank = 1;
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.isPrivate) return;

            const playerCard = document.createElement('div');
            playerCard.className = 'player-card';

            const username = data.username || 'Anonyme';
            const totalWon = (data.totalWon || 0).toFixed(2);
            const gamesPlayed = data.gamesPlayed || 0;

            playerCard.innerHTML = `
                <div class="player-rank">#${rank}</div>
                <div class="player-name">${username}</div>
                <div class="player-stats">
                    <div class="player-stat-item">
                        <span class="player-stat-label">Gagné</span>
                        <span class="player-stat-value">${totalWon} €</span>
                    </div>
                    <div class="player-stat-item">
                        <span class="player-stat-label">Parties</span>
                        <span class="player-stat-value">${gamesPlayed}</span>
                    </div>
                </div>
            `;

            topPlayersContainer.appendChild(playerCard);
            rank++;
        });

        if (topPlayersContainer.children.length === 0) {
            topPlayersContainer.innerHTML = '<p style="text-align: center; color: var(--text-secondary); grid-column: 1 / -1;">Aucun joueur pour le moment</p>';
        }
    } catch (error) {
        console.error('Error loading top players:', error);
    }
}

// Setup event listeners
function setupEventListeners() {
    // Hero CTA
    document.getElementById('heroCTABtn').addEventListener('click', () => {
        window.location.href = 'dice.html';
    });

    // Hero VIP button
    document.getElementById('heroVIPBtn').addEventListener('click', () => {
        window.location.href = 'vip.html';
    });

    // VIP Join button
    document.getElementById('vipJoinBtn').addEventListener('click', () => {
        window.location.href = 'vip.html';
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

    // Logout button
    document.getElementById('logoutBtn').addEventListener('click', async () => {
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

// Load real global stats
async function loadGlobalStats() {
    try {
        const { collection, getDocs } = await import('./firebase-config.js');
        const { db } = await import('./firebase-config.js');

        const usersRef = collection(db, 'users');
        const snapshot = await getDocs(usersRef);

        let totalUsers = 0;
        let totalWinsToday = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        snapshot.forEach(doc => {
            const data = doc.data();
            totalUsers++;

            // Pour les gains du jour, on prend le total gagné (à améliorer avec lastGameDate)
            if (data.totalWon) {
                totalWinsToday += data.totalWon;
            }
        });

        // Update hero stats
        document.getElementById('heroUsers').textContent = totalUsers.toLocaleString();
        document.getElementById('heroWins').textContent = '€' + totalWinsToday.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

        // Refresh every 30 seconds
        setTimeout(loadGlobalStats, 30000);
    } catch (error) {
        console.error('Error loading global stats:', error);
    }
}

// Initialize
function init() {
    setupEventListeners();
    loadTopPlayers();
    loadGlobalStats();
}

// Auth state listener
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
            updateBalance();
            return;
        }

        balance = data.balance;
        balanceLoaded = true;
        userData = data;

        updateBalance();
        updateQuickStats();
        updateGameStats();
    });
});

// Start
init();
