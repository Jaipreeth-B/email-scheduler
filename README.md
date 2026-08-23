# Production-Grade Email Scheduler

A robust full-stack application designed to manage, schedule, and execute large-scale email campaigns reliably. The application is split into a Next.js (React) frontend and a Node.js (Express) backend powered by Redis, PostgreSQL, and BullMQ for robust job scheduling and rate limiting.

# Features Implemented

# Backend
- **Scheduler**: Utilizes BullMQ with Redis to reliably schedule individual emails based on dynamic delays (e.g., delaying each email by exactly X minutes).
- **Persistence**: PostgreSQL (via Prisma) acts as the source of truth. BullMQ persists queued jobs in Redis. If the server goes down, Redis picks up pending jobs immediately upon restart, ensuring zero data loss.
- **Rate Limiting**: Implemented a Redis-based sliding window rate limiter within the worker to enforce strict hourly limits per sender. If the limit is exceeded, jobs are gracefully delayed until the start of the next hour.
- **Concurrency**: The worker is configured with controlled concurrency (`workerConcurrency`), allowing multiple emails to be dispatched simultaneously without overloading the SMTP server.
- **Mock Email Service**: Integrated with Nodemailer and Ethereal Email for safe development testing without spamming real inboxes.

# Frontend
- **Authentication**: Fully functional Google OAuth login via `next-auth`.
- **Dashboard**: A clean, modern UI featuring tabs to switch between Scheduled and Sent emails.
- **Email Composition**: A dedicated modal allowing users to set a subject, write an email body, configure precise schedule times, set hourly limits, and specify delays between emails.
- **CSV/TXT Lead Uploads**: Includes robust file parsing (via PapaParse) that automatically detects and extracts valid email addresses from uploaded lists.
- **Tables & UX**: Interactive data tables featuring clean loading states, empty states, and dynamic status pill badges matching a premium Figma-like aesthetic.

---

# Architecture Overview

1. **How Scheduling Works:**
   When a user submits a campaign, the Express backend iterates through the extracted leads. It calculates the exact future UNIX timestamp for each individual recipient based on the user's requested "Start Time" and "Delay Between Emails". Each recipient becomes an individual `EmailJob` in PostgreSQL and is pushed into BullMQ with a specific `delay` parameter.
   
2. **How Persistence on Restart is Handled:**
   BullMQ operates on Redis, which durably stores all pending jobs. If the worker crashes or the server is restarted, the worker reconnects to Redis and immediately resumes processing the queue from where it left off. State changes (PENDING -> SCHEDULED -> SENT) are strictly mirrored in the PostgreSQL database via Prisma for accurate UI reflection.

3. **How Rate Limiting & Concurrency are Implemented:**
   Inside `emailWorker.ts`, every processed job increments a Redis counter keyed by the sender's email and the current UTC hour. If this counter exceeds the campaign's `hourlyLimit`, the worker leverages BullMQ's `moveToDelayed` to pause that specific job until the next hour begins. The worker itself can process multiple jobs in parallel up to the `workerConcurrency` limit defined in your config.

---

## Local Development Setup

### Prerequisites
- Node.js (v18+)
- PostgreSQL (Running locally or via Docker)
- Redis (Running locally or via Docker)
  > *Note: A `docker-compose.yml` file is provided to easily spin up Postgres and Redis.*

### 1. Backend Setup

1. Open a terminal and navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the `backend/` directory:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/emailscheduler?schema=public"
   REDIS_HOST="127.0.0.1"
   REDIS_PORT="6379"
   PORT="3001"
   WORKER_CONCURRENCY="5"
   ```
4. Run database migrations:
   ```bash
   npx prisma migrate dev
   ```
5. Start the backend API server:
   ```bash
   npm run dev
   ```
6. **Start the BullMQ Worker** (in a separate terminal):
   ```bash
   cd backend
   npm run worker
   ```

### 2. Frontend Setup

1. Open a terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env.local` file in the `frontend/` directory:
   ```env
   NEXTAUTH_URL="http://localhost:3000"
   NEXTAUTH_SECRET="super-secret-local-testing-key-12345"
   GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="your-google-client-secret"
   ```
4. Start the frontend development server:
   ```bash
   npm run dev
   ```
5. Open your browser to `http://localhost:3000`.

### 3. Ethereal Email Setup (Testing)

You **do not** need to manually configure SMTP credentials for testing. 
The backend is programmed to automatically generate a dynamic Ethereal test account whenever a campaign is scheduled or the worker spins up. 

When the `emailWorker` processes a job, it will print a preview link to the backend console:
```
Email sent to test@example.com: <message-id>
Preview URL: https://ethereal.email/message/...
```
You can click this link in your terminal to instantly view the generated email in your browser!
