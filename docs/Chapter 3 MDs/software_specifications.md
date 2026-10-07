# Software Specifications

This section outlines the software environment, tools, and technologies utilized in the development, testing, and deployment of the CafeOS system.

## Core Development Environment

| Category | Specification / Technology | Description |
| :--- | :--- | :--- |
| **Development OS** | Windows 11 | The primary operating system used for writing code, running local servers, and testing the application during the development phase. |
| **Web Server** | Node.js / Vercel Edge Network | Node.js serves as the underlying runtime environment. In production, the system is hosted on Vercel's Edge Network, utilizing serverless functions to handle API requests and Next.js server-side rendering. |
| **Programming Language** | TypeScript, JavaScript (ES6+), HTML5, CSS3 | **TypeScript** is the primary language used across the monorepo to ensure type safety and reduce runtime errors. Standard web technologies (HTML5, CSS3) are used for structure and styling. |
| **Dependency Manager** | npm (Node Package Manager) | Used to manage external libraries and configure the NPM Workspace for the monorepo structure, linking the Customer, POS, Admin, and Shared packages. |
| **DB Management** | Supabase / PostgreSQL 15+ | **Supabase** acts as the Backend-as-a-Service, providing a managed **PostgreSQL** relational database. The Supabase Dashboard and SQL Editor are used for direct database management and migrations. |
| **IDE** | Visual Studio Code / Cursor | Integrated Development Environments equipped with syntax highlighting, ESLint extensions, and terminal access to streamline coding and debugging. |
| **Version Control** | Git | Distributed version control system used to track changes, manage branches, and maintain the history of the codebase. |
| **Repo Hosting** | GitHub | Cloud-based hosting service for the Git repository. Used to store the source code securely and trigger automated deployments to Vercel via webhook integrations. |
| **Local Development** | Next.js Dev Server | The local testing environment is powered by the Next.js development server (`npm run dev`), running on `localhost` across different ports (e.g., 3000, 3001, 3002) to simulate the independent monorepo applications. |

## Third-Party APIs & Libraries

* **Frontend Framework:** Next.js 14 (App Router), React 18
* **Styling Framework:** Tailwind CSS
* **Payment Processing Gateway:** Maya Checkout API
* **Logistics & Delivery Gateway:** Lalamove API
* **State Management & Data Fetching:** React Hooks, Supabase Realtime Client
* **Authentication:** Supabase Auth (Email/Password & Session Tokens)
