import { useState } from 'react';
import { trpc } from '../api/trpc';

export function LoginView() {
  const utils = trpc.useContext();
  const [email, setEmail] = useState('owner@terpagro.local');
  const [password, setPassword] = useState('terp-demo');
  const login = trpc.auth.login.useMutation({
    onSuccess: () => utils.auth.me.invalidate()
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-panel p-4">
      <form
        className="w-full max-w-sm border border-line bg-white p-5 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          login.mutate({ email, password });
        }}
      >
        <h1 className="text-xl font-bold text-ink">TERP Agro</h1>
        <p className="mt-1 text-sm text-zinc-600">Sign in with a seeded operator account.</p>
        <label className="mt-5 block text-sm font-medium text-ink" htmlFor="email">
          Email
        </label>
        <input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} />
        <label className="mt-3 block text-sm font-medium text-ink" htmlFor="password">
          Password
        </label>
        <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        {login.error ? <div className="mt-3 border border-red-300 bg-red-50 p-2 text-sm text-red-900">{login.error.message}</div> : null}
        <button className="primary-button mt-5 w-full" type="submit" disabled={login.isLoading}>
          {login.isLoading ? 'Signing in...' : 'Sign in'}
        </button>
        <div className="mt-4 text-xs text-zinc-500">Demo password for all seeded users: terp-demo</div>
      </form>
    </main>
  );
}
