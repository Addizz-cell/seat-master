# Setup Verification Guide

Follow these steps to verify your ticket booking system setup is complete and working.

## Step 1: Start Docker Containers

Start PostgreSQL and Redis containers:

```bash
npm run docker:up
```

Or manually:
```bash
docker-compose up -d
```

## Step 2: Verify Docker Containers

Check that all containers are running:

```bash
docker-compose ps
```

You should see:
- ✅ `ticket_booking_db` (PostgreSQL) - Up
- ✅ `ticket_booking_redis` (Redis) - Up
- ✅ `ticket_booking_redis_ui` (Redis Commander) - Up

### Troubleshooting Docker

If containers aren't running:

```bash
# View logs
npm run docker:logs

# Restart containers
docker-compose restart

# Stop and remove containers (fresh start)
docker-compose down
docker-compose up -d
```

## Step 3: Generate Prisma Client

Generate the Prisma client from the schema:

```bash
npm run db:generate
```

Or:
```bash
npx prisma generate
```

## Step 4: Run Verification Script

Test both PostgreSQL and Redis connections:

```bash
npm run verify
```

Expected output:
```
🔍 Verifying setup...

Testing PostgreSQL connection...
✅ PostgreSQL: Connected successfully

Testing Redis connection...
✅ Redis: Connected successfully
✅ Redis: Set/Get working (value: test-value)

✅ All systems operational!
```

### If Verification Fails

#### PostgreSQL Connection Error

```
❌ PostgreSQL: Connection failed
```

**Solutions:**
1. Check Docker container is running: `docker ps | grep postgres`
2. Verify `.env.local` has correct DATABASE_URL:
   ```
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ticket_booking"
   ```
3. Check if port 5432 is available: `netstat -an | grep 5432`
4. View PostgreSQL logs: `docker logs ticket_booking_db`

#### Redis Connection Error

```
❌ Redis: Connection failed
```

**Solutions:**
1. Check Docker container is running: `docker ps | grep redis`
2. Verify `.env.local` has correct REDIS_URL:
   ```
   REDIS_URL="redis://localhost:6379"
   ```
3. Check if port 6379 is available: `netstat -an | grep 6379`
4. View Redis logs: `docker logs ticket_booking_redis`

## Step 5: Access Management Tools

### PostgreSQL - Prisma Studio

Visual database browser:

```bash
npm run db:studio
```

Opens at: http://localhost:5555

### Redis - Redis Commander

Web UI for Redis (already running with Docker):

Open in browser: http://localhost:8081

You should see:
- Server: `local (redis:6379)`
- Can browse keys, set values, monitor commands

## Step 6: Test Redis Manually (Optional)

Connect to Redis CLI:

```bash
docker exec -it ticket_booking_redis redis-cli
```

Try commands:
```redis
PING
> PONG

SET test "Hello Redis"
> OK

GET test
> "Hello Redis"

DEL test
> (integer) 1

EXIT
```

## Step 7: Test PostgreSQL Manually (Optional)

Connect to PostgreSQL:

```bash
docker exec -it ticket_booking_db psql -U postgres -d ticket_booking
```

Try commands:
```sql
-- Show current database
SELECT current_database();

-- List tables (will be empty until migrations run)
\dt

-- Exit
\q
```

## Quick Reference - NPM Scripts

```bash
# Development
npm run dev              # Start Next.js dev server
npm run verify           # Verify DB and Redis connections

# Docker
npm run docker:up        # Start containers
npm run docker:down      # Stop containers
npm run docker:logs      # View container logs

# Database (Prisma)
npm run db:generate      # Generate Prisma Client
npm run db:migrate       # Run migrations
npm run db:studio        # Open Prisma Studio
```

## Next Steps

Once verification passes:

1. **Phase 2**: Define database schema in `prisma/schema.prisma`
2. Run your first migration: `npm run db:migrate`
3. Start building API endpoints in `src/app/api/`
4. Build the frontend UI

---

## Environment Variables Quick Reference

### `.env.local` (for local development)
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ticket_booking"
REDIS_URL="redis://localhost:6379"
NODE_ENV="development"
```

### `.env.example` (template for team)
```env
DATABASE_URL="postgresql://username:password@localhost:5432/database_name"
REDIS_URL="redis://localhost:6379"
NODE_ENV="development"
```

---

## Ports Reference

| Service          | Port | URL                      |
|------------------|------|--------------------------|
| Next.js          | 3000 | http://localhost:3000    |
| PostgreSQL       | 5432 | localhost:5432           |
| Redis            | 6379 | localhost:6379           |
| Redis Commander  | 8081 | http://localhost:8081    |
| Prisma Studio    | 5555 | http://localhost:5555    |
