import { auth, signOut, onAuthStateChanged } from './firebase-config.js';
import { initializeUserBalance, subscribeToUserData, addFunds, applyGameResult } from './balance-manager.js';

let currentUser = null;
let unsubscribeBalance = null;

// Game state
let balance = 0;
let isPlaying = false;
let currentPrediction = 'over';
let targetNumber = 50.5;
let gamesPlayed = 0;
let wins = 0;
let losses = 0;
let balanceLoaded = false;

const resultNumberElement = document.getElementById('resultNumber');
const sliderRollElement = document.getElementById('sliderRoll');
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// Constants
const HOUSE_EDGE = 0.01; // 1% house edge like Stake

// Check if user is logged in
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
    } else {
        currentUser = user;
        await initializeUserBalance(user);

        // Subscribe to real-time user data (balance + stats)
        unsubscribeBalance = subscribeToUserData(user.uid, (data) => {
            if (!data) {
                balanceLoaded = false;
                setPlayingState(false);
                updateBalance();
                return;
            }

            balance = data.balance;
            balanceLoaded = true;

            syncStatsFromData(data);
            updateBalance();
            setPlayingState(false);
        });
    }
});

// Logout functionality
document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        if (unsubscribeBalance) {
            unsubscribeBalance();
        }
        await signOut(auth);
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Error signing out:', error);
    }
});

// Initialize
function init() {
    updateStats();
    updateBalance();
    updatePrediction();
    updateTarget();
    updateVisuals();
    setupEventListeners();
    drawCanvas();
    setPlayingState(false);
}

function setPlayingState(playing) {
    isPlaying = playing;
    const playBtn = document.getElementById('playBtn');
    if (playBtn) {
        playBtn.disabled = playing || !balanceLoaded;
        playBtn.innerHTML = playing ? '<span>Lancer en cours...</span>' : '<span>Lancer le dé</span>';
    }
}

function setRollingVisual(active) {
    if (!resultNumberElement) return;
    if (active) {
        resultNumberElement.classList.add('rolling');
        resultNumberElement.textContent = '...';
    } else {
        resultNumberElement.classList.remove('rolling');
    }
}

async function runPreRollAnimation() {
    if (!sliderRollElement) {
        await wait(350);
        return;
    }
    sliderRollElement.classList.remove('active');
    void sliderRollElement.offsetWidth;
    sliderRollElement.classList.add('active');
    await wait(900);
    sliderRollElement.classList.remove('active');
}

// Setup event listeners
function setupEventListeners() {
    // Play button
    document.getElementById('playBtn').addEventListener('click', playGame);

    // Prediction buttons
    document.querySelectorAll('.prediction-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.prediction-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPrediction = btn.dataset.prediction;
            updatePrediction();
        });
    });

    // Target slider and input
    const slider = document.getElementById('targetSlider');
    const input = document.getElementById('targetInput');

    slider.addEventListener('input', (e) => {
        targetNumber = parseFloat(e.target.value);
        input.value = targetNumber.toFixed(2);
        updateTarget();
        updateVisuals();
    });

    input.addEventListener('input', (e) => {
        let value = parseFloat(e.target.value);
        if (value < 2) value = 2;
        if (value > 98) value = 98;
        targetNumber = value;
        slider.value = value;
        e.target.value = value.toFixed(2);
        updateTarget();
        updateVisuals();
    });

    // Quick bet buttons
    document.querySelectorAll('.quick-bet').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            const betInput = document.getElementById('betAmount');
            let currentBet = parseFloat(betInput.value);
            if (isNaN(currentBet)) {
                currentBet = 0;
            }

            switch(action) {
                case 'half':
                    betInput.value = (currentBet / 2).toFixed(2);
                    break;
                case 'double':
                    betInput.value = (currentBet * 2).toFixed(2);
                    break;
                case 'min':
                    betInput.value = '0.10';
                    break;
                case 'max':
                    if (balanceLoaded) {
                        betInput.value = balance.toFixed(2);
                    }
                    break;
            }
            updateProfit();
        });
    });

    // Bet amount input
    document.getElementById('betAmount').addEventListener('input', updateProfit);

    // Deposit button
    document.getElementById('depositBtn').addEventListener('click', async () => {
        if (!currentUser) {
            alert('Veuillez vous connecter');
            return;
        }

        const amount = prompt('Montant à déposer (€):');
        const depositAmount = parseFloat(amount);
        if (amount && !isNaN(depositAmount) && depositAmount > 0) {
            try {
                await addFunds(currentUser.uid, depositAmount);
                alert(`${depositAmount.toFixed(2)} € ajoutés à votre solde!`);
            } catch (error) {
                console.error('Error adding funds:', error);
                alert('Erreur lors du dépôt');
            }
        }
    });
}

