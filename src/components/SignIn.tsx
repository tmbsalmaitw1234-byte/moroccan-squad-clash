import { FormEvent, useState } from 'react';
import { act, useTournament } from '../store';
import { Button, inputCls, Modal } from './ui';

/** Sign-in options: Discord, or a one-time link sent by email (no password to remember). */
export function SignInButton({ className }: { className?: string }) {
  const { server } = useTournament();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string>();
  const [busy, setBusy] = useState(false);

  const sendLink = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await act(async () => { await server.signInWithEmail?.(email); return true; });
    setBusy(false);
    if (ok) setSentTo(email.trim());
  };

  return (
    <>
      <button onClick={() => { setOpen(true); setSentTo(undefined); }} className={className ?? 'w-full rounded-lg bg-gradient-to-b from-mred-2 to-mred py-2 text-sm font-semibold text-white hover:brightness-110'}>
        Sign in
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Sign in">
        {sentTo ? (
          <div className="space-y-3 text-center">
            <div className="text-5xl">📬</div>
            <p className="text-sm">We sent a sign-in link to <b>{sentTo}</b>.</p>
            <p className="text-xs text-mute">Open it <b>in this same browser</b> to finish signing in. No email? Check spam, or wait a minute and try again.</p>
            <Button variant="ghost" onClick={() => setSentTo(undefined)}>Use a different email</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <form onSubmit={sendLink} className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-mute" htmlFor="signin-email">Email</label>
              <input id="signin-email" type="email" required autoComplete="email" className={inputCls} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Button type="submit" className="w-full" disabled={busy || !email.trim()}>{busy ? 'Sending…' : '✉️ Email me a sign-in link'}</Button>
              <p className="text-[11px] text-mute">No password needed. Staff and administrators: use the email you were invited with.</p>
            </form>
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest text-mute"><span className="h-px flex-1 bg-white/10" />or<span className="h-px flex-1 bg-white/10" /></div>
            <button onClick={() => act(() => server.signIn?.())} className="w-full rounded-lg bg-[#5865F2] py-2.5 text-sm font-semibold text-white hover:brightness-110">
              Continue with Discord
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}
