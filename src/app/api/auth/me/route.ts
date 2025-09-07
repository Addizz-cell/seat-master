import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import type { ApiResponse } from '@/types';

interface MeResponse {
  user: {
    id: string;
    email: string;
    name: string;
  };
}

/**
 * GET /api/auth/me
 *
 * Get the current authenticated user's information.
 * Returns 401 if not authenticated.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.cookies.get('user-id')?.value;

    if (!userId) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'Not authenticated',
        code: 'NOT_AUTHENTICATED',
      };
      return NextResponse.json(response, { status: 401 });
    }

    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (!user) {
      // User ID in cookie but user doesn't exist - clear cookies
      const response: ApiResponse<never> = {
        success: false,
        error: 'Not authenticated',
        code: 'NOT_AUTHENTICATED',
      };

      const res = NextResponse.json(response, { status: 401 });

      res.cookies.set('user-id', '', {
        httpOnly: true,
        maxAge: 0,
        path: '/',
      });

      res.cookies.set('user-name', '', {
        httpOnly: false,
        maxAge: 0,
        path: '/',
      });

      return res;
    }

    const response: ApiResponse<MeResponse> = {
      success: true,
      data: { user },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[GET /api/auth/me] Error:', error);
    const response: ApiResponse<never> = {
      success: false,
      error: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
    };
    return NextResponse.json(response, { status: 500 });
  }
}
