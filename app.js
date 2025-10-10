import { auth, signOut, onAuthStateChanged } from './firebase-config.js';
import { initializeUserBalance, subscribeToUserData, addFunds } from './balance-manager.js';

let currentUser = null;
let unsubscribeBalance = null;

const balanceElement = document.querySelector('.balance-amount');
const statsElements = {
    totalWagered: document.getElementById('statTotalWagered'),
    totalWon: document.getElementById('statTotalWon'),
    netProfit: document.getElementById('statNetProfit'),
    gamesPlayed: document.getElementById('statGamesPlayed'),
    diceGames: document.getElementById('statDiceGames'),
    diceWins: document.getElementById('statDiceWins'),
    diceWinRate: document.getElementById('statDiceWinRate'),
    diceBestWin: document.getElementById('statDiceBestWin'),
    plinkoGames: document.getElementById('statPlinkoGames'),
    plinkoTotalWon: document.getElementById('statPlinkoTotalWon'),
    plinkoBestWin: document.getElementById('statPlinkoBestWin'),
    blackjackHands: document.getElementById('statBlackjackHands'),
    blackjackWins: document.getElementById('statBlackjackWins'),
    blackjackBlackjacks: document.getElementById('statBlackjackBlackjacks'),
    blackjackProfit: document.getElementById('statBlackjackProfit')
};

const categoriesContainer = document.getElementById('categoriesContainer');
const gamesGrid = document.getElementById('gamesGrid');
const gamesSectionTitle = document.getElementById('gamesSectionTitle');

const categoryIconMap = {
    'Tous': '⭐',
    'Originaux': '🎯',
    'Slots': '🎰',
    'Live': '🎥',
    'Table': '🃏',
    'Jackpots': '💰',
    'Populaire': '🔥',
    'Nouveautés': '🆕'
};

const categorySortOrder = ['Originaux', 'Slots', 'Live', 'Table', 'Jackpots', 'Populaire', 'Nouveautés'];

const games = [
    {
        id: 'plinko',
        name: 'Plinko',
        provider: 'Casino Originals',
        image: '🎯',
        link: 'plinko.html',
        categories: ['Originaux', 'Populaire'],
        badge: { label: 'Populaire', tone: 'popular' }
    },
    {
        id: 'dice',
        name: 'Dice',
        provider: 'Casino Originals',
        image: '🎲',
        link: 'dice.html',
        categories: ['Originaux', 'Nouveautés'],
        badge: { label: 'Nouveau', tone: 'new' }
    },
    {
        id: 'blackjack',
        name: 'Blackjack',
        provider: 'Casino Originals',
        image: '🃏',
        link: 'blackjack.html',
        categories: ['Originaux', 'Table', 'Populaire'],
        badge: { label: 'Nouveau', tone: 'new' }
    },
    {
        id: 'sweet-bonanza',
        name: 'Sweet Bonanza',
        provider: 'Pragmatic Play',
        image: '🍬',
        categories: ['Slots', 'Populaire'],
        badge: { label: 'Populaire', tone: 'popular' }
    },
    {
        id: 'gates-of-olympus',
        name: 'Gates of Olympus',
        provider: 'Pragmatic Play',
        image: '⚡',
        categories: ['Slots', 'Nouveautés']
    },
    {
        id: 'book-of-dead',
        name: 'Book of Dead',
        provider: "Play'n GO",
        image: '📖',
        categories: ['Slots']
    },
    {
        id: 'crazy-time',
        name: 'Crazy Time',
        provider: 'Evolution',
        image: '🎡',
        categories: ['Live', 'Populaire'],
        badge: { label: 'Populaire', tone: 'popular' }
    },
    {
        id: 'mega-moolah',
        name: 'Mega Moolah',
        provider: 'Microgaming',
        image: '🦁',
        categories: ['Slots', 'Jackpots']
    },
    {
        id: 'starburst',
        name: 'Starburst',
        provider: 'NetEnt',
        image: '💎',
        categories: ['Slots', 'Populaire'],
        badge: { label: 'Populaire', tone: 'popular' }
    },
    {
        id: 'gonzos-quest',
        name: "Gonzo's Quest",
        provider: 'NetEnt',
        image: '🗿',
        categories: ['Slots']
    },
    {
        id: 'dead-or-alive',
        name: 'Dead or Alive',
        provider: 'NetEnt',
        image: '🤠',
        categories: ['Slots']
    },
    {
        id: 'reactoonz',
        name: 'Reactoonz',
        provider: "Play'n GO",
        image: '👾',
        categories: ['Slots', 'Populaire']
    },
    {
        id: 'fire-joker',
        name: 'Fire Joker',
        provider: "Play'n GO",
        image: '🔥',
        categories: ['Slots']
    },
    {
        id: 'big-bass-bonanza',
        name: 'Big Bass Bonanza',
        provider: 'Pragmatic Play',
        image: '🎣',
        categories: ['Slots', 'Nouveautés']
    },
    {
        id: 'wolf-gold',
        name: 'Wolf Gold',
        provider: 'Pragmatic Play',
        image: '🐺',
        categories: ['Slots']
    }
];

