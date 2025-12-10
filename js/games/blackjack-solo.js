import { auth, onAuthStateChanged } from '../core/firebase-config.js';
import { subscribeToUserData, applyGameResult } from '../core/balance-manager.js';
import { renderHandResults } from '../core/card-utils.js';

// Game state
let currentUser = null;
let balance = 0;
let currentBet = 0;
let playerHand = [];
let dealerHand = [];
let deck = [];
let gameState = 'betting'; // betting, playing, dealer-turn, finished

// Stats
let stats = {
    handsPlayed: 0,
    handsWon: 0,
    blackjacks: 0,
    totalProfit: 0
};

// DOM elements - only reference what exists
const elements = {
    userBalance: document.getElementById('userBalance'),
    logoutBtn: document.getElementById('logoutBtn'),
    depositBtn: document.getElementById('depositBtn'),

    // Game UI
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
    resultsLog: document.getElementById('resultsLog')
};

// Card utilities
const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck(decks = 6) {
    const newDeck = [];
    for (let d = 0; d < decks; d++) {
        for (let suit of suits) {
            for (let value of values) {
                newDeck.push({ suit, value });
            }
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

    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }

    return total;
}

function updateDisplay() {
    // Cards
    if (elements.dealerCards) {
        const faceDown = gameState === 'playing'; // Hide second card while playing
        renderHandResults(elements.dealerCards, dealerHand, faceDown);
    }

    if (elements.playerCards) {
        renderHandResults(elements.playerCards, playerHand);
    }

    // Totals
    const playerTotal = calculateHand(playerHand);
    if (elements.playerTotal) {
        elements.playerTotal.textContent = playerTotal;
    }

    if (elements.dealerTotal) {
        if (gameState === 'playing') {
            // Show only first card value if hidden
            elements.dealerTotal.textContent = dealerHand.length > 0 ? getCardValue(dealerHand[0]) : 0;
        } else {
            elements.dealerTotal.textContent = calculateHand(dealerHand);
        }
    }

    // Balance
    if (elements.userBalance) {
        elements.userBalance.textContent = `${balance.toFixed(2)}€`;
    }

    // Current bet
    if (elements.currentBetDisplay) {
        elements.currentBetDisplay.textContent = `${currentBet}€`;
    }

    // Stats
    if (elements.handsPlayed) elements.handsPlayed.textContent = stats.handsPlayed;
    if (elements.handsWon) elements.handsWon.textContent = stats.handsWon;
    if (elements.blackjacks) elements.blackjacks.textContent = stats.blackjacks;
    if (elements.totalProfit) elements.totalProfit.textContent = `${stats.totalProfit.toFixed(2)}€`;
}

function setStatus(message, type = 'neutral') {
    if (elements.gameStatus) {
        elements.gameStatus.textContent = message;
        elements.gameStatus.className = `game-status ${type}`;
    }
}

function updateUI() {
    const isBetting = gameState === 'betting';
    const isPlaying = gameState === 'playing';

    if (elements.dealBtn) elements.dealBtn.disabled = !isBetting || currentBet === 0;
    if (elements.hitBtn) elements.hitBtn.disabled = !isPlaying;
    if (elements.standBtn) elements.standBtn.disabled = !isPlaying;
    if (elements.doubleBtn) elements.doubleBtn.disabled = !isPlaying || playerHand.length !== 2 || balance < currentBet;
    if (elements.clearBetBtn) elements.clearBetBtn.disabled = !isBetting || currentBet === 0;

    // Disable chip buttons during game
    document.querySelectorAll('.chip-btn').forEach(btn => {
        btn.disabled = !isBetting;
    });

    updateDisplay();
}

function addResultToLog(result, amount) {
    if (!elements.resultsLog) return;

    const resultItem = document.createElement('div');
    resultItem.className = `result-item result-${result}`;

    let message = '';
    let amountText = '';

    if (result === 'win') {
        message = 'Victoire';
        amountText = `+${amount.toFixed(2)}€`;
    } else if (result === 'blackjack') {
        message = 'Blackjack!';
        amountText = `+${amount.toFixed(2)}€`;
    } else if (result === 'loss') {
        message = 'Défaite';
        amountText = `-${amount.toFixed(2)}€`;
    } else if (result === 'push') {
        message = 'Égalité';
        amountText = '0€';
    }

    resultItem.innerHTML = `
        <span>${message}</span>
        <span>${amountText}</span>
    `;

    elements.resultsLog.insertBefore(resultItem, elements.resultsLog.firstChild);

    // Keep only last 10 results
    while (elements.resultsLog.children.length > 10) {
        elements.resultsLog.removeChild(elements.resultsLog.lastChild);
    }
}

// Game actions
async function deal() {
    if (currentBet === 0 || currentBet > balance) {
        setStatus('Mise invalide', 'error');
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
        setStatus('Erreur lors de la mise', 'error');
        return;
    }

    // Initialize deck
    deck = createDeck(6); // Use 6 decks
    playerHand = [deck.pop(), deck.pop()];
    dealerHand = [deck.pop(), deck.pop()];
    gameState = 'playing';

    // Check for blackjack immediately
    const playerTotal = calculateHand(playerHand);
    const dealerTotal = calculateHand(dealerHand);

    // Check dealer blackjack (natural)
    // If dealer upcard is A or 10, technically should check peek, but for simple solo:
    // We will just let the player play unless both have simple blackjack conditions logic

    // Simplification: Check immediate wins
    if (playerTotal === 21) {
        // Player has natural Blackjack
        // Check if dealer also has 21 (needs to reveal)
        gameState = 'dealer-turn';
        updateUI(); // Show dealer hidden card
        setTimeout(() => {
            if (dealerTotal === 21) {
                endGame('push', 'Double Blackjack! Égalité.');
            } else {
                endGame('blackjack', 'Blackjack! Vous gagnez 3:2!');
            }
        }, 1000);
        return;
    }

    setStatus('Votre tour - Hit ou Stand?', 'info');
    updateUI();
}

function hit() {
    if (gameState !== 'playing') return;

    playerHand.push(deck.pop());
    const playerTotal = calculateHand(playerHand);

    updateUI();

    if (playerTotal > 21) {
        endGame('loss', 'Vous avez dépassé 21! Vous perdez.');
    } else if (playerTotal === 21) {
        setTimeout(() => stand(), 500);
    }
}

async function stand() {
    if (gameState !== 'playing') return;

    gameState = 'dealer-turn';
    setStatus('Tour du croupier...', 'info');
    updateUI();

    await dealerPlay();
}

async function double() {
    if (gameState !== 'playing' || playerHand.length !== 2 || balance < currentBet) return;

    try {
        await applyGameResult(currentUser.uid, {
            betAmount: currentBet,
            payout: 0,
            game: 'blackjack-solo'
        });

        currentBet *= 2;
        playerHand.push(deck.pop());

        // Force stand after double (unless bust)
        const playerTotal = calculateHand(playerHand);

        if (playerTotal > 21) {
            updateUI();
            endGame('loss', 'Vous avez dépassé 21! Vous perdez.');
        } else {
            gameState = 'dealer-turn'; // Show card first then dealer moves
            updateUI();
            setTimeout(() => {
                dealerPlay();
            }, 1000);
        }
    } catch (error) {
        console.error('Error doubling:', error);
        setStatus('Erreur lors du doublement', 'error');
    }
}

async function dealerPlay() {
    let dealerTotal = calculateHand(dealerHand);

    updateDisplay(); // Ensure hidden card is revealed

    while (dealerTotal < 17) {
        await new Promise(resolve => setTimeout(resolve, 800));
        dealerHand.push(deck.pop());
        dealerTotal = calculateHand(dealerHand);
        updateDisplay();
    }

    // Determine winner
    const playerTotal = calculateHand(playerHand);
    const playerBlackjack = playerTotal === 21 && playerHand.length === 2;
    const dealerBlackjack = dealerTotal === 21 && dealerHand.length === 2; // Shouldn't happen here usually if checked at start, but good safety

    if (dealerTotal > 21) {
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

    let payout = 0;
    let profit = 0;

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
    } else if (result === 'loss') {
        payout = 0;
        profit = -currentBet;
    }

    stats.handsPlayed++;
    stats.totalProfit += profit;

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

    const statusType = result === 'loss' ? 'error' : result === 'push' ? 'neutral' : 'success';
    setStatus(message, statusType);

    addResultToLog(result, Math.abs(profit));
    updateUI();

    setTimeout(() => {
        currentBet = 0;
        gameState = 'betting';
        playerHand = [];
        dealerHand = [];
        setStatus('Placez votre mise', 'neutral');
        updateUI();
    }, 3000);
}

// Event listeners
function setupEventListeners() {
    if (elements.logoutBtn) {
        elements.logoutBtn.addEventListener('click', async () => {
            await auth.signOut();
            window.location.href = '../../pages/auth/login.html';
        });
    }

    if (elements.depositBtn) {
        elements.depositBtn.addEventListener('click', () => {
            // Deposit modal logic would go here
            alert('Fonctionnalité de dépôt à venir');
        });
    }

    if (elements.dealBtn) elements.dealBtn.addEventListener('click', deal);
    if (elements.hitBtn) elements.hitBtn.addEventListener('click', hit);
    if (elements.standBtn) elements.standBtn.addEventListener('click', stand);
    if (elements.doubleBtn) elements.doubleBtn.addEventListener('click', double);

    if (elements.clearBetBtn) {
        elements.clearBetBtn.addEventListener('click', () => {
            if (gameState === 'betting') {
                currentBet = 0;
                updateUI();
            }
        });
    }

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
    const minBtn = document.getElementById('minBetBtn');
    const halfBtn = document.getElementById('halfBetBtn');
    const maxBtn = document.getElementById('maxBetBtn');

    if (minBtn) {
        minBtn.addEventListener('click', () => {
            if (gameState === 'betting') {
                currentBet = 1;
                updateUI();
            }
        });
    }

    if (halfBtn) {
        halfBtn.addEventListener('click', () => {
            if (gameState === 'betting') {
                currentBet = Math.floor(balance / 2);
                updateUI();
            }
        });
    }

    if (maxBtn) {
        maxBtn.addEventListener('click', () => {
            if (gameState === 'betting') {
                currentBet = Math.floor(balance);
                updateUI();
            }
        });
    }
}

// Initialize
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../../pages/auth/login.html';
        return;
    }

    currentUser = user;

    subscribeToUserData(user.uid, (data) => {
        balance = data.balance || 0;
        updateUI();
    });

    setupEventListeners();
    setStatus('Placez votre mise', 'neutral');
    updateUI();
});

