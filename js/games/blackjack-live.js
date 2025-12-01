import { auth, signOut, onAuthStateChanged, db, doc, getDoc, setDoc, updateDoc, onSnapshot, runTransaction, serverTimestamp } from 'js/core/firebase-config.js';
import { initializeUserBalance, subscribeToUserData, applyGameResult } from 'js/core/balance-manager.js';

// Card deck constants
const suits = ['clubs', 'diamonds', 'hearts', 'spades'];
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const faceMapping = { 'A': 'ace', 'J': 'jack', 'Q': 'queen', 'K': 'king' };

// Table configurations
const TABLE_CONFIGS = [
    { id: 'table-1', minBet: 1, maxPlayers: 7, name: '1€+' },
    { id: 'table-5', minBet: 5, maxPlayers: 7, name: '5€+' },
    { id: 'table-25', minBet: 25, maxPlayers: 7, name: '25€+' },
    { id: 'table-50', minBet: 50, maxPlayers: 7, name: '50€+' },
    { id: 'table-100', minBet: 100, maxPlayers: 7, name: '100€+' },
    { id: 'table-250', minBet: 250, maxPlayers: 7, name: '250€+' },
    { id: 'table-500', minBet: 500, maxPlayers: 7, name: '500€+' },
    { id: 'table-1000', minBet: 1000, maxPlayers: 7, name: '1000€+' }
];
const BETTING_TIMER_DURATION = 15;

// Game state
let currentUser = null;
let unsubscribeUser = null;
let unsubscribeTable = null;
let balance = 0;
let balanceLoaded = false;

let currentTableId = null;
let currentTableConfig = null;
let mySeats = []; // Array of seat numbers the player has claimed
let tableState = null;
let selectedChipValue = 10; // Default selected chip
let bettingTimerInterval = null;
let currentBettingTime = 0;
let bettingTimerEndTime = null;
let bettingTimerStartKey = null;
let bettingTimerTriggered = false;
let initializingBettingTimer = false;

// Auto-rebet system
let autoRebetEnabled = false;
let lastBets = {}; // Store last bets per seat: { seatNum: { bet, sideBet21Plus3, sideBetPerfectPairs } }

// Stats
let stats = {
    handsPlayed: 0,
    handsWon: 0,
    blackjacks: 0,
    totalProfit: 0
};

