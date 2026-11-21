import { Link } from 'react-router-dom';
import { useTournament } from '../store';
import { sourceLabel } from '../engine/config';
import { fmtDateTime } from '../engine/util';
import { Match } from '../types';
import { Card, cx, Empty, MatchStatusBadge, SquadLogo } from '../components/ui';
import { PageHeaderT } from '../content/Text';

export default function Bracket() {
  const { state, squad } = useTournament();
  if (!state.matches.some((m) => m.stage === 'final')) {
    return (
      <div className="space-y-6">
        <PageHeaderT page="bracket" />
        <Empty icon="🏆">The bracket appears once the official fixtures are created.</Empty>
      </div>
    );
  }
  const by = (l: string) => state.matches.find((m) => m.label === l)!;
  const cols: { title: string; date: string; ms: Match[] }[] = [
    { title: 'Quarter-finals', date: 'Nov 30', ms: ['QF1', 'QF3', 'QF2', 'QF4'].map(by) },
    { title: 'Semi-finals', date: 'Dec 1', ms: ['SF1', 'SF2'].map(by) },
    { title: 'Grand Final', date: 'Dec 2', ms: [by('GRAND FINAL')] },
  ];
  const champ = squad(state.championId ?? (by('GRAND FINAL').status === 'completed' ? by('GRAND FINAL').winner : undefined));

  return (
    <div className="space-y-6">
      <PageHeaderT page="bracket" />
      <Card className="overflow-x-auto">
        <div className="grid min-w-[880px] grid-cols-[1fr_1fr_1fr_220px] gap-6">
          {cols.map((c, ci) => (
            <div key={c.title} className="flex flex-col">
              <div className="mb-4 text-center">
                <div className={cx('font-display text-lg font-bold uppercase tracking-wider', ci === 2 && 'text-gradient-gold')}>{c.title}</div>
                <div className="text-[11px] text-mute">{c.date}</div>
              </div>
              <div className="flex flex-1 flex-col justify-around gap-6">
                {c.ms.map((m) => <BracketMatch key={m.id} m={m} final={ci === 2} />)}
              </div>
            </div>
          ))}
          <div className="flex flex-col">
            <div className="mb-4 text-center font-display text-lg font-bold uppercase tracking-wider text-gold">Champion</div>
            <div className="flex flex-1 items-center">
              <div className={cx('w-full rounded-2xl border p-5 text-center', champ ? 'anim-pop border-gold ring-glow-gold bg-gold/10' : 'border-dashed border-gold/30')}>
                <div className="text-5xl">👑</div>
                {champ ? (
                  <>
                    <SquadLogo squad={champ} size={72} className="mx-auto mt-2" />
                    <div className="mt-2 font-display text-2xl font-bold uppercase text-gradient-gold">{champ.name}</div>
                    <div className="text-xs text-mute">500 MAD</div>
                    <Link to="/champions" className="mt-2 inline-block text-xs text-gold underline">Ceremony →</Link>
                  </>
                ) : <div className="mt-2 text-sm text-mute">To be crowned<br />Dec 2, 2026</div>}
              </div>
            </div>
          </div>
        </div>
      </Card>
      <p className="text-xs text-mute">QF1: A1 vs B2 · QF2: B1 vs A2 · QF3: C1 vs D2 · QF4: D1 vs C2 · SF1: W-QF1 vs W-QF3 · SF2: W-QF2 vs W-QF4 · Final: W-SF1 vs W-SF2</p>
    </div>
  );
}

function BracketMatch({ m, final }: { m: Match; final?: boolean }) {
  const { squad } = useTournament();
  const rows = [{ id: m.a, src: m.srcA }, { id: m.b, src: m.srcB }];
  return (
    <Link to={`/live/${m.number}`} className={cx('relative block rounded-xl border bg-black/40 p-2 transition hover:border-white/30', final ? 'border-gold/50' : 'border-white/10', m.status === 'live' && 'ring-glow-red')}>
      <div className="mb-1 flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-wider text-mute">
        <span>{m.label} · #{m.number}</span>
        <MatchStatusBadge m={m} />
      </div>
      {rows.map((r, i) => {
        const q = squad(r.id);
        const won = m.winner && m.winner === r.id;
        const lost = m.winner && r.id && m.winner !== r.id;
        return (
          <div key={i} className={cx('flex items-center gap-2 rounded-lg px-2 py-1.5 transition', won && 'anim-pop bg-gold/15', lost && 'opacity-40 line-through')}>
            <SquadLogo squad={q} size={24} />
            <span className={cx('flex-1 truncate text-sm', !q && 'italic text-mute', won && 'font-bold text-gold')}>{q?.name ?? sourceLabel(r.src)}</span>
            {won && <span className="text-xs">✔</span>}
          </div>
        );
      })}
      <div className="px-2 pt-1 text-[10px] text-mute">{fmtDateTime(m.date)}</div>
    </Link>
  );
}
