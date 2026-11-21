/**
 * DEMO SERVER
 * ------------------------------------------------------------------
 * Every state change in the app goes through one of the actions below.
 * Each action checks the acting user's role, validates input, writes an
 * audit entry and persists the result — mirroring the RPC functions in
 * supabase/schema.sql.
 *
 * In demo mode this runs inside the browser and stores data in
 * localStorage, so it is NOT tamper-proof: anyone can edit their own
 * browser storage. Real security requires the Supabase backend, where the
 * same checks run in Postgres functions under Row Level Security.
 */
import {
  AnnouncementCategory, EventKind, GroupId, GROUPS, Match, PenaltyType, Player, Report, ReportCategory, Role,
  Squad, TournamentState, Tx, User,
} from '../types';
import { TOURNAMENT } from './config';
import { balanceOf, computeGroup, matchPool, predictionsOpenFor, resolveParticipants } from './logic';
import { can, Permission } from './permissions';
import { makeSquad, RESERVE_SQUAD, seedState } from './seed';
import { nowIso, rng, shuffle, uid } from './util';
import type { Backend, Snapshot } from './backend';
import { ServerError } from './errors';

const KEY = 'msc_state_v1';
const SESSION_KEY = 'msc_session_v1';

export { ServerError };

type Listener = () => void;

function load(): TournamentState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as TournamentState;
      if (s.version === 1) return s;
    }
  } catch { /* ignore corrupt storage */ }
  return seedState();
}

export class DemoServer implements Backend {
  readonly mode = 'demo' as const;
  private s: TournamentState = load();
  private sessionId: string = (() => {
    try { return localStorage.getItem(SESSION_KEY) || 'u_fan'; } catch { return 'u_fan'; }
  })();
  private listeners = new Set<Listener>();
  private snapshot: Snapshot = this.snap();

  private snap(): Snapshot {
    return { state: this.s, me: this.findUser(this.sessionId), mode: 'demo', status: 'ready', authed: true };
  }

  constructor() {
    resolveParticipants(this.s);
    this.snapshot = this.snap();
    window.addEventListener('storage', (e) => {
      if (e.key === KEY) { this.s = load(); this.publish(false); }
    });
  }

  private findUser(id: string): User {
    return this.s.users.find((u) => u.id === id) ?? this.s.users.find((u) => u.id === 'u_fan')!;
  }

  subscribe = (l: Listener) => { this.listeners.add(l); return () => this.listeners.delete(l); };
  getSnapshot = () => this.snapshot;

  private quiet = false;

  private publish(persist = true) {
    if (this.quiet) return;
    if (persist) {
      try { localStorage.setItem(KEY, JSON.stringify(this.s)); }
      catch { /* storage full or blocked — state stays in memory */ }
    }
    this.snapshot = this.snap();
    this.listeners.forEach((l) => l());
  }

  /** Runs an action on a copy of the state; commits only if it succeeds (atomic). */
  private exec<T>(action: string, fn: (s: TournamentState, me: User) => { detail: string; result?: T }, actorId = this.sessionId): T | undefined {
    const draft: TournamentState = structuredClone(this.s);
    const me = draft.users.find((u) => u.id === actorId);
    if (!me) throw new ServerError('Not signed in');
    const { detail, result } = fn(draft, me);
    resolveParticipants(draft);
    draft.audit.unshift({ id: uid('log'), at: nowIso(), actorId: me.id, action, detail });
    if (draft.audit.length > 800) draft.audit.length = 800;
    this.s = draft;
    this.publish();
    return result;
  }

  private require(me: User, p: Permission) {
    if (!can(me, p)) throw new ServerError(`Permission denied: your role cannot perform "${p}".`);
  }

  private match(s: TournamentState, id: string) {
    const m = s.matches.find((x) => x.id === id);
    if (!m) throw new ServerError('Match not found');
    return m;
  }

  private squadName(s: TournamentState, id?: string) {
    return s.squads.find((q) => q.id === id)?.name ?? 'TBD';
  }

  private ledger(s: TournamentState, tx: Omit<Tx, 'id' | 'createdAt'>) {
    if (s.txs.some((t) => t.idemKey === tx.idemKey)) throw new ServerError('Duplicate transaction blocked');
    s.txs.push({ ...tx, id: uid('tx'), createdAt: nowIso() });
  }

  private sysEvent(s: TournamentState, matchId: string, kind: EventKind, text: string, authorId = 'system') {
    s.events.push({ id: uid('ev'), matchId, authorId, kind, text, at: nowIso() });
  }

  /* ───────── Session (demo identity switcher) ───────── */

  signInAs(userId: string) {
    if (!this.s.users.some((u) => u.id === userId)) throw new ServerError('Unknown account');
    this.sessionId = userId;
    try { localStorage.setItem(SESSION_KEY, userId); } catch { /* ignore */ }
    this.publish(false);
  }

  /* ───────── Registration ───────── */

