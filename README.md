# Production-Grade Email Scheduler

A production-oriented full-stack email scheduling and sending application built around reliable delayed job processing, persistent state management, concurrency control, and rate limiting.

The platform allows users to create bulk email campaigns, schedule emails for a specific time, control the delay between individual emails, enforce per-sender hourly limits, and monitor scheduled and sent emails through a web dashboard.

## Features

- Google OAuth authentication
- Bulk email scheduling through CSV lead uploads
- BullMQ delayed jobs backed by Redis
- Configurable worker concurrency
- Configurable delay between emails
- Atomic per-sender hourly rate limiting using Redis Lua
- Automatic rescheduling when hourly limits are reached
- PostgreSQL-backed campaign and email job state
- Idempotency checks with `SENDING` / `SENT` states
- Graceful API and worker shutdown
- Ethereal SMTP integration
- Scheduled and sent email dashboards
- Loading, empty, and error states
- Persistent queue state across service restarts

---

## Architecture & Tech Stack

### Backend

- **Runtime:** Node.js
- **Language:** TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Queue:** BullMQ
- **Queue Storage:** Redis
- **SMTP:** Ethereal Email

### Frontend

- **Framework:** Next.js / React
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Authentication:** NextAuth with Google OAuth
- **CSV Parsing:** PapaParse

### Infrastructure

- Docker
- PostgreSQL container
- Redis container

---

## System Architecture

The backend is intentionally split into two independent processes.
                    ┌─────────────────────┐
                    │      Next.js UI     │
                    │   Google OAuth      │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Express API       │
                    │                     │
                    │ Campaign creation   │
                    │ Email APIs          │
                    └───────┬───────┬─────┘
                            │       │
                            ▼       ▼
                     PostgreSQL    Redis
                            │       │
                            │       ▼
                            │   BullMQ Queue
                            │       │
                            │       ▼
                            │  Worker Process
                            │       │
                            │       ▼
                            │  Ethereal SMTP
                            │
                            ▼
                       Job State

### 1. Delayed Email Scheduling
We heavily utilize **BullMQ delayed jobs** rather than cron polling. Each email is enqueued with an exact timestamp (`scheduledAt`). BullMQ internally manages these in Redis and automatically activates them precisely when their delay expires.

### 2. Worker Concurrency
The system uses a dedicated Worker Process (`npm run worker`), isolated from the API. The number of simultaneous jobs the worker processes can be adjusted via the `WORKER_CONCURRENCY` environment variable.

### 3. Minimum Delay Between Emails
When a campaign is created, emails are spaced out based on the configured "delay between emails". The API computes a staggered timestamp for each lead, meaning that by default, jobs trickle into the active queue one by one, natively paced by BullMQ without requiring in-memory loops.

### 4. Atomic Hourly Rate Limiting
To enforce strict provider limits, the worker evaluates an **atomic Redis Lua script** before attempting SMTP delivery. 
- The Lua script is completely atomic and guarantees race-condition immunity across concurrent workers.
- It checks the hourly limit, increments the counter (if allowed), and sets a TTL of 1 hour on first use.

### 5. Rate-Limit Rescheduling
**When the limit is reached:** The job is **not dropped** or failed. Instead, the worker halts processing, calculates the exact time until the start of the next UTC hour, and uses BullMQ's `moveToDelayed` to reschedule the job. We correctly throw a `DelayedError` after `moveToDelayed` to prevent BullMQ from misinterpreting the state and throwing "Missing lock" errors. 
*(Note: As a trade-off, this bunches rate-limited jobs to fire concurrently at the exact start of the next hour up to the `WORKER_CONCURRENCY` limit).*

### 6. Multiple Senders
The system fully supports multiple simultaneous senders. Every scheduled campaign dynamically provisions a unique Ethereal SMTP account. The rate-limiting keys are strictly scoped to the combination of the `senderEmail` and the current UTC hour, isolating limits across independent campaigns.

### 7. Job State & Idempotency
Idempotency is built upon a defensive, state-driven approach:
1. When a job is picked up, it queries PostgreSQL to verify its status. If it's already `SENT`, it aborts immediately.
2. Just before invoking SMTP, the job enters a `SENDING` state in the database.
3. Upon success, it updates to `SENT`. Upon failure, it transitions to `FAILED`.
*(Note: Exactly-Once delivery is impossible with an external SMTP provider. There is an unavoidable crash window: If the process crashes immediately after Ethereal accepts the email but before PostgreSQL commits the `SENT` state, BullMQ will eventually recover the stalled job and resend the email, resulting in duplicate delivery).*

### 8. Graceful Shutdown
The API server strictly closes HTTP sockets and Prisma connections, while the Worker process gracefully drains active jobs (`emailWorker.close()`), disconnects Redis, and closes Prisma on `SIGINT`/`SIGTERM`.

### 9. Restart Persistence
Because all job data, including active delay timers, resides in Docker-backed Redis, a hard crash does not lose data. BullMQ's stalled job detection inherently recovers jobs that died mid-flight. *(Note: Restart persistence has been architecturally designed but relies on Docker volumes. Hard-kill restart persistence has NOT been manually tested and remains a manual verification item for deployment).*

---

## Environment Setup

### 10. Environment Setup

Create `.env.local` in `frontend/`:
```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_secure_random_string_here
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
```

Create `.env` in `backend/`:
```env
DATABASE_URL="postgresql://admin:password123@localhost:5433/email_scheduler?schema=public"
REDIS_HOST="localhost"
REDIS_PORT=6380
PORT=3001
WORKER_CONCURRENCY=5
```

---

## Local Development Instructions

### 11. Database Setup / Prisma Migrations
Ensure PostgreSQL is running via Docker Compose (see below). Then, run the Prisma migrations in the `backend` folder:
```bash
cd backend
npm install
npx prisma migrate dev
```

### 12. Local Development Instructions

**Docker Compose (Infrastructure)**
Use the provided `docker-compose.yml` to start Redis and PostgreSQL:
```bash
docker-compose up -d
```

**Backend API**
In the `backend` folder:
```bash
npm run dev
```

**BullMQ Worker**
In a new terminal window inside the `backend` folder:
```bash
npm run worker
```

**Frontend**
In the `frontend` folder:
```bash
cd frontend
npm install
npm run dev
```
The application will be accessible at `http://localhost:3000`.

---

## API Endpoints

### 13. API Endpoints
- **`POST /api/campaigns`**: Create a new campaign. Expects `{ subject, body, leads, scheduledAt, delayMinutes, hourlyLimit, userId }`.
- **`GET /api/campaigns`**: Fetch all campaigns and nested job statuses.
- **`GET /api/emails/scheduled`**: Fetch all pending/scheduled/rate-limited emails.
- **`GET /api/emails/sent`**: Fetch all processed (sent/failed) emails.

---

## Frontend Features

### 14. Frontend Features
- **Dashboard Overview**: Metrics overview of campaign performance.
- **CSV Upload**: Bulk upload leads via CSV.
- **Compose Modal**: Write emails with subject, body, and schedule.
- **Scheduled Emails Table**: Real-time view of queued emails, with dynamic badging for `RATE LIMITED` vs `SCHEDULED`.
- **Sent Emails Table**: Historical view of delivered/failed emails.
- **Interactive UI**: Fully polished UI/UX with active states, loading indicators, and toast notifications.

---

## Verification & Limitations

### 15. Testing & Verification Performed
- **Delay Between Emails:** Manually verified. Jobs correctly trickle into the active queue strictly separated by the requested delays.
- **Ethereal Delivery:** Manually verified. SMTP connections resolve, preview URLs are correctly generated, and test emails succeed.
- **Redis Hourly Rate Limiting:** Manually verified via code and execution. The atomic Lua script correctly restricts throughput.
- **BullMQ Rescheduling:** Manually verified. The `Missing lock` bug native to BullMQ rescheduling was found during testing and fixed by utilizing `DelayedError`.
- **TypeScript Builds:** Verified. `npm run build` passes fully on the backend.
- **Database Migrations:** Prisma schema validation and migrations pass perfectly.

### 16. Known Limitations & Trade-offs
- **Exactly-Once Delivery is Impossible:** With an external SMTP provider, true exactly-once delivery cannot be guaranteed. There is an unavoidable crash window: If the process crashes immediately *after* Ethereal accepts the email but *before* PostgreSQL commits the `SENT` state, BullMQ will eventually recover the stalled job and resend the email, resulting in duplicate delivery.
- **Rate Limit Reschedule Bunching:** When jobs exceed the hourly rate limit, they are collectively pushed to the exact start (00:00:00) of the next UTC hour. This causes their original staggered delay spacing to be lost for the subsequent hour, meaning they will be processed as rapidly as the `WORKER_CONCURRENCY` limit allows at the top of that hour.
- **Restart Persistence:** While architecturally guaranteed by Redis volumes and BullMQ stalled job detection, a simulated hard-kill restart persistence test has NOT been manually verified by the developer yet.

---

## 17. Project Structure
- `/backend`: Express API, Prisma schemas, BullMQ queue configuration, Lua scripts, and Worker logic.
- `/frontend`: Next.js application, React components, Tailwind styling, and PapaParse integration.
- `docker-compose.yml`: Redis and PostgreSQL infrastructure definition.

## 18. Engineering Notes
The architecture explicitly isolates the Worker process from the API process to ensure long-running queues do not impact the web server's event loop. BullMQ `delayed` jobs were favored over standard cron jobs to allow granular, per-second staggering of emails natively managed by Redis, minimizing memory overhead and avoiding custom sleep loops in the worker.