import { NextRequest, NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import prisma from '@/lib/db';
import { loginUserSchema, safeValidate } from '@/validations/schemas';
import type { ApiResponse } from '@/types';

interface LoginResponse {
  user: {
    id: string;
    email: string;
    name: string;
  };
}

/**
 * POST /api/auth/login
 *
 * Authenticate a user with email and password.
 * - Validates credentials
 * - Compares password hash with bcrypt
 * - Sets session cookie on success
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validation = safeValidate(loginUserSchema, body);
    if (!validation.success) {
      const response: ApiResponse<never> = {
        success: false,
        error: validation.error,
        code: 'VALIDATION_ERROR',
      };
      return NextResponse.json(response, { status: 400 });
    }

    const { email, password } = validation.data;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
      },
    });

    // Use constant-time comparison even when user doesn't exist
    // to prevent timing attacks
    if (!user) {
      // Hash a dummy password to maintain consistent timing
      await compare(password, '$2a$12$dummy.hash.to.prevent.timing.attacks');

      const response: ApiResponse<never> = {
        success: false,
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS',
      };
      return NextResponse.json(response, { status: 401 });
    }

    // Verify password
    const isValidPassword = await compare(password, user.passwordHash);

    if (!isValidPassword) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS',
      };
      return NextResponse.json(response, { status: 401 });
    }

    console.log(`[POST /api/auth/login] User logged in: ${user.email}`);

    const response: ApiResponse<LoginResponse> = {
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      },
    };

    // Create response with session cookie
    const res = NextResponse.json(response);

    // Set session cookie
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
    console.error('[POST /api/auth/login] Error:', error);
    const response: ApiResponse<never> = {
      success: false,
      error: 'An unexpected error occurred during login',
      code: 'INTERNAL_ERROR',
    };
    return NextResponse.json(response, { status: 500 });
  }
}
