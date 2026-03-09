/*
 * WALLET FLOW - MANUAL PROCESSING ONLY
 * 
 * All wallet transactions (deposits/withdrawals) are now MANUAL and require admin approval:
 * 1. User submits deposit/withdrawal request
 * 2. Request goes to pending_deposits/pending_withdrawals collection
 * 3. Admin reviews and approves/rejects in admin panel
 * 4. ONLY admin approval updates the user's walletBalance in users collection
 * 5. No automatic balance updates occur in the frontend
 * 
 * This prevents double-crediting and ensures walletBalance is the single source of truth.
 */

import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { useFirebase } from '@/contexts/FirebaseContext';
import { WalletTransaction, UserProfile } from '@/types';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface WalletContextType {
  transactions: WalletTransaction[];
  loading: boolean;
  addMoney: (amount: number, user: UserProfile, paymentMethod: string) => Promise<boolean>;
  withdrawMoney: (request: WithdrawalRequest, user: UserProfile) => Promise<boolean>;
  getTransactionHistory: (userId: string) => WalletTransaction[];
  refreshTransactions: () => Promise<void>;
}

export interface WithdrawalRequest {
  amount: number;
  accountNumber: string;
  accountName: string;
  bankName: string;
  ifscCode?: string;
  paymentMethod: string;
  bankDetails?: {
    accountName?: string;
    bankName?: string;
    accountNumber?: string;
    recipientAddress?: string;
    bankAddress?: string;
    routingNumber?: string;
    ifsc?: string;
    swiftCode?: string;
  };
}

export const WalletContext = createContext<WalletContextType | undefined>(undefined);

interface WalletProviderProps {
  children: ReactNode;
}

