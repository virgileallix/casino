import { db, doc, getDoc, setDoc, updateDoc, onSnapshot, runTransaction } from './firebase-config.js';

const INITIAL_BALANCE = 1000;

const DEFAULT_USER_FIELDS = {
    balance: INITIAL_BALANCE,
    totalWagered: 0,
    totalWon: 0,
    gamesPlayed: 0,
    diceGamesPlayed: 0,
    diceWins: 0,
    diceLosses: 0,
    diceBestWin: 0,
    plinkoGamesPlayed: 0,
    plinkoTotalWon: 0,
    plinkoBestWin: 0,
    blackjackHandsPlayed: 0,
    blackjackWins: 0,
    blackjackBlackjacks: 0,
    blackjackTotalProfit: 0,
    minesGamesPlayed: 0,
    minesCashouts: 0,
    minesBestMultiplier: 0,
    minesTotalProfit: 0,
    towerGamesPlayed: 0,
    towerCashouts: 0,
    towerBestMultiplier: 0,
    towerTotalProfit: 0,
    // VIP System
    totalWager: 0,
    rakebackAvailable: 0,
    totalRakebackEarned: 0,
    lastRakebackClaim: null,
    username: null,
    // Admin System
    admin: 0,
    // Privacy
    isPrivate: false
};

function roundCurrency(value) {
    return Math.round(value * 100) / 100;
}

function mergeWithDefaults(data = {}) {
    const merged = { ...DEFAULT_USER_FIELDS, ...data };
    merged.balance = roundCurrency(merged.balance);
    merged.totalWagered = roundCurrency(merged.totalWagered);
    merged.totalWon = roundCurrency(merged.totalWon);
    merged.diceBestWin = roundCurrency(merged.diceBestWin);
    merged.plinkoTotalWon = roundCurrency(merged.plinkoTotalWon);
    merged.plinkoBestWin = roundCurrency(merged.plinkoBestWin);
    merged.blackjackTotalProfit = roundCurrency(merged.blackjackTotalProfit);
    merged.minesBestMultiplier = roundCurrency(merged.minesBestMultiplier);
    merged.minesTotalProfit = roundCurrency(merged.minesTotalProfit);
    merged.towerBestMultiplier = roundCurrency(merged.towerBestMultiplier);
    merged.towerTotalProfit = roundCurrency(merged.towerTotalProfit);
    merged.totalWager = roundCurrency(merged.totalWager);
    merged.rakebackAvailable = roundCurrency(merged.rakebackAvailable);
    merged.totalRakebackEarned = roundCurrency(merged.totalRakebackEarned);
    return merged;
}
export function normalizeUserData(data = {}) {
    return mergeWithDefaults(data);
}

// VIP Tiers based on wager
const VIP_TIERS = [
    { name: 'bronze', wagerRequired: 0, rakeback: 0.01 },
    { name: 'silver', wagerRequired: 1000, rakeback: 0.02 },
    { name: 'gold', wagerRequired: 5000, rakeback: 0.03 },
    { name: 'platinum', wagerRequired: 25000, rakeback: 0.05 },
    { name: 'diamond', wagerRequired: 100000, rakeback: 0.08 }
];

function getCurrentVIPTier(totalWager) {
    for (let i = VIP_TIERS.length - 1; i >= 0; i--) {
        if (totalWager >= VIP_TIERS[i].wagerRequired) {
            return VIP_TIERS[i];
        }
    }
    return VIP_TIERS[0];
}

function calculateRakeback(betAmount, payout, totalWager) {
    const tier = getCurrentVIPTier(totalWager);
    const loss = betAmount - payout;

    // Only give rakeback on losses
    if (loss > 0) {
        return roundCurrency(loss * tier.rakeback);
    }

    return 0;
}

function getUserRef(userId) {
    return doc(db, 'users', userId);
}

export async function initializeUserBalance(user) {
    if (!user) return;

    const userRef = getUserRef(user.uid);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
        const userData = {
            createdAt: new Date().toISOString(),
            ...DEFAULT_USER_FIELDS
        };

        // Only add email if it exists in the auth token
        if (user.email) {
            userData.email = user.email;
        }

        await setDoc(userRef, userData);
        return;
    }

    const data = snapshot.data();
    const updates = {};

    Object.entries(DEFAULT_USER_FIELDS).forEach(([key, defaultValue]) => {
        if (data[key] === undefined) {
            updates[key] = defaultValue;
        }
    });

    if (data.email === undefined && user.email) {
        updates.email = user.email;
    }

    if (Object.keys(updates).length) {
        await updateDoc(userRef, updates);
    }
}

