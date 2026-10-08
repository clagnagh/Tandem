'use client';

import { useState, type SubmitEvent } from 'react';
import { Button, ErrorText, Field, NarrowPage, Notice } from '../../components/ui.tsx';
import { api, errorMessage } from '../../lib/api.ts';
import { formText } from '../../lib/form.ts';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      await api.requestPasswordReset(formText(event.currentTarget, 'email'));
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <NarrowPage title="Reset your password">
      {sent ? (
        // The same message whether or not the email has an account.
        <Notice>If that email has an account, we sent it a reset link.</Notice>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          <Field label="Email" name="email" type="email" required autoComplete="email" />
          <ErrorText>{error}</ErrorText>
          <Button type="submit">Send reset link</Button>
        </form>
      )}
    </NarrowPage>
  );
}
