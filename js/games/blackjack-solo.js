import { auth, onAuthStateChanged } from '../../js/core/firebase-config.js';
import { subscribeToUserData, applyGameResult } from '../../js/core/balance-manager.js';
import { initializeAdminNav } from '../../js/components/admin-nav.js';
import { initializeURLCleaner } from '../../js/components/url-cleaner.js';

// Game state
let currentUser = null;
let balance = 0;
let currentBet = 0;
let sideBet21Plus3 = 0;
let sideBetPerfectPairs = 0;
let playerHand = [];
let dealerHand = [];
let deck = [];
let gameState = 'betting'; // betting, playing, dealer-turn, finished
let stats = {
    handsPlayed: 0,
    handsWon: 0,
    blackjacks: 0,
    totalProfit: 0
};

// DOM elements
const elements = {
    userBalance: document.getElementById('userBalance'),
    logoutBtn: document.getElementById('logoutBtn'),
    depositBtn: document.getElementById('depositBtn'),

    // Game UI
    betAmount: document.getElementById('betAmount'),
    currentBetDisplay: document.getElementById('currentBetDisplay'),
    dealBtn: document.getElementById('dealBtn'),
    hitBtn: document.getElementById('hitBtn'),
    standBtn: document.getElementById('standBtn'),
    doubleBtn: document.getElementById('doubleBtn'),
    clearBetBtn: document.getElementById('clearBetBtn'),

    // Cards
    dealerCards: document.getElementById('dealerCards'),
    playerCards: document.getElementById('playerCards'),
    dealerTotal: document.getElementById('dealerTotal'),
    playerTotal: document.getElementById('playerTotal'),

    // Status
    gameStatus: document.getElementById('gameStatus'),

    // Stats
    handsPlayed: document.getElementById('handsPlayed'),
    handsWon: document.getElementById('handsWon'),
    blackjacks: document.getElementById('blackjacks'),
    totalProfit: document.getElementById('totalProfit'),

    // Results log
    resultsLog: document.getElementById('resultsLog')
};

// Card utilities
const suits = ['♠', '♥', '♦', '♣'];
const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck() {
    const newDeck = [];
    for (let suit of suits) {
        for (let value of values) {
            newDeck.push({ suit, value });
        }
    }
    return shuffleDeck(newDeck);
}

function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function getCardValue(card) {
    if (card.value === 'A') return 11;
    if (['J', 'Q', 'K'].includes(card.value)) return 10;
    return parseInt(card.value);
}

function calculateHand(hand) {
    let total = 0;
    let aces = 0;

    for (let card of hand) {
        const value = getCardValue(card);
        total += value;
        if (card.value === 'A') aces++;
    }

    // Adjust for aces
    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }

    return total;
}

function renderCard(card, faceDown = false) {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'card';

    if (faceDown) {
        cardDiv.classList.add('card-back');
        cardDiv.innerHTML = '🂠';
    } else {
        const isRed = ['♥', '♦'].includes(card.suit);
        cardDiv.classList.add(isRed ? 'red' : 'black');
        cardDiv.innerHTML = `
            <div class="card-value">${card.value}</div>
            <div class="card-suit">${card.suit}</div>
        `;
    }

    return cardDiv;
}

function updateDisplay() {
    // Cards
    elements.dealerCards.innerHTML = '';
    elements.playerCards.innerHTML = '';

    dealerHand.forEach((card, index) => {
        const faceDown = gameState === 'playing' && index === 1;
        elements.dealerCards.appendChild(renderCard(card, faceDown));
    });

    playerHand.forEach(card => {
        elements.playerCards.appendChild(renderCard(card));
    });

    // Totals
    const playerTotal = calculateHand(playerHand);
    elements.playerTotal.textContent = playerTotal;

    if (gameState === 'playing') {
        elements.dealerTotal.textContent = dealerHand.length > 0 ? getCardValue(dealerHand[0]) : 0;
    } else {
        elements.dealerTotal.textContent = calculateHand(dealerHand);
    }

    // Balance
    if (elements.userBalance) {
        elements.userBalance.textContent = `${balance.toFixed(2)}€`;
    }

    // Current bet
    if (elements.currentBetDisplay) {
        elements.currentBetDisplay.textContent = `${currentBet}€`;
    }
}

