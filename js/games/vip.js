import { auth, signOut, onAuthStateChanged } from '../core/firebase-config.js';
import { initializeUserBalance, subscribeToUserData, addFunds, claimRakeback as claimRakebackTransaction } from '../core/balance-manager.js';

let currentUser = null;
let unsubscribeUser = null;
let balance = 0;
let balanceLoaded = false;
let userData = null;

// VIP Tier Configuration
const VIP_TIERS = {
    bronze: {
        name: 'Bronze',
        icon: '🥉',
        wagerRequired: 0,
        rakeback: 0.01,
        weeklyBonus: 0,
        reloadBonus: 0,
        birthdayBonus: 0,
        benefits: [
            '💰 Rakeback: 1%',
            '🎁 Bonus de bienvenue',
            '🎮 Accès à tous les jeux'
        ]
    },
    silver: {
        name: 'Argent',
        icon: '🥈',
        wagerRequired: 1000,
        rakeback: 0.02,
        weeklyBonus: 10,
        reloadBonus: 0.05,
        birthdayBonus: 0,
        benefits: [
            '💰 Rakeback: 2%',
            '🎁 Bonus hebdomadaire: 10 €',
            '⚡ Retraits prioritaires',
            '🎯 Bonus de reload: 5%'
        ]
    },
    gold: {
        name: 'Or',
        icon: '🥇',
        wagerRequired: 5000,
        rakeback: 0.03,
        weeklyBonus: 25,
        reloadBonus: 0.10,
        birthdayBonus: 50,
        benefits: [
            '💰 Rakeback: 3%',
            '🎁 Bonus hebdomadaire: 25 €',
            '⚡ Retraits instantanés',
            '🎯 Bonus de reload: 10%',
            '🎂 Bonus d\'anniversaire: 50 €'
        ]
    },
    platinum: {
        name: 'Platine',
        icon: '💎',
        wagerRequired: 25000,
        rakeback: 0.05,
        weeklyBonus: 100,
        reloadBonus: 0.15,
        birthdayBonus: 250,
        benefits: [
            '💰 Rakeback: 5%',
            '🎁 Bonus hebdomadaire: 100 €',
            '⚡ Limites de retrait illimitées',
            '🎯 Bonus de reload: 15%',
            '🎂 Bonus d\'anniversaire: 250 €',
            '🎖️ Manager VIP dédié'
        ]
    },
    diamond: {
        name: 'Diamant',
        icon: '💠',
        wagerRequired: 100000,
        rakeback: 0.08,
        weeklyBonus: 500,
        reloadBonus: 0.25,
        birthdayBonus: 1000,
        benefits: [
            '💰 Rakeback: 8%',
            '🎁 Bonus hebdomadaire: 500 €',
            '⚡ Tout illimité',
            '🎯 Bonus de reload: 25%',
            '🎂 Bonus d\'anniversaire: 1,000 €',
            '🎖️ Manager VIP personnel',
            '🏆 Événements VIP exclusifs',
            '🎰 Jeux exclusifs'
        ]
    }
};

