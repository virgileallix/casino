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

const SEGMENT_COUNT = ROULETTE_SEQUENCE.length;
const SEGMENT_ANGLE = 360 / SEGMENT_COUNT;
const WHEEL_SPIN_TURNS = 4;

const BET_CONFIG = {
    color: [
        { id: 'red', label: 'Rouge', multiplier: 2, colorClass: 'red' },
        { id: 'black', label: 'Noir', multiplier: 2, colorClass: 'black' }
    ],
    parity: [
        { id: 'even', label: 'Pair', multiplier: 2 },
        { id: 'odd', label: 'Impair', multiplier: 2 }
    ],
    range: [
        { id: 'low', label: '1 - 18', multiplier: 2 },
        { id: 'high', label: '19 - 36', multiplier: 2 }
    ],
    dozen: [
        { id: 'first', label: '1ère douzaine (1-12)', multiplier: 3 },
        { id: 'second', label: '2ème douzaine (13-24)', multiplier: 3 },
        { id: 'third', label: '3ème douzaine (25-36)', multiplier: 3 }
    ]
};

let currentUser = null;
let unsubscribeBalance = null;
let balance = 0;
let balanceLoaded = false;
let isSpinning = false;
let wheelRotation = 0;

const stats = {
    games: 0,
    wins: 0,
    profit: 0,
    bestWin: 0
};

const history = [];
const MAX_HISTORY = 12;

let currentBetType = 'color';
let currentBetOption = null;

const elements = {
    wheel: document.getElementById('rouletteWheel'),
    ball: document.getElementById('rouletteBall'),
    history: document.getElementById('resultsHistory'),
    lastResult: document.getElementById('lastResult'),
    potentialWin: document.getElementById('potentialWin'),
    payoutMultiplier: document.getElementById('payoutMultiplier'),
    betAmount: document.getElementById('betAmount'),
    quickButtons: document.querySelectorAll('.bet-quick-buttons button'),
    betTypeTabs: document.getElementById('betTypeTabs'),
    betOptions: document.getElementById('betOptions'),
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
    setupWheel();
    setupControls();
    updatePotentialWin();
    updateStatsDisplay();
}

function setupWheel() {
    if (!elements.wheel) return;
    elements.wheel.style.background = buildWheelGradient();
    elements.wheel.dataset.rotation = '0';
    renderWheelNumbers();

    if (elements.ball) {
        elements.ball.addEventListener('animationend', () => {
            elements.ball.classList.remove('spinning');
        });
    }
}

function buildWheelGradient() {
    const startOffset = -90 - (SEGMENT_ANGLE / 2);

    const segments = ROULETTE_SEQUENCE.map((entry, index) => {
        const color = entry.color === 'red'
            ? '#b81e33'
            : entry.color === 'black'
                ? '#141218'
                : '#0f9f5a';
        const start = startOffset + index * SEGMENT_ANGLE;
        const end = start + SEGMENT_ANGLE;
        return `${color} ${start.toFixed(4)}deg ${end.toFixed(4)}deg`;
    });

    return `conic-gradient(from ${startOffset.toFixed(4)}deg, ${segments.join(', ')})`;
}

function renderWheelNumbers() {
    if (!elements.wheel) return;
    elements.wheel.querySelectorAll('.wheel-number').forEach((node) => node.remove());

    ROULETTE_SEQUENCE.forEach((entry, index) => {
        const angle = -90 + index * SEGMENT_ANGLE;
        const numberEl = document.createElement('div');
        numberEl.className = `wheel-number ${entry.color}`;
        numberEl.style.transform = `rotate(${angle}deg) translateY(-138px) rotate(${-angle}deg)`;

        const span = document.createElement('span');
        span.textContent = entry.number.toString();
        numberEl.appendChild(span);

        elements.wheel.appendChild(numberEl);
    });
}

