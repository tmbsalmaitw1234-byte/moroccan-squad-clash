import { useTournament } from '../store';
import { ROLE_META, ROLE_PERMS } from '../engine/permissions';
import { Role } from '../types';
import { Editable, PageHeaderT, rich, useText } from '../content/Text';
import { Badge, Card, SectionTitle } from '../components/ui';

const STAFF_ROLES: Role[] = ['admin', 'supervisor', 'hoster', 'cheat_checker', 'counter', 'commentator'];

export default function Staff() {
  const { state } = useTournament();
  const text = useText();
  return (
    <div className="space-y-6">
      <PageHeaderT page="staff" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {STAFF_ROLES.map((r) => {
          const meta = ROLE_META[r];
          const members = state.users.filter((u) => u.roles.includes(r));
          return (
            <Card key={r} className="relative overflow-hidden">
              <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-25 blur-2xl" style={{ background: meta.color }} />
              <div className="relative">
                <div className="flex items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-xl text-2xl" style={{ background: `${meta.color}22`, border: `1px solid ${meta.color}55` }}>{meta.icon}</div>
                  <div>
                    <div className="font-display text-xl font-bold uppercase">{meta.label}</div>
                    <div className="text-xs text-mute">{members.map((m) => m.name).join(', ') || 'Unassigned'}</div>
                  </div>
                </div>
                <ul className="mt-4 space-y-1 text-sm text-white/85">{meta.duties.map((d) => <li key={d}>• {d}</li>)}</ul>
                <div className="mt-3 flex flex-wrap gap-1">{ROLE_PERMS[r].slice(0, 8).map((p) => <Badge key={p}>{p}</Badge>)}{ROLE_PERMS[r].length > 8 && <Badge>+{ROLE_PERMS[r].length - 8}</Badge>}</div>
              </div>
            </Card>
          );
        })}
      </div>
      <Card>
        <SectionTitle icon="🧭">Separation of duties</SectionTitle>
        <Editable k="staff.duties" block>
          <ul className="grid gap-2 text-sm md:grid-cols-2">
            {text.lines('staff.duties').map((l, i) => <li key={i} className="rounded-lg bg-black/30 p-3">{rich(l, 'font-bold text-white')}</li>)}
          </ul>
        </Editable>
      </Card>
    </div>
  );
}
