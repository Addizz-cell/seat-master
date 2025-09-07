import { NextResponse } from 'next/server';
import type { ApiResponse } from '@/types';

/**
 * POST /api/auth/logout
 *
 * Log out the current user by clearing session cookies.
 */
export async function POST() {
  const response: ApiResponse<{ message: string }> = {
    success: true,
    data: { message: 'Logged out successfully' },
  };

  const res = NextResponse.json(response);

  // Clear session cookies
  res.cookies.set('user-id', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0, // Expire immediately
    path: '/',
  });

  res.cookies.set('user-name', '', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });

  return res;
}
