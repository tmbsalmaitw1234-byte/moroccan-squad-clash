import { ButtonHTMLAttributes, ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Match, MatchStatus, Squad } from '../types';
import { useToasts } from '../store';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

/* ───── Layout primitives ───── */

export function PageHeader({ kicker, title, subtitle, right }: { kicker?: ReactNode; title: ReactNode; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between anim-rise">
      <div>
        {kicker && <div className="mb-1 text-xs font-bold uppercase tracking-[0.25em] text-mred-2">{kicker}</div>}
        <h1 className="font-display text-3xl font-bold uppercase leading-none tracking-wide md:text-5xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm text-mute md:text-base">{subtitle}</p>}
      </div>
      {right && <div className="flex flex-wrap gap-2">{right}</div>}
    </div>
  );
}

export function Card({ children, className, glow }: { children: ReactNode; className?: string; glow?: 'red' | 'gold' }) {
  return (
    <div className={cx('glass rounded-2xl p-4 md:p-5', glow === 'red' && 'ring-glow-red', glow === 'gold' && 'ring-glow-gold', className)}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, right, icon }: { children: ReactNode; right?: ReactNode; icon?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <h2 className="font-display text-lg font-bold uppercase tracking-wider md:text-xl">
        {icon && <span className="mr-2">{icon}</span>}
        {children}
      </h2>
      {right}
    </div>
  );
}

export function Empty({ children, icon = '🕹️' }: { children: ReactNode; icon?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-mute">
      <div className="text-3xl">{icon}</div>
      {children}
    </div>
  );
}

export function Stat({ label, value, sub, accent = 'text-white' }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string }) {
  return (
    <div className="glass rounded-xl px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-mute">{label}</div>
      <div className={cx('font-display text-2xl font-bold md:text-3xl', accent)}>{value}</div>
      {sub && <div className="text-xs text-mute">{sub}</div>}
    </div>
  );
}

/* ───── Controls ───── */

type BtnVariant = 'red' | 'green' | 'gold' | 'ghost' | 'danger' | 'outline';
const BTN: Record<BtnVariant, string> = {
  red: 'bg-gradient-to-b from-mred-2 to-mred text-white shadow-[0_8px_24px_-8px_rgba(226,59,65,.7)] hover:brightness-110',
  green: 'bg-gradient-to-b from-mgreen-2 to-mgreen text-white shadow-[0_8px_24px_-8px_rgba(24,179,90,.6)] hover:brightness-110',
  gold: 'bg-gradient-to-b from-gold-2 to-gold text-black shadow-[0_8px_24px_-8px_rgba(245,197,66,.7)] hover:brightness-105',
  ghost: 'bg-white/5 text-white hover:bg-white/10 border border-white/10',
  outline: 'border border-white/20 text-white hover:bg-white/5',
  danger: 'bg-red-950/60 text-red-200 border border-red-800/60 hover:bg-red-900/60',
};

export function Button({ variant = 'red', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' && 'px-2.5 py-1.5 text-xs',
        size === 'md' && 'px-4 py-2 text-sm',
        size === 'lg' && 'px-6 py-3 text-base',
        BTN[variant],
        className,
      )}
    />
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-mute">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-mute">{hint}</span>}
    </label>
  );
}

export const inputCls =
  'w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-mred-2 focus:ring-2 focus:ring-mred/30';

