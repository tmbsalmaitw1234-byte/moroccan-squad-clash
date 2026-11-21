import { GroupId, GROUPS, Match, Source, TournamentState, User } from '../types';
import { sum } from './util';

/* ───────────── Group standings ───────────── */

export type RowStatus = 'qualified' | 'competing' | 'eliminated' | 'knockout' | 'tiebreak';

export interface StandingRow {
  squadId: string;
  played: number;
  wins: number;
  losses: number;
  points: number;
  remaining: number;
  kills: number;
  status: RowStatus;
  tied: boolean;
  dq: boolean;
}

export interface GroupTable {
  group: GroupId;
  rows: StandingRow[];
  complete: boolean;
  cutResolved: boolean;
  tiedAtCut: string[];
}

const isDone = (m: Match) => m.status === 'completed' && !!m.winner;

export function groupMatches(s: TournamentState, g: GroupId) {
  return s.matches.filter((m) => m.stage === 'group' && m.group === g);
}

export function computeGroup(s: TournamentState, g: GroupId): GroupTable {
  const ids = s.groups[g];
  const ms = groupMatches(s, g);
  const tbs = s.matches.filter((m) => m.stage === 'tiebreak' && m.group === g && isDone(m));
  const dq = new Set(s.squads.filter((q) => q.disqualified).map((q) => q.id));

  const base = ids.map((id) => {
    const mine = ms.filter((m) => m.a === id || m.b === id);
    const done = mine.filter(isDone);
    const wins = done.filter((m) => m.winner === id).length;
    const kills = sum(
      done.map((m) => {
        const sq = s.squads.find((q) => q.id === id);
        return sum((sq?.players ?? []).map((p) => m.kills[p.id] ?? 0));
      }),
    );
    return {
      squadId: id,
      played: done.length,
      wins,
      losses: done.length - wins,
      points: wins * 3,
      remaining: mine.filter((m) => m.status !== 'completed' && m.status !== 'cancelled').length,
      kills,
      status: 'competing' as RowStatus,
      tied: false,
      dq: dq.has(id),
    };
  });

  // Recursive tie-break: points → head-to-head mini league → deciding-match wins → unresolved
  const h2hPts = (id: string, among: string[]) =>
    ms.filter((m) => isDone(m) && m.winner === id && among.includes(m.a!) && among.includes(m.b!)).length * 3;
  const tbWins = (id: string, among: string[]) =>
    tbs.filter((m) => m.winner === id && among.includes(m.a!) && among.includes(m.b!)).length;

  type R = (typeof base)[number];
  const partition = (rows: R[], key: (r: R) => number): R[][] => {
    const map = new Map<number, R[]>();
    rows.forEach((r) => map.set(key(r), [...(map.get(key(r)) ?? []), r]));
    return [...map.entries()].sort((a, b) => b[0] - a[0]).map((e) => e[1]);
  };

  const ordered: R[] = [];
  const active = base.filter((r) => !r.dq);
  for (const byPts of partition(active, (r) => r.points)) {
    if (byPts.length === 1) { ordered.push(byPts[0]); continue; }
    const among = byPts.map((r) => r.squadId);
    for (const byH2h of partition(byPts, (r) => h2hPts(r.squadId, among))) {
      if (byH2h.length === 1) { ordered.push(byH2h[0]); continue; }
      const among2 = byH2h.map((r) => r.squadId);
      for (const byTb of partition(byH2h, (r) => tbWins(r.squadId, among2))) {
        if (byTb.length > 1) byTb.forEach((r) => (r.tied = true));
        ordered.push(...byTb.sort((a, b) => b.kills - a.kills));
      }
    }
  }
  ordered.push(...base.filter((r) => r.dq));

  const complete = ids.length === 4 && ms.length > 0 && ms.every((m) => m.status === 'completed' || m.status === 'cancelled');

  // Is the cut between position 2 and 3 ambiguous?
  let tiedAtCut: string[] = [];
  if (ordered[1]?.tied && ordered[2]?.tied && ordered[1].points === ordered[2].points) {
    tiedAtCut = ordered.filter((r) => r.tied && r.points === ordered[1].points && !r.dq).map((r) => r.squadId);
  }
  const cutResolved = tiedAtCut.length === 0;

  ordered.forEach((r, i) => {
    if (r.dq) { r.status = 'eliminated'; return; }
    if (complete) {
      if (tiedAtCut.includes(r.squadId)) r.status = 'tiebreak';
      else r.status = i < 2 ? 'knockout' : 'eliminated';
      return;
    }
    const max = r.points + r.remaining * 3;
    const others = ordered.filter((o) => o !== r && !o.dq);
    const canCatch = others.filter((o) => o.points + o.remaining * 3 >= r.points).length;
    const ahead = others.filter((o) => o.points > max).length;
    if (r.played > 0 && canCatch <= 1) r.status = 'qualified';
    else if (ahead >= 2) r.status = 'eliminated';
    else r.status = 'competing';
  });

  return { group: g, rows: ordered, complete, cutResolved, tiedAtCut };
}

