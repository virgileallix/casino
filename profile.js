import { auth, onAuthStateChanged, signOut, db, updateDoc, doc } from './firebase-config.js';
import { initializeUserBalance, subscribeToUserData, addFunds, getUserProfile, updateUsername } from './balance-manager.js';

let currentUser = null;
let unsubscribeBalance = null;
let profileUserId = null;

const balanceElement = document.getElementById('userBalance');
const profileContent = document.getElementById('profileContent');

// VIP Tiers
const VIP_TIERS = [
    { name: 'Bronze', minWager: 0, icon: '🥉', color: '#CD7F32' },
    { name: 'Silver', minWager: 1000, icon: '🥈', color: '#C0C0C0' },
    { name: 'Gold', minWager: 5000, icon: '🥇', color: '#FFD700' },
    { name: 'Platinum', minWager: 25000, icon: '💎', color: '#E5E4E2' },
    { name: 'Diamond', minWager: 100000, icon: '👑', color: '#B9F2FF' }
];

function getVIPTier(totalWager) {
    for (let i = VIP_TIERS.length - 1; i >= 0; i--) {
        if (totalWager >= VIP_TIERS[i].minWager) {
            return VIP_TIERS[i];
        }
    }
    return VIP_TIERS[0];
}

function getUserInitials(email, username) {
    if (username) {
        return username.substring(0, 2).toUpperCase();
    }
    if (email) {
        return email.substring(0, 2).toUpperCase();
    }
    return '??';
}

function getUserDisplayName(email, username) {
    if (username) {
        return username;
    }
    if (email) {
        const [name] = email.split('@');
        return name;
    }
    return 'Joueur Anonyme';
}

function formatCurrency(value) {
    return `${(value || 0).toFixed(2)} €`;
}

// Get user ID from URL
const urlParams = new URLSearchParams(window.location.search);
profileUserId = urlParams.get('id');

// Auth state
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

    unsubscribeBalance = subscribeToUserData(user.uid, (userData) => {
        if (userData) {
            balanceElement.textContent = formatCurrency(userData.balance);
        }
    });

    // If no ID specified, show current user's profile
    if (!profileUserId) {
        profileUserId = user.uid;
    }

    await loadProfile();
});

// Logout
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
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

