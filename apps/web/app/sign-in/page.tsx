import { Suspense } from 'react';
import { NarrowPage } from '../../components/ui.tsx';
import { SignInForm } from './sign-in-form.tsx';

export default function SignInPage() {
  return (
    <NarrowPage title="Sign in">
      {/* The form reads ?next= and ?verified=, which needs a Suspense boundary. */}
      <Suspense>
        <SignInForm />
      </Suspense>
    </NarrowPage>
  );
}
