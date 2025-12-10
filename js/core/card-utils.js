/**
 * Utility functions for Card rendering and management
 */

// Card suit and rank definitions
export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// Mapping for file names
const FACE_MAPPING = {
    'A': 'ace',
    'J': 'jack',
    'Q': 'queen',
    'K': 'king'
};

const SUIT_SYMBOLS = {
    'hearts': '♥',
    'diamonds': '♦',
    'clubs': '♣',
    'spades': '♠',
    '♥': 'hearts',
    '♦': 'diamonds',
    '♣': 'clubs',
    '♠': 'spades'
};

/**
 * Get the image path for a card
 * @param {Object} card - Card object {suit, value/rank}
 * @returns {string} - Path to image
 */
export function getCardImage(card) {
    // Normalize rank/value
    const rank = card.rank || card.value;
    const suit = card.suit;
    
    // Normalize suit name (handle symbols if necessary, though we prefer full names)
    let suitName = suit.toLowerCase();
    if (SUIT_SYMBOLS[suit]) {
        suitName = SUIT_SYMBOLS[suit];
    }
    
    const rankKey = FACE_MAPPING[rank] || rank;
    return `../../assets/cards/${rankKey}_of_${suitName}.png`;
}

/**
 * Render a hand of cards into a container
 * @param {HTMLElement} container - The container element
 * @param {Array} hand - Array of card objects
 * @param {boolean} hideSecondCard - Whether to hide the second card (dealer hole card)
 */
export function renderHandResults(container, hand, hideSecondCard = false) {
    if (!container) return;
    container.innerHTML = '';
    
    hand.forEach((card, index) => {
        const cardEl = document.createElement('div');
        cardEl.className = 'card-image-container';
        
        // Stagger cards
        cardEl.style.transform = `translateX(${index * 30}px)`;
        cardEl.style.zIndex = index;
        
        const img = document.createElement('img');
        img.className = 'card-image';
        
        if (hideSecondCard && index === 1) {
            img.src = '../../assets/cards/back.png';
            img.alt = 'Hidden Card';
            cardEl.classList.add('hidden-card');
        } else {
            img.src = getCardImage(card);
            img.alt = `${card.rank || card.value} of ${card.suit}`;
        }
        
        cardEl.appendChild(img);
        container.appendChild(cardEl);
    });
}
