import { Link } from 'react-router-dom';
import { useTournament } from '../store';
import { currentPhase, PHASE_LABEL, topKillers } from '../engine/logic';
import { TOURNAMENT } from '../engine/config';
import { fmtDateTime } from '../engine/util';
import { Badge, Button, Card, Countdown, Crest, Empty, MoroccoFlag, SectionTitle, SquadChip, SquadLogo, Stat } from '../components/ui';
import { MatchCard, StandingsTable } from '../components/match';
import { GROUPS } from '../types';
import { Txt } from '../content/Text';

export default function Home() {
  const { state, squad } = useTournament();
  const phase = currentPhase(state);
  const approved = state.squads.filter((q) => q.status === 'approved');
  const players = approved.reduce((n, q) => n + q.players.length, 0);
  const upcoming = state.matches
    .filter((m) => m.status !== 'completed' && m.status !== 'cancelled')
    .sort((a, b) => (a.status === 'live' ? -1 : b.status === 'live' ? 1 : a.date.localeCompare(b.date)))[0];
  const recent = state.matches.filter((m) => m.status === 'completed').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')).slice(0, 3);
  const live = state.matches.filter((m) => m.status === 'live');
  const champion = squad(state.championId);
  const killer = topKillers(state)[0];
  const regOpen = Date.now() < new Date(TOURNAMENT.registrationOpens).getTime();

  return (
    <div className="space-y-8">
      {/* HERO */}
      <section className="zellige relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#1a0507] via-ink-2 to-[#021a0d] p-6 md:p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-mred/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-mgreen/25 blur-3xl" />
        <div className="pointer-events-none absolute right-6 top-6 hidden opacity-20 md:block">
          <div className="spin-slow"><Crest size={220} /></div>
        </div>
        <div className="relative grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div className="anim-rise">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge tone="red">● {PHASE_LABEL[phase]}</Badge>
              <Badge tone="gold"><Txt k="home.prizeBadge" /></Badge>
            </div>
            <div className="text-sm font-bold uppercase tracking-[0.35em] text-mute"><Txt k="home.kicker" /> <MoroccoFlag className="ml-1 h-3 w-5 align-[-2px]" /></div>
            <h1 className="mt-2 font-display text-5xl font-bold uppercase leading-[0.88] md:text-7xl xl:text-8xl">
              <Txt k="home.title" accent="text-gradient-flag" />
            </h1>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 font-display text-xl font-bold uppercase tracking-wider md:text-2xl">
              <Txt k="home.line1" /><Txt k="home.line2" className="text-mgreen-2" /><Txt k="home.line3" className="text-gold" />
            </div>
            <p className="mt-4 max-w-xl border-l-2 border-mred-2 pl-3 text-base italic text-white/80 md:text-lg">
              <Txt k="home.quote" />
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/register"><Button size="lg"><Txt k="home.ctaRegister" /></Button></Link>
              <Link to="/predict"><Button size="lg" variant="gold"><Txt k="home.ctaPredict" /></Button></Link>
              <Link to="/schedule"><Button size="lg" variant="ghost"><Txt k="home.ctaSchedule" /></Button></Link>
            </div>
          </div>
          <div className="glass anim-rise space-y-5 rounded-2xl p-5" style={{ animationDelay: '.1s' }}>
            {regOpen ? (
              <Countdown to={TOURNAMENT.registrationOpens} label="Registration opens · Nov 22" />
            ) : Date.now() < new Date(TOURNAMENT.registrationCloses).getTime() ? (
              <Countdown to={TOURNAMENT.registrationCloses} label="Registration closes · Nov 24" />
            ) : null}
            <Countdown to={TOURNAMENT.tournamentStart} label="Tournament starts · Nov 25, 18:00" />
            <Countdown to={TOURNAMENT.grandFinal} label="Grand Final · Dec 2" />
          </div>
        </div>
      </section>

      {/* KEY NUMBERS */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Registered squads" value={`${approved.length}/16`} sub={`${state.squads.filter((q) => q.status === 'pending').length} pending approval`} />
        <Stat label="Total players" value={`${players}/80`} sub="64 starters · 16 subs max" />
        <Stat label="Matches played" value={`${state.matches.filter((m) => m.status === 'completed').length}/32`} sub={PHASE_LABEL[phase]} accent="text-mgreen-2" />
        <Stat label="Grand prize" value="500 MAD" sub="+200 DHD per win · 530 💎" accent="text-gold" />
      </section>

      {/* CHAMPION AREA */}
      <Card glow={champion ? 'gold' : undefined} className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 shimmer opacity-30" />
        <div className="relative flex flex-col items-center gap-4 py-4 text-center md:flex-row md:text-left">
          <div className="text-6xl">👑</div>
          <div className="flex-1">
            <div className="text-xs font-bold uppercase tracking-[0.3em] text-gold">Champion announcement</div>
            {champion ? (
              <>
                <div className="font-display text-3xl font-bold uppercase text-gradient-gold md:text-4xl">{champion.name}</div>
                <div className="text-sm text-mute">Champions of Morocco · 500 MAD prize winners</div>
              </>
            ) : (
              <>
                <div className="font-display text-2xl font-bold uppercase md:text-3xl"><Txt k="home.crownTitle" /></div>
                <div className="text-sm text-mute"><Txt k="home.crownText" /></div>
              </>
            )}
          </div>
          {champion ? <SquadLogo squad={champion} size={84} /> : null}
          <Link to="/champions"><Button variant="gold">Ceremony →</Button></Link>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {live.length > 0 && (
            <Card glow="red">
              <SectionTitle icon="🔴" right={<Link to="/live" className="text-xs text-mred-2">Live center →</Link>}>Live now</SectionTitle>
              <div className="grid gap-3 md:grid-cols-2">{live.map((m) => <MatchCard key={m.id} m={m} />)}</div>
            </Card>
          )}
          <Card>
            <SectionTitle icon="⏭️" right={<Link to="/schedule" className="text-xs text-mute hover:text-white">Full schedule →</Link>}>Upcoming match</SectionTitle>
            {upcoming ? (
              <div className="space-y-3">
                <MatchCard m={upcoming} />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-mute">
                  <span>Starts {fmtDateTime(upcoming.date)} (Morocco time)</span>
                  <span>⏱️ <Countdown to={upcoming.date} compact /></span>
                </div>
              </div>
            ) : (
              <Empty>No upcoming matches.</Empty>
            )}
          </Card>
          <Card>
            <SectionTitle icon="📊" right={<Link to="/standings" className="text-xs text-mute hover:text-white">All tables →</Link>}>Group standings</SectionTitle>
            {state.groupsLocked ? (
              <div className="grid gap-5 md:grid-cols-2">
                {GROUPS.map((g) => (
                  <div key={g}>
                    <div className="mb-1 font-display text-sm font-bold uppercase tracking-widest text-mred-2">Group {g}</div>
                    <StandingsTable g={g} dense />
                  </div>
                ))}
              </div>
            ) : (
              <Empty icon="🎲">Groups will appear after the official draw on November 24.</Empty>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <SectionTitle icon="🎯">Top killer race</SectionTitle>
            {killer ? (
              <div className="rounded-xl border border-gold/40 bg-gradient-to-br from-gold/15 to-transparent p-4">
                <div className="text-xs uppercase tracking-widest text-gold">Leader · 530 💎 on the line</div>
                <div className="font-display text-2xl font-bold">{killer.name}</div>
                <SquadChip squad={squad(killer.squadId)} size={22} />
                <div className="mt-2 font-display text-4xl font-bold text-gradient-gold">{killer.kills} kills</div>
              </div>
            ) : (
              <Empty icon="🎯">Kills are tracked from verified match results.</Empty>
            )}
            <Link to="/killers" className="mt-3 block text-xs text-mute hover:text-white">Full leaderboard →</Link>
          </Card>
          <Card>
            <SectionTitle icon="🏁">Recent results</SectionTitle>
            {recent.length ? <div className="space-y-2">{recent.map((m) => <MatchCard key={m.id} m={m} compact />)}</div> : <Empty>No results yet.</Empty>}
          </Card>
          <Card>
            <SectionTitle icon="📢">Announcements</SectionTitle>
            <div className="space-y-3">
              {state.announcements.slice(0, 3).map((a) => (
                <div key={a.id} className="rounded-lg border border-white/5 bg-black/30 p-3">
                  <div className="text-sm font-semibold">{a.title}</div>
                  <div className="mt-1 line-clamp-3 text-xs text-mute">{a.body}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
