import { Link } from 'react-router-dom';
import { GroupId, Match } from '../types';
import { useTournament } from '../store';
import { computeGroup, RowStatus } from '../engine/logic';
import { sourceLabel, STAGE_LABEL } from '../engine/config';
import { fmtDateTime } from '../engine/util';
import { Badge, cx, MatchStatusBadge, SquadChip, SquadLogo } from './ui';

export function MatchCard({ m, compact }: { m: Match; compact?: boolean }) {
  const { squad, state } = useTournament();
  const A = squad(m.a), B = squad(m.b);
  const featured = state.settings.matchOfDay === m.id;
  return (
    <Link
      to={`/live/${m.number}`}
      className={cx(
        'group block rounded-xl border bg-black/30 p-3 transition hover:-translate-y-0.5 hover:border-mred-2/60 hover:bg-black/50',
        m.status === 'live' ? 'border-mred-2/70 ring-glow-red' : featured ? 'border-gold/50' : 'border-white/10',
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-mute">
        <span className="font-bold uppercase tracking-wider">
          #{String(m.number).padStart(2, '0')} · {m.stage === 'group' ? m.label : m.label}
        </span>
        <span className="flex items-center gap-1">
          {featured && <Badge tone="gold">🎲 Match of the Day</Badge>}
          <MatchStatusBadge m={m} />
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Side name={A?.name ?? sourceLabel(m.srcA)} squadId={m.a} winner={m.winner} />
        <div className="font-display text-sm font-bold text-mute">VS</div>
        <Side name={B?.name ?? sourceLabel(m.srcB)} squadId={m.b} winner={m.winner} right />
      </div>
      {!compact && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-mute">
          <span>🗓️ {fmtDateTime(m.date)}</span>
          <span>🗺️ {m.map}</span>
        </div>
      )}
    </Link>
  );
}

function Side({ name, squadId, winner, right }: { name: string; squadId?: string; winner?: string; right?: boolean }) {
  const { squad } = useTournament();
  const q = squad(squadId);
  const won = winner && winner === squadId;
  const lost = winner && squadId && winner !== squadId;
  return (
    <div className={cx('flex min-w-0 items-center gap-2', right && 'flex-row-reverse text-right', lost && 'opacity-45')}>
      <SquadLogo squad={q} size={30} />
      <div className="min-w-0">
        <div className={cx('truncate text-sm font-semibold', !q && 'italic text-mute', won && 'text-gold')}>{name}</div>
        {won && <div className="text-[10px] font-bold uppercase tracking-wider text-gold">Winner</div>}
      </div>
    </div>
  );
}

export const ROW_STATUS: Record<RowStatus, { icon: string; label: string; tone: 'green' | 'yellow' | 'red' | 'gold' | 'purple' }> = {
  qualified: { icon: '🟢', label: 'Qualified', tone: 'green' },
  competing: { icon: '🟡', label: 'Still Competing', tone: 'yellow' },
  eliminated: { icon: '🔴', label: 'Eliminated', tone: 'red' },
  knockout: { icon: '🏆', label: 'Qualified for Knockouts', tone: 'gold' },
  tiebreak: { icon: '⚖️', label: 'Deciding Match', tone: 'purple' },
};

export function StandingsTable({ g, dense }: { g: GroupId; dense?: boolean }) {
  const { state, squad } = useTournament();
  const t = computeGroup(state, g);
  if (!state.groupsLocked) {
    return <div className="py-6 text-center text-sm text-mute">Awaiting official group draw</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-mute">
            <th className="py-2 pr-2">#</th>
            <th className="py-2">Squad</th>
            <th className="py-2 text-center">MP</th>
            <th className="py-2 text-center">W</th>
            <th className="py-2 text-center">L</th>
            <th className="py-2 text-center">PTS</th>
            {!dense && <th className="py-2 pl-2">Status</th>}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r, i) => {
            const st = ROW_STATUS[r.status];
            return (
              <tr key={r.squadId} className={cx('border-t border-white/5', i < 2 && 'bg-mgreen/5')}>
                <td className="py-2 pr-2">
                  <span className={cx('font-display text-lg font-bold', i < 2 ? 'text-mgreen-2' : 'text-mute')}>{i + 1}</span>
                </td>
                <td className="py-2"><SquadChip squad={squad(r.squadId)} size={26} /></td>
                <td className="py-2 text-center tabular-nums">{r.played}</td>
                <td className="py-2 text-center tabular-nums text-emerald-300">{r.wins}</td>
                <td className="py-2 text-center tabular-nums text-red-300">{r.losses}</td>
                <td className="py-2 text-center font-display text-lg font-bold tabular-nums">{r.points}</td>
                {!dense && (
                  <td className="py-2 pl-2">
                    <Badge tone={st.tone}>{st.icon} {r.dq ? 'Disqualified' : st.label}</Badge>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {t.complete && !t.cutResolved && (
        <div className="mt-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs text-purple-200">
          ⚖️ Tie at the qualification line not settled by points or head-to-head — an additional deciding match is required.
        </div>
      )}
    </div>
  );
}

export function stageName(m: Match) {
  return STAGE_LABEL[m.stage];
}
