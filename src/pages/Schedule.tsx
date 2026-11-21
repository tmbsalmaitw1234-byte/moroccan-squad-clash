import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTournament } from '../store';
import { CALENDAR, sourceLabel, STAGE_LABEL } from '../engine/config';
import { canSeeRoom } from '../engine/permissions';
import { fmtTime } from '../engine/util';
import { Badge, Card, cx, MatchStatusBadge, SquadChip } from '../components/ui';
import { PageHeaderT } from '../content/Text';

export default function Schedule() {
  const { state, squad, user, me } = useTournament();
  const [day, setDay] = useState<number | 'all'>('all');
  const days = day === 'all' ? CALENDAR : CALENDAR.filter((d) => d.day === day);

  return (
    <div className="space-y-6">
      <PageHeaderT page="schedule" />
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setDay('all')} className={cx('rounded-xl border px-4 py-2 text-sm font-semibold', day === 'all' ? 'border-mred-2 bg-mred/20' : 'border-white/10 bg-black/30 text-mute')}>All days</button>
        {CALENDAR.map((d) => (
          <button key={d.day} onClick={() => setDay(d.day)} className={cx('min-w-[96px] rounded-xl border px-3 py-2 text-left', day === d.day ? 'border-mred-2 bg-mred/20' : 'border-white/10 bg-black/30')}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-mute">Day {d.day}</div>
            <div className="text-sm font-semibold">{new Date(d.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
          </button>
        ))}
      </div>

      {days.map((d) => {
        const ms = state.matches.filter((m) => m.day === d.day).sort((a, b) => a.date.localeCompare(b.date));
        return (
          <Card key={d.day} glow={d.stage === 'final' ? 'gold' : undefined}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-mute">Day {d.day} · {new Date(d.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                <h2 className={cx('font-display text-2xl font-bold uppercase', d.stage === 'final' && 'text-gradient-gold')}>{d.title}</h2>
              </div>
              <Badge>{ms.length} {ms.length === 1 ? 'match' : 'matches'}</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-mute">
                    <th className="py-2">#</th><th>Time</th><th>Stage</th><th>Squads</th><th>Map</th><th>Room</th><th>Commentator</th><th>Supervisor</th><th>Status</th><th>Winner</th>
                  </tr>
                </thead>
                <tbody>
                  {ms.map((m) => {
                    const room = canSeeRoom(me, m);
                    return (
                      <tr key={m.id} className="border-t border-white/5 align-middle hover:bg-white/[0.02]">
                        <td className="py-2.5"><Link to={`/live/${m.number}`} className="font-display text-lg font-bold hover:text-mred-2">{String(m.number).padStart(2, '0')}</Link></td>
                        <td className="font-mono">{fmtTime(m.date)}</td>
                        <td><div className="text-xs">{STAGE_LABEL[m.stage]}</div><div className="text-[11px] text-mute">{m.label}</div></td>
                        <td>
                          <div className="flex flex-col gap-1">
                            <SquadChip squad={squad(m.a)} fallback={sourceLabel(m.srcA)} size={20} />
                            <SquadChip squad={squad(m.b)} fallback={sourceLabel(m.srcB)} size={20} />
                          </div>
                        </td>
                        <td>{m.map}</td>
                        <td className="text-xs">
                          {!m.roomId ? <span className="text-mute">Not created</span> : room ? (
                            <span className="font-mono">ID {m.roomId}<br />PW {m.roomPass}</span>
                          ) : <span className="text-mute">🔒 Private</span>}
                        </td>
                        <td className="text-xs">{user(m.commentatorId)?.name ?? '—'}</td>
                        <td className="text-xs">{user(m.supervisorId)?.name ?? '—'}</td>
                        <td><MatchStatusBadge m={m} /></td>
                        <td>{m.winner ? <SquadChip squad={squad(m.winner)} size={20} /> : <span className="text-mute">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
