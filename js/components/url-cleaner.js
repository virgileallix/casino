/**
 * URL Cleaner - Removes .html extensions from URLs
 * Makes URLs look cleaner (e.g., /casino instead of /casino.html)
 */

const HTML_EXT = '.html';

/**
 * Initialize URL cleaning
 * - Cleans current URL if it has .html
 * - Intercepts link clicks to remove .html
 */
export function initializeURLCleaner() {
    // Clean current URL if it has .html
    cleanCurrentURL();

    // Intercept all link clicks
    interceptLinks();

    // Handle browser back/forward
    window.addEventListener('popstate', () => {
        cleanCurrentURL();
    });
}

/**
 * Clean the current URL by removing .html extension
 */
function cleanCurrentURL() {
    const path = window.location.pathname;

    if (path.endsWith(HTML_EXT)) {
        const cleanPath = path.slice(0, -HTML_EXT.length) || '/';
        const newURL = window.location.origin + cleanPath + window.location.search + window.location.hash;

        // Use replaceState to avoid adding to history
        window.history.replaceState(null, '', newURL);
    }
}

/**
 * Intercept all internal link clicks and clean URLs
 */
function interceptLinks() {
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');

        // Ignore if not a link or external link
        if (!link || !link.href) return;

        const url = new URL(link.href, window.location.origin);

        // Only handle same-origin links
        if (url.origin !== window.location.origin) return;

        // Check if it's an HTML file
        if (!url.pathname.endsWith(HTML_EXT)) return;

        // Prevent default navigation
        e.preventDefault();

        // Clean the URL and navigate
        const cleanPath = url.pathname.slice(0, -HTML_EXT.length) || '/';
        const cleanURL = cleanPath + url.search + url.hash;

        // Navigate to clean URL
        window.history.pushState(null, '', cleanURL);

        // Trigger page load
        window.location.href = url.pathname + url.search + url.hash;
    });
}

/**
 * Get clean URL for a given path
 * @param {string} path - Path with or without .html
 * @returns {string} Clean path without .html
 */
export function getCleanURL(path) {
    if (path.endsWith(HTML_EXT)) {
        return path.slice(0, -HTML_EXT.length);
    }
    return path;
}

/**
 * Navigate to a page with clean URL
 * @param {string} path - Path to navigate to (with or without .html)
 */
export function navigateClean(path) {
    const cleanPath = getCleanURL(path);
    window.location.href = cleanPath;
}
