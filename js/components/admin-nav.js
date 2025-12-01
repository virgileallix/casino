import { auth, onAuthStateChanged } from 'js/core/firebase-config.js';
import { isAdmin } from 'js/core/balance-manager.js';

let adminLinkAdded = false;

/**
 * Initialize admin navigation button
 * Adds admin link to navigation if user is admin
 */
export async function initializeAdminNav() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            removeAdminLink();
            return;
        }

        const userIsAdmin = await isAdmin(user.uid);

        if (userIsAdmin && !adminLinkAdded) {
            addAdminLink();
        } else if (!userIsAdmin) {
            removeAdminLink();
        }
    });
}

function addAdminLink() {
    const nav = document.querySelector('.nav');
    if (!nav || adminLinkAdded) return;

    // Check if admin link already exists
    const existingAdminLink = nav.querySelector('[href="admin"]');
    if (existingAdminLink) {
        adminLinkAdded = true;
        return;
    }

    // Create admin link
    const adminLink = document.createElement('a');
    adminLink.href = 'admin';
    adminLink.className = 'nav-link admin-nav-link';
    adminLink.textContent = '⚙️ Admin';
    adminLink.style.cssText = `
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white !important;
        font-weight: 600;
        border-radius: 8px;
        padding: 0.5rem 1rem;
        transition: opacity 0.2s;
    `;

    adminLink.addEventListener('mouseenter', () => {
        adminLink.style.opacity = '0.9';
    });

    adminLink.addEventListener('mouseleave', () => {
        adminLink.style.opacity = '1';
    });

    // Add to end of navigation
    nav.appendChild(adminLink);
    adminLinkAdded = true;
}

function removeAdminLink() {
    const adminLink = document.querySelector('.admin-nav-link');
    if (adminLink) {
        adminLink.remove();
        adminLinkAdded = false;
    }
}
