import { auth, db } from 'js/core/firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getUserBalance } from 'js/core/balance-manager.js';

let currentUser = null;

// Game URLs - These are demo URLs from Pragmatic Play
// For production, you would need to integrate with a game provider API
const GAME_URLS = {
    sweetbonanza: 'https://demogamesfree.pragmaticplay.net/gs2c/openGame.do?gameSymbol=vs20fruitsw&lang=en_US',
    sugarrush: 'https://demogamesfree.pragmaticplay.net/gs2c/openGame.do?gameSymbol=vs20sugarrush&lang=en_US',
    gates666: 'https://demogamesfree.pragmaticplay.net/gs2c/openGame.do?gameSymbol=vs20olympgate&lang=en_US',
    starlight: 'https://demogamesfree.pragmaticplay.net/gs2c/openGame.do?gameSymbol=vs20starlight&lang=en_US',
    minesdrop: 'https://demogamesfree.pragmaticplay.net/gs2c/openGame.do?gameSymbol=vs10bbbonanza&lang=en_US',
    doghouse: 'https://demogamesfree.pragmaticplay.net/gs2c/openGame.do?gameSymbol=vs20doghouse&lang=en_US',
    wolfgold: 'https://demogamesfree.pragmaticplay.net/gs2c/openGame.do?gameSymbol=ws3ways&lang=en_US',
    greatrhino: 'https://demogamesfree.pragmaticplay.net/gs2c/openGame.do?gameSymbol=vswaysrhino&lang=en_US',
    madame: 'https://demogamesfree.pragmaticplay.net/gs2c/openGame.do?gameSymbol=vs10madame&lang=en_US',
    aztecgems: 'https://demogamesfree.pragmaticplay.net/gs2c/openGame.do?gameSymbol=vs243aztec&lang=en_US',
    bookoftut: 'https://demogamesfree.pragmaticplay.net/gs2c/openGame.do?gameSymbol=vs10bookoftut&lang=en_US',
    gatesofgates: 'https://demogamesfree.pragmaticplay.net/gs2c/openGame.do?gameSymbol=vs20olympx&lang=en_US'
};

const GAME_NAMES = {
    sweetbonanza: 'Sweet Bonanza',
    sugarrush: 'Sugar Rush x1000',
    gates666: 'Gates of Olympus',
    starlight: 'Starlight Princess',
    minesdrop: 'Big Bass Bonanza',
    doghouse: 'The Dog House',
    wolfgold: 'Wolf Gold',
    greatrhino: 'Great Rhino Megaways',
    madame: 'Madame Destiny Megaways',
    aztecgems: 'Aztec Gems',
    bookoftut: 'Book of Tut',
    gatesofgates: 'Gates of Olympus x1000'
};

// Initialize
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await loadUserBalance();
        initializeSlots();
    } else {
        window.location.href = 'pages/auth/login.html';
    }
});

async function loadUserBalance() {
    const balance = await getUserBalance(currentUser.uid);
    document.getElementById('userBalance').textContent = balance.toFixed(2) + ' €';
    document.getElementById('gameBalance').textContent = balance.toFixed(2) + ' €';

    const modalBalance = document.getElementById('modalBalance');
    if (modalBalance) {
        modalBalance.textContent = balance.toFixed(2) + ' €';
    }

    // Update overlay balance
    const overlayBalance = document.getElementById('overlayBalance');
    if (overlayBalance) {
        overlayBalance.textContent = balance.toFixed(2) + ' €';
    }

    return balance;
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
            window.location.href = 'pages/auth/login.html';
        });
    });

    // Profile button
    document.getElementById('profileBtn')?.addEventListener('click', () => {
        window.location.href = 'pages/profile.html';
    });

    // Add event listeners to all play buttons
    document.querySelectorAll('.btn-play-slot').forEach(button => {
        button.addEventListener('click', () => {
            const gameId = button.getAttribute('data-game');
            playGame(gameId);
        });
    });

    // Auto-refresh balance every 5 seconds when modal is open
    setInterval(async () => {
        const modal = document.getElementById('gameModal');
        if (modal && modal.classList.contains('active')) {
            await loadUserBalance();
        }
    }, 5000);
}

let balanceCheckInterval = null;

async function playGame(gameId) {
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
    await loadUserBalance();

    // Start balance monitoring (rafraîchir toutes les 3 secondes)
    startBalanceMonitoring();
}

function startBalanceMonitoring() {
    if (balanceCheckInterval) {
        clearInterval(balanceCheckInterval);
    }

    // Rafraîchir le solde toutes les 2 secondes pendant que le jeu est ouvert
    balanceCheckInterval = setInterval(async () => {
        await loadUserBalance();
    }, 2000);
}

async function closeGameModal() {
    // Stop balance monitoring
    if (balanceCheckInterval) {
        clearInterval(balanceCheckInterval);
        balanceCheckInterval = null;
    }

    const modal = document.getElementById('gameModal');
    modal.classList.remove('active');

    // Clear iframe to stop the game
    document.getElementById('gameIframe').src = '';

    // Refresh balance one last time
    await loadUserBalance();
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
