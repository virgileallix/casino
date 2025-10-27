import { auth, signOut, onAuthStateChanged } from './firebase-config.js';
import { initializeUserBalance, subscribeToUserData, applyGameResult } from './balance-manager.js';

const ROULETTE_SEQUENCE = [
    { number: 0, color: 'green' },
    { number: 32, color: 'red' },
    { number: 15, color: 'black' },
    { number: 19, color: 'red' },
    { number: 4, color: 'black' },
    { number: 21, color: 'red' },
    { number: 2, color: 'black' },
    { number: 25, color: 'red' },
    { number: 17, color: 'black' },
    { number: 34, color: 'red' },
    { number: 6, color: 'black' },
    { number: 27, color: 'red' },
    { number: 13, color: 'black' },
    { number: 36, color: 'red' },
    { number: 11, color: 'black' },
    { number: 30, color: 'red' },
    { number: 8, color: 'black' },
    { number: 23, color: 'red' },
    { number: 10, color: 'black' },
    { number: 5, color: 'red' },
    { number: 24, color: 'black' },
    { number: 16, color: 'red' },
    { number: 33, color: 'black' },
    { number: 1, color: 'red' },
    { number: 20, color: 'black' },
    { number: 14, color: 'red' },
    { number: 31, color: 'black' },
    { number: 9, color: 'red' },
    { number: 22, color: 'black' },
    { number: 18, color: 'red' },
    { number: 29, color: 'black' },
    { number: 7, color: 'red' },
    { number: 28, color: 'black' },
    { number: 12, color: 'red' },
    { number: 35, color: 'black' },
    { number: 3, color: 'red' },
    { number: 26, color: 'black' }
];

const NUMBER_COLOR_MAP = new Map(ROULETTE_SEQUENCE.map((entry) => [entry.number, entry.color]));
NUMBER_COLOR_MAP.set(0, 'green');

const BOARD_LAYOUT = [
    [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
    [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
    [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]
];

const CHIP_VALUES = [0.1, 0.5, 1, 5, 10, 25, 50, 100];
const STRAIGHT_MULTIPLIER = 36;

let currentUser = null;
let unsubscribeBalance = null;
let balance = 0;
let balanceLoaded = false;
let isSpinning = false;
let selectedChip = 1;

const bets = new Map();
const cellRefs = new Map();

const stats = {
    games: 0,
    wins: 0,
    profit: 0,
    bestWin: 0
};

const history = [];
const MAX_HISTORY = 12;

const elements = {
    wheel: document.getElementById('rouletteWheel'),
    ball: document.getElementById('rouletteBall'),
    resultsHistory: document.getElementById('resultsHistory'),
    lastResult: document.getElementById('lastResult'),
    chipsList: document.getElementById('chipsList'),
    selectedChipDisplay: document.getElementById('selectedChipDisplay'),
    table: document.getElementById('rouletteTable'),
    totalBet: document.getElementById('totalBetDisplay'),
    maxWin: document.getElementById('maxWinDisplay'),
    betCount: document.getElementById('betCountDisplay'),
    clearBets: document.getElementById('clearBets'),
    spinButton: document.getElementById('spinButton'),
    statGames: document.getElementById('statGames'),
    statWins: document.getElementById('statWins'),
    statProfit: document.getElementById('statProfit'),
    statBestWin: document.getElementById('statBestWin'),
    userBalance: document.getElementById('userBalance')
};

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    currentUser = user;
    await initializeUserBalance(user);

    if (unsubscribeBalance) {
        unsubscribeBalance();
    }

    unsubscribeBalance = subscribeToUserData(user.uid, (data) => {
        if (!data) {
            balanceLoaded = false;
            updateBalanceDisplay(0);
            return;
        }

        balanceLoaded = true;
        balance = data.balance;
        updateBalanceDisplay(balance);
    });

    initializePage();
});

function initializePage() {
    buildWheelNumbers();
    buildChipButtons();
    buildTable();
    setupEvents();
    updateSummary();
    updateStatsDisplay();
}

function buildWheelNumbers() {
    if (!elements.wheel) return;
    elements.wheel.style.background = buildWheelGradient();
    elements.wheel.dataset.rotation = '0';
    elements.wheel.querySelectorAll('.wheel-number').forEach((node) => node.remove());

    ROULETTE_SEQUENCE.forEach((entry, index) => {
        const angle = -90 + (360 / ROULETTE_SEQUENCE.length) * index;
        const node = document.createElement('div');
        node.className = `wheel-number ${entry.color}`;
        node.style.transform = `rotate(${angle}deg) translateY(-130px) rotate(${-angle}deg)`;

        const text = document.createElement('span');
        text.textContent = entry.number.toString();
        node.appendChild(text);
        elements.wheel.appendChild(node);
    });

    if (elements.ball) {
        elements.ball.addEventListener('animationend', () => {
            elements.ball.classList.remove('spinning');
        });
    }
}