// Deposit
document.getElementById('depositBtn')?.addEventListener('click', async () => {
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

async function loadProfile() {
    try {
        const userData = await getUserProfile(profileUserId);

        if (!userData) {
            profileContent.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">😕</div>
                    <p>Profil introuvable</p>
                </div>
            `;
            return;
        }

        renderProfile(userData);
    } catch (error) {
        console.error('Error loading profile:', error);
        profileContent.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">❌</div>
                <p>Erreur lors du chargement du profil</p>
            </div>
        `;
    }
}

function renderProfile(userData) {
    const isOwnProfile = currentUser && profileUserId === currentUser.uid;
    const vipTier = getVIPTier(userData.totalWager || 0);
    const displayName = getUserDisplayName(userData.email, userData.username);
    const initials = getUserInitials(userData.email, userData.username);

    const netProfit = (userData.totalWon || 0) - (userData.totalWagered || 0);
    const winRate = userData.gamesPlayed > 0
        ? ((userData.diceWins || 0) / (userData.diceGamesPlayed || 1)) * 100
        : 0;

    // Check if profile is private and user is not owner
    if (userData.isPrivate && !isOwnProfile) {
        profileContent.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔒</div>
                <p>Ce profil est privé</p>
            </div>
        `;
        return;
    }

    const settingsSidebar = isOwnProfile ? renderSettingsSidebar(userData) : '';

    // Calculate VIP progress
    const currentTierIndex = VIP_TIERS.findIndex(tier => tier.name === vipTier.name);
    const nextTier = currentTierIndex < VIP_TIERS.length - 1 ? VIP_TIERS[currentTierIndex + 1] : null;
    const vipProgress = nextTier
        ? ((userData.totalWager - vipTier.minWager) / (nextTier.minWager - vipTier.minWager)) * 100
        : 100;
    const remainingWager = nextTier ? nextTier.minWager - userData.totalWager : 0;

    profileContent.innerHTML = `
        <div class="profile-layout">
            <div class="profile-main">
                <div class="profile-header">
                    <div class="profile-avatar">${initials}</div>
                    <div class="profile-info">
                        <h1 class="profile-name">${displayName}</h1>
                        <p class="profile-email">${userData.email || ''}</p>
                        <div style="margin-top: 0.75rem;">
                            <span class="profile-vip" style="color: ${vipTier.color}">
                                ${vipTier.icon} ${vipTier.name}
                            </span>
                        </div>
                        ${nextTier ? `
                            <div style="margin-top: 1rem;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                    <span style="font-size: 0.85rem; color: var(--text-secondary);">
                                        Prochain niveau: ${nextTier.icon} ${nextTier.name}
                                    </span>
                                    <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary);">
                                        ${vipProgress.toFixed(1)}%
                                    </span>
                                </div>
                                <div style="width: 100%; height: 8px; background: var(--secondary-bg); border-radius: 4px; overflow: hidden;">
                                    <div style="width: ${Math.min(100, vipProgress)}%; height: 100%; background: linear-gradient(90deg, var(--primary-color), var(--secondary-color)); transition: width 0.3s;"></div>
                                </div>
                                <span style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem; display: block;">
                                    Encore ${formatCurrency(remainingWager)} à miser
                                </span>
                            </div>
                        ` : `
                            <div style="margin-top: 1rem;">
                                <span style="font-size: 0.85rem; color: var(--success-color); font-weight: 600;">
                                    ✨ Niveau maximum atteint !
                                </span>
                            </div>
                        `}
                    </div>
                </div>

                <div class="profile-stats-grid">
            <div class="profile-stat-card">
                <div class="profile-stat-header">
                    <span class="profile-stat-title">Parties jouées</span>
                    <span class="profile-stat-icon">🎮</span>
                </div>
                <div class="profile-stat-value">${userData.gamesPlayed || 0}</div>
                <div class="profile-stat-label">Total de parties</div>
            </div>

            <div class="profile-stat-card">
                <div class="profile-stat-header">
                    <span class="profile-stat-title">Total misé</span>
                    <span class="profile-stat-icon">💰</span>
                </div>
                <div class="profile-stat-value">${formatCurrency(userData.totalWagered)}</div>
                <div class="profile-stat-label">Argent total misé</div>
            </div>

            <div class="profile-stat-card">
                <div class="profile-stat-header">
                    <span class="profile-stat-title">Total gagné</span>
                    <span class="profile-stat-icon">🎯</span>
                </div>
                <div class="profile-stat-value">${formatCurrency(userData.totalWon)}</div>
                <div class="profile-stat-label">Gains totaux</div>
            </div>

            <div class="profile-stat-card">
                <div class="profile-stat-header">
                    <span class="profile-stat-title">Profit net</span>
                    <span class="profile-stat-icon">📈</span>
                </div>
                <div class="profile-stat-value ${netProfit >= 0 ? 'stat-positive' : 'stat-negative'}">
                    ${formatCurrency(netProfit)}
                </div>
                <div class="profile-stat-label">Résultat global</div>
            </div>
        </div>

        <div class="profile-games-section">
            <h2 class="profile-games-title">📊 Statistiques par jeu</h2>
            <div class="game-stats-grid">
                ${renderGameStats('Dice', '🎲', {
                    'Parties': userData.diceGamesPlayed || 0,
                    'Victoires': userData.diceWins || 0,
                    'Taux de victoire': `${winRate.toFixed(1)}%`,
                    'Meilleur gain': formatCurrency(userData.diceBestWin)
                })}

                ${renderGameStats('Plinko', '🎯', {
                    'Parties': userData.plinkoGamesPlayed || 0,
                    'Total gagné': formatCurrency(userData.plinkoTotalWon),
                    'Meilleur gain': formatCurrency(userData.plinkoBestWin)
                })}

                ${renderGameStats('Blackjack', '🃏', {
                    'Mains': userData.blackjackHandsPlayed || 0,
                    'Victoires': userData.blackjackWins || 0,
                    'Blackjacks': userData.blackjackBlackjacks || 0,
                    'Profit': formatCurrency(userData.blackjackTotalProfit)
                })}

                ${renderGameStats('Mines', '💣', {
                    'Parties': userData.minesGamesPlayed || 0,
                    'Cashouts': userData.minesCashouts || 0,
                    'Meilleur multi': `${(userData.minesBestMultiplier || 0).toFixed(2)}x`,
                    'Profit': formatCurrency(userData.minesTotalProfit)
                })}

                ${renderGameStats('Tower', '🗼', {
                    'Parties': userData.towerGamesPlayed || 0,
                    'Cashouts': userData.towerCashouts || 0,
                    'Meilleur multi': `${(userData.towerBestMultiplier || 0).toFixed(2)}x`,
                    'Profit': formatCurrency(userData.towerTotalProfit)
                })}
                </div>
            </div>
            </div>
            ${settingsSidebar}
        </div>
    `;

    // Setup event listeners if own profile
    if (isOwnProfile) {
        setupSettingsListeners(userData);
    }
}

function renderGameStats(name, icon, stats) {
    const statItems = Object.entries(stats)
        .map(([label, value]) => `<div>${label}: <strong>${value}</strong></div>`)
        .join('');

    return `
        <div class="game-stat-item">
            <div class="game-stat-name">
                <span>${icon}</span>
                <span>${name}</span>
            </div>
            <div class="game-stat-details">
                ${statItems}
            </div>
        </div>
    `;
}

function renderSettingsSidebar(userData) {
    return `
        <div class="profile-sidebar">
            <div class="settings-card">
                <h3 class="settings-title">⚙️ Paramètres</h3>

                <div class="settings-item">
                    <div class="settings-item-header">
                        <span class="settings-item-label">Profil privé</span>
                        <div class="toggle-switch ${userData.isPrivate ? 'active' : ''}" id="privateToggle">
                            <div class="toggle-switch-handle"></div>
                        </div>
                    </div>
                    <div class="settings-item-description">
                        Masquer votre profil aux autres joueurs
                    </div>
                </div>

                <div class="settings-item">
                    <div class="settings-item-header">
                        <span class="settings-item-label">Pseudo</span>
                    </div>
                    <input
                        type="text"
                        class="settings-input"
                        id="usernameInput"
                        value="${userData.username || ''}"
                        placeholder="Votre pseudo (3-16 caractères)"
                        maxlength="16"
                    />
                    <button class="settings-button primary" id="saveUsernameBtn" style="margin-top: 0.5rem;">
                        💾 Enregistrer le pseudo
                    </button>
                </div>
            </div>

            <div class="settings-card">
                <h3 class="settings-title">📊 Statistiques</h3>
                <div class="settings-item">
                    <div class="settings-item-header">
                        <span class="settings-item-label">Membre depuis</span>
                    </div>
                    <div class="settings-item-description">
                        ${userData.createdAt ? new Date(userData.createdAt).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                        }) : 'Date inconnue'}
                    </div>
                </div>
                <div class="settings-item">
                    <div class="settings-item-header">
                        <span class="settings-item-label">Solde actuel</span>
                    </div>
                    <div class="settings-item-description">
                        ${formatCurrency(userData.balance)}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function setupSettingsListeners(userData) {
    // Private toggle
    const privateToggle = document.getElementById('privateToggle');
    if (privateToggle) {
        privateToggle.addEventListener('click', async () => {
            const newValue = !userData.isPrivate;
            try {
                await updateProfilePrivacy(currentUser.uid, newValue);
                await loadProfile();
            } catch (error) {
                alert('Erreur lors de la mise à jour de la confidentialité');
            }
        });
    }

    // Username save button
    const saveUsernameBtn = document.getElementById('saveUsernameBtn');
    const usernameInput = document.getElementById('usernameInput');
    if (saveUsernameBtn && usernameInput) {
        saveUsernameBtn.addEventListener('click', async () => {
            const newUsername = usernameInput.value.trim();
            if (!newUsername) {
                alert('Le pseudo ne peut pas être vide');
                return;
            }

            try {
                await updateUsername(currentUser.uid, newUsername);
                alert('Pseudo mis à jour avec succès !');
                await loadProfile();
            } catch (error) {
                alert(error.message || 'Erreur lors de la mise à jour du pseudo');
            }
        });
    }
}

async function updateProfilePrivacy(userId, isPrivate) {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { isPrivate });
}