export function groupQualifier(s: TournamentState, g: GroupId, pos: 1 | 2): string | undefined {
  const t = computeGroup(s, g);
  if (!t.complete || !t.cutResolved) return undefined;
  return t.rows[pos - 1]?.squadId;
}

/* ───────────── Bracket resolution ───────────── */

function resolveSource(s: TournamentState, src: Source): string | undefined {
  switch (src.type) {
    case 'slot':
      return s.groupsLocked ? s.groups[src.group][src.slot] : undefined;
    case 'group':
      return groupQualifier(s, src.group, src.pos);
    case 'winner': {
      const m = s.matches.find((x) => x.label === src.label);
      return m && isDone(m) ? m.winner : undefined;
    }
    default:
      return undefined;
  }
}

/** Fills participants for every fixture whose sources are known. Mutates state. */
export function resolveParticipants(s: TournamentState) {
  // Several passes so group → QF → SF → Final cascades in one call.
  for (let pass = 0; pass < 4; pass++) {
    for (const m of s.matches) {
      if (m.status !== 'upcoming' && m.status !== 'ready') continue;
      if (m.srcA.type === 'fixed') continue;
      const a = resolveSource(s, m.srcA);
      const b = resolveSource(s, m.srcB);
      if (a !== m.a || b !== m.b) {
        m.a = a;
        m.b = b;
        m.readyA = false;
        m.readyB = false;
        if (m.status === 'ready') m.status = 'upcoming';
      }
    }
  }
}

/* ───────────── Phase ───────────── */

export type Phase = 'registration' | 'draw' | 'groups' | 'knockouts' | 'final' | 'finished';

export function currentPhase(s: TournamentState): Phase {
  if (s.championId) return 'finished';
  if (!s.groupsLocked) return s.squads.filter((q) => q.status === 'approved').length >= 16 ? 'draw' : 'registration';
  const groupDone = GROUPS.every((g) => computeGroup(s, g).complete && computeGroup(s, g).cutResolved);
  if (!groupDone) return 'groups';
  const final = s.matches.find((m) => m.stage === 'final');
  if (final && (final.a || final.b)) return 'final';
  return 'knockouts';
}

export const PHASE_LABEL: Record<Phase, string> = {
  registration: 'Registration',
  draw: 'Group Draw',
  groups: 'Group Stage',
  knockouts: 'Knockout Stage',
  final: 'Grand Final',
  finished: 'Champions Crowned',
};

/* ───────────── Prediction pools (pari-mutuel) ───────────── */

export interface Pool {
  a: number;
  b: number;
  total: number;
  countA: number;
  countB: number;
  participants: number;
  pctA: number;
  pctB: number;
}

export function matchPool(s: TournamentState, m: Match): Pool {
  const ps = s.predictions.filter((p) => p.matchId === m.id && p.status !== 'refunded');
  const a = sum(ps.filter((p) => p.pick === m.a).map((p) => p.stake));
  const b = sum(ps.filter((p) => p.pick === m.b).map((p) => p.stake));
  const total = a + b;
  return {
    a,
    b,
    total,
    countA: ps.filter((p) => p.pick === m.a).length,
    countB: ps.filter((p) => p.pick === m.b).length,
    participants: new Set(ps.map((p) => p.userId)).size,
    pctA: total ? Math.round((a / total) * 100) : 50,
    pctB: total ? 100 - Math.round((a / total) * 100) : 50,
  };
}

