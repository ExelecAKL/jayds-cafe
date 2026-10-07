# Programming Environment

This document outlines the specific programming languages, frameworks, libraries, and external services used to develop both the Frontend and Backend of the proposed CafeOS system.

## Proposed System Frontend

The frontend of CafeOS consists of the three distinct user interfaces (Customer PWA, POS System, Admin Dashboard) built from a shared codebase.

| COMPONENT | VERSION | PURPOSE |
| :--- | :--- | :--- |
| **Next.js** | 14.1.0 | The core React framework used to build the applications. It provides routing (App Router), server-side rendering, and API endpoint capabilities. |
| **React** | 18.2.0 | The primary JavaScript library used for building interactive, component-based user interfaces. |
| **TypeScript** | 5.3.3 | A strict syntactical superset of JavaScript used to add static typing, reducing runtime errors and improving code maintainability. |
| **Tailwind CSS** | 3.4.1 | A utility-first CSS framework used for rapid, responsive, and consistent styling across all applications without writing custom CSS files. |
| **next-pwa** | 5.6.0 | A plugin used to convert the Next.js Customer application into a Progressive Web App (PWA), enabling offline caching and "add to home screen" capabilities. |
| **React Leaflet** | 4.2.1 | A React wrapper for Leaflet.js maps, used in the Customer application for pinning delivery addresses and calculating distances. |
| **Supabase JS Client** | 2.39.3 | The official Supabase JavaScript library used on the client side to query the database, subscribe to real-time events (like KDS updates), and handle user sessions. |

## Proposed System Backend

CafeOS operates on a serverless architecture where the backend is a combination of Next.js Serverless API routes and a managed Backend-as-a-Service (BaaS).

| COMPONENT | VERSION | PURPOSE |
| :--- | :--- | :--- |
| **Node.js** | 18.x / 20.x | The underlying JavaScript runtime environment used to execute Next.js server actions and API routes on the Vercel Edge Network. |
| **Supabase** | Cloud | The managed Backend-as-a-Service providing the core database, authentication system, and real-time WebSocket subscriptions. |
| **PostgreSQL** | 15+ | The advanced, open-source relational database running underneath Supabase, storing all application data (Users, Orders, Inventory). |
| **Supabase SSR** | 0.1.0 | A utility library used securely in the Next.js API routes and Server Components to parse, set, and manage server-side authentication cookies. |
| **Maya API** | v1 (Cloud) | The external REST API integrated into the Next.js backend to securely generate checkout sessions and process online customer payments. |
| **Lalamove API** | v3 (Cloud) | The external REST API integrated into the Next.js backend to fetch real-time delivery quotations and automatically dispatch riders. |
