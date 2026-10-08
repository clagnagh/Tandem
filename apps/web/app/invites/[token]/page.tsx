'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorText, NarrowPage } from '../../../components/ui.tsx';
import { api, errorMessage } from '../../../lib/api.ts';
import { useRequiredSession } from '../../../lib/use-session.ts';

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const user = useRequiredSession(); // not signed in: sign in first, then come back here
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    setError('');
    try {
      const { workspaceId } = await api.acceptInvite(token);
      router.push(`/w/${workspaceId}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (!user) return null;
  return (
    <NarrowPage title="Join a workspace">
      <p className="text-zinc-600">
        You were invited to a Tandem workspace. You are signed in as {user.email}.
      </p>
      <ErrorText>{error}</ErrorText>
      <Button onClick={() => void accept()} disabled={busy}>
        Accept invite
      </Button>
    </NarrowPage>
  );
}
