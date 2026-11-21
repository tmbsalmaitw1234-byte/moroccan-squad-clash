import { Link } from 'react-router-dom';
import { CALENDAR } from '../engine/config';
import { Badge, Button, Card, SectionTitle, Stat } from '../components/ui';
import { Editable, PageHeaderT, rich, Txt, useText } from '../content/Text';

const FORMAT_TONES = ['red', 'green', 'yellow', 'gold', 'purple'] as const;

export default function Overview() {
  const text = useText();
  return (
    <div className="space-y-6">
      <PageHeaderT page="overview" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Game" value="Free Fire" />
        <Stat label="Format" value="3 VS 3" sub="Squad League + KO" />
        <Stat label="Squads" value="16" sub="4 players each" />
        <Stat label="Matches" value="32" sub="24 group · 8 knockout" accent="text-mgreen-2" />
        <Stat label="Days" value="8" sub="Nov 25 – Dec 2" accent="text-gold" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle icon="📝">Registration — 3 days</SectionTitle>
          <table className="w-full text-sm">
            <tbody>
              {[
                ['November 22', 'Registration opens'],
                ['November 23', 'Registration continues'],
                ['November 24', 'Registration closes + Group Draw'],
              ].map(([d, a]) => (
                <tr key={d} className="border-t border-white/5"><td className="py-2 font-semibold">{d}</td><td className="py-2 text-mute">{a}</td></tr>
              ))}
            </tbody>
          </table>
          <Editable k="overview.registrationItems" block className="mt-4">
            <ul className="grid grid-cols-2 gap-2 text-sm">
              {text.lines('overview.registrationItems').map((l, i) => <li key={i} className="rounded-lg bg-black/30 p-2">{rich(l)}</li>)}
            </ul>
          </Editable>
          <Link to="/register" className="mt-4 block"><Button className="w-full">Register now</Button></Link>
        </Card>

        <Card>
          <SectionTitle icon="⚔️">Format & points</SectionTitle>
          <Editable k="overview.format" block>
            <ol className="space-y-3 text-sm">
              {text.lines('overview.format').map((l, i) => {
                const [label, body] = l.includes('::') ? l.split('::').map((x) => x.trim()) : ['', l];
                return (
                  <li key={i}>
                    {label && <Badge tone={FORMAT_TONES[i % FORMAT_TONES.length]}>{label}</Badge>} {rich(body, 'font-bold text-white')}
                  </li>
                );
              })}
            </ol>
          </Editable>
        </Card>
      </div>

      <Card>
        <SectionTitle icon="🗓️">Competition calendar</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CALENDAR.map((d) => (
            <div key={d.day} className={`rounded-xl border p-4 ${d.stage === 'final' ? 'border-gold/50 bg-gold/10' : 'border-white/10 bg-black/30'}`}>
              <div className="text-xs font-bold uppercase tracking-widest text-mute">Day {d.day} · {new Date(d.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
              <div className={`font-display text-lg font-bold uppercase ${d.stage === 'final' ? 'text-gold' : ''}`}>{d.title}</div>
              <div className="text-sm text-mute">{d.count} {d.count === 1 ? 'match' : 'matches'}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle icon="🏆">Knockout bracket</SectionTitle>
          <div className="space-y-2 text-sm">
            {[
              ['QF1', 'Group A 1st vs Group B 2nd'], ['QF2', 'Group B 1st vs Group A 2nd'],
              ['QF3', 'Group C 1st vs Group D 2nd'], ['QF4', 'Group D 1st vs Group C 2nd'],
              ['SF1', 'Winner QF1 vs Winner QF3'], ['SF2', 'Winner QF2 vs Winner QF4'],
              ['FINAL', 'Winner SF1 vs Winner SF2'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center gap-3 rounded-lg bg-black/30 px-3 py-2">
                <span className="w-14 font-display font-bold text-mred-2">{k}</span><span>{v}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle icon="💰">Prizes</SectionTitle>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-gold/40 bg-gold/10 p-4"><span>🏆 <Txt k="prizes.championTitle" /></span><b className="font-display text-2xl text-gold"><Txt k="prizes.championValue" /></b></div>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 p-4"><span>⚔️ <Txt k="prizes.victoryTitle" /></span><b className="font-display text-2xl"><Txt k="prizes.victoryValue" /></b></div>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 p-4"><span>🎯 <Txt k="prizes.killerTitle" /></span><b className="font-display text-2xl text-sky-300"><Txt k="prizes.killerValue" /></b></div>
          </div>
          <Link to="/prizes" className="mt-4 block text-sm text-mute hover:text-white">Reward dashboard →</Link>
        </Card>
      </div>
    </div>
  );
}