function setStatus(message, type = 'info') {
    if (elements.gameStatus) {
        elements.gameStatus.textContent = message;
        elements.gameStatus.className = `game-status ${type}`;
    }
}

function updateUI() {
    const isBetting = gameState === 'betting';
    const isPlaying = gameState === 'playing';

    elements.dealBtn.disabled = !isBetting || currentBet === 0;
    elements.hitBtn.disabled = !isPlaying;
    elements.standBtn.disabled = !isPlaying;
    elements.doubleBtn.disabled = !isPlaying || playerHand.length !== 2 || balance < currentBet;
    elements.clearBetBtn.disabled = !isBetting || currentBet === 0;
    elements.betAmount.disabled = !isBetting;

    updateDisplay();
}

// Game actions
async function deal() {
    if (currentBet === 0 || currentBet > balance) {
        alert('Mise invalide');
        return;
    }

    // Deduct bet
    try {
        await applyGameResult(currentUser.uid, {
            betAmount: currentBet,
            payout: 0,
            game: 'blackjack-solo'
        });
    } catch (error) {
        console.error('Error deducting bet:', error);
        alert('Erreur lors de la mise');
        return;
    }

    // Initialize deck
    deck = createDeck();
    playerHand = [deck.pop(), deck.pop()];
    dealerHand = [deck.pop(), deck.pop()];
    gameState = 'playing';

    setStatus('Votre tour - Hit ou Stand?', 'info');
    updateUI();

    // Check for blackjack
    const playerTotal = calculateHand(playerHand);
    if (playerTotal === 21) {
        setTimeout(() => stand(), 1000);
    }
}

function hit() {
    if (gameState !== 'playing') return;

    playerHand.push(deck.pop());
    const playerTotal = calculateHand(playerHand);

    updateUI();

    if (playerTotal > 21) {
        // Bust
        endGame('loss', 'Vous avez dépassé 21! Vous perdez.');
    } else if (playerTotal === 21) {
        // Auto-stand on 21
        setTimeout(() => stand(), 500);
    }
}

async function stand() {
    if (gameState !== 'playing') return;

    gameState = 'dealer-turn';
    setStatus('Tour du croupier...', 'info');
    updateUI();

    // Dealer draws
    await dealerPlay();
}

async function double() {
    if (gameState !== 'playing' || playerHand.length !== 2 || balance < currentBet) return;

    // Deduct additional bet
    try {
        await applyGameResult(currentUser.uid, {
            betAmount: currentBet,
            payout: 0,
            game: 'blackjack-solo'
        });

        currentBet *= 2;

        // Draw one card
        playerHand.push(deck.pop());
        updateUI();

        const playerTotal = calculateHand(playerHand);
        if (playerTotal > 21) {
            endGame('loss', 'Vous avez dépassé 21! Vous perdez.');
        } else {
            setTimeout(() => stand(), 500);
        }
    } catch (error) {
        console.error('Error doubling:', error);
        alert('Erreur lors du doublement');
    }
}

async function dealerPlay() {
    let dealerTotal = calculateHand(dealerHand);

    while (dealerTotal < 17) {
        await new Promise(resolve => setTimeout(resolve, 800));
        dealerHand.push(deck.pop());
        dealerTotal = calculateHand(dealerHand);
        updateUI();
    }

    // Determine winner
    const playerTotal = calculateHand(playerHand);
    const playerBlackjack = playerTotal === 21 && playerHand.length === 2;
    const dealerBlackjack = dealerTotal === 21 && dealerHand.length === 2;

    if (playerBlackjack && dealerBlackjack) {
        endGame('push', 'Double Blackjack! Égalité.');
    } else if (playerBlackjack) {
        endGame('blackjack', 'Blackjack! Vous gagnez 3:2!');
    } else if (dealerTotal > 21) {
        endGame('win', 'Le croupier dépasse 21! Vous gagnez!');
    } else if (playerTotal > dealerTotal) {
        endGame('win', 'Vous gagnez!');
    } else if (playerTotal === dealerTotal) {
        endGame('push', 'Égalité!');
    } else {
        endGame('loss', 'Le croupier gagne.');
    }
}

