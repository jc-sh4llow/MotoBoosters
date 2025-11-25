// frontend/src/lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyCqX2AIYt-gZgY2KmEQVzE9fl-U-vFr1sY",
    authDomain: "motobooster-7118e.firebaseapp.com",
    projectId: "motobooster-7118e",
    storageBucket: "motobooster-7118e.firebasestorage.app",
    messagingSenderId: "600586300732",
    appId: "1:600586300732:web:574fbb865153352580c239",
    measurementId: "G-MPTRCQNN2Y"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const db = getFirestore(app);