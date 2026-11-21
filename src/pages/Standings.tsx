import { useTournament } from '../store';
import { groupMatches } from '../engine/logic';
import { GROUPS } from '../types';
import { Badge, Card, Empty } from '../components/ui';
import { PageHeaderT } from '../content/Text';
import { MatchCard, ROW_STATUS, StandingsTable } from '../components/match';

export default function Standings() {
  const { state } = useTournament();
  return (
    <div className="space-y-6">
      <PageHeaderT page="standings" />
      <div className="flex flex-wrap gap-2">
        {Object.values(ROW_STATUS).map((s) => <Badge key={s.label} tone={s.tone}>{s.icon} {s.label}</Badge>)}
      </div>
      {!state.groupsLocked ? (
        <Empty icon="🎲">Standings go live once the group draw is locked.</Empty>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {GROUPS.map((g) => {
            const ms = groupMatches(state, g);
            const done = ms.filter((m) => m.status === 'completed').length;
            return (
              <Card key={g}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-display text-2xl font-bold uppercase">Group <span className="text-mred-2">{g}</span></h2>
                  <Badge>{done}/6 played</Badge>
                </div>
                <StandingsTable g={g} />
                <details className="mt-4">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-mute hover:text-white">Group fixtures</summary>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {ms.map((m) => <MatchCard key={m.id} m={m} compact />)}
                    {state.matches.filter((m) => m.stage === 'tiebreak' && m.group === g).map((m) => <MatchCard key={m.id} m={m} compact />)}
                  </div>
                </details>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
