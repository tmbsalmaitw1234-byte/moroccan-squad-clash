import { Link } from 'react-router-dom';
import { useTournament } from '../store';
import { Badge, Card, cx, SectionTitle } from '../components/ui';
import { Editable, PageHeaderT, rich, Txt, useText } from '../content/Text';

const PENALTY_TONES = [
  'border-yellow-400/30 bg-yellow-400/5',
  'border-orange-400/30 bg-orange-400/5',
  'border-red-500/40 bg-red-500/10',
];

export default function Rules() {
  const { state } = useTournament();
  const text = useText();
  const sr = state.settings.sniperRule;
  const equipment = text.lines('rules.equipment', { laptops: state.settings.maxLaptops });

  return (
    <div className="space-y-6">
      <PageHeaderT page="rules" />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <SectionTitle icon="📜">Official rules</SectionTitle>
          <Editable k="rules.official" block>
            <ol className="space-y-2">
              {text.lines('rules.official').map((r, i) => (
                <li key={i} className="flex gap-3 rounded-lg bg-black/30 px-3 py-2 text-sm">
                  <span className="font-display text-lg font-bold text-mred-2">{String(i + 1).padStart(2, '0')}</span>
                  <span className="pt-0.5">{rich(r)}</span>
                </li>
              ))}
            </ol>
          </Editable>
        </Card>
        <div className="space-y-6">
          <Card>
            <SectionTitle icon="🎮">Equipment rules</SectionTitle>
            <Editable k="rules.equipment" block>
              <ul className="space-y-2 text-sm">
                {equipment.slice(0, 2).map((l, i) => <li key={i} className="rounded-lg bg-black/30 px-3 py-2">{rich(l, 'font-bold text-white')}</li>)}
              </ul>
            </Editable>
            {sr.enabled && (
              <div className="mt-2 rounded-lg bg-black/30 px-3 py-2 text-sm">
                🔭 <b>Sniper restriction:</b> {sr.text}
                {!sr.confirmed && <div className="mt-1"><Badge tone="yellow">Pending final confirmation by organisers</Badge></div>}
                <div className="mt-1 text-[11px] text-mute">Edited in Admin → Settings</div>
              </div>
            )}
            {equipment.length > 2 && (
              <Editable k="rules.equipment" block className="mt-2">
                <ul className="space-y-2 text-sm">
                  {equipment.slice(2).map((l, i) => <li key={i} className="rounded-lg bg-black/30 px-3 py-2">{rich(l, 'font-bold text-white')}</li>)}
                </ul>
              </Editable>
            )}
          </Card>
          <Card>
            <SectionTitle icon="⚖️">Points & tie-breakers</SectionTitle>
            <Editable k="rules.points" block>
              <ul className="space-y-1 text-sm text-white/85">
                {text.lines('rules.points').map((l, i) => <li key={i}>• {rich(l)}</li>)}
              </ul>
            </Editable>
          </Card>
          <Card className="border-red-500/30">
            <SectionTitle icon="🚩">Penalties</SectionTitle>
            <Editable k="rules.penalties" block>
              <ol className="space-y-2 text-sm">
                {text.lines('rules.penalties').map((l, i) => (
                  <li key={i} className={cx('rounded-lg border px-3 py-2', PENALTY_TONES[Math.min(i, PENALTY_TONES.length - 1)])}>{i + 1}. {rich(l)}</li>
                ))}
              </ol>
            </Editable>
            <p className="mt-3 text-xs text-mute"><Txt k="rules.penaltyNote" /> <Link to="/report" className="text-mred-2 underline">Report a violation →</Link></p>
          </Card>
        </div>
      </div>
    </div>
  );
}
