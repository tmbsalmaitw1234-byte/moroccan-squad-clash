import { useState } from 'react';
import { Link } from 'react-router-dom';
import { act, useTournament } from '../store';
import { Player, PlayerRole } from '../types';
import { Editable, PageHeaderT, rich, Txt, useText } from '../content/Text';
import { Badge, Button, Card, DemoNotice, Field, inputCls, SectionTitle, SquadLogo } from '../components/ui';

type Draft = Omit<Player, 'id'>;
const ROLES: PlayerRole[] = ['IGL', 'Rusher', 'Sniper', 'Support', 'Flex'];
const blank = (i: number): Draft => ({ discord: '', ffUsername: '', uid: '', ign: '', role: ROLES[i] ?? 'Flex', slot: i === 3 ? 'sub' : 'starter', isCaptain: i === 0 });

export default function Register() {
  const { state, me, server } = useTournament();
  const text = useText();
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [logo, setLogo] = useState<string>();
  const [captainDiscord, setCaptainDiscord] = useState('');
  const [players, setPlayers] = useState<Draft[]>([0, 1, 2, 3].map(blank));
  const [rules, setRules] = useState(false);
  const [submittedId, setSubmittedId] = useState<string>();

  const approved = state.squads.filter((q) => q.status === 'approved').length;
  const mine = state.squads.filter((q) => q.ownerUserId === me.id);
  const full = approved >= 16;

  const upd = (i: number, patch: Partial<Draft>) =>
    setPlayers((ps) => ps.map((p, j) => {
      if (patch.isCaptain) return j === i ? { ...p, ...patch } : { ...p, isCaptain: false };
      return j === i ? { ...p, ...patch } : p;
    }));

  const onLogo = (f?: File) => {
    if (!f) return;
    if (f.size > 200_000) { alert('Logo must be under 200 KB.'); return; }
    const r = new FileReader();
    r.onload = () => setLogo(String(r.result));
    r.readAsDataURL(f);
  };

  const submit = async () => {
    const id = await act(() => server.registerSquad({ name, tag, logo, captainDiscord, players, rulesAccepted: rules }), 'Registration submitted — pending staff approval.');
    if (id) setSubmittedId(id);
  };

  const starters = players.filter((p) => p.slot === 'starter').length;

  return (
    <div className="space-y-6">
      <PageHeaderT
        page="register"
        right={<Badge tone={full ? 'red' : 'green'}>{approved}/16 slots filled</Badge>}
      />
      {!state.settings.enforceRegistrationWindow && (
        <DemoNotice>Demo: the Nov 22–24 registration window is not enforced so you can try the form today. Admins can enforce it in Admin → Settings.</DemoNotice>
      )}

      {mine.length > 0 && (
        <Card>
          <SectionTitle icon="📄">Your registrations</SectionTitle>
          <div className="space-y-2">
            {mine.map((q) => (
              <div key={q.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-black/30 p-3">
                <div className="flex items-center gap-3"><SquadLogo squad={q} size={36} /><b>{q.name}</b></div>
                <div className="flex items-center gap-2">
                  {q.status === 'pending' && <Badge tone="yellow">⏳ Pending approval</Badge>}
                  {q.status === 'approved' && <Badge tone="green">✅ Approved{q.number ? ` · Squad #${q.number}` : ''}</Badge>}
                  {q.status === 'rejected' && <Badge tone="red">❌ Rejected</Badge>}
                  <Link to={`/squads/${q.id}`} className="text-xs text-mute hover:text-white">Profile →</Link>
                </div>
                {q.rejectReason && <div className="w-full text-xs text-red-300">Reason: {q.rejectReason}</div>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {submittedId ? (
        <Card glow="gold" className="text-center">
          <div className="text-5xl">📨</div>
          <div className="mt-2 font-display text-2xl font-bold uppercase">Registration received!</div>
          <p className="mx-auto mt-2 max-w-md text-sm text-mute"><Txt k="register.done" accent="font-bold text-yellow-200" /></p>
          <div className="mt-4 flex justify-center gap-2">
            <Link to={`/squads/${submittedId}`}><Button variant="gold">View squad profile</Button></Link>
            <Button variant="ghost" onClick={() => setSubmittedId(undefined)}>Back</Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <Card>
              <SectionTitle icon="🛡️">Squad information</SectionTitle>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Squad name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Atlas Wolves" maxLength={28} /></Field>
                <Field label="Squad tag (2–4)"><input className={inputCls} value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} placeholder="ATW" maxLength={4} /></Field>
                <Field label="Captain's Discord username"><input className={inputCls} value={captainDiscord} onChange={(e) => setCaptainDiscord(e.target.value)} placeholder="username" /></Field>
                <Field label="Squad number" hint="Assigned by staff after approval (1–16)."><input className={inputCls} disabled value="Assigned on approval" /></Field>
                <Field label="Squad logo" hint="PNG/JPG, max 200 KB" className="md:col-span-2">
                  <div className="flex items-center gap-3">
                    {logo ? <img src={logo} alt="" className="h-14 w-14 rounded-lg object-cover" /> : <div className="grid h-14 w-14 place-items-center rounded-lg border border-dashed border-white/20 text-xs text-mute">Logo</div>}
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onLogo(e.target.files?.[0])} className="text-xs text-mute file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white" />
                  </div>
                </Field>
              </div>
            </Card>

            <Card>
              <SectionTitle icon="👥" right={<Badge tone={starters === 3 ? 'green' : 'red'}>{starters}/3 starters · {4 - starters}/1 sub</Badge>}>Player information</SectionTitle>
              <div className="space-y-4">
                {players.map((p, i) => (
                  <div key={i} className="rounded-xl border border-white/10 bg-black/25 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="font-display text-lg font-bold uppercase">Player {i + 1}</div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <label className="flex items-center gap-1"><input type="radio" checked={p.isCaptain} onChange={() => upd(i, { isCaptain: true })} /> 🧢 Captain</label>
                        <select className="rounded-md border border-white/10 bg-ink-3 px-2 py-1" value={p.slot} onChange={(e) => upd(i, { slot: e.target.value as Draft['slot'] })}>
                          <option value="starter">Starter</option><option value="sub">Substitute</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Field label="Discord username"><input className={inputCls} value={p.discord} onChange={(e) => upd(i, { discord: e.target.value })} /></Field>
                      <Field label="Free Fire username"><input className={inputCls} value={p.ffUsername} onChange={(e) => upd(i, { ffUsername: e.target.value })} /></Field>
                      <Field label="Free Fire UID"><input className={inputCls} inputMode="numeric" value={p.uid} onChange={(e) => upd(i, { uid: e.target.value.replace(/\D/g, '') })} placeholder="8–12 digits" /></Field>
                      <Field label="In-game name"><input className={inputCls} value={p.ign} onChange={(e) => upd(i, { ign: e.target.value })} /></Field>
                      <Field label="Player role">
                        <select className={inputCls} value={p.role} onChange={(e) => upd(i, { role: e.target.value as PlayerRole })}>
                          {ROLES.map((r) => <option key={r}>{r}</option>)}
                        </select>
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <Card>
              <SectionTitle icon="✅">Submit</SectionTitle>
              <Editable k="register.rules" block className="mb-4">
                <ul className="space-y-1 text-xs text-mute">
                  {text.lines('register.rules').map((l, i) => <li key={i}>• {rich(l)}</li>)}
                </ul>
              </Editable>
              <label className="mb-4 flex items-start gap-2 text-sm">
                <input type="checkbox" checked={rules} onChange={(e) => setRules(e.target.checked)} className="mt-1" />
                <span><Txt k="register.confirm" /> <Link to="/rules" className="text-mred-2 underline">📜</Link></span>
              </label>
              <Button className="w-full" size="lg" disabled={full || !rules} onClick={submit}>{full ? 'All slots filled' : 'Submit registration'}</Button>
              <p className="mt-2 text-[11px] text-mute">Signed in as <b>{me.discord}</b>. You can hold one active registration.</p>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