  registerSquad(input: { name: string; tag: string; logo?: string; captainDiscord: string; players: Omit<Player, 'id'>[]; rulesAccepted: boolean }) {
    return this.exec('registration.submit', (s, me) => {
      const now = Date.now();
      if (s.settings.enforceRegistrationWindow &&
        (now < new Date(TOURNAMENT.registrationOpens).getTime() || now > new Date(TOURNAMENT.registrationCloses).getTime())) {
        throw new ServerError('Registration is closed (Nov 22–24, 2026).');
      }
      if (s.groupsLocked) throw new ServerError('Groups are locked — registration is closed.');
      if (!input.rulesAccepted) throw new ServerError('All members must confirm they have read the rules.');
      const name = input.name.trim();
      if (name.length < 3 || name.length > 28) throw new ServerError('Squad name must be 3–28 characters.');
      if (s.squads.some((q) => q.status !== 'rejected' && q.name.toLowerCase() === name.toLowerCase())) throw new ServerError('Squad name already taken.');
      if (s.squads.filter((q) => q.status === 'approved').length >= TOURNAMENT.maxSquads) throw new ServerError('All 16 squad slots are filled.');
      if (s.squads.some((q) => q.ownerUserId === me.id && q.status !== 'rejected')) throw new ServerError('You already have an active registration.');
      const ps = input.players;
      if (ps.length !== 4) throw new ServerError('Exactly 4 players required.');
      if (ps.filter((p) => p.slot === 'starter').length !== 3) throw new ServerError('Exactly 3 starters required.');
      if (ps.filter((p) => p.slot === 'sub').length !== 1) throw new ServerError('Exactly 1 substitute required.');
      if (ps.filter((p) => p.isCaptain).length !== 1) throw new ServerError('Select exactly one captain.');
      for (const p of ps) {
        if (!/^\d{8,12}$/.test(p.uid)) throw new ServerError(`Invalid Free Fire UID "${p.uid}" — 8–12 digits.`);
        if (!p.discord.trim() || !p.ffUsername.trim() || !p.ign.trim()) throw new ServerError('All player fields are required.');
      }
      const uids = ps.map((p) => p.uid);
      if (new Set(uids).size !== uids.length) throw new ServerError('Duplicate UID inside your squad.');
      const taken = new Set(s.squads.filter((q) => q.status !== 'rejected').flatMap((q) => q.players.map((p) => p.uid)));
      const dup = uids.find((u) => taken.has(u));
      if (dup) throw new ServerError(`UID ${dup} is already registered with another squad.`);
      if (input.logo && input.logo.length > 300_000) throw new ServerError('Logo too large (max ~200 KB).');

      const id = uid('sq');
      const squad: Squad = {
        id,
        name,
        tag: input.tag.trim().toUpperCase().slice(0, 4) || name.slice(0, 3).toUpperCase(),
        color: `hsl(${Math.floor(Math.random() * 360)} 75% 55%)`,
        logo: input.logo,
        captainDiscord: input.captainDiscord.trim(),
        players: ps.map((p, i) => ({ ...p, id: `${id}_p${i + 1}` })),
        status: 'pending',
        createdAt: nowIso(),
        ownerUserId: me.id,
      };
      s.squads.push(squad);
      if (!me.roles.includes('captain')) me.roles.push('captain');
      return { detail: `Registered squad "${name}" (pending approval)`, result: id };
    });
  }

  reviewSquad(id: string, decision: 'approved' | 'rejected', reason?: string) {
    this.exec('registration.review', (s, me) => {
      this.require(me, 'registration.review');
      const q = s.squads.find((x) => x.id === id);
      if (!q) throw new ServerError('Squad not found');
      if (s.groupsLocked) throw new ServerError('Groups are locked.');
      if (decision === 'approved') {
        if (s.squads.filter((x) => x.status === 'approved').length >= 16) throw new ServerError('16 squads already approved.');
        q.status = 'approved';
        q.rejectReason = undefined;
        const used = new Set(s.squads.map((x) => x.number).filter(Boolean));
        q.number = q.number ?? [...Array(16)].map((_, i) => i + 1).find((n) => !used.has(n));
        const owner = s.users.find((u) => u.id === q.ownerUserId);
        if (owner) owner.squadId = q.id;
      } else {
        q.status = 'rejected';
        q.rejectReason = reason || 'Registration did not meet the requirements.';
        q.number = undefined;
      }
      return { detail: `${decision === 'approved' ? 'Approved' : 'Rejected'} "${q.name}"${reason ? ` — ${reason}` : ''}` };
    });
  }

  editSquad(id: string, patch: Partial<Pick<Squad, 'name' | 'tag' | 'number' | 'captainDiscord' | 'color'>>) {
    this.exec('squad.edit', (s, me) => {
      this.require(me, 'squad.edit');
      const q = s.squads.find((x) => x.id === id);
      if (!q) throw new ServerError('Squad not found');
      if (patch.number !== undefined) {
        if (patch.number < 1 || patch.number > 16) throw new ServerError('Squad number must be 1–16.');
        const clash = s.squads.find((x) => x.id !== id && x.number === patch.number && x.status === 'approved');
        if (clash) throw new ServerError(`Number ${patch.number} is already used by ${clash.name}.`);
      }
      Object.assign(q, patch);
      return { detail: `Edited squad "${q.name}": ${JSON.stringify(patch)}` };
    });
  }

  setSquadEliminated(id: string, reason: string) {
    this.exec('squad.eliminate', (s, me) => {
      if (!can(me, 'penalty.issue') && !can(me, 'squad.edit')) throw new ServerError('Permission denied.');
      const q = s.squads.find((x) => x.id === id);
      if (!q) throw new ServerError('Squad not found');
      q.disqualified = true;
      return { detail: `Eliminated "${q.name}" — ${reason}` };
    });
  }

  /* ───────── Group draw ───────── */

  runDraw(seed?: number) {
    return this.exec('draw.run', (s, me) => {
      this.require(me, 'draw.run');
      if (s.groupsLocked) throw new ServerError('Groups are locked. Unlock first to redraw.');
      const approved = s.squads.filter((q) => q.status === 'approved' && !q.disqualified);
      if (approved.length !== 16) throw new ServerError(`Need exactly 16 approved squads (have ${approved.length}).`);
      const order = shuffle(approved.map((q) => q.id), seed !== undefined ? rng(seed) : Math.random);
      GROUPS.forEach((g, gi) => (s.groups[g] = order.filter((_, i) => i % 4 === gi)));
      s.drawDone = true;
      return { detail: `Group draw generated: ${GROUPS.map((g) => `${g}[${s.groups[g].map((id) => this.squadName(s, id)).join(', ')}]`).join(' ')}`, result: s.groups };
    });
  }

