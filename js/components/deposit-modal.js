import { auth, onAuthStateChanged } from '../core/firebase-config.js';
import { addFunds, subscribeToUserData } from '../core/balance-manager.js';

let currentUser = null;
let depositModal = null;
let currentMethod = 'card';

// Create and inject modal HTML
function createDepositModal() {
    const modalHTML = `
        <div id="depositModal" class="deposit-modal">
            <div class="deposit-modal-overlay"></div>
            <div class="deposit-modal-content">
                <div class="deposit-modal-header">
                    <h2>Effectuer un dépôt</h2>
                    <button class="deposit-modal-close" id="closeDepositModal">&times;</button>
                </div>

                <div class="deposit-modal-body">
                    <!-- Payment Methods -->
                    <div class="payment-methods-tabs">
                        <button class="payment-tab active" data-method="card">
                            <span class="tab-icon">💳</span>
                            <span>Carte</span>
                        </button>
                        <button class="payment-tab" data-method="crypto">
                            <span class="tab-icon">₿</span>
                            <span>Crypto</span>
                        </button>
                        <button class="payment-tab" data-method="bank">
                            <span class="tab-icon">🏦</span>
                            <span>Virement</span>
                        </button>
                        <button class="payment-tab" data-method="ewallet">
                            <span class="tab-icon">💰</span>
                            <span>E-Wallet</span>
                        </button>
                    </div>

                    <!-- Card Form -->
                    <div class="payment-form active" id="cardPaymentForm">
                        <div class="form-group">
                            <label>Montant du dépôt</label>
                            <div class="amount-input-wrapper">
                                <input type="number" id="cardAmount" class="deposit-amount-input" placeholder="0.00" min="10" step="0.01">
                                <span class="currency">€</span>
                            </div>
                            <div class="quick-amounts">
                                <button class="quick-btn" data-amount="10">10€</button>
                                <button class="quick-btn" data-amount="25">25€</button>
                                <button class="quick-btn" data-amount="50">50€</button>
                                <button class="quick-btn" data-amount="100">100€</button>
                                <button class="quick-btn" data-amount="250">250€</button>
                                <button class="quick-btn" data-amount="500">500€</button>
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Numéro de carte</label>
                            <input type="text" class="deposit-input" placeholder="1234 5678 9012 3456" maxlength="19">
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label>Expiration</label>
                                <input type="text" class="deposit-input" placeholder="MM/AA" maxlength="5">
                            </div>
                            <div class="form-group">
                                <label>CVV</label>
                                <input type="text" class="deposit-input" placeholder="123" maxlength="3">
                            </div>
                        </div>

                        <div class="deposit-summary">
                            <div class="summary-row">
                                <span>Montant</span>
                                <span id="cardSummaryAmount">0.00 €</span>
                            </div>
                            <div class="summary-row">
                                <span>Frais</span>
                                <span class="success">Gratuit</span>
                            </div>
                            <div class="summary-row total">
                                <span>Total</span>
                                <span id="cardSummaryTotal">0.00 €</span>
                            </div>
                        </div>

                        <button class="btn-confirm-deposit" id="confirmCardDeposit">
                            Confirmer le dépôt
                        </button>

                        <div class="security-badge">
                            <span>🔒</span>
                            <span>Paiement 100% sécurisé</span>
                        </div>
                    </div>

                    <!-- Crypto Form -->
                    <div class="payment-form" id="cryptoPaymentForm">
                        <div class="form-group">
                            <label>Cryptomonnaie</label>
                            <select class="deposit-input" id="cryptoType">
                                <option value="btc">Bitcoin (BTC)</option>
                                <option value="eth">Ethereum (ETH)</option>
                                <option value="usdt">Tether (USDT)</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label>Montant du dépôt</label>
                            <div class="amount-input-wrapper">
                                <input type="number" id="cryptoAmount" class="deposit-amount-input" placeholder="0.00" min="10" step="0.01">
                                <span class="currency">€</span>
                            </div>
                            <div class="quick-amounts">
                                <button class="quick-btn" data-amount="10">10€</button>
                                <button class="quick-btn" data-amount="50">50€</button>
                                <button class="quick-btn" data-amount="100">100€</button>
                                <button class="quick-btn" data-amount="250">250€</button>
                                <button class="quick-btn" data-amount="500">500€</button>
                                <button class="quick-btn" data-amount="1000">1000€</button>
                            </div>
                        </div>

                        <div class="crypto-info">
                            <div class="crypto-address-box">
                                <label>Adresse de dépôt</label>
                                <div class="address-copy">
                                    <code>bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh</code>
                                    <button class="btn-copy-address">Copier</button>
                                </div>
                            </div>

                            <div class="crypto-warning">
                                <strong>⚠️ Important:</strong> Envoyez uniquement des Bitcoin à cette adresse.
                            </div>
                        </div>

                        <button class="btn-confirm-deposit" id="confirmCryptoDeposit">
                            J'ai effectué le paiement
                        </button>
                    </div>

                    <!-- Bank Transfer Form -->
                    <div class="payment-form" id="bankPaymentForm">
                        <div class="form-group">
                            <label>Montant du dépôt</label>
                            <div class="amount-input-wrapper">
                                <input type="number" id="bankAmount" class="deposit-amount-input" placeholder="0.00" min="50" step="0.01">
                                <span class="currency">€</span>
                            </div>
                            <div class="quick-amounts">
                                <button class="quick-btn" data-amount="50">50€</button>
                                <button class="quick-btn" data-amount="100">100€</button>
                                <button class="quick-btn" data-amount="250">250€</button>
                                <button class="quick-btn" data-amount="500">500€</button>
                                <button class="quick-btn" data-amount="1000">1000€</button>
                            </div>
                        </div>

                        <div class="bank-details">
                            <h4>Coordonnées bancaires</h4>
                            <div class="bank-row">
                                <span>IBAN:</span>
                                <strong>FR76 1234 5678 9012 3456 7890 123</strong>
                            </div>
                            <div class="bank-row">
                                <span>BIC:</span>
                                <strong>ABCDEFGHXXX</strong>
                            </div>
                            <div class="bank-row">
                                <span>Référence:</span>
                                <strong id="bankRef">USER-12345678</strong>
                            </div>
                        </div>

                        <div class="crypto-warning">
                            <strong>⚠️ Important:</strong> Indiquez la référence lors de votre virement.
                        </div>

                        <button class="btn-confirm-deposit" id="confirmBankDeposit">
                            Confirmer le dépôt
                        </button>
                    </div>

                    <!-- E-Wallet Form -->
                    <div class="payment-form" id="ewalletPaymentForm">
                        <div class="form-group">
                            <label>Fournisseur</label>
                            <select class="deposit-input" id="ewalletType">
                                <option value="paypal">PayPal</option>
                                <option value="skrill">Skrill</option>
                                <option value="neteller">Neteller</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label>Montant du dépôt</label>
                            <div class="amount-input-wrapper">
                                <input type="number" id="ewalletAmount" class="deposit-amount-input" placeholder="0.00" min="10" step="0.01">
                                <span class="currency">€</span>
                            </div>
                            <div class="quick-amounts">
                                <button class="quick-btn" data-amount="10">10€</button>
                                <button class="quick-btn" data-amount="25">25€</button>
                                <button class="quick-btn" data-amount="50">50€</button>
                                <button class="quick-btn" data-amount="100">100€</button>
                                <button class="quick-btn" data-amount="250">250€</button>
                            </div>
                        </div>

                        <div class="deposit-summary">
                            <div class="summary-row">
                                <span>Montant</span>
                                <span id="ewalletSummaryAmount">0.00 €</span>
                            </div>
                            <div class="summary-row">
                                <span>Frais (2.5%)</span>
                                <span class="warning" id="ewalletFees">0.00 €</span>
                            </div>
                            <div class="summary-row total">
                                <span>Total</span>
                                <span id="ewalletSummaryTotal">0.00 €</span>
                            </div>
                        </div>

                        <button class="btn-confirm-deposit" id="confirmEwalletDeposit">
                            Confirmer le dépôt
                        </button>

                        <div class="security-badge">
                            <span>🔒</span>
                            <span>Redirection vers page de paiement sécurisée</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Inject modal into body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    depositModal = document.getElementById('depositModal');
    setupModalEventListeners();
}

function setupModalEventListeners() {
    // Close modal
    document.getElementById('closeDepositModal').addEventListener('click', closeDepositModal);
    document.querySelector('.deposit-modal-overlay').addEventListener('click', closeDepositModal);

    // Tab switching
    document.querySelectorAll('.payment-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const method = tab.dataset.method;
            switchPaymentMethod(method);
        });
    });

    // Quick amount buttons
    document.querySelectorAll('.quick-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const amount = parseFloat(btn.dataset.amount);
            const form = btn.closest('.payment-form');
            const input = form.querySelector('.deposit-amount-input');
            if (input) {
                input.value = amount.toFixed(2);
                input.dispatchEvent(new Event('input'));
            }
        });
    });

    // Amount input listeners
    document.getElementById('cardAmount').addEventListener('input', updateCardSummary);
    document.getElementById('ewalletAmount').addEventListener('input', updateEwalletSummary);

    // Confirm buttons
    document.getElementById('confirmCardDeposit').addEventListener('click', processCardDeposit);
    document.getElementById('confirmCryptoDeposit').addEventListener('click', processCryptoDeposit);
    document.getElementById('confirmBankDeposit').addEventListener('click', processBankDeposit);
    document.getElementById('confirmEwalletDeposit').addEventListener('click', processEwalletDeposit);

    // Copy address button
    const copyBtn = document.querySelector('.btn-copy-address');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const address = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
            navigator.clipboard.writeText(address).then(() => {
                copyBtn.textContent = 'Copié!';
                setTimeout(() => {
                    copyBtn.textContent = 'Copier';
                }, 2000);
            });
        });
    }
}

function switchPaymentMethod(method) {
    currentMethod = method;

    // Update tabs
    document.querySelectorAll('.payment-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.method === method);
    });

    // Update forms
    document.querySelectorAll('.payment-form').forEach(form => {
        form.classList.remove('active');
    });

    const formMap = {
        card: 'cardPaymentForm',
        crypto: 'cryptoPaymentForm',
        bank: 'bankPaymentForm',
        ewallet: 'ewalletPaymentForm'
    };

    const activeForm = document.getElementById(formMap[method]);
    if (activeForm) {
        activeForm.classList.add('active');
    }
}

function updateCardSummary() {
    const amount = parseFloat(document.getElementById('cardAmount').value) || 0;
    document.getElementById('cardSummaryAmount').textContent = `${amount.toFixed(2)} €`;
    document.getElementById('cardSummaryTotal').textContent = `${amount.toFixed(2)} €`;
}

function updateEwalletSummary() {
    const amount = parseFloat(document.getElementById('ewalletAmount').value) || 0;
    const fees = amount * 0.025;
    const total = amount + fees;

    document.getElementById('ewalletSummaryAmount').textContent = `${amount.toFixed(2)} €`;
    document.getElementById('ewalletFees').textContent = `${fees.toFixed(2)} €`;
    document.getElementById('ewalletSummaryTotal').textContent = `${total.toFixed(2)} €`;
}

async function processCardDeposit() {
    const amount = parseFloat(document.getElementById('cardAmount').value);

    if (!amount || amount < 10) {
        alert('Le montant minimum est de 10 €');
        return;
    }

    if (!currentUser) {
        alert('Veuillez vous connecter');
        return;
    }

    const btn = document.getElementById('confirmCardDeposit');
    btn.disabled = true;
    btn.textContent = 'Traitement en cours...';

    try {
        // Simulate payment processing
        await new Promise(resolve => setTimeout(resolve, 2000));

        //await addFunds(currentUser.uid, amount);
        alert(`Dépôt de ${amount.toFixed(2)} € n'a pas été effectué avec succès!`);
        closeDepositModal();
    } catch (error) {
        console.error('Error processing deposit:', error);
        alert('Erreur lors du traitement du dépôt');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Confirmer le dépôt';
    }
}