export function subscribeToUserData(userId, callback) {
    const userRef = getUserRef(userId);

    return onSnapshot(userRef, (docSnap) => {
        if (!docSnap.exists()) {
            callback(null);
            return;
        }
        callback(mergeWithDefaults(docSnap.data()));
    });
}

// Backwards compatibility for existing callers expecting balance data
export function subscribeToBalance(userId, callback) {
    return subscribeToUserData(userId, (data) => {
        if (data) {
            callback(data);
        }
    });
}

export async function addFunds(userId, amount) {
    if (!amount || isNaN(amount) || amount <= 0) {
        throw new Error('Deposit amount must be positive');
    }

    const userRef = getUserRef(userId);

    const newBalance = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(userRef);
        if (!snapshot.exists()) {
            throw new Error('User not found');
        }

        const current = mergeWithDefaults(snapshot.data());
        const balance = roundCurrency(current.balance + amount);
        transaction.update(userRef, { balance });
        return balance;
    });

    return newBalance;
}

export async function applyGameResult(userId, { betAmount, payout, game, metadata = {} }) {
    if (!betAmount || isNaN(betAmount) || betAmount <= 0) {
        throw new Error('Bet amount must be positive');
    }
    if (payout === undefined || isNaN(payout) || payout < 0) {
        throw new Error('Payout must be zero or positive');
    }

    const userRef = getUserRef(userId);

    return runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(userRef);
        if (!snapshot.exists()) {
            throw new Error('User not found');
        }

        const current = mergeWithDefaults(snapshot.data());

        if (current.balance < betAmount) {
            throw new Error('INSUFFICIENT_FUNDS');
        }

        const profit = roundCurrency(payout - betAmount);
        const balance = roundCurrency(current.balance - betAmount + payout);

        // Calculate rakeback
        const rakeback = calculateRakeback(betAmount, payout, current.totalWager);

        const updates = {
            balance,
            totalWagered: roundCurrency(current.totalWagered + betAmount),
            totalWon: roundCurrency(current.totalWon + payout),
            gamesPlayed: current.gamesPlayed + 1,
            // VIP System
            totalWager: roundCurrency(current.totalWager + betAmount),
            rakebackAvailable: roundCurrency(current.rakebackAvailable + rakeback),
            totalRakebackEarned: roundCurrency(current.totalRakebackEarned + rakeback)
        };

        if (game === 'dice') {
            updates.diceGamesPlayed = current.diceGamesPlayed + 1;
            updates.diceWins = current.diceWins + (payout > 0 ? 1 : 0);
            updates.diceLosses = current.diceLosses + (payout > 0 ? 0 : 1);
            if (payout > betAmount) {
                updates.diceBestWin = Math.max(current.diceBestWin, profit);
            }
        }

        if (game === 'plinko') {
            updates.plinkoGamesPlayed = current.plinkoGamesPlayed + 1;
            updates.plinkoTotalWon = roundCurrency(current.plinkoTotalWon + payout);
            if (payout > 0) {
                updates.plinkoBestWin = Math.max(current.plinkoBestWin, payout);
            }
        }

        if (game === 'blackjack') {
            updates.blackjackHandsPlayed = current.blackjackHandsPlayed + 1;
            if (metadata.result === 'win') {
                updates.blackjackWins = current.blackjackWins + 1;
            }
            if (metadata.blackjack) {
                updates.blackjackBlackjacks = current.blackjackBlackjacks + 1;
            }
            updates.blackjackTotalProfit = roundCurrency((current.blackjackTotalProfit || 0) + profit);
        }

        if (game === 'mines') {
            updates.minesGamesPlayed = current.minesGamesPlayed + 1;
            if (metadata.cashout) {
                updates.minesCashouts = current.minesCashouts + 1;
                updates.minesBestMultiplier = Math.max(current.minesBestMultiplier || 0, metadata.multiplier || 0);
            }
            updates.minesTotalProfit = roundCurrency((current.minesTotalProfit || 0) + profit);
        }

        if (game === 'tower') {
            updates.towerGamesPlayed = current.towerGamesPlayed + 1;
            if (metadata.cashout) {
                updates.towerCashouts = current.towerCashouts + 1;
                updates.towerBestMultiplier = Math.max(current.towerBestMultiplier || 0, metadata.multiplier || 0);
            }
            updates.towerTotalProfit = roundCurrency((current.towerTotalProfit || 0) + profit);
        }

        transaction.update(userRef, updates);

        return {
            balance,
            profit,
            payout
        };
    });
}

