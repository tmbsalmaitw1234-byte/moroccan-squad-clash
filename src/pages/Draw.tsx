import { useEffect, useRef, useState } from 'react';
import { act, useTournament } from '../store';
import { can } from '../engine/permissions';
import { GROUPS } from '../types';
import { Badge, Button, Card, ConfirmButton, cx, downloadFile, Empty, SquadLogo } from '../components/ui';
import { PageHeaderT } from '../content/Text';

export default function Draw() {
  const { state, me, server, squad } = useTournament();
  const admin = can(me, 'draw.run');
  const approved = state.squads.filter((q) => q.status === 'approved' && !q.disqualified);
  const [revealed, setRevealed] = useState(16);
  const [rolling, setRolling] = useState<string>();
  const [swap, setSwap] = useState<string>();
  const timer = useRef<number>();

  useEffect(() => () => window.clearInterval(timer.current), []);

  const start = () => {
    const ok = act(() => server.runDraw(), 'Draw generated — revealing…');
    if (!ok) return;
    setRevealed(0);
    let n = 0;
    let ticks = 0;
    window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      ticks++;
      setRolling(approved[Math.floor(Math.random() * approved.length)]?.name);
      if (ticks % 6 === 0) {
        n++;
        setRevealed(n);
        if (n >= 16) { window.clearInterval(timer.current); setRolling(undefined); }
      }
    }, 90);
  };

  const exportCsv = () => {
    const rows = [['Group', 'Slot', 'Squad #', 'Squad', 'Tag', 'Captain']];
    GROUPS.forEach((g) => state.groups[g].forEach((id, i) => {
      const q = squad(id)!;
      rows.push([g, String(i + 1), String(q.number ?? ''), q.name, q.tag, q.captainDiscord]);
    }));
    downloadFile('moroccan-squad-clash-groups.csv', rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n'));
  };

  const animating = revealed < 16;

  return (
    <div className="space-y-6">
      <PageHeaderT
        page="draw"
        right={
          <>
            {state.groupsLocked ? <Badge tone="green">🔒 Groups locked</Badge> : state.drawDone ? <Badge tone="yellow">Provisional — not locked</Badge> : <Badge>Not drawn</Badge>}
            {state.drawDone && <Button variant="ghost" size="sm" onClick={exportCsv}>⬇️ Download table</Button>}
          </>
        }
      />

      {admin && (
        <Card className="flex flex-wrap items-center gap-3">
          <div className="flex-1 text-sm">
            <b>Admin controls</b> · {approved.length}/16 approved squads.
            {swap && <span className="ml-2 text-amber-200">Select a second squad to swap with {squad(swap)?.name}…</span>}
          </div>
          <Button disabled={state.groupsLocked || approved.length !== 16 || animating} onClick={start}>🎲 {state.drawDone ? 'Redraw' : 'Start random draw'}</Button>
          {!state.groupsLocked ? (
            <ConfirmButton variant="green" size="md" disabled={!state.drawDone || animating} title="Lock official groups?" message="Locking confirms the official draw and generates all 24 group-stage fixtures. Groups can only be unlocked again before any match is played." confirmLabel="Lock groups" onConfirm={() => act(() => server.lockGroups(true), 'Groups locked — fixtures generated.')}>🔒 Confirm & lock</ConfirmButton>
          ) : (
            <ConfirmButton size="md" title="Unlock groups?" message="Unlocking clears group fixtures and refunds any open predictions. Only possible before any match starts." confirmLabel="Unlock" onConfirm={() => act(() => server.lockGroups(false), 'Groups unlocked.')}>🔓 Unlock</ConfirmButton>
          )}
        </Card>
      )}

      {!state.drawDone ? (
        <Empty icon="🎲">
          The draw has not happened yet. {approved.length < 16 ? `Waiting for ${16 - approved.length} more approved squad(s).` : 'All 16 squads approved — awaiting the administrator.'}
        </Empty>
      ) : (
        <>
          {animating && (
            <div className="glass-strong rounded-2xl p-6 text-center">
              <div className="text-xs font-bold uppercase tracking-[0.3em] text-mute">Drawing squad {revealed + 1} of 16 → Group {GROUPS[revealed % 4]}</div>
              <div className="flicker mt-2 font-display text-4xl font-bold uppercase text-gradient-flag md:text-6xl">{rolling ?? '…'}</div>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {GROUPS.map((g, gi) => (
              <div key={g} className="glass relative overflow-hidden rounded-2xl p-4">
                <div className="absolute -right-6 -top-8 font-display text-[120px] font-bold leading-none text-white/[0.04]">{g}</div>
                <div className="relative mb-3 flex items-center justify-between">
                  <div className="font-display text-2xl font-bold uppercase">Group <span className="text-mred-2">{g}</span></div>
                  <Badge>{state.groups[g].length} squads</Badge>
                </div>
                <div className="relative space-y-2">
                  {[0, 1, 2, 3].map((i) => {
                    const id = state.groups[g][i];
                    const idx = i * 4 + gi;
                    const show = id && idx < revealed;
                    const q = squad(id);
                    return (
                      <div
                        key={i}
                        onClick={() => {
                          if (!admin || state.groupsLocked || !id || animating) return;
                          if (!swap) setSwap(id);
                          else { if (swap !== id) act(() => server.swapInGroups(swap, id), 'Squads swapped.'); setSwap(undefined); }
                        }}
                        className={cx(
                          'flex min-h-[56px] items-center gap-3 rounded-xl border px-3 py-2 transition',
                          show ? 'anim-pop border-white/10 bg-black/40' : 'border-dashed border-white/10',
                          admin && !state.groupsLocked && show && 'cursor-pointer hover:border-gold/50',
                          swap === id && 'border-gold ring-glow-gold',
                        )}
                      >
                        {show && q ? (
                          <>
                            <SquadLogo squad={q} size={38} />
                            <div className="min-w-0">
                              <div className="truncate font-semibold">{q.name}</div>
                              <div className="text-[11px] text-mute">🧢 {q.captainDiscord}{q.number ? ` · #${q.number}` : ''}</div>
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-mute">Slot {i + 1}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {admin && !state.groupsLocked && !animating && <p className="text-xs text-mute">Tip: click two squads to swap them before locking. Every change is written to the audit log.</p>}
        </>
      )}
    </div>
  );
}