async function processCryptoDeposit() {
    const amount = parseFloat(document.getElementById('cryptoAmount').value);

    if (!amount || amount < 10) {
        alert('Le montant minimum est de 10 €');
        return;
    }

    alert('Votre dépôt crypto est en attente de confirmation. Vous serez crédité une fois la transaction confirmée (3 confirmations).');
    closeDepositModal();
}

async function processBankDeposit() {
    const amount = parseFloat(document.getElementById('bankAmount').value);

    if (!amount || amount < 50) {
        alert('Le montant minimum est de 50 € pour un virement bancaire');
        return;
    }

    alert('Votre demande de virement a été enregistrée. Effectuez le virement en indiquant la référence. Le traitement prend 1-3 jours ouvrés.');
    closeDepositModal();
}

async function processEwalletDeposit() {
    const amount = parseFloat(document.getElementById('ewalletAmount').value);

    if (!amount || amount < 10) {
        alert('Le montant minimum est de 10 €');
        return;
    }

    if (!currentUser) {
        alert('Veuillez vous connecter');
        return;
    }

    const btn = document.getElementById('confirmEwalletDeposit');
    btn.disabled = true;
    btn.textContent = 'Redirection...';

    try {
        // Simulate payment processing with fees
        await new Promise(resolve => setTimeout(resolve, 2000));

        const fees = amount * 0.025;
        //await addFunds(currentUser.uid, amount);
        alert(`Dépôt de ${amount.toFixed(2)} € n'a pas été effectué avec succès! (Frais: ${fees.toFixed(2)} €)`);
        closeDepositModal();
    } catch (error) {
        console.error('Error processing deposit:', error);
        alert('Erreur lors du traitement du dépôt');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Confirmer le dépôt';
    }
}

export function openDepositModal() {
    if (!depositModal) {
        createDepositModal();
    }
    depositModal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

export function closeDepositModal() {
    if (depositModal) {
        depositModal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Initialize on auth state change
onAuthStateChanged(auth, (user) => {
    currentUser = user;
});

// Initialize modal on page load
export function initializeDepositModal() {
    // Create modal when script loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createDepositModal);
    } else {
        createDepositModal();
    }
}