// Elements
const elements = {
    userBalance: document.getElementById('userBalance'),
    depositBtn: document.getElementById('depositBtn'),
    logoutBtn: document.getElementById('logoutBtn'),

    // Lobby
    lobbyScreen: document.getElementById('lobbyScreen'),
    tablesGrid: document.getElementById('tablesGrid'),

    // Game Screen
    gameScreen: document.getElementById('gameScreen'),
    backToLobbyBtn: document.getElementById('backToLobbyBtn'),
    tableMinBet: document.getElementById('tableMinBet'),

    // Seats
    seatSelectionPanel: document.getElementById('seatSelectionPanel'),
    seatsSelector: document.getElementById('seatsSelector'),
    bettingPanel: document.getElementById('bettingPanel'),
    activeSeatsList: document.getElementById('activeSeatsList'),

    // Game Controls
    dealBtn: document.getElementById('dealBtn'),
    gameStatus: document.getElementById('gameStatus'),
    roundTimer: document.getElementById('roundTimer'),
    timerValue: document.getElementById('timerValue'),

    // Table
    dealerHand: document.getElementById('dealerHand'),
    dealerTotal: document.getElementById('dealerTotal'),
    multiSeatsArea: document.getElementById('multiSeatsArea'),

    // Actions
    actionControls: document.getElementById('actionControls'),
    currentSeatIndicator: document.getElementById('currentSeatIndicator'),
    currentSeatNumber: document.getElementById('currentSeatNumber'),
    hitBtn: document.getElementById('hitBtn'),
    standBtn: document.getElementById('standBtn'),
    doubleBtn: document.getElementById('doubleBtn'),

    // Side Bets
    enable21Plus3: document.getElementById('enable21Plus3'),
    enablePerfectPairs: document.getElementById('enablePerfectPairs'),

    // Players List
    playersList: document.getElementById('playersList'),

    // Stats
    resultsLog: document.getElementById('resultsLog'),
    stats: {
        handsPlayed: document.getElementById('handsPlayed'),
        handsWon: document.getElementById('handsWon'),
        blackjacks: document.getElementById('blackjacks'),
        totalProfit: document.getElementById('totalProfit')
    }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

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

function syncStatsFromUser(data) {
    stats.handsPlayed = data.blackjackHandsPlayed ?? 0;
    stats.handsWon = data.blackjackWins ?? 0;
    stats.blackjacks = data.blackjackBlackjacks ?? 0;
    stats.totalProfit = parseFloat((data.blackjackTotalProfit ?? 0).toFixed(2));
    updateStatsDisplay();
}

function getCardImage(card) {
    const rankKey = faceMapping[card.rank] || card.rank.toLowerCase();
    return `assets/cards/${rankKey}_of_${card.suit}.png`;
}

function handTotal(hand) {
    if (!hand || hand.length === 0) return 0;
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

function renderHand(container, hand, hideHole = false) {
    if (!container) return;
    container.innerHTML = '';
    if (!hand || hand.length === 0) return;

    hand.forEach((card, index) => {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'card';
        cardDiv.style.setProperty('--index', index);

        if (hideHole && index === 1) {
            cardDiv.classList.add('face-down');
        } else {
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

// ============================================================================
// LOBBY FUNCTIONS
// ============================================================================

function renderLobby() {
    elements.tablesGrid.innerHTML = '';

    TABLE_CONFIGS.forEach(config => {
        const tableCard = document.createElement('div');
        tableCard.className = 'table-card';
        tableCard.innerHTML = `
            <div class="table-card-header">
                <h3>${config.name}</h3>
                <span class="table-min-bet">Mise min: ${config.minBet}€</span>
            </div>
            <div class="table-card-body">
                <div class="table-info">
                    <span><i class="fas fa-users"></i> <span class="player-count" data-table="${config.id}">0</span>/${config.maxPlayers}</span>
                    <span><i class="fas fa-chair"></i> Places disponibles</span>
                </div>
                <button class="btn-join-table" data-table="${config.id}">
                    Rejoindre la table
                </button>
            </div>
        `;

        tableCard.querySelector('.btn-join-table').addEventListener('click', () => {
            joinTable(config.id);
        });

        elements.tablesGrid.appendChild(tableCard);
    });

    // Subscribe to all tables to show player counts
    TABLE_CONFIGS.forEach(config => {
        const tableRef = doc(db, 'blackjack-tables', config.id);
        onSnapshot(tableRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                const playerCount = Object.keys(data.seats || {}).filter(seatNum => {
                    const seat = data.seats[seatNum];
                    return seat && seat.userId;
                }).length;

                const countElement = document.querySelector(`[data-table="${config.id}"]`);
                if (countElement) {
                    countElement.textContent = playerCount;
                }
            }
        });
    });
}

async function joinTable(tableId) {
    currentTableId = tableId;
    currentTableConfig = TABLE_CONFIGS.find(t => t.id === tableId);

    // Initialize table in Firestore if it doesn't exist
    const tableRef = doc(db, 'blackjack-tables', tableId);
    const tableSnap = await getDoc(tableRef);

    if (!tableSnap.exists()) {
        await setDoc(tableRef, {
            id: tableId,
            minBet: currentTableConfig.minBet,
            maxPlayers: currentTableConfig.maxPlayers,
            state: 'betting', // waiting, betting, dealing, playing, dealer-turn
            seats: {},
            dealerHand: [],
            deck: [],
            currentRound: 0,
            bettingTimer: {
                startTime: serverTimestamp(),
                duration: BETTING_TIMER_DURATION
            },
            lastActivity: serverTimestamp()
        });
    } else {
        const data = tableSnap.data();
        if (data.state === 'waiting' || !data.bettingTimer) {
            await updateDoc(tableRef, {
                state: 'betting',
                bettingTimer: {
                    startTime: serverTimestamp(),
                    duration: data.bettingTimer?.duration || BETTING_TIMER_DURATION
                },
                lastActivity: serverTimestamp()
            });
        }
    }

    // Subscribe to table updates
    if (unsubscribeTable) {
        unsubscribeTable();
    }

    unsubscribeTable = onSnapshot(tableRef, (snapshot) => {
        if (snapshot.exists()) {
            tableState = snapshot.data();
            updateGameScreen();
        }
    });

    // Switch to game screen
    elements.lobbyScreen.style.display = 'none';
    elements.gameScreen.style.display = 'grid';
    elements.tableMinBet.textContent = currentTableConfig.name;

    renderSeatsSelector();
}

function leaveTable() {
    if (unsubscribeTable) {
        unsubscribeTable();
    }

    stopBettingTimer(true);

    // Clear my seats from the table
    if (currentTableId && mySeats.length > 0) {
        const tableRef = doc(db, 'blackjack-tables', currentTableId);
        runTransaction(db, async (transaction) => {
            const tableDoc = await transaction.get(tableRef);
            if (tableDoc.exists()) {
                const data = tableDoc.data();
                mySeats.forEach(seatNum => {
                    if (data.seats[seatNum]) {
                        delete data.seats[seatNum];
                    }
                });
                transaction.update(tableRef, { seats: data.seats });
            }
        });
    }

    currentTableId = null;
    currentTableConfig = null;
    mySeats = [];
    tableState = null;

    elements.gameScreen.style.display = 'none';
    elements.lobbyScreen.style.display = 'block';
}

// ============================================================================
// SEAT MANAGEMENT
// ============================================================================

function renderSeatsSelector() {
    elements.seatsSelector.innerHTML = '';

    for (let i = 1; i <= 7; i++) {
        const seatBtn = document.createElement('button');
        seatBtn.className = 'seat-button';
        seatBtn.setAttribute('data-seat', i);
        seatBtn.innerHTML = `
            <span class="seat-number">Place ${i}</span>
            <span class="seat-status">Libre</span>
        `;

        seatBtn.addEventListener('click', () => toggleSeat(i));
        elements.seatsSelector.appendChild(seatBtn);
    }
}

async function toggleSeat(seatNumber) {
    if (!currentTableId || !currentUser) return;

    const tableRef = doc(db, 'blackjack-tables', currentTableId);

    try {
        await runTransaction(db, async (transaction) => {
            const tableDoc = await transaction.get(tableRef);
            if (!tableDoc.exists()) return;

            const data = tableDoc.data();
            const seats = data.seats || {};

            // Check if I'm already in this seat
            if (mySeats.includes(seatNumber)) {
                // Remove me from this seat
                delete seats[seatNumber];
                mySeats = mySeats.filter(s => s !== seatNumber);
            } else {
                // Check if seat is occupied
                if (seats[seatNumber] && seats[seatNumber].userId !== currentUser.uid) {
                    alert('Cette place est déjà occupée');
                    return;
                }

                // Check if I can take more seats
                if (mySeats.length >= 3) {
                    alert('Vous ne pouvez occuper que 3 places maximum');
                    return;
                }

                // Claim the seat
                seats[seatNumber] = {
                    userId: currentUser.uid,
                    username: currentUser.email.split('@')[0],
                    bet: 0,
                    sideBet21Plus3: 0,
                    sideBetPerfectPairs: 0,
                    hand: [],
                    status: 'waiting', // waiting, playing, standing, bust, blackjack, done
                    inactiveRounds: 0
                };
                mySeats.push(seatNumber);

                // IMPROVED: Start betting timer if table was in waiting state
                if (data.state === 'waiting') {
                    data.state = 'betting';
                    data.bettingTimer = {
                        startTime: serverTimestamp(),
                        duration: BETTING_TIMER_DURATION
                    };
                }
            }

            transaction.update(tableRef, data);
        });
    } catch (error) {
        console.error('Error toggling seat:', error);
    }
}

function updateSeatsDisplay() {
    if (!tableState) return;

    // Update seat selector buttons
    const seatButtons = elements.seatsSelector.querySelectorAll('.seat-button');
    seatButtons.forEach(btn => {
        const seatNum = parseInt(btn.getAttribute('data-seat'));
        const seat = tableState.seats[seatNum];

        btn.classList.remove('occupied', 'mine', 'inactive');

        if (seat && seat.userId) {
            btn.classList.add('occupied');
            if (seat.userId === currentUser.uid) {
                btn.classList.add('mine');
                btn.querySelector('.seat-status').textContent = 'Votre place';
            } else {
                btn.querySelector('.seat-status').textContent = seat.username;
            }
        } else {
            btn.querySelector('.seat-status').textContent = 'Libre';
        }
    });

    // Show/hide betting panel
    if (mySeats.length > 0) {
        elements.bettingPanel.style.display = 'block';
        renderActiveSeatsBetting();
    } else {
        elements.bettingPanel.style.display = 'none';
    }

    // Render multi-seats area
    renderMultiSeatsArea();
}

function renderActiveSeatsBetting() {
    elements.activeSeatsList.innerHTML = '';

    mySeats.sort((a, b) => a - b).forEach(seatNum => {
        const seat = tableState.seats[seatNum];
        if (!seat) return;

        const seatDiv = document.createElement('div');
        seatDiv.className = 'active-seat-betting';

        // Calculate chips breakdown
        const chipsBreakdown = getChipsBreakdown(seat.bet || 0);
        const chipsHTML = chipsBreakdown.map(chip =>
            `<span class="chip chip-${chip}" title="${chip}€">${chip}</span>`
        ).join('');

        seatDiv.innerHTML = `
            <div class="seat-betting-header">
                <span class="seat-label">Place ${seatNum}</span>
                <button class="btn-remove-seat" data-seat="${seatNum}">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="bet-display-area">
                <div class="bet-amount-display">${seat.bet || 0}€</div>
                <div class="seat-chips-stack">${chipsHTML || '<span class="no-bet-text">Cliquez sur les jetons pour miser</span>'}</div>
            </div>
            <div class="quick-bet-buttons">
                <button class="quick-bet" data-action="clear" data-seat="${seatNum}">Effacer</button>
                <button class="quick-bet" data-action="min" data-seat="${seatNum}">Min</button>
                <button class="quick-bet" data-action="double" data-seat="${seatNum}">2x</button>
                <button class="quick-bet" data-action="max" data-seat="${seatNum}">Max</button>
            </div>

            ${elements.enable21Plus3.checked ? `
            <div class="side-bet-input">
                <label>21+3: ${seat.sideBet21Plus3 || 0}€</label>
                <button class="side-bet-chip-btn" data-seat="${seatNum}" data-type="21plus3">+${selectedChipValue}€</button>
            </div>
            ` : ''}

            ${elements.enablePerfectPairs.checked ? `
            <div class="side-bet-input">
                <label>Perfect Pairs: ${seat.sideBetPerfectPairs || 0}€</label>
                <button class="side-bet-chip-btn" data-seat="${seatNum}" data-type="perfectpairs">+${selectedChipValue}€</button>
            </div>
            ` : ''}
        `;

        // Add click listener for betting with chips
        seatDiv.addEventListener('click', (e) => {
            if (!e.target.closest('.btn-remove-seat') &&
                !e.target.closest('.quick-bet') &&
                !e.target.closest('.side-bet-chip-btn')) {
                addChipToSeat(seatNum);
            }
        });

        // Event listeners
        seatDiv.querySelector('.btn-remove-seat').addEventListener('click', () => {
            toggleSeat(seatNum);
        });

        seatDiv.querySelectorAll('.quick-bet').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.getAttribute('data-action');
                quickBetAction(seatNum, action);
            });
        });

        // Side bet buttons
        seatDiv.querySelectorAll('.side-bet-chip-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const type = btn.getAttribute('data-type');
                addChipToSideBet(seatNum, type);
            });
        });

        elements.activeSeatsList.appendChild(seatDiv);
    });
}

