import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import prisma from '@/lib/db';
import { registerUserSchema, safeValidate } from '@/validations/schemas';
import type { ApiResponse } from '@/types';

interface RegisterResponse {
  user: {
    id: string;
    email: string;
    name: string;
  };
}

/**
 * POST /api/auth/register
 *
 * Register a new user account.
 * - Validates email format and password requirements
 * - Hashes password with bcrypt (cost factor 12)
 * - Creates user in database
 * - Sets session cookie
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validation = safeValidate(registerUserSchema, body);
    if (!validation.success) {
      const response: ApiResponse<never> = {
        success: false,
        error: validation.error,
        code: 'VALIDATION_ERROR',
      };
      return NextResponse.json(response, { status: 400 });
    }

    const { email, name, password } = validation.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'An account with this email already exists',
        code: 'EMAIL_EXISTS',
      };
      return NextResponse.json(response, { status: 409 });
    }

    // Hash password with bcrypt (cost factor 12 for good security/performance balance)
    const passwordHash = await hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    console.log(`[POST /api/auth/register] User registered: ${user.email}`);

    const response: ApiResponse<RegisterResponse> = {
      success: true,
      data: { user },
    };

    // Create response with session cookie
    const res = NextResponse.json(response, { status: 201 });

    // Set session cookie (simple approach - in production use JWT or session store)
    res.cookies.set('user-id', user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    res.cookies.set('user-name', user.name, {
      httpOnly: false, // Allow client-side access for display
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return res;
  } catch (error) {
    console.error('[POST /api/auth/register] Error:', error);
    const response: ApiResponse<never> = {
      success: false,
      error: 'An unexpected error occurred during registration',
      code: 'INTERNAL_ERROR',
    };
    return NextResponse.json(response, { status: 500 });
  }
}
