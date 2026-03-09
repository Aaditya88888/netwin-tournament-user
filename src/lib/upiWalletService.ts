import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  getDoc,
  setDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PendingDeposit, PendingWithdrawal, AdminWalletConfig } from '@/types/wallet-requests';

export class UPIWalletService {
  // Create deposit request
  static async createDepositRequest(
    userId: string,
    amount: number,
    upiRefId: string,
    currency: string = 'INR',
    screenshotUrl?: string
  ): Promise<string> {
    try {
      // Get user details
      const userDoc = await getDoc(doc(db, 'users', userId));
      const userData = userDoc.data();
      const depositRequest: Omit<PendingDeposit, 'id'> = {
        userId,
        amount,
        currency,
        upiRefId,
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: null,
        verifiedAt: null,
        verifiedBy: null,
        rejectionReason: null,
        screenshotUrl: screenshotUrl || null,
        userDetails: {
          name: userData?.displayName || userData?.name || 'Unknown User',
          email: userData?.email || '',
          username: userData?.username || ''
        }
      };
      const docRef = await addDoc(collection(db, 'pending_deposits'), depositRequest);
      // Create a matching transaction in /transactions
      await addDoc(collection(db, 'transactions'), {
        userId,
        amount,
        currency,
        type: 'deposit',
        status: 'PENDING', // Use uppercase to match the WalletTransaction type
        paymentMethod: 'MANUAL',
        description: 'Manual deposit request',
        processed: false, // Mark as unprocessed to prevent double-processing
        createdAt: new Date(),
        updatedAt: new Date(),
        depositRequestId: docRef.id, // <-- top-level field
        metadata: {
          depositRequestId: docRef.id,
          upiRefId
        }
      });
      return docRef.id;
    } catch (error) {
      console.error('Error creating deposit request:', error);
      throw error;
    }
  }

