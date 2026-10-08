'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, type SubmitEvent } from 'react';
import { Button, ErrorText, Field, Notice } from '../../components/ui.tsx';
import { api, errorMessage } from '../../lib/api.ts';
import { formText } from '../../lib/form.ts';

export function ResetForm() {
  const token = useSearchParams().get('token');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  if (!token) return <ErrorText>This reset link is incomplete or has expired.</ErrorText>;

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      await api.resetPassword(token ?? '', formText(event.currentTarget, 'password'));
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (done) {
    return (
      <Notice>
        Password changed. You were signed out everywhere.{' '}
        <Link href="/sign-in" className="underline">
          Sign in
        </Link>
      </Notice>
    );
  }
  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
      <Field
        label="New password"
        name="password"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
      />
      <ErrorText>{error}</ErrorText>
      <Button type="submit">Set new password</Button>
    </form>
  );
}