const elements = {
    userBalance: document.getElementById('userBalance'),
    depositBtn: document.getElementById('depositBtn'),
    adminBtn: document.getElementById('adminBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    currentTierDisplay: document.getElementById('currentTierDisplay'),
    tierBadge: document.getElementById('tierBadge'),
    tierName: document.getElementById('tierName'),
    totalWager: document.getElementById('totalWager'),
    nextTierWager: document.getElementById('nextTierWager'),
    nextTierName: document.getElementById('nextTierName'),
    progressPercentage: document.getElementById('progressPercentage'),
    progressFill: document.getElementById('progressFill'),
    remainingWager: document.getElementById('remainingWager'),
    currentBenefits: document.getElementById('currentBenefits'),
    currentRakeback: document.getElementById('currentRakeback'),
    totalRakeback: document.getElementById('totalRakeback'),
    claimRakebackBtn: document.getElementById('claimRakebackBtn'),
    rakebackAvailable: document.getElementById('rakebackAvailable')
};

function updateBalanceDisplay() {
    if (!elements.userBalance) return;
    if (!balanceLoaded) {
        elements.userBalance.textContent = '---';
        return;
    }
    elements.userBalance.textContent = `${balance.toFixed(2)} €`;
}

function getCurrentTier(totalWager) {
    const tiers = ['diamond', 'platinum', 'gold', 'silver', 'bronze'];

    for (const tier of tiers) {
        if (totalWager >= VIP_TIERS[tier].wagerRequired) {
            return tier;
        }
    }

    return 'bronze';
}

function getNextTier(currentTier) {
    const tierOrder = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
    const currentIndex = tierOrder.indexOf(currentTier);

    if (currentIndex < tierOrder.length - 1) {
        return tierOrder[currentIndex + 1];
    }

    return null; // Max tier reached
}

function updateVIPDisplay() {
    if (!userData) return;

    const totalWager = userData.totalWager || 0;
    const currentTier = getCurrentTier(totalWager);
    const nextTier = getNextTier(currentTier);
    const tierConfig = VIP_TIERS[currentTier];

    // Update current tier display
    elements.tierBadge.textContent = `${tierConfig.icon} ${tierConfig.name}`;
    elements.tierName.textContent = tierConfig.name;
    elements.totalWager.textContent = `${totalWager.toFixed(2)} €`;

    // Update rakeback display
    const rakebackPercentage = (tierConfig.rakeback * 100).toFixed(0);
    elements.currentRakeback.textContent = `${rakebackPercentage}%`;

    const totalRakebackEarned = userData.totalRakebackEarned || 0;
    elements.totalRakeback.textContent = `${totalRakebackEarned.toFixed(2)} €`;

    const rakebackAvailable = userData.rakebackAvailable || 0;
    elements.rakebackAvailable.textContent = `${rakebackAvailable.toFixed(2)} €`;
    elements.claimRakebackBtn.disabled = rakebackAvailable <= 0;

    // Update current benefits
    elements.currentBenefits.innerHTML = '';
    tierConfig.benefits.forEach(benefit => {
        const benefitDiv = document.createElement('div');
        benefitDiv.className = 'benefit-item';
        const [icon, ...textParts] = benefit.split(' ');
        benefitDiv.innerHTML = `
            <span class="benefit-icon">${icon}</span>
            <span class="benefit-text">${textParts.join(' ')}</span>
        `;
        elements.currentBenefits.appendChild(benefitDiv);
    });

    // Update progress to next tier
    if (nextTier) {
        const nextTierConfig = VIP_TIERS[nextTier];
        const requiredWager = nextTierConfig.wagerRequired;
        const previousTierWager = tierConfig.wagerRequired;
        const progress = ((totalWager - previousTierWager) / (requiredWager - previousTierWager)) * 100;
        const clampedProgress = Math.min(100, Math.max(0, progress));

        elements.nextTierName.textContent = nextTierConfig.name;
        elements.nextTierWager.textContent = `${requiredWager.toFixed(2)} €`;
        elements.progressPercentage.textContent = `${clampedProgress.toFixed(1)}%`;
        elements.progressFill.style.width = `${clampedProgress}%`;

        const remaining = Math.max(0, requiredWager - totalWager);
        elements.remainingWager.textContent = `${remaining.toFixed(2)} €`;
    } else {
        // Max tier reached
        elements.nextTierName.textContent = 'Niveau Max';
        elements.nextTierWager.textContent = 'Atteint';
        elements.progressPercentage.textContent = '100%';
        elements.progressFill.style.width = '100%';
        elements.remainingWager.textContent = '0.00 €';
    }

    // Highlight current tier card
    document.querySelectorAll('.tier-card').forEach(card => {
        card.classList.remove('active');
        if (card.dataset.tier === currentTier) {
            card.classList.add('active');
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });
}

async function claimRakeback() {
    if (!currentUser || !userData) return;

    const rakebackAvailable = userData.rakebackAvailable || 0;
    if (rakebackAvailable <= 0) {
        alert('Aucun rakeback disponible à réclamer.');
        return;
    }

    // Disable button during claim
    elements.claimRakebackBtn.disabled = true;
    elements.claimRakebackBtn.innerHTML = '<span>Réclamation en cours...</span>';

    try {
        const result = await claimRakebackTransaction(currentUser.uid);
        alert(`Rakeback de ${result.rakebackClaimed.toFixed(2)} € réclamé avec succès !`);
    } catch (error) {
        console.error('Error claiming rakeback:', error);
        if (error.message === 'NO_RAKEBACK_AVAILABLE') {
            alert('Aucun rakeback disponible à réclamer.');
        } else {
            alert('Erreur lors de la réclamation du rakeback.');
        }
    } finally {
        // Button will be re-enabled automatically when userData updates via subscription
        elements.claimRakebackBtn.innerHTML = '<span>Réclamer le rakeback</span><span class="claim-amount" id="rakebackAvailable">0.00 €</span>';
    }
}

function setupEventListeners() {
    elements.claimRakebackBtn.addEventListener('click', claimRakeback);

    elements.depositBtn.addEventListener('click', async () => {
        if (!currentUser) {
            alert('Veuillez vous connecter');
            return;
        }

        const amount = prompt('Montant à déposer (€):');
        const depositAmount = parseFloat(amount);
        if (amount && !isNaN(depositAmount) && depositAmount > 0) {
            try {
                //await addFunds(currentUser.uid, depositAmount);
                alert(`${depositAmount.toFixed(2)} € ajoutés à votre solde!`);
            } catch (error) {
                console.error('Error adding funds:', error);
                alert('Erreur lors du dépôt');
            }
        }
    });

    elements.adminBtn.addEventListener('click', () => {
        window.location.href = 'pages/admin/admin.html';
    });

    elements.logoutBtn.addEventListener('click', async () => {
        try {
            if (unsubscribeUser) {
                unsubscribeUser();
            }
            await signOut(auth);
            window.location.href = 'pages/auth/login.html';
        } catch (error) {
            console.error('Error signing out:', error);
        }
    });
}

function init() {
    setupEventListeners();
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
        userData = data;

        updateBalanceDisplay();
        updateVIPDisplay();
    });
});

init();
