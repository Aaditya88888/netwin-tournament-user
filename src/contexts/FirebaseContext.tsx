import React from "react";
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User as FirebaseUser,
  UserCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  sendEmailVerification,
  AuthError,
  onAuthStateChanged
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  onSnapshot
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { UserProfile } from '@/types';

// Top-level fetchUserProfile function for external use
async function fetchUserProfile(user: FirebaseUser): Promise<UserProfile | undefined> {
  try {
    // Check if this is an incomplete Google user
    const incompleteUserData = sessionStorage.getItem('incompleteGoogleUser');
    if (incompleteUserData) {
      const incompleteUser = JSON.parse(incompleteUserData);
      if (incompleteUser.uid === user.uid) {
        return undefined;
      }
    }

    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      // Normalize kycStatus to uppercase
      let kycStatus = data.kycStatus ?? 'NOT_SUBMITTED';
      // Ensure kycStatus is always uppercase
      if (typeof kycStatus === 'string') {
        kycStatus = kycStatus.toUpperCase();
      }

      // Normalize legacy "VERIFIED" status to "APPROVED" for consistency
      if (kycStatus === 'VERIFIED') {
        kycStatus = 'APPROVED';
      }

      const profile: UserProfile = {
        uid: user.uid,
        email: user.email || '',
        country: data.country || 'India',
        ...data,
        walletBalance: data.walletBalance ?? 0, // Start with zero balance
        kycStatus: kycStatus, // Use normalized kycStatus
        role: data.role ?? 'user',
        currency: (data.currency ?? 'INR') as 'INR' | 'USD' | 'NGN',
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
      };
      return profile;
    }
  } catch (error) {
    // Error fetching user profile - will return undefined
  }
  return undefined;
}

interface ConfirmationResult {
  confirm: (otp: string) => Promise<UserCredential>;
}
interface FirebaseContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithPhone: (phoneNumber: string) => Promise<ConfirmationResult>;
  signInWithGoogle: () => Promise<void>;
  verifyOtp: (confirmationResult: ConfirmationResult, otp: string) => Promise<void>;
  signInWithOTP: (email: string) => Promise<void>; // New OTP login method
  signOut: () => Promise<void>;
  updateUserProfile: (data: Partial<UserProfile>) => Promise<void>;
  updateWalletBalance: (newBalance: number) => Promise<void>;
  checkUsernameExists: (username: string) => Promise<boolean>;
  sendEmailVerification: () => Promise<void>; // Email verification
  isEmailVerified: boolean; // Email verification status
  refreshUserProfile: () => Promise<void>; // Add this line
  completeGoogleProfile: (profileData: Partial<UserProfile>) => Promise<void>; // Add this line
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

interface FirebaseProviderProps {
  children: ReactNode;
}

