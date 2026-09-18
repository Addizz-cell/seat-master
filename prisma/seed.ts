/**
 * Database Seed Script
 *
 * This script populates the database with realistic test data for development:
 * - Test users with hashed passwords
 * - Sample events (concert, sports, theater) with ON_SALE status
 * - Realistic seat layouts with different sections and pricing
 *
 * Run with: npx prisma db seed
 */

import {
  PrismaClient,
  EventCategory,
  EventStatus,
  SeatType
} from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { addDays, addHours } from 'date-fns';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

// Create PostgreSQL connection pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

/**
 * Hash a password using bcrypt
 */
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Create test users
 */
async function seedUsers() {
  console.log('🌱 Seeding users...');

  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: 'alice@example.com',
        name: 'Alice Johnson',
        passwordHash: await hashPassword('password123'),
      },
    }),
    prisma.user.create({
      data: {
        email: 'bob@example.com',
        name: 'Bob Smith',
        passwordHash: await hashPassword('password123'),
      },
    }),
    prisma.user.create({
      data: {
        email: 'charlie@example.com',
        name: 'Charlie Brown',
        passwordHash: await hashPassword('password123'),
      },
    }),
  ]);

  console.log(`✅ Created ${users.length} test users`);
  return users;
}

/**
 * Generate seats for an event with realistic layout
 *
 * @param eventId - Event to create seats for
 * @param basePrice - Base price for regular seats
 * @returns Array of seat data objects
 */
function generateSeats(eventId: string, basePrice: number) {
  const seats = [];

  // VIP Section (2 rows × 10 seats, 3x base price)
  for (let row = 1; row <= 2; row++) {
    const rowLetter = String.fromCharCode(64 + row); // A, B
    for (let seat = 1; seat <= 10; seat++) {
      seats.push({
        eventId,
        seatNumber: `VIP-${rowLetter}${seat}`,
        row: `VIP-${rowLetter}`,
        section: 'VIP',
        seatType: SeatType.VIP,
        price: basePrice * 3,
      });
    }
  }

  // Premium Section (3 rows × 15 seats, 2x base price)
  for (let row = 1; row <= 3; row++) {
    const rowLetter = String.fromCharCode(66 + row); // C, D, E
    for (let seat = 1; seat <= 15; seat++) {
      seats.push({
        eventId,
        seatNumber: `PREM-${rowLetter}${seat}`,
        row: `PREM-${rowLetter}`,
        section: 'Premium',
        seatType: SeatType.PREMIUM,
        price: basePrice * 2,
      });
    }
  }

  // Orchestra Section (10 rows × 20 seats, 1.5x base price)
  for (let row = 1; row <= 10; row++) {
    const rowLetter = String.fromCharCode(69 + row); // F through O
    for (let seat = 1; seat <= 20; seat++) {
      seats.push({
        eventId,
        seatNumber: `ORCH-${rowLetter}${seat}`,
        row: `ORCH-${rowLetter}`,
        section: 'Orchestra',
        seatType: SeatType.REGULAR,
        price: basePrice * 1.5,
      });
    }
  }

  // Balcony Section (8 rows × 25 seats, 1x base price)
  for (let row = 1; row <= 8; row++) {
    const rowLetter = String.fromCharCode(79 + row); // P through W
    for (let seat = 1; seat <= 25; seat++) {
      seats.push({
        eventId,
        seatNumber: `BALC-${rowLetter}${seat}`,
        row: `BALC-${rowLetter}`,
        section: 'Balcony',
        seatType: SeatType.REGULAR,
        price: basePrice,
      });
    }
  }

  return seats;
}

/**
 * Create sample events with seats
 */