// Calculate multiplier based on win chance
function calculateMultiplier() {
    const winChance = calculateWinChance();
    // Multiplier = (100 - house edge) / win chance
    const multiplier = (100 - HOUSE_EDGE) / winChance;
    return Math.max(1.01, multiplier); // Minimum 1.01x
}

// Calculate win chance based on prediction and target
function calculateWinChance() {
    if (currentPrediction === 'over') {
        return 100 - targetNumber;
    } else {
        return targetNumber;
    }
}

// Generate provably fair result (0-100)
function generateResult() {
    // Use crypto.getRandomValues for true randomness
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);

    // Convert to 0-100 range with 2 decimal precision
    const result = (array[0] / (0xFFFFFFFF + 1)) * 100;
    return parseFloat(result.toFixed(2));
}

// Check if player won
function checkWin(result) {
    if (currentPrediction === 'over') {
        return result > targetNumber;
    } else {
        return result < targetNumber;
    }
}

// Play game
async function playGame() {
    if (isPlaying || !currentUser) return;

    const betAmount = parseFloat(document.getElementById('betAmount').value);

    // Validation
    if (isNaN(betAmount) || betAmount <= 0) {
        alert('Mise invalide');
        return;
    }

    if (!balanceLoaded) {
        alert('Solde en cours de synchronisation, veuillez patienter.');
        return;
    }

    if (betAmount > balance) {
        alert('Solde insuffisant');
        return;
    }

    setPlayingState(true);

    try {
        setRollingVisual(true);

        const result = generateResult();
        const won = checkWin(result);
        const multiplier = calculateMultiplier();
        const payout = won ? parseFloat((betAmount * multiplier).toFixed(2)) : 0;
        const profit = parseFloat((payout - betAmount).toFixed(2));

        await runPreRollAnimation();
        await animateResult(result, won);
        await wait(250);

        let transactionSucceeded = false;

        try {
            const outcome = await applyGameResult(currentUser.uid, {
                betAmount,
                payout,
                game: 'dice'
            });
            balance = outcome.balance;
            updateBalance();
            transactionSucceeded = true;
        } catch (error) {
            console.error('Error applying dice result:', error);
            if (error.message === 'INSUFFICIENT_FUNDS') {
                alert('Solde insuffisant pour cette mise.');
            } else {
                alert('Erreur lors de la mise à jour du solde.');
            }
        }

        if (transactionSucceeded) {
            addToHistory(result, won, betAmount, profit);
        }
    } finally {
        setRollingVisual(false);
        setPlayingState(false);
    }
}

// Animate result
async function animateResult(result, won) {
    const resultNumber = document.getElementById('resultNumber');
    const resultMarker = document.getElementById('resultMarker');

    if (!resultNumber || !resultMarker) {
        animateCursorToResult(result, won);
        return;
    }

    resultNumber.classList.remove('win', 'loss');
    resultMarker.classList.remove('win', 'loss', 'show');

    const previousNumber = parseFloat(resultNumber.dataset.value ?? resultNumber.textContent);
    const previousMarker = parseFloat(resultMarker.dataset.position ?? previousNumber);
    const safePreviousNumber = Number.isFinite(previousNumber) ? previousNumber : result;
    const safePreviousMarker = Number.isFinite(previousMarker) ? previousMarker : result;

    const jitterEnd = performance.now() + 420;
    while (performance.now() < jitterEnd) {
        resultNumber.textContent = (Math.random() * 100).toFixed(2);
        await wait(36);
    }

    await Promise.all([
        animateNumberTransition(resultNumber, safePreviousNumber, result, 640),
        animateMarkerTransition(resultMarker, safePreviousMarker, result, 640)
    ]);

    const finalValue = result.toFixed(2);
    resultNumber.dataset.value = finalValue;
    resultNumber.textContent = finalValue;
    resultNumber.classList.add(won ? 'win' : 'loss');

    resultMarker.dataset.position = finalValue;
    resultMarker.style.left = `${result}%`;
    resultMarker.classList.add('show');
    resultMarker.classList.toggle('win', won);
    resultMarker.classList.toggle('loss', !won);

    // Trigger animated cursor on canvas
    animateCursorToResult(result, won, 800);
}

function animateNumberTransition(element, from, to, duration) {
    return new Promise((resolve) => {
        const startTime = performance.now();
        const step = (time) => {
            const progress = Math.min((time - startTime) / duration, 1);
            const eased = easeOutCubic(progress);
            const current = from + (to - from) * eased;
            element.textContent = current.toFixed(2);

            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                resolve();
            }
        };

        requestAnimationFrame(step);
    });
}