export async function getUserBalance(userId) {
    const userRef = getUserRef(userId);
    const snapshot = await getDoc(userRef);
    if (!snapshot.exists()) {
        return INITIAL_BALANCE;
    }
    const data = mergeWithDefaults(snapshot.data());
    return data.balance;
}

export async function getUserProfile(userId) {
    const userRef = getUserRef(userId);
    const snapshot = await getDoc(userRef);
    if (!snapshot.exists()) {
        return null;
    }
    return mergeWithDefaults(snapshot.data());
}

// Admin functions
export async function isAdmin(userId) {
    const userRef = getUserRef(userId);
    const snapshot = await getDoc(userRef);
    if (!snapshot.exists()) {
        return false;
    }
    const data = snapshot.data();
    return data.admin === 1;
}

export async function getAllUsers() {
    const { collection, getDocs } = await import('./firebase-config.js');
    const usersCollection = collection(db, 'users');
    const snapshot = await getDocs(usersCollection);

    const users = [];
    snapshot.forEach(doc => {
        users.push({
            id: doc.id,
            ...mergeWithDefaults(doc.data())
        });
    });

    return users;
}

export async function updateUserBalance(userId, newBalance) {
    const userRef = getUserRef(userId);
    await updateDoc(userRef, {
        balance: roundCurrency(newBalance)
    });
}

export async function setUserAdmin(userId, isAdmin) {
    const userRef = getUserRef(userId);
    await updateDoc(userRef, {
        admin: isAdmin ? 1 : 0
    });
}

export async function deleteUser(userId) {
    const { deleteDoc } = await import('./firebase-config.js');
    const userRef = getUserRef(userId);
    await deleteDoc(userRef);
}

export async function resetUserStats(userId) {
    const userRef = getUserRef(userId);
    await updateDoc(userRef, {
        totalWagered: 0,
        totalWon: 0,
        gamesPlayed: 0,
        diceGamesPlayed: 0,
        diceWins: 0,
        diceLosses: 0,
        diceBestWin: 0,
        plinkoGamesPlayed: 0,
        plinkoTotalWon: 0,
        plinkoBestWin: 0,
        blackjackHandsPlayed: 0,
        blackjackWins: 0,
        blackjackBlackjacks: 0,
        blackjackTotalProfit: 0,
        minesGamesPlayed: 0,
        minesCashouts: 0,
        minesBestMultiplier: 0,
        minesTotalProfit: 0,
        towerGamesPlayed: 0,
        towerCashouts: 0,
        towerBestMultiplier: 0,
        towerTotalProfit: 0,
        totalWager: 0,
        rakebackAvailable: 0,
        totalRakebackEarned: 0
    });
}

export async function updateUsername(userId, username) {
    if (!username || typeof username !== 'string') {
        throw new Error('Nom d'utilisateur invalide');
    }
    const sanitized = username.trim();
    if (sanitized.length < 3 || sanitized.length > 16) {
        throw new Error('Le pseudo doit contenir entre 3 et 16 caractères.');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(sanitized)) {
        throw new Error('Le pseudo ne peut contenir que des lettres, chiffres ou underscores.');
    }

    const userRef = getUserRef(userId);
    await updateDoc(userRef, {
        username: sanitized
    });

    return sanitized;
}

export async function claimRakeback(userId) {
    const userRef = getUserRef(userId);

    return runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(userRef);
        if (!snapshot.exists()) {
            throw new Error('User not found');
        }

        const current = mergeWithDefaults(snapshot.data());
        const rakebackAvailable = current.rakebackAvailable || 0;

        if (rakebackAvailable <= 0) {
            throw new Error('NO_RAKEBACK_AVAILABLE');
        }

        const newBalance = roundCurrency(current.balance + rakebackAvailable);

        transaction.update(userRef, {
            balance: newBalance,
            rakebackAvailable: 0,
            lastRakebackClaim: new Date().toISOString()
        });

        return {
            balance: newBalance,
            rakebackClaimed: rakebackAvailable
        };
    });
}
