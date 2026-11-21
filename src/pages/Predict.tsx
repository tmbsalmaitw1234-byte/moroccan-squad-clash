import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { act, useTournament } from '../store';
import { balanceOf, matchPool, potentialPayout, predictionsOpenFor, predictorStats } from '../engine/logic';
import { fmtDateTime, fmtNum, uid } from '../engine/util';
import { Match } from '../types';
import { Editable, PageHeaderT, rich, useText } from '../content/Text';
import { Badge, Card, ConfirmButton, cx, Empty, SectionTitle, SquadLogo, Stat, Tabs } from '../components/ui';

export function PredictionWidget({ m }: { m: Match }) {
  const { state, me, squad, server } = useTournament();
  const [pick, setPick] = useState<string>();
  const [stake, setStake] = useState(state.settings.minStake * 5);
  // one idempotency key per form instance → a double-click can never create two stakes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const idem = useMemo(() => uid('idem'), [m.id, me.id, state.predictions.length]);
  const pool = matchPool(state, m);
  const gate = predictionsOpenFor(m);
  const mine = state.predictions.find((p) => p.userId === me.id && p.matchId === m.id && p.status !== 'refunded');
  const A = squad(m.a), B = squad(m.b);
  const bal = balanceOf(state, me.id);
  const same = pick === m.a ? pool.a : pool.b;
  const other = pick === m.a ? pool.b : pool.a;
  const payout = pick ? potentialPayout(stake, same, other) : 0;
  const ownMatch = !!me.squadId && (me.squadId === m.a || me.squadId === m.b);

  return (
    <Card className="border-gold/20">
      <SectionTitle icon="🎰" right={<Badge tone={gate.open ? 'green' : 'slate'}>{gate.open ? 'Open' : gate.reason}</Badge>}>DHD prediction</SectionTitle>
      <div className="mb-3 text-[11px] uppercase tracking-widest text-mute">Match #{String(m.number).padStart(2, '0')} · {m.label}</div>
      {!A || !B ? <p className="text-sm text-mute">Predictions open once both squads are known.</p> : (
        <>
          <div className="mb-2 flex h-3 overflow-hidden rounded-full bg-black/50">
            <div className="bg-gradient-to-r from-mred to-mred-2 transition-all" style={{ width: `${pool.pctA}%` }} />
            <div className="bg-gradient-to-r from-mgreen-2 to-mgreen transition-all" style={{ width: `${pool.pctB}%` }} />
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2">
            {[{ q: A, pct: pool.pctA, amt: pool.a, n: pool.countA, tone: 'border-mred-2' }, { q: B, pct: pool.pctB, amt: pool.b, n: pool.countB, tone: 'border-mgreen-2' }].map(({ q, pct, amt, n, tone }) => (
              <button
                key={q.id}
                disabled={!gate.open || !!mine || ownMatch}
                onClick={() => setPick(q.id)}
                className={cx('rounded-xl border bg-black/30 p-3 text-left transition disabled:cursor-default', pick === q.id ? `${tone} bg-white/5` : 'border-white/10 hover:border-white/30', mine?.pick === q.id && 'border-gold')}
              >
                <div className="flex items-center gap-2"><SquadLogo squad={q} size={26} /><span className="truncate text-sm font-semibold">{q.name}</span></div>
                <div className="mt-1 font-display text-2xl font-bold">{pct}%</div>
                <div className="text-[11px] text-mute">{fmtNum(amt)} DHD · {n} predictors</div>
              </button>
            ))}
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-black/30 p-2"><div className="text-mute">Total pool</div><b className="font-display text-lg text-gold">{fmtNum(pool.total)} DHD</b></div>
            <div className="rounded-lg bg-black/30 p-2"><div className="text-mute">Participants</div><b className="font-display text-lg">{pool.participants}</b></div>
          </div>

          {mine ? (
            <div className="rounded-xl border border-gold/40 bg-gold/10 p-3 text-sm">
              🔒 Your prediction: <b>{fmtNum(mine.stake)} DHD</b> on <b>{squad(mine.pick)?.name}</b>
              <div className="mt-1 text-xs">
                {mine.status === 'open' && <>Potential payout now: <b>{fmtNum(potentialPayout(mine.stake, (mine.pick === m.a ? pool.a : pool.b) - mine.stake, mine.pick === m.a ? pool.b : pool.a))} DHD</b> (changes as the pool grows)</>}
                {mine.status === 'won' && <span className="text-emerald-300">✅ Won {fmtNum(mine.payout)} DHD</span>}
                {mine.status === 'lost' && <span className="text-red-300">❌ Lost — stake not returned</span>}
              </div>
            </div>
          ) : ownMatch ? (
            <p className="text-sm text-mute">Players cannot predict on their own squad's matches.</p>
          ) : gate.open ? (
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex justify-between text-xs text-mute"><span>Stake ({state.settings.minStake}–{state.settings.maxStake} DHD)</span><span>Balance {fmtNum(bal)}</span></div>
                <input type="range" min={state.settings.minStake} max={Math.max(state.settings.minStake, Math.min(state.settings.maxStake, bal))} step={state.settings.minStake} value={stake} onChange={(e) => setStake(Number(e.target.value))} className="w-full accent-[#f5c542]" />
                <div className="mt-1 flex gap-1">
                  {[25, 50, 100, 250, 500].filter((v) => v >= state.settings.minStake && v <= state.settings.maxStake).map((v) => (
                    <button key={v} onClick={() => setStake(v)} className={cx('flex-1 rounded-md border px-1 py-1 text-xs', stake === v ? 'border-gold text-gold' : 'border-white/10 text-mute')}>{v}</button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-black/40 px-3 py-2 text-sm">
                <span className="text-mute">Potential payout</span>
                <b className="font-display text-xl text-gold">{pick ? `${fmtNum(payout)} DHD` : '—'}</b>
              </div>
              <ConfirmButton
                variant="gold" size="lg" disabled={!pick || stake > bal}
                title="Lock your prediction?"
                message={<>You stake <b>{stake} DHD</b> on <b>{squad(pick)?.name}</b>. Predictions <b>cannot be changed</b> after confirming. Payout is pari-mutuel: your stake back plus a proportional share of the losing side's pool. Virtual DHD only — no real-money value.</>}
                confirmLabel="Confirm prediction"
                onConfirm={() => act(() => server.placePrediction(m.id, pick!, stake, idem), 'Prediction locked in!')}
              >
                🎯 Confirm prediction
              </ConfirmButton>
            </div>
          ) : (
            <p className="text-sm text-mute">{gate.reason}.</p>
          )}
        </>
      )}
    </Card>
  );
}

export default function Predict() {
  const { state, me, squad, user } = useTournament();
  const text = useText();
  const [tab, setTab] = useState<'open' | 'history' | 'leaders'>('open');
  const openMatches = state.matches.filter((m) => m.a && m.b && (m.status === 'upcoming' || m.status === 'ready')).sort((a, b) => a.date.localeCompare(b.date));
  const mine = state.predictions.filter((p) => p.userId === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const stats = predictorStats(state, me);
  const leaders = state.users.map((u) => ({ u, ...predictorStats(state, u) })).filter((r) => r.count > 0);
  const byNet = [...leaders].sort((a, b) => b.net - a.net).slice(0, 10);
  const byBiggest = [...leaders].sort((a, b) => b.biggest - a.biggest).filter((r) => r.biggest > 0).slice(0, 5);
  const totalStaked = state.predictions.filter((p) => p.status !== 'refunded').reduce((a, p) => a + p.stake, 0);

  return (
    <div className="space-y-6">
      <PageHeaderT page="predict" accent="text-gradient-gold" />

      <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm">
        <div className="mb-2 font-bold text-amber-200">⚠️ System rules</div>
        <Editable k="predict.rules" block className="grid gap-x-6 gap-y-1 text-xs text-white/80 sm:grid-cols-2 lg:grid-cols-3">
          {text.lines('predict.rules', { maxStake: state.settings.maxStake }).map((l, i) => <span key={i}>• {rich(l, 'font-bold text-amber-200')}</span>)}
        </Editable>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Your balance" value={`${fmtNum(balanceOf(state, me.id))}`} sub="DHD (simulated wallet)" accent="text-gold" />
        <Stat label="Total spent" value={fmtNum(stats.spent)} sub="DHD staked" />
        <Stat label="Total won" value={fmtNum(stats.won)} sub="DHD paid out" accent="text-emerald-300" />
        <Stat label="Accuracy" value={stats.settled ? `${Math.round((stats.correct / stats.settled) * 100)}%` : '—'} sub={`${stats.correct}/${stats.settled} correct`} />
        <Stat label="Arena volume" value={fmtNum(totalStaked)} sub="DHD staked by everyone" />
      </div>

      <Tabs value={tab} onChange={setTab} items={[{ id: 'open', label: `🎯 Open matches (${openMatches.length})` }, { id: 'history', label: `📜 My history (${mine.length})` }, { id: 'leaders', label: '🏅 Leaderboards' }]} />

      {tab === 'open' && (openMatches.length === 0 ? <Empty icon="🎰">No upcoming matches with known squads. Predictions open after the group draw.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {openMatches.map((m) => (
            <div key={m.id}>
              <div className="mb-1 flex justify-between text-xs text-mute"><span>{fmtDateTime(m.date)}</span><Link to={`/live/${m.number}`} className="hover:text-white">Match center →</Link></div>
              <PredictionWidget m={m} />
            </div>
          ))}
        </div>
      ))}

      {tab === 'history' && (mine.length === 0 ? <Empty>You haven't made any predictions yet.</Empty> : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-mute"><th className="py-2">Match</th><th>Pick</th><th>Stake</th><th>Status</th><th>Payout</th><th>Placed</th></tr></thead>
              <tbody>
                {mine.map((p) => {
                  const m = state.matches.find((x) => x.id === p.matchId)!;
                  return (
                    <tr key={p.id} className="border-t border-white/5">
                      <td className="py-2"><Link to={`/live/${m.number}`} className="hover:text-mred-2">#{m.number} {m.label}</Link></td>
                      <td>{squad(p.pick)?.name}</td>
                      <td>{fmtNum(p.stake)}</td>
                      <td><Badge tone={p.status === 'won' ? 'green' : p.status === 'lost' ? 'red' : p.status === 'refunded' ? 'purple' : 'yellow'}>{p.status}</Badge></td>
                      <td className={cx(p.status === 'won' && 'text-emerald-300')}>{p.status === 'won' ? `+${fmtNum(p.payout)}` : p.status === 'refunded' ? `↩ ${fmtNum(p.stake)}` : '—'}</td>
                      <td className="text-xs text-mute">{fmtDateTime(p.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      {tab === 'leaders' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <SectionTitle icon="🏅">Winners leaderboard · net DHD</SectionTitle>
            {byNet.length === 0 ? <Empty>No settled predictions yet.</Empty> : byNet.map((r, i) => (
              <div key={r.u.id} className="flex items-center justify-between border-t border-white/5 py-2 text-sm">
                <span><b className="mr-2 font-display text-lg text-mute">{i + 1}</b>{user(r.u.id)?.discord}</span>
                <span className="text-xs text-mute">{r.correct}/{r.settled} correct</span>
                <b className={cx('font-display text-lg', r.net >= 0 ? 'text-emerald-300' : 'text-red-300')}>{r.net >= 0 ? '+' : ''}{fmtNum(r.net)}</b>
              </div>
            ))}
          </Card>
          <Card>
            <SectionTitle icon="💰">Biggest prediction wins</SectionTitle>
            {byBiggest.length === 0 ? <Empty>No wins yet.</Empty> : byBiggest.map((r, i) => (
              <div key={r.u.id} className="flex items-center justify-between border-t border-white/5 py-2 text-sm">
                <span><b className="mr-2 font-display text-lg text-gold">{i + 1}</b>{r.u.discord}</span>
                <b className="font-display text-lg text-gold">+{fmtNum(r.biggest)} DHD</b>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
