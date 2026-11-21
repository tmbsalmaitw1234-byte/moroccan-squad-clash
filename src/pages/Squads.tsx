import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTournament } from '../store';
import { squadEliminated, squadRecord } from '../engine/logic';
import { isStaff } from '../engine/permissions';
import { GROUPS } from '../types';
import { Badge, Card, cx, Empty, inputCls, SectionTitle, SquadLogo, Stat, Tabs } from '../components/ui';
import { PageHeaderT } from '../content/Text';
import { MatchCard } from '../components/match';

export default function Squads() {
  const { state } = useTournament();
  const [tab, setTab] = useState<'approved' | 'pending' | 'rejected'>('approved');
  const [q, setQ] = useState('');
  const list = state.squads
    .filter((s) => s.status === tab)
    .filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.players.some((p) => p.ign.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (a.number ?? 99) - (b.number ?? 99));

  return (
    <div>
      <PageHeaderT page="squads" right={<input className={cx(inputCls, 'w-56')} placeholder="Search squad or player…" value={q} onChange={(e) => setQ(e.target.value)} />} />
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'approved', label: `✅ Approved (${state.squads.filter((s) => s.status === 'approved').length})` },
        { id: 'pending', label: `⏳ Pending (${state.squads.filter((s) => s.status === 'pending').length})` },
        { id: 'rejected', label: `❌ Rejected (${state.squads.filter((s) => s.status === 'rejected').length})` },
      ]} />
      {list.length === 0 ? <Empty>No squads here.</Empty> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {list.map((s, i) => {
            const rec = squadRecord(state, s.id);
            const g = GROUPS.find((x) => state.groups[x].includes(s.id));
            const out = squadEliminated(state, s.id);
            return (
              <Link key={s.id} to={`/squads/${s.id}`} className="anim-rise" style={{ animationDelay: `${i * 30}ms` }}>
                <div className={cx('glass group relative h-full overflow-hidden rounded-2xl p-4 transition hover:-translate-y-1 hover:border-white/25', out && 'opacity-60')}>
                  <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-25 blur-2xl" style={{ background: s.color }} />
                  <div className="relative flex items-center gap-3">
                    <SquadLogo squad={s} size={56} />
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase tracking-widest text-mute">{s.number ? `Squad #${s.number}` : 'Unnumbered'}{g && ` · Group ${g}`}</div>
                      <div className="truncate font-display text-xl font-bold uppercase">{s.name}</div>
                      <div className="text-xs text-mute">🧢 {s.captainDiscord}</div>
                    </div>
                  </div>
                  <div className="relative mt-4 flex items-center justify-between text-xs">
                    <span className="text-mute">{rec.wins}W · {rec.losses}L · {rec.kills} kills</span>
                    {s.disqualified ? <Badge tone="red">Disqualified</Badge> : out ? <Badge tone="red">Eliminated</Badge> : state.championId === s.id ? <Badge tone="gold">👑 Champion</Badge> : <Badge tone="green">Active</Badge>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SquadProfile() {
  const { id } = useParams();
  const { state, squad, me } = useTournament();
  const s = squad(id);
  if (!s) return <Empty>Squad not found. <Link to="/squads" className="underline">Back to squads</Link></Empty>;
  const rec = squadRecord(state, s.id);
  const g = GROUPS.find((x) => state.groups[x].includes(s.id));
  const ms = state.matches.filter((m) => m.a === s.id || m.b === s.id).sort((a, b) => a.date.localeCompare(b.date));
  const pens = state.penalties.filter((p) => p.squadId === s.id);
  const staff = isStaff(me) || me.squadId === s.id;
  const mask = (uid: string) => (staff ? uid : `${uid.slice(0, 3)}••••${uid.slice(-2)}`);

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 p-6 md:p-10" style={{ background: `linear-gradient(135deg, ${s.color}33, #06070a 60%)` }}>
        <div className="flex flex-col items-start gap-5 md:flex-row md:items-center">
          <SquadLogo squad={s} size={110} className="anim-pop" />
          <div className="flex-1">
            <div className="text-xs font-bold uppercase tracking-[0.3em] text-mute">{s.number ? `Squad #${s.number}` : 'Squad'}{g && ` · Group ${g}`}</div>
            <h1 className="font-display text-4xl font-bold uppercase md:text-6xl">{s.name}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone={s.status === 'approved' ? 'green' : s.status === 'pending' ? 'yellow' : 'red'}>{s.status === 'approved' ? '✅ Approved' : s.status === 'pending' ? '⏳ Pending approval' : '❌ Rejected'}</Badge>
              {state.championId === s.id && <Badge tone="gold">👑 Champions of Morocco</Badge>}
              {s.disqualified && <Badge tone="red">Disqualified</Badge>}
              <Badge>🧢 {s.captainDiscord}</Badge>
            </div>
            {s.rejectReason && <p className="mt-2 text-sm text-red-300">Reason: {s.rejectReason}</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Played" value={rec.played} />
        <Stat label="Wins" value={rec.wins} accent="text-emerald-300" />
        <Stat label="Losses" value={rec.losses} accent="text-red-300" />
        <Stat label="Total kills" value={rec.kills} />
        <Stat label="DHD earned" value={rec.dhd} accent="text-gold" sub="200 per win" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <SectionTitle icon="👥">Roster</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-mute"><th className="py-2">Player</th><th>Role</th><th>Slot</th><th>FF UID</th><th>Discord</th></tr></thead>
              <tbody>
                {s.players.map((p) => (
                  <tr key={p.id} className="border-t border-white/5">
                    <td className="py-2"><b>{p.ign}</b> {p.isCaptain && <span title="Captain">🧢</span>}<div className="text-xs text-mute">{p.ffUsername}</div></td>
                    <td><Badge tone={p.role === 'Sniper' ? 'blue' : 'slate'}>{p.role}</Badge></td>
                    <td>{p.slot === 'starter' ? 'Starter' : <span className="text-mute">Substitute</span>}</td>
                    <td className="font-mono text-xs">{mask(p.uid)}</td>
                    <td className="text-xs text-mute">{p.discord}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!staff && <p className="mt-2 text-[11px] text-mute">UIDs are partially hidden for privacy — visible to staff and squad members.</p>}
        </Card>
        <Card>
          <SectionTitle icon="⚖️">Discipline</SectionTitle>
          {pens.length === 0 ? <Empty icon="🕊️">Clean record.</Empty> : pens.map((p) => (
            <div key={p.id} className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">
              <b className="uppercase">{p.type.replace('_', ' ')}</b> — {p.reason}
            </div>
          ))}
        </Card>
      </div>

      <Card>
        <SectionTitle icon="🗓️">Matches</SectionTitle>
        {ms.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{ms.map((m) => <MatchCard key={m.id} m={m} />)}</div> : <Empty>Fixtures appear after the group draw.</Empty>}
      </Card>
    </div>
  );
}
