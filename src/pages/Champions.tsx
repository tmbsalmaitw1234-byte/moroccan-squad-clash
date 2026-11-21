import { Link } from 'react-router-dom';
import { useTournament } from '../store';
import { squadRecord, topKillers } from '../engine/logic';
import { Button, Crest, Empty, SquadChip, SquadLogo } from '../components/ui';
import { Txt } from '../content/Text';

export default function Champions() {
  const { state, squad } = useTournament();
  const champ = squad(state.championId);
  const final = state.matches.find((m) => m.stage === 'final');
  const runnerUp = squad(final?.winner === final?.a ? final?.b : final?.a);
  const killer = topKillers(state)[0];
  if (!champ) {
    return (
      <div className="py-10">
        <Empty icon="👑">The Champion Ceremony unlocks once the Grand Final is verified and the administrator declares the champion (December 2, 2026). <Link to="/bracket" className="underline">View bracket →</Link></Empty>
      </div>
    );
  }
  const rec = squadRecord(state, champ.id);
  return (
    <div className="relative overflow-hidden rounded-3xl border border-gold/50 bg-gradient-to-b from-[#2a1d05] via-ink to-ink px-4 py-12 text-center ring-glow-gold md:px-10 md:py-16">
      <div className="pointer-events-none absolute inset-0 shimmer opacity-30" />
      <div className="pointer-events-none absolute left-1/2 top-10 -translate-x-1/2 opacity-15"><div className="spin-slow"><Crest size={420} /></div></div>
      <div className="relative">
        <div className="anim-rise text-sm font-bold uppercase tracking-[0.4em] text-gold"><Txt k="champions.kicker" /></div>
        <h1 className="anim-rise mt-2 font-display text-4xl font-bold uppercase md:text-6xl"><Txt k="champions.title" accent="text-gradient-gold" /></h1>
        <div className="anim-pop mx-auto mt-8 w-fit"><SquadLogo squad={champ} size={160} className="drop-shadow-[0_0_40px_rgba(245,197,66,.6)]" /></div>
        <div className="mt-4 font-display text-5xl font-bold uppercase text-gradient-gold md:text-7xl">{champ.name}</div>
        <div className="mt-2 text-mute">{rec.wins} wins · {rec.kills} kills · {rec.dhd} DHD earned</div>
        <div className="mx-auto mt-6 flex max-w-xl flex-wrap justify-center gap-2">
          {champ.players.map((p) => <span key={p.id} className="rounded-full border border-gold/40 bg-black/40 px-3 py-1 text-sm">{p.isCaptain && '🧢 '}{p.ign}</span>)}
        </div>

        <div className="mx-auto mt-10 grid max-w-4xl gap-4 md:grid-cols-3">
          <div className="glass rounded-2xl p-5"><div className="text-3xl">💰</div><div className="mt-1 text-xs uppercase tracking-widest text-mute">500 MAD prize winners</div><div className="font-display text-xl font-bold">{champ.name}</div></div>
          <div className="glass rounded-2xl p-5"><div className="text-3xl">🎯</div><div className="mt-1 text-xs uppercase tracking-widest text-mute">530 Diamonds top killer</div><div className="font-display text-xl font-bold">{killer?.name ?? '—'}</div>{killer && <div className="text-xs text-mute">{killer.kills} kills</div>}</div>
          <div className="glass rounded-2xl p-5"><div className="text-3xl">🥈</div><div className="mt-1 text-xs uppercase tracking-widest text-mute">Runner-up</div><div className="flex justify-center"><SquadChip squad={runnerUp} /></div></div>
        </div>

        <p className="mt-10 font-display text-2xl font-bold uppercase tracking-wider text-white/90 md:text-3xl"><Txt k="champions.quote" accent="text-gold" /></p>
        <Link to="/" className="mt-6 inline-block"><Button variant="gold">Back to HQ</Button></Link>
      </div>
    </div>
  );
}
