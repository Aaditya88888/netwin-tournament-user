import type { Express, Request, Response } from "express";
import { storage } from "./storage.js";
import { logger } from "./utils/logger.js";
import { emailService } from "./services/emailService.js";

// OTP store for temporary storage
interface OtpData {
  otp: string;
  expires: number;
  purpose: string;
}

const otpStore = new Map<string, OtpData>();

// Simplified routes for Firebase-based backend
export function registerRoutes(app: Express) {
  logger.info("Registering API routes...");

  // Health check
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", message: "Server is running" });
  });

  // OTP Routes
  app.post("/api/auth/send-otp", async (req: Request, res: Response) => {
    try {
      const { email, purpose = 'registration' } = req.body;

      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
      }

      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      // Store OTP with 5-minute expiry
      otpStore.set(email, {
        otp,
        expires: Date.now() + (5 * 60 * 1000), // 5 minutes
        purpose
      });

      // Send OTP email
      await emailService.sendOtpEmail(email, otp, purpose);

      res.json({
        message: 'OTP sent successfully',
        expires: 300 // 5 minutes in seconds
      });

    } catch (error) {
      logger.error(`Error sending OTP: ${error}`);
      res.status(500).json({ message: 'Failed to send OTP' });
    }
  });

  app.post("/api/auth/verify-otp", async (req: Request, res: Response) => {
    try {
      const { email, otp } = req.body;

      if (!email || !otp) {
        return res.status(400).json({ message: 'Email and OTP are required' });
      }

      const storedOtpData = otpStore.get(email);

      if (!storedOtpData) {
        return res.status(400).json({ message: 'OTP not found or expired' });
      }

      // Check if OTP has expired
      if (Date.now() > storedOtpData.expires) {
        otpStore.delete(email);
        return res.status(400).json({ message: 'OTP has expired' });
      }

      // Verify OTP
      if (storedOtpData.otp !== otp) {
        return res.status(400).json({ message: 'Invalid OTP' });
      }

      // OTP is valid, remove it from store
      otpStore.delete(email);

      res.json({
        message: 'OTP verified successfully',
        verified: true
      });

    } catch (error) {
      logger.error(`Error verifying OTP: ${error}`);
      res.status(500).json({ message: 'Failed to verify OTP' });
    }
  });

  // Username availability check endpoint (public)
  app.get("/api/auth/check-username/:username", async (req: Request, res: Response) => {
    try {
      const { username } = req.params;

      if (!username || username.length < 3) {
        return res.status(400).json({ message: 'Username must be at least 3 characters' });
      }

      const normalizedUsername = username.toLowerCase();

      // Use admin SDK to check if username exists (bypasses security rules)
      const usersRef = storage.adminDb.collection('users');

      // Check normalized field
      const normalizedQuery = await usersRef.where('usernameNormalized', '==', normalizedUsername).limit(1).get();

      if (!normalizedQuery.empty) {
        return res.json({ available: false });
      }

      // Fallback for legacy records
      const legacyQuery = await usersRef.where('username', '==', username).limit(1).get();

      if (!legacyQuery.empty) {
        return res.json({ available: false });
      }

      res.json({ available: true });
    } catch (error) {
      logger.error(`Error checking username: ${error}`);
      res.status(500).json({ message: 'Failed to check username availability' });
    }
  });

  // Server-side notification creation (for admin operations)
  app.post("/api/admin/notifications", async (req: Request, res: Response) => {
    try {
      const { userId, title, message, type } = req.body;

      if (!userId || !title || !message) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const notification = await storage.createNotification({
        userId,
        title,
        message,
        type: type || 'info',
        read: false,
        createdAt: new Date(),
      });

      if (!notification) {
        return res.status(500).json({ error: "Failed to create notification" });
      }

      res.json({ message: "Notification created", notification });
    } catch (error) {
      logger.error(`Error creating notification: ${error}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get user notifications (server-side for admin)
  app.get("/api/admin/users/:userId/notifications", async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const notifications = await storage.getUserNotifications(userId);
      res.json({ notifications });
    } catch (error) {
      logger.error(`Error fetching notifications: ${error}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // User update endpoint
  app.patch("/api/users/:uid", async (req: Request, res: Response) => {
    try {
      const { uid } = req.params;
      const updates = req.body;
      // TODO: Replace with real authentication middleware
      const userWithAdmin = req as { user?: { isAdmin?: boolean } };
      const isAdmin = Boolean(userWithAdmin.user?.isAdmin);
      const success = await storage.updateUser(uid, updates, isAdmin);
      if (!success) {
        return res.status(400).json({ error: "Failed to update user or not allowed" });
      }
      res.json({ message: "User updated" });
    } catch (error) {
      logger.error(`Error updating user: ${error}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get user transactions
  app.get("/api/users/:uid/transactions", async (req: Request, res: Response) => {
    try {
      const { uid } = req.params;
      const transactions = await storage.getUserTransactions(uid);
      res.json({ transactions });
    } catch (error) {
      logger.error(`Error fetching user transactions: ${error}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get user wallet balance
  app.get("/api/users/:uid/wallet", async (req: Request, res: Response) => {
    try {
      const { uid } = req.params;
      const user = await storage.getUser(uid);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get wallet balance from user document
      const userDoc = await storage.adminDb.collection('users').doc(uid).get();
      const walletBalance = userDoc.data()?.walletBalance || 0;

      res.json({ walletBalance });
    } catch (error) {
      logger.error(`Error fetching wallet balance: ${error}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Server-side ticket submission
  app.post("/api/support/tickets", async (req: Request, res: Response) => {
    try {
      const { userId, userEmail, username, subject, category, priority, description } = req.body;

      if (!userId || !subject || !category || !priority || !description) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Generate a unique ticket ID
      const ticketId = `ST-${Date.now().toString(36).toUpperCase()}`;

      const ticketData = {
        ticketId,
        userId,
        userEmail: userEmail || "",
        username: username || "Anonymous",
        subject: subject.trim(),
        category,
        priority,
        description: description.trim(),
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
        responses: []
      };

      const ticket = await storage.createSupportTicket(ticketData);

      if (!ticket) {
        return res.status(500).json({ error: "Failed to create support ticket" });
      }

      res.json({
        success: true,
        message: "Support ticket created successfully",
        ticketId,
        ticket
      });
    } catch (error) {
      logger.error(`Error creating support ticket: ${error}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get user tickets (server-side)
  app.get("/api/support/tickets/:userId", async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const tickets = await storage.getUserSupportTickets(userId);
      res.json({ success: true, tickets });
    } catch (error) {
      logger.error(`Error fetching support tickets: ${error}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  logger.info("API routes registered successfully");
}
