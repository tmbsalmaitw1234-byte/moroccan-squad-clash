import { useState } from 'react';
import { Link } from 'react-router-dom';
import { act, attempt, pushToast, useTournament } from '../store';
import { computeGroup, currentPhase, PHASE_LABEL, squadEliminated, topKillers } from '../engine/logic';
import { can, isStaff, ROLE_META } from '../engine/permissions';
import { fmtDateTime, fmtNum } from '../engine/util';
import { STAGE_LABEL } from '../engine/config';
import { AnnouncementCategory, GROUPS, PenaltyType, Role, TournamentState } from '../types';
import { Badge, Button, Card, ConfirmButton, copyText, cx, DemoNotice, Empty, Field, inputCls, MatchStatusBadge, PageHeader, SectionTitle, SquadChip, SquadLogo, Stat, Tabs } from '../components/ui';
import { CATEGORY_LABEL, REPORT_STATUS } from './Report';
import { TEXT_DEFAULTS, TEXT_GROUPS } from '../content/defaults';

type Tab = 'overview' | 'registrations' | 'matches' | 'reports' | 'dhd' | 'announce' | 'text' | 'staff' | 'settings' | 'audit';

export default function Admin() {
  const { me } = useTournament();
  const [tab, setTab] = useState<Tab>('overview');
  if (!isStaff(me)) {
    return (
      <div className="py-16">
        <Empty icon="🔒">Staff only. Switch to a staff account with the demo sign-in selector to explore the dashboard.</Empty>
      </div>
    );
  }
  return (
    <div>
      <PageHeader kicker={`Signed in as ${me.name}`} title="Admin dashboard" subtitle="Tournament control room. Every action is permission-checked and written to the audit log." right={<div className="flex flex-wrap gap-1">{me.roles.map((r) => <Badge key={r} tone="gold">{ROLE_META[r].icon} {ROLE_META[r].label}</Badge>)}</div>} />
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'overview', label: '📈 Overview' }, { id: 'registrations', label: '📝 Registrations' }, { id: 'matches', label: '🗓️ Matches' },
        { id: 'reports', label: '🚨 Reports & penalties' }, { id: 'dhd', label: '💰 DHD & prizes' }, { id: 'announce', label: '📢 Announcements' },
        { id: 'text', label: '✏️ Site text' }, { id: 'staff', label: '👥 Staff' }, { id: 'settings', label: '⚙️ Settings' }, { id: 'audit', label: '🧾 Audit log' },
      ]} />
      {tab === 'overview' && <OverviewTab />}
      {tab === 'registrations' && <RegistrationsTab />}
      {tab === 'matches' && <MatchesTab />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'dhd' && <DhdTab />}
      {tab === 'announce' && <AnnounceTab />}
      {tab === 'text' && <SiteTextTab />}
      {tab === 'staff' && <StaffTab />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}