const uniqueCategories = Array.from(new Set(games.flatMap((game) => game.categories || [])));
uniqueCategories.sort((a, b) => {
    const indexA = categorySortOrder.indexOf(a);
    const indexB = categorySortOrder.indexOf(b);

    if (indexA === -1 && indexB === -1) {
        return a.localeCompare(b);
    }
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
});

const categories = ['Tous', ...uniqueCategories];
let activeCategory = 'Tous';

// Check if user is logged in
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
    } else {
        currentUser = user;
        console.log('User logged in:', user.email);

        await initializeUserBalance(user);

        if (unsubscribeBalance) {
            unsubscribeBalance();
        }

        unsubscribeBalance = subscribeToUserData(user.uid, (userData) => {
            if (!userData) {
                updateBalanceDisplay(null);
                updateStatsPanel(null);
                return;
            }
            updateBalanceDisplay(userData.balance);
            updateStatsPanel(userData);
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
            await addFunds(currentUser.uid, depositAmount);
            alert(`${depositAmount.toFixed(2)} € ajoutés à votre solde!`);
        } catch (error) {
            console.error('Error adding funds:', error);
            alert('Erreur lors du dépôt');
        }
    }
});

function updateBalanceDisplay(balance) {
    if (!balanceElement) return;

    if (balance === null || balance === undefined || isNaN(balance)) {
        balanceElement.textContent = '---';
        return;
    }

    balanceElement.textContent = `${balance.toFixed(2)} €`;
}

function updateStatsPanel(userData) {
    const defaults = {
        totalWagered: 0,
        totalWon: 0,
        gamesPlayed: 0,
        diceGamesPlayed: 0,
        diceWins: 0,
        diceLosses: 0,
        diceBestWin: 0,
        plinkoGamesPlayed: 0,
        plinkoTotalWon: 0,
        plinkoBestWin: 0,
        blackjackHandsPlayed: 0,
        blackjackWins: 0,
        blackjackBlackjacks: 0,
        blackjackTotalProfit: 0
    };

    const stats = { ...defaults, ...(userData || {}) };
    const netProfit = stats.totalWon - stats.totalWagered;
    const diceWinRate = stats.diceGamesPlayed > 0
        ? (stats.diceWins / stats.diceGamesPlayed) * 100
        : 0;

    setTextContent(statsElements.totalWagered, formatCurrency(stats.totalWagered));
    setTextContent(statsElements.totalWon, formatCurrency(stats.totalWon));

    if (statsElements.netProfit) {
        statsElements.netProfit.classList.remove('stat-positive', 'stat-negative');
        setTextContent(statsElements.netProfit, formatCurrency(netProfit));

        if (netProfit > 0.01) {
            statsElements.netProfit.classList.add('stat-positive');
        } else if (netProfit < -0.01) {
            statsElements.netProfit.classList.add('stat-negative');
        }
    }

    setTextContent(statsElements.gamesPlayed, formatGamesPlayed(stats.gamesPlayed));
    setTextContent(statsElements.diceGames, stats.diceGamesPlayed);
    setTextContent(statsElements.diceWins, stats.diceWins);
    setTextContent(statsElements.diceWinRate, formatPercentage(diceWinRate));
    setTextContent(statsElements.diceBestWin, formatCurrency(stats.diceBestWin));
    setTextContent(statsElements.plinkoGames, stats.plinkoGamesPlayed);
    setTextContent(statsElements.plinkoTotalWon, formatCurrency(stats.plinkoTotalWon));
    setTextContent(statsElements.plinkoBestWin, formatCurrency(stats.plinkoBestWin));
    setTextContent(statsElements.blackjackHands, stats.blackjackHandsPlayed);
    setTextContent(statsElements.blackjackWins, stats.blackjackWins);
    setTextContent(statsElements.blackjackBlackjacks, stats.blackjackBlackjacks);
    setTextContent(statsElements.blackjackProfit, formatCurrency(stats.blackjackTotalProfit));
}

