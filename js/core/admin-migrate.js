import { auth, onAuthStateChanged } from '../core/firebase-config.js';
import { isAdmin, getAllUsers } from '../core/balance-manager.js';
import { db, doc, updateDoc, setDoc } from '../core/firebase-config.js';

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

let allUsers = [];

function checkUserNeedsMigration(userData) {
    if (!userData) return true;

    for (const field of Object.keys(REQUIRED_FIELDS)) {
        if (userData[field] === undefined) {
            return true;
        }
    }

    if (!userData.createdAt) {
        return true;
    }

    return false;
}

async function loadUsers() {
    try {
        allUsers = await getAllUsers();
        console.log('Utilisateurs chargés:', allUsers.length);

        const needsMigration = allUsers.filter(user => checkUserNeedsMigration(user));
        const alreadyMigrated = allUsers.length - needsMigration.length;

        document.getElementById('totalUsers').textContent = allUsers.length;
        document.getElementById('needsMigration').textContent = needsMigration.length;
        document.getElementById('alreadyMigrated').textContent = alreadyMigrated;

        renderUserList(allUsers);

        if (needsMigration.length > 0) {
            document.getElementById('migrateAllBtn').disabled = false;
        }

    } catch (error) {
        console.error('Erreur lors du chargement des utilisateurs:', error);
        document.getElementById('userList').innerHTML = `
            <div class="loading-spinner" style="color: #f44336;">
                Erreur: ${error.message}
            </div>
        `;
    }
}

function renderUserList(users) {
    const userList = document.getElementById('userList');
    userList.innerHTML = '';

    if (users.length === 0) {
        userList.innerHTML = '<div class="loading-spinner">Aucun utilisateur trouvé</div>';
        return;
    }

    users.forEach(user => {
        const needsMigration = checkUserNeedsMigration(user);
        const missingFields = [];

        if (needsMigration) {
            for (const [field, defaultValue] of Object.entries(REQUIRED_FIELDS)) {
                if (user[field] === undefined) {
                    missingFields.push(field);
                }
            }
            if (!user.createdAt) {
                missingFields.push('createdAt');
            }
        }

        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        userItem.innerHTML = `
            <div class="user-info">
                <div class="user-email">${user.email || user.id || 'Utilisateur anonyme'}</div>
                <div class="user-status">
                    ${needsMigration
                        ? `${missingFields.length} champ(s) manquant(s): ${missingFields.slice(0, 3).join(', ')}${missingFields.length > 3 ? '...' : ''}`
                        : 'Tous les champs présents'
                    }
                </div>
            </div>
            <span class="user-badge ${needsMigration ? 'needs-migration' : 'migrated'}">
                ${needsMigration ? 'Migration requise' : 'À jour'}
            </span>
        `;
        userList.appendChild(userItem);
    });
}

async function migrateAllUsers() {
    const migrateBtn = document.getElementById('migrateAllBtn');
    migrateBtn.disabled = true;
    migrateBtn.textContent = 'Migration en cours...';

    let successCount = 0;
    let errorCount = 0;

    for (const user of allUsers) {
        if (!checkUserNeedsMigration(user)) {
            continue; // Déjà à jour
        }

        try {
            const userRef = doc(db, 'users', user.id);
            const updates = {};

            // Ajouter les champs manquants
            for (const [field, defaultValue] of Object.entries(REQUIRED_FIELDS)) {
                if (user[field] === undefined) {
                    updates[field] = defaultValue;
                }
            }

            // Ajouter createdAt si manquant
            if (!user.createdAt) {
                updates.createdAt = new Date().toISOString();
            }

            if (Object.keys(updates).length > 0) {
                await updateDoc(userRef, updates);
                successCount++;
                console.log(`✓ Migré: ${user.email || user.id}`);
            }

        } catch (error) {
            errorCount++;
            console.error(`✗ Erreur pour ${user.email || user.id}:`, error);
        }
    }

    alert(`Migration terminée!\n✓ Succès: ${successCount}\n✗ Erreurs: ${errorCount}`);

    // Recharger la liste
    await loadUsers();
    migrateBtn.textContent = 'Migrer tous les comptes';
}

// Vérification admin
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        alert('Vous devez être connecté pour accéder à cette page');
        window.location.href = 'pages/auth/login.html';
        return;
    }

    const userIsAdmin = await isAdmin(user.uid);
    if (!userIsAdmin) {
        alert('Accès refusé. Cette page est réservée aux administrateurs.');
        window.location.href = 'index.html';
        return;
    }

    // Charger les utilisateurs
    await loadUsers();
});

// Bouton de migration
document.getElementById('migrateAllBtn').addEventListener('click', async () => {
    if (confirm('Êtes-vous sûr de vouloir migrer tous les comptes ? Cette opération peut prendre du temps.')) {
        await migrateAllUsers();
    }
});
