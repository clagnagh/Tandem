'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type SessionUser } from './api.ts';

/**
 * The signed-in user, or undefined while loading. Sends visitors who are not
 * signed in to the sign-in page, which brings them back here afterwards.
 * (The API enforces access on every request; this only picks the page.)
 */
export function useRequiredSession(): SessionUser | undefined {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser>();

  useEffect(() => {
    let cancelled = false;
    api.getSession().then(
      (session) => {
        if (cancelled) return;
        if (session) setUser(session.user);
        else {
          const next = encodeURIComponent(window.location.pathname);
          router.replace(`/sign-in?next=${next}` as Route);
        }
      },
      () => {
        if (!cancelled) router.replace('/sign-in');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [router]);

  return user;
}
