import dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config();

import { onRequest } from "firebase-functions/v2/https";
import { app } from "./server/app.js";

// Export the express app as a Cloud Function (v2)
export const api = onRequest(app);