function getChipsBreakdown(amount) {
    const chips = [1000, 500, 100, 50, 25, 10, 5, 1];
    const result = [];
    let remaining = Math.floor(amount);

    for (const chip of chips) {
        while (remaining >= chip) {
            result.push(chip);
            remaining -= chip;
        }
    }

    return result;
}

function renderChipStackHTML(amount, { label = '', type = 'main', emptyLabel = 'Placez vos jetons' } = {}) {
    const safeAmount = Math.max(0, Math.floor(amount || 0));
    const chips = getChipsBreakdown(safeAmount).slice(0, 7);
    const isEmpty = safeAmount === 0;
    const stackClass = ['chip-stack', type, isEmpty ? 'empty' : ''].filter(Boolean).join(' ');
    const chipsHTML = chips.map((chip, index) =>
        `<span class="chip chip-${chip} chip-table" style="--stack-index:${index};" aria-hidden="true">${chip}</span>`
    ).join('');
    const labelHTML = label ? `<small>${label}</small>` : '';

    return `
        <div class="${stackClass}">
            ${isEmpty ? `<span class="chip-stack-placeholder">${emptyLabel}</span>` : chipsHTML}
            <span class="chip-stack-total">${safeAmount}€${labelHTML}</span>
        </div>
    `;
}

async function addChipToSeat(seatNum) {
    if (!currentTableId || !tableState) return;
    if (tableState.state !== 'waiting' && tableState.state !== 'betting') return;

    const seat = tableState.seats[seatNum];
    if (!seat) return;

    const newBet = (seat.bet || 0) + selectedChipValue;

    if (newBet > balance) {
        alert('Solde insuffisant');
        return;
    }

    await updateSeatBet(seatNum, newBet);
}

async function addChipToSideBet(seatNum, type) {
    if (!currentTableId || !tableState) return;
    if (tableState.state !== 'waiting' && tableState.state !== 'betting') return;

    const seat = tableState.seats[seatNum];
    if (!seat) return;

    const currentAmount = type === '21plus3' ? (seat.sideBet21Plus3 || 0) : (seat.sideBetPerfectPairs || 0);
    const newAmount = currentAmount + selectedChipValue;

    if (newAmount > balance) {
        alert('Solde insuffisant');
        return;
    }

    await updateSideBet(seatNum, type, newAmount);
}

async function updateSeatBet(seatNum, amount) {
    if (!currentTableId || !tableState) return;

    if (amount < 0) {
        alert('La mise ne peut pas être négative');
        return;
    }

    const tableRef = doc(db, 'blackjack-tables', currentTableId);
    await runTransaction(db, async (transaction) => {
        const tableDoc = await transaction.get(tableRef);
        if (!tableDoc.exists()) return;

        const data = tableDoc.data();
        if (data.seats[seatNum] && data.seats[seatNum].userId === currentUser.uid) {
            data.seats[seatNum].bet = amount;
            transaction.update(tableRef, { seats: data.seats });
        }
    });
}

async function updateSideBet(seatNum, type, amount) {
    if (!currentTableId || !tableState) return;

    const tableRef = doc(db, 'blackjack-tables', currentTableId);
    await runTransaction(db, async (transaction) => {
        const tableDoc = await transaction.get(tableRef);
        if (!tableDoc.exists()) return;

        const data = tableDoc.data();
        if (data.seats[seatNum] && data.seats[seatNum].userId === currentUser.uid) {
            if (type === '21plus3') {
                data.seats[seatNum].sideBet21Plus3 = amount;
            } else if (type === 'perfectpairs') {
                data.seats[seatNum].sideBetPerfectPairs = amount;
            }
            transaction.update(tableRef, { seats: data.seats });
        }
    });
}

function quickBetAction(seatNum, action) {
    if (!tableState || !tableState.seats[seatNum]) return;

    const seat = tableState.seats[seatNum];
    let currentBet = seat.bet || 0;
    const minBet = currentTableConfig.minBet;
    let newBet = currentBet;

    switch (action) {
        case 'clear':
            newBet = 0;
            break;
        case 'min':
            newBet = minBet;
            break;
        case 'half':
            newBet = Math.max(0, currentBet / 2);
            break;
        case 'double':
            newBet = Math.min(balance, currentBet * 2);
            break;
        case 'max':
            newBet = Math.max(minBet, balance);
            break;
    }

    updateSeatBet(seatNum, newBet);
}

