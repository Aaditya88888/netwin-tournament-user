// import React from "react";
// import ReactDOM from "react-dom/client";
// import App from "./App";
// import "./index.css";
// import { initializeDebugMode } from "./lib/appCheck";
// import { initializeServiceWorker } from "./lib/serviceWorker";
// import { initializePerformanceMonitoring } from "./lib/performanceMonitor";
// import { initializeOfflineSupport } from "./lib/offline";
// import { ErrorReportingService } from "./lib/errorReportingService";
// import { AnalyticsService } from "./lib/analyticsService";
// import { PWAService } from "./lib/pwaService";

// // Initialize App Check debug mode before app starts
// initializeDebugMode();

// // Initialize Service Worker for production builds
// // initializeServiceWorker();

// // Initialize performance monitoring
// initializePerformanceMonitoring();

// // Initialize offline support for Firebase
// initializeOfflineSupport();

// // Initialize error reporting
// ErrorReportingService.initializeErrorHandlers();

// // Initialize PWA features
// /*
// if (typeof window !== 'undefined') {  PWAService.initialize().catch(error => {
//     console.warn('Failed to initialize PWA features:', error);
//   });
// }
// */

// ReactDOM.createRoot(document.getElementById("root")!).render(
//   <React.StrictMode>
//     <App />
//   </React.StrictMode>
// );



// **************************************************

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initializeDebugMode } from "./lib/appCheck";
import { initializeServiceWorker } from "./lib/serviceWorker";
import { initializePerformanceMonitoring } from "./lib/performanceMonitor";
import { initializeOfflineSupport } from "./lib/offline";
import { ErrorReportingService } from "./lib/errorReportingService";
import { AnalyticsService } from "./lib/analyticsService";
import { PWAService } from "./lib/pwaService";
import { registerSW } from "virtual:pwa-register";   // ✅ add this

// Register PWA Service Worker
registerSW();   // ✅ add this

// Initialize App Check debug mode before app starts
initializeDebugMode();

// Initialize Service Worker for production builds
// initializeServiceWorker();

// Initialize performance monitoring
initializePerformanceMonitoring();

// Initialize offline support for Firebase
initializeOfflineSupport();

// Initialize error reporting
ErrorReportingService.initializeErrorHandlers();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