function animateMarkerTransition(element, from, to, duration) {
    return new Promise((resolve) => {
        const startTime = performance.now();
        const step = (time) => {
            const progress = Math.min((time - startTime) / duration, 1);
            const eased = easeOutCubic(progress);
            const current = from + (to - from) * eased;
            element.style.left = `${current}%`;

            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                resolve();
            }
        };

        requestAnimationFrame(step);
    });
}

// Update balance display
function updateBalance() {
    const balanceElement = document.getElementById('userBalance');
    if (!balanceElement) return;

    if (!balanceLoaded) {
        balanceElement.textContent = '---';
        return;
    }

    balanceElement.textContent = `${balance.toFixed(2)} €`;
}

// Update prediction display
function updatePrediction() {
    updateTarget();
}

// Update target and calculations
function updateTarget() {
    const winChance = calculateWinChance();
    const multiplier = calculateMultiplier();

    // Update displays
    document.getElementById('winChanceDisplay').textContent = `${winChance.toFixed(2)}%`;
    document.getElementById('infoWinChance').textContent = `${winChance.toFixed(2)}%`;
    document.getElementById('infoMultiplier').textContent = `${multiplier.toFixed(2)}x`;
    document.getElementById('multiplierDisplay').textContent = `${multiplier.toFixed(2)}x`;

    updateProfit();
}

// Update profit display
function updateProfit() {
    const betAmount = parseFloat(document.getElementById('betAmount').value) || 0;
    const multiplier = calculateMultiplier();
    const profit = betAmount * (multiplier - 1);

    document.getElementById('profitAmount').textContent = `${profit.toFixed(2)} €`;
}

// Update visuals (slider fills and marker)
function updateVisuals() {
    const fillUnder = document.getElementById('sliderFillUnder');
    const fillOver = document.getElementById('sliderFillOver');
    const marker = document.getElementById('sliderMarker');

    const position = targetNumber;

    marker.style.left = `${position}%`;

    if (currentPrediction === 'over') {
        fillUnder.style.width = `${position}%`;
        fillOver.style.width = `${100 - position}%`;
        fillUnder.style.opacity = '0.3';
        fillOver.style.opacity = '1';
    } else {
        fillUnder.style.width = `${position}%`;
        fillOver.style.width = `${100 - position}%`;
        fillUnder.style.opacity = '1';
        fillOver.style.opacity = '0.3';
    }

    // Update canvas with new target (only if no active result animation)
    if (!cursorAnimationFrame) {
        drawCanvas();
    }
}

// Store animated cursor position
let animatedCursorX = null;
let cursorAnimationFrame = null;