async function seedEvents() {
  console.log('🌱 Seeding events...');

  const now = new Date();

  // Event 1: Rock Concert
  console.log('  Creating concert event...');
  const concert = await prisma.event.create({
    data: {
      name: 'Summer Rock Festival 2026',
      description:
        'The biggest rock festival of the year featuring legendary bands and emerging artists. Get ready for an unforgettable night of music!',
      category: EventCategory.CONCERT,
      venueName: 'Madison Square Garden',
      venueAddress: '4 Pennsylvania Plaza',
      venueCity: 'New York',
      eventDate: addDays(now, 30), // 30 days from now
      doorsOpenAt: addDays(addHours(now, -2), 30), // 2 hours before event
      saleStartTime: now, // Sales started now
      saleEndTime: addDays(now, 29), // End 1 day before event
      totalSeats: 0, // Will be updated after creating seats
      availableSeats: 0,
      status: EventStatus.ON_SALE,
    },
  });

  const concertSeats = generateSeats(concert.id, 50); // Base price $50
  await prisma.seat.createMany({ data: concertSeats });

  // Update event seat counts
  await prisma.event.update({
    where: { id: concert.id },
    data: {
      totalSeats: concertSeats.length,
      availableSeats: concertSeats.length,
    },
  });

  console.log(`  ✅ Concert: ${concertSeats.length} seats created`);

  // Event 2: Basketball Game
  console.log('  Creating sports event...');
  const sportsGame = await prisma.event.create({
    data: {
      name: 'NBA Finals Game 7',
      description:
        'The ultimate showdown! Championship on the line. Witness history in the making as two teams battle for the title.',
      category: EventCategory.SPORTS,
      venueName: 'TD Garden',
      venueAddress: '100 Legends Way',
      venueCity: 'Boston',
      eventDate: addDays(now, 15), // 15 days from now
      doorsOpenAt: addDays(addHours(now, -3), 15), // 3 hours before event
      saleStartTime: now,
      saleEndTime: addDays(now, 14),
      totalSeats: 0,
      availableSeats: 0,
      status: EventStatus.ON_SALE,
    },
  });

  const sportsSeats = generateSeats(sportsGame.id, 75); // Base price $75
  await prisma.seat.createMany({ data: sportsSeats });

  await prisma.event.update({
    where: { id: sportsGame.id },
    data: {
      totalSeats: sportsSeats.length,
      availableSeats: sportsSeats.length,
    },
  });

  console.log(`  ✅ Sports: ${sportsSeats.length} seats created`);

  // Event 3: Broadway Theater
  console.log('  Creating theater event...');
  const theater = await prisma.event.create({
    data: {
      name: 'Hamilton - Special Anniversary Performance',
      description:
        'Celebrate the anniversary of this groundbreaking musical. Limited special performance with original cast members.',
      category: EventCategory.THEATER,
      venueName: 'Richard Rodgers Theatre',
      venueAddress: '226 W 46th St',
      venueCity: 'New York',
      eventDate: addDays(now, 45), // 45 days from now
      doorsOpenAt: addDays(addHours(now, -1), 45), // 1 hour before event
      saleStartTime: now,
      saleEndTime: addDays(now, 44),
      totalSeats: 0,
      availableSeats: 0,
      status: EventStatus.ON_SALE,
    },
  });

  const theaterSeats = generateSeats(theater.id, 100); // Base price $100
  await prisma.seat.createMany({ data: theaterSeats });

  await prisma.event.update({
    where: { id: theater.id },
    data: {
      totalSeats: theaterSeats.length,
      availableSeats: theaterSeats.length,
    },
  });

  console.log(`  ✅ Theater: ${theaterSeats.length} seats created`);

  const totalSeats = concertSeats.length + sportsSeats.length + theaterSeats.length;
  console.log(`✅ Created 3 events with ${totalSeats} total seats`);

  return [concert, sportsGame, theater];
}

/**
 * Main seed function
 */
async function main() {
  console.log('🚀 Starting database seed...\n');

  try {
    // Clear existing data (in development only!)
    console.log('🧹 Cleaning up existing data...');
    await prisma.auditLog.deleteMany();
    await prisma.bookingSeat.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.seat.deleteMany();
    await prisma.event.deleteMany();
    await prisma.user.deleteMany();
    console.log('✅ Cleanup complete\n');

    // Seed fresh data
    await seedUsers();
    console.log();
    await seedEvents();

    console.log('\n✅ Database seeded successfully!');
    console.log('\n📊 Summary:');
    console.log('  - 3 test users (password: password123)');
    console.log('  - 3 events (Concert, Sports, Theater)');
    console.log('  - ~470 seats per event (VIP, Premium, Orchestra, Balcony)');
    console.log('\n🎫 Test user emails:');
    console.log('  - alice@example.com');
    console.log('  - bob@example.com');
    console.log('  - charlie@example.com');
    console.log('\n💡 Next steps:');
    console.log('  - Start dev server: npm run dev');
    console.log('  - Open Prisma Studio: npm run db:studio');
    console.log('  - View events in database');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

// Execute seed
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