function renderMultiSeatsArea() {
    if (!tableState) return;

    elements.multiSeatsArea.innerHTML = '';

    for (let i = 1; i <= 7; i++) {
        const seat = tableState.seats[i];
        const seatDiv = document.createElement('div');
        seatDiv.className = 'player-seat';
        seatDiv.setAttribute('data-seat', i);

        if (seat && seat.userId) {
            const isMe = seat.userId === currentUser.uid;
            seatDiv.classList.add('occupied');
            if (isMe) seatDiv.classList.add('my-seat');

            const mainBetStack = renderChipStackHTML(seat.bet || 0, {
                label: 'Mise principale',
                type: 'main',
                emptyLabel: 'Cliquez pour miser'
            });

            const show21plus3 = elements.enable21Plus3?.checked;
            const showPerfectPairs = elements.enablePerfectPairs?.checked;

            const side21HTML = show21plus3 ? `
                <div class="side-bet-circle side-21" data-seat-side21="${i}">
                    ${renderChipStackHTML(seat.sideBet21Plus3 || 0, {
                        label: '21+3',
                        type: 'side',
                        emptyLabel: '21+3'
                    })}
                </div>
            ` : '';

            const sidePerfectHTML = showPerfectPairs ? `
                <div class="side-bet-circle side-pp" data-seat-sidepp="${i}">
                    ${renderChipStackHTML(seat.sideBetPerfectPairs || 0, {
                        label: 'Perfect Pairs',
                        type: 'side',
                        emptyLabel: 'Perfect Pairs'
                    })}
                </div>
            ` : '';

            seatDiv.innerHTML = `
                <div class="seat-hand-area">
                    <div class="seat-hand" data-seat-hand="${i}"></div>
                    <div class="seat-total" data-seat-total="${i}">Total: 0</div>
                </div>
                <div class="seat-bet-area">
                    <div class="main-bet-circle" data-seat-bet="${i}">
                        ${mainBetStack}
                    </div>
                    ${(show21plus3 || showPerfectPairs) ? `
                    <div class="seat-side-bets">
                        ${side21HTML}
                        ${sidePerfectHTML}
                    </div>
                    ` : ''}
                </div>
                <div class="seat-footer">
                    <div class="seat-number-display">Place ${i}</div>
                    <div class="seat-player">${isMe ? 'Vous' : seat.username}</div>
                </div>
            `;

            // Render hand
            if (seat.hand && seat.hand.length > 0) {
                const handContainer = seatDiv.querySelector(`[data-seat-hand="${i}"]`);
                renderHand(handContainer, seat.hand, false);

                const totalElement = seatDiv.querySelector(`[data-seat-total="${i}"]`);
                totalElement.textContent = `Total: ${handTotal(seat.hand)}`;
            }
            // Enable felt betting interactions for my seats during betting phase
            const canBet = isMe && (tableState.state === 'waiting' || tableState.state === 'betting');
            if (canBet) {
                const betCircle = seatDiv.querySelector(`[data-seat-bet="${i}"]`);
                betCircle?.addEventListener('click', (event) => {
                    event.stopPropagation();
                    addChipToSeat(i);
                });
                betCircle?.classList.add('bet-circle-clickable');

                if (show21plus3) {
                    const side21Circle = seatDiv.querySelector(`[data-seat-side21="${i}"]`);
                    side21Circle?.addEventListener('click', (event) => {
                        event.stopPropagation();
                        addChipToSideBet(i, '21plus3');
                    });
                    side21Circle?.classList.add('bet-circle-clickable');
                }

                if (showPerfectPairs) {
                    const sidePPCircle = seatDiv.querySelector(`[data-seat-sidepp="${i}"]`);
                    sidePPCircle?.addEventListener('click', (event) => {
                        event.stopPropagation();
                        addChipToSideBet(i, 'perfectpairs');
                    });
                    sidePPCircle?.classList.add('bet-circle-clickable');
                }
            }
        } else {
            seatDiv.innerHTML = `
                <div class="seat-empty">
                    <div class="seat-number-display">Place ${i}</div>
                    <div class="seat-empty-label">Libre</div>
                </div>
            `;
        }

        elements.multiSeatsArea.appendChild(seatDiv);
    }
}

// ============================================================================
// GAME LOGIC
// ============================================================================

function updateGameScreen() {
    if (!tableState) return;

    updateSeatsDisplay();
    updatePlayersListDisplay();

    // Render dealer hand
    if (tableState.dealerHand && tableState.dealerHand.length > 0) {
        const hideHole = tableState.state === 'dealing' || tableState.state === 'playing';
        renderHand(elements.dealerHand, tableState.dealerHand, hideHole);

        if (hideHole) {
            elements.dealerTotal.textContent = 'Total: ?';
        } else {
            elements.dealerTotal.textContent = `Total: ${handTotal(tableState.dealerHand)}`;
        }
    } else {
        elements.dealerHand.innerHTML = '';
        elements.dealerTotal.textContent = 'Total: 0';
    }

    // Update game status
    updateGameStatus();

    // Update deal button
    updateDealButton();

    // Update timer display
    updateBettingTimerUI();

    // Setup player action buttons
    setupPlayerActionListeners();
}

function updateBettingTimerUI() {
    if (!elements.roundTimer) return;

    if (!tableState || (tableState.state !== 'betting' && tableState.state !== 'waiting')) {
        stopBettingTimer(true);
        return;
    }

    const timerData = tableState.bettingTimer;
    if (!timerData || !timerData.startTime) {
        const hasPlayers = Object.keys(tableState.seats || {}).length > 0;
        stopBettingTimer(true);
        if (hasPlayers) {
            ensureBettingTimerExists();
        }
        return;
    }

    const startTime = typeof timerData.startTime.toMillis === 'function'
        ? timerData.startTime.toMillis()
        : new Date(timerData.startTime).getTime();
    const durationMs = (timerData.duration || BETTING_TIMER_DURATION) * 1000;
    const endTime = startTime + durationMs;
    const timerKey = `${currentTableId || 'table'}-${startTime}`;

    if (bettingTimerEndTime !== endTime || bettingTimerStartKey !== timerKey) {
        startLocalBettingTimer(endTime, timerKey);
    }
}

function startLocalBettingTimer(endTime, timerKey) {
    stopBettingTimer(false);
    bettingTimerEndTime = endTime;
    bettingTimerStartKey = timerKey;
    bettingTimerTriggered = false;

    if (elements.roundTimer) {
        elements.roundTimer.style.display = 'flex';
    }

    updateBettingTimerDisplay();
    bettingTimerInterval = setInterval(updateBettingTimerDisplay, 250);
}

function updateBettingTimerDisplay() {
    if (!bettingTimerEndTime || !elements.timerValue) return;

    const remainingMs = Math.max(0, bettingTimerEndTime - Date.now());
    const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    currentBettingTime = remainingSeconds;

    elements.timerValue.textContent = `${remainingSeconds}s`;

    if (remainingMs <= 0 && !bettingTimerTriggered) {
        bettingTimerTriggered = true;
        stopBettingTimer(false);
        handleBettingTimerExpiration();
    }
}

function stopBettingTimer(hide = true) {
    if (bettingTimerInterval) {
        clearInterval(bettingTimerInterval);
        bettingTimerInterval = null;
    }
    bettingTimerEndTime = null;
    bettingTimerStartKey = null;
    bettingTimerTriggered = false;

    if (elements.roundTimer && hide) {
        elements.roundTimer.style.display = 'none';
    }
}

async function ensureBettingTimerExists() {
    if (!currentTableId || initializingBettingTimer) return;
    if (!tableState || (tableState.state !== 'betting' && tableState.state !== 'waiting')) return;

    const hasPlayers = Object.keys(tableState.seats || {}).length > 0;
    if (!hasPlayers) return;

    initializingBettingTimer = true;

    try {
        const tableRef = doc(db, 'blackjack-tables', currentTableId);
        await updateDoc(tableRef, {
            state: 'betting',
            bettingTimer: {
                startTime: serverTimestamp(),
                duration: tableState?.bettingTimer?.duration || BETTING_TIMER_DURATION
            }
        });
    } catch (error) {
        console.error('Error initializing betting timer:', error);
    } finally {
        initializingBettingTimer = false;
    }
}