  swapInGroups(idA: string, idB: string) {
    this.exec('draw.swap', (s, me) => {
      this.require(me, 'draw.run');
      if (s.groupsLocked) throw new ServerError('Groups are locked.');
      const find = (id: string) => GROUPS.map((g) => [g, s.groups[g].indexOf(id)] as const).find(([, i]) => i >= 0);
      const fa = find(idA), fb = find(idB);
      if (!fa || !fb) throw new ServerError('Both squads must be drawn.');
      s.groups[fa[0]][fa[1]] = idB;
      s.groups[fb[0]][fb[1]] = idA;
      return { detail: `Swapped ${this.squadName(s, idA)} ↔ ${this.squadName(s, idB)}` };
    });
  }

  lockGroups(locked: boolean) {
    this.exec(locked ? 'draw.lock' : 'draw.unlock', (s, me) => {
      this.require(me, 'draw.run');
      if (locked) {
        if (!s.drawDone || GROUPS.some((g) => s.groups[g].length !== 4)) throw new ServerError('Run the draw first.');
        s.groupsLocked = true;
      } else {
        if (s.matches.some((m) => m.status !== 'upcoming' && m.status !== 'ready')) throw new ServerError('Matches have already been played — groups cannot be unlocked.');
        if (s.predictions.some((p) => p.status === 'open')) {
          // refund open predictions — participants will change
          for (const p of s.predictions.filter((x) => x.status === 'open')) {
            p.status = 'refunded';
            this.ledger(s, { userId: p.userId, amount: p.stake, kind: 'refund', ref: p.id, memo: 'Refund — groups unlocked', idemKey: `refund:${p.id}` });
          }
        }
        s.groupsLocked = false;
        s.matches.forEach((m) => { if (m.stage === 'group') { m.a = undefined; m.b = undefined; } });
      }
      return { detail: locked ? 'Groups locked — group-stage fixtures generated' : 'Groups unlocked by administrator' };
    });
  }

  /* ───────── Match management ───────── */

  editMatch(id: string, patch: Partial<Pick<Match, 'date' | 'map' | 'commentatorId' | 'supervisorId'>>) {
    this.exec('match.edit', (s, me) => {
      this.require(me, 'match.edit');
      const m = this.match(s, id);
      if (m.status === 'completed') throw new ServerError('Completed matches cannot be rescheduled.');
      Object.assign(m, patch);
      return { detail: `Edited match #${m.number}: ${JSON.stringify(patch)}` };
    });
  }

  setKoParticipants(id: string, a: string, b: string) {
    this.exec('bracket.override', (s, me) => {
      this.require(me, 'match.edit');
      const m = this.match(s, id);
      if (m.stage === 'group') throw new ServerError('Only knockout/deciding fixtures can be overridden.');
      if (m.status !== 'upcoming') throw new ServerError('Match already in progress.');
      if (a === b) throw new ServerError('Pick two different squads.');
      m.srcA = { type: 'fixed' }; m.srcB = { type: 'fixed' };
      m.a = a; m.b = b;
      return { detail: `Manually set #${m.number} ${m.label}: ${this.squadName(s, a)} vs ${this.squadName(s, b)}` };
    });
  }

  createTiebreak(group: GroupId, a: string, b: string) {
    this.exec('match.tiebreak', (s, me) => {
      this.require(me, 'match.edit');
      const t = computeGroup(s, group);
      if (!t.complete) throw new ServerError('Group stage for this group is not finished.');
      if (!t.tiedAtCut.includes(a) || !t.tiedAtCut.includes(b) || a === b) throw new ServerError('Both squads must be tied at the qualification line.');
      const n = Math.max(...s.matches.map((m) => m.number)) + 1;
      const day5 = s.matches.filter((m) => m.day === 5).sort((x, y) => y.date.localeCompare(x.date))[0];
      const date = new Date(new Date(day5.date).getTime() + 50 * 60_000 * (s.matches.filter((m) => m.stage === 'tiebreak').length + 1)).toISOString();
      s.matches.push({
        id: `m${n}`, number: n, label: `Group ${group} · Decider`, stage: 'tiebreak', group, day: 5, date,
        srcA: { type: 'fixed' }, srcB: { type: 'fixed' }, a, b, map: 'Bermuda', status: 'upcoming',
        readyA: false, readyB: false, kills: {}, predictionsOpen: true, settled: false, highlights: [],
        commentatorId: 'u_comm1', supervisorId: 'u_sup',
      });
      return { detail: `Created deciding match #${n}: ${this.squadName(s, a)} vs ${this.squadName(s, b)}` };
    });
  }

  setRoom(id: string, roomId: string, roomPass: string) {
    this.exec('room.set', (s, me) => {
      this.require(me, 'room.manage');
      const m = this.match(s, id);
      if (!m.a || !m.b) throw new ServerError('Squads not decided yet.');
      if (!/^\d{6,12}$/.test(roomId)) throw new ServerError('Room ID must be 6–12 digits.');
      if (roomPass.length < 3) throw new ServerError('Room password too short.');
      if (s.matches.some((x) => x.id !== id && x.roomId === roomId && x.status !== 'completed')) throw new ServerError('That Room ID is assigned to another active match — every matchup needs its own room.');
      m.roomId = roomId; m.roomPass = roomPass;
      if (m.readyA && m.readyB && m.status === 'upcoming') m.status = 'ready';
      return { detail: `Room set for match #${m.number}` };
    });
  }