function buildWheelGradient() {
    const segmentAngle = 360 / ROULETTE_SEQUENCE.length;
    const startOffset = -90 - (segmentAngle / 2);

    const segments = ROULETTE_SEQUENCE.map((entry, index) => {
        const color = entry.color === 'red'
            ? '#b81e33'
            : entry.color === 'black'
                ? '#141218'
                : '#0f9f5a';
        const start = startOffset + index * segmentAngle;
        const end = start + segmentAngle;
        return `${color} ${start.toFixed(4)}deg ${end.toFixed(4)}deg`;
    });

    return `conic-gradient(from ${startOffset.toFixed(4)}deg, ${segments.join(', ')})`;
}

function buildChipButtons() {
    if (!elements.chipsList) return;
    elements.chipsList.innerHTML = '';

    CHIP_VALUES.forEach((value, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'chip-button';
        button.dataset.value = value.toString();
        button.textContent = `${value.toFixed(2)} €`;
        if (index === 2) {
            button.classList.add('active');
            selectedChip = value;
        }
        button.addEventListener('click', () => selectChip(button, value));
        elements.chipsList.appendChild(button);
    });

    elements.selectedChipDisplay.textContent = formatCurrency(selectedChip);
}

function selectChip(button, value) {
    if (isSpinning) return;
    selectedChip = value;
    elements.selectedChipDisplay.textContent = formatCurrency(selectedChip);
    elements.chipsList.querySelectorAll('.chip-button').forEach((btn) => btn.classList.remove('active'));
    button.classList.add('active');
}

function buildTable() {
    if (!elements.table) return;
    elements.table.innerHTML = '';
    cellRefs.clear();

    // Zero cell
    const zeroCell = createCell({
        key: 'number-0',
        label: '0',
        numbers: [0],
        multiplier: STRAIGHT_MULTIPLIER,
        classes: ['number', 'green'],
        gridColumn: '1 / span 1',
        gridRow: '1 / span 3'
    });
    elements.table.appendChild(zeroCell);

    // Number grid
    BOARD_LAYOUT.forEach((rowNumbers, rowIndex) => {
        rowNumbers.forEach((number, colIndex) => {
            const color = NUMBER_COLOR_MAP.get(number) || 'red';
            const cell = createCell({
                key: `number-${number}`,
                label: number.toString(),
                numbers: [number],
                multiplier: STRAIGHT_MULTIPLIER,
                classes: ['number', color],
                gridColumn: `${colIndex + 2} / span 1`,
                gridRow: `${rowIndex + 1}`
            });
            elements.table.appendChild(cell);
        });
    });

    // Column bets (2:1)
    BOARD_LAYOUT.forEach((rowNumbers, rowIndex) => {
        const cell = createCell({
            key: `column-${rowIndex + 1}`,
            label: '2:1',
            numbers: rowNumbers,
            multiplier: 3,
            classes: ['outside', 'column-bet'],
            gridColumn: '14',
            gridRow: `${rowIndex + 1}`
        });
        elements.table.appendChild(cell);
    });

    // Dozens (row 4)
    const dozens = [
        { key: 'dozen-1', label: '1ère 12', start: 1, end: 12 },
        { key: 'dozen-2', label: '2ème 12', start: 13, end: 24 },
        { key: 'dozen-3', label: '3ème 12', start: 25, end: 36 }
    ];

    dozens.forEach((dozen, index) => {
        const cell = createCell({
            key: dozen.key,
            label: dozen.label,
            numbers: range(dozen.start, dozen.end),
            multiplier: 3,
            classes: ['outside'],
            gridColumn: `${index * 4 + 2} / span 4`,
            gridRow: '4'
        });
        elements.table.appendChild(cell);
    });

    // Even money bets row (row 5)
    const evenMoney = [
        {
            key: 'low', label: '1 - 18', numbers: range(1, 18), multiplier: 2,
            classes: ['outside'], column: '2 / span 3'
        },
        {
            key: 'even', label: 'Pair', numbers: getEvenNumbers(), multiplier: 2,
            classes: ['outside'], column: '5 / span 2'
        },
        {
            key: 'red', label: 'Rouge', numbers: getColorNumbers('red'), multiplier: 2,
            classes: ['outside', 'red-bet'], column: '7 / span 2'
        },
        {
            key: 'black', label: 'Noir', numbers: getColorNumbers('black'), multiplier: 2,
            classes: ['outside', 'black-bet'], column: '9 / span 2'
        },
        {
            key: 'odd', label: 'Impair', numbers: getOddNumbers(), multiplier: 2,
            classes: ['outside'], column: '11 / span 2'
        },
        {
            key: 'high', label: '19 - 36', numbers: range(19, 36), multiplier: 2,
            classes: ['outside'], column: '13 / span 2'
        }
    ];

    evenMoney.forEach((bet) => {
        const cell = createCell({
            key: bet.key,
            label: bet.label,
            numbers: bet.numbers,
            multiplier: bet.multiplier,
            classes: bet.classes,
            gridColumn: bet.column,
            gridRow: '5'
        });
        elements.table.appendChild(cell);
    });
}

