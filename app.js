import { auth, signOut, onAuthStateChanged } from './firebase-config.js';

// Check if user is logged in
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'login.html';
    } else {
        console.log('User logged in:', user.email);
    }
});

// Logout functionality
document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Error signing out:', error);
    }
});

// Sample games data
const games = [
    { id: 0, name: 'Plinko', provider: 'Casino', image: '🎯', type: 'original', link: 'plinko.html' },
    { id: 1, name: 'Sweet Bonanza', provider: 'Pragmatic Play', image: '🍬', type: 'slot' },
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
document.getElementById('depositBtn').addEventListener('click', () => {
    alert('Fonctionnalité de dépôt à venir...');
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
renderGames();
