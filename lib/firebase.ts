import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getMissingFirebaseKeys() {
  return Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

export function hasFirebaseConfig() {
  return getMissingFirebaseKeys().length === 0;
}

function ensureFirebaseConfig() {
  const missingKeys = getMissingFirebaseKeys();

  if (missingKeys.length > 0) {
    throw new Error(
      `Faltan variables de Firebase en .env.local: ${missingKeys.join(", ")}`
    );
  }
}

export function getFirebaseAuth() {
  ensureFirebaseConfig();

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

  return getAuth(app);
}

export function getFirebaseDb() {
  ensureFirebaseConfig();

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

  return getFirestore(app);
}