async function endGame(result, message) {
    gameState = 'finished';
    setStatus(message, result === 'win' || result === 'blackjack' ? 'success' : result === 'push' ? 'info' : 'error');

    let payout = 0;
    let profit = -currentBet;

    if (result === 'blackjack') {
        payout = currentBet + (currentBet * 1.5);
        profit = currentBet * 1.5;
        stats.blackjacks++;
        stats.handsWon++;
    } else if (result === 'win') {
        payout = currentBet * 2;
        profit = currentBet;
        stats.handsWon++;
    } else if (result === 'push') {
        payout = currentBet;
        profit = 0;
    }

    // Apply payout
    if (payout > 0) {
        try {
            await applyGameResult(currentUser.uid, {
                betAmount: 0,
                payout: payout,
                game: 'blackjack-solo'
            });
        } catch (error) {
            console.error('Error applying payout:', error);
        }
    }

    stats.handsPlayed++;
    stats.totalProfit += profit;
    updateStats();
    logResult(result, currentBet, profit);

    // Reset for next round
    setTimeout(() => {
        currentBet = 0;
        gameState = 'betting';
        playerHand = [];
        dealerHand = [];
        setStatus('Placez votre mise', 'neutral');
        updateUI();
    }, 3000);
}

function updateStats() {
    if (elements.handsPlayed) elements.handsPlayed.textContent = stats.handsPlayed;
    if (elements.handsWon) elements.handsWon.textContent = stats.handsWon;
    if (elements.blackjacks) elements.blackjacks.textContent = stats.blackjacks;
    if (elements.totalProfit) {
        elements.totalProfit.textContent = `${stats.totalProfit >= 0 ? '+' : ''}${stats.totalProfit.toFixed(2)}€`;
        elements.totalProfit.style.color = stats.totalProfit >= 0 ? '#00d084' : '#ff6b6b';
    }
}

function logResult(result, bet, profit) {
    if (!elements.resultsLog) return;

    const resultDiv = document.createElement('div');
    resultDiv.className = `result-item result-${result}`;
    resultDiv.innerHTML = `
        <span class="result-type">${result === 'blackjack' ? 'BJ' : result === 'win' ? 'W' : result === 'push' ? 'P' : 'L'}</span>
        <span class="result-bet">${bet}€</span>
        <span class="result-profit" style="color: ${profit >= 0 ? '#00d084' : '#ff6b6b'}">${profit >= 0 ? '+' : ''}${profit.toFixed(2)}€</span>
    `;

    elements.resultsLog.insertBefore(resultDiv, elements.resultsLog.firstChild);

    // Keep only last 10
    while (elements.resultsLog.children.length > 10) {
        elements.resultsLog.removeChild(elements.resultsLog.lastChild);
    }
}

// Event listeners
function setupEventListeners() {
    elements.logoutBtn?.addEventListener('click', async () => {
        await auth.signOut();
        window.location.href = 'pages/auth/login.html';
    });

    elements.dealBtn?.addEventListener('click', deal);
    elements.hitBtn?.addEventListener('click', hit);
    elements.standBtn?.addEventListener('click', stand);
    elements.doubleBtn?.addEventListener('click', double);

    elements.clearBetBtn?.addEventListener('click', () => {
        currentBet = 0;
        updateUI();
    });

    // Chip buttons
    document.querySelectorAll('.chip-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (gameState !== 'betting') return;
            const value = parseInt(btn.dataset.value);
            currentBet += value;
            if (currentBet > balance) currentBet = balance;
            updateUI();
        });
    });

    // Quick bet buttons
    document.getElementById('minBetBtn')?.addEventListener('click', () => {
        if (gameState === 'betting') {
            currentBet = 1;
            updateUI();
        }
    });

    document.getElementById('halfBetBtn')?.addEventListener('click', () => {
        if (gameState === 'betting') {
            currentBet = Math.floor(balance / 2);
            updateUI();
        }
    });

    document.getElementById('maxBetBtn')?.addEventListener('click', () => {
        if (gameState === 'betting') {
            currentBet = balance;
            updateUI();
        }
    });
}

// Initialize
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../../pages/auth/login.html';
        return;
    }

    currentUser = user;

    // Subscribe to user data
    subscribeToUserData(user.uid, (data) => {
        balance = data.balance || 0;
        updateUI();
    });

    setupEventListeners();
    initializeAdminNav();
    initializeURLCleaner();

    setStatus('Placez votre mise', 'neutral');
    updateUI();
});
