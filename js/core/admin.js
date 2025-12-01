import { auth, signOut, onAuthStateChanged } from 'js/core/firebase-config.js';
import {
    isAdmin,
    getAllUsers,
    updateUserBalance,
    setUserAdmin,
    deleteUser,
    resetUserStats
} from 'js/core/balance-manager.js';

let currentUser = null;
let allUsers = [];
let selectedUserId = null;

const VIP_TIERS = [
    { name: 'bronze', wagerRequired: 0 },
    { name: 'silver', wagerRequired: 1000 },
    { name: 'gold', wagerRequired: 5000 },
    { name: 'platinum', wagerRequired: 25000 },
    { name: 'diamond', wagerRequired: 100000 }
];

const elements = {
    adminEmail: document.getElementById('adminEmail'),
    logoutBtn: document.getElementById('logoutBtn'),
    totalUsers: document.getElementById('totalUsers'),
    totalBalance: document.getElementById('totalBalance'),
    totalGames: document.getElementById('totalGames'),
    totalWager: document.getElementById('totalWager'),
    searchUser: document.getElementById('searchUser'),
    refreshBtn: document.getElementById('refreshBtn'),
    usersTableBody: document.getElementById('usersTableBody'),
    editUserModal: document.getElementById('editUserModal'),
    deleteUserModal: document.getElementById('deleteUserModal'),
    resetStatsModal: document.getElementById('resetStatsModal'),
    editUserEmail: document.getElementById('editUserEmail'),
    editUserBalance: document.getElementById('editUserBalance'),
    editUserAdmin: document.getElementById('editUserAdmin'),
    deleteUserEmail: document.getElementById('deleteUserEmail'),
    resetUserEmail: document.getElementById('resetUserEmail')
};

function getUserVIPTier(totalWager) {
    for (let i = VIP_TIERS.length - 1; i >= 0; i--) {
        if (totalWager >= VIP_TIERS[i].wagerRequired) {
            return VIP_TIERS[i].name;
        }
    }
    return 'bronze';
}

function updateStats() {
    if (!allUsers.length) return;

    const totalUsers = allUsers.length;
    const totalBalance = allUsers.reduce((sum, user) => sum + user.balance, 0);
    const totalGames = allUsers.reduce((sum, user) => sum + user.gamesPlayed, 0);
    const totalWager = allUsers.reduce((sum, user) => sum + user.totalWager, 0);

    elements.totalUsers.textContent = totalUsers;
    elements.totalBalance.textContent = `${totalBalance.toFixed(2)} €`;
    elements.totalGames.textContent = totalGames;
    elements.totalWager.textContent = `${totalWager.toFixed(2)} €`;
}