function formatCurrency(value) {
    const amount = Number.isFinite(value) ? value : 0;
    return `${amount.toFixed(2)} €`;
}

function formatPercentage(value) {
    const percentage = Number.isFinite(value) ? value : 0;
    return `${percentage.toFixed(1)}%`;
}

function formatGamesPlayed(count) {
    const total = Number.isFinite(count) ? count : 0;
    const label = total > 1 ? 'parties jouées' : 'partie jouée';
    return `${total} ${label}`;
}

function setTextContent(element, value) {
    if (element) {
        element.textContent = value;
    }
}

function renderCategories() {
    if (!categoriesContainer) return;
    categoriesContainer.innerHTML = '';

    categories.forEach((category) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `category-btn ${activeCategory === category ? 'active' : ''}`;
        button.dataset.category = category;
        button.setAttribute('aria-pressed', activeCategory === category);

        const icon = categoryIconMap[category] || '🎮';
        const count = getGamesForCategory(category).length;

        button.innerHTML = `
            <span class="category-icon">${icon}</span>
            <span>${category}</span>
            <span class="category-count">${count}</span>
        `;

        button.addEventListener('click', () => {
            if (activeCategory === category) return;
            activeCategory = category;
            renderCategories();
            renderGames();
        });

        categoriesContainer.appendChild(button);
    });
}

function getGamesForCategory(category) {
    if (category === 'Tous') {
        return games;
    }
    return games.filter((game) => (game.categories || []).includes(category));
}

function renderGames() {
    if (!gamesGrid || !gamesSectionTitle) return;

    const filteredGames = getGamesForCategory(activeCategory);
    gamesGrid.innerHTML = '';

    gamesSectionTitle.textContent = activeCategory === 'Tous'
        ? 'Jeux populaires'
        : `Jeux – ${activeCategory}`;

    if (!filteredGames.length) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.textContent = 'Aucun jeu disponible dans cette catégorie pour le moment.';
        gamesGrid.appendChild(emptyState);
        return;
    }

    filteredGames.forEach((game) => {
        gamesGrid.appendChild(createGameCard(game));
    });
}

function createGameCard(game) {
    const card = document.createElement('div');
    card.className = 'game-card';

    const badgeHtml = game.badge
        ? `<div class="game-badge ${game.badge.tone === 'new' ? 'badge-new' : 'badge-popular'}">${game.badge.label}</div>`
        : '';

    card.innerHTML = `
        <div class="game-image">
            ${badgeHtml}
            <div class="game-icon">${game.image}</div>
        </div>
        <div class="game-info">
            <h3 class="game-name">${game.name}</h3>
            <p class="game-provider">${game.provider}</p>
        </div>
        <div class="game-overlay">
            <button class="btn-play">Jouer</button>
        </div>
    `;

    card.addEventListener('click', () => {
        if (game.link) {
            window.location.href = game.link;
        } else {
            alert(`Lancement de ${game.name}...`);
        }
    });

    return card;
}

updateBalanceDisplay(null);
updateStatsPanel(null);
renderCategories();
renderGames();