function updateGameStatus() {
    if (!tableState) return;

    const playerCount = Object.keys(tableState.seats || {}).length;

    switch (tableState.state) {
        case 'waiting':
            setStatus('⏳ En attente de joueurs...', 'info');
            break;
        case 'betting':
            const timeLeft = currentBettingTime > 0 ? ` (${currentBettingTime}s)` : '';
            setStatus(`💰 Placez vos mises !${timeLeft}`, 'info');
            break;
        case 'dealing':
            setStatus('🎴 Distribution des cartes...', 'info');
            break;
        case 'playing':
            setStatus('🎮 Les joueurs jouent leurs mains...', 'info');
            break;
        case 'dealer-turn':
            setStatus('🎯 Tour du croupier...', 'info');
            break;
        default:
            setStatus('✅ Prêt à jouer', 'neutral');
    }
}

function updateDealButton() {
    if (!tableState || mySeats.length === 0) {
        elements.dealBtn.disabled = true;
        elements.dealBtn.textContent = 'En attente...';
        return;
    }

    const allSeatsReady = mySeats.every(seatNum => {
        const seat = tableState.seats[seatNum];
        return seat && seat.bet >= currentTableConfig.minBet;
    });

    if (tableState.state === 'waiting' || tableState.state === 'betting') {
        if (allSeatsReady) {
            elements.dealBtn.disabled = false;
            elements.dealBtn.textContent = 'Prêt à jouer';
        } else {
            elements.dealBtn.disabled = true;
            elements.dealBtn.textContent = 'Définissez vos mises';
        }
    } else {
        elements.dealBtn.disabled = true;
        elements.dealBtn.textContent = 'Partie en cours...';
    }
}

function updatePlayersListDisplay() {
    if (!tableState) return;

    elements.playersList.innerHTML = '';

    const uniquePlayers = new Map();
    Object.values(tableState.seats || {}).forEach(seat => {
        if (seat && seat.userId) {
            if (!uniquePlayers.has(seat.userId)) {
                uniquePlayers.set(seat.userId, {
                    username: seat.username,
                    seatCount: 0
                });
            }
            uniquePlayers.get(seat.userId).seatCount++;
        }
    });

    if (uniquePlayers.size === 0) {
        elements.playersList.innerHTML = '<div class="no-players">Aucun joueur</div>';
        return;
    }

    uniquePlayers.forEach((player, userId) => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-item';
        if (userId === currentUser.uid) {
            playerDiv.classList.add('current-user');
        }
        playerDiv.innerHTML = `
            <span class="player-name">${player.username}</span>
            <span class="player-seats">${player.seatCount} place${player.seatCount > 1 ? 's' : ''}</span>
        `;
        elements.playersList.appendChild(playerDiv);
    });
}

async function readyToPlay() {
    if (!currentTableId || !currentUser || mySeats.length === 0) return;

    // Validate bets
    let totalBet = 0;
    for (const seatNum of mySeats) {
        const seat = tableState.seats[seatNum];
        if (!seat) continue;

        const mainBet = seat.bet || 0;
        const sideBet1 = seat.sideBet21Plus3 || 0;
        const sideBet2 = seat.sideBetPerfectPairs || 0;

        if (mainBet < currentTableConfig.minBet) {
            alert(`La mise minimum pour la place ${seatNum} est de ${currentTableConfig.minBet}€`);
            return;
        }

        totalBet += mainBet + sideBet1 + sideBet2;
    }

    if (totalBet > balance) {
        alert('Solde insuffisant pour ces mises');
        return;
    }

    // CRITICAL FIX: Deduct bets BEFORE marking as ready
    try {
        // Apply negative game result to deduct the bets
        await applyGameResult(currentUser.uid, {
            betAmount: totalBet,
            payout: 0,  // No payout yet, this just deducts the bet
            game: 'blackjack',
            metadata: {
                action: 'place_bets',
                tableId: currentTableId,
                seats: mySeats
            }
        });

        // IMPROVED: Save last bets for auto-rebet
        mySeats.forEach(seatNum => {
            const seat = tableState.seats[seatNum];
            if (seat) {
                lastBets[seatNum] = {
                    bet: seat.bet || 0,
                    sideBet21Plus3: seat.sideBet21Plus3 || 0,
                    sideBetPerfectPairs: seat.sideBetPerfectPairs || 0
                };
            }
        });

        // Mark seats as ready
        const tableRef = doc(db, 'blackjack-tables', currentTableId);
        await runTransaction(db, async (transaction) => {
            const tableDoc = await transaction.get(tableRef);
            if (!tableDoc.exists()) return;

            const data = tableDoc.data();
            mySeats.forEach(seatNum => {
                if (data.seats[seatNum]) {
                    data.seats[seatNum].status = 'ready';
                    data.seats[seatNum].inactiveRounds = 0;
                    data.seats[seatNum].betsDeducted = true;  // Mark that bets were deducted
                }
            });

            transaction.update(tableRef, { seats: data.seats });
        });

        // Vérifie immédiatement si tous les joueurs nécessaires sont prêts
        checkAndStartRound();
    } catch (error) {
        console.error('Error deducting bets:', error);
        alert('Erreur lors de la déduction des mises. Veuillez réessayer.');
    }
}

async function checkAndStartRound(force = false) {
    if (!currentTableId || !tableState) return;

    const seats = Object.values(tableState.seats || {});
    if (seats.length === 0) return;

    // Check if at least one player is ready
    const hasReadyPlayers = seats.some(seat => seat.status === 'ready');
    const isBettingState = tableState.state === 'betting' || tableState.state === 'waiting';

    if (force || (hasReadyPlayers && isBettingState)) {
        await startRound();
    }
}

async function handleBettingTimerExpiration() {
    if (!currentTableId) return;

    const tableRef = doc(db, 'blackjack-tables', currentTableId);
    let shouldStart = false;

    try {
        await runTransaction(db, async (transaction) => {
            const tableDoc = await transaction.get(tableRef);
            if (!tableDoc.exists()) return;

            const data = tableDoc.data();
            const isBettingState = data.state === 'betting' || data.state === 'waiting';
            if (!isBettingState) return;

            const seats = data.seats || {};
            const hasPlayers = Object.keys(seats).length > 0;
            const hasReadySeats = Object.values(seats).some(seat => seat && seat.status === 'ready');

            if (hasReadySeats) {
                shouldStart = true;
                transaction.update(tableRef, {
                    bettingTimer: null,
                    lastActivity: serverTimestamp()
                });
            } else if (hasPlayers) {
                transaction.update(tableRef, {
                    state: 'betting',
                    bettingTimer: {
                        startTime: serverTimestamp(),
                        duration: data.bettingTimer?.duration || BETTING_TIMER_DURATION
                    }
                });
            } else {
                transaction.update(tableRef, {
                    state: 'waiting',
                    bettingTimer: null
                });
            }
        });

        if (shouldStart) {
            await startRound();
        }
    } catch (error) {
        console.error('Error handling betting timer expiration:', error);
    }
}