function createCell({ key, label, numbers, multiplier, classes, gridColumn, gridRow }) {
    const cell = document.createElement('div');
    cell.className = ['table-cell', ...(classes || [])].join(' ');
    cell.textContent = label;
    cell.dataset.betKey = key;
    cell.dataset.numbers = numbers.join(',');
    cell.dataset.multiplier = multiplier.toString();
    cell.dataset.label = label;
    if (gridColumn) cell.style.gridColumn = gridColumn;
    if (gridRow) cell.style.gridRow = gridRow;

    cell.addEventListener('click', () => handleCellClick(cell));
    cell.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        removeBet(cell.dataset.betKey);
    });

    cellRefs.set(key, cell);
    return cell;
}

function setupEvents() {
    elements.clearBets?.addEventListener('click', () => {
        if (isSpinning) return;
        clearBets();
    });

    elements.spinButton?.addEventListener('click', spinRoulette);

    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        try {
            if (unsubscribeBalance) {
                unsubscribeBalance();
            }
            await signOut(auth);
            window.location.href = 'login.html';
        } catch (error) {
            console.error('Erreur lors de la déconnexion:', error);
        }
    });
}

function handleCellClick(cell) {
    if (isSpinning) return;
    const key = cell.dataset.betKey;
    const numbers = (cell.dataset.numbers || '').split(',').map((n) => parseInt(n, 10)).filter(Number.isFinite);
    const multiplier = parseFloat(cell.dataset.multiplier || '0');
    if (!key || !numbers.length || !Number.isFinite(multiplier)) return;

    addBet(key, {
        label: cell.dataset.label || key,
        numbers,
        multiplier,
        cell
    });
}

function addBet(key, config) {
    const amountToAdd = selectedChip;
    if (!Number.isFinite(amountToAdd) || amountToAdd <= 0) return;

    const existing = bets.get(key) || {
        key,
        label: config.label,
        numbers: config.numbers,
        multiplier: config.multiplier,
        amount: 0,
        cell: config.cell
    };

    existing.amount = parseFloat((existing.amount + amountToAdd).toFixed(2));
    existing.cell.classList.add('active');
    updateBetChip(existing);
    bets.set(key, existing);
    updateSummary();
}

function removeBet(key) {
    const bet = bets.get(key);
    if (!bet) return;

    bet.cell.classList.remove('active', 'winner');
    const chip = bet.cell.querySelector('.bet-chip');
    if (chip) {
        chip.remove();
    }
    bets.delete(key);
    updateSummary();
}

function updateBetChip(bet) {
    let chip = bet.cell.querySelector('.bet-chip');
    if (!chip) {
        chip = document.createElement('div');
        chip.className = 'bet-chip';
        bet.cell.appendChild(chip);
    }
    chip.textContent = formatCurrency(bet.amount);
}

function clearBets() {
    bets.forEach((bet) => {
        bet.cell.classList.remove('active', 'winner');
        const chip = bet.cell.querySelector('.bet-chip');
        if (chip) {
            chip.remove();
        }
    });
    bets.clear();
    updateSummary();
}

function updateSummary() {
    const total = Array.from(bets.values()).reduce((sum, bet) => sum + bet.amount, 0);
    const maxWin = bets.size
        ? Math.max(...Array.from(bets.values()).map((bet) => bet.amount * bet.multiplier))
        : 0;

    elements.totalBet.textContent = formatCurrency(total);
    elements.maxWin.textContent = formatCurrency(maxWin);
    elements.betCount.textContent = bets.size.toString();
}

