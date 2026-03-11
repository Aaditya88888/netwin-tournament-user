import dotenv from 'dotenv';
dotenv.config();
import { onRequest } from "firebase-functions/v2/https";
import { app } from "./server/app.js";
export const api = onRequest(app);
//# sourceMappingURL=index.js.map