async function startRound() {
    if (!currentTableId) return;

    const tableRef = doc(db, 'blackjack-tables', currentTableId);

    await runTransaction(db, async (transaction) => {
        const tableDoc = await transaction.get(tableRef);
        if (!tableDoc.exists()) return;

        const data = tableDoc.data();
        const isBettingState = data.state === 'betting' || data.state === 'waiting';
        if (!isBettingState) return;

        // Create/shuffle deck if needed
        if (!data.deck || data.deck.length < 52) {
            data.deck = createShuffledDeck();
        }

        // Deal initial cards
        data.dealerHand = [drawCardFromDeck(data.deck), drawCardFromDeck(data.deck)];

        Object.keys(data.seats).forEach(seatNum => {
            const seat = data.seats[seatNum];
            if (seat && seat.status === 'ready') {
                seat.hand = [drawCardFromDeck(data.deck), drawCardFromDeck(data.deck)];
                seat.status = 'playing';
            }
        });

        data.state = 'playing';
        data.currentRound = (data.currentRound || 0) + 1;
        data.bettingTimer = null;
        data.lastActivity = serverTimestamp();

        transaction.update(tableRef, data);
    });
}

function createShuffledDeck() {
    const deck = [];
    for (let i = 0; i < 6; i++) { // 6 decks
        suits.forEach(suit => {
            ranks.forEach(rank => {
                deck.push({ suit, rank });
            });
        });
    }

    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    return deck;
}

function drawCardFromDeck(deck) {
    if (deck.length === 0) return null;
    return deck.pop();
}

// ============================================================================
// SIDE BETS CALCULATIONS
// ============================================================================

function calculate21Plus3Payout(playerHand, dealerUpCard) {
    if (!playerHand || playerHand.length < 2 || !dealerUpCard) return 0;

    const cards = [playerHand[0], playerHand[1], dealerUpCard];
    const suits = cards.map(c => c.suit);
    const ranks = cards.map(c => c.rank);

    // Suited trips (same rank, same suit) - 100:1
    if (ranks[0] === ranks[1] && ranks[1] === ranks[2] &&
        suits[0] === suits[1] && suits[1] === suits[2]) {
        return 100;
    }

    // Straight flush - 40:1
    const rankValues = ranks.map(r => {
        if (r === 'A') return 14;
        if (r === 'K') return 13;
        if (r === 'Q') return 12;
        if (r === 'J') return 11;
        return parseInt(r);
    }).sort((a, b) => a - b);

    const isFlush = suits[0] === suits[1] && suits[1] === suits[2];
    const isStraight = (rankValues[2] - rankValues[1] === 1 && rankValues[1] - rankValues[0] === 1) ||
                       (rankValues[0] === 2 && rankValues[1] === 3 && rankValues[2] === 14); // A-2-3

    if (isFlush && isStraight) return 40;

    // Three of a kind - 30:1
    if (ranks[0] === ranks[1] && ranks[1] === ranks[2]) return 30;

    // Straight - 10:1
    if (isStraight) return 10;

    // Flush - 5:1
    if (isFlush) return 5;

    return 0;
}

function calculatePerfectPairsPayout(playerHand) {
    if (!playerHand || playerHand.length < 2) return 0;

    const card1 = playerHand[0];
    const card2 = playerHand[1];

    if (card1.rank !== card2.rank) return 0;

    // Perfect pair (same rank, same suit) - 25:1
    if (card1.suit === card2.suit) return 25;

    // Colored pair (same rank, same color) - 12:1
    const isRed1 = card1.suit === 'hearts' || card1.suit === 'diamonds';
    const isRed2 = card2.suit === 'hearts' || card2.suit === 'diamonds';
    if (isRed1 === isRed2) return 12;

    // Mixed pair (same rank, different color) - 6:1
    return 6;
}

// ============================================================================
// PLAYER ACTIONS
// ============================================================================

async function playerHit(seatNum) {
    if (!currentTableId || !tableState) return;

    const tableRef = doc(db, 'blackjack-tables', currentTableId);
    let shouldCheckDealer = false;

    await runTransaction(db, async (transaction) => {
        const tableDoc = await transaction.get(tableRef);
        if (!tableDoc.exists()) return;

        const data = tableDoc.data();
        const seat = data.seats[seatNum];

        if (!seat || seat.userId !== currentUser.uid || seat.status !== 'playing') return;

        const newCard = drawCardFromDeck(data.deck);
        if (newCard) {
            seat.hand.push(newCard);

            const total = handTotal(seat.hand);
            if (total > 21) {
                seat.status = 'bust';
                shouldCheckDealer = true;
            } else if (total === 21) {
                seat.status = 'standing';
                shouldCheckDealer = true;
            }

            transaction.update(tableRef, data);
        }
    });

    if (shouldCheckDealer) {
        setTimeout(() => checkDealerTurn(), 500);
    }
}

async function playerStand(seatNum) {
    if (!currentTableId || !tableState) return;

    const tableRef = doc(db, 'blackjack-tables', currentTableId);
    let shouldCheckDealer = false;

    await runTransaction(db, async (transaction) => {
        const tableDoc = await transaction.get(tableRef);
        if (!tableDoc.exists()) return;

        const data = tableDoc.data();
        const seat = data.seats[seatNum];

        if (!seat || seat.userId !== currentUser.uid || seat.status !== 'playing') return;

        seat.status = 'standing';
        shouldCheckDealer = true;
        transaction.update(tableRef, data);
    });

    if (shouldCheckDealer) {
        setTimeout(() => checkDealerTurn(), 500);
    }
}

async function playerDouble(seatNum) {
    if (!currentTableId || !tableState) return;

    const seat = tableState.seats[seatNum];
    if (!seat || seat.hand.length !== 2) return;

    const additionalBet = seat.bet;  // Need to add same amount
    if (balance < additionalBet) {
        alert('Solde insuffisant pour doubler');
        return;
    }

    try {
        // CRITICAL FIX: Deduct the additional bet for doubling
        await applyGameResult(currentUser.uid, {
            betAmount: additionalBet,
            payout: 0,
            game: 'blackjack',
            metadata: {
                action: 'double_down',
                tableId: currentTableId,
                seatNumber: seatNum
            }
        });

        const tableRef = doc(db, 'blackjack-tables', currentTableId);
        await runTransaction(db, async (transaction) => {
            const tableDoc = await transaction.get(tableRef);
            if (!tableDoc.exists()) return;

            const data = tableDoc.data();
            const seat = data.seats[seatNum];

            if (!seat || seat.userId !== currentUser.uid || seat.status !== 'playing') return;

            seat.bet = seat.bet * 2;  // Double the bet
            const newCard = drawCardFromDeck(data.deck);
            if (newCard) {
                seat.hand.push(newCard);

                const total = handTotal(seat.hand);
                seat.status = total > 21 ? 'bust' : 'standing';

                transaction.update(tableRef, data);
            }
        });

        // Check if we need to start dealer turn
        setTimeout(() => checkDealerTurn(), 500);
    } catch (error) {
        console.error('Error doubling down:', error);
        alert('Erreur lors du doublement de la mise.');
    }
}

