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
    plinkoBestWin: 0
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
    return merged;
}

function getUserRef(userId) {
    return doc(db, 'users', userId);
}

export async function initializeUserBalance(user) {
    if (!user) return;

    const userRef = getUserRef(user.uid);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
        await setDoc(userRef, {
            email: user.email ?? null,
            createdAt: new Date().toISOString(),
            ...DEFAULT_USER_FIELDS
        });
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

export async function applyGameResult(userId, { betAmount, payout, game }) {
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

        const updates = {
            balance,
            totalWagered: roundCurrency(current.totalWagered + betAmount),
            totalWon: roundCurrency(current.totalWon + payout),
            gamesPlayed: current.gamesPlayed + 1
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
