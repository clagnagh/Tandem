'use client';

import type { MemberDto, ProjectDto } from '@tandem/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Board } from '../../../../../components/board/board.tsx';
import { AppHeader } from '../../../../../components/header.tsx';
import { ErrorText, Page } from '../../../../../components/ui.tsx';
import { api, errorMessage } from '../../../../../lib/api.ts';
import { useRequiredSession } from '../../../../../lib/use-session.ts';

export default function BoardPage() {
  const { workspaceId, projectId } = useParams<{ workspaceId: string; projectId: string }>();
  const user = useRequiredSession();
  const [project, setProject] = useState<ProjectDto>();
  const [members, setMembers] = useState<MemberDto[]>();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    Promise.all([api.listProjects(workspaceId), api.listMembers(workspaceId)]).then(
      ([projects, m]) => {
        setProject(projects.find((p) => p.id === projectId));
        setMembers(m);
      },
      (err: unknown) => {
        setError(errorMessage(err));
      },
    );
  }, [user, workspaceId, projectId]);

  if (!user) return null;
  return (
    <>
      <AppHeader user={user} />
      <Page title={project?.name ?? 'Board'}>
        <Link href={`/w/${workspaceId}`} className="text-sm underline">
          ← Back to workspace
        </Link>
        <ErrorText>{error}</ErrorText>
        {members && <Board workspaceId={workspaceId} projectId={projectId} members={members} />}
      </Page>
    </>
  );
}
