// Simple Firebase-compatible storage interface for server-side operations
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Removed import.meta.url for CommonJS compatibility

// Load environment variables
dotenv.config();

// Initialize Firebase Admin (if not already initialized)
// Initialize Firebase Admin (if not already initialized)
if (!getApps().length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (serviceAccount) {
    try {
      const parsedAccount = JSON.parse(serviceAccount);
      initializeApp({
        credential: cert(parsedAccount)
      });
      console.log('✅ Firebase Admin initialized using environment variable');
    } catch (error) {
      console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT:', error);
      initializeApp();
    }
  } else {
    initializeApp();
    console.log('✅ Firebase Admin initialized using default environment credentials');
  }
}

export const adminDb = getFirestore();

// Basic types for server-side operations
// Add country to ServerUser for update logic
export interface ServerUser {
  uid: string;
  email?: string;
  displayName?: string;
  phoneNumber?: string;
  photoURL?: string;
  country?: string;
  disabled?: boolean;
  emailVerified?: boolean;
}

export interface ServerNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: Date;
}

export interface ServerTransaction {
  id: string;
  userId: string;
  tournamentId?: string;
  amount: number;
  type: 'prize_money' | 'entry_fee' | 'wallet_credit' | 'withdrawal';
  status: 'pending' | 'completed' | 'failed';
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServerSupportTicket {
  id: string;
  ticketId: string;
  userId: string;
  userEmail: string;
  username: string;
  subject: string;
  category: string;
  priority: string;
  description: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  responses: unknown[];
}

// Server-side storage operations using Firebase Admin
export class FirebaseAdminStorage {
  public adminDb = adminDb;

  // User operations
  async getUser(uid: string): Promise<ServerUser | null> {
    try {
      const userDoc = await adminDb.collection('users').doc(uid).get();
      if (!userDoc.exists) return null;
      return { uid, ...userDoc.data() } as ServerUser;
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  }

  // User update operation (admin only for country)
  async updateUser(uid: string, updates: Partial<ServerUser>, isAdmin: boolean): Promise<boolean> {
    try {
      // Prevent country update unless admin
      if (!isAdmin && Object.prototype.hasOwnProperty.call(updates, 'country')) {
        throw new Error('Only admin can update country');
      }
      // Remove country from updates if not admin
      if (!isAdmin) {
        delete updates.country;
      }
      await adminDb.collection('users').doc(uid).update(updates);
      return true;
    } catch (error) {
      console.error('Error updating user:', error);
      return false;
    }
  }

  // Notification operations
  async createNotification(notification: Omit<ServerNotification, 'id'>): Promise<ServerNotification | null> {
    try {
      const docRef = await adminDb.collection('notifications').add({
        ...notification,
        createdAt: new Date(),
      });
      return { id: docRef.id, ...notification };
    } catch (error) {
      console.error('Error creating notification:', error);
      return null;
    }
  }

  async getUserNotifications(userId: string): Promise<ServerNotification[]> {
    try {
      const snapshot = await adminDb
        .collection('notifications')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      })) as ServerNotification[];
    } catch (error) {
      console.error('Error getting user notifications:', error);
      return [];
    }
  }

  // Transaction operations
  async createTransaction(transaction: Omit<ServerTransaction, 'id' | 'createdAt' | 'updatedAt'>): Promise<ServerTransaction | null> {
    try {
      const now = new Date();
      const docRef = await adminDb.collection('transactions').add({
        ...transaction,
        createdAt: now,
        updatedAt: now,
      });
      return {
        id: docRef.id,
        ...transaction,
        createdAt: now,
        updatedAt: now
      };
    } catch (error) {
      console.error('Error creating transaction:', error);
      return null;
    }
  }

  async getUserTransactions(userId: string): Promise<ServerTransaction[]> {
    try {
      const snapshot = await adminDb
        .collection('transactions')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      })) as ServerTransaction[];
    } catch (error) {
      console.error('Error getting user transactions:', error);
      return [];
    }
  }

  // Support ticket operations
  async createSupportTicket(ticketData: Omit<ServerSupportTicket, 'id'>): Promise<ServerSupportTicket | null> {
    try {
      const docRef = await adminDb.collection('support_tickets').add({
        ...ticketData,
        createdAt: ticketData.createdAt,
        updatedAt: ticketData.updatedAt
      });

      return {
        id: docRef.id,
        ...ticketData
      };
    } catch (error) {
      console.error('Error creating support ticket:', error);
      return null;
    }
  }

  async getUserSupportTickets(userId: string): Promise<ServerSupportTicket[]> {
    try {
      const snapshot = await adminDb
        .collection('support_tickets')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      })) as ServerSupportTicket[];
    } catch (error) {
      console.error('Error getting user support tickets:', error);
      return [];
    }
  }
}

export const storage = new FirebaseAdminStorage();
