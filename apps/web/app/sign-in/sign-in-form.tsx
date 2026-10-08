'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type SubmitEvent } from 'react';
import { Button, ErrorText, Field, Notice } from '../../components/ui.tsx';
import { api, ApiError, errorMessage } from '../../lib/api.ts';
import { safeNext } from '../../lib/safe-next.ts';
import { formText } from '../../lib/form.ts';

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api.signIn({
        email: formText(form, 'email'),
        password: formText(form, 'password'),
      });
      router.push(safeNext(params.get('next')));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 403
          ? 'Verify your email first: open the link we sent you.'
          : errorMessage(err),
      );
      setBusy(false);
    }
  }

  async function signInWithGitHub() {
    setError('');
    try {
      const { url } = await api.signInWithGitHub();
      window.location.href = url;
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      {params.get('verified') && <Notice>Email verified. You can sign in now.</Notice>}
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
        <Field label="Email" name="email" type="email" required autoComplete="email" />
        <Field
          label="Password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>
          Sign in
        </Button>
      </form>
      <Button variant="secondary" onClick={() => void signInWithGitHub()}>
        Sign in with GitHub
      </Button>
      <div className="flex justify-between text-sm text-zinc-600">
        <Link href="/sign-up" className="underline">
          Create an account
        </Link>
        <Link href="/forgot-password" className="underline">
          Forgot password?
        </Link>
      </div>
    </>
  );
}