async function spinRoulette() {
    if (isSpinning) return;
    if (!bets.size) {
        alert('Place au moins une mise sur le tapis.');
        return;
    }

    const totalBet = Array.from(bets.values()).reduce((sum, bet) => sum + bet.amount, 0);

    if (!balanceLoaded || totalBet > balance) {
        alert('Solde insuffisant pour cette mise.');
        return;
    }

    isSpinning = true;
    elements.spinButton.disabled = true;

    const resultIndex = getRandomIndex();
    const result = ROULETTE_SEQUENCE[resultIndex];

    animateSpin(resultIndex);
    animateBall();

    await waitForAnimationEnd();

    const { payout, winningBets } = evaluateBets(result.number);
    await applyOutcome(totalBet, payout, result, winningBets);

    updateUIAfterResult(result, totalBet, payout, winningBets);

    elements.spinButton.disabled = false;
    isSpinning = false;
}

function evaluateBets(resultNumber) {
    let payout = 0;
    const winningBets = [];

    bets.forEach((bet) => {
        const win = bet.numbers.includes(resultNumber);
        if (win) {
            const winAmount = bet.amount * bet.multiplier;
            payout += winAmount;
            winningBets.push({ bet, winAmount });
        }
    });

    return { payout: parseFloat(payout.toFixed(2)), winningBets };
}

async function applyOutcome(totalBet, payout, result, winningBets) {
    if (!currentUser) return;

    try {
        const outcome = await applyGameResult(currentUser.uid, {
            betAmount: totalBet,
            payout,
            game: 'roulette',
            metadata: {
                bets: Array.from(bets.values()).map((bet) => ({
                    key: bet.key,
                    amount: bet.amount,
                    multiplier: bet.multiplier,
                    numbers: bet.numbers
                })),
                resultNumber: result.number,
                resultColor: result.color,
                winningBets: winningBets.map(({ bet, winAmount }) => ({
                    key: bet.key,
                    amount: bet.amount,
                    winAmount
                }))
            }
        });

        balance = outcome.balance;
        updateBalanceDisplay(balance);
    } catch (error) {
        console.error('Erreur lors de la mise à jour du solde:', error);
        if (error.message === 'INSUFFICIENT_FUNDS') {
            alert('Solde insuffisant pour cette mise.');
        } else {
            alert('Impossible de mettre à jour le solde. Veuillez réessayer.');
        }
    }
}

function updateUIAfterResult(result, totalBet, payout, winningBets) {
    updateLastResultDisplay(result);
    addToHistory(result);
    updateHistoryDisplay();

    const profit = parseFloat((payout - totalBet).toFixed(2));
    stats.games += 1;
    stats.profit = parseFloat((stats.profit + profit).toFixed(2));
    if (profit > 0) {
        stats.wins += 1;
    }
    stats.bestWin = Math.max(stats.bestWin, payout);
    updateStatsDisplay();

    highlightWinningCells(winningBets.map(({ bet }) => bet.cell));
    showResultNotification(result, totalBet, payout, profit);

    setTimeout(() => {
        clearBets();
    }, 1200);
}

function highlightWinningCells(cells) {
    cells.forEach((cell) => cell.classList.add('winner'));
    setTimeout(() => {
        cells.forEach((cell) => cell.classList.remove('winner'));
    }, 2200);
}

function animateSpin(resultIndex) {
    if (!elements.wheel) return;

    const previousRotation = parseFloat(elements.wheel.dataset.rotation ?? '0');
    const normalizedPrevious = normalizeAngle(previousRotation);
    const segmentAngle = 360 / ROULETTE_SEQUENCE.length;
    const targetAngle = -resultIndex * segmentAngle;
    const normalizedTarget = normalizeAngle(targetAngle);
    const delta = normalizedTarget - normalizedPrevious;
    const totalRotation = previousRotation + (4 * 360) + delta;

    elements.wheel.dataset.rotation = totalRotation.toString();
    elements.wheel.style.transition = 'transform 3.8s cubic-bezier(0.15, 0.85, 0.25, 1)';
    elements.wheel.style.transform = `rotate(${totalRotation}deg)`;
}

function animateBall() {
    if (!elements.ball) return;
    elements.ball.classList.remove('spinning');
    void elements.ball.offsetWidth;
    elements.ball.classList.add('spinning');
}

function waitForAnimationEnd() {
    return new Promise((resolve) => {
        if (!elements.wheel) {
            resolve();
            return;
        }
        const handler = () => resolve();
        elements.wheel.addEventListener('transitionend', handler, { once: true });
    });
}

function updateLastResultDisplay(result) {
    if (!elements.lastResult) return;
    const numberEl = elements.lastResult.querySelector('.result-number');
    const colorEl = elements.lastResult.querySelector('.result-color');

    if (numberEl) {
        numberEl.textContent = result.number.toString().padStart(2, '0');
    }

    if (colorEl) {
        colorEl.textContent = colorToLabel(result.color);
        colorEl.className = `result-color ${result.color}`;
    }
}