function setupControls() {
    elements.quickButtons.forEach((button) => {
        button.addEventListener('click', () => handleQuickBet(button.dataset.action));
    });

    elements.betAmount.addEventListener('input', () => {
        clampBetAmount();
        updatePotentialWin();
    });

    if (elements.betTypeTabs) {
        elements.betTypeTabs.querySelectorAll('button').forEach((tab) => {
            tab.addEventListener('click', () => {
                setActiveBetType(tab.dataset.type);
            });
        });
    }

    setActiveBetType('color');

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

function handleQuickBet(action) {
    const input = elements.betAmount;
    let value = parseFloat(input.value) || 0;

    switch (action) {
        case 'half':
            value = value / 2;
            break;
        case 'double':
            value = value * 2;
            break;
        case 'min':
            value = 0.10;
            break;
        case 'max':
            if (balanceLoaded) {
                value = balance;
            }
            break;
    }

    input.value = Math.max(0.1, value).toFixed(2);
    updatePotentialWin();
}

function clampBetAmount() {
    let value = parseFloat(elements.betAmount.value);
    if (Number.isNaN(value) || value <= 0) {
        elements.betAmount.value = '0.10';
        return;
    }
    elements.betAmount.value = value.toFixed(2);
}

function setActiveBetType(type) {
    if (!BET_CONFIG[type] && type !== 'number') {
        return;
    }

    currentBetType = type;
    if (elements.betTypeTabs) {
        elements.betTypeTabs.querySelectorAll('button').forEach((tab) => {
            tab.classList.toggle('active', tab.dataset.type === type);
        });
    }

    renderBetOptions();
    updatePotentialWin();
}

function renderBetOptions() {
    if (!elements.betOptions) return;
    elements.betOptions.innerHTML = '';

    if (currentBetType === 'number') {
        const wrapper = document.createElement('div');
        wrapper.className = 'number-input';

        const label = document.createElement('span');
        label.textContent = 'Choisissez un numéro (0-36)';
        label.style.fontSize = '0.85rem';
        label.style.color = 'var(--text-secondary)';

        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.max = '36';
        input.value = currentBetOption?.value?.toString() ?? '17';

        input.addEventListener('input', () => {
            const parsed = parseInt(input.value, 10);
            if (!Number.isFinite(parsed) || parsed < 0 || parsed > 36) {
                currentBetOption = null;
            } else {
                currentBetOption = {
                    type: 'number',
                    value: parsed,
                    multiplier: 36
                };
            }
            updatePotentialWin();
        });

        wrapper.appendChild(label);
        wrapper.appendChild(input);
        elements.betOptions.appendChild(wrapper);

        currentBetOption = {
            type: 'number',
            value: parseInt(input.value, 10),
            multiplier: 36
        };
        return;
    }

    const options = BET_CONFIG[currentBetType];
    if (!options?.length) return;

    const defaultOption = options[0];
    currentBetOption = {
        type: currentBetType,
        value: defaultOption.id,
        multiplier: defaultOption.multiplier
    };

    options.forEach((option) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.value = option.id;
        button.textContent = option.label;
        if (option.colorClass) {
            button.classList.add(option.colorClass);
        }
        button.classList.toggle('active', option.id === defaultOption.id);

        button.addEventListener('click', () => {
            elements.betOptions.querySelectorAll('button').forEach((btn) => btn.classList.remove('active'));
            button.classList.add('active');
            currentBetOption = {
                type: currentBetType,
                value: option.id,
                multiplier: option.multiplier
            };
            updatePotentialWin();
        });

        elements.betOptions.appendChild(button);
    });
}

function updateBalanceDisplay(value) {
    if (elements.userBalance) {
        elements.userBalance.textContent = `${value.toFixed(2)} €`;
    }
}

function updatePotentialWin() {
    if (!elements.potentialWin || !elements.payoutMultiplier) return;

    const betAmount = parseFloat(elements.betAmount.value);
    const multiplier = currentBetOption?.multiplier ?? 0;

    if (!betAmount || betAmount <= 0 || !multiplier) {
        elements.potentialWin.textContent = '0.00 €';
        elements.payoutMultiplier.textContent = '0.00x';
        return;
    }

    const potential = betAmount * multiplier;
    elements.potentialWin.textContent = `${potential.toFixed(2)} €`;
    elements.payoutMultiplier.textContent = `${multiplier.toFixed(2)}x`;
}

function getRandomIndex() {
    if (window.crypto?.getRandomValues) {
        const randomBuffer = new Uint32Array(1);
        window.crypto.getRandomValues(randomBuffer);
        return randomBuffer[0] % SEGMENT_COUNT;
    }
    return Math.floor(Math.random() * SEGMENT_COUNT);
}

async function spinRoulette() {
    if (isSpinning) {
        return;
    }

    const betAmount = parseFloat(elements.betAmount.value);
    if (!Number.isFinite(betAmount) || betAmount <= 0) {
        alert('Veuillez entrer une mise valide.');
        return;
    }

    if (!balanceLoaded || betAmount > balance) {
        alert('Solde insuffisant pour cette mise.');
        return;
    }

    if (!currentBetOption || (currentBetOption.type === 'number' && !Number.isFinite(currentBetOption.value))) {
        alert('Veuillez sélectionner un pari valide.');
        return;
    }

    isSpinning = true;
    elements.spinButton.disabled = true;

    const resultIndex = getRandomIndex();
    const result = ROULETTE_SEQUENCE[resultIndex];

    const { win, multiplier } = evaluateBet(result, currentBetOption);
    const payout = win ? betAmount * multiplier : 0;

    animateSpin(resultIndex);
    animateBall();

    try {
        await waitForAnimationEnd();
    } finally {
        elements.spinButton.disabled = false;
        isSpinning = false;
    }

    await handleResult(betAmount, payout, result, win, multiplier);
    updateUIAfterResult(result, betAmount, payout, win, multiplier);
}

