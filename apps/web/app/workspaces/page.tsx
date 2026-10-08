'use client';

import type { WorkspaceDto } from '@tandem/shared';
import Link from 'next/link';
import { useEffect, useState, type SubmitEvent } from 'react';
import { AppHeader } from '../../components/header.tsx';
import { Button, ErrorText, Field, Page } from '../../components/ui.tsx';
import { api, errorMessage } from '../../lib/api.ts';
import { useRequiredSession } from '../../lib/use-session.ts';
import { formText } from '../../lib/form.ts';

export default function WorkspacesPage() {
  const user = useRequiredSession();
  const [workspaces, setWorkspaces] = useState<WorkspaceDto[]>();
  const [error, setError] = useState('');

  useEffect(() => {
    if (user)
      api.listWorkspaces().then(setWorkspaces, (err: unknown) => {
        setError(errorMessage(err));
      });
  }, [user]);

  async function onCreate(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError('');
    try {
      const ws = await api.createWorkspace(formText(form, 'name'));
      setWorkspaces((list) => [...(list ?? []), ws]);
      form.reset();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!user) return null;
  return (
    <>
      <AppHeader user={user} />
      <Page title="Your workspaces">
        <ul className="flex flex-col gap-2">
          {workspaces?.map((ws) => (
            <li key={ws.id}>
              <Link
                href={`/w/${ws.id}`}
                className="flex justify-between rounded-md border border-zinc-200 px-4 py-3 hover:bg-zinc-50"
              >
                <span className="font-medium">{ws.name}</span>
                <span className="text-sm text-zinc-500">{ws.role}</span>
              </Link>
            </li>
          ))}
          {workspaces?.length === 0 && <li className="text-zinc-500">No workspaces yet.</li>}
        </ul>
        <form onSubmit={(e) => void onCreate(e)} className="flex items-end gap-2">
          <Field label="New workspace" name="name" required maxLength={80} />
          <Button type="submit">Create</Button>
        </form>
        <ErrorText>{error}</ErrorText>
      </Page>
    </>
  );
}
