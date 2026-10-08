'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type SubmitEvent } from 'react';
import { Button, ErrorText, Field, NarrowPage } from '../../components/ui.tsx';
import { api, errorMessage } from '../../lib/api.ts';
import { formText } from '../../lib/form.ts';

export default function SignUpPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api.signUp({
        name: formText(form, 'name'),
        email: formText(form, 'email'),
        password: formText(form, 'password'),
      });
      router.push('/check-email');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <NarrowPage title="Create your account">
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
        <Field label="Name" name="name" required autoComplete="name" />
        <Field label="Email" name="email" type="email" required autoComplete="email" />
        <Field
          label="Password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>
          Sign up
        </Button>
      </form>
      <p className="text-sm text-zinc-600">
        Already have an account?{' '}
        <Link href="/sign-in" className="underline">
          Sign in
        </Link>
      </p>
    </NarrowPage>
  );
}
