/**
 * Global Deposit Modal Initializer
 * This script should be included on all pages to enable the deposit modal
 */
import { initializeDepositModal, openDepositModal } from 'js/components/deposit-modal.js';

// Initialize the deposit modal when the page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeDepositModal();

    // Hook up all deposit buttons on the page
    const depositButtons = document.querySelectorAll('#depositBtn, .btn-deposit-trigger');
    depositButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            openDepositModal();
        });
    });
});
