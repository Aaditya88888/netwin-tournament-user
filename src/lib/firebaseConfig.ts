// Firebase configuration and initialization for development and production
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  AuthError
} from "firebase/auth";
import { initializeAppCheck, ReCaptchaV3Provider, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging } from 'firebase/messaging';
import { getFunctions } from 'firebase/functions';
import type { AppCheck } from "firebase/app-check";

// Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
export const messaging = getMessaging(app);

// Development environment detection
const isDevelopment = import.meta.env.DEV;

// Initialize Analytics only in production
let analytics;
if (import.meta.env.PROD) {
  analytics = getAnalytics(app);
}

// Initialize App Check
let appCheck: AppCheck | undefined;

if (typeof window !== 'undefined') {
  try {
    // Enable debug token in development
    if (isDevelopment) {
      const debugToken = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;
      console.log('Firebase App Check: Development mode detected');
      if (debugToken) {
        console.log('Firebase App Check: Using debug token');
        // @ts-expect-error - Adding debug token to window for Firebase App Check in development
        window.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken === 'true' ? true : debugToken;
      }
    }

    // Initialize App Check only if recaptcha key is present and NOT disabled
    const isAppCheckDisabled = import.meta.env.VITE_DISABLE_APP_CHECK === 'true';

    if (import.meta.env.VITE_RECAPTCHA_SITE_KEY && !isAppCheckDisabled) {
      console.log('Firebase App Check: Initializing with Site Key');
      // Use Enterprise provider for Enterprise keys
      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
        isTokenAutoRefreshEnabled: true
      });
      console.log('Firebase App Check: Initialized successfully with Enterprise provider');
    } else {
      console.log('Firebase App Check: Skipping initialization (Disabled or missing key)');
    }

  } catch (error) {
    console.warn('⚠️ App Check initialization failed:', error);
    // Continue without App Check in development to avoid blocking authentication
  }
}

// Helper functions for authentication
export const signInWithEmail = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error: unknown) {
    const authError = error as AuthError;
    console.error('Sign in error:', authError.code, authError.message);
    throw error;
  }
};

export const signUpWithEmail = async (email: string, password: string) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error: unknown) {
    const authError = error as AuthError;
    console.error('Sign up error:', authError.code, authError.message);
    throw error;
  }
};

// Phone Authentication
export const setupRecaptcha = (phoneNumber: string) => {
  const recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
    size: 'normal',
    callback: () => {
    }
  });

  return signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
};

// Development utilities
export const getFirebaseStatus = () => ({
  isDevelopment,
  services: {
    auth: 'production Firebase Auth',
    firestore: 'production Firestore',
    storage: 'production Storage',
    functions: 'production Functions'
  },
  appId: firebaseConfig.appId,
  projectId: firebaseConfig.projectId
});

export { app, analytics, appCheck };
export default app;
