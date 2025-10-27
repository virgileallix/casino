import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getBalance } from './balance-manager.js';

let currentUser = null;

// Game URLs - These are demo URLs from Pragmatic Play
// For production, you would need to integrate with a game provider API
const GAME_URLS = {
    sweetbonanza: 'https://demogamesfree.pragmaticplay.net/gs2c/openGame.do?gameSymbol=vs20fruitsw&lang=en_US',
    sugarrush: 'https://demogamesfree.pragmaticplay.net/gs2c/openGame.do?gameSymbol=vs20sugarrush&lang=en_US',
    gates666: 'https://demogamesfree.pragmaticplay.net/gs2c/openGame.do?gameSymbol=vs20olympgate&lang=en_US',
    starlight: 'https://demogamesfree.pragmaticplay.net/gs2c/openGame.do?gameSymbol=vs20starlight&lang=en_US'
};

const GAME_NAMES = {
    sweetbonanza: 'Sweet Bonanza',
    sugarrush: 'Sugar Rush x1000',
    gates666: '666 - Gates of Hell',
    starlight: 'Starlight Princess'
};

// Initialize
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await loadUserBalance();
        initializeSlots();
    } else {
        window.location.href = 'login.html';
    }
});

async function loadUserBalance() {
    const balance = await getBalance(currentUser.uid);
    document.getElementById('userBalance').textContent = balance.toFixed(2) + ' €';
    document.getElementById('gameBalance').textContent = balance.toFixed(2) + ' €';

    const modalBalance = document.getElementById('modalBalance');
    if (modalBalance) {
        modalBalance.textContent = balance.toFixed(2) + ' €';
    }
}

function initializeSlots() {
    // Refresh balance button
    document.getElementById('refreshBalance')?.addEventListener('click', async () => {
        await loadUserBalance();
    });

    // Close modal button
    document.getElementById('closeModal')?.addEventListener('click', closeGameModal);

    // Logout button
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        auth.signOut().then(() => {
            window.location.href = 'login.html';
        });
    });

    // Profile button
    document.getElementById('profileBtn')?.addEventListener('click', () => {
        window.location.href = 'profile.html';
    });

    // Auto-refresh balance every 5 seconds when modal is open
    setInterval(async () => {
        const modal = document.getElementById('gameModal');
        if (modal && modal.classList.contains('active')) {
            await loadUserBalance();
        }
    }, 5000);
}

// Global function to play game
window.playGame = function(gameId) {
    const gameUrl = GAME_URLS[gameId];
    const gameName = GAME_NAMES[gameId];

    if (!gameUrl) {
        alert('Jeu non disponible pour le moment');
        return;
    }

    // Update modal
    document.getElementById('modalGameName').textContent = gameName;
    document.getElementById('gameIframe').src = gameUrl;

    // Show modal
    const modal = document.getElementById('gameModal');
    modal.classList.add('active');

    // Refresh balance
    loadUserBalance();
};

function closeGameModal() {
    const modal = document.getElementById('gameModal');
    modal.classList.remove('active');

    // Clear iframe to stop the game
    document.getElementById('gameIframe').src = '';

    // Refresh balance one last time
    loadUserBalance();
}

// Close modal on ESC key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeGameModal();
    }
});

// Close modal on background click
document.getElementById('gameModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'gameModal') {
        closeGameModal();
    }
});
