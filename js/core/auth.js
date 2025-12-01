import { auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from 'js/core/firebase-config.js';
import { initializeUserBalance } from 'js/core/balance-manager.js';

// Check if user is already logged in
onAuthStateChanged(auth, (user) => {
    if (user) {
        window.location.href = 'index.html';
    }
});

// Tab switching
const loginTab = document.getElementById('loginTab');
const registerTab = document.getElementById('registerTab');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

loginTab.addEventListener('click', () => {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    loginForm.classList.add('active');
    registerForm.classList.remove('active');
    clearErrors();
});

registerTab.addEventListener('click', () => {
    registerTab.classList.add('active');
    loginTab.classList.remove('active');
    registerForm.classList.add('active');
    loginForm.classList.remove('active');
    clearErrors();
});

// Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        await initializeUserBalance(userCredential.user);
        window.location.href = 'index.html';
    } catch (error) {
        errorDiv.textContent = getErrorMessage(error.code);
        errorDiv.style.display = 'block';
    }
});

// Register
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const errorDiv = document.getElementById('registerError');

    if (password !== confirmPassword) {
        errorDiv.textContent = 'Les mots de passe ne correspondent pas';
        errorDiv.style.display = 'block';
        return;
    }

    if (password.length < 6) {
        errorDiv.textContent = 'Le mot de passe doit contenir au moins 6 caractères';
        errorDiv.style.display = 'block';
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await initializeUserBalance(userCredential.user);
        window.location.href = 'index.html';
    } catch (error) {
        errorDiv.textContent = getErrorMessage(error.code);
        errorDiv.style.display = 'block';
    }
});

// Google Sign In (Login & Register)
async function handleGoogleSignIn(errorDivId) {
    const provider = new GoogleAuthProvider();
    const errorDiv = document.getElementById(errorDivId);

    try {
        const result = await signInWithPopup(auth, provider);
        await initializeUserBalance(result.user);
        window.location.href = 'index.html';
    } catch (error) {
        errorDiv.textContent = getErrorMessage(error.code);
        errorDiv.style.display = 'block';
        console.error('Error signing in with Google:', error);
    }
}

// Google Login Button
document.getElementById('googleLoginBtn').addEventListener('click', () => {
    handleGoogleSignIn('loginError');
});

// Google Register Button
document.getElementById('googleRegisterBtn').addEventListener('click', () => {
    handleGoogleSignIn('registerError');
});

function clearErrors() {
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('registerError').style.display = 'none';
}

function getErrorMessage(code) {
    switch (code) {
        case 'auth/email-already-in-use':
            return 'Cet email est déjà utilisé';
        case 'auth/invalid-email':
            return 'Email invalide';
        case 'auth/user-not-found':
            return 'Utilisateur non trouvé';
        case 'auth/wrong-password':
            return 'Mot de passe incorrect';
        case 'auth/weak-password':
            return 'Mot de passe trop faible';
        case 'auth/invalid-credential':
            return 'Identifiants invalides';
        default:
            return 'Une erreur est survenue';
    }
}