  confirmReady(id: string) {
    this.exec('match.ready', (s, me) => {
      const m = this.match(s, id);
      const sq = s.squads.find((q) => q.id === me.squadId);
      if (!sq || !me.roles.includes('captain')) throw new ServerError('Only squad captains can confirm readiness.');
      if (sq.id !== m.a && sq.id !== m.b) throw new ServerError('Your squad is not in this match.');
      if (m.status !== 'upcoming' && m.status !== 'ready') throw new ServerError('Match already started.');
      if (sq.id === m.a) m.readyA = true; else m.readyB = true;
      if (m.readyA && m.readyB && m.roomId) m.status = 'ready';
      return { detail: `${sq.name} confirmed readiness for #${m.number}` };
    });
  }

  startMatch(id: string) {
    this.exec('match.start', (s, me) => {
      this.require(me, 'match.start');
      const m = this.match(s, id);
      if (m.status !== 'upcoming' && m.status !== 'ready') throw new ServerError(`Cannot start a match that is ${m.status}.`);
      if (!m.a || !m.b) throw new ServerError('Squads not decided.');
      if (!m.roomId) throw new ServerError('Add the custom room before starting.');
      m.status = 'live';
      m.startedAt = nowIso();
      this.sysEvent(s, m.id, 'system', `🔴 Match #${m.number} is LIVE — predictions locked.`);
      return { detail: `Started match #${m.number} (predictions locked)` };
    });
  }

  submitResult(id: string, winner: string, kills: Record<string, number>, mvp?: string) {
    this.exec('result.submit', (s, me) => {
      this.require(me, 'result.submit');
      const m = this.match(s, id);
      if (m.status !== 'live' && m.status !== 'review') throw new ServerError('Results can only be recorded for live matches.');
      if (winner !== m.a && winner !== m.b) throw new ServerError('Winner must be one of the two squads.');
      const allowed = new Set(s.squads.filter((q) => q.id === m.a || q.id === m.b).flatMap((q) => q.players.map((p) => p.id)));
      for (const [pid, k] of Object.entries(kills)) {
        if (!allowed.has(pid)) throw new ServerError('Kill entry for a player outside this match.');
        if (!Number.isInteger(k) || k < 0 || k > 60) throw new ServerError('Kills must be whole numbers 0–60.');
      }
      if (mvp && !allowed.has(mvp)) throw new ServerError('MVP must be a player in this match.');
      m.pending = { winner, kills, mvp, by: me.id, at: nowIso() };
      m.status = 'review';
      this.sysEvent(s, m.id, 'system', '🟡 Result submitted — under staff review.');
      return { detail: `Submitted result for #${m.number}: winner ${this.squadName(s, winner)}` };
    });
  }

  verifyResult(id: string) {
    this.exec('result.verify', (s, me) => {
      this.require(me, 'result.verify');
      const m = this.match(s, id);
      if (m.status !== 'review' || !m.pending) throw new ServerError('No result awaiting verification.');
      if (m.pending.by === me.id && !me.roles.includes('admin')) throw new ServerError('Four-eyes rule: a different staff member must verify this result.');
      if (m.settled) throw new ServerError('Match already settled.');
      m.winner = m.pending.winner;
      m.kills = m.pending.kills;
      m.mvp = m.pending.mvp;
      m.pending = undefined;
      m.status = 'completed';
      m.completedAt = nowIso();

      // Victory bonus — once per match (unique on matchId)
      if (!s.rewards.some((r) => r.matchId === m.id)) {
        s.rewards.push({ id: uid('rw'), squadId: m.winner, matchId: m.id, amount: s.settings.victoryReward, status: 'pending' });
      }
      this.settle(s, m);
      this.sysEvent(s, m.id, 'result', `🏁 OFFICIAL: ${this.squadName(s, m.winner)} win ${m.label}!`);
      return { detail: `Verified #${m.number}: ${this.squadName(s, m.winner)} defeated ${this.squadName(s, m.winner === m.a ? m.b : m.a)}` };
    });
  }

  rejectResult(id: string) {
    this.exec('result.reject', (s, me) => {
      this.require(me, 'result.verify');
      const m = this.match(s, id);
      if (m.status !== 'review') throw new ServerError('Nothing to reject.');
      m.pending = undefined;
      m.status = 'live';
      return { detail: `Rejected submitted result for #${m.number} — sent back to Counter` };
    });
  }

  cancelMatch(id: string, reason: string) {
    this.exec('match.cancel', (s, me) => {
      this.require(me, 'match.cancel');
      const m = this.match(s, id);
      if (m.status === 'completed') throw new ServerError('Completed matches cannot be cancelled.');
      m.status = 'cancelled';
      for (const p of s.predictions.filter((x) => x.matchId === m.id && x.status === 'open')) {
        p.status = 'refunded';
        this.ledger(s, { userId: p.userId, amount: p.stake, kind: 'refund', ref: p.id, memo: `Refund — match #${m.number} cancelled`, idemKey: `refund:${p.id}` });
      }
      m.settled = true;
      this.sysEvent(s, m.id, 'system', `⛔ Match cancelled: ${reason}. All DHD stakes refunded.`);
      return { detail: `Cancelled #${m.number}: ${reason}` };
    });
  }

