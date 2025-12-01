import { auth, onAuthStateChanged } from '../core/firebase-config.js';
import { subscribeToUserData, applyGameResult } from '../core/balance-manager.js';

// Game state
let currentUser = null;
let balance = 0;
let currentBet = 0;
let playerHand = [];
let dealerHand = [];
let deck = [];
let gameState = 'betting'; // betting, playing, dealer-turn, finished

// DOM elements
const elements = {
    userBalance: document.getElementById('userBalance'),
    logoutBtn: document.getElementById('logoutBtn'),

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
    gameStatus: document.getElementById('gameStatus')
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
    if (elements.dealerCards) {
        elements.dealerCards.innerHTML = '';
        dealerHand.forEach((card, index) => {
            const faceDown = gameState === 'playing' && index === 1;
            elements.dealerCards.appendChild(renderCard(card, faceDown));
        });
    }

    if (elements.playerCards) {
        elements.playerCards.innerHTML = '';
        playerHand.forEach(card => {
            elements.playerCards.appendChild(renderCard(card));
        });
    }

    // Totals
    const playerTotal = calculateHand(playerHand);
    if (elements.playerTotal) {
        elements.playerTotal.textContent = playerTotal;
    }

    if (elements.dealerTotal) {
        if (gameState === 'playing') {
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
}

function setStatus(message) {
    if (elements.gameStatus) {
        elements.gameStatus.textContent = message;
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

    setStatus('Votre tour - Hit ou Stand?');
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
        endGame('loss', 'Vous avez dépassé 21! Vous perdez.');
    } else if (playerTotal === 21) {
        setTimeout(() => stand(), 500);
    }
}

async function stand() {
    if (gameState !== 'playing') return;

    gameState = 'dealer-turn';
    setStatus('Tour du croupier...');
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
    setStatus(message);

    let payout = 0;

    if (result === 'blackjack') {
        payout = currentBet + (currentBet * 1.5);
    } else if (result === 'win') {
        payout = currentBet * 2;
    } else if (result === 'push') {
        payout = currentBet;
    }

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

    setTimeout(() => {
        currentBet = 0;
        gameState = 'betting';
        playerHand = [];
        dealerHand = [];
        setStatus('Placez votre mise');
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

    if (elements.dealBtn) elements.dealBtn.addEventListener('click', deal);
    if (elements.hitBtn) elements.hitBtn.addEventListener('click', hit);
    if (elements.standBtn) elements.standBtn.addEventListener('click', stand);
    if (elements.doubleBtn) elements.doubleBtn.addEventListener('click', double);

    if (elements.clearBetBtn) {
        elements.clearBetBtn.addEventListener('click', () => {
            currentBet = 0;
            updateUI();
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
    setStatus('Placez votre mise');
    updateUI();
});
