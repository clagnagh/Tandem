'use client';

import type { MemberDto, ProjectDto, WorkspaceDto } from '@tandem/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState, type SubmitEvent } from 'react';
import { AppHeader } from '../../../components/header.tsx';
import { Button, ErrorText, Field, Notice, Page } from '../../../components/ui.tsx';
import { api, errorMessage } from '../../../lib/api.ts';
import { useRequiredSession } from '../../../lib/use-session.ts';
import { formText } from '../../../lib/form.ts';

export default function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const user = useRequiredSession();
  const [workspace, setWorkspace] = useState<WorkspaceDto>();
  const [projects, setProjects] = useState<ProjectDto[]>();
  const [members, setMembers] = useState<MemberDto[]>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.listWorkspaces(),
      api.listProjects(workspaceId),
      api.listMembers(workspaceId),
    ]).then(
      ([all, p, m]) => {
        setWorkspace(all.find((w) => w.id === workspaceId));
        setProjects(p);
        setMembers(m);
      },
      (err: unknown) => {
        setError(errorMessage(err));
      },
    );
  }, [user, workspaceId]);

  async function onCreateProject(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError('');
    try {
      const project = await api.createProject(workspaceId, formText(form, 'name'));
      setProjects((list) => [...(list ?? []), project]);
      form.reset();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function onInvite(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError('');
    setNotice('');
    try {
      const invite = await api.invite(workspaceId, formText(form, 'email'));
      setNotice(`Invite sent to ${invite.email}. The link works once, for 7 days.`);
      form.reset();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!user) return null;
  return (
    <>
      <AppHeader user={user} />
      <Page title={workspace?.name ?? 'Workspace'}>
        <ErrorText>{error}</ErrorText>
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Projects</h2>
          <ul className="flex flex-col gap-2">
            {projects?.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/w/${workspaceId}/p/${project.id}`}
                  className="block rounded-md border border-zinc-200 px-4 py-3 font-medium hover:bg-zinc-50"
                >
                  {project.name}
                </Link>
              </li>
            ))}
            {projects?.length === 0 && <li className="text-zinc-500">No projects yet.</li>}
          </ul>
          <form onSubmit={(e) => void onCreateProject(e)} className="flex items-end gap-2">
            <Field label="New project" name="name" required maxLength={80} />
            <Button type="submit">Create</Button>
          </form>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Members</h2>
          <ul className="text-sm">
            {members?.map((m) => (
              <li key={m.userId}>
                {m.name}{' '}
                <span className="text-zinc-500">
                  ({m.email}, {m.role})
                </span>
              </li>
            ))}
          </ul>
          {workspace?.role === 'owner' && (
            <form onSubmit={(e) => void onInvite(e)} className="flex items-end gap-2">
              <Field label="Invite by email" name="email" type="email" required />
              <Button type="submit">Send invite</Button>
            </form>
          )}
          {notice && <Notice>{notice}</Notice>}
        </section>
      </Page>
    </>
  );
}
