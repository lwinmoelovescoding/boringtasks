import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || 'AIzaSyCg4jH22Rla8VVBG3pyl0hyNl2Hw9tHpL8',
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || 'boringtasks-9e785.firebaseapp.com',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || 'boringtasks-9e785',
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || 'boringtasks-9e785.firebasestorage.app',
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || '170044992900',
  appId: process.env.REACT_APP_FIREBASE_APP_ID || '1:170044992900:web:30cd74ad109b8a75fec1d1',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