// Draw canvas visualization
function drawCanvas(result = null, won = null) {
    const canvas = document.getElementById('diceCanvas');
    const ctx = canvas.getContext('2d');

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const width = canvas.width;
    const height = canvas.height;

    // Draw gradient background
    const gradient = ctx.createLinearGradient(0, 0, width, 0);

    if (currentPrediction === 'over') {
        gradient.addColorStop(0, 'rgba(255, 68, 68, 0.3)');
        gradient.addColorStop(targetNumber / 100, 'rgba(255, 68, 68, 0.3)');
        gradient.addColorStop(targetNumber / 100, 'rgba(0, 208, 132, 0.3)');
        gradient.addColorStop(1, 'rgba(0, 208, 132, 0.3)');
    } else {
        gradient.addColorStop(0, 'rgba(0, 208, 132, 0.3)');
        gradient.addColorStop(targetNumber / 100, 'rgba(0, 208, 132, 0.3)');
        gradient.addColorStop(targetNumber / 100, 'rgba(255, 68, 68, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 68, 68, 0.3)');
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Draw target line
    const targetX = (targetNumber / 100) * width;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(targetX, 0);
    ctx.lineTo(targetX, height);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw target label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`Target: ${targetNumber.toFixed(2)}`, targetX, 30);

    // Draw animated cursor if result is available
    if (result !== null && animatedCursorX !== null) {
        const cursorX = animatedCursorX;

        // Draw cursor shadow/glow
        ctx.save();
        ctx.shadowColor = won ? 'rgba(0, 208, 132, 0.8)' : 'rgba(255, 68, 68, 0.8)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Draw cursor line with gradient
        const cursorGradient = ctx.createLinearGradient(cursorX, 0, cursorX, height);
        cursorGradient.addColorStop(0, won ? 'rgba(0, 208, 132, 0.2)' : 'rgba(255, 68, 68, 0.2)');
        cursorGradient.addColorStop(0.5, won ? 'rgba(0, 208, 132, 1)' : 'rgba(255, 68, 68, 1)');
        cursorGradient.addColorStop(1, won ? 'rgba(0, 208, 132, 0.2)' : 'rgba(255, 68, 68, 0.2)');

        ctx.strokeStyle = cursorGradient;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(cursorX, 0);
        ctx.lineTo(cursorX, height);
        ctx.stroke();
        ctx.restore();

        // Draw cursor marker at top
        ctx.save();
        ctx.fillStyle = won ? '#00d084' : '#ff4444';
        ctx.shadowColor = won ? 'rgba(0, 208, 132, 0.8)' : 'rgba(255, 68, 68, 0.8)';
        ctx.shadowBlur = 15;

        // Triangle pointer at top
        ctx.beginPath();
        ctx.moveTo(cursorX, 0);
        ctx.lineTo(cursorX - 15, 25);
        ctx.lineTo(cursorX + 15, 25);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Draw cursor marker at bottom
        ctx.save();
        ctx.fillStyle = won ? '#00d084' : '#ff4444';
        ctx.shadowColor = won ? 'rgba(0, 208, 132, 0.8)' : 'rgba(255, 68, 68, 0.8)';
        ctx.shadowBlur = 15;

        // Triangle pointer at bottom
        ctx.beginPath();
        ctx.moveTo(cursorX, height);
        ctx.lineTo(cursorX - 15, height - 25);
        ctx.lineTo(cursorX + 15, height - 25);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Draw result circle in center
        ctx.save();
        ctx.fillStyle = won ? '#00d084' : '#ff4444';
        ctx.shadowColor = won ? 'rgba(0, 208, 132, 1)' : 'rgba(255, 68, 68, 1)';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(cursorX, height / 2, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Draw result value in circle
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(result.toFixed(2), cursorX, height / 2);

        // Draw win/loss text above circle
        ctx.font = 'bold 28px Arial';
        ctx.fillStyle = won ? '#00d084' : '#ff4444';
        ctx.fillText(won ? 'WIN!' : 'LOSS', cursorX, height / 2 - 50);
    }
}

// Animate cursor movement to result position
function animateCursorToResult(result, won, duration = 800) {
    const canvas = document.getElementById('diceCanvas');
    const width = canvas.width;
    const targetX = (result / 100) * width;

    // Start from random position or current position
    const startX = animatedCursorX !== null ? animatedCursorX : width * 0.5;
    const startTime = performance.now();

    if (cursorAnimationFrame) {
        cancelAnimationFrame(cursorAnimationFrame);
    }

    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function (ease-out cubic)
        const eased = 1 - Math.pow(1 - progress, 3);

        animatedCursorX = startX + (targetX - startX) * eased;

        drawCanvas(result, won);

        if (progress < 1) {
            cursorAnimationFrame = requestAnimationFrame(animate);
        } else {
            cursorAnimationFrame = null;
        }
    }

    cursorAnimationFrame = requestAnimationFrame(animate);
}

// Update stats
function syncStatsFromData(data) {
    gamesPlayed = data.diceGamesPlayed ?? 0;
    wins = data.diceWins ?? 0;
    losses = data.diceLosses ?? 0;
    updateStats();
}

function updateStats() {
    document.getElementById('gamesPlayed').textContent = gamesPlayed;
    document.getElementById('wins').textContent = wins;
    document.getElementById('losses').textContent = losses;

    const winRate = gamesPlayed > 0 ? (wins / gamesPlayed * 100).toFixed(1) : 0;
    document.getElementById('winRate').textContent = `${winRate}%`;
}

// Add to history
function addToHistory(result, won, betAmount, profit) {
    const historyList = document.getElementById('historyList');

    // Remove "no history" message
    const noHistory = historyList.querySelector('.no-history');
    if (noHistory) {
        noHistory.remove();
    }

    const historyItem = document.createElement('div');
    historyItem.className = `history-item ${won ? 'win' : 'loss'}`;

    const predictionText = currentPrediction === 'over'
        ? `>${targetNumber.toFixed(2)}`
        : `<${targetNumber.toFixed(2)}`;

    historyItem.innerHTML = `
        <div class="history-result ${won ? 'win' : 'loss'}">${result.toFixed(2)}</div>
        <div class="history-target">${predictionText}</div>
        <div class="history-bet">${betAmount.toFixed(2)}€</div>
        <div class="history-profit ${won ? 'win' : 'loss'}">${profit >= 0 ? '+' : ''}${profit.toFixed(2)}€</div>
    `;

    historyList.insertBefore(historyItem, historyList.firstChild);

    // Keep only last 50 items
    while (historyList.children.length > 50) {
        historyList.removeChild(historyList.lastChild);
    }
}

// Initialize on load
init();
