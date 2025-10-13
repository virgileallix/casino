import { auth, signOut, onAuthStateChanged } from './firebase-config.js';
import { initializeUserBalance, subscribeToUserData, addFunds, applyGameResult } from './balance-manager.js';

const suits = ['clubs', 'diamonds', 'hearts', 'spades'];
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const faceMapping = { 'A': 'ace', 'J': 'jack', 'Q': 'queen', 'K': 'king' };

let currentUser = null;
let unsubscribeUser = null;
let balance = 0;
let balanceLoaded = false;

let deck = [];
let playerHand = [];
let dealerHand = [];
let roundBet = 0;
let roundActive = false;
let playerHasActed = false;
let doubleAvailable = false;
let playerBlackjack = false;

let stats = {
    handsPlayed: 0,
    handsWon: 0,
    blackjacks: 0,
    totalProfit: 0
};

const elements = {
    userBalance: document.getElementById('userBalance'),
    depositBtn: document.getElementById('depositBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    betInput: document.getElementById('betAmount'),
    dealBtn: document.getElementById('dealBtn'),
    hitBtn: document.getElementById('hitBtn'),
    standBtn: document.getElementById('standBtn'),
    doubleBtn: document.getElementById('doubleBtn'),
    gameStatus: document.getElementById('gameStatus'),
    dealerHand: document.getElementById('dealerHand'),
    dealerTotal: document.getElementById('dealerTotal'),
    playerHand: document.getElementById('playerHand'),
    playerTotal: document.getElementById('playerTotal'),
    resultsLog: document.getElementById('resultsLog'),
    stats: {
        handsPlayed: document.getElementById('handsPlayed'),
        handsWon: document.getElementById('handsWon'),
        blackjacks: document.getElementById('blackjacks'),
        totalProfit: document.getElementById('totalProfit')
    }
};

function setStatus(message, tone = 'neutral') {
    elements.gameStatus.textContent = message;
    elements.gameStatus.className = `table-status ${tone}`;
}

function updateBalanceDisplay() {
    if (!elements.userBalance) return;
    if (!balanceLoaded) {
        elements.userBalance.textContent = '---';
        return;
    }
    elements.userBalance.textContent = `${balance.toFixed(2)} €`;
}

function updateStatsDisplay() {
    elements.stats.handsPlayed.textContent = stats.handsPlayed;
    elements.stats.handsWon.textContent = stats.handsWon;
    elements.stats.blackjacks.textContent = stats.blackjacks;
    elements.stats.totalProfit.textContent = `${stats.totalProfit.toFixed(2)} €`;
}

function resetHands() {
    playerHand = [];
    dealerHand = [];
    playerBlackjack = false;
    renderHands(true);
}

function createDeck() {
    deck = [];
    suits.forEach(suit => {
        ranks.forEach(rank => {
            deck.push({ suit, rank });
        });
    });
    shuffle(deck);
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function drawCard() {
    if (deck.length === 0) {
        createDeck();
    }
    return deck.pop();
}

function getCardImage(card) {
    const rankKey = faceMapping[card.rank] || card.rank.toLowerCase();
    return `assets/cards/${rankKey}_of_${card.suit}.png`;
}

function handTotal(hand) {
    let total = 0;
    let aces = 0;
    hand.forEach(card => {
        if (card.rank === 'A') {
            total += 11;
            aces += 1;
        } else if (['K', 'Q', 'J'].includes(card.rank)) {
            total += 10;
        } else {
            total += parseInt(card.rank, 10);
        }
    });

    while (total > 21 && aces > 0) {
        total -= 10;
        aces -= 1;
    }
    return total;
}

function renderHands(hideDealerHole) {
    renderHand(elements.playerHand, playerHand);
    renderHand(elements.dealerHand, dealerHand, hideDealerHole);

    elements.playerTotal.textContent = `Total : ${handTotal(playerHand)}`;
    elements.dealerTotal.textContent = hideDealerHole
        ? 'Total : ?'
        : `Total : ${handTotal(dealerHand)}`;
}

function renderHand(container, hand, hideHole = false) {
    container.innerHTML = '';
    hand.forEach((card, index) => {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'card';
        cardDiv.style.setProperty('--index', index);

        if (hideHole && index === 1) {
            cardDiv.classList.add('face-down');
        } else {
            // Set card display attributes
            const suitSymbols = {
                hearts: '♥',
                diamonds: '♦',
                clubs: '♣',
                spades: '♠'
            };

            const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
            cardDiv.style.setProperty('--card-color', isRed ? '#dc143c' : '#000');
            cardDiv.setAttribute('data-display', card.rank);
            cardDiv.setAttribute('data-suit', suitSymbols[card.suit] || '');
        }

        cardDiv.classList.add('deal');
        setTimeout(() => cardDiv.classList.remove('deal'), 600);
        container.appendChild(cardDiv);
    });
}

function logResult(result, bet, profit) {
    const noHistory = elements.resultsLog.querySelector('.no-history');
    if (noHistory) {
        noHistory.remove();
    }

    elements.resultsLog.querySelectorAll('.result-item').forEach(item => item.classList.remove('recent'));

    const entry = document.createElement('div');
    entry.className = `result-item ${result} recent`;
    const labelMap = {
        win: 'Victoire',
        loss: 'Défaite',
        push: 'Égalité'
    };
    entry.innerHTML = `
        <span>${labelMap[result] || result}</span>
        <span>Mise ${bet.toFixed(2)} €</span>
        <span>${profit >= 0 ? '+' : ''}${profit.toFixed(2)} €</span>
    `;
    elements.resultsLog.prepend(entry);

    while (elements.resultsLog.children.length > 12) {
        elements.resultsLog.removeChild(elements.resultsLog.lastChild);
    }
}

function enableActions({ hit = false, stand = false, double = false, deal = false }) {
    elements.hitBtn.disabled = !hit;
    elements.standBtn.disabled = !stand;
    elements.doubleBtn.disabled = !double;
    elements.dealBtn.disabled = !deal;
}

function startRound() {
    if (!balanceLoaded || !currentUser) return;
    if (roundActive) return;

    const bet = parseFloat(elements.betInput.value);
    if (isNaN(bet) || bet <= 0) {
        setStatus('Mise invalide.', 'warning');
        return;
    }
    if (bet > balance) {
        setStatus('Solde insuffisant pour cette mise.', 'warning');
        return;
    }

    if (deck.length < 15) {
        createDeck();
        setStatus('Nouvelle pioche. Bonne chance !', 'info');
    } else {
        setStatus('Bonne chance !', 'info');
    }

    roundActive = true;
    playerHasActed = false;
    doubleAvailable = true;
    roundBet = parseFloat(bet.toFixed(2));
    playerBlackjack = false;

    playerHand = [drawCard(), drawCard()];
    dealerHand = [drawCard(), drawCard()];

    renderHands(true);

    elements.dealBtn.disabled = true;

    if (handTotal(playerHand) === 21) {
        playerBlackjack = true;
        concludeRound('blackjack');
    } else if (handTotal(dealerHand) === 21) {
        concludeRound('dealer-blackjack');
    } else {
        enableActions({ hit: true, stand: true, double: balance >= roundBet * 2, deal: false });
    }
}

function playerHit() {
    if (!roundActive) return;
    playerHand.push(drawCard());
    playerHasActed = true;
    doubleAvailable = false;
    renderHands(true);
    elements.doubleBtn.disabled = true;

    const total = handTotal(playerHand);
    if (total > 21) {
        concludeRound('player-bust');
    } else if (total === 21) {
        stand();
    }
}

function stand() {
    if (!roundActive) return;
    resolveDealerTurn();
}

function doubleDown() {
    if (!roundActive || !doubleAvailable) return;
    if (balance < roundBet * 2) {
        setStatus('Solde insuffisant pour doubler.', 'warning');
        return;
    }
    roundBet = parseFloat((roundBet * 2).toFixed(2));
    doubleAvailable = false;
    playerHasActed = true;
    playerHand.push(drawCard());
    renderHands(true);

    const total = handTotal(playerHand);
    if (total > 21) {
        concludeRound('player-bust');
    } else {
        resolveDealerTurn();
    }
}

function resolveDealerTurn() {
    enableActions({ hit: false, stand: false, double: false, deal: false });
    renderHands(false);

    let dealerTotal = handTotal(dealerHand);
    while (dealerTotal < 17) {
        dealerHand.push(drawCard());
        renderHands(false);
        dealerTotal = handTotal(dealerHand);
    }

    if (dealerTotal > 21) {
        concludeRound('dealer-bust');
    } else {
        determineWinner();
    }
}

function determineWinner() {
    const playerTotal = handTotal(playerHand);
    const dealerTotal = handTotal(dealerHand);

    if (playerTotal > dealerTotal) {
        concludeRound('player-win');
    } else if (playerTotal < dealerTotal) {
        concludeRound('dealer-win');
    } else {
        concludeRound('push');
    }
}

async function concludeRound(outcome) {
    roundActive = false;
    enableActions({ hit: false, stand: false, double: false, deal: false });
    renderHands(false);

    let payout = 0;
    let resultType = 'loss';
    let statusTone = 'warning';
    let statusText = '';
    let blackjackWin = false;

    const playerTotal = handTotal(playerHand);
    const dealerTotal = handTotal(dealerHand);

    switch (outcome) {
        case 'blackjack':
            payout = roundBet * 2.5;
            resultType = 'win';
            statusTone = 'success';
            statusText = 'Blackjack ! Vous gagnez 3:2.';
            blackjackWin = true;
            break;
        case 'dealer-blackjack':
            if (handTotal(playerHand) === 21) {
                payout = roundBet;
                resultType = 'push';
                statusTone = 'info';
                statusText = 'Blackjack des deux côtés. Égalité.';
            } else {
                statusText = 'Le croupier a un blackjack.';
            }
            break;
        case 'player-bust':
            statusText = 'Vous dépassez 21. Perdu.';
            break;
        case 'dealer-bust':
            payout = roundBet * 2;
            resultType = 'win';
            statusTone = 'success';
            statusText = 'Le croupier bust. Vous gagnez !';
            break;
        case 'player-win':
            payout = roundBet * 2;
            resultType = 'win';
            statusTone = 'success';
            statusText = `Vous gagnez avec ${playerTotal} contre ${dealerTotal}.`;
            break;
        case 'dealer-win':
            statusText = `Le croupier gagne avec ${dealerTotal}.`;
            break;
        case 'push':
            payout = roundBet;
            resultType = 'push';
            statusTone = 'info';
            statusText = 'Égalité, votre mise est restituée.';
            break;
        default:
            statusText = 'Fin de la main.';
    }

    setStatus(statusText, statusTone);

    let profit = parseFloat((payout - roundBet).toFixed(2));

    try {
        const outcome = await applyGameResult(currentUser.uid, {
            betAmount: roundBet,
            payout,
            game: 'blackjack',
            metadata: {
                result: resultType,
                blackjack: blackjackWin
            }
        });
        balance = outcome.balance;
        balanceLoaded = true;
        updateBalanceDisplay();
    } catch (error) {
        console.error('Error applying blackjack result:', error);
        setStatus('Erreur lors de la mise à jour du solde.', 'warning');
    }

    stats.handsPlayed += 1;
    if (resultType === 'win') {
        stats.handsWon += 1;
    }
    if (blackjackWin) {
        stats.blackjacks += 1;
    }
    stats.totalProfit = parseFloat((stats.totalProfit + profit).toFixed(2));
    updateStatsDisplay();
    logResult(resultType, roundBet, profit);

    elements.dealBtn.disabled = false;
}

function setInitialState() {
    updateBalanceDisplay();
    updateStatsDisplay();
    resetHands();
    enableActions({ hit: false, stand: false, double: false, deal: false });
    setStatus('Placez votre mise et cliquez sur Distribuer.');
}

function syncStatsFromUser(data) {
    stats.handsPlayed = data.blackjackHandsPlayed ?? 0;
    stats.handsWon = data.blackjackWins ?? 0;
    stats.blackjacks = data.blackjackBlackjacks ?? 0;
    stats.totalProfit = parseFloat((data.blackjackTotalProfit ?? 0).toFixed(2));
    updateStatsDisplay();
}

function setupEventListeners() {
    elements.dealBtn.addEventListener('click', startRound);
    elements.hitBtn.addEventListener('click', playerHit);
    elements.standBtn.addEventListener('click', stand);
    elements.doubleBtn.addEventListener('click', doubleDown);

    document.querySelectorAll('.quick-bet').forEach(btn => {
        btn.addEventListener('click', () => {
            let currentBet = parseFloat(elements.betInput.value) || 0;
            switch (btn.dataset.action) {
                case 'half':
                    elements.betInput.value = Math.max(1, currentBet / 2).toFixed(2);
                    break;
                case 'double':
                    {
                        const doubled = Math.max(1, currentBet * 2);
                        const target = balanceLoaded ? Math.min(balance, doubled) : doubled;
                        elements.betInput.value = Math.max(1, target).toFixed(2);
                    }
                    break;
                case 'min':
                    elements.betInput.value = '1.00';
                    break;
                case 'max':
                    if (balanceLoaded) {
                        elements.betInput.value = Math.max(1, balance).toFixed(2);
                    }
                    break;
            }
        });
    });

    elements.depositBtn.addEventListener('click', async () => {
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

    elements.logoutBtn.addEventListener('click', async () => {
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

function init() {
    createDeck();
    setInitialState();
    setupEventListeners();
}

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
            updateBalanceDisplay();
            elements.dealBtn.disabled = true;
            return;
        }
        balance = data.balance;
        balanceLoaded = true;
        updateBalanceDisplay();
        syncStatsFromUser(data);
        elements.dealBtn.disabled = false;
    });
});

init();