function evaluateBet(result, bet) {
    const number = result.number;
    const color = result.color;

    switch (bet.type) {
        case 'color':
            return {
                win: color === bet.value,
                multiplier: 2
            };
        case 'parity':
            if (number === 0) {
                return { win: false, multiplier: 2 };
            }
            return {
                win: bet.value === 'even' ? number % 2 === 0 : number % 2 === 1,
                multiplier: 2
            };
        case 'range':
            if (number === 0) {
                return { win: false, multiplier: 2 };
            }
            return {
                win: bet.value === 'low' ? number >= 1 && number <= 18 : number >= 19 && number <= 36,
                multiplier: 2
            };
        case 'dozen': {
            if (number === 0) {
                return { win: false, multiplier: 3 };
            }
            let win = false;
            if (bet.value === 'first') win = number >= 1 && number <= 12;
            if (bet.value === 'second') win = number >= 13 && number <= 24;
            if (bet.value === 'third') win = number >= 25 && number <= 36;
            return {
                win,
                multiplier: 3
            };
        }
        case 'number':
            return {
                win: number === bet.value,
                multiplier: 36
            };
        default:
            return { win: false, multiplier: 0 };
    }
}

function animateSpin(resultIndex) {
    if (!elements.wheel) return;

    const previousRotation = parseFloat(elements.wheel.dataset.rotation ?? '0');
    const normalizedPrevious = normalizeAngle(previousRotation);

    const offset = (Math.random() - 0.5) * (SEGMENT_ANGLE * 0.4);
    const targetAngle = -resultIndex * SEGMENT_ANGLE + offset;
    const normalizedTarget = normalizeAngle(targetAngle);

    const delta = normalizedTarget - normalizedPrevious;
    const totalRotation = previousRotation + (WHEEL_SPIN_TURNS * 360) + delta;

    elements.wheel.dataset.rotation = totalRotation.toString();
    elements.wheel.style.transition = 'transform 3.8s cubic-bezier(0.15, 0.85, 0.25, 1)';
    elements.wheel.style.transform = `rotate(${totalRotation}deg)`;

    wheelRotation = totalRotation;
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

async function handleResult(betAmount, payout, result, win, multiplier) {
    if (!currentUser) return;
    try {
        const outcome = await applyGameResult(currentUser.uid, {
            betAmount,
            payout,
            game: 'roulette',
            metadata: {
                betType: currentBetOption.type,
                betValue: currentBetOption.value,
                resultNumber: result.number,
                resultColor: result.color,
                win,
                multiplier
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

function updateUIAfterResult(result, betAmount, payout, win, multiplier) {
    updateLastResultDisplay(result);
    addToHistory(result);
    updateHistoryDisplay();

    stats.games += 1;
    if (win) {
        stats.wins += 1;
        stats.profit += payout - betAmount;
        stats.bestWin = Math.max(stats.bestWin, payout);
    } else {
        stats.profit -= betAmount;
    }
    updateStatsDisplay();

    showResultNotification(result, win, payout, multiplier);
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
    if (!elements.history) return;
    elements.history.innerHTML = '';

    if (!history.length) {
        const empty = document.createElement('span');
        empty.className = 'empty-history';
        empty.textContent = 'Aucun tirage';
        elements.history.appendChild(empty);
        return;
    }

    history.forEach((item) => {
        const chip = document.createElement('span');
        chip.className = `result-chip ${item.color}`;
        chip.textContent = item.number.toString();
        elements.history.appendChild(chip);
    });
}

function updateStatsDisplay() {
    elements.statGames.textContent = stats.games.toString();
    elements.statWins.textContent = stats.wins.toString();
    elements.statProfit.textContent = `${stats.profit.toFixed(2)} €`;
    elements.statProfit.style.color = stats.profit >= 0 ? 'var(--accent-primary)' : 'var(--error-color)';
    elements.statBestWin.textContent = `${stats.bestWin.toFixed(2)} €`;
}

function showResultNotification(result, win, payout, multiplier) {
    const display = document.createElement('div');
    display.className = 'roulette-toast';
    display.textContent = win
        ? `🎉 ${result.number} ${colorToLabel(result.color)} • Gagné ${payout.toFixed(2)} € (${multiplier.toFixed(2)}x)`
        : `💥 ${result.number} ${colorToLabel(result.color)} • Perdu`;

    document.body.appendChild(display);

    requestAnimationFrame(() => {
        display.classList.add('visible');
    });

    setTimeout(() => {
        display.classList.remove('visible');
        setTimeout(() => display.remove(), 220);
    }, 2600);
}

function normalizeAngle(angle) {
    const normalized = angle % 360;
    return normalized < 0 ? normalized + 360 : normalized;
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

// Toast styles injection for lightweight notification
const toastStyleId = 'roulette-toast-style';
if (!document.getElementById(toastStyleId)) {
    const style = document.createElement('style');
    style.id = toastStyleId;
    style.textContent = `
        .roulette-toast {
            position: fixed;
            bottom: 26px;
            right: 26px;
            background: rgba(17, 24, 33, 0.92);
            border: 1px solid rgba(255, 255, 255, 0.08);
            color: var(--text-primary);
            padding: 0.75rem 1.1rem;
            border-radius: 12px;
            box-shadow: 0 14px 38px rgba(0, 0, 0, 0.45);
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