  /** Pari-mutuel settlement. Idempotent via match.settled + per-prediction idempotency keys. */
  private settle(s: TournamentState, m: Match) {
    if (m.settled) return;
    const open = s.predictions.filter((p) => p.matchId === m.id && p.status === 'open');
    const pool = matchPool(s, m);
    const winPool = m.winner === m.a ? pool.a : pool.b;
    const losePool = pool.total - winPool;
    for (const p of open) {
      if (winPool === 0) {
        p.status = 'refunded';
        this.ledger(s, { userId: p.userId, amount: p.stake, kind: 'refund', ref: p.id, memo: `Refund — nobody predicted the winner of #${m.number}`, idemKey: `refund:${p.id}` });
      } else if (p.pick === m.winner) {
        p.status = 'won';
        p.payout = p.stake + Math.floor((p.stake * losePool) / winPool);
        this.ledger(s, { userId: p.userId, amount: p.payout, kind: 'payout', ref: p.id, memo: `Prediction won — match #${m.number}`, idemKey: `payout:${p.id}` });
      } else {
        p.status = 'lost';
        p.payout = 0;
      }
    }
    m.settled = true;
  }

  /* ───────── Commentary & chat ───────── */

  postEvent(matchId: string, kind: EventKind, text: string) {
    this.exec('commentary.post', (s, me) => {
      const m = this.match(s, matchId);
      if (!can(me, 'commentary.post')) throw new ServerError('Only commentators can publish commentary.');
      if (!me.roles.includes('admin') && m.commentatorId !== me.id) throw new ServerError('You are not the assigned commentator for this match.');
      if (!text.trim() || text.length > 400) throw new ServerError('Commentary must be 1–400 characters.');
      this.sysEvent(s, matchId, kind, text.trim(), me.id);
      return { detail: `Commentary on #${m.number}: ${kind}` };
    });
  }

  sendChat(matchId: string, text: string) {
    this.exec('chat.send', (s, me) => {
      const t = text.trim();
      if (!t || t.length > 200) throw new ServerError('Message must be 1–200 characters.');
      const recent = s.chat.filter((c) => c.userId === me.id && Date.now() - new Date(c.at).getTime() < 3000);
      if (recent.length) throw new ServerError('Slow mode: wait a few seconds.');
      s.chat.push({ id: uid('c'), matchId, userId: me.id, text: t, at: nowIso() });
      if (s.chat.length > 1500) s.chat.splice(0, s.chat.length - 1500);
      return { detail: `chat on ${matchId}` };
    });
  }

  addHighlight(matchId: string, url: string) {
    this.exec('match.highlight', (s, me) => {
      if (!can(me, 'commentary.post') && !can(me, 'match.edit')) throw new ServerError('Permission denied.');
      const m = this.match(s, matchId);
      if (!/^https?:\/\//.test(url) && !url.startsWith('data:image/')) throw new ServerError('Provide an http(s) link or an image.');
      m.highlights.push(url);
      return { detail: `Highlight added to #${m.number}` };
    });
  }

  /* ───────── DHD predictions ───────── */

  placePrediction(matchId: string, pick: string, stake: number, idemKey: string, actorId?: string) {
    return this.exec('prediction.place', (s, me) => {
      const m = this.match(s, matchId);
      const gate = predictionsOpenFor(m);
      if (!gate.open) throw new ServerError(gate.reason ?? 'Predictions closed.');
      if (pick !== m.a && pick !== m.b) throw new ServerError('Pick one of the two squads.');
      if (!Number.isInteger(stake)) throw new ServerError('Stake must be a whole number of DHD.');
      if (stake < s.settings.minStake) throw new ServerError(`Minimum stake is ${s.settings.minStake} DHD.`);
      if (stake > s.settings.maxStake) throw new ServerError(`Maximum stake is ${s.settings.maxStake} DHD per match.`);
      if (s.predictions.some((p) => p.userId === me.id && p.matchId === m.id && p.status !== 'refunded')) throw new ServerError('You already have a locked prediction on this match.');
      if (me.squadId && (me.squadId === m.a || me.squadId === m.b)) throw new ServerError('Players cannot predict on their own squad’s matches.');
      if (balanceOf(s, me.id) < stake) throw new ServerError('Insufficient DHD balance.');
      const id = uid('pr');
      this.ledger(s, { userId: me.id, amount: -stake, kind: 'stake', ref: id, memo: `Prediction stake — match #${m.number}`, idemKey: `stake:${idemKey}` });
      s.predictions.push({ id, userId: me.id, matchId, pick, stake, status: 'open', payout: 0, createdAt: nowIso() });
      return { detail: `Predicted ${this.squadName(s, pick)} with ${stake} DHD on #${m.number}`, result: id };
    }, actorId);
  }

  setPredictionsOpen(matchId: string, open: boolean) {
    this.exec('prediction.toggle', (s, me) => {
      this.require(me, 'predictions.manage');
      const m = this.match(s, matchId);
      m.predictionsOpen = open;
      return { detail: `${open ? 'Opened' : 'Closed'} predictions for #${m.number}` };
    });
  }

  cancelPredictions(matchId: string) {
    this.exec('prediction.cancel', (s, me) => {
      this.require(me, 'predictions.manage');
      const m = this.match(s, matchId);
      const open = s.predictions.filter((p) => p.matchId === matchId && p.status === 'open');
      for (const p of open) {
        p.status = 'refunded';
        this.ledger(s, { userId: p.userId, amount: p.stake, kind: 'refund', ref: p.id, memo: `Refund — predictions cancelled for #${m.number}`, idemKey: `refund:${p.id}` });
      }
      m.predictionsOpen = false;
      return { detail: `Cancelled ${open.length} predictions on #${m.number} (refunded)` };
    });
  }

  setStakeLimits(min: number, max: number) {
    this.exec('prediction.limits', (s, me) => {
      this.require(me, 'predictions.manage');
      if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min || max > 100_000) throw new ServerError('Invalid limits.');
      s.settings.minStake = min; s.settings.maxStake = max;
      return { detail: `Stake limits set to ${min}–${max} DHD` };
    });
  }

