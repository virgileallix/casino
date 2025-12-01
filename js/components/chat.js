import {
    db,
    collection,
    addDoc,
    serverTimestamp,
    query,
    orderBy,
    limit,
    onSnapshot
} from 'js/core/firebase-config.js';

const DEFAULT_LIMIT = 100;
const MESSAGE_MAX_LENGTH = 250;

function computeDisplayName(profile, user) {
    if (profile?.username) return profile.username;
    if (profile?.displayName) return profile.displayName;
    if (user?.displayName) return user.displayName;
    const email = profile?.email || user?.email;
    if (email) return email.split('@')[0];
    if (user?.uid) return `Joueur-${user.uid.slice(0, 6)}`;
    return 'Anonyme';
}

function formatTimestamp(timestamp) {
    if (!timestamp) {
        return '---';
    }
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

export function initializeChat({
    containerId = 'chatPanel',
    messageLimit = DEFAULT_LIMIT,
    onUserSelected
} = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`Chat container #${containerId} introuvable.`);
        return {
            setUserContext() {},
            destroy() {}
        };
    }

    const messagesList = container.querySelector('[data-chat-messages]');
    const emptyState = container.querySelector('[data-chat-empty]');
    const form = container.querySelector('[data-chat-form]');
    const input = container.querySelector('[data-chat-input]');
    const sendButton = container.querySelector('[data-chat-send]');

    if (!messagesList || !form || !input || !sendButton) {
        console.warn('Chat: éléments requis manquants dans le DOM.');
        return {
            setUserContext() {},
            destroy() {}
        };
    }

    let currentUser = null;
    let currentProfile = null;
    let unsubscribe = null;

    function updateInputState() {
        const hasUser = Boolean(currentUser);
        input.disabled = !hasUser;
        sendButton.disabled = !hasUser || !input.value.trim();
        if (!hasUser) {
            input.value = '';
        }
    }

    function renderMessages(messages) {
        messagesList.innerHTML = '';

        if (!messages.length) {
            emptyState.hidden = false;
            return;
        }
        emptyState.hidden = true;

        messages.forEach((message) => {
            const item = document.createElement('li');
            item.className = 'chat-message';
            item.dataset.userId = message.userId;

            const header = document.createElement('div');
            header.className = 'chat-message-header';

            const nameButton = document.createElement('button');
            nameButton.type = 'button';
            nameButton.className = 'chat-username';
            nameButton.textContent = message.displayName || 'Joueur';
            nameButton.addEventListener('click', () => {
                if (typeof onUserSelected === 'function') {
                    onUserSelected(message.userId);
                }
            });

            const time = document.createElement('span');
            time.className = 'chat-timestamp';
            time.textContent = formatTimestamp(message.createdAt);

            header.appendChild(nameButton);
            header.appendChild(time);

            const body = document.createElement('p');
            body.className = 'chat-message-body';
            body.textContent = message.message;

            item.appendChild(header);
            item.appendChild(body);
            messagesList.appendChild(item);
        });

        messagesList.scrollTop = messagesList.scrollHeight;
    }

    function subscribeToMessages() {
        if (unsubscribe) {
            unsubscribe();
        }
        const messagesRef = collection(db, 'chatMessages');
        const chatQuery = query(
            messagesRef,
            orderBy('createdAt', 'desc'),
            limit(messageLimit)
        );

        unsubscribe = onSnapshot(chatQuery, (snapshot) => {
            const ordered = [];
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                ordered.push({
                    id: docSnap.id,
                    userId: data.userId || null,
                    displayName: data.displayName || null,
                    message: data.message || '',
                    createdAt: data.createdAt || null
                });
            });
            ordered.sort((a, b) => {
                const timeA = a.createdAt?.toMillis?.() ?? 0;
                const timeB = b.createdAt?.toMillis?.() ?? 0;
                return timeA - timeB;
            });
            renderMessages(ordered);
        }, (error) => {
            console.error('Erreur lors de l’écoute du chat:', error);
        });
    }

    async function handleSubmit(event) {
        event.preventDefault();
        if (!currentUser) return;

        const text = input.value.trim();
        if (!text) {
            return;
        }
        if (text.length > MESSAGE_MAX_LENGTH) {
            alert(`Message trop long (${text.length}/${MESSAGE_MAX_LENGTH}).`);
            return;
        }

        const payload = {
            userId: currentUser.uid,
            displayName: computeDisplayName(currentProfile, currentUser),
            message: text,
            createdAt: serverTimestamp()
        };

        try {
            await addDoc(collection(db, 'chatMessages'), payload);
            input.value = '';
            updateInputState();
        } catch (error) {
            console.error('Erreur lors de l’envoi du message:', error);
            alert('Impossible d’envoyer le message pour le moment.');
        }
    }

    form.addEventListener('submit', handleSubmit);
    input.addEventListener('input', updateInputState);

    subscribeToMessages();
    updateInputState();

    return {
        setUserContext({ user, profile }) {
            currentUser = user || null;
            currentProfile = profile || null;
            updateInputState();
        },
        destroy() {
            if (unsubscribe) {
                unsubscribe();
                unsubscribe = null;
            }
            form.removeEventListener('submit', handleSubmit);
            input.removeEventListener('input', updateInputState);
        }
    };
}