// ============================================================================
// DEALER TURN & GAME RESOLUTION
// ============================================================================

async function checkDealerTurn() {
    if (!currentTableId || !tableState) return;
    if (tableState.state !== 'playing') return;

    // Check if all players are done
    const allPlayersDone = Object.values(tableState.seats || {}).every(seat => {
        return !seat || seat.status !== 'playing';
    });

    if (allPlayersDone) {
        await dealerTurn();
    }
}

async function dealerTurn() {
    if (!currentTableId) return;

    const tableRef = doc(db, 'blackjack-tables', currentTableId);

    await runTransaction(db, async (transaction) => {
        const tableDoc = await transaction.get(tableRef);
        if (!tableDoc.exists()) return;

        const data = tableDoc.data();
        data.state = 'dealer-turn';

        // Dealer draws to 17
        let dealerTotal = handTotal(data.dealerHand);
        while (dealerTotal < 17) {
            const newCard = drawCardFromDeck(data.deck);
            if (newCard) {
                data.dealerHand.push(newCard);
                dealerTotal = handTotal(data.dealerHand);
            } else {
                break;
            }
        }

        transaction.update(tableRef, data);
    });

    // Resolve all hands after dealer turn
    setTimeout(() => resolveAllHands(), 1000);
}

async function resolveAllHands() {
    if (!currentTableId || !tableState) return;

    const tableRef = doc(db, 'blackjack-tables', currentTableId);
    const dealerTotal = handTotal(tableState.dealerHand);
    const dealerBust = dealerTotal > 21;

    // Process each seat
    for (const seatNum in tableState.seats) {
        const seat = tableState.seats[seatNum];
        if (!seat || !seat.userId) continue;

        const playerTotal = handTotal(seat.hand);
        const playerBust = seat.status === 'bust' || playerTotal > 21;

        let mainPayout = 0;
        let resultType = 'loss';

        // IMPROVED: Better blackjack and payout logic
        const playerHasBlackjack = playerTotal === 21 && seat.hand.length === 2;
        const dealerHasBlackjack = handTotal(tableState.dealerHand) === 21 && tableState.dealerHand.length === 2;

        // Main bet resolution
        if (playerBust) {
            resultType = 'loss';
            mainPayout = 0;
        } else if (playerHasBlackjack && dealerHasBlackjack) {
            // Both have blackjack - push (return bet only)
            resultType = 'push';
            mainPayout = seat.bet;
        } else if (playerHasBlackjack) {
            // Player blackjack wins - 3:2 payout (bet + 1.5x bet)
            resultType = 'win';
            mainPayout = seat.bet + (seat.bet * 1.5);
        } else if (dealerBust) {
            // Dealer busts, player wins - 1:1 payout
            resultType = 'win';
            mainPayout = seat.bet * 2;
        } else if (playerTotal > dealerTotal) {
            // Player wins - 1:1 payout
            resultType = 'win';
            mainPayout = seat.bet * 2;
        } else if (playerTotal === dealerTotal) {
            // Push - return bet
            resultType = 'push';
            mainPayout = seat.bet;
        } else {
            // Player loses
            resultType = 'loss';
            mainPayout = 0;
        }

        // Side bets resolution - FIXED: Side bets are independent of main bet
        let sideBetsPayout = 0;

        // 21+3 side bet - Evaluated on initial 2 cards + dealer upcard
        if (seat.sideBet21Plus3 > 0 && tableState.dealerHand.length >= 1 && seat.hand.length >= 2) {
            const multiplier = calculate21Plus3Payout(seat.hand, tableState.dealerHand[0]);
            if (multiplier > 0) {
                // Side bet wins: return bet + winnings
                sideBetsPayout += seat.sideBet21Plus3 * (multiplier + 1);
            }
            // If multiplier = 0, side bet is lost (already deducted)
        }

        // Perfect Pairs side bet - Evaluated only on initial 2 cards
        if (seat.sideBetPerfectPairs > 0 && seat.hand.length >= 2) {
            const multiplier = calculatePerfectPairsPayout(seat.hand);
            if (multiplier > 0) {
                // Side bet wins: return bet + winnings
                sideBetsPayout += seat.sideBetPerfectPairs * (multiplier + 1);
            }
            // If multiplier = 0, side bet is lost (already deducted)
        }

        const totalPayout = mainPayout + sideBetsPayout;
        const betAmount = seat.bet + (seat.sideBet21Plus3 || 0) + (seat.sideBetPerfectPairs || 0);
        // CRITICAL FIX: Since bets were already deducted, profit = payout only
        const profit = totalPayout;

        // Apply result to user balance (only for current user's seats)
        if (seat.userId === currentUser.uid) {
            try {
                // Only add the payout back (bet was already deducted in readyToPlay)
                if (totalPayout > 0) {
                    await applyGameResult(currentUser.uid, {
                        betAmount: 0,  // Already deducted
                        payout: totalPayout,  // Add back winnings
                        game: 'blackjack',
                        metadata: {
                            action: 'payout',
                            result: resultType,
                            seatNumber: seatNum,
                            blackjack: playerTotal === 21 && seat.hand.length === 2,
                            sideBets: {
                                '21plus3': seat.sideBet21Plus3 || 0,
                                perfectPairs: seat.sideBetPerfectPairs || 0
                            }
                        }
                    });
                }

                // Log result with correct profit calculation
                const actualProfit = totalPayout - betAmount;
                logResult(resultType, betAmount, actualProfit);

                // Update stats
                stats.handsPlayed += 1;
                if (resultType === 'win') {
                    stats.handsWon += 1;
                }
                if (playerTotal === 21 && seat.hand.length === 2 && resultType === 'win') {
                    stats.blackjacks += 1;
                }
                stats.totalProfit += actualProfit;
                updateStatsDisplay();
            } catch (error) {
                console.error('Error applying game result:', error);
            }
        }
    }

    // Reset table after 3 seconds
    setTimeout(() => resetTable(), 3000);
}

