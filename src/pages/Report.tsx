import { useState } from 'react';
import { act, useTournament } from '../store';
import { ReportCategory } from '../types';
import { fmtDateTime } from '../engine/util';
import { Editable, PageHeaderT, rich, useText } from '../content/Text';
import { Badge, Button, Card, Field, inputCls, SectionTitle } from '../components/ui';

export const CATEGORY_LABEL: Record<ReportCategory, string> = {
  cheating: 'Suspected cheating',
  unauthorized_player: 'Unauthorized players',
  incorrect_uid: 'Incorrect UID',
  rule_violation: 'Rule violations',
  room_problem: 'Room problems',
  incorrect_result: 'Incorrect results',
  unfair_behavior: 'Unfair behavior',
};

export const REPORT_STATUS: Record<string, { label: string; tone: 'slate' | 'yellow' | 'blue' | 'purple' | 'green' | 'red' }> = {
  submitted: { label: 'Submitted', tone: 'slate' },
  checker_review: { label: 'Evidence review', tone: 'blue' },
  investigation: { label: 'Supervisor investigation', tone: 'purple' },
  decided: { label: 'Decision made', tone: 'yellow' },
  announced: { label: 'Outcome announced', tone: 'green' },
  dismissed: { label: 'Dismissed', tone: 'red' },
};

export default function ReportPage() {
  const { state, me, server } = useTournament();
  const text = useText();
  const [f, setF] = useState({ target: '', targetSquadId: '', uid: '', matchNumber: '', when: new Date().toISOString().slice(0, 16), category: 'cheating' as ReportCategory, explanation: '', evidence: '' });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const mine = state.reports.filter((r) => r.reporterId === me.id);
  const approved = state.squads.filter((q) => q.status === 'approved');

  const onFile = (file?: File) => {
    if (!file) return;
    if (file.size > 250_000) { alert('In demo mode, attach images under 250 KB or paste a video link.'); return; }
    const r = new FileReader();
    r.onload = () => set({ evidence: String(r.result) });
    r.readAsDataURL(file);
  };

  const submit = async () => {
    const id = await act(() => server.submitReport({
      target: f.target, targetSquadId: f.targetSquadId || undefined, uid: f.uid, matchNumber: f.matchNumber ? Number(f.matchNumber) : undefined,
      when: new Date(f.when).toISOString(), category: f.category, explanation: f.explanation, evidence: f.evidence,
    }), 'Report submitted — a Cheat Checker will review the evidence.');
    if (id) set({ target: '', uid: '', explanation: '', evidence: '', matchNumber: '', targetSquadId: '' });
  };

  return (
    <div className="space-y-6">
      <PageHeaderT page="report" />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <SectionTitle icon="🚨">Official report form</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Reporter username"><input className={inputCls} value={me.discord} disabled /></Field>
            <Field label="Violation type">
              <select className={inputCls} value={f.category} onChange={(e) => set({ category: e.target.value as ReportCategory })}>
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Reported player / squad"><input className={inputCls} value={f.target} onChange={(e) => set({ target: e.target.value })} placeholder="IGN or squad name" /></Field>
            <Field label="Squad (optional)">
              <select className={inputCls} value={f.targetSquadId} onChange={(e) => set({ targetSquadId: e.target.value })}>
                <option value="">—</option>
                {approved.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
              </select>
            </Field>
            <Field label="Player UID"><input className={inputCls} value={f.uid} onChange={(e) => set({ uid: e.target.value.replace(/\D/g, '') })} placeholder="if known" /></Field>
            <Field label="Match number">
              <select className={inputCls} value={f.matchNumber} onChange={(e) => set({ matchNumber: e.target.value })}>
                <option value="">—</option>
                {state.matches.map((m) => <option key={m.id} value={m.number}>#{m.number} {m.label}</option>)}
              </select>
            </Field>
            <Field label="Date & time"><input type="datetime-local" className={inputCls} value={f.when} onChange={(e) => set({ when: e.target.value })} /></Field>
            <Field label="Evidence (screenshot or video link)">
              <input className={inputCls} value={f.evidence.startsWith('data:') ? 'Screenshot attached ✓' : f.evidence} onChange={(e) => set({ evidence: e.target.value })} placeholder="https://… video link" />
              <input type="file" accept="image/*" className="mt-2 text-xs text-mute file:mr-2 file:rounded-md file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-white" onChange={(e) => onFile(e.target.files?.[0])} />
            </Field>
            <Field label="Explanation" className="md:col-span-2" hint={`${f.explanation.length}/30 characters minimum`}>
              <textarea className={inputCls} rows={5} value={f.explanation} onChange={(e) => set({ explanation: e.target.value })} placeholder="Describe clearly what happened, when, and what the evidence shows." />
            </Field>
          </div>
          <Button className="mt-4" size="lg" onClick={submit}>Submit report</Button>
        </Card>

        <div className="space-y-6">
          <Card>
            <SectionTitle icon="📏">Report rules</SectionTitle>
            <Editable k="report.rules" block>
              <ul className="space-y-1 text-sm text-white/85">
                {text.lines('report.rules').map((l, i) => <li key={i}>{rich(l)}</li>)}
              </ul>
            </Editable>
          </Card>
          <Card>
            <SectionTitle icon="🔎">Investigation process</SectionTitle>
            <ol className="space-y-2 text-sm">
              <Editable k="report.process" block className="space-y-2">
                {text.lines('report.process').map((s, i) => (
                  <li key={i} className="flex items-center gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-mred/30 font-display font-bold">{i + 1}</span><span>{rich(s)}</span></li>
                ))}
              </Editable>
            </ol>
          </Card>
          <Card>
            <SectionTitle icon="📂">My reports</SectionTitle>
            {mine.length === 0 ? <p className="text-sm text-mute">None submitted.</p> : mine.map((r) => (
              <div key={r.id} className="mb-2 rounded-lg bg-black/30 p-3 text-sm">
                <div className="flex justify-between gap-2"><b>{r.target}</b><Badge tone={REPORT_STATUS[r.status].tone}>{REPORT_STATUS[r.status].label}</Badge></div>
                <div className="text-xs text-mute">{CATEGORY_LABEL[r.category]} · {fmtDateTime(r.createdAt)}</div>
                {r.status === 'announced' && r.decision && <div className="mt-1 text-xs">Outcome: {r.decision}</div>}
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
