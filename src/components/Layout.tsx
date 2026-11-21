import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { act, useTournament } from '../store';
import { balanceOf, currentPhase, PHASE_LABEL } from '../engine/logic';
import { isStaff, ROLE_META } from '../engine/permissions';
import { fmtNum } from '../engine/util';
import { Badge, Crest, cx, MoroccoFlag, Toaster } from './ui';
import { ErrorBoundary } from './ErrorBoundary';
import { SignInButton } from './SignIn';
import { EditBar, EditToggle, TextEditor, Txt } from '../content/Text';

export const NAV: { to: string; label: string; icon: string; staff?: boolean }[] = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/overview', label: 'Tournament Overview', icon: '📋' },
  { to: '/register', label: 'Registration', icon: '📝' },
  { to: '/squads', label: 'Squads', icon: '🛡️' },
  { to: '/draw', label: 'Group Draw', icon: '🎲' },
  { to: '/standings', label: 'Group Standings', icon: '📊' },
  { to: '/schedule', label: 'Match Schedule', icon: '🗓️' },
  { to: '/live', label: 'Live Match Center', icon: '🔴' },
  { to: '/bracket', label: 'Knockout Bracket', icon: '🏆' },
  { to: '/killers', label: 'Top Killers', icon: '🎯' },
  { to: '/predict', label: 'DHD Prediction Arena', icon: '🎰' },
  { to: '/prizes', label: 'Prizes & Rewards', icon: '💰' },
  { to: '/rules', label: 'Rules', icon: '📜' },
  { to: '/report', label: 'Report a Player', icon: '🚨' },
  { to: '/staff', label: 'Staff', icon: '👥' },
  { to: '/admin', label: 'Admin Dashboard', icon: '⚙️', staff: true },
];

function IdentitySwitcher() {
  const { state, me, server, mode, authed } = useTournament();
  if (mode === 'supabase') {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 p-3">
        {authed ? (
          <>
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full text-sm font-bold" style={{ background: me.avatarColor }}>{me.name.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{me.name}</div>
                <div className="truncate text-[11px] text-mute">@{me.discord} · {me.roles.map((r) => ROLE_META[r].label).join(', ')}</div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-mute">DHD wallet</span>
              <span className="font-display text-base font-bold text-gold">{fmtNum(balanceOf(state, me.id))} DHD</span>
            </div>
            <button onClick={() => act(() => server.signOut?.())} className="mt-2 w-full rounded-md border border-white/10 py-1 text-xs text-mute hover:text-white">Sign out</button>
          </>
        ) : (
          <>
            <p className="mb-2 text-xs text-mute">Sign in with your email or Discord to register, predict with DHD, chat and report.</p>
            <SignInButton />
          </>
        )}
      </div>
    );
  }
  const people = state.users.filter((u) => !u.id.startsWith('u_bot'));
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">Demo sign-in</span>
        <span className="text-[10px] text-mute">no real auth</span>
      </div>
      <select
        value={me.id}
        onChange={(e) => server.signInAs?.(e.target.value)}
        className="w-full rounded-md border border-white/10 bg-ink-3 px-2 py-1.5 text-sm"
        aria-label="Switch demo account"
      >
        {people.map((u) => (
          <option key={u.id} value={u.id}>
            {ROLE_META[u.roles[0]].icon} {u.name} — {u.roles.map((r) => ROLE_META[r].label).join(', ')}
          </option>
        ))}
      </select>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-mute">DHD wallet</span>
        <span className="font-display text-base font-bold text-gold">{fmtNum(balanceOf(state, me.id))} DHD</span>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { state, me, mode, status, error } = useTournament();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo({ top: 0 }); }, [loc.pathname]);
  const phase = currentPhase(state);
  const live = state.matches.filter((m) => m.status === 'live').length;

  const nav = (
    <nav className="flex flex-col gap-0.5">
      {NAV.filter((n) => !n.staff || isStaff(me)).map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.to === '/'}
          className={({ isActive }) =>
            cx(
              'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
              isActive ? 'bg-gradient-to-r from-mred/40 to-transparent text-white shadow-[inset_3px_0_0_#e23b41]' : 'text-white/65 hover:bg-white/5 hover:text-white',
            )
          }
        >
          <span className="w-5 text-center">{n.icon}</span>
          <span className="flex-1">{n.label}</span>
          {n.to === '/live' && live > 0 && <span className="live-dot h-2 w-2 rounded-full bg-red-500" />}
        </NavLink>
      ))}
    </nav>
  );

  const brand = (
    <NavLink to="/" className="flex items-center gap-3">
      <Crest size={40} />
      <div className="leading-tight">
        <div className="font-display text-lg font-bold uppercase tracking-wider"><Txt k="site.brand" /></div>
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-mute">
          <Txt k="site.brandSub" /> <MoroccoFlag className="h-2.5 w-4" />
        </div>
      </div>
    </NavLink>
  );

  return (
    <div className="bg-arena min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col gap-4 overflow-y-auto border-r border-white/5 bg-ink/80 p-4 backdrop-blur-xl lg:flex">
        {brand}
        <div className="flex items-center gap-2">
          <Badge tone="red">● {PHASE_LABEL[phase]}</Badge>
          {live > 0 && <Badge tone="red"><span className="live-dot h-1.5 w-1.5 rounded-full bg-red-400" /> {live} LIVE</Badge>}
        </div>
        {nav}
        <div className="mt-auto space-y-2"><EditToggle /><IdentitySwitcher /></div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-white/5 bg-ink/85 px-4 py-3 backdrop-blur-xl lg:hidden">
        {brand}
        <button onClick={() => setOpen(true)} className="rounded-lg border border-white/10 px-3 py-2 text-sm" aria-label="Open menu">☰</button>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 lg:hidden" onClick={() => setOpen(false)}>
          <div className="glass-strong anim-rise absolute inset-y-0 right-0 flex w-[86%] max-w-xs flex-col gap-4 overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <Badge tone="red">● {PHASE_LABEL[phase]}</Badge>
              <button onClick={() => setOpen(false)} className="text-2xl text-mute" aria-label="Close menu">×</button>
            </div>
            <IdentitySwitcher />
            <EditToggle />
            {nav}
          </div>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
          {status === 'error' && (
            <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              ⚠️ Could not reach the tournament database: {error}. Check your connection and the Supabase settings in <code>.env</code>.
            </div>
          )}
          {status === 'loading' ? (
            <div className="flex flex-col items-center justify-center gap-3 py-32 text-mute">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-mred-2" />
              Loading tournament…
            </div>
          ) : <ErrorBoundary resetKey={loc.pathname}>{children}</ErrorBoundary>}
        </div>
        <footer className="border-t border-white/5 px-4 py-6 text-center text-xs text-mute md:px-8">
          <Txt k="site.footer" />
          <br />
          {mode === 'demo'
            ? <span className="text-amber-300/80">Demo mode: data is stored in this browser only. Connect Supabase for real accounts, persistence and server-side security.</span>
            : <span>Live data · Discord sign-in · every action verified on the server.</span>}
        </footer>
      </main>
      <Toaster />
      <TextEditor />
      <EditBar />
    </div>
  );
}
