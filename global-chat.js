import { initializeChat } from './chat.js';
import { auth, onAuthStateChanged } from './firebase-config.js';
import { subscribeToUserData } from './balance-manager.js';

let chatInstance = null;
let currentUser = null;
let isChatOpen = false;
let profileUnsubscribe = null;

export function initializeGlobalChat() {
    const chatContainer = document.getElementById('globalChatContainer');
    const chatToggleBtn = document.getElementById('chatToggleBtn');
    const chatCloseBtn = document.getElementById('chatCloseBtn');

    if (!chatContainer || !chatToggleBtn) {
        console.warn('Global chat: éléments requis manquants dans le DOM.');
        return;
    }

    // Initialize chat
    chatInstance = initializeChat({
        containerId: 'globalChatPanel',
        messageLimit: 10,
        onUserSelected: (userId) => {
            // Navigate to user profile when clicking on username
            window.location.href = `profile.html?id=${userId}`;
        }
    });

    // Toggle chat open/close
    chatToggleBtn.addEventListener('click', () => {
        toggleChat();
    });

    if (chatCloseBtn) {
        chatCloseBtn.addEventListener('click', () => {
            closeChat();
        });
    }

    // Listen to auth state
    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        if (profileUnsubscribe) {
            profileUnsubscribe();
            profileUnsubscribe = null;
        }
        if (chatInstance && chatInstance.setUserContext) {
            chatInstance.setUserContext({
                user,
                profile: null
            });
        }
        if (user && chatInstance && chatInstance.setUserContext) {
            profileUnsubscribe = subscribeToUserData(user.uid, (profile) => {
                chatInstance.setUserContext({
                    user,
                    profile
                });
            });
        }
    });

    // Close chat when clicking outside
    document.addEventListener('click', (e) => {
        if (isChatOpen &&
            !chatContainer.contains(e.target) &&
            !chatToggleBtn.contains(e.target)) {
            closeChat();
        }
    });
}

function toggleChat() {
    if (isChatOpen) {
        closeChat();
    } else {
        openChat();
    }
}

function openChat() {
    const chatContainer = document.getElementById('globalChatContainer');
    const chatToggleBtn = document.getElementById('chatToggleBtn');

    if (chatContainer) {
        chatContainer.classList.add('open');
        isChatOpen = true;
    }

    if (chatToggleBtn) {
        chatToggleBtn.classList.add('active');
    }
}

function closeChat() {
    const chatContainer = document.getElementById('globalChatContainer');
    const chatToggleBtn = document.getElementById('chatToggleBtn');

    if (chatContainer) {
        chatContainer.classList.remove('open');
        isChatOpen = false;
    }

    if (chatToggleBtn) {
        chatToggleBtn.classList.remove('active');
    }
}

export function destroyGlobalChat() {
    if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = null;
    }
    if (chatInstance && chatInstance.destroy) {
        chatInstance.destroy();
    }
}
