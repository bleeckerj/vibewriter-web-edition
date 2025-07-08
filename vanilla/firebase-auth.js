// vanilla/firebase-auth.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCqzPOxVQeA0k7qkO9q5V7t0EY4ad-K5ls",
  authDomain: "vibewriter-bb628.firebaseapp.com",
  projectId: "vibewriter-bb628",
  storageBucket: "vibewriter-bb628.firebasestorage.app",
  messagingSenderId: "387555975528",
  appId: "1:387555975528:web:409c2fb787ae29e2bbf6dd"
};

// Only initialize if not already initialized
let app;
try {
  app = initializeApp(firebaseConfig);
} catch (e) {
  // App already initialized
  app = undefined;
}
const auth = getAuth();

// Portable sign-in and sign-out helpers
function signInWithGoogle() {
  return signInWithPopup(auth, new GoogleAuthProvider());
}
function signOutUser() {
  return signOut(auth);
}

export { auth, onAuthStateChanged, signInWithGoogle, signOutUser };