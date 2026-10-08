'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api.ts';
import type { SessionUser } from '../lib/api.ts';

export function AppHeader({ user }: { user: SessionUser }) {
  const router = useRouter();
  async function signOut() {
    try {
      await api.signOut();
    } finally {
      router.push('/sign-in');
    }
  }
  return (
    <header className="border-b border-zinc-200">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/workspaces" className="font-semibold">
          Tandem
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-600">{user.name}</span>
          <button onClick={() => void signOut()} className="underline">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
