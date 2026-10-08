import { Suspense } from 'react';
import { NarrowPage } from '../../components/ui.tsx';
import { ResetForm } from './reset-form.tsx';

export default function ResetPasswordPage() {
  return (
    <NarrowPage title="Choose a new password">
      <Suspense>
        <ResetForm />
      </Suspense>
    </NarrowPage>
  );
}
