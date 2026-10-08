// Small shared building blocks so pages look consistent.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const styles = {
    primary: 'bg-zinc-900 text-white hover:bg-zinc-700',
    secondary: 'border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50',
    danger: 'border border-red-300 bg-white text-red-700 hover:bg-red-50',
  }[variant];
  return (
    <button
      className={`rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-zinc-700">{label}</span>
      <input
        className="rounded-md border border-zinc-300 px-3 py-2 focus:border-zinc-900 focus:outline-none"
        {...props}
      />
    </label>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{children}</p>;
}

export function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children}
    </main>
  );
}

export function NarrowPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children}
    </main>
  );
}
