import { auth, signOut, onAuthStateChanged } from './firebase-config.js';
import { initializeUserBalance, subscribeToUserData, addFunds } from './balance-manager.js';

let currentUser = null;
let unsubscribeBalance = null;

// Check if user is logged in
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
    } else {
        currentUser = user;
        console.log('User logged in:', user.email);

        // Initialize user balance if needed
        await initializeUserBalance(user);

        // Subscribe to real-time balance updates
        unsubscribeBalance = subscribeToUserData(user.uid, (userData) => {
            if (!userData) {
                updateBalanceDisplay(null);
                return;
            }
            updateBalanceDisplay(userData.balance);
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

// Update balance display
function updateBalanceDisplay(balance) {
    const balanceElement = document.querySelector('.balance-amount');
    if (!balanceElement) return;

    if (balance === null || balance === undefined || isNaN(balance)) {
        balanceElement.textContent = '---';
        return;
    }

    balanceElement.textContent = `${balance.toFixed(2)} €`;
}

// Sample games data
const games = [
    { id: 0, name: 'Plinko', provider: 'Casino', image: '🎯', type: 'original', link: 'plinko.html' },
    { id: 1, name: 'Dice', provider: 'Casino', image: '🎲', type: 'original', link: 'dice.html' },
    { id: 2, name: 'Sweet Bonanza', provider: 'Pragmatic Play', image: '🍬', type: 'slot' },
    { id: 2, name: 'Gates of Olympus', provider: 'Pragmatic Play', image: '⚡', type: 'slot' },
    { id: 3, name: 'Book of Dead', provider: 'Play\'n GO', image: '📖', type: 'slot' },
    { id: 4, name: 'Crazy Time', provider: 'Evolution', image: '🎡', type: 'live' },
    { id: 5, name: 'Mega Moolah', provider: 'Microgaming', image: '🦁', type: 'slot' },
    { id: 6, name: 'Starburst', provider: 'NetEnt', image: '💎', type: 'slot' },
    { id: 7, name: 'Gonzo\'s Quest', provider: 'NetEnt', image: '🗿', type: 'slot' },
    { id: 8, name: 'Dead or Alive', provider: 'NetEnt', image: '🤠', type: 'slot' },
    { id: 9, name: 'Reactoonz', provider: 'Play\'n GO', image: '👾', type: 'slot' },
    { id: 10, name: 'Fire Joker', provider: 'Play\'n GO', image: '🔥', type: 'slot' },
    { id: 11, name: 'Big Bass Bonanza', provider: 'Pragmatic Play', image: '🎣', type: 'slot' },
    { id: 12, name: 'Wolf Gold', provider: 'Pragmatic Play', image: '🐺', type: 'slot' }
];

// Render games
function renderGames() {
    const gamesGrid = document.getElementById('gamesGrid');
    gamesGrid.innerHTML = '';

    games.forEach(game => {
        const gameCard = document.createElement('div');
        gameCard.className = 'game-card';
        gameCard.innerHTML = `
            <div class="game-image">
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

        gameCard.addEventListener('click', () => {
            if (game.link) {
                window.location.href = game.link;
            } else {
                alert(`Lancement de ${game.name}...`);
            }
        });

        gamesGrid.appendChild(gameCard);
    });
}

// Deposit button
document.getElementById('depositBtn').addEventListener('click', async () => {
    if (!currentUser) {
        alert('Veuillez vous connecter');
        return;
    }

    const amount = prompt('Montant à déposer (€):');
    if (amount && !isNaN(amount) && parseFloat(amount) > 0) {
        try {
            await addFunds(currentUser.uid, parseFloat(amount));
            alert(`${parseFloat(amount).toFixed(2)} € ajoutés à votre solde!`);
        } catch (error) {
            console.error('Error adding funds:', error);
            alert('Erreur lors du dépôt');
        }
    }
});

// Category buttons
const categoryButtons = document.querySelectorAll('.category-btn');
categoryButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        categoryButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

// Initialize
updateBalanceDisplay(null);
renderGames();
