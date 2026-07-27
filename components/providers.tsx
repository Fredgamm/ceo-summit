"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Wraps the app with NextAuth's SessionProvider so client components can call
 * useSession() (e.g. header user menu, real-time badge counts) without each
 * one fetching /api/auth/session independently.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