/** Payout if `stake` on side with current pool `same` wins against `other`. Stake returned + proportional share of the losing pool. */
export function potentialPayout(stake: number, same: number, other: number) {
  if (stake <= 0) return 0;
  return stake + Math.floor((stake * other) / (same + stake));
}

export function predictionsOpenFor(m: Match): { open: boolean; reason?: string } {
  if (!m.a || !m.b) return { open: false, reason: 'Squads not decided yet' };
  if (m.status === 'cancelled') return { open: false, reason: 'Match cancelled' };
  if (m.status !== 'upcoming' && m.status !== 'ready') return { open: false, reason: 'Locked — match has started' };
  if (!m.predictionsOpen) return { open: false, reason: 'Closed by administrators' };
  if (Date.now() >= new Date(m.date).getTime()) return { open: false, reason: 'Locked — scheduled start time reached' };
  return { open: true };
}

/* ───────────── Wallet & leaderboards ───────────── */

export function balanceOf(s: TournamentState, userId: string) {
  return sum(s.txs.filter((t) => t.userId === userId).map((t) => t.amount));
}

export interface KillerRow {
  playerId: string;
  name: string;
  squadId: string;
  kills: number;
  matches: number;
  avg: number;
}

export function topKillers(s: TournamentState): KillerRow[] {
  const rows = new Map<string, KillerRow>();
  for (const m of s.matches.filter(isDone)) {
    for (const [pid, k] of Object.entries(m.kills)) {
      const sq = s.squads.find((q) => q.players.some((p) => p.id === pid));
      const pl = sq?.players.find((p) => p.id === pid);
      if (!sq || !pl) continue;
      const r = rows.get(pid) ?? { playerId: pid, name: pl.ign, squadId: sq.id, kills: 0, matches: 0, avg: 0 };
      r.kills += k;
      r.matches += 1;
      rows.set(pid, r);
    }
  }
  return [...rows.values()]
    .map((r) => ({ ...r, avg: r.matches ? Math.round((r.kills / r.matches) * 10) / 10 : 0 }))
    .sort((a, b) => b.kills - a.kills || a.matches - b.matches || a.name.localeCompare(b.name));
}

export function squadRecord(s: TournamentState, squadId: string) {
  const done = s.matches.filter((m) => isDone(m) && (m.a === squadId || m.b === squadId));
  const wins = done.filter((m) => m.winner === squadId).length;
  const sq = s.squads.find((q) => q.id === squadId);
  const kills = sum(done.map((m) => sum((sq?.players ?? []).map((p) => m.kills[p.id] ?? 0))));
  const dhd = sum(s.rewards.filter((r) => r.squadId === squadId).map((r) => r.amount));
  return { played: done.length, wins, losses: done.length - wins, kills, dhd };
}

export function predictorStats(s: TournamentState, u: User) {
  const ps = s.predictions.filter((p) => p.userId === u.id);
  const spent = sum(ps.filter((p) => p.status !== 'refunded').map((p) => p.stake));
  const won = sum(ps.filter((p) => p.status === 'won').map((p) => p.payout));
  const settled = ps.filter((p) => p.status === 'won' || p.status === 'lost');
  const net = won - sum(settled.map((p) => p.stake));
  const correct = ps.filter((p) => p.status === 'won').length;
  const biggest = Math.max(0, ...ps.filter((p) => p.status === 'won').map((p) => p.payout - p.stake));
  return { count: ps.length, spent, won, net, correct, settled: settled.length, biggest };
}

export function squadEliminated(s: TournamentState, squadId: string) {
  const q = s.squads.find((x) => x.id === squadId);
  if (q?.disqualified) return true;
  if (s.matches.some((m) => m.stage !== 'group' && m.stage !== 'tiebreak' && isDone(m) && (m.a === squadId || m.b === squadId) && m.winner !== squadId)) return true;
  if (!s.groupsLocked) return false;
  const g = GROUPS.find((x) => s.groups[x].includes(squadId));
  if (!g) return false;
  return computeGroup(s, g).rows.find((r) => r.squadId === squadId)?.status === 'eliminated';
}
