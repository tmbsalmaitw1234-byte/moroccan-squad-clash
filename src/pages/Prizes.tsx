import { ReactNode } from 'react';
import { useTournament } from '../store';
import { PageHeaderT, Txt } from '../content/Text';
import { squadRecord, topKillers } from '../engine/logic';
import { fmtNum } from '../engine/util';
import { Badge, Card, Empty, SectionTitle, SquadChip } from '../components/ui';

export default function Prizes() {
  const { state, squad } = useTournament();
  const approved = state.squads.filter((q) => q.status === 'approved');
  const rows = approved.map((q) => {
    const r = state.rewards.filter((x) => x.squadId === q.id);
    return { q, wins: squadRecord(state, q.id).wins, total: r.reduce((a, x) => a + x.amount, 0), paid: r.filter((x) => x.status === 'paid').length, pending: r.filter((x) => x.status === 'pending').length };
  }).sort((a, b) => b.total - a.total);
  const champ = squad(state.championId);
  const killer = topKillers(state)[0];

  return (
    <div className="space-y-6">
      <PageHeaderT page="prizes" />
      <div className="grid gap-4 md:grid-cols-3">
        <PrizeCard icon="🏆" title={<Txt k="prizes.championTitle" />} value={<Txt k="prizes.championValue" />} sub={<Txt k="prizes.championSub" />} winner={champ?.name} status={state.prizeStatus.champion} gold />
        <PrizeCard icon="⚔️" title={<Txt k="prizes.victoryTitle" />} value={<Txt k="prizes.victoryValue" />} sub={<Txt k="prizes.victorySub" />} />
        <PrizeCard icon="🎯" title={<Txt k="prizes.killerTitle" />} value={<Txt k="prizes.killerValue" />} sub={<Txt k="prizes.killerSub" />} winner={state.championId ? killer?.name : killer ? `Leader: ${killer.name}` : undefined} status={state.prizeStatus.topKiller} />
      </div>

      <Card>
        <SectionTitle icon="💰">Reward dashboard</SectionTitle>
        {rows.length === 0 ? <Empty>No squads yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-mute"><th className="py-2">Squad</th><th className="text-center">Victories</th><th className="text-center">Total DHD earned</th><th>Prize status</th><th>Payment status</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.q.id} className="border-t border-white/5">
                    <td className="py-2"><SquadChip squad={r.q} size={24} /></td>
                    <td className="text-center">{r.wins}</td>
                    <td className="text-center font-display text-lg font-bold text-gold">{fmtNum(r.total)}</td>
                    <td>{state.championId === r.q.id ? <Badge tone="gold">👑 Champion · 500 MAD</Badge> : r.wins ? <Badge tone="green">Victory bonus × {r.wins}</Badge> : <Badge>—</Badge>}</td>
                    <td>{r.total === 0 ? <span className="text-mute">—</span> : r.pending ? <Badge tone="yellow">⏳ {r.pending} pending</Badge> : <Badge tone="green">✅ Paid</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] text-mute">DHD victory bonuses are recorded here; actual crediting to Discord balances requires the Discord economy bot integration (not connected in demo mode).</p>
      </Card>
    </div>
  );
}

function PrizeCard({ icon, title, value, sub, winner, status, gold }: { icon: string; title: ReactNode; value: ReactNode; sub: ReactNode; winner?: string; status?: 'pending' | 'paid'; gold?: boolean }) {
  return (
    <Card glow={gold ? 'gold' : undefined} className="relative overflow-hidden text-center">
      {gold && <div className="pointer-events-none absolute inset-0 shimmer opacity-30" />}
      <div className="relative">
        <div className="text-5xl">{icon}</div>
        <div className="mt-2 text-xs font-bold uppercase tracking-[0.25em] text-mute">{title}</div>
        <div className={`font-display text-5xl font-bold ${gold ? 'text-gradient-gold' : ''}`}>{value}</div>
        <div className="mt-1 text-xs text-mute">{sub}</div>
        {winner && <div className="mt-3 text-sm">🏅 <b>{winner}</b></div>}
        {status && <div className="mt-2"><Badge tone={status === 'paid' ? 'green' : 'yellow'}>{status === 'paid' ? '✅ Paid' : '⏳ Pending'}</Badge></div>}
      </div>
    </Card>
  );
}
