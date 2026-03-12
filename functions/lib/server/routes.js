import { storage } from "./storage.js";
import { logger } from "./utils/logger.js";
import { emailService } from "./services/emailService.js";
const otpStore = new Map();
export function registerRoutes(app) {
    logger.info("Registering API routes...");
    app.get("/api/health", (_req, res) => {
        res.json({ status: "ok", message: "Server is running" });
    });
    app.post("/api/auth/send-otp", async (req, res) => {
        try {
            const { email, purpose = 'registration' } = req.body;
            if (!email) {
                return res.status(400).json({ message: 'Email is required' });
            }
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({ message: 'Invalid email format' });
            }
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            otpStore.set(email, {
                otp,
                expires: Date.now() + (5 * 60 * 1000),
                purpose
            });
            await emailService.sendOtpEmail(email, otp, purpose);
            res.json({
                message: 'OTP sent successfully',
                expires: 300
            });
        }
        catch (error) {
            logger.error(`Error sending OTP: ${error}`);
            res.status(500).json({ message: 'Failed to send OTP' });
        }
    });
    app.post("/api/auth/verify-otp", async (req, res) => {
        try {
            const { email, otp } = req.body;
            if (!email || !otp) {
                return res.status(400).json({ message: 'Email and OTP are required' });
            }
            const storedOtpData = otpStore.get(email);
            if (!storedOtpData) {
                return res.status(400).json({ message: 'OTP not found or expired' });
            }
            if (Date.now() > storedOtpData.expires) {
                otpStore.delete(email);
                return res.status(400).json({ message: 'OTP has expired' });
            }
            if (storedOtpData.otp !== otp) {
                return res.status(400).json({ message: 'Invalid OTP' });
            }
            otpStore.delete(email);
            res.json({
                message: 'OTP verified successfully',
                verified: true
            });
        }
        catch (error) {
            logger.error(`Error verifying OTP: ${error}`);
            res.status(500).json({ message: 'Failed to verify OTP' });
        }
    });
    app.get("/api/auth/check-username/:username", async (req, res) => {
        try {
            const { username } = req.params;
            if (!username || username.length < 3) {
                return res.status(400).json({ message: 'Username must be at least 3 characters' });
            }
            const normalizedUsername = username.toLowerCase();
            const usersRef = storage.adminDb.collection('users');
            const normalizedQuery = await usersRef.where('usernameNormalized', '==', normalizedUsername).limit(1).get();
            if (!normalizedQuery.empty) {
                return res.json({ available: false });
            }
            const legacyQuery = await usersRef.where('username', '==', username).limit(1).get();
            if (!legacyQuery.empty) {
                return res.json({ available: false });
            }
            res.json({ available: true });
        }
        catch (error) {
            logger.error(`Error checking username: ${error}`);
            res.status(500).json({ message: 'Failed to check username availability' });
        }
    });
    app.post("/api/admin/notifications", async (req, res) => {
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
        }
        catch (error) {
            logger.error(`Error creating notification: ${error}`);
            res.status(500).json({ error: "Internal server error" });
        }
    });
    app.get("/api/admin/users/:userId/notifications", async (req, res) => {
        try {
            const userId = req.params.userId;
            const notifications = await storage.getUserNotifications(userId);
            res.json({ notifications });
        }
        catch (error) {
            logger.error(`Error fetching notifications: ${error}`);
            res.status(500).json({ error: "Internal server error" });
        }
    });
    app.patch("/api/users/:uid", async (req, res) => {
        try {
            const uid = req.params.uid;
            const updates = req.body;
            const userWithAdmin = req;
            const isAdmin = Boolean(userWithAdmin.user?.isAdmin);
            const success = await storage.updateUser(uid, updates, isAdmin);
            if (!success) {
                return res.status(400).json({ error: "Failed to update user or not allowed" });
            }
            res.json({ message: "User updated" });
        }
        catch (error) {
            logger.error(`Error updating user: ${error}`);
            res.status(500).json({ error: "Internal server error" });
        }
    });
    app.get("/api/users/:uid/transactions", async (req, res) => {
        try {
            const uid = req.params.uid;
            const transactions = await storage.getUserTransactions(uid);
            res.json({ transactions });
        }
        catch (error) {
            logger.error(`Error fetching user transactions: ${error}`);
            res.status(500).json({ error: "Internal server error" });
        }
    });
    app.get("/api/users/:uid/wallet", async (req, res) => {
        try {
            const uid = req.params.uid;
            const user = await storage.getUser(uid);
            if (!user) {
                return res.status(404).json({ error: "User not found" });
            }
            const userDoc = await storage.adminDb.collection('users').doc(uid).get();
            const walletBalance = userDoc.data()?.walletBalance || 0;
            res.json({ walletBalance });
        }
        catch (error) {
            logger.error(`Error fetching wallet balance: ${error}`);
            res.status(500).json({ error: "Internal server error" });
        }
    });
    app.post("/api/support/tickets", async (req, res) => {
        try {
            const { userId, userEmail, username, subject, category, priority, description } = req.body;
            if (!userId || !subject || !category || !priority || !description) {
                return res.status(400).json({ error: "Missing required fields" });
            }
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
        }
        catch (error) {
            logger.error(`Error creating support ticket: ${error}`);
            res.status(500).json({ error: "Internal server error" });
        }
    });
    app.get("/api/support/tickets/:userId", async (req, res) => {
        try {
            const userId = req.params.userId;
            const tickets = await storage.getUserSupportTickets(userId);
            res.json({ success: true, tickets });
        }
        catch (error) {
            logger.error(`Error fetching support tickets: ${error}`);
            res.status(500).json({ error: "Internal server error" });
        }
    });
    logger.info("API routes registered successfully");
}
//# sourceMappingURL=routes.js.map