  // Create withdrawal request  
  static async createWithdrawalRequest(
    userId: string,
    amount: number,
    upiId: string,
    currency: string = 'INR'
  ): Promise<string> {
    try {
      // Get user details
      const userDoc = await getDoc(doc(db, 'users', userId));
      const userData = userDoc.data();

      // Check for country restriction (India)
      if (userData?.country === 'India') {
        throw new Error("Withdrawals are currently unavailable in your region due to legal restrictions.");
      }

      const withdrawalRequest: Omit<PendingWithdrawal, 'id'> = {
        userId,
        amount,
        currency,
        upiId,
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: null,
        verifiedAt: null,
        verifiedBy: null,
        rejectionReason: null,
        userDetails: {
          name: userData?.displayName || userData?.name || 'Unknown User',
          email: userData?.email || '',
          username: userData?.username || ''
        }
      };

      const docRef = await addDoc(collection(db, 'pending_withdrawals'), withdrawalRequest);
      // Create a matching transaction in /transactions
      await addDoc(collection(db, 'transactions'), {
        userId,
        amount,
        currency,
        type: 'withdrawal',
        status: 'PENDING', // Use uppercase to match the WalletTransaction type
        paymentMethod: 'MANUAL',
        description: 'Manual withdrawal request',
        processed: false, // Mark as unprocessed to prevent double-processing
        createdAt: new Date(),
        updatedAt: new Date(),
        withdrawalRequestId: docRef.id, // <-- top-level field
        metadata: {
          withdrawalRequestId: docRef.id,
          upiId
        }
      });
      return docRef.id;
    } catch (error) {
      console.error('Error creating withdrawal request:', error);
      throw error;
    }
  }  // Get user's deposit requests
  static async getUserDepositRequests(userId: string): Promise<PendingDeposit[]> {
    try {
      const collectionRef = collection(db, 'pending_deposits');
      const q = query(
        collectionRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'asc')
      );
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || null,
        verifiedAt: doc.data().verifiedAt?.toDate() || null,
      } as PendingDeposit));
    } catch (error) {
      console.error('Error getting user deposit requests:', error);
      // Return empty array instead of throwing to prevent UI breakage
      return [];
    }
  }

  // Get user's withdrawal requests
  static async getUserWithdrawalRequests(userId: string): Promise<PendingWithdrawal[]> {
    try {
      const q = query(
        collection(db, 'pending_withdrawals'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || null,
        verifiedAt: doc.data().verifiedAt?.toDate() || null
      })) as PendingWithdrawal[];
    } catch (error) {
      console.error('Error getting user withdrawal requests:', error);
      return [];
    }
  }

  // Save user UPI ID
  static async saveUserUpiId(userId: string, upiId: string): Promise<void> {
    try {
      const userRef = doc(db, 'user_upi_ids', userId);
      const userDoc = await getDoc(userRef);

      if (userDoc.exists()) {
        const currentUpiIds = userDoc.data().upiIds || [];
        if (!currentUpiIds.includes(upiId)) {
          await updateDoc(userRef, {
            upiIds: [...currentUpiIds, upiId],
            updatedAt: serverTimestamp()
          });
        }
      } else {
        await addDoc(collection(db, 'user_upi_ids'), {
          userId,
          upiIds: [upiId],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error saving UPI ID:', error);
      throw error;
    }
  }

  // Get user's saved UPI IDs
  static async getUserSavedUpiIds(userId: string): Promise<string[]> {
    try {
      const userDoc = await getDoc(doc(db, 'user_upi_ids', userId));
      if (userDoc.exists()) {
        return userDoc.data().upiIds || [];
      }
      return [];
    } catch (error) {
      console.error('Error getting saved UPI IDs:', error);
      return [];
    }
  }

  // Delete saved UPI ID
  static async deleteSavedUpiId(userId: string, upiId: string): Promise<void> {
    try {
      const userRef = doc(db, 'user_upi_ids', userId);
      const userDoc = await getDoc(userRef);

      if (userDoc.exists()) {
        const currentUpiIds = userDoc.data().upiIds || [];
        const updatedUpiIds = currentUpiIds.filter((id: string) => id !== upiId);

        await updateDoc(userRef, {
          upiIds: updatedUpiIds,
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error deleting UPI ID:', error);
      throw error;
    }
  }

  // Get all pending deposits (for admin)
  static async getAllPendingDeposits(): Promise<PendingDeposit[]> {
    try {
      const q = query(
        collection(db, 'pending_deposits'),
        where('status', '==', 'PENDING'),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || null,
        verifiedAt: doc.data().verifiedAt?.toDate() || null,
      } as PendingDeposit));
    } catch (error) {
      console.error('Error getting pending deposits:', error);
      throw error;
    }
  }

  // Get all pending withdrawals (for admin)
  static async getAllPendingWithdrawals(): Promise<PendingWithdrawal[]> {
    try {
      const q = query(
        collection(db, 'pending_withdrawals'),
        where('status', '==', 'PENDING'),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || null,
        verifiedAt: doc.data().verifiedAt?.toDate() || null,
      } as PendingWithdrawal));
    } catch (error) {
      console.error('Error getting pending withdrawals:', error);
      throw error;
    }
  }

  // Approve deposit request (admin only)
  static async approveDepositRequest(
    requestId: string,
    adminId: string
  ): Promise<void> {
    try {
      const requestRef = doc(db, 'pending_deposits', requestId);
      await updateDoc(requestRef, {
        status: 'APPROVED',
        verifiedBy: adminId,
        verifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      // Update the matching transaction status to APPROVED
      const q = query(collection(db, 'transactions'), where('depositRequestId', '==', requestId));
      const snapshot = await getDocs(q);
      for (const docSnap of snapshot.docs) {
        await updateDoc(doc(db, 'transactions', docSnap.id), {
          status: 'APPROVED',
          updatedAt: new Date()
        });
      }
    } catch (error) {
      console.error('Error approving deposit request:', error);
      throw error;
    }
  }

  // Reject deposit request (admin only)
  static async rejectDepositRequest(
    requestId: string,
    adminId: string,
    rejectionReason: string
  ): Promise<void> {
    try {
      const requestRef = doc(db, 'pending_deposits', requestId);
      await updateDoc(requestRef, {
        status: 'REJECTED',
        verifiedBy: adminId,
        verifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        rejectionReason
      });
      // Update the matching transaction status to REJECTED
      const q = query(collection(db, 'transactions'), where('depositRequestId', '==', requestId));
      const snapshot = await getDocs(q);
      for (const docSnap of snapshot.docs) {
        await updateDoc(doc(db, 'transactions', docSnap.id), {
          status: 'REJECTED',
          updatedAt: new Date(),
          details: rejectionReason
        });
      }
    } catch (error) {
      console.error('Error rejecting deposit request:', error);
      throw error;
    }
  }

  // Approve withdrawal request (admin only)
  static async approveWithdrawalRequest(
    requestId: string,
    adminId: string
  ): Promise<void> {
    try {
      const requestRef = doc(db, 'pending_withdrawals', requestId);
      await updateDoc(requestRef, {
        status: 'APPROVED',
        verifiedBy: adminId,
        verifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      // Update the matching transaction status to APPROVED
      const q = query(collection(db, 'transactions'), where('withdrawalRequestId', '==', requestId));
      const snapshot = await getDocs(q);
      for (const docSnap of snapshot.docs) {
        await updateDoc(doc(db, 'transactions', docSnap.id), {
          status: 'APPROVED',
          updatedAt: new Date()
        });
      }
    } catch (error) {
      console.error('Error approving withdrawal request:', error);
      throw error;
    }
  }

  // Reject withdrawal request (admin only)
  static async rejectWithdrawalRequest(
    requestId: string,
    adminId: string,
    rejectionReason: string
  ): Promise<void> {
    try {
      const requestRef = doc(db, 'pending_withdrawals', requestId);
      await updateDoc(requestRef, {
        status: 'REJECTED',
        verifiedBy: adminId,
        verifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        rejectionReason
      });
      // Update the matching transaction status to REJECTED
      const q = query(collection(db, 'transactions'), where('withdrawalRequestId', '==', requestId));
      const snapshot = await getDocs(q);
      for (const docSnap of snapshot.docs) {
        await updateDoc(doc(db, 'transactions', docSnap.id), {
          status: 'REJECTED',
          updatedAt: new Date(),
          details: rejectionReason
        });
      }
    } catch (error) {
      console.error('Error rejecting withdrawal request:', error);
      throw error;
    }
  }  // Get admin UPI configuration
  static async getAdminUpiConfig(): Promise<AdminWalletConfig> {
    try {
      // Get from admin_config/wallet_config (primary source)
      const adminConfigSnap = await getDoc(doc(db, 'admin_config', 'wallet_config'));
      if (adminConfigSnap.exists()) {
        const data = adminConfigSnap.data();
        return data as AdminWalletConfig;
      }
      // Fallback: Try to get from public walletConfig collection 
      const publicConfigSnap = await getDoc(doc(db, 'walletConfig', 'main'));
      if (publicConfigSnap.exists()) {
        const data = publicConfigSnap.data();
        return data as AdminWalletConfig;
      }
      // Create default configuration if none exists
      const defaultConfig: AdminWalletConfig = {
        INR: {
          upiId: 'netwin@paytm',
          displayName: 'Netwin Gaming',
          isActive: true,
          qrCodeUrl: '',
          updatedAt: new Date(),
          updatedBy: 'system'
        },
        NGN: {
          paymentLink: '',
          displayName: 'Netwin Gaming',
          isActive: false,
          updatedAt: new Date(),
          updatedBy: 'system'
        },
        USD: {
          paymentLink: '',
          displayName: 'Netwin Gaming',
          isActive: false,
          updatedAt: new Date(),
          updatedBy: 'system'
        }
      };
      // Try to create default config in admin_config
      try {
        const configRef = doc(db, 'admin_config', 'wallet_config');
        await setDoc(configRef, {
          ...defaultConfig,
          updatedAt: serverTimestamp()
        });
      } catch (createError) {
        // Silently continue with default config
      }
      return defaultConfig;
    } catch (error) {
      console.error('UPIWalletService: Error getting admin wallet config:', error);
      // Return default configuration on error
      return {
        INR: {
          upiId: 'netwin@paytm',
          displayName: 'Netwin Gaming',
          isActive: true,
          qrCodeUrl: '',
          updatedAt: new Date(),
          updatedBy: 'system'
        },
        NGN: {
          paymentLink: '',
          displayName: 'Netwin Gaming',
          isActive: false,
          updatedAt: new Date(),
          updatedBy: 'system'
        },
        USD: {
          paymentLink: '',
          displayName: 'Netwin Gaming',
          isActive: false,
          updatedAt: new Date(),
          updatedBy: 'system'
        }
      };
    }
  }

  // Update admin UPI configuration (admin only)
  static async updateAdminUpiConfig(
    config: Omit<AdminWalletConfig, 'updatedAt'>,
    adminId: string
  ): Promise<void> {
    try {
      const configRef = doc(db, 'admin_config', 'wallet_config');
      await updateDoc(configRef, {
        ...config,
        updatedBy: adminId,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating admin UPI config:', error);
      throw error;
    }
  }
}