  /* ───────── Rewards ───────── */

  markRewardPaid(rewardId: string) {
    this.exec('reward.paid', (s, me) => {
      this.require(me, 'rewards.manage');
      const r = s.rewards.find((x) => x.id === rewardId);
      if (!r) throw new ServerError('Reward not found');
      if (r.status === 'paid') throw new ServerError('Already marked paid — duplicate payment blocked.');
      r.status = 'paid'; r.paidAt = nowIso();
      return { detail: `Marked ${r.amount} DHD victory bonus paid to ${this.squadName(s, r.squadId)}` };
    });
  }

  markPrizePaid(prize: 'champion' | 'topKiller') {
    this.exec('prize.paid', (s, me) => {
      this.require(me, 'rewards.manage');
      if (prize === 'champion' && !s.championId) throw new ServerError('Champion not declared yet.');
      s.prizeStatus[prize] = 'paid';
      return { detail: `Marked ${prize === 'champion' ? '500 MAD champion prize' : '530 Diamonds top killer prize'} as paid` };
    });
  }

  declareChampion() {
    this.exec('champion.declare', (s, me) => {
      this.require(me, 'champion.declare');
      const f = s.matches.find((m) => m.stage === 'final');
      if (!f || f.status !== 'completed' || !f.winner) throw new ServerError('The Grand Final must be completed and verified first.');
      s.championId = f.winner;
      s.championDeclaredAt = nowIso();
      s.announcements.unshift({
        id: uid('an'), category: 'champion', authorId: me.id, at: nowIso(),
        title: `👑 ${this.squadName(s, f.winner)} are the CHAMPIONS OF MOROCCO!`,
        body: `ONE TOURNAMENT. SIXTEEN SQUADS. ONE CROWN. Congratulations to ${this.squadName(s, f.winner)} — winners of FREE FIRE: MOROCCAN SQUAD CLASH 🇲🇦 and the 500 MAD grand prize!`,
      });
      return { detail: `Declared ${this.squadName(s, f.winner)} champion` };
    });
  }

  setMatchOfDay(matchId?: string) {
    this.exec('match.featured', (s, me) => {
      this.require(me, 'match.edit');
      s.settings.matchOfDay = matchId;
      return { detail: matchId ? `Match of the Day: #${this.match(s, matchId).number}` : 'Cleared Match of the Day' };
    });
  }

  updateSettings(patch: Partial<Pick<TournamentState['settings'], 'sniperRule' | 'maxLaptops' | 'enforceRegistrationWindow' | 'victoryReward'>>) {
    this.exec('settings.update', (s, me) => {
      this.require(me, 'staff.manage');
      Object.assign(s.settings, patch);
      return { detail: `Settings updated: ${Object.keys(patch).join(', ')}` };
    });
  }

  /* ───────── Reports & penalties ───────── */

  submitReport(input: { target: string; targetSquadId?: string; uid: string; matchNumber?: number; when: string; category: ReportCategory; explanation: string; evidence: string }) {
    return this.exec('report.submit', (s, me) => {
      if (input.explanation.trim().length < 30) throw new ServerError('Explain the issue clearly (at least 30 characters).');
      if (!input.evidence.trim()) throw new ServerError('Screenshot or video evidence is required.');
      if (!input.target.trim()) throw new ServerError('Specify the reported player or squad.');
      const mine = s.reports.filter((r) => r.reporterId === me.id && Date.now() - new Date(r.createdAt).getTime() < 10 * 60_000);
      if (mine.length >= 3) throw new ServerError('Anti-spam: max 3 reports per 10 minutes.');
      const r: Report = {
        id: uid('rp'), reporterId: me.id, reporterName: me.discord, status: 'submitted', createdAt: nowIso(),
        ...input, target: input.target.trim(), explanation: input.explanation.trim(), evidence: input.evidence.trim(),
      };
      s.reports.unshift(r);
      return { detail: `Report filed against ${r.target} (${r.category})`, result: r.id };
    });
  }

  checkerReview(reportId: string, notes: string, forward: boolean) {
    this.exec('report.checker', (s, me) => {
      this.require(me, 'report.review');
      const r = s.reports.find((x) => x.id === reportId);
      if (!r) throw new ServerError('Report not found');
      if (r.status !== 'submitted' && r.status !== 'checker_review') throw new ServerError('Report already past evidence review.');
      r.checkerNotes = notes; r.checkerId = me.id;
      r.status = forward ? 'investigation' : 'dismissed';
      if (!forward) r.decision = `Dismissed at evidence review: ${notes}`;
      return { detail: `${forward ? 'Forwarded to Supervisor' : 'Dismissed'} report ${r.id}` };
    });
  }

  supervisorDecide(reportId: string, decision: string, penalty: PenaltyType | 'none', squadId?: string) {
    this.exec('report.decide', (s, me) => {
      this.require(me, 'report.decide');
      const r = s.reports.find((x) => x.id === reportId);
      if (!r) throw new ServerError('Report not found');
      if (r.status !== 'investigation') throw new ServerError('Report must be under investigation.');
      if (!decision.trim()) throw new ServerError('Write the decision.');
      r.decision = decision; r.penalty = penalty; r.decidedBy = me.id; r.status = 'decided';
      if (penalty !== 'none') {
        if (!squadId) throw new ServerError('Choose the penalised squad.');
        this.issuePenaltyInner(s, me, squadId, penalty, decision, r.id);
      }
      return { detail: `Decision on report ${r.id}: ${penalty}` };
    });
  }

  issuePenalty(squadId: string, type: PenaltyType, reason: string) {
    this.exec('penalty.issue', (s, me) => {
      this.issuePenaltyInner(s, me, squadId, type, reason);
      return { detail: `Penalty ${type} → ${this.squadName(s, squadId)}: ${reason}` };
    });
  }

