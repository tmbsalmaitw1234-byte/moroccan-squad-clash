import { useState } from 'react';
import { useTournament } from '../store';
import { squadRecord, topKillers } from '../engine/logic';
import { fmtNum } from '../engine/util';
import { Badge, Card, cx, Empty, SquadChip, SquadLogo, Tabs } from '../components/ui';
import { PageHeaderT } from '../content/Text';

export default function Killers() {
  const { state, squad } = useTournament();
  const [tab, setTab] = useState<'killers' | 'squads' | 'wins' | 'dhd'>('killers');
  const killers = topKillers(state);
  const top = killers[0];
  const approved = state.squads.filter((q) => q.status === 'approved');
  const records = approved.map((q) => ({ q, ...squadRecord(state, q.id) }));

  return (
    <div className="space-y-6">
      <PageHeaderT page="killers" />

      {top ? (
        <div className="relative overflow-hidden rounded-3xl border border-gold/60 bg-gradient-to-br from-[#2b2007] via-ink-2 to-ink p-6 ring-glow-gold md:p-8">
          <div className="pointer-events-none absolute inset-0 shimmer opacity-40" />
          <div className="relative flex flex-col items-center gap-6 text-center md:flex-row md:text-left">
            <div className="grid h-28 w-28 place-items-center rounded-full border-4 border-gold bg-black/50 text-6xl anim-pop">🎯</div>
            <div className="flex-1">
              <div className="text-xs font-bold uppercase tracking-[0.3em] text-gold">{state.championId ? 'Top Killer of the Tournament' : 'Current Top Killer'}</div>
              <div className="font-display text-4xl font-bold uppercase text-gradient-gold md:text-6xl">{top.name}</div>
              <div className="mt-1 flex justify-center md:justify-start"><SquadChip squad={squad(top.squadId)} /></div>
            </div>
            <div className="text-center">
              <div className="font-display text-6xl font-bold text-gradient-gold">{top.kills}</div>
              <div className="text-xs uppercase tracking-widest text-mute">verified kills · {top.avg} avg</div>
              <Badge tone="gold" className="mt-2">💎 530 Diamonds</Badge>
            </div>
          </div>
        </div>
      ) : null}

      <Tabs value={tab} onChange={setTab} items={[
        { id: 'killers', label: '🎯 Top killers' },
        { id: 'squads', label: '🛡️ Best squads' },
        { id: 'wins', label: '⚔️ Most victories' },
        { id: 'dhd', label: '💰 Highest DHD earnings' },
      ]} />

      <Card>
        {tab === 'killers' && (killers.length === 0 ? <Empty icon="🎯">No verified kills yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-mute"><th className="py-2">#</th><th>Player</th><th>Squad</th><th className="text-center">Kills</th><th className="text-center">Matches</th><th className="text-center">Avg</th></tr></thead>
              <tbody>
                {killers.slice(0, 40).map((k, i) => (
                  <tr key={k.playerId} className={cx('border-t border-white/5', i === 0 && 'bg-gold/10')}>
                    <td className="py-2 font-display text-lg font-bold">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
                    <td className="font-semibold">{k.name}</td>
                    <td><SquadChip squad={squad(k.squadId)} size={20} /></td>
                    <td className="text-center font-display text-lg font-bold">{k.kills}</td>
                    <td className="text-center">{k.matches}</td>
                    <td className="text-center">{k.avg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {tab !== 'killers' && (
          <div className="space-y-1">
            {[...records]
              .sort((a, b) => tab === 'dhd' ? b.dhd - a.dhd : tab === 'wins' ? b.wins - a.wins || a.losses - b.losses : (b.wins - b.losses) - (a.wins - a.losses) || b.kills - a.kills)
              .map((r, i) => (
                <div key={r.q.id} className="flex items-center gap-3 border-t border-white/5 py-2 text-sm">
                  <span className="w-8 font-display text-lg font-bold text-mute">{i + 1}</span>
                  <SquadLogo squad={r.q} size={28} />
                  <span className="flex-1 truncate font-semibold">{r.q.name}</span>
                  {tab === 'squads' && <span className="text-xs text-mute">{r.wins}W-{r.losses}L · {r.kills} kills</span>}
                  <b className="w-28 text-right font-display text-lg">{tab === 'dhd' ? `${fmtNum(r.dhd)} DHD` : tab === 'wins' ? `${r.wins} wins` : `${r.wins - r.losses >= 0 ? '+' : ''}${r.wins - r.losses}`}</b>
                </div>
              ))}
          </div>
        )}
      </Card>
    </div>
  );
}