export function Badge({ children, tone = 'slate', className }: { children: ReactNode; tone?: 'slate' | 'red' | 'green' | 'gold' | 'yellow' | 'blue' | 'purple'; className?: string }) {
  const t = {
    slate: 'bg-white/8 text-white/80 border-white/10',
    red: 'bg-red-500/15 text-red-300 border-red-500/30',
    green: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    gold: 'bg-amber-400/15 text-amber-200 border-amber-400/40',
    yellow: 'bg-yellow-400/15 text-yellow-200 border-yellow-400/30',
    blue: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    purple: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  }[tone];
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold', t, className)}>{children}</span>;
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[] }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-1">
      {items.map((i) => (
        <button
          key={i.id}
          onClick={() => onChange(i.id)}
          className={cx(
            'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition',
            value === i.id ? 'bg-gradient-to-b from-mred-2 to-mred text-white' : 'text-mute hover:bg-white/5 hover:text-white',
          )}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

/* ───── Modal & confirmation ───── */

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  // Portal to <body>: backdrop-filter on .glass ancestors would otherwise trap position:fixed inside the card
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={cx('glass-strong anim-rise max-h-[92vh] w-full overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="font-display text-xl font-bold uppercase tracking-wide">{title}</h3>
          <button onClick={onClose} className="rounded-md px-2 text-xl text-mute hover:text-white" aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Button that asks for confirmation before running a destructive / important action. */
export function ConfirmButton({ children, title, message, onConfirm, variant = 'danger', size = 'sm', disabled, confirmLabel = 'Confirm' }: {
  children: ReactNode; title: string; message: ReactNode; onConfirm: () => void; variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; disabled?: boolean; confirmLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} disabled={disabled} onClick={() => setOpen(true)}>{children}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <div className="mb-5 text-sm text-white/80">{message}</div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant={variant === 'danger' ? 'red' : variant} onClick={() => { setOpen(false); onConfirm(); }}>{confirmLabel}</Button>
        </div>
      </Modal>
    </>
  );
}

export function Toaster() {
  const toasts = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(92vw,380px)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={cx('anim-rise glass-strong pointer-events-auto rounded-xl border-l-4 px-4 py-3 text-sm', t.kind === 'ok' ? 'border-l-mgreen-2' : 'border-l-mred-2')}>
          <span className="mr-2">{t.kind === 'ok' ? '✅' : '⛔'}</span>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/* ───── Branding ───── */

export function MoroccoFlag({ className = 'h-4 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 20" className={cx('inline-block rounded-[2px]', className)} aria-label="Morocco flag">
      <rect width="30" height="20" fill="#c1272d" />
      <path
        d="M15 5 L17.94 14.05 L10.24 8.45 L19.76 8.45 L12.06 14.05 Z"
        fill="none"
        stroke="#006233"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Crest({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="cg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ffdf7e" />
          <stop offset="1" stopColor="#b8860b" />
        </linearGradient>
        <linearGradient id="cr" x1="0" x2="1">
          <stop offset="0" stopColor="#e23b41" />
          <stop offset="1" stopColor="#8f1418" />
        </linearGradient>
      </defs>
      <path d="M32 3 L58 13 V33 C58 48 46 57 32 61 C18 57 6 48 6 33 V13 Z" fill="url(#cr)" stroke="url(#cg)" strokeWidth="3" />
      <path d="M32 19 L37.29 35.28 L23.44 25.22 L40.56 25.22 L26.71 35.28 Z" fill="none" stroke="#18b35a" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M20 44 L32 38 L44 44" fill="none" stroke="url(#cg)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Squad emblem: uploaded logo or a generated shield with the squad tag. */
export function SquadLogo({ squad, size = 36, className }: { squad?: Squad; size?: number; className?: string }) {
  if (!squad) {
    return (
      <div style={{ width: size, height: size }} className={cx('grid place-items-center rounded-lg border border-dashed border-white/20 text-xs text-mute', className)}>?</div>
    );
  }
  if (squad.logo) {
    return <img src={squad.logo} alt={`${squad.name} logo`} style={{ width: size, height: size }} className={cx('rounded-lg object-cover', className)} />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-label={`${squad.name} emblem`}>
      <defs>
        <linearGradient id={`g-${squad.id}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor={squad.color} />
          <stop offset="1" stopColor="#0b0c10" />
        </linearGradient>
      </defs>
      <path d="M24 2 L44 9 V24 C44 36 35 43 24 46 C13 43 4 36 4 24 V9 Z" fill={`url(#g-${squad.id})`} stroke={squad.color} strokeWidth="2" />
      <text x="24" y="29" textAnchor="middle" fontFamily="Rajdhani, sans-serif" fontWeight="700" fontSize="14" fill="#fff">{squad.tag}</text>
    </svg>
  );
}

export function SquadChip({ squad, fallback = 'TBD', size = 28, link = true, className }: { squad?: Squad; fallback?: string; size?: number; link?: boolean; className?: string }) {
  const inner = (
    <span className={cx('inline-flex min-w-0 items-center gap-2', className)}>
      <SquadLogo squad={squad} size={size} />
      <span className={cx('truncate font-semibold', !squad && 'text-mute italic')}>{squad?.name ?? fallback}</span>
      {squad?.disqualified && <Badge tone="red">DQ</Badge>}
    </span>
  );
  return squad && link ? <Link to={`/squads/${squad.id}`} className="min-w-0 hover:text-gold">{inner}</Link> : inner;
}

/* ───── Time ───── */

export function useNow(interval = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

export function Countdown({ to, label, compact }: { to: string; label?: string; compact?: boolean }) {
  const now = useNow();
  const diff = Math.max(0, new Date(to).getTime() - now);
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff / 3_600_000) % 24);
  const m = Math.floor((diff / 60_000) % 60);
  const s = Math.floor((diff / 1000) % 60);
  const parts: [number, string][] = [[d, 'Days'], [h, 'Hrs'], [m, 'Min'], [s, 'Sec']];
  if (compact) {
    return <span className="font-mono tabular-nums">{diff === 0 ? 'NOW' : `${d}d ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`}</span>;
  }
  return (
    <div>
      {label && <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-mute">{label}</div>}
      <div className="flex gap-2">
        {parts.map(([v, l]) => (
          <div key={l} className="min-w-[58px] rounded-lg border border-white/10 bg-black/50 px-2 py-2 text-center">
            <div className="font-display text-2xl font-bold tabular-nums md:text-3xl">{String(v).padStart(2, '0')}</div>
            <div className="text-[10px] uppercase tracking-widest text-mute">{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───── Match status ───── */

export const STATUS_META: Record<MatchStatus, { label: string; tone: 'slate' | 'red' | 'green' | 'gold' | 'yellow' | 'blue' | 'purple' }> = {
  upcoming: { label: 'Upcoming', tone: 'slate' },
  ready: { label: 'Ready', tone: 'blue' },
  live: { label: 'Live', tone: 'red' },
  review: { label: 'Under Review', tone: 'yellow' },
  completed: { label: 'Completed', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'purple' },
};

export function MatchStatusBadge({ m }: { m: Match }) {
  const meta = STATUS_META[m.status];
  return (
    <Badge tone={meta.tone}>
      {m.status === 'live' && <span className="live-dot h-1.5 w-1.5 rounded-full bg-red-400" />}
      {meta.label}
    </Badge>
  );
}

export function DemoNotice({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
      <span>🧪</span>
      <div>{children}</div>
    </div>
  );
}

export function copyText(text: string) {
  return navigator.clipboard?.writeText(text);
}

export function downloadFile(name: string, content: string, type = 'text/csv') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