export const WalletProvider = ({ children }: WalletProviderProps) => {
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const { userProfile, updateWalletBalance } = useFirebase();
  const addMoney = useCallback(async (
    amount: number,
    user: UserProfile,
    paymentMethod: string
  ): Promise<boolean> => {
    try {
      setLoading(true);

      // Validate user data
      if (!user || !user.uid) {
        console.error("Invalid user data:", user);
        throw new Error("User ID is required");
      }

      // Simulate payment processing delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      // ALL payments are now manual and require admin approval
      // No instant payments - everything goes through admin approval process
      const initialStatus = "PENDING";

      // Create transaction record with proper user ID
      const transaction: Omit<WalletTransaction, 'id'> = {
        userId: user.uid,
        type: "deposit",
        amount,
        currency: user.currency || 'INR',
        status: initialStatus,
        paymentMethod, description: `Manual deposit via ${paymentMethod}`,
        metadata: {
          paymentMethod,
          simulatedGateway: 'MANUAL_DEPOSIT'
        },
        processed: false, // Always mark as unprocessed for admin approval
        createdAt: new Date(),
        updatedAt: new Date(),
      };      // Save to BOTH collections: pending_deposits for admin approval AND transactions for history
      try {
        // 1. Create deposit request structure for admin approval
        const depositRequest = {
          userId: user.uid,
          amount,
          currency: user.currency || 'INR',
          upiRefId: `MANUAL_${Date.now()}`, // Generate a reference ID
          status: 'PENDING',
          createdAt: new Date(),
          updatedAt: new Date(),
          userDetails: {
            name: user.displayName || user.username || 'Unknown',
            email: user.email || 'unknown@example.com'
          },
          metadata: {
            paymentMethod,
            simulatedGateway: 'MANUAL_DEPOSIT'
          }
        };

        // Save to pending_deposits for admin workflow
        const pendingDepositRef = await addDoc(collection(db, 'pending_deposits'), depositRequest);
        // 2. Also save to transactions collection for history
        const transactionWithRef = {
          ...transaction,
          reference: `DEP_${Date.now()}`,
          pendingDepositId: pendingDepositRef.id // Link to pending deposit
        };

        const transactionRef = await addDoc(collection(db, 'transactions'), transactionWithRef);
        // Add to local transactions for user history
        const newTransaction: WalletTransaction = {
          ...transactionWithRef,
          id: transactionRef.id,
          description: `Manual deposit request - ${paymentMethod}`,
          status: 'PENDING'
        };

        setTransactions(prev => {
          return [newTransaction, ...prev];
        });
      } catch (firestoreError) {
        console.error("WalletContext: Could not save deposit request to Firestore:", firestoreError);
        setLoading(false);
        throw firestoreError;
      }

      // Update user's wallet balance - NO AUTOMATIC UPDATES
      // Balance is only updated by admin approval in the admin panel
      // if (isInstantPayment) {
      //   const newBalance = (userProfile?.walletBalance || 0) + amount;
      //   await updateWalletBalance(newBalance);
      // }

      setLoading(false);
      return true;
    } catch (error) {
      console.error("Error adding money:", error);
      setLoading(false);
      return false;
    }
  }, [userProfile, updateWalletBalance]);
  const withdrawMoney = useCallback(async (
    request: WithdrawalRequest,
    user: UserProfile
  ): Promise<boolean> => {
    try {
      setLoading(true);

      if (!user || !user.uid) {
        console.error("Invalid user data:", user);
        throw new Error("User ID is required");
      }

      // Check for country restriction (India)
      if (user.country === 'India') {
        throw new Error("Withdrawals are currently unavailable in your region due to legal restrictions.");
      }

      await new Promise(resolve => setTimeout(resolve, 1500));

      const currentBalance = userProfile?.walletBalance || 0;
      if (currentBalance < request.amount) {
        setLoading(false);
        return false;
      }
      // Remove undefined fields from bankDetails
      // Always include required fields, use empty string if missing
      const cleanBankDetails = {
        accountNumber: request.accountNumber || "",
        accountName: request.accountName || "",
        bankName: request.bankName || "",
        ...(request.ifscCode ? { ifscCode: request.ifscCode } : {})
      };
      const transaction: Omit<WalletTransaction, 'id'> = {
        userId: user.uid,
        type: "withdrawal",
        amount: request.amount,
        currency: user.currency || 'INR',
        status: "PENDING",
        paymentMethod: request.paymentMethod,
        description: `Withdrawal request to ${request.paymentMethod}: ${request.accountNumber}`,
        processed: false, // Mark as unprocessed for admin approval
        metadata: { bankDetails: cleanBankDetails },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Save to BOTH collections: pending_withdrawals for admin approval AND transactions for history
      try {
        // 1. Create withdrawal request structure for admin approval
        // Remove undefined fields from request.bankDetails
        const cleanRequestBankDetails = request.bankDetails
          ? Object.fromEntries(Object.entries(request.bankDetails).filter((entry) => entry[1] !== undefined && entry[1] !== null && entry[1] !== ""))
          : undefined;
        const withdrawalRequest = {
          userId: user.uid,
          amount: request.amount,
          currency: user.currency || 'INR',
          status: 'PENDING',
          createdAt: new Date(),
          updatedAt: new Date(),
          userDetails: {
            name: user.displayName || user.username || 'Unknown',
            email: user.email || 'unknown@example.com'
          },
          bankDetails: cleanRequestBankDetails,
          paymentMethod: request.paymentMethod
        };
        // Save to pending_withdrawals for admin workflow
        const pendingWithdrawalRef = await addDoc(collection(db, 'pending_withdrawals'), withdrawalRequest);
        // 2. Also save to transactions collection for history
        const transactionWithRef = {
          ...transaction,
          reference: `WTH_${Date.now()}`,
          pendingWithdrawalId: pendingWithdrawalRef.id, // Link to pending withdrawal
          bankDetails: cleanRequestBankDetails
        };
        const transactionRef = await addDoc(collection(db, 'transactions'), transactionWithRef);
        // Add to local transactions for user history
        const newTransaction: WalletTransaction = {
          ...transactionWithRef,
          id: transactionRef.id,
          description: `Withdrawal request - ${request.paymentMethod}: ${(request.bankDetails?.accountNumber) || ''}`,
          status: 'PENDING'
        };
        setTransactions(prev => [newTransaction, ...prev]);
      } catch (firestoreError) {
        console.error("WalletContext: Could not save withdrawal request to Firestore:", firestoreError);
        setLoading(false);
        throw firestoreError;
      }

      // Don't immediately deduct balance for pending withdrawals
      // The balance will be deducted when the withdrawal is approved
      // const newBalance = currentBalance - request.amount;
      // await updateWalletBalance(newBalance);

      setLoading(false);
      return true;
    } catch (error) {
      console.error("Error withdrawing money:", error);
      setLoading(false);
      return false;
    }
  }, [userProfile, updateWalletBalance]);

  const getTransactionHistory = useCallback((userId: string): WalletTransaction[] => {
    return transactions.filter(transaction => transaction.userId === userId);
  }, [transactions]);
  const refreshTransactions = useCallback(async () => {
    if (!userProfile) {
      return;
    }

    try {
      // Use API endpoint instead of direct Firestore query
      const response = await fetch(`/api/users/${userProfile.uid}/transactions`);
      if (!response.ok) {
        throw new Error('Failed to fetch transactions');
      }

      const { transactions: userTransactions } = await response.json();
      // Normalize the transactions
      const normalizedTransactions = userTransactions.map((tx: WalletTransaction) => ({
        ...tx,
        status: tx.status?.toUpperCase() || 'PENDING',
        createdAt: tx.createdAt ? new Date(tx.createdAt) : new Date(),
        updatedAt: tx.updatedAt ? new Date(tx.updatedAt) : new Date(),
      })) as WalletTransaction[];

      setTransactions(normalizedTransactions);
    } catch (error) {
      console.error('WalletContext: Error loading transactions from API:', error);
      // Fallback to Firestore query
      try {
        const q = query(
          collection(db, 'transactions'),
          where('userId', '==', userProfile.uid)
        );

        const querySnapshot = await getDocs(q);
        const userTransactions = querySnapshot.docs.map(doc => {
          const data = doc.data();
          let status = data.status;
          if (typeof status === 'string') status = status.toUpperCase();
          return {
            id: doc.id,
            ...data,
            status,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
          };
        }) as WalletTransaction[];

        setTransactions(userTransactions);
      } catch (firestoreError) {
        console.error('WalletContext: Firestore fallback also failed:', firestoreError);
        setTransactions([]);
      }
    }
  }, [userProfile, updateWalletBalance]);

  // Load transactions when user profile is available
  useEffect(() => {
    refreshTransactions();
  }, [refreshTransactions]);

  return (
    <WalletContext.Provider value={{
      transactions,
      loading,
      addMoney,
      withdrawMoney,
      getTransactionHistory,
      refreshTransactions,
    }}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};