export const FirebaseProvider = ({ children }: FirebaseProviderProps) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const updateWalletBalance = async (newBalance: number): Promise<void> => {
    if (!user || !userProfile) {
      return;
    }

    await updateDoc(doc(db, 'users', user.uid), {
      walletBalance: newBalance,
      updatedAt: new Date(),
    });

    setUserProfile(prev => prev ? { ...prev, walletBalance: newBalance } : null);
  };
  const updateUserProfile = async (data: Partial<UserProfile>): Promise<void> => {
    if (!user || !userProfile) {
      throw new Error('User not authenticated');
    }

    try {
      setLoading(true);
      setError(null);

      // If currency is being changed, convert the wallet balance
      const updatedData = { ...data };

      // If username is being changed, also update the normalized username
      if (data.username && data.username !== userProfile.username) {
        updatedData.usernameNormalized = data.username.toLowerCase();
      }

      if (data.currency && data.currency !== userProfile.currency && userProfile.walletBalance > 0) {
        const { convertCurrency, formatCurrencyWithSymbol } = await import('@/utils/currencyConverter');
        const originalBalance = userProfile.walletBalance;
        const convertedBalance = convertCurrency(
          userProfile.walletBalance,
          userProfile.currency,
          data.currency
        );
        updatedData.walletBalance = convertedBalance;

        // Create a transaction record for the currency conversion
        try {
          const conversionTransaction = {
            userId: user.uid,
            type: 'currency_conversion' as const,
            amount: 0, // This is a conversion, not a monetary transaction
            currency: data.currency,
            status: 'completed' as const,
            paymentMethod: 'currency_conversion',
            description: `Currency conversion from ${userProfile.currency} to ${data.currency}`,
            metadata: {
              originalCurrency: userProfile.currency,
              originalAmount: originalBalance,
              newCurrency: data.currency,
              newAmount: convertedBalance,
              conversionRate: convertedBalance / originalBalance,
              originalFormatted: formatCurrencyWithSymbol(originalBalance, userProfile.currency),
              newFormatted: formatCurrencyWithSymbol(convertedBalance, data.currency)
            },
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          // Try to save the conversion transaction
          await addDoc(collection(db, 'transactions'), conversionTransaction);
        } catch (transactionError) {
          // Could not save currency conversion transaction - continue without it
        }
      }

      updatedData.updatedAt = new Date();

      await updateDoc(doc(db, 'users', user.uid), updatedData);

      setUserProfile(prev => prev ? { ...prev, ...updatedData } : null);
    } catch (error) {
      setError('Failed to update profile');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const handleAuthError = (error: unknown) => {
    console.error('Full Auth Error object:', error); // Log the full error for debugging
    if (error instanceof Error) {
      const authError = error as AuthError;
      console.error('Auth Error Code:', authError.code);
      console.error('Auth Error Message:', authError.message);

      switch (authError.code) {
        case 'auth/invalid-email':
          return 'Invalid email address';
        case 'auth/user-disabled':
          return 'This account has been disabled';
        case 'auth/user-not-found':
          return 'No account found with this email';
        case 'auth/wrong-password':
          return 'Incorrect password. Please check your password and try again.';
        case 'auth/invalid-credential':
          return 'Invalid email or password. \n\n' +
            '1. Verify your account exists in the Firebase Console.\n' +
            '2. If you are running locally, ensure you have added the App Check debug token to the Firebase Console.';
        case 'auth/invalid-login-credentials':
          return 'Invalid email or password. \n\n' +
            '1. Verify your account exists in the Firebase Console.\n' +
            '2. If you are running locally, ensure you have added the App Check debug token to the Firebase Console.';
        case 'auth/too-many-requests':
          return 'Too many failed login attempts. Please try again later.';
        case 'auth/email-already-in-use':
          return 'Email already in use';
        case 'auth/operation-not-allowed':
          return 'Email/Password sign-in is not enabled in the Firebase Console.';
        case 'auth/weak-password':
          return 'Password is too weak';
        case 'auth/network-request-failed':
          return 'Network error. Please check your internet connection.';
        case 'auth/api-key-not-valid':
          return 'Invalid Firebase API Key. Please check your configuration.';
        case 'auth/internal-error':
          return 'Internal Firebase error. Please check the network console for details.';
        default:
          return authError.message;
      }
    }
    return 'An unknown error occurred';
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      setLoading(true);
      setError(null);
      const trimmedEmail = email.trim();
      const trimmedPassword = password.trim();
      await signInWithEmailAndPassword(auth, trimmedEmail, trimmedPassword);
    } catch (err) {
      const errorMessage = handleAuthError(err);
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }; const signUpWithEmail = async (email: string, password: string) => {
    try {
      setLoading(true);
      setError(null);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      // Get additional signup data from sessionStorage
      const signupDataStr = sessionStorage.getItem('signupData');
      const signupData = signupDataStr ? JSON.parse(signupDataStr) : {};

      // Generate unique username if not provided or if it conflicts
      let username = signupData.username || 'User';
      const baseUsername = username;
      let counter = 1;

      // Check if username already exists in Firestore
      let usernameExists = true;
      while (usernameExists) {
        const usersQuery = query(
          collection(db, 'users'),
          where('username', '==', username)
        );
        const usersSnapshot = await getDocs(usersQuery);

        if (usersSnapshot.empty) {
          usernameExists = false;
        } else {
          username = `${baseUsername}${counter}`;
          counter++;
        }
      }

      // Create default profile with signup data
      let country = signupData.country || '';
      let currency = signupData.currency || '';
      // Normalize country/currency logic
      if (!country && currency) {
        if (currency === 'NGN') country = 'Nigeria';
        else if (currency === 'USD') country = 'United States';
        else country = 'India';
      }
      if (!currency && country) {
        if (country === 'Nigeria') currency = 'NGN';
        else if (country === 'United States' || country === 'US' || country === 'USA') currency = 'USD';
        else currency = 'INR';
      }
      if (!country) country = 'India';
      if (!currency) currency = 'INR';
      const defaultProfile = {
        uid: userCredential.user.uid,
        email: email,
        displayName: username,
        username: username,
        photoURL: '',
        country,
        currency: currency as 'INR' | 'USD' | 'NGN',
        walletBalance: 0,
        kycStatus: 'NOT_SUBMITTED' as const,
        gameId: signupData.gameId || '',
        gameMode: signupData.gameMode || '',
        role: 'user' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await setDoc(doc(db, 'users', userCredential.user.uid), defaultProfile);
      setUserProfile(defaultProfile);

      // Clear the temporary signup data
      sessionStorage.removeItem('signupData');
    } catch (err) {
      const errorMessage = handleAuthError(err);
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const signInWithPhone = async (phoneNumber: string) => {
    try {
      setLoading(true);
      setError(null);

      const recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
      });

      const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
      return confirmationResult;
    } catch (err) {
      const errorMessage = handleAuthError(err);
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    try {
      setLoading(true);
      setError(null);
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);

      if (result.user) {
        const userRef = doc(db, 'users', result.user.uid);
        const userDoc = await getDoc(userRef);

        if (!userDoc.exists()) {
          // Don't create a profile automatically - just set basic user info
          // The user will be redirected to complete their profile
          setUserProfile(null);

          // Store incomplete user data for profile completion
          sessionStorage.setItem('incompleteGoogleUser', JSON.stringify({
            uid: result.user.uid,
            email: result.user.email || '',
            displayName: result.user.displayName || 'User',
            photoURL: result.user.photoURL || ''
          }));
        } else {
          // User profile exists, fetch it
          const data = userDoc.data();
          const profile: UserProfile = {
            uid: result.user.uid,
            email: result.user.email || '',
            country: data.country || 'India',
            ...data,
            walletBalance: data.walletBalance ?? 0,
            kycStatus: data.kycStatus ?? 'not_submitted',
            role: data.role ?? 'user',
            currency: (data.currency ?? 'INR') as 'INR' | 'USD' | 'NGN',
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
          };
          setUserProfile(profile);
        }
      }
    } catch (err) {
      const errorMessage = handleAuthError(err);
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Fix ConfirmationResult type
  type ConfirmationResult = {
    confirm: (otp: string) => Promise<UserCredential>;
  };

  // Add the missing verifyOtp function
  const verifyOtp = async (confirmationResult: ConfirmationResult, otp: string) => {
    try {
      const result = await confirmationResult.confirm(otp);
      if (result.user) {
        const userRef = doc(db, 'users', result.user.uid);
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) {
          const defaultProfile = {
            uid: result.user.uid,
            email: result.user.email || '',
            displayName: result.user.displayName || 'User',
            photoURL: result.user.photoURL || '',
            phoneNumber: result.user.phoneNumber || '',
            country: 'India',
            currency: 'INR' as 'INR' | 'USD' | 'NGN',
            walletBalance: 0,
            kycStatus: 'NOT_SUBMITTED' as const,
            gameId: '',
            role: 'user' as const,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          await setDoc(userRef, defaultProfile);
          setUserProfile(defaultProfile);
        }
      }
    } catch (err) {
      const errorMessage = handleAuthError(err);
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setLoading(true);
      setError(null);
      await firebaseSignOut(auth);
    } catch (err) {
      const errorMessage = handleAuthError(err);
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Check if username exists in the database
  const checkUsernameExists = async (username: string): Promise<boolean> => {
    try {
      const usersQuery = query(
        collection(db, 'users'),
        where('username', '==', username)
      );
      const usersSnapshot = await getDocs(usersQuery);
      return !usersSnapshot.empty;
    } catch (error) {
      return false;
    }
  };
  // New function to send email verification
  const sendEmailVerificationEmail = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!user) throw new Error('User not authenticated');

      await sendEmailVerification(user);
    } catch (err) {
      const errorMessage = handleAuthError(err);
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // New OTP sign-in method
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const signInWithOTP = async (email: string) => {
    try {
      setLoading(true);
      setError(null);

      // This is a placeholder - in a real implementation, you would:
      // 1. Send OTP to email via your backend/cloud function
      // 2. User enters OTP
      // 3. Verify OTP on backend
      // 4. Get custom token from backend
      // 5. Sign in with custom token

      // For now, we'll throw an error to indicate this needs backend implementation
      throw new Error('OTP sign-in requires backend implementation');

    } catch (err) {
      const errorMessage = handleAuthError(err);
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // New function to check if email is verified
  const isEmailVerified = user ? user.emailVerified : false;
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      if (user) {
        setUser(user);

        // Check if this is a Google sign-in with incomplete profile
        const incompleteUserData = sessionStorage.getItem('incompleteGoogleUser');
        if (incompleteUserData) {
          const incompleteUser = JSON.parse(incompleteUserData);
          if (incompleteUser.uid === user.uid) {
            setUserProfile(null);
            setLoading(false);
            return;
          }
        }

        // Normal profile fetch for existing users
        const profile = await fetchUserProfile(user);
        setUserProfile(profile || null);
      } else {
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);
  // Add real-time listener for user profile changes
  useEffect(() => {
    if (!user) return;

    let unsubscribeProfile: () => void;

    const setupProfileListener = async () => {
      unsubscribeProfile = onSnapshot(
        doc(db, 'users', user.uid),
        (docSnapshot) => {
          if (docSnapshot.exists()) {
            const data = docSnapshot.data();

            // Normalize kycStatus to uppercase
            let kycStatus = data.kycStatus ?? 'NOT_SUBMITTED';
            if (typeof kycStatus === 'string') {
              kycStatus = kycStatus.toUpperCase();
            }

            // Normalize legacy "VERIFIED" status to "APPROVED" for consistency
            if (kycStatus === 'VERIFIED') {
              kycStatus = 'APPROVED';
            }

            const profile: UserProfile = {
              uid: user.uid,
              email: user.email || '',
              country: data.country || 'India',
              ...data,
              walletBalance: data.walletBalance ?? 0,
              kycStatus: kycStatus, // Use normalized kycStatus
              role: data.role ?? 'user',
              currency: (data.currency ?? 'INR') as 'INR' | 'USD' | 'NGN',
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
              updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
            };
            setUserProfile(profile);
          }
        },
        () => {
          // Error listening to profile changes - will continue without real-time updates
        }
      );
    };

    setupProfileListener();

    return () => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, [user]);

  // Add a function to refresh the user profile and update state
  const refreshUserProfile = async () => {
    if (!user) return;

    // Check if this is an incomplete Google user
    const incompleteUserData = sessionStorage.getItem('incompleteGoogleUser');
    if (incompleteUserData) {
      const incompleteUser = JSON.parse(incompleteUserData);
      if (incompleteUser.uid === user.uid) {
        setUserProfile(null);
        return;
      }
    }

    try {
      // Get the current profile from Firestore
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);

      if (userDoc.exists()) {
        const data = userDoc.data();

        // Normalize kycStatus to uppercase
        let kycStatus = data.kycStatus ?? 'NOT_SUBMITTED';
        if (typeof kycStatus === 'string') {
          kycStatus = kycStatus.toUpperCase();
        }

        const updatedProfile: UserProfile = {
          uid: user.uid,
          email: user.email || '',
          country: data.country || 'India',
          ...data,
          walletBalance: data.walletBalance ?? 0,
          kycStatus: kycStatus, // Use normalized kycStatus
          role: data.role ?? 'user',
          currency: (data.currency ?? 'INR') as 'INR' | 'USD' | 'NGN',
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
        };

        setUserProfile(updatedProfile);

        // Try to fetch wallet balance from API to get the latest state
        try {
          const walletResponse = await fetch(`/api/users/${user.uid}/wallet`);
          if (walletResponse.ok) {
            const { walletBalance } = await walletResponse.json();

            // Update local state with latest balance (keep other profile data)
            setUserProfile(prev => prev ? { ...prev, walletBalance } : updatedProfile);
          }
        } catch (apiError) {
          // Continue with profile from Firestore - already set above
        }

        return;
      }
    } catch (error) {
      // Error refreshing user profile - will try fallback method
    }

    // If we reach here, something went wrong, try the fetchUserProfile function as fallback
    try {
      const profile = await fetchUserProfile(user);
      setUserProfile(profile || null);
    } catch (fallbackError) {
      // Fallback method also failed - profile will remain in current state
    }
  };

  // Helper function to complete profile for Google sign-in users
  const completeGoogleProfile = async (profileData: Partial<UserProfile>) => {
    try {
      setLoading(true);
      setError(null);

      const incompleteUserStr = sessionStorage.getItem('incompleteGoogleUser');
      if (!incompleteUserStr) {
        throw new Error('No incomplete user data found');
      }

      const incompleteUser = JSON.parse(incompleteUserStr);

      // Create complete profile
      const completeProfile: UserProfile = {
        uid: incompleteUser.uid,
        email: incompleteUser.email,
        displayName: profileData.displayName || incompleteUser.displayName,
        photoURL: incompleteUser.photoURL,
        phoneNumber: profileData.phoneNumber || '',
        country: profileData.country || 'India', // Ensure country is provided
        currency: profileData.currency || 'INR',
        username: profileData.username || '',
        gameId: profileData.gameId || '',
        gameMode: profileData.gameMode || '',
        walletBalance: 0,
        kycStatus: 'NOT_SUBMITTED' as const,
        role: 'user' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Save to Firestore
      await setDoc(doc(db, 'users', incompleteUser.uid), completeProfile);
      setUserProfile(completeProfile);

      // Clean up session storage
      sessionStorage.removeItem('incompleteGoogleUser');

    } catch (err) {
      const errorMessage = handleAuthError(err);
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <FirebaseContext.Provider value={{
      user,
      userProfile,
      loading,
      error,
      signInWithEmail,
      signUpWithEmail,
      signInWithPhone,
      signInWithGoogle,
      verifyOtp,
      signInWithOTP,
      signOut,
      updateUserProfile,
      updateWalletBalance,
      checkUsernameExists,
      sendEmailVerification: sendEmailVerificationEmail,
      isEmailVerified,
      refreshUserProfile,
      completeGoogleProfile
    }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};