  private issuePenaltyInner(s: TournamentState, me: User, squadId: string, type: PenaltyType, reason: string, reportId?: string) {
    this.require(me, 'penalty.issue');
    const q = s.squads.find((x) => x.id === squadId);
    if (!q) throw new ServerError('Squad not found');
    s.penalties.unshift({ id: uid('pn'), squadId, type, reason, reportId, issuedBy: me.id, at: nowIso() });
    if (type === 'tournament_dq') q.disqualified = true;
  }

  announceReport(reportId: string) {
    this.exec('report.announce', (s, me) => {
      this.require(me, 'announce');
      const r = s.reports.find((x) => x.id === reportId);
      if (!r || r.status !== 'decided') throw new ServerError('Only decided reports can be announced.');
      r.status = 'announced';
      s.announcements.unshift({
        id: uid('an'), category: 'investigation', authorId: me.id, at: nowIso(),
        title: `🛡️ Investigation outcome — ${r.target}`,
        body: `${r.decision}${r.penalty && r.penalty !== 'none' ? ` Penalty: ${r.penalty.replace('_', ' ').toUpperCase()}.` : ' No penalty issued.'}`,
      });
      return { detail: `Announced outcome of report ${r.id}` };
    });
  }

  /* ───────── Announcements & staff ───────── */

  publishAnnouncement(category: AnnouncementCategory, title: string, body: string) {
    this.exec('announce.publish', (s, me) => {
      this.require(me, 'announce');
      if (!title.trim() || !body.trim()) throw new ServerError('Title and body required.');
      s.announcements.unshift({ id: uid('an'), category, title: title.trim(), body: body.trim(), authorId: me.id, at: nowIso() });
      return { detail: `Published announcement "${title}"` };
    });
  }

  deleteAnnouncement(id: string) {
    this.exec('announce.delete', (s, me) => {
      this.require(me, 'announce');
      s.announcements = s.announcements.filter((a) => a.id !== id);
      return { detail: `Deleted announcement ${id}` };
    });
  }

  setRoles(userId: string, roles: Role[]) {
    this.exec('staff.roles', (s, me) => {
      this.require(me, 'staff.manage');
      const u = s.users.find((x) => x.id === userId);
      if (!u) throw new ServerError('User not found');
      if (u.id === me.id && !roles.includes('admin')) throw new ServerError('You cannot remove your own admin role.');
      u.roles = roles.length ? roles : ['viewer'];
      return { detail: `Roles for ${u.name}: ${u.roles.join(', ')}` };
    });
  }

  setContent(key: string, value: string | null) {
    this.exec('content.edit', (s, me) => {
      this.require(me, 'staff.manage');
      if (!/^[\w.]{1,100}$/.test(key)) throw new ServerError('Invalid text key.');
      if (value !== null && (!value.trim() || value.length > 5000)) throw new ServerError('Text must be 1–5000 characters.');
      const content = { ...(s.content ?? {}) };
      if (value === null) delete content[key]; else content[key] = value;
      s.content = content;
      return { detail: value === null ? `Reset text "${key}" to default` : `Edited text "${key}"` };
    });
  }

  /** Demo: there are no real email accounts, so invites are recorded and shown as "waiting for first sign-in". */
  inviteStaff(email: string, roles: Role[]) {
    return this.exec('staff.invite', (s, me) => {
      this.require(me, 'staff.manage');
      const e = email.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new ServerError('Enter a valid email address.');
      const ok: Role[] = ['admin', 'supervisor', 'hoster', 'cheat_checker', 'counter', 'commentator'];
      if (!roles.length) throw new ServerError('Choose at least one role.');
      if (roles.some((r) => !ok.includes(r))) throw new ServerError('Invalid staff role.');
      s.staff = [...(s.staff ?? []).filter((x) => x.email !== e), { email: e, roles, signedUp: false }];
      return { detail: `Staff invite for ${e}: ${roles.join(', ')}`, result: 'pending' };
    }) ?? 'pending';
  }

  removeStaff(email: string) {
    this.exec('staff.remove', (s, me) => {
      this.require(me, 'staff.manage');
      const e = email.trim().toLowerCase();
      s.staff = (s.staff ?? []).filter((x) => x.email !== e);
      return { detail: `Removed staff access for ${e}` };
    });
  }

  /* ───────── Demo tooling ───────── */

  resetDemo() {
    this.s = seedState();
    resolveParticipants(this.s);
    this.publish();
  }

  /** Builds a scenario by driving the real actions with the real staff accounts. */
  loadScenario(stage: 'groups' | 'knockouts' | 'final' | 'finished') {
    const prev = this.sessionId;
    this.resetDemo();
    this.quiet = true;
    try { this.buildScenario(stage, prev); } finally { this.quiet = false; }
    this.publish();
  }