function renderUsersTable(users = allUsers) {
    if (!users.length) {
        elements.usersTableBody.innerHTML = `
            <tr class="loading-row">
                <td colspan="8">Aucun utilisateur trouvé</td>
            </tr>
        `;
        return;
    }

    elements.usersTableBody.innerHTML = users.map(user => {
        const tier = getUserVIPTier(user.totalWager);
        const isAdminUser = user.admin === 1;

        return `
            <tr>
                <td><span class="user-id">${user.id.substring(0, 8)}...</span></td>
                <td><span class="user-email">${user.email || 'N/A'}</span></td>
                <td><span class="balance-cell">${user.balance.toFixed(2)} €</span></td>
                <td>${user.totalWager.toFixed(2)} €</td>
                <td>${user.gamesPlayed}</td>
                <td><span class="vip-badge vip-${tier}">${tier}</span></td>
                <td><span class="admin-badge ${isAdminUser ? 'admin-yes' : 'admin-no'}">${isAdminUser ? 'Oui' : 'Non'}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-action btn-edit" onclick="window.openEditModal('${user.id}')">✏️ Modifier</button>
                        <button class="btn-action btn-reset" onclick="window.openResetModal('${user.id}')">🔄 Reset</button>
                        <button class="btn-action btn-delete" onclick="window.openDeleteModal('${user.id}')">🗑️ Supprimer</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function loadUsers() {
    try {
        elements.usersTableBody.innerHTML = `
            <tr class="loading-row">
                <td colspan="8">Chargement...</td>
            </tr>
        `;

        allUsers = await getAllUsers();
        updateStats();
        renderUsersTable();
    } catch (error) {
        console.error('Error loading users:', error);
        elements.usersTableBody.innerHTML = `
            <tr class="loading-row">
                <td colspan="8">Erreur lors du chargement des utilisateurs</td>
            </tr>
        `;
    }
}

function searchUsers() {
    const query = elements.searchUser.value.toLowerCase().trim();

    if (!query) {
        renderUsersTable();
        return;
    }

    const filtered = allUsers.filter(user => {
        return (
            user.id.toLowerCase().includes(query) ||
            (user.email && user.email.toLowerCase().includes(query))
        );
    });

    renderUsersTable(filtered);
}

// Modal Functions
window.openEditModal = function(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    selectedUserId = userId;
    elements.editUserEmail.value = user.email || 'N/A';
    elements.editUserBalance.value = user.balance.toFixed(2);
    elements.editUserAdmin.value = user.admin;

    elements.editUserModal.classList.add('active');
};

window.openDeleteModal = function(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    selectedUserId = userId;
    elements.deleteUserEmail.textContent = user.email || user.id;

    elements.deleteUserModal.classList.add('active');
};

window.openResetModal = function(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    selectedUserId = userId;
    elements.resetUserEmail.textContent = user.email || user.id;

    elements.resetStatsModal.classList.add('active');
};

function closeAllModals() {
    elements.editUserModal.classList.remove('active');
    elements.deleteUserModal.classList.remove('active');
    elements.resetStatsModal.classList.remove('active');
    selectedUserId = null;
}

async function saveUserEdit() {
    if (!selectedUserId) return;

    try {
        const newBalance = parseFloat(elements.editUserBalance.value);
        const newAdmin = parseInt(elements.editUserAdmin.value);

        if (isNaN(newBalance) || newBalance < 0) {
            alert('Solde invalide');
            return;
        }

        await updateUserBalance(selectedUserId, newBalance);
        await setUserAdmin(selectedUserId, newAdmin === 1);

        alert('Utilisateur modifié avec succès !');
        closeAllModals();
        await loadUsers();
    } catch (error) {
        console.error('Error saving user:', error);
        alert('Erreur lors de la modification');
    }
}

async function confirmDeleteUser() {
    if (!selectedUserId) return;

    try {
        await deleteUser(selectedUserId);
        alert('Utilisateur supprimé avec succès !');
        closeAllModals();
        await loadUsers();
    } catch (error) {
        console.error('Error deleting user:', error);
        alert('Erreur lors de la suppression');
    }
}

async function confirmResetStats() {
    if (!selectedUserId) return;

    try {
        await resetUserStats(selectedUserId);
        alert('Statistiques réinitialisées avec succès !');
        closeAllModals();
        await loadUsers();
    } catch (error) {
        console.error('Error resetting stats:', error);
        alert('Erreur lors de la réinitialisation');
    }
}

function setupEventListeners() {
    // Search
    elements.searchUser.addEventListener('input', searchUsers);

    // Refresh
    elements.refreshBtn.addEventListener('click', loadUsers);

    // Logout
    elements.logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
            window.location.href = 'pages/auth/login.html';
        } catch (error) {
            console.error('Error signing out:', error);
        }
    });

    // Edit Modal
    document.getElementById('closeEditModal').addEventListener('click', closeAllModals);
    document.getElementById('cancelEditBtn').addEventListener('click', closeAllModals);
    document.getElementById('saveEditBtn').addEventListener('click', saveUserEdit);

    // Delete Modal
    document.getElementById('closeDeleteModal').addEventListener('click', closeAllModals);
    document.getElementById('cancelDeleteBtn').addEventListener('click', closeAllModals);
    document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDeleteUser);

    // Reset Modal
    document.getElementById('closeResetModal').addEventListener('click', closeAllModals);
    document.getElementById('cancelResetBtn').addEventListener('click', closeAllModals);
    document.getElementById('confirmResetBtn').addEventListener('click', confirmResetStats);

    // Close modal on background click
    [elements.editUserModal, elements.deleteUserModal, elements.resetStatsModal].forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeAllModals();
            }
        });
    });
}

async function init() {
    setupEventListeners();
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'pages/auth/login.html';
        return;
    }

    currentUser = user;
    elements.adminEmail.textContent = user.email;

    // Check if user is admin
    const userIsAdmin = await isAdmin(user.uid);

    if (!userIsAdmin) {
        alert('Accès refusé. Vous n\'êtes pas administrateur.');
        window.location.href = 'index.html';
        return;
    }

    // Load users
    await loadUsers();
});

init();
