import { auth, onAuthStateChanged, signOut } from './firebase-config.js';
import { initializeUserBalance, subscribeToUserData, addFunds, getAllUsers } from './balance-manager.js';

let currentUser = null;
let unsubscribeBalance = null;
let allPlayers = [];
let currentTab = 'wagered';

const balanceElement = document.getElementById('userBalance');
const leaderboardBody = document.getElementById('leaderboardBody');
const statHeader = document.getElementById('statHeader');
const tabs = document.querySelectorAll('.leaderboard-tab');

// VIP Tiers
const VIP_TIERS = [
    { name: 'Bronze', minWager: 0, icon: '🥉' },
    { name: 'Silver', minWager: 1000, icon: '🥈' },
    { name: 'Gold', minWager: 5000, icon: '🥇' },
    { name: 'Platinum', minWager: 25000, icon: '💎' },
    { name: 'Diamond', minWager: 100000, icon: '👑' }
];

function getVIPTier(totalWager) {
    for (let i = VIP_TIERS.length - 1; i >= 0; i--) {
        if (totalWager >= VIP_TIERS[i].minWager) {
            return VIP_TIERS[i];
        }
    }
    return VIP_TIERS[0];
}

function getUserInitials(email, username) {
    if (username) {
        return username.substring(0, 2).toUpperCase();
    }
    if (email) {
        return email.substring(0, 2).toUpperCase();
    }
    return '??';
}

function getUserDisplayName(email, username) {
    if (username) {
        return username;
    }
    if (email) {
        const [name] = email.split('@');
        return name;
    }
    return 'Joueur Anonyme';
}

function formatCurrency(value) {
    return `${(value || 0).toFixed(2)} €`;
}

// Auth state
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    currentUser = user;
    await initializeUserBalance(user);

    if (unsubscribeBalance) {
        unsubscribeBalance();
    }

    unsubscribeBalance = subscribeToUserData(user.uid, (userData) => {
        if (userData) {
            balanceElement.textContent = formatCurrency(userData.balance);
        }
    });

    await loadLeaderboard();
});

// Logout
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

// Deposit
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

// Tab switching
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentTab = tab.dataset.tab;
        renderLeaderboard();
    });
});

async function loadLeaderboard() {
    try {
        leaderboardBody.innerHTML = `
            <tr>
                <td colspan="5" class="loading-state">
                    <div class="loading-spinner">🎰</div>
                    <p>Chargement du classement...</p>
                </td>
            </tr>
        `;

        allPlayers = await getAllUsers();
        renderLeaderboard();
    } catch (error) {
        console.error('Error loading leaderboard:', error);
        leaderboardBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    <div class="empty-state-icon">😕</div>
                    <p>Impossible de charger le classement</p>
                </td>
            </tr>
        `;
    }
}

function renderLeaderboard() {
    if (!allPlayers.length) {
        leaderboardBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    <div class="empty-state-icon">🎮</div>
                    <p>Aucun joueur dans le classement</p>
                </td>
            </tr>
        `;
        return;
    }

    // Sort players based on current tab
    let sortedPlayers = [...allPlayers];
    let headerText = '';

    switch (currentTab) {
        case 'wagered':
            sortedPlayers.sort((a, b) => (b.totalWagered || 0) - (a.totalWagered || 0));
            headerText = 'Total Misé';
            break;
        case 'profit':
            sortedPlayers.sort((a, b) => {
                const profitA = (a.totalWon || 0) - (a.totalWagered || 0);
                const profitB = (b.totalWon || 0) - (b.totalWagered || 0);
                return profitB - profitA;
            });
            headerText = 'Profit Net';
            break;
        case 'wins':
            sortedPlayers.sort((a, b) => (b.totalWon || 0) - (a.totalWon || 0));
            headerText = 'Total Gagné';
            break;
        case 'games':
            sortedPlayers.sort((a, b) => (b.gamesPlayed || 0) - (a.gamesPlayed || 0));
            headerText = 'Parties Jouées';
            break;
    }

    statHeader.textContent = headerText;

    // Render top players
    leaderboardBody.innerHTML = '';
    sortedPlayers.slice(0, 100).forEach((player, index) => {
        const row = createPlayerRow(player, index + 1);
        leaderboardBody.appendChild(row);
    });
}

function createPlayerRow(player, rank) {
    const row = document.createElement('tr');
    const isCurrentUser = currentUser && player.id === currentUser.uid;

    if (isCurrentUser) {
        row.classList.add('current-user-row');
    }

    const vipTier = getVIPTier(player.totalWager || 0);
    const displayName = getUserDisplayName(player.email, player.username);
    const initials = getUserInitials(player.email, player.username);

    let statValue = '';
    let statClass = '';

    switch (currentTab) {
        case 'wagered':
            statValue = formatCurrency(player.totalWagered || 0);
            break;
        case 'profit':
            const profit = (player.totalWon || 0) - (player.totalWagered || 0);
            statValue = formatCurrency(profit);
            statClass = profit > 0 ? 'stat-positive' : profit < 0 ? 'stat-negative' : '';
            break;
        case 'wins':
            statValue = formatCurrency(player.totalWon || 0);
            break;
        case 'games':
            statValue = (player.gamesPlayed || 0).toString();
            break;
    }

    let rankDisplay = rank;
    if (rank === 1) rankDisplay = '<span class="rank-medal">🥇</span>';
    else if (rank === 2) rankDisplay = '<span class="rank-medal">🥈</span>';
    else if (rank === 3) rankDisplay = '<span class="rank-medal">🥉</span>';

    row.innerHTML = `
        <td class="rank-cell">${rankDisplay}</td>
        <td>
            <div class="player-cell">
                <div class="player-avatar">${initials}</div>
                <div class="player-info">
                    <div class="player-name">${displayName}</div>
                    <div class="player-level">${isCurrentUser ? '(Vous)' : ''}</div>
                </div>
            </div>
        </td>
        <td class="stat-value ${statClass}">${statValue}</td>
        <td>${player.gamesPlayed || 0}</td>
        <td>${vipTier.icon} ${vipTier.name}</td>
    `;

    row.style.cursor = 'pointer';
    row.addEventListener('click', () => {
        window.location.href = `profile.html?id=${player.id}`;
    });

    return row;
}