  private buildScenario(stage: 'groups' | 'knockouts' | 'final' | 'finished', prev: string) {
    const rand = rng(7);
    const as = (id: string, f: () => void) => { this.sessionId = id; try { f(); } finally { this.sessionId = prev; } };
    as('u_admin', () => {
      const pending = this.s.squads.find((q) => q.status === 'pending');
      if (pending) this.reviewSquad(pending.id, 'approved');
      const extra = makeSquad(RESERVE_SQUAD, 16, rand, 'pending');
      this.s.squads.push(extra);
      this.reviewSquad(extra.id, 'approved');
      this.runDraw(11);
      this.lockGroups(true);
      this.publishAnnouncement('draw', '🎲 Official group draw complete!', 'The 16 squads have been drawn into Groups A–D. Check the Groups page for your opponents.');
    });
    const target = stage === 'groups' ? 13 : stage === 'knockouts' ? 24 : stage === 'final' ? 30 : 31;
    let safety = 0;
    while (safety++ < 60) {
      const next = this.s.matches
        .filter((m) => m.a && m.b && (m.status === 'upcoming' || m.status === 'ready'))
        .sort((x, y) => x.date.localeCompare(y.date) || x.number - y.number)[0];
      const done = this.s.matches.filter((m) => m.status === 'completed' && m.stage !== 'tiebreak').length;
      // Resolve any ties at the cut with deciding matches
      for (const g of GROUPS) {
        const t = computeGroup(this.s, g);
        const pendingTb = this.s.matches.some((m) => m.stage === 'tiebreak' && m.group === g && m.status !== 'completed');
        if (t.complete && !t.cutResolved && !pendingTb) as('u_admin', () => this.createTiebreak(g, t.tiedAtCut[0], t.tiedAtCut[1]));
      }
      if (done >= target && !this.s.matches.some((m) => m.stage === 'tiebreak' && m.status === 'upcoming')) break;
      const nxt = this.s.matches.find((m) => m.stage === 'tiebreak' && m.status === 'upcoming') ?? next;
      if (!nxt) break;
      this.simulateMatch(nxt.id, rand);
    }
    // Leave the next match ready with bets on it
    const upcoming = this.s.matches.filter((m) => m.a && m.b && m.status === 'upcoming').slice(0, 4);
    upcoming.forEach((m) => this.botPredictions(m.id, rand));
    if (upcoming[0]) {
      as('u_host', () => this.setRoom(upcoming[0].id, String(48_000_000 + upcoming[0].number * 731), `msc${upcoming[0].number}`));
      as('u_admin', () => this.setMatchOfDay(upcoming[0].id));
    }
    if (stage === 'finished') as('u_admin', () => this.declareChampion());
  }

  /** Admin demo tool: play the next decided fixture end-to-end. */
  simulateNext() {
    if (!can(this.findUser(this.sessionId), 'staff.manage')) throw new ServerError('Only administrators can use demo simulation.');
    const next = this.s.matches
      .filter((m) => m.a && m.b && (m.status === 'upcoming' || m.status === 'ready'))
      .sort((x, y) => x.date.localeCompare(y.date) || x.number - y.number)[0];
    if (!next) throw new ServerError('No playable fixture — check draw, tiebreaks or bracket.');
    this.simulateMatch(next.id);
    return next.number;
  }

  private botPredictions(matchId: string, rand: () => number) {
    const m = this.s.matches.find((x) => x.id === matchId)!;
    for (let i = 0; i < 12; i++) {
      if (rand() < 0.25) continue;
      const pick = rand() < 0.55 ? m.a! : m.b!;
      const stake = 10 * (1 + Math.floor(rand() * 25));
      try { this.placePrediction(m.id, pick, stake, `bot${i}:${m.id}`, `u_bot${i}`); } catch { /* window closed or limit hit */ }
    }
  }

  /** Plays one fixture through the full staff workflow (host → start → counter → verify). */
  simulateMatch(matchId: string, rand: () => number = Math.random) {
    const prev = this.sessionId;
    const as = (id: string, f: () => void) => { this.sessionId = id; try { f(); } finally { this.sessionId = prev; } };
    const m0 = this.s.matches.find((x) => x.id === matchId);
    if (!m0 || !m0.a || !m0.b) throw new ServerError('Match squads not decided.');
    this.botPredictions(matchId, rand);
    if (!m0.roomId) as('u_host', () => this.setRoom(matchId, String(48_000_000 + m0.number * 731), `msc${m0.number}`));
    as('u_host', () => this.startMatch(matchId));
    const m = this.s.matches.find((x) => x.id === matchId)!;
    const comm = m.commentatorId ?? 'u_comm1';
    const A = this.s.squads.find((q) => q.id === m.a)!, B = this.s.squads.find((q) => q.id === m.b)!;
    as(comm, () => {
      this.postEvent(matchId, 'start', `🔥 THE BATTLE IS STARTING! ${A.name} vs ${B.name} on ${m.map}!`);
      this.postEvent(matchId, 'intro', `${A.tag} led by ${A.players[0].ign} — ${B.tag} led by ${B.players[0].ign}. Who takes it?`);
    });
    const strength = (q: Squad) => (q.tag.charCodeAt(0) * 7 + q.tag.charCodeAt(1) * 3) % 10;
    const pA = 0.5 + (strength(A) - strength(B)) * 0.04;
    const winner = rand() < pA ? A : B;
    const loser = winner === A ? B : A;
    const kills: Record<string, number> = {};
    winner.players.filter((p) => p.slot === 'starter').forEach((p) => (kills[p.id] = 2 + Math.floor(rand() * 7)));
    loser.players.filter((p) => p.slot === 'starter').forEach((p) => (kills[p.id] = Math.floor(rand() * 5)));
    const mvp = Object.entries(kills).sort((a, b) => b[1] - a[1])[0][0];
    const mvpName = [...A.players, ...B.players].find((p) => p.id === mvp)!.ign;
    as(comm, () => {
      this.postEvent(matchId, 'moment', `💥 Huge clutch from ${winner.players[1].ign}! ${winner.tag} take control of the zone.`);
      this.postEvent(matchId, 'kill', `🎯 ${mvpName} is on fire — ${kills[mvp]} kills!`);
    });
    as('u_counter', () => this.submitResult(matchId, winner.id, kills, mvp));
    as('u_sup', () => this.verifyResult(matchId));
    as(comm, () => this.postEvent(matchId, 'mvp', `⭐ MVP of the match: ${mvpName}`));
  }
}
