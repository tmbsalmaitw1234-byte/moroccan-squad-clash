import { GroupId, Match, Source } from '../types';
import { TZ } from './util';

export const TOURNAMENT = {
  name: 'FREE FIRE: MOROCCAN SQUAD CLASH',
  short: 'Moroccan Squad Clash',
  game: 'Free Fire',
  format: '3 VS 3 Squad League + Knockout',
  maxSquads: 16,
  registrationOpens: `2026-11-22T00:00:00${TZ}`,
  registrationCloses: `2026-11-24T23:59:59${TZ}`,
  drawAt: `2026-11-24T21:00:00${TZ}`,
  tournamentStart: `2026-11-25T18:00:00${TZ}`,
  grandFinal: `2026-12-02T21:00:00${TZ}`,
  prizes: { champion: '500 MAD', victory: 200, topKiller: '530 Diamonds' },
};

export const MAPS = ['Bermuda', 'Bermuda Remastered'];

export interface DayPlan {
  day: number;
  date: string;
  title: string;
  stage: 'group' | 'qf' | 'sf' | 'final';
  count: number;
  times: string[];
}

export const CALENDAR: DayPlan[] = [
  { day: 1, date: '2026-11-25', title: 'Group Stage – Round 1', stage: 'group', count: 5, times: ['18:00', '18:50', '19:40', '20:30', '21:20'] },
  { day: 2, date: '2026-11-26', title: 'Group Stage – Round 2', stage: 'group', count: 5, times: ['18:00', '18:50', '19:40', '20:30', '21:20'] },
  { day: 3, date: '2026-11-27', title: 'Group Stage – Round 3', stage: 'group', count: 5, times: ['18:00', '18:50', '19:40', '20:30', '21:20'] },
  { day: 4, date: '2026-11-28', title: 'Group Stage – Round 4', stage: 'group', count: 5, times: ['18:00', '18:50', '19:40', '20:30', '21:20'] },
  { day: 5, date: '2026-11-29', title: 'Group Stage – Final Round', stage: 'group', count: 4, times: ['18:00', '18:50', '19:40', '20:30'] },
  { day: 6, date: '2026-11-30', title: 'Quarter-finals', stage: 'qf', count: 4, times: ['19:00', '19:50', '20:40', '21:30'] },
  { day: 7, date: '2026-12-01', title: 'Semi-finals', stage: 'sf', count: 2, times: ['19:30', '20:45'] },
  { day: 8, date: '2026-12-02', title: 'GRAND FINAL', stage: 'final', count: 1, times: ['21:00'] },
];

const ROUND_PAIRS: [number, number][][] = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
];

function shell(partial: Partial<Match> & Pick<Match, 'id' | 'number' | 'label' | 'stage' | 'day' | 'date' | 'srcA' | 'srcB' | 'map'>): Match {
  return {
    status: 'upcoming',
    readyA: false,
    readyB: false,
    kills: {},
    predictionsOpen: true,
    settled: false,
    highlights: [],
    ...partial,
  };
}

/** Builds the 32 official fixtures. Group fixtures reference draw slots until groups are locked. */
export function buildFixtures(): Match[] {
  const seq: { g: GroupId; r: number; p: [number, number] }[] = [];
  ROUND_PAIRS.forEach((pairs, r) => {
    (['A', 'B', 'C', 'D'] as GroupId[]).forEach((g) => pairs.forEach((p) => seq.push({ g, r: r + 1, p })));
  });

  const matches: Match[] = [];
  let n = 0;
  let cursor = 0;
  for (const d of CALENDAR.filter((c) => c.stage === 'group')) {
    for (let i = 0; i < d.count; i++) {
      const f = seq[cursor++];
      n++;
      matches.push(
        shell({
          id: `m${n}`,
          number: n,
          label: `Group ${f.g} · R${f.r}`,
          stage: 'group',
          group: f.g,
          round: f.r,
          day: d.day,
          date: `${d.date}T${d.times[i]}:00${TZ}`,
          srcA: { type: 'slot', group: f.g, slot: f.p[0] },
          srcB: { type: 'slot', group: f.g, slot: f.p[1] },
          map: MAPS[n % 2],
        }),
      );
    }
  }

  const ko: { label: string; stage: Match['stage']; day: number; a: Source; b: Source }[] = [
    { label: 'QF1', stage: 'qf', day: 6, a: { type: 'group', group: 'A', pos: 1 }, b: { type: 'group', group: 'B', pos: 2 } },
    { label: 'QF2', stage: 'qf', day: 6, a: { type: 'group', group: 'B', pos: 1 }, b: { type: 'group', group: 'A', pos: 2 } },
    { label: 'QF3', stage: 'qf', day: 6, a: { type: 'group', group: 'C', pos: 1 }, b: { type: 'group', group: 'D', pos: 2 } },
    { label: 'QF4', stage: 'qf', day: 6, a: { type: 'group', group: 'D', pos: 1 }, b: { type: 'group', group: 'C', pos: 2 } },
    { label: 'SF1', stage: 'sf', day: 7, a: { type: 'winner', label: 'QF1' }, b: { type: 'winner', label: 'QF3' } },
    { label: 'SF2', stage: 'sf', day: 7, a: { type: 'winner', label: 'QF2' }, b: { type: 'winner', label: 'QF4' } },
    { label: 'GRAND FINAL', stage: 'final', day: 8, a: { type: 'winner', label: 'SF1' }, b: { type: 'winner', label: 'SF2' } },
  ];
  const perDayIdx: Record<number, number> = {};
  for (const k of ko) {
    n++;
    const d = CALENDAR[k.day - 1];
    const i = (perDayIdx[k.day] = (perDayIdx[k.day] ?? -1) + 1);
    matches.push(
      shell({
        id: `m${n}`,
        number: n,
        label: k.label,
        stage: k.stage,
        day: k.day,
        date: `${d.date}T${d.times[i]}:00${TZ}`,
        srcA: k.a,
        srcB: k.b,
        map: k.stage === 'final' ? 'Bermuda' : MAPS[n % 2],
      }),
    );
  }
  return matches;
}

export function sourceLabel(src: Source): string {
  switch (src.type) {
    case 'slot':
      return `Group ${src.group} · Slot ${src.slot + 1}`;
    case 'group':
      return `${src.pos === 1 ? '1st' : '2nd'} Group ${src.group}`;
    case 'winner':
      return `Winner ${src.label}`;
    default:
      return 'TBD';
  }
}

export const STAGE_LABEL: Record<Match['stage'], string> = {
  group: 'Group Stage',
  tiebreak: 'Deciding Match',
  qf: 'Quarter-final',
  sf: 'Semi-final',
  final: 'Grand Final',
};