function OverviewTab() {
  const { state, me, server } = useTournament();
  const phase = currentPhase(state);
  const review = state.matches.filter((m) => m.status === 'review');
  const openReports = state.reports.filter((r) => ['submitted', 'checker_review', 'investigation'].includes(r.status));
  const pending = state.squads.filter((q) => q.status === 'pending');
  const admin = can(me, 'staff.manage');
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Phase" value={PHASE_LABEL[phase]} />
        <Stat label="Pending squads" value={pending.length} accent={pending.length ? 'text-yellow-200' : ''} />
        <Stat label="Results to verify" value={review.length} accent={review.length ? 'text-yellow-200' : ''} />
        <Stat label="Open reports" value={openReports.length} accent={openReports.length ? 'text-red-300' : ''} />
        <Stat label="Matches done" value={`${state.matches.filter((m) => m.status === 'completed').length}/${state.matches.length}`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle icon="🧭">Next steps</SectionTitle>
          <ul className="space-y-2 text-sm">
            {pending.length > 0 && <li>📝 {pending.length} registration(s) awaiting approval.</li>}
            {phase === 'draw' && <li>🎲 16 squads approved — <Link className="text-mred-2 underline" to="/draw">run the group draw</Link>.</li>}
            {review.map((m) => <li key={m.id}>🟡 <Link className="underline" to={`/live/${m.number}`}>Match #{m.number}</Link> result awaiting verification.</li>)}
            {GROUPS.map((g) => { const t = computeGroup(state, g); return t.complete && !t.cutResolved ? <li key={g}>⚖️ Group {g} needs a deciding match (Matches tab).</li> : null; })}
            {state.matches.find((m) => m.stage === 'final')?.status === 'completed' && !state.championId && <li>👑 Grand Final verified — declare the champion in DHD & prizes.</li>}
            {openReports.length > 0 && <li>🚨 {openReports.length} report(s) in progress.</li>}
            <li className="text-mute">Tip: run matches from the <Link to="/live" className="underline">Live Match Center</Link> (room → start → result → verify).</li>
          </ul>
        </Card>
        {admin && server.mode === 'demo' && server.loadScenario && (
          <Card className="border-amber-400/30">
            <SectionTitle icon="🧪">Demo tools</SectionTitle>
            <p className="mb-3 text-xs text-mute">Jump to a tournament stage. Scenarios are built by running the real staff workflow (draw → rooms → results → verification → payouts) with sample data.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => act(() => server.loadScenario!('groups'), 'Scenario: mid group stage')}>Mid group stage</Button>
              <Button variant="ghost" size="sm" onClick={() => act(() => server.loadScenario!('knockouts'), 'Scenario: quarter-finals')}>Quarter-finals</Button>
              <Button variant="ghost" size="sm" onClick={() => act(() => server.loadScenario!('final'), 'Scenario: Grand Final day')}>Grand Final day</Button>
              <Button variant="gold" size="sm" onClick={() => act(() => server.loadScenario!('finished'), 'Scenario: champions crowned')}>Champions crowned</Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={async () => { const n = await act(() => server.simulateNext!()); if (n) pushToast('ok', `Simulated match #${n}`); }}>⏩ Simulate next match</Button>
              <ConfirmButton title="Reset demo data?" message="All registrations, results, predictions and logs in this browser are replaced with the initial sample data." confirmLabel="Reset" onConfirm={() => { server.resetDemo?.(); pushToast('ok', 'Demo reset.'); }}>Reset demo</ConfirmButton>
            </div>
          </Card>
        )}
        {admin && server.mode === 'supabase' && (
          <Card className="border-sky-500/30">
            <SectionTitle icon="🗄️">Database setup</SectionTitle>
            <ol className="mb-3 list-decimal space-y-1 pl-5 text-xs text-mute">
              <li>Initialize the 31 official fixtures once (dates, maps and bracket wiring from the calendar).</li>
              <li>Approve 16 squads → run the draw → lock groups.</li>
              <li>The bracket advances automatically after each verified result. If it ever looks stale, re-sync it.</li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <ConfirmButton variant="green" size="sm" disabled={state.matches.length > 0} title="Create official fixtures?" message="Creates the 24 group-stage and 7 knockout fixtures from the official calendar (Nov 25 – Dec 2). This can only be done once." confirmLabel="Create fixtures" onConfirm={() => act(() => server.initFixtures!(), 'Fixtures created.')}>
                {state.matches.length > 0 ? `✓ ${state.matches.length} fixtures` : 'Initialize fixtures'}
              </ConfirmButton>
              <Button size="sm" variant="ghost" onClick={() => act(() => server.syncBracket!(), 'Bracket re-synced.')}>↻ Re-sync bracket</Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function RegistrationsTab() {
  const { state, me, server } = useTournament();
  const [reason, setReason] = useState<Record<string, string>>({});
  const list = [...state.squads].sort((a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1) || (a.number ?? 99) - (b.number ?? 99));
  const review = can(me, 'registration.review');
  const uidCount = new Map<string, number>();
  state.squads.filter((q) => q.status !== 'rejected').forEach((q) => q.players.forEach((p) => uidCount.set(p.uid, (uidCount.get(p.uid) ?? 0) + 1)));

  return (
    <Card>
      <SectionTitle icon="📝" right={<Badge>{state.squads.filter((q) => q.status === 'approved').length}/16 approved</Badge>}>Squad registrations</SectionTitle>
      {!review && <DemoNotice>Your role can view registrations; approving requires the Administrator role.</DemoNotice>}
      <div className="space-y-3">
        {list.map((q) => (
          <details key={q.id} className="rounded-xl border border-white/10 bg-black/30 p-3" open={q.status === 'pending'}>
            <summary className="flex cursor-pointer flex-wrap items-center gap-3">
              <SquadLogo squad={q} size={34} />
              <b className="flex-1">{q.name} <span className="text-xs text-mute">[{q.tag}]</span></b>
              {q.number && <Badge>#{q.number}</Badge>}
              <Badge tone={q.status === 'approved' ? 'green' : q.status === 'pending' ? 'yellow' : 'red'}>{q.status}</Badge>
              {q.disqualified && <Badge tone="red">DQ</Badge>}
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-xs">
                <thead><tr className="text-left text-mute"><th className="py-1">IGN</th><th>FF user</th><th>UID</th><th>Discord</th><th>Role</th><th>Slot</th></tr></thead>
                <tbody>{q.players.map((p) => (
                  <tr key={p.id} className="border-t border-white/5">
                    <td className="py-1">{p.ign} {p.isCaptain && '🧢'}</td><td>{p.ffUsername}</td>
                    <td className={cx('font-mono', (uidCount.get(p.uid) ?? 0) > 1 && 'text-red-300')}>{p.uid}{(uidCount.get(p.uid) ?? 0) > 1 && ' ⚠ duplicate'}</td>
                    <td>{p.discord}</td><td>{p.role}</td><td>{p.slot}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {review && (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                {q.status !== 'approved' && <Button variant="green" size="sm" disabled={state.groupsLocked} onClick={() => act(() => server.reviewSquad(q.id, 'approved'), `${q.name} approved.`)}>Approve</Button>}
                {q.status !== 'rejected' && (
                  <>
                    <input className={cx(inputCls, 'w-64 py-1.5')} placeholder="Rejection reason" value={reason[q.id] ?? ''} onChange={(e) => setReason({ ...reason, [q.id]: e.target.value })} />
                    <ConfirmButton title={`Reject ${q.name}?`} message="The captain will see the rejection and reason. They may re-register." confirmLabel="Reject" disabled={state.groupsLocked} onConfirm={() => act(() => server.reviewSquad(q.id, 'rejected', reason[q.id]), `${q.name} rejected.`)}>Reject</ConfirmButton>
                  </>
                )}
                {q.status === 'approved' && (
                  <>
                    <Field label="Squad #"><input type="number" min={1} max={16} defaultValue={q.number} className={cx(inputCls, 'w-20 py-1.5')} onBlur={(e) => { const n = Number(e.target.value); if (n && n !== q.number) act(() => server.editSquad(q.id, { number: n }), 'Squad number updated.'); }} /></Field>
                    <Field label="Name"><input defaultValue={q.name} className={cx(inputCls, 'w-48 py-1.5')} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== q.name) act(() => server.editSquad(q.id, { name: e.target.value.trim() }), 'Squad renamed.'); }} /></Field>
                    {!q.disqualified && !squadEliminated(state, q.id) && (
                      <ConfirmButton title={`Eliminate ${q.name}?`} message="The squad is removed from competition (shown as disqualified/eliminated). Use the Supervisor penalty flow for rule violations." confirmLabel="Eliminate" onConfirm={() => act(() => server.setSquadEliminated(q.id, 'Eliminated by administrator'), 'Squad eliminated.')}>Eliminate</ConfirmButton>
                    )}
                  </>
                )}
              </div>
            )}
            {q.rejectReason && <p className="mt-2 text-xs text-red-300">Reason: {q.rejectReason}</p>}
          </details>
        ))}
      </div>
    </Card>
  );
}

function MatchesTab() {
  const { state, me, server, squad } = useTournament();
  const edit = can(me, 'match.edit');
  const pm = can(me, 'predictions.manage');
  const commentators = state.users.filter((u) => u.roles.includes('commentator'));
  const supervisors = state.users.filter((u) => u.roles.includes('supervisor'));
  const approved = state.squads.filter((q) => q.status === 'approved');
  const [ko, setKo] = useState<Record<string, { a: string; b: string }>>({});
  const tieGroups = GROUPS.map((g) => ({ g, t: computeGroup(state, g) })).filter(({ t }) => t.complete && !t.cutResolved);

  return (
    <div className="space-y-6">
      {tieGroups.length > 0 && (
        <Card className="border-purple-500/40">
          <SectionTitle icon="⚖️">Deciding matches required</SectionTitle>
          {tieGroups.map(({ g, t }) => (
            <div key={g} className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <b>Group {g}:</b> tied — {t.tiedAtCut.map((id) => squad(id)?.name).join(', ')}
              {edit && t.tiedAtCut.length >= 2 && <Button size="sm" onClick={() => act(() => server.createTiebreak(g, t.tiedAtCut[0], t.tiedAtCut[1]), 'Deciding match created.')}>Create {squad(t.tiedAtCut[0])?.tag} vs {squad(t.tiedAtCut[1])?.tag}</Button>}
            </div>
          ))}
        </Card>
      )}
      <Card>
        <SectionTitle icon="🗓️">All fixtures</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-xs">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-mute"><th className="py-2">#</th><th>Stage</th><th>Squads</th><th>Date / time</th><th>Map</th><th>Commentator</th><th>Supervisor</th><th>Status</th><th>Predictions</th><th>Actions</th></tr></thead>
            <tbody>
              {state.matches.map((m) => {
                const locked = m.status === 'completed' || !edit;
                return (
                  <tr key={m.id} className="border-t border-white/5 align-middle">
                    <td className="py-2 font-display text-base font-bold">{m.number}</td>
                    <td>{STAGE_LABEL[m.stage]}<div className="text-mute">{m.label}</div></td>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        <SquadChip squad={squad(m.a)} size={16} link={false} />
                        <SquadChip squad={squad(m.b)} size={16} link={false} />
                      </div>
                      {edit && m.stage !== 'group' && m.status === 'upcoming' && (
                        <div className="mt-1 flex gap-1">
                          {(['a', 'b'] as const).map((side) => (
                            <select key={side} className="w-24 rounded border border-white/10 bg-ink px-1 py-0.5" value={ko[m.id]?.[side] ?? ''} onChange={(e) => setKo({ ...ko, [m.id]: { a: ko[m.id]?.a ?? '', b: ko[m.id]?.b ?? '', [side]: e.target.value } })}>
                              <option value="">{side.toUpperCase()}…</option>
                              {approved.map((q) => <option key={q.id} value={q.id}>{q.tag}</option>)}
                            </select>
                          ))}
                          <ConfirmButton size="sm" variant="ghost" title="Override bracket?" message="Manually setting participants replaces automatic advancement for this fixture." disabled={!ko[m.id]?.a || !ko[m.id]?.b} onConfirm={() => act(() => server.setKoParticipants(m.id, ko[m.id].a, ko[m.id].b), 'Bracket updated.')}>Set</ConfirmButton>
                        </div>
                      )}
                    </td>
                    <td>
                      <input type="datetime-local" disabled={locked} className="rounded border border-white/10 bg-ink px-1 py-0.5"
                        defaultValue={toLocalInput(m.date)} onBlur={(e) => { const iso = fromLocalInput(e.target.value); if (iso && iso !== m.date) act(() => server.editMatch(m.id, { date: iso }), `Match #${m.number} rescheduled.`); }} />
                      <div className="text-mute">{fmtDateTime(m.date)}</div>
                    </td>
                    <td>
                      <select disabled={locked} className="rounded border border-white/10 bg-ink px-1 py-0.5" value={m.map} onChange={(e) => act(() => server.editMatch(m.id, { map: e.target.value }))}>
                        <option>Bermuda</option><option>Bermuda Remastered</option>
                      </select>
                    </td>
                    <td>
                      <select disabled={locked} className="rounded border border-white/10 bg-ink px-1 py-0.5" value={m.commentatorId ?? ''} onChange={(e) => act(() => server.editMatch(m.id, { commentatorId: e.target.value || undefined }), 'Commentator assigned.')}>
                        <option value="">—</option>{commentators.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select disabled={locked} className="rounded border border-white/10 bg-ink px-1 py-0.5" value={m.supervisorId ?? ''} onChange={(e) => act(() => server.editMatch(m.id, { supervisorId: e.target.value || undefined }), 'Supervisor assigned.')}>
                        <option value="">—</option>{supervisors.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </td>
                    <td><MatchStatusBadge m={m} />{m.roomId && <div className="mt-1 text-mute">room ✓</div>}</td>
                    <td>
                      {m.settled ? <span className="text-mute">settled</span> : pm ? (
                        <div className="flex flex-col gap-1">
                          <Button size="sm" variant="ghost" onClick={() => act(() => server.setPredictionsOpen(m.id, !m.predictionsOpen))}>{m.predictionsOpen ? 'Close' : 'Open'}</Button>
                          <ConfirmButton size="sm" title="Cancel predictions?" message="All open predictions on this match are refunded and predictions closed." confirmLabel="Cancel & refund" onConfirm={() => act(() => server.cancelPredictions(m.id), 'Predictions refunded.')}>Refund</ConfirmButton>
                        </div>
                      ) : <span className="text-mute">{m.predictionsOpen ? 'open' : 'closed'}</span>}
                    </td>
                    <td>
                      <div className="flex flex-col gap-1">
                        <Link to={`/live/${m.number}`}><Button size="sm" variant="outline">Operate →</Button></Link>
                        {edit && <Button size="sm" variant="ghost" onClick={() => act(() => server.setMatchOfDay(state.settings.matchOfDay === m.id ? undefined : m.id), 'Match of the Day updated.')}>{state.settings.matchOfDay === m.id ? '★ MOTD' : '☆ MOTD'}</Button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function toLocalInput(iso: string) {
  // Morocco is UTC+1: present the time in tournament local time
  const d = new Date(new Date(iso).getTime() + 60 * 60_000);
  return d.toISOString().slice(0, 16);
}
function fromLocalInput(v: string) {
  if (!v) return undefined;
  return new Date(`${v}:00+01:00`).toISOString();
}

function ReportsTab() {
  const { state, me, server, squad, user } = useTournament();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [decision, setDecision] = useState<Record<string, { text: string; penalty: PenaltyType | 'none'; squadId: string }>>({});
  const [pen, setPen] = useState({ squadId: '', type: 'warning' as PenaltyType, reason: '' });
  const checker = can(me, 'report.review');
  const sup = can(me, 'report.decide');
  const announcer = can(me, 'announce');
  const approved = state.squads.filter((q) => q.status === 'approved');

  return (
    <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
      <Card>
        <SectionTitle icon="🚨">Reports queue</SectionTitle>
        {state.reports.length === 0 ? <Empty icon="🕊️">No reports filed.</Empty> : (
          <div className="space-y-3">
            {state.reports.map((r) => {
              const d = decision[r.id] ?? { text: '', penalty: 'none' as const, squadId: r.targetSquadId ?? '' };
              return (
                <div key={r.id} className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b>{r.target} <span className="font-normal text-mute">· {CATEGORY_LABEL[r.category]}</span></b>
                    <Badge tone={REPORT_STATUS[r.status].tone}>{REPORT_STATUS[r.status].label}</Badge>
                  </div>
                  <div className="text-xs text-mute">by {r.reporterName} · {fmtDateTime(r.createdAt)}{r.matchNumber && ` · match #${r.matchNumber}`}{r.uid && ` · UID ${r.uid}`}{r.targetSquadId && ` · ${squad(r.targetSquadId)?.name}`}</div>
                  <p className="mt-2 whitespace-pre-wrap">{r.explanation}</p>
                  <div className="mt-1 text-xs">Evidence: {r.evidence.startsWith('data:image') ? <img src={r.evidence} alt="evidence" className="mt-1 max-h-40 rounded" /> : <a href={r.evidence} target="_blank" rel="noreferrer noopener" className="break-all text-sky-300 underline">{r.evidence}</a>}</div>
                  {r.checkerNotes && <div className="mt-2 rounded bg-sky-500/10 p-2 text-xs">🛡️ Checker ({user(r.checkerId)?.name}): {r.checkerNotes}</div>}
                  {r.decision && <div className="mt-2 rounded bg-purple-500/10 p-2 text-xs">👁️ Decision: {r.decision} {r.penalty && r.penalty !== 'none' && <b>· {r.penalty}</b>}</div>}

                  {checker && (r.status === 'submitted' || r.status === 'checker_review') && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <input className={cx(inputCls, 'flex-1 py-1.5')} placeholder="Evidence review notes" value={notes[r.id] ?? ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                      <Button size="sm" variant="ghost" disabled={!notes[r.id]} onClick={() => act(() => server.checkerReview(r.id, notes[r.id], true), 'Forwarded to Supervisor.')}>Forward to Supervisor</Button>
                      <ConfirmButton title="Dismiss report?" message="Dismiss for insufficient or invalid evidence." confirmLabel="Dismiss" disabled={!notes[r.id]} onConfirm={() => act(() => server.checkerReview(r.id, notes[r.id], false), 'Report dismissed.')}>Dismiss</ConfirmButton>
                    </div>
                  )}
                  {sup && r.status === 'investigation' && (
                    <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
                      <input className={cx(inputCls, 'py-1.5')} placeholder="Final decision" value={d.text} onChange={(e) => setDecision({ ...decision, [r.id]: { ...d, text: e.target.value } })} />
                      <select className={cx(inputCls, 'py-1.5')} value={d.penalty} onChange={(e) => setDecision({ ...decision, [r.id]: { ...d, penalty: e.target.value as PenaltyType | 'none' } })}>
                        <option value="none">No penalty</option><option value="warning">Official warning</option><option value="match_dq">Match DQ</option><option value="tournament_dq">Tournament DQ</option>
                      </select>
                      <select className={cx(inputCls, 'py-1.5')} value={d.squadId} onChange={(e) => setDecision({ ...decision, [r.id]: { ...d, squadId: e.target.value } })}>
                        <option value="">Squad…</option>{approved.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
                      </select>
                      <ConfirmButton variant="gold" title="Issue final decision?" message={<>Supervisor decisions are final. {d.penalty === 'tournament_dq' && <b className="text-red-300">The squad will be disqualified from the tournament.</b>}</>} confirmLabel="Confirm decision" onConfirm={() => act(() => server.supervisorDecide(r.id, d.text, d.penalty, d.squadId || undefined), 'Decision recorded.')}>Decide</ConfirmButton>
                    </div>
                  )}
                  {announcer && r.status === 'decided' && <Button size="sm" className="mt-3" variant="ghost" onClick={() => act(() => server.announceReport(r.id), 'Outcome announced.')}>📢 Announce outcome</Button>}
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <div className="space-y-6">
        <Card>
          <SectionTitle icon="⚖️">Issue penalty</SectionTitle>
          {!can(me, 'penalty.issue') ? <p className="text-sm text-mute">Only the Supervisor can issue official penalties.</p> : (
            <div className="space-y-2">
              <select className={inputCls} value={pen.squadId} onChange={(e) => setPen({ ...pen, squadId: e.target.value })}><option value="">Squad…</option>{approved.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}</select>
              <select className={inputCls} value={pen.type} onChange={(e) => setPen({ ...pen, type: e.target.value as PenaltyType })}><option value="warning">1. Official warning</option><option value="match_dq">2. Match disqualification</option><option value="tournament_dq">3. Tournament disqualification</option></select>
              <input className={inputCls} placeholder="Reason" value={pen.reason} onChange={(e) => setPen({ ...pen, reason: e.target.value })} />
              <ConfirmButton size="md" title="Issue penalty?" message="Penalties are public on the squad profile and logged." confirmLabel="Issue" disabled={!pen.squadId || !pen.reason} onConfirm={() => act(() => server.issuePenalty(pen.squadId, pen.type, pen.reason), 'Penalty issued.')}>Issue penalty</ConfirmButton>
            </div>
          )}
        </Card>
        <Card>
          <SectionTitle icon="📒">Penalty register</SectionTitle>
          {state.penalties.length === 0 ? <p className="text-sm text-mute">No penalties.</p> : state.penalties.map((p) => (
            <div key={p.id} className="border-t border-white/5 py-2 text-xs"><b>{squad(p.squadId)?.name}</b> · {p.type} — {p.reason}<div className="text-mute">{user(p.issuedBy)?.name} · {fmtDateTime(p.at)}</div></div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function DhdTab() {
  const { state, me, server, squad, user } = useTournament();
  const [min, setMin] = useState(state.settings.minStake);
  const [max, setMax] = useState(state.settings.maxStake);
  const [filter, setFilter] = useState('');
  const pm = can(me, 'predictions.manage');
  const rm = can(me, 'rewards.manage');
  const txs = [...state.txs].reverse().filter((t) => !filter || user(t.userId)?.discord.includes(filter) || t.kind.includes(filter)).slice(0, 150);
  const final = state.matches.find((m) => m.stage === 'final');
  const killer = topKillers(state)[0];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <SectionTitle icon="🎚️">Stake limits</SectionTitle>
          <div className="flex items-end gap-2">
            <Field label="Min"><input type="number" className={inputCls} value={min} onChange={(e) => setMin(Number(e.target.value))} disabled={!pm} /></Field>
            <Field label="Max"><input type="number" className={inputCls} value={max} onChange={(e) => setMax(Number(e.target.value))} disabled={!pm} /></Field>
            <Button disabled={!pm} onClick={() => act(() => server.setStakeLimits(min, max), 'Stake limits saved.')}>Save</Button>
          </div>
        </Card>
        <Card>
          <SectionTitle icon="👑">Champion</SectionTitle>
          {state.championId ? <SquadChip squad={squad(state.championId)} /> : (
            <ConfirmButton variant="gold" size="md" disabled={!can(me, 'champion.declare') || final?.status !== 'completed'} title="Declare champion?" message={`Declare ${squad(final?.winner)?.name ?? 'the Grand Final winner'} the official champion and publish the champion announcement?`} confirmLabel="Declare" onConfirm={() => act(() => server.declareChampion(), 'Champion declared!')}>Declare champion</ConfirmButton>
          )}
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">🏆 500 MAD <Badge tone={state.prizeStatus.champion === 'paid' ? 'green' : 'yellow'}>{state.prizeStatus.champion}</Badge>{rm && state.prizeStatus.champion === 'pending' && <ConfirmButton size="sm" variant="ghost" disabled={!state.championId} title="Mark 500 MAD paid?" message="Confirm the 500 MAD prize was paid to the champion." onConfirm={() => act(() => server.markPrizePaid('champion'), 'Marked paid.')}>Mark paid</ConfirmButton>}</div>
            <div className="flex items-center justify-between">🎯 530 💎 {killer ? `(${killer.name})` : ''} <Badge tone={state.prizeStatus.topKiller === 'paid' ? 'green' : 'yellow'}>{state.prizeStatus.topKiller}</Badge>{rm && state.prizeStatus.topKiller === 'pending' && <ConfirmButton size="sm" variant="ghost" disabled={!state.championId} title="Mark 530 Diamonds paid?" message="Confirm the diamonds were delivered to the top killer." onConfirm={() => act(() => server.markPrizePaid('topKiller'), 'Marked paid.')}>Mark paid</ConfirmButton>}</div>
          </div>
        </Card>
        <Card>
          <SectionTitle icon="📊">Economy</SectionTitle>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-mute">Total wallets</span><b>{fmtNum(state.txs.reduce((a, t) => a + t.amount, 0))} DHD</b></div>
            <div className="flex justify-between"><span className="text-mute">Open stakes</span><b>{fmtNum(state.predictions.filter((p) => p.status === 'open').reduce((a, p) => a + p.stake, 0))} DHD</b></div>
            <div className="flex justify-between"><span className="text-mute">Victory bonuses</span><b>{fmtNum(state.rewards.reduce((a, r) => a + r.amount, 0))} DHD</b></div>
            <div className="flex justify-between"><span className="text-mute">Transactions</span><b>{state.txs.length}</b></div>
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle icon="⚔️">Victory bonus payouts (200 DHD / win)</SectionTitle>
        {state.rewards.length === 0 ? <Empty>No verified victories yet.</Empty> : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {state.rewards.map((r) => {
              const m = state.matches.find((x) => x.id === r.matchId);
              return (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-black/30 px-3 py-2 text-xs">
                  <SquadChip squad={squad(r.squadId)} size={18} link={false} />
                  <span className="text-mute">#{m?.number}</span>
                  {r.status === 'paid' ? <Badge tone="green">paid</Badge> : rm ? <Button size="sm" variant="ghost" onClick={() => act(() => server.markRewardPaid(r.id), 'Reward marked paid.')}>Mark paid</Button> : <Badge tone="yellow">pending</Badge>}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle icon="🧾" right={<input className={cx(inputCls, 'w-48 py-1')} placeholder="Filter user / kind" value={filter} onChange={(e) => setFilter(e.target.value)} />}>Transaction ledger</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead><tr className="text-left text-mute"><th className="py-1">Time</th><th>User</th><th>Kind</th><th className="text-right">Amount</th><th>Memo</th><th>Idempotency key</th></tr></thead>
            <tbody>
              {txs.map((t) => (
                <tr key={t.id} className="border-t border-white/5">
                  <td className="py-1 text-mute">{fmtDateTime(t.createdAt)}</td><td>{user(t.userId)?.discord}</td><td><Badge>{t.kind}</Badge></td>
                  <td className={cx('text-right font-mono', t.amount >= 0 ? 'text-emerald-300' : 'text-red-300')}>{t.amount > 0 ? '+' : ''}{t.amount}</td>
                  <td>{t.memo}</td><td className="font-mono text-mute">{t.idemKey.slice(0, 28)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const CAT_LABEL: Record<AnnouncementCategory, string> = {
  registration: '📝 Registration', draw: '🎲 Group draw', schedule: '🗓️ Match schedule', match_start: '🔴 Match starting', room: '🔐 Room information',
  qualified: '🟢 Qualified squads', eliminated: '🔴 Eliminated squads', investigation: '🛡️ Investigation result', prize: '💰 Prizes', final: '🏆 Grand Final', champion: '👑 Champion', general: '📢 General',
};

function template(cat: AnnouncementCategory, s: TournamentState): { title: string; body: string } {
  const name = (id?: string) => s.squads.find((q) => q.id === id)?.name ?? 'TBD';
  const next = s.matches.filter((m) => m.a && m.b && (m.status === 'upcoming' || m.status === 'ready')).sort((a, b) => a.date.localeCompare(b.date))[0];
  const tables = GROUPS.map((g) => computeGroup(s, g));
  switch (cat) {
    case 'registration': return { title: '📝 REGISTRATION IS OPEN!', body: `Squad captains — register your squad now! 16 slots only.\n• 3 starters + 1 substitute\n• Registration closes November 24\n• Staff approval required` };
    case 'draw': return { title: '🎲 OFFICIAL GROUP DRAW RESULTS', body: GROUPS.map((g) => `**Group ${g}:** ${s.groups[g].map(name).join(' · ') || 'TBD'}`).join('\n') };
    case 'schedule': {
      const ms = s.matches.filter((m) => m.day === (next?.day ?? 1));
      return { title: `🗓️ MATCH SCHEDULE — DAY ${next?.day ?? 1}`, body: ms.map((m) => `#${m.number} ${fmtDateTime(m.date)} — ${name(m.a)} vs ${name(m.b)} (${m.map})`).join('\n') };
    }
    case 'match_start': return { title: `🔴 MATCH #${next?.number ?? '?'} IS STARTING`, body: `${name(next?.a)} VS ${name(next?.b)}\n🗺️ ${next?.map}\nCatch it live in the Match Center and lock your DHD predictions before kickoff!` };
    case 'room': return { title: '🔐 ROOM INFORMATION SENT', body: `Captains of the next match: your room ID and password are now available on the Match Center (squad members only). Join on time!` };
    case 'qualified': return { title: '🟢 QUALIFIED FOR THE KNOCKOUTS', body: tables.map((t) => `**Group ${t.group}:** ${t.rows.filter((r) => r.status === 'knockout' || r.status === 'qualified').map((r) => name(r.squadId)).join(', ') || '—'}`).join('\n') };
    case 'eliminated': return { title: '🔴 ELIMINATED SQUADS', body: tables.map((t) => `**Group ${t.group}:** ${t.rows.filter((r) => r.status === 'eliminated').map((r) => name(r.squadId)).join(', ') || '—'}`).join('\n') + '\nThank you for competing! 🇲🇦' };
    case 'investigation': return { title: '🛡️ INVESTIGATION RESULT', body: 'After review by the Cheat Checker team and the Supervisor, the decision is: …' };
    case 'prize': return { title: '💰 PRIZES', body: '🏆 Champion: 500 MAD\n⚔️ Every verified match victory: 200 DHD\n🎯 Top Killer: 530 Diamonds' };
    case 'final': {
      const f = s.matches.find((m) => m.stage === 'final');
      return { title: '🏆 THE GRAND FINAL', body: `${name(f?.a)} VS ${name(f?.b)}\n📅 ${f ? fmtDateTime(f.date) : 'December 2'}\nONE MATCH. ONE CROWN.` };
    }
    case 'champion': return { title: `👑 ${name(s.championId)} — CHAMPIONS OF MOROCCO`, body: 'ONE TOURNAMENT. SIXTEEN SQUADS. ONE CROWN. 🇲🇦' };
    default: return { title: '', body: '' };
  }
}

export function discordFormat(title: string, body: string) {
  return `## ${title}\n${body}\n\n> 🏆 **FREE FIRE: MOROCCAN SQUAD CLASH** 🇲🇦`;
}

function AnnounceTab() {
  const { state, me, server, user } = useTournament();
  const [cat, setCat] = useState<AnnouncementCategory>('general');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const allowed = can(me, 'announce');
  const copy = (t: string, b: string) => copyText(discordFormat(t, b))?.then(() => pushToast('ok', 'Copied in Discord format.'), () => pushToast('err', 'Clipboard blocked by browser.'));
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <Card>
        <SectionTitle icon="✍️">Compose</SectionTitle>
        {!allowed && <DemoNotice>Publishing requires the Administrator or Supervisor role.</DemoNotice>}
        <div className="space-y-3">
          <Field label="Type">
            <select className={inputCls} value={cat} onChange={(e) => { const c = e.target.value as AnnouncementCategory; setCat(c); const t = template(c, state); if (t.title) { setTitle(t.title); setBody(t.body); } }}>
              {Object.entries(CAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Title"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Message"><textarea className={inputCls} rows={8} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
          <div className="rounded-lg border border-white/10 bg-[#313338] p-3 font-mono text-xs whitespace-pre-wrap text-white/90">{discordFormat(title || 'Title', body || 'Message')}</div>
          <div className="flex gap-2">
            <Button disabled={!allowed} onClick={async () => { if (await attempt(() => server.publishAnnouncement(cat, title, body), 'Announcement published.')) { setTitle(''); setBody(''); } }}>Publish</Button>
            <Button variant="ghost" onClick={() => copy(title, body)}>📋 Copy for Discord</Button>
          </div>
        </div>
      </Card>
      <Card>
        <SectionTitle icon="📢">Announcement center</SectionTitle>
        <div className="space-y-3">
          {state.announcements.map((a) => (
            <div key={a.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>{a.title}</b>
                <div className="flex gap-1">
                  <Badge>{CAT_LABEL[a.category]}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => copy(a.title, a.body)}>📋</Button>
                  {allowed && <ConfirmButton title="Delete announcement?" message="This removes the announcement from the site." confirmLabel="Delete" onConfirm={() => act(() => server.deleteAnnouncement(a.id), 'Deleted.')}>🗑</ConfirmButton>}
                </div>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-white/80">{a.body}</p>
              <div className="mt-1 text-[11px] text-mute">{user(a.authorId)?.name} · {fmtDateTime(a.at)}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function SiteTextTab() {
  const { state, me, server } = useTournament();
  const allowed = can(me, 'staff.manage');
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('home');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const current = (k: string) => state.content?.[k] ?? TEXT_DEFAULTS[k].value;
  const keys = Object.keys(TEXT_DEFAULTS).filter((k) =>
    q ? (TEXT_DEFAULTS[k].label + ' ' + current(k)).toLowerCase().includes(q.toLowerCase()) : k.split('.')[0] === group,
  );
  const customCount = Object.keys(state.content ?? {}).length;

  const save = async (k: string) => {
    const v = drafts[k];
    if (v === undefined) return;
    const value = v.trim() === TEXT_DEFAULTS[k].value.trim() ? null : v;
    if (await attempt(() => server.setContent(k, value), 'Text saved — everyone sees it now.')) {
      setDrafts((d) => { const n = { ...d }; delete n[k]; return n; });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-gold/30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <b>Change any wording on the site.</b> <span className="text-mute">Edit here, or turn on <b>✏️ Edit site text</b> in the sidebar and click text directly on any page.</span>
            <div className="mt-1 text-xs text-mute">Tips: <code className="text-gold">**word**</code> highlights a word · lists take one item per line · {customCount} text{customCount === 1 ? '' : 's'} changed from default.</div>
          </div>
          <input className={cx(inputCls, 'w-64')} placeholder="Search all text…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!allowed && <p className="mt-2 text-xs text-amber-200">Only administrators can change site text.</p>}
      </Card>
      {!q && (
        <div className="flex gap-1 overflow-x-auto pb-1">
          {TEXT_GROUPS.map((g) => (
            <button key={g.id} onClick={() => setGroup(g.id)} className={cx('whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-semibold', group === g.id ? 'border-gold bg-gold/15 text-gold' : 'border-white/10 text-mute hover:text-white')}>
              {g.label}
            </button>
          ))}
        </div>
      )}
      {keys.length === 0 ? <Empty>No text matches “{q}”.</Empty> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {keys.map((k) => {
            const def = TEXT_DEFAULTS[k];
            const custom = state.content?.[k] !== undefined;
            const value = drafts[k] ?? current(k);
            const dirty = drafts[k] !== undefined && drafts[k] !== current(k);
            return (
              <Card key={k} className={cx(custom && 'border-gold/30')}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{def.label}</span>
                  {custom ? <Badge tone="gold">edited</Badge> : <Badge>default</Badge>}
                </div>
                <textarea
                  className={inputCls}
                  disabled={!allowed}
                  rows={def.list ? Math.min(12, value.split('\n').length + 1) : Math.min(5, Math.ceil(value.length / 60) + 1)}
                  value={value}
                  onChange={(e) => setDrafts((d) => ({ ...d, [k]: e.target.value }))}
                  maxLength={5000}
                />
                <div className="mt-2 flex justify-end gap-2">
                  {dirty && <Button size="sm" variant="ghost" onClick={() => setDrafts((d) => { const n = { ...d }; delete n[k]; return n; })}>Undo</Button>}
                  {custom && !dirty && (
                    <ConfirmButton size="sm" variant="ghost" title="Restore the original text?" message={<span className="whitespace-pre-wrap">{def.value}</span>} confirmLabel="Restore" disabled={!allowed} onConfirm={() => act(() => server.setContent(k, null), 'Back to default text.')}>↺ Default</ConfirmButton>
                  )}
                  <Button size="sm" variant="gold" disabled={!allowed || !dirty || !value.trim()} onClick={() => save(k)}>Save</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StaffTab() {
  const { state, me, server } = useTournament();
  const allowed = can(me, 'staff.manage');
  const roles: Role[] = ['admin', 'supervisor', 'hoster', 'cheat_checker', 'counter', 'commentator', 'captain', 'viewer'];
  return (
    <div className="space-y-6">
    <StaffInvites />
    <Card>
      <SectionTitle icon="👥">All accounts &amp; roles</SectionTitle>
      {!allowed && <DemoNotice>Only administrators can change roles.</DemoNotice>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-xs">
          <thead><tr className="text-left text-mute"><th className="py-2">Account</th>{roles.map((r) => <th key={r} className="text-center">{ROLE_META[r].icon}<br />{ROLE_META[r].label}</th>)}</tr></thead>
          <tbody>
            {state.users.filter((u) => !u.id.startsWith('u_bot')).map((u) => (
              <tr key={u.id} className="border-t border-white/5">
                <td className="py-2"><b>{u.name}</b><div className="text-mute">{u.discord}</div></td>
                {roles.map((r) => (
                  <td key={r} className="text-center">
                    <input type="checkbox" disabled={!allowed} checked={u.roles.includes(r)} onChange={(e) => act(() => server.setRoles(u.id, e.target.checked ? [...u.roles, r] : u.roles.filter((x) => x !== r)), 'Roles updated.')} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
    </div>
  );
}

const STAFF_ROLES: Role[] = ['admin', 'supervisor', 'hoster', 'cheat_checker', 'counter', 'commentator'];

/** Give the staff team access by email; they get their roles when they sign in with that email. */
function StaffInvites() {
  const { state, me, server, mode } = useTournament();
  const allowed = can(me, 'staff.manage');
  const [email, setEmail] = useState('');
  const [picked, setPicked] = useState<Role[]>(['hoster']);
  const staff = [...(state.staff ?? [])].sort((a, b) => Number(b.roles.includes('admin')) - Number(a.roles.includes('admin')) || a.email.localeCompare(b.email));
  const toggle = (r: Role) => setPicked((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));

  const invite = async () => {
    const res = await act(() => server.inviteStaff(email, picked));
    if (res) {
      pushToast('ok', res === 'applied' ? `${email.trim()} has staff access now.` : `Invite saved — ${email.trim()} gets access when they sign in with this email.`);
      setEmail('');
    }
  };

  return (
    <Card className="border-gold/30">
      <SectionTitle icon="✉️">Staff access by email</SectionTitle>
      <p className="mb-4 text-sm text-mute">
        Type a staff member's email and choose their roles. They sign in on this website with that email (a sign-in link is emailed to them) and get their access automatically. You can change or remove it at any time.
      </p>
      {mode === 'demo' && <DemoNotice>Demo mode has no real email accounts: invites are saved here so you can try the screen. Real sign-in works once Supabase is connected.</DemoNotice>}
      {allowed ? (
        <div className="mb-5 rounded-xl border border-white/10 bg-black/30 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <Field label="Email"><input type="email" className={inputCls} placeholder="staff.member@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Button variant="gold" disabled={!email.trim() || picked.length === 0} onClick={invite}>Give access</Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {STAFF_ROLES.map((r) => (
              <button key={r} onClick={() => toggle(r)} className={cx('rounded-lg border px-3 py-1.5 text-xs font-semibold transition', picked.includes(r) ? 'border-gold bg-gold/15 text-gold' : 'border-white/10 text-mute hover:text-white')}>
                {ROLE_META[r].icon} {ROLE_META[r].label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-mute">{picked.map((r) => `${ROLE_META[r].label}: ${ROLE_META[r].duties.slice(0, 2).join(', ').toLowerCase()}`).join(' · ') || 'Pick at least one role.'}</p>
        </div>
      ) : <DemoNotice>Only administrators can give staff access.</DemoNotice>}

      {staff.length === 0 ? <Empty icon="✉️">No staff invited by email yet.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-mute"><th className="py-2">Email</th><th>Roles</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.email} className="border-t border-white/5">
                  <td className="py-2"><b>{s.email}</b>{s.name && <div className="text-xs text-mute">{s.name}</div>}</td>
                  <td><div className="flex flex-wrap gap-1">{s.roles.map((r) => <Badge key={r} tone={r === 'admin' ? 'gold' : 'slate'}>{ROLE_META[r]?.icon} {ROLE_META[r]?.label ?? r}</Badge>)}</div></td>
                  <td>{s.signedUp ? <Badge tone="green">✅ Active</Badge> : <Badge tone="yellow">⏳ Waiting for first sign-in</Badge>}</td>
                  <td className="text-right">
                    {allowed && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setEmail(s.email); setPicked(s.roles.filter((r) => STAFF_ROLES.includes(r))); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Change</Button>
                        {s.userId !== me.id && (
                          <ConfirmButton size="sm" title={`Remove staff access for ${s.email}?`} message="They keep a normal account but lose every staff role immediately. You can invite them again later." confirmLabel="Remove access" onConfirm={() => act(() => server.removeStaff(s.email), 'Staff access removed.')}>Remove</ConfirmButton>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function SettingsTab() {
  const { state, me, server } = useTournament();
  const allowed = can(me, 'staff.manage');
  const [sr, setSr] = useState(state.settings.sniperRule);
  const [laptops, setLaptops] = useState(state.settings.maxLaptops);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <SectionTitle icon="🔭">Sniper restriction (configurable)</SectionTitle>
        <p className="mb-3 text-xs text-amber-200">The exact wording must be confirmed by the organisers before publication. Until “confirmed” is ticked, the Rules page shows it as pending.</p>
        <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={sr.enabled} onChange={(e) => setSr({ ...sr, enabled: e.target.checked })} disabled={!allowed} /> Rule enabled</label>
        <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={sr.confirmed} onChange={(e) => setSr({ ...sr, confirmed: e.target.checked })} disabled={!allowed} /> Wording confirmed for publication</label>
        <textarea className={inputCls} rows={4} value={sr.text} onChange={(e) => setSr({ ...sr, text: e.target.value })} disabled={!allowed} />
        <Button className="mt-3" disabled={!allowed} onClick={() => act(() => server.updateSettings({ sniperRule: sr }), 'Sniper rule saved.')}>Save</Button>
      </Card>
      <Card>
        <SectionTitle icon="⚙️">Tournament settings</SectionTitle>
        <div className="space-y-3">
          <Field label="Max laptops per squad"><input type="number" min={0} className={inputCls} value={laptops} onChange={(e) => setLaptops(Number(e.target.value))} disabled={!allowed} /></Field>
          <Button disabled={!allowed} onClick={() => act(() => server.updateSettings({ maxLaptops: laptops }), 'Saved.')}>Save</Button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={state.settings.enforceRegistrationWindow} disabled={!allowed} onChange={(e) => act(() => server.updateSettings({ enforceRegistrationWindow: e.target.checked }), 'Saved.')} />
            Enforce registration window (Nov 22–24)
          </label>
        </div>
      </Card>
    </div>
  );
}

function AuditTab() {
  const { state, me, user } = useTournament();
  const [q, setQ] = useState('');
  if (!can(me, 'audit.view')) return <Empty icon="🔒">Audit log is visible to administrators and supervisors.</Empty>;
  const rows = state.audit.filter((a) => !q || a.action.includes(q) || a.detail.toLowerCase().includes(q.toLowerCase())).slice(0, 300);
  return (
    <Card>
      <SectionTitle icon="🧾" right={<input className={cx(inputCls, 'w-56 py-1')} placeholder="Search log…" value={q} onChange={(e) => setQ(e.target.value)} />}>Audit log</SectionTitle>
      {rows.length === 0 ? <Empty>No actions logged yet.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead><tr className="text-left text-mute"><th className="py-1">Time</th><th>Actor</th><th>Action</th><th>Detail</th></tr></thead>
            <tbody>{rows.map((a) => (
              <tr key={a.id} className="border-t border-white/5"><td className="py-1 whitespace-nowrap text-mute">{fmtDateTime(a.at)}</td><td>{user(a.actorId)?.name ?? a.actorId}</td><td><Badge>{a.action}</Badge></td><td>{a.detail}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