async function resetTable() {
    if (!currentTableId) return;

    const tableRef = doc(db, 'blackjack-tables', currentTableId);

    await runTransaction(db, async (transaction) => {
        const tableDoc = await transaction.get(tableRef);
        if (!tableDoc.exists()) return;

        const data = tableDoc.data();

        // Manage inactive players - IMPROVED: Give more time before removing
        const seatsToRemove = [];
        Object.keys(data.seats).forEach(seatNum => {
            const seat = data.seats[seatNum];
            if (seat) {
                if (seat.status === 'waiting') {
                    seat.inactiveRounds = (seat.inactiveRounds || 0) + 1;
                    // IMPROVED: Remove only after 3 inactive rounds instead of 2
                    if (seat.inactiveRounds >= 3) {
                        seatsToRemove.push(seatNum);
                    }
                } else {
                    // Reset for next round
                    seat.hand = [];
                    seat.status = 'waiting';
                    seat.bet = 0;
                    seat.sideBet21Plus3 = 0;
                    seat.sideBetPerfectPairs = 0;
                    seat.betsDeducted = false;  // Reset deduction flag
                }
            }
        });

        // Remove inactive seats
        seatsToRemove.forEach(seatNum => {
            delete data.seats[seatNum];
        });

        // Update my local seats list
        if (currentUser) {
            mySeats = mySeats.filter(seatNum => !seatsToRemove.includes(seatNum.toString()));
        }

        // Reset table state
        data.dealerHand = [];

        // Check if there are still players at the table
        const hasPlayers = Object.keys(data.seats).length > 0;

        if (hasPlayers) {
            // IMPROVED: Start new betting round automatically
            data.state = 'betting';
            data.bettingTimer = {
                startTime: serverTimestamp(),
                duration: BETTING_TIMER_DURATION
            };
        } else {
            // No players, go to waiting state
            data.state = 'waiting';
            data.bettingTimer = null;
        }

        data.lastActivity = serverTimestamp();
        transaction.update(tableRef, data);
    });

    // IMPROVED: Auto-rebet if enabled
    if (autoRebetEnabled && Object.keys(lastBets).length > 0) {
        setTimeout(() => {
            applyAutoRebet();
        }, 500); // Small delay to let the UI update
    }
}

// Apply saved bets automatically
async function applyAutoRebet() {
    if (!currentTableId || !tableState || tableState.state !== 'betting') return;
    if (mySeats.length === 0) return;

    const tableRef = doc(db, 'blackjack-tables', currentTableId);

    try {
        await runTransaction(db, async (transaction) => {
            const tableDoc = await transaction.get(tableRef);
            if (!tableDoc.exists()) return;

            const data = tableDoc.data();
            if (data.state !== 'betting') return;

            // Apply last bets to all my seats
            let allBetsValid = true;
            mySeats.forEach(seatNum => {
                if (data.seats[seatNum] && lastBets[seatNum]) {
                    const lastBet = lastBets[seatNum];
                    data.seats[seatNum].bet = lastBet.bet;
                    data.seats[seatNum].sideBet21Plus3 = lastBet.sideBet21Plus3;
                    data.seats[seatNum].sideBetPerfectPairs = lastBet.sideBetPerfectPairs;
                }
            });

            transaction.update(tableRef, data);
        });

        // Auto-ready after applying bets
        setTimeout(() => {
            if (tableState && tableState.state === 'betting') {
                readyToPlay();
            }
        }, 100);
    } catch (error) {
        console.error('Error applying auto-rebet:', error);
    }
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

// ============================================================================
// PLAYER ACTION MANAGEMENT
// ============================================================================

function setupPlayerActionListeners() {
    if (!tableState || !currentUser) return;

    // Find the first seat that's in 'playing' status and belongs to current user
    const activeSeat = mySeats.find(seatNum => {
        const seat = tableState.seats[seatNum];
        return seat && seat.status === 'playing' && seat.userId === currentUser.uid;
    });

    if (activeSeat) {
        elements.actionControls.style.display = 'block';
        elements.currentSeatNumber.textContent = activeSeat;

        const seat = tableState.seats[activeSeat];
        const canDouble = seat.hand.length === 2 && balance >= seat.bet * 2;

        elements.hitBtn.disabled = false;
        elements.standBtn.disabled = false;
        elements.doubleBtn.disabled = !canDouble;

        // Remove old listeners
        const newHitBtn = elements.hitBtn.cloneNode(true);
        const newStandBtn = elements.standBtn.cloneNode(true);
        const newDoubleBtn = elements.doubleBtn.cloneNode(true);

        elements.hitBtn.parentNode.replaceChild(newHitBtn, elements.hitBtn);
        elements.standBtn.parentNode.replaceChild(newStandBtn, elements.standBtn);
        elements.doubleBtn.parentNode.replaceChild(newDoubleBtn, elements.doubleBtn);

        elements.hitBtn = newHitBtn;
        elements.standBtn = newStandBtn;
        elements.doubleBtn = newDoubleBtn;

        // Add new listeners
        elements.hitBtn.addEventListener('click', () => {
            playerHit(activeSeat);
        });

        elements.standBtn.addEventListener('click', () => {
            playerStand(activeSeat);
            setTimeout(() => checkDealerTurn(), 500);
        });

        elements.doubleBtn.addEventListener('click', () => {
            playerDouble(activeSeat);
        });
    } else {
        elements.actionControls.style.display = 'none';
    }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
    elements.backToLobbyBtn.addEventListener('click', leaveTable);

    elements.dealBtn.addEventListener('click', readyToPlay);

    // Auto-rebet toggle
    const autoRebetToggle = document.getElementById('autoRebetToggle');
    if (autoRebetToggle) {
        autoRebetToggle.addEventListener('change', (e) => {
            autoRebetEnabled = e.target.checked;
            console.log('Auto-rebet:', autoRebetEnabled ? 'enabled' : 'disabled');
        });
    }

    // Chip selection
    document.querySelectorAll('.chip-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedChipValue = parseInt(btn.getAttribute('data-value'));

            // Update UI
            document.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');

            // Update side bet buttons if visible
            if (mySeats.length > 0) {
                renderActiveSeatsBetting();
            }
        });
    });

    // Set default selected chip
    const defaultChipBtn = document.querySelector('.chip-btn[data-value="10"]');
    if (defaultChipBtn) {
        defaultChipBtn.classList.add('selected');
    }

    // Clear all bets button
    const clearBetsBtn = document.getElementById('clearBetsBtn');
    if (clearBetsBtn) {
        clearBetsBtn.addEventListener('click', async () => {
            for (const seatNum of mySeats) {
                await updateSeatBet(seatNum, 0);
                await updateSideBet(seatNum, '21plus3', 0);
                await updateSideBet(seatNum, 'perfectpairs', 0);
            }
        });
    }

    elements.depositBtn.addEventListener('click', async () => {
        if (!currentUser) {
            alert('Veuillez vous connecter');
            return;
        }
        const amount = prompt('Montant à déposer (€):');
        const depositAmount = parseFloat(amount);
        if (amount && !isNaN(depositAmount) && depositAmount > 0) {
            alert(`${depositAmount.toFixed(2)} € ajoutés à votre solde!`);
        }
    });

    elements.logoutBtn.addEventListener('click', async () => {
        try {
            if (unsubscribeUser) unsubscribeUser();
            if (unsubscribeTable) unsubscribeTable();
            await signOut(auth);
            window.location.href = 'pages/auth/login.html';
        } catch (error) {
            console.error('Error signing out:', error);
        }
    });

    // Side bets toggles
    elements.enable21Plus3.addEventListener('change', () => {
        if (mySeats.length > 0) {
            renderActiveSeatsBetting();
        }
    });

    elements.enablePerfectPairs.addEventListener('change', () => {
        if (mySeats.length > 0) {
            renderActiveSeatsBetting();
        }
    });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function init() {
    renderLobby();
    setupEventListeners();
    updateStatsDisplay();
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'pages/auth/login.html';
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
            return;
        }
        balance = data.balance;
        balanceLoaded = true;
        updateBalanceDisplay();
        syncStatsFromUser(data);
    });
});

init();
