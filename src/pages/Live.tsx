import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { act, attempt, useTournament } from '../store';
import { sourceLabel, STAGE_LABEL } from '../engine/config';
import { can, canSeeRoom } from '../engine/permissions';
import { fmtDateTime, fmtTime } from '../engine/util';
import { EventKind, Match } from '../types';
import { Badge, Button, Card, ConfirmButton, Countdown, cx, Empty, Field, inputCls, MatchStatusBadge, MoroccoFlag, SectionTitle, SquadLogo } from '../components/ui';
import { PageHeaderT } from '../content/Text';
import { PredictionWidget } from './Predict';

const EVENT_META: Record<EventKind, { icon: string; label: string }> = {
  start: { icon: '🔥', label: 'Match starting' },
  intro: { icon: '🎤', label: 'Squad introductions' },
  update: { icon: '📣', label: 'Match update' },
  moment: { icon: '💥', label: 'Important moment' },
  kill: { icon: '🎯', label: 'Kill update' },
  result: { icon: '🏁', label: 'Final result' },
  mvp: { icon: '⭐', label: 'MVP announcement' },
  system: { icon: '🛰️', label: 'System' },
};

export default function Live() {
  const { number } = useParams();
  const nav = useNavigate();
  const { state, matchByNumber } = useTournament();
  const sorted = [...state.matches].sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number);
  const fallback = sorted.find((m) => m.status === 'live') ?? sorted.find((m) => m.status === 'review') ?? sorted.find((m) => (m.status === 'upcoming' || m.status === 'ready') && m.a && m.b) ?? sorted.find((m) => m.status === 'upcoming') ?? sorted[sorted.length - 1];
  const m = number ? matchByNumber(Number(number)) : fallback;

  return (
    <div className="space-y-6">
      <PageHeaderT page="live" right={
        <select className={cx(inputCls, 'w-72')} value={m?.number ?? ''} onChange={(e) => nav(`/live/${e.target.value}`)} aria-label="Choose match">
          {sorted.map((x) => <option key={x.id} value={x.number}>#{x.number} · {x.label} · {x.status}</option>)}
        </select>
      } />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {sorted.filter((x) => x.status === 'live' || x.status === 'review').map((x) => (
          <Link key={x.id} to={`/live/${x.number}`} className="shrink-0"><Badge tone="red"><span className="live-dot h-1.5 w-1.5 rounded-full bg-red-400" /> #{x.number} {x.label}</Badge></Link>
        ))}
      </div>
      {m ? <MatchRoom m={m} /> : <Empty>No match selected.</Empty>}
    </div>
  );
}

function MatchRoom({ m }: { m: Match }) {
  const { state, squad, user } = useTournament();
  const A = squad(m.a), B = squad(m.b);
  const events = state.events.filter((e) => e.matchId === m.id).sort((a, b) => b.at.localeCompare(a.at));
  const comm = user(m.commentatorId);
  const winner = squad(m.winner);
  const mvp = [...(A?.players ?? []), ...(B?.players ?? [])].find((p) => p.id === m.mvp);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-6">
        {/* Broadcast header */}
        <div className={cx('relative overflow-hidden rounded-3xl border p-5 md:p-8', m.status === 'live' ? 'border-mred-2/60 ring-glow-red' : 'border-white/10')} style={{ background: `linear-gradient(110deg, ${A?.color ?? '#333'}30, #06070a 45%, #06070a 55%, ${B?.color ?? '#333'}30)` }}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {m.status === 'live' ? <Badge tone="red" className="text-sm"><span className="live-dot h-2 w-2 rounded-full bg-red-400" /> LIVE NOW</Badge> : <MatchStatusBadge m={m} />}
              <Badge>Match #{String(m.number).padStart(2, '0')}</Badge>
              <Badge tone="blue">{STAGE_LABEL[m.stage]} · {m.label}</Badge>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-mute">MOROCCAN SQUAD CLASH <MoroccoFlag className="h-2.5 w-4" /></div>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <TeamSide squadId={m.a} fallback={sourceLabel(m.srcA)} winner={m.winner} />
            <div className="text-center">
              <div className="font-display text-4xl font-bold text-white/80 md:text-6xl">VS</div>
              {(m.status === 'upcoming' || m.status === 'ready') && <div className="mt-1 text-xs text-mute"><Countdown to={m.date} compact /></div>}
            </div>
            <TeamSide squadId={m.b} fallback={sourceLabel(m.srcB)} winner={m.winner} right />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            <Info k="🗓️ Start" v={fmtDateTime(m.date)} />
            <Info k="🗺️ Map" v={m.map} />
            <Info k="🎙️ Commentator" v={comm?.name ?? 'TBA'} />
            <Info k="👁️ Supervisor" v={user(m.supervisorId)?.name ?? 'TBA'} />
          </div>
          {winner && (
            <div className="anim-pop mt-5 rounded-2xl border border-gold/50 bg-gold/10 p-4 text-center">
              <div className="text-xs font-bold uppercase tracking-[0.3em] text-gold">Official winner · verified</div>
              <div className="font-display text-3xl font-bold uppercase text-gradient-gold">{winner.name}</div>
              {mvp && <div className="text-sm">⭐ MVP: <b>{mvp.ign}</b> ({m.kills[mvp.id] ?? 0} kills)</div>}
            </div>
          )}
          {m.status === 'review' && <div className="mt-5 rounded-xl border border-yellow-400/40 bg-yellow-400/10 p-3 text-center text-sm text-yellow-100">🟡 Result submitted — awaiting staff verification. Standings, rewards and predictions update after verification.</div>}
        </div>

        <RoomPanel m={m} />
        <StaffPanel m={m} />

        <Card>
          <SectionTitle icon="🎙️" right={comm && <span className="text-xs text-mute">COMMENTATOR: {comm.name}</span>}>Live commentary</SectionTitle>
          <CommentatorComposer m={m} />
          {events.length === 0 ? <Empty icon="🎙️">Commentary will appear here when the match goes live.</Empty> : (
            <ol className="relative space-y-3 border-l border-white/10 pl-5">
              {events.map((e) => (
                <li key={e.id} className="anim-rise">
                  <span className="absolute -left-[9px] mt-1 grid h-4 w-4 place-items-center rounded-full bg-ink text-[10px]">{EVENT_META[e.kind].icon}</span>
                  <div className="text-[11px] text-mute">{fmtTime(e.at)} · {EVENT_META[e.kind].label}{e.authorId !== 'system' && ` · ${user(e.authorId)?.name ?? ''}`}</div>
                  <div className={cx('text-sm', e.kind === 'result' && 'font-bold text-gold', e.kind === 'start' && 'font-bold text-mred-2')}>{e.text}</div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {m.status === 'completed' && <KillTable m={m} />}
        <Highlights m={m} />
      </div>

      <div className="space-y-6">
        <PredictionWidget m={m} />
        <Chat m={m} />
      </div>
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2"><div className="text-mute">{k}</div><div className="font-semibold">{v}</div></div>;
}

function TeamSide({ squadId, fallback, winner, right }: { squadId?: string; fallback: string; winner?: string; right?: boolean }) {
  const { squad } = useTournament();
  const q = squad(squadId);
  const lost = winner && squadId && winner !== squadId;
  return (
    <div className={cx('flex flex-col items-center gap-2 text-center md:flex-row md:text-left', right && 'md:flex-row-reverse md:text-right', lost && 'opacity-40 grayscale')}>
      <SquadLogo squad={q} size={72} className={cx(winner === squadId && q && 'drop-shadow-[0_0_20px_rgba(245,197,66,.7)]')} />
      <div className="min-w-0">
        <div className="break-words font-display text-base font-bold uppercase leading-tight sm:text-xl md:text-3xl">{q?.name ?? fallback}</div>
        {q && <div className="text-xs text-mute">🧢 {q.players.find((p) => p.isCaptain)?.ign}</div>}
      </div>
    </div>
  );
}

function RoomPanel({ m }: { m: Match }) {
  const { me, server } = useTournament();
  const visible = canSeeRoom(me, m);
  const captainHere = me.roles.includes('captain') && me.squadId && (me.squadId === m.a || me.squadId === m.b);
  const myReady = me.squadId === m.a ? m.readyA : me.squadId === m.b ? m.readyB : false;
  return (
    <Card>
      <SectionTitle icon="🔐" right={<div className="flex gap-2 text-xs"><Badge tone={m.readyA ? 'green' : 'slate'}>A {m.readyA ? 'ready' : 'not ready'}</Badge><Badge tone={m.readyB ? 'green' : 'slate'}>B {m.readyB ? 'ready' : 'not ready'}</Badge></div>}>Custom room</SectionTitle>
      {!m.roomId ? (
        <p className="text-sm text-mute">The Hoster has not published this match's room yet. Each matchup gets its own dedicated custom room.</p>
      ) : visible ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-mgreen/40 bg-mgreen/10 p-3"><div className="text-xs text-mute">Room ID</div><div className="font-mono text-2xl font-bold tracking-widest">{m.roomId}</div></div>
          <div className="rounded-xl border border-mgreen/40 bg-mgreen/10 p-3"><div className="text-xs text-mute">Password</div><div className="font-mono text-2xl font-bold tracking-widest">{m.roomPass}</div></div>
        </div>
      ) : (
        <p className="text-sm text-mute">🔒 Room credentials are private — visible only to the two squads' registered members and authorised staff.</p>
      )}
      {captainHere && (m.status === 'upcoming' || m.status === 'ready') && (
        <div className="mt-3 flex items-center gap-3">
          <Button variant="green" disabled={myReady} onClick={() => act(() => server.confirmReady(m.id), 'Readiness confirmed.')}>{myReady ? '✅ Squad ready' : '✋ Confirm squad readiness'}</Button>
          <span className="text-xs text-mute">All players must join the assigned room on time.</span>
        </div>
      )}
    </Card>
  );
}

function StaffPanel({ m }: { m: Match }) {
  const { me, server, squad } = useTournament();
  const [roomId, setRoomId] = useState(m.roomId ?? '');
  const [pass, setPass] = useState(m.roomPass ?? '');
  const [winner, setWinner] = useState(m.pending?.winner ?? '');
  const [kills, setKills] = useState<Record<string, number>>(m.pending?.kills ?? {});
  const [mvp, setMvp] = useState(m.pending?.mvp ?? '');
  const [reason, setReason] = useState('');
  useEffect(() => { setRoomId(m.roomId ?? ''); setPass(m.roomPass ?? ''); setWinner(m.pending?.winner ?? ''); setKills(m.pending?.kills ?? {}); setMvp(m.pending?.mvp ?? ''); }, [m.id, m.roomId, m.roomPass, m.pending]);

  const host = can(me, 'room.manage');
  const counter = can(me, 'result.submit');
  const verifier = can(me, 'result.verify');
  const canceller = can(me, 'match.cancel');
  if (!host && !counter && !verifier && !canceller) return null;
  const A = squad(m.a), B = squad(m.b);
  const players = [...(A?.players ?? []), ...(B?.players ?? [])];
  const open = m.status === 'upcoming' || m.status === 'ready';

  return (
    <Card className="border-sky-500/30">
      <SectionTitle icon="🛠️" right={<Badge tone="blue">Staff only</Badge>}>Match operations</SectionTitle>
      {!m.a || !m.b ? <p className="text-sm text-mute">Squads are not decided yet.</p> : (
        <div className="space-y-5">
          {host && open && (
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-sky-300">🎙️ Hoster — room & start</div>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Room ID"><input className={inputCls} value={roomId} onChange={(e) => setRoomId(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 48123456" /></Field>
                <Field label="Password"><input className={inputCls} value={pass} onChange={(e) => setPass(e.target.value)} /></Field>
                <Button variant="ghost" onClick={() => act(() => server.setRoom(m.id, roomId, pass), 'Room published to squads & staff.')}>Publish room</Button>
                <ConfirmButton variant="red" size="md" title={`Start match #${m.number}?`} message={<>Starting the match sets it LIVE and <b>locks all DHD predictions</b>. {!(m.readyA && m.readyB) && <span className="text-amber-200">Warning: not both captains have confirmed readiness.</span>}</>} confirmLabel="Start match" onConfirm={() => act(() => server.startMatch(m.id), 'Match is LIVE.')}>▶ Start match</ConfirmButton>
              </div>
            </div>
          )}
          {counter && (m.status === 'live' || m.status === 'review') && (
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-emerald-300">📊 Counter — record result & kills</div>
              <div className="mb-3 flex flex-wrap gap-2">
                {[A, B].map((q) => q && (
                  <button key={q.id} onClick={() => setWinner(q.id)} className={cx('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm', winner === q.id ? 'border-gold bg-gold/15' : 'border-white/10 bg-black/30')}>
                    <SquadLogo squad={q} size={22} /> {q.name} wins
                  </button>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {players.map((p) => (
                  <label key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-black/30 px-3 py-1.5 text-sm">
                    <span className="truncate">{p.ign} <span className="text-[10px] text-mute">{p.slot === 'sub' ? 'SUB' : ''}</span></span>
                    <input type="number" min={0} max={60} className="w-16 rounded-md border border-white/10 bg-ink px-2 py-1 text-right" value={kills[p.id] ?? ''} placeholder="—"
                      onChange={(e) => setKills((k) => { const n = { ...k }; if (e.target.value === '') delete n[p.id]; else n[p.id] = Math.max(0, Math.floor(Number(e.target.value))); return n; })} />
                  </label>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <Field label="MVP"><select className={inputCls} value={mvp} onChange={(e) => setMvp(e.target.value)}><option value="">—</option>{players.map((p) => <option key={p.id} value={p.id}>{p.ign}</option>)}</select></Field>
                <Button variant="green" disabled={!winner} onClick={() => act(() => server.submitResult(m.id, winner, kills, mvp || undefined), 'Result submitted for verification.')}>Submit for review</Button>
              </div>
              <p className="mt-1 text-[11px] text-mute">Leave a player blank if they did not play. Kills never affect qualification points.</p>
            </div>
          )}
          {verifier && m.status === 'review' && m.pending && (
            <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/5 p-3">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-yellow-200">✅ Verification (four-eyes)</div>
              <p className="text-sm">Submitted winner: <b>{squad(m.pending.winner)?.name}</b> · total kills {Object.values(m.pending.kills).reduce((a, b) => a + b, 0)}</p>
              <div className="mt-2 flex gap-2">
                <ConfirmButton variant="gold" size="md" title="Verify official result?" message="Verification is final: standings and the bracket update, the 200 DHD victory bonus is created and all DHD predictions on this match are settled." confirmLabel="Verify & settle" onConfirm={() => act(() => server.verifyResult(m.id), 'Result verified — standings, bracket & predictions updated.')}>Verify result</ConfirmButton>
                <Button variant="ghost" onClick={() => act(() => server.rejectResult(m.id), 'Sent back to Counter.')}>Reject</Button>
              </div>
            </div>
          )}
          {canceller && m.status !== 'completed' && m.status !== 'cancelled' && (
            <div className="flex flex-wrap items-end gap-2 border-t border-white/5 pt-4">
              <Field label="Cancel reason" className="flex-1"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. server outage" /></Field>
              <ConfirmButton title={`Cancel match #${m.number}?`} message="The match will be marked cancelled and every open DHD prediction refunded. This cannot be undone." confirmLabel="Cancel match" disabled={!reason.trim()} onConfirm={() => act(() => server.cancelMatch(m.id, reason), 'Match cancelled — stakes refunded.')}>Cancel match</ConfirmButton>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function CommentatorComposer({ m }: { m: Match }) {
  const { me, server } = useTournament();
  const [kind, setKind] = useState<EventKind>('update');
  const [text, setText] = useState('');
  if (!can(me, 'commentary.post') || (!me.roles.includes('admin') && m.commentatorId !== me.id)) return null;
  const publish = async () => { if (await attempt(() => server.postEvent(m.id, kind, text))) setText(''); };
  const templates: Partial<Record<EventKind, string>> = {
    start: '🔥 THE BATTLE IS STARTING!',
    intro: 'Introducing the squads…',
    kill: '🎯 ',
    mvp: '⭐ MVP of the match: ',
  };
  return (
    <div className="mb-4 rounded-xl border border-orange-400/30 bg-orange-400/5 p-3">
      <div className="mb-2 text-xs font-bold uppercase tracking-wider text-orange-300">🎤 Commentator desk — you cannot change official results</div>
      <div className="flex flex-wrap gap-2">
        <select className={cx(inputCls, 'w-48')} value={kind} onChange={(e) => { const k = e.target.value as EventKind; setKind(k); if (templates[k] && !text) setText(templates[k]!); }}>
          {(Object.keys(EVENT_META) as EventKind[]).filter((k) => k !== 'system').map((k) => <option key={k} value={k}>{EVENT_META[k].icon} {EVENT_META[k].label}</option>)}
        </select>
        <input className={cx(inputCls, 'min-w-[200px] flex-1')} value={text} onChange={(e) => setText(e.target.value)} maxLength={400} placeholder="What's happening?" onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) void publish(); }} />
        <Button onClick={publish}>Publish</Button>
      </div>
    </div>
  );
}

function KillTable({ m }: { m: Match }) {
  const { squad } = useTournament();
  const rows = [squad(m.a), squad(m.b)].flatMap((q) => (q?.players ?? []).filter((p) => m.kills[p.id] !== undefined).map((p) => ({ p, q: q!, k: m.kills[p.id] })));
  rows.sort((a, b) => b.k - a.k);
  return (
    <Card>
      <SectionTitle icon="🎯">Verified kills</SectionTitle>
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map(({ p, q, k }) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-2 text-sm">
            <span className="flex items-center gap-2"><SquadLogo squad={q} size={20} /> {p.ign} {m.mvp === p.id && '⭐'}</span>
            <b className="font-display text-lg">{k}</b>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Highlights({ m }: { m: Match }) {
  const { me, server } = useTournament();
  const [url, setUrl] = useState('');
  const staff = can(me, 'commentary.post') || can(me, 'match.edit');
  if (!m.highlights.length && !staff) return null;
  return (
    <Card>
      <SectionTitle icon="📸">Match highlights</SectionTitle>
      {m.highlights.length === 0 ? <p className="text-sm text-mute">No highlights yet.</p> : (
        <ul className="space-y-1 text-sm">{m.highlights.map((h, i) => <li key={i}><a href={h} target="_blank" rel="noreferrer noopener" className="text-sky-300 underline break-all">{h.startsWith('data:') ? `Screenshot ${i + 1}` : h}</a></li>)}</ul>
      )}
      {staff && (
        <div className="mt-3 flex gap-2">
          <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://clip or screenshot link" />
          <Button variant="ghost" onClick={async () => { if (await attempt(() => server.addHighlight(m.id, url), 'Highlight added.')) setUrl(''); }}>Add</Button>
        </div>
      )}
    </Card>
  );
}

function Chat({ m }: { m: Match }) {
  const { state, user, server, me } = useTournament();
  const [text, setText] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const msgs = state.chat.filter((c) => c.matchId === m.id).slice(-80);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [msgs.length]);
  const send = async () => { if (await attempt(() => server.sendChat(m.id, text))) setText(''); };
  return (
    <Card>
      <SectionTitle icon="💬" right={<span className="text-[10px] text-mute">demo: local to this browser</span>}>Viewer chat</SectionTitle>
      <div ref={box} className="mb-3 h-72 space-y-2 overflow-y-auto rounded-lg bg-black/30 p-3">
        {msgs.length === 0 && <p className="text-center text-xs text-mute">Be the first to hype this match! 🔥</p>}
        {msgs.map((c) => {
          const u = user(c.userId);
          return (
            <div key={c.id} className="text-sm">
              <b style={{ color: u?.avatarColor }}>{u?.discord}</b> <span className="text-white/85">{c.text}</span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <input className={inputCls} value={text} maxLength={200} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder={`Chat as ${me.discord}…`} />
        <Button onClick={send}>Send</Button>
      </div>
      <p className="mt-2 text-[11px] text-mute">Respect players and staff. Slow mode is on.</p>
    </Card>
  );
}
