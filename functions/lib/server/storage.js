import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config();
if (!getApps().length) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccount) {
        try {
            const parsedAccount = JSON.parse(serviceAccount);
            initializeApp({
                credential: cert(parsedAccount)
            });
            console.log('✅ Firebase Admin initialized using environment variable');
        }
        catch (error) {
            console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT:', error);
        }
    }
    else {
        const serviceAccountPath = path.join(process.cwd(), 'serviceAccountKey.json');
        try {
            initializeApp({
                credential: cert(serviceAccountPath)
            });
            console.log('✅ Firebase Admin initialized using local serviceAccountKey.json');
        }
        catch (error) {
            console.warn('⚠️ No Firebase credentials found. Admin operations may fail.');
        }
    }
    if (!getApps().length) {
        initializeApp();
        console.log('✅ Firebase Admin initialized using default environment credentials');
    }
}
export const adminDb = getFirestore();
export class FirebaseAdminStorage {
    constructor() {
        this.adminDb = adminDb;
    }
    async getUser(uid) {
        try {
            const userDoc = await adminDb.collection('users').doc(uid).get();
            if (!userDoc.exists)
                return null;
            return { uid, ...userDoc.data() };
        }
        catch (error) {
            console.error('Error getting user:', error);
            return null;
        }
    }
    async updateUser(uid, updates, isAdmin) {
        try {
            if (!isAdmin && Object.prototype.hasOwnProperty.call(updates, 'country')) {
                throw new Error('Only admin can update country');
            }
            if (!isAdmin) {
                delete updates.country;
            }
            await adminDb.collection('users').doc(uid).update(updates);
            return true;
        }
        catch (error) {
            console.error('Error updating user:', error);
            return false;
        }
    }
    async createNotification(notification) {
        try {
            const docRef = await adminDb.collection('notifications').add({
                ...notification,
                createdAt: new Date(),
            });
            return { id: docRef.id, ...notification };
        }
        catch (error) {
            console.error('Error creating notification:', error);
            return null;
        }
    }
    async getUserNotifications(userId) {
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
            }));
        }
        catch (error) {
            console.error('Error getting user notifications:', error);
            return [];
        }
    }
    async createTransaction(transaction) {
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
        }
        catch (error) {
            console.error('Error creating transaction:', error);
            return null;
        }
    }
    async getUserTransactions(userId) {
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
            }));
        }
        catch (error) {
            console.error('Error getting user transactions:', error);
            return [];
        }
    }
    async createSupportTicket(ticketData) {
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
        }
        catch (error) {
            console.error('Error creating support ticket:', error);
            return null;
        }
    }
    async getUserSupportTickets(userId) {
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
            }));
        }
        catch (error) {
            console.error('Error getting user support tickets:', error);
            return [];
        }
    }
}
export const storage = new FirebaseAdminStorage();
//# sourceMappingURL=storage.js.map