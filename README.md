# Ticket Booking System

A learning project to understand concurrency, distributed locking, and race conditions in a ticket booking system (similar to BookMyShow/Ticketmaster).

## Tech Stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS
- **Database**: PostgreSQL 16
- **Cache/Locks**: Redis 7
- **ORM**: Prisma
- **Job Queue**: BullMQ (for background workers)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose

### Installation

1. **Clone and install dependencies**:
   ```bash
   npm install
   ```

2. **Start Docker containers**:
   ```bash
   docker-compose up -d
   ```

   This will start:
   - PostgreSQL on port 5432
   - Redis on port 6379
   - Redis Commander UI on http://localhost:8081

3. **Verify containers are running**:
   ```bash
   docker-compose ps
   ```

4. **Generate Prisma Client**:
   ```bash
   npx prisma generate
   ```

5. **Run database migrations** (once we add schemas):
   ```bash
   npx prisma migrate dev
   ```

6. **Start the development server**:
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

7. **Start background workers** (in a separate terminal):
   ```bash
   npm run workers
   ```

   The workers handle:
   - Reservation expiry (releases seats after timeout)
   - Future: Email notifications

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── events/       # Event management endpoints
│   │   ├── reservations/ # Reservation endpoints (distributed locking)
│   │   └── bookings/     # Booking endpoints
│   └── page.tsx          # Home page
├── components/            # React components
├── lib/                   # Utility libraries
│   ├── db.ts             # Prisma client singleton
│   ├── redis.ts          # Redis client singleton
│   ├── locks.ts          # Distributed locking utilities
│   ├── queue.ts          # BullMQ queue configuration
│   └── errors.ts         # Custom error classes
├── services/              # Business logic
│   ├── distributedBookingService.ts  # Production booking with Redis locks
│   ├── pessimisticBookingService.ts  # PostgreSQL FOR UPDATE locking
│   └── naiveBookingService.ts        # Intentionally buggy (educational)
├── workers/               # Background job processors
│   ├── index.ts                      # Worker entry point
│   ├── reservationCleanupWorker.ts   # Handles expired reservations
│   └── periodicCleanup.ts            # Fallback cleanup every 60s
├── types/                 # TypeScript type definitions
│   └── index.ts
└── validations/           # Zod validation schemas
    └── schemas.ts
```

## Development Tools

### Database Management

- **Prisma Studio**: Visual database browser
  ```bash
  npx prisma studio
  ```
  Opens at http://localhost:5555

### Redis Management

- **Redis Commander**: Web UI for Redis
  - Already running at http://localhost:8081 (started with docker-compose)

### Docker Commands

```bash
# Start containers
docker-compose up -d

# Stop containers
docker-compose down

# View logs
docker-compose logs -f

# Restart a service
docker-compose restart postgres
docker-compose restart redis
```

## Environment Variables

See [.env.example](.env.example) for required environment variables.

Local development uses [.env.local](.env.local).

## Running the Application

You need **two terminals** to run the full application:

**Terminal 1 - Next.js Server:**
```bash
npm run dev
```

**Terminal 2 - Background Workers:**
```bash
npm run workers
```

The workers handle:
- **Reservation Cleanup**: When users abandon reservations (don't complete payment), the workers release seats back to the pool after the expiry time (10 minutes by default).
- **Future: Notifications**: Email confirmations, SMS alerts, etc.

## Test Scripts

```bash
# Test basic API endpoints
npm run test:api

# Demonstrate race conditions (naive implementation)
npm run test:race

# Test PostgreSQL pessimistic locking
npm run test:pessimistic

# Test Redis distributed locking (5, 20, 50 concurrent users)
npm run test:distributed

# Test reservation expiry and cleanup
npm run test:expiry
```

## Learning Goals

This project explores:

1. **Race Conditions**: What happens when multiple users try to book the same seat?
2. **Distributed Locking**: Using Redis to prevent race conditions across multiple servers
3. **Database Transactions**: Ensuring data consistency with PostgreSQL
4. **Optimistic vs Pessimistic Locking**: Different approaches to concurrency
5. **Idempotency**: Handling duplicate requests gracefully with idempotency keys
6. **Background Jobs**: Using BullMQ for reliable task processing
7. **Reservation Expiry**: Automatically releasing abandoned reservations

## Implementation Approaches

This project implements **three different approaches** to handle concurrent bookings:

| Approach | File | Correctness | Avg Response | Scales? |
|----------|------|-------------|--------------|---------|
| Naive | `naiveBookingService.ts` | Broken | ~100ms | N/A |
| Pessimistic | `pessimisticBookingService.ts` | Correct | ~500ms | No |
| Distributed | `distributedBookingService.ts` | Correct | ~150ms | Yes |

- **Naive**: No locking, race conditions cause multiple "successful" bookings for the same seat
- **Pessimistic**: PostgreSQL `SELECT FOR UPDATE` row locks, requests queue up (high latency)
- **Distributed**: Redis locks, requests fail fast (low latency), works across multiple servers
