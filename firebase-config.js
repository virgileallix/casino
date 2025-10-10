// Firebase configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-analytics.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, runTransaction } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDvulIikOqbDfAYsREeTqnZrSqdDEMzeOs",
  authDomain: "casino-eaa24.firebaseapp.com",
  projectId: "casino-eaa24",
  storageBucket: "casino-eaa24.firebasestorage.app",
  messagingSenderId: "100720282923",
  appId: "1:100720282923:web:e618224a7e2a3f1fe4496e",
  measurementId: "G-9D8Q1TPGT6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const analytics = getAnalytics(app);
const db = getFirestore(app);

export {
    auth,
    db,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    onSnapshot,
    runTransaction
};
