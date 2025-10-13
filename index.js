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

    // Mines
    document.getElementById('gameMinesCount').textContent = userData.minesGamesPlayed || 0;
    document.getElementById('gameMinesBestMulti').textContent = `${(userData.minesBestMultiplier || 0).toFixed(2)}x`;

    // Blackjack
    document.getElementById('gameBlackjackCount').textContent = userData.blackjackHandsPlayed || 0;
    document.getElementById('gameBlackjackBJ').textContent = userData.blackjackBlackjacks || 0;

    // Tower
    document.getElementById('gameTowerCount').textContent = userData.towerGamesPlayed || 0;
    document.getElementById('gameTowerBestMulti').textContent = `${(userData.towerBestMultiplier || 0).toFixed(2)}x`;
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

// Animate hero stats
function animateHeroStats() {
    // Simulate real-time stats
    setInterval(() => {
        const usersEl = document.getElementById('heroUsers');
        const currentUsers = parseInt(usersEl.textContent.replace(',', ''));
        const newUsers = currentUsers + Math.floor(Math.random() * 3) - 1;
        usersEl.textContent = Math.max(1000, newUsers).toLocaleString();

        const winsEl = document.getElementById('heroWins');
        const currentWins = parseFloat(winsEl.textContent.replace('€', '').replace(',', ''));
        const newWins = currentWins + (Math.random() * 100);
        winsEl.textContent = '€' + newWins.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }, 5000);
}

// Initialize
function init() {
    setupEventListeners();
    loadTopPlayers();
    animateHeroStats();
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
