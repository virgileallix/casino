import { auth, onAuthStateChanged, signOut } from 'js/core/firebase-config.js';
import { db, doc, getDoc, updateDoc, setDoc } from 'js/core/firebase-config.js';

let currentUser = null;
let migrationNeeded = false;

const elements = {
    userEmail: document.getElementById('userEmail'),
    accountStatus: document.getElementById('accountStatus'),
    migrationRequired: document.getElementById('migrationRequired'),
    migrateBtn: document.getElementById('migrateBtn'),
    skipBtn: document.getElementById('skipBtn'),
    migrationLog: document.getElementById('migrationLog')
};

// Champs requis avec valeurs par défaut
const REQUIRED_FIELDS = {
    balance: 0,
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
    totalRakebackEarned: 0,
    lastRakebackClaim: null,
    username: null,
    admin: 0
};

function addLog(message, type = 'info') {
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    const timestamp = new Date().toLocaleTimeString('fr-FR');
    logEntry.textContent = `[${timestamp}] ${message}`;
    elements.migrationLog.appendChild(logEntry);
    elements.migrationLog.scrollTop = elements.migrationLog.scrollHeight;
    elements.migrationLog.classList.add('visible');
}

function updateStatus(status, type = 'pending') {
    elements.accountStatus.textContent = status;
    elements.accountStatus.className = `status-badge ${type}`;
}

function setButtonLoading(loading) {
    const loadingSpan = elements.migrateBtn.querySelector('.loading');
    const textSpan = elements.migrateBtn.querySelector('.btn-text');

    if (loading) {
        loadingSpan.style.display = 'inline-flex';
        textSpan.style.display = 'none';
        elements.migrateBtn.disabled = true;
        elements.skipBtn.disabled = true;
    } else {
        loadingSpan.style.display = 'none';
        textSpan.style.display = 'inline';
        elements.migrateBtn.disabled = false;
        elements.skipBtn.disabled = false;
    }
}

async function checkMigrationNeeded(userId) {
    try {
        const userRef = doc(db, 'users', userId);
        const snapshot = await getDoc(userRef);

        if (!snapshot.exists()) {
            addLog('Aucune donnée utilisateur trouvée. Création nécessaire.', 'info');
            elements.migrationRequired.textContent = 'Oui (Nouveau compte)';
            return true;
        }

        const data = snapshot.data();
        const missingFields = [];

        // Vérifier les champs manquants ou invalides
        for (const [field, defaultValue] of Object.entries(REQUIRED_FIELDS)) {
            if (data[field] === undefined) {
                missingFields.push(field);
            }
        }

        // Vérifier le champ createdAt
        if (!data.createdAt) {
            missingFields.push('createdAt');
        }

        if (missingFields.length > 0) {
            addLog(`${missingFields.length} champ(s) manquant(s) détecté(s)`, 'info');
            addLog(`Champs: ${missingFields.join(', ')}`, 'info');
            elements.migrationRequired.textContent = `Oui (${missingFields.length} champs)`;
            return true;
        }

        addLog('Tous les champs sont présents', 'success');
        elements.migrationRequired.textContent = 'Non';
        return false;

    } catch (error) {
        console.error('Erreur lors de la vérification:', error);
        addLog(`Erreur: ${error.message}`, 'error');
        elements.migrationRequired.textContent = 'Erreur';
        return false;
    }
}

async function migrateUserAccount(userId, userEmail) {
    try {
        setButtonLoading(true);
        updateStatus('Migration en cours...', 'pending');
        addLog('Début de la migration...', 'info');

        const userRef = doc(db, 'users', userId);
        const snapshot = await getDoc(userRef);

        if (!snapshot.exists()) {
            // Créer un nouveau compte
            addLog('Création d\'un nouveau document utilisateur...', 'info');

            const newUserData = {
                email: userEmail || null,
                createdAt: new Date().toISOString(),
                ...REQUIRED_FIELDS
            };

            // Ne pas inclure l'email si null
            if (!newUserData.email) {
                delete newUserData.email;
            }

            await setDoc(userRef, newUserData);
            addLog('Compte créé avec succès!', 'success');

        } else {
            // Mettre à jour le compte existant
            addLog('Mise à jour du compte existant...', 'info');

            const currentData = snapshot.data();
            const updates = {};

            // Ajouter les champs manquants
            for (const [field, defaultValue] of Object.entries(REQUIRED_FIELDS)) {
                if (currentData[field] === undefined) {
                    updates[field] = defaultValue;
                    addLog(`+ Ajout du champ: ${field}`, 'info');
                }
            }

            // Ajouter createdAt si manquant
            if (!currentData.createdAt) {
                updates.createdAt = new Date().toISOString();
                addLog('+ Ajout de createdAt', 'info');
            }

            // Ajouter email si manquant
            if (!currentData.email && userEmail) {
                updates.email = userEmail;
                addLog('+ Ajout de l\'email', 'info');
            }

            if (Object.keys(updates).length > 0) {
                await updateDoc(userRef, updates);
                addLog(`${Object.keys(updates).length} champ(s) mis à jour`, 'success');
            } else {
                addLog('Aucune mise à jour nécessaire', 'info');
            }
        }

        updateStatus('Migration réussie', 'success');
        addLog('Migration terminée avec succès!', 'success');

        // Rediriger après 2 secondes
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);

    } catch (error) {
        console.error('Erreur lors de la migration:', error);
        addLog(`ERREUR: ${error.message}`, 'error');
        updateStatus('Échec de la migration', 'error');

        if (error.code === 'permission-denied') {
            addLog('Permissions insuffisantes. Veuillez contacter le support.', 'error');
        }

        setButtonLoading(false);
    }
}

// Authentification
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'pages/auth/login.html';
        return;
    }

    currentUser = user;
    elements.userEmail.textContent = user.email || 'Utilisateur anonyme';
    addLog(`Utilisateur connecté: ${user.email || user.uid}`, 'info');

    // Vérifier si la migration est nécessaire
    migrationNeeded = await checkMigrationNeeded(user.uid);

    if (migrationNeeded) {
        elements.migrateBtn.disabled = false;
        updateStatus('Migration requise', 'pending');
    } else {
        updateStatus('Compte à jour', 'success');
        elements.migrateBtn.disabled = true;
        elements.migrateBtn.querySelector('.btn-text').textContent = 'Déjà à jour';

        // Rediriger automatiquement après 2 secondes
        addLog('Redirection dans 2 secondes...', 'info');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
    }
});

// Bouton de migration
elements.migrateBtn.addEventListener('click', async () => {
    if (!currentUser || !migrationNeeded) return;

    await migrateUserAccount(currentUser.uid, currentUser.email);
});

// Bouton "Passer"
elements.skipBtn.addEventListener('click', () => {
    if (confirm('Êtes-vous sûr de vouloir passer la migration ? Vous pourriez rencontrer des erreurs.')) {
        window.location.href = 'index.html';
    }
});