function addToHistory(result) {
    history.unshift(result);
    if (history.length > MAX_HISTORY) {
        history.pop();
    }
}

function updateHistoryDisplay() {
    if (!elements.resultsHistory) return;
    elements.resultsHistory.innerHTML = '';

    if (!history.length) {
        const empty = document.createElement('span');
        empty.className = 'empty-history';
        empty.textContent = 'Aucun tirage';
        elements.resultsHistory.appendChild(empty);
        return;
    }

    history.forEach((item) => {
        const chip = document.createElement('span');
        chip.className = `result-chip ${item.color}`;
        chip.textContent = item.number.toString();
        elements.resultsHistory.appendChild(chip);
    });
}

function updateStatsDisplay() {
    elements.statGames.textContent = stats.games.toString();
    elements.statWins.textContent = stats.wins.toString();
    elements.statProfit.textContent = formatCurrency(stats.profit);
    elements.statProfit.style.color = stats.profit >= 0 ? 'var(--accent-primary)' : 'var(--error-color)';
    elements.statBestWin.textContent = formatCurrency(stats.bestWin);
}

function showResultNotification(result, totalBet, payout, profit) {
    const toast = document.createElement('div');
    toast.className = 'roulette-toast';

    if (profit > 0) {
        toast.textContent = `🎉 ${result.number} ${colorToLabel(result.color)} • +${formatCurrency(profit)} (gain ${formatCurrency(payout)})`;
    } else if (profit < 0) {
        toast.textContent = `💥 ${result.number} ${colorToLabel(result.color)} • -${formatCurrency(Math.abs(profit))}`;
    } else {
        toast.textContent = `➖ ${result.number} ${colorToLabel(result.color)} • Mise remboursée`;
    }

    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));

    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 220);
    }, 2600);
}

function updateBalanceDisplay(value) {
    if (elements.userBalance) {
        elements.userBalance.textContent = `${value.toFixed(2)} €`;
    }
}

function getRandomIndex() {
    if (window.crypto?.getRandomValues) {
        const buffer = new Uint32Array(1);
        window.crypto.getRandomValues(buffer);
        return buffer[0] % ROULETTE_SEQUENCE.length;
    }
    return Math.floor(Math.random() * ROULETTE_SEQUENCE.length);
}

function normalizeAngle(angle) {
    const normalized = angle % 360;
    return normalized < 0 ? normalized + 360 : normalized;
}

function range(start, end) {
    const numbers = [];
    for (let i = start; i <= end; i++) {
        numbers.push(i);
    }
    return numbers;
}

function getEvenNumbers() {
    const numbers = [];
    for (let i = 2; i <= 36; i += 2) {
        numbers.push(i);
    }
    return numbers;
}

function getOddNumbers() {
    const numbers = [];
    for (let i = 1; i <= 36; i += 2) {
        numbers.push(i);
    }
    return numbers;
}

function getColorNumbers(color) {
    return ROULETTE_SEQUENCE.filter((entry) => entry.color === color).map((entry) => entry.number).filter((n) => n !== 0);
}

function colorToLabel(color) {
    switch (color) {
        case 'red':
            return 'Rouge';
        case 'black':
            return 'Noir';
        case 'green':
            return 'Vert';
        default:
            return color;
    }
}

function formatCurrency(value) {
    return `${value.toFixed(2)} €`;
}

// Toast style (injected once)
const toastStyleId = 'roulette-toast-style';
if (!document.getElementById(toastStyleId)) {
    const style = document.createElement('style');
    style.id = toastStyleId;
    style.textContent = `
        .roulette-toast {
            position: fixed;
            bottom: 28px;
            right: 28px;
            background: rgba(17, 24, 33, 0.9);
            border: 1px solid rgba(255, 255, 255, 0.08);
            color: var(--text-primary);
            padding: 0.8rem 1.15rem;
            border-radius: 12px;
            box-shadow: 0 14px 34px rgba(0, 0, 0, 0.56);
            opacity: 0;
            transform: translateY(12px);
            transition: opacity 0.22s ease, transform 0.22s ease;
            font-size: 0.95rem;
            z-index: 999;
        }
        .roulette-toast.visible {
            opacity: 1;
            transform: translateY(0);
        }
    `;
    document.head.appendChild(style);
}

window.addEventListener('beforeunload', () => {
    if (unsubscribeBalance) {
        unsubscribeBalance();
    }
});
