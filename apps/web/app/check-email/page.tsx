import Link from 'next/link';
import { NarrowPage } from '../../components/ui.tsx';

export default function CheckEmailPage() {
  return (
    <NarrowPage title="Check your email">
      <p className="text-zinc-600">
        We sent you a link to verify your email address. Open it, then sign in.
      </p>
      <Link href="/sign-in" className="text-sm underline">
        Go to sign in
      </Link>
    </NarrowPage>
  );
}
