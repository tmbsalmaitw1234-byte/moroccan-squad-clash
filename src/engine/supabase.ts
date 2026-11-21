/**
 * SUPABASE BACKEND
 * ------------------------------------------------------------------
 * Reads: plain SELECTs, filtered by Row Level Security (room passwords,
 * raw UIDs, other people's ledgers and reports simply never arrive).
 * Writes: every action is a Postgres function in supabase/schema.sql that
 * re-checks the caller's role and validates input inside a transaction.
 * Live updates: one Realtime channel; any change triggers a debounced reload.
 */
import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type {
  Announcement, AuditEntry, ChatMsg, GroupId, Match, MatchEvent, Penalty, Player, Prediction, Report, Role,
  Squad, SquadReward, TournamentState, Tx, User,
} from '../types';
import { GROUPS } from '../types';
import type { Backend, Snapshot } from './backend';
import { buildFixtures } from './config';
import { resolveParticipants } from './logic';
import { ServerError } from './errors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const GUEST: User = { id: 'anon', name: 'Guest', discord: 'guest', roles: ['viewer'], avatarColor: '#64748b' };

function emptyState(): TournamentState {
  return {
    version: 1, squads: [], users: [], matches: [], groups: { A: [], B: [], C: [], D: [] }, groupsLocked: false, drawDone: false,
    predictions: [], txs: [], rewards: [], events: [], chat: [], reports: [], penalties: [], announcements: [], audit: [],
    settings: {
      minStake: 10, maxStake: 500, startingBalance: 1000, victoryReward: 200, enforceRegistrationWindow: true,
      sniperRule: { enabled: true, confirmed: false, text: '' }, maxLaptops: 2,
    },
    prizeStatus: { champion: 'pending', topKiller: 'pending' },
  };
}

function colorFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 70% 55%)`;
}

function cleanError(msg: string) {
  // PostgREST wraps plpgsql exceptions; keep the human part only
  return msg.replace(/^.*?ERROR:\s*/s, '').replace(/\s*CONTEXT:.*$/s, '').trim() || 'Request failed';
}

export class SupabaseServer implements Backend {
  readonly mode = 'supabase' as const;
  private sb: SupabaseClient;
  private listeners = new Set<() => void>();
  private snapshot: Snapshot = { state: emptyState(), me: GUEST, mode: 'supabase', status: 'loading', authed: false };
  private userId?: string;
  channel?: RealtimeChannel;
  private reloadTimer?: number;
  private loading?: Promise<void>;
  private again = false;

  constructor(url: string, key: string) {
    this.sb = createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true, autoRefreshToken: true } });
    this.sb.auth.onAuthStateChange((event, session) => {
      const changed = this.userId !== session?.user.id;
      this.userId = session?.user.id;
      if (event === 'SIGNED_IN' && changed) {
        // Remove ?code=… left by the OAuth redirect; keep the hash route
        if (window.location.search) window.history.replaceState(null, '', window.location.pathname + window.location.hash);
        void this.sb.rpc('ensure_wallet').then(() => this.reload());
      } else if (changed) {
        void this.reload();
      }
    });
    void this.init();
  }

  private async init() {
    const { data } = await this.sb.auth.getSession();
    this.userId = data.session?.user.id;
    if (this.userId) await this.sb.rpc('ensure_wallet');
    await this.reload();
    this.channel = this.sb
      .channel('msc-live')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => this.scheduleReload())
      .subscribe();
  }

  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getSnapshot = () => this.snapshot;

  private emit(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((l) => l());
  }

  private scheduleReload() {
    window.clearTimeout(this.reloadTimer);
    this.reloadTimer = window.setTimeout(() => void this.reload(), 350);
  }

  /** Coalesces concurrent reloads: at most one in flight plus one queued. */
  async reload(): Promise<void> {
    if (this.loading) { this.again = true; return this.loading; }
    this.loading = this.fetchAll()
      .then((state) => {
        const me = state.users.find((u) => u.id === this.userId) ?? (this.userId ? { ...GUEST, id: this.userId, name: 'New player' } : GUEST);
        this.emit({ state, me, status: 'ready', error: undefined, authed: !!this.userId });
      })
      .catch((e: Error) => this.emit({ status: 'error', error: e.message }))
      .finally(() => {
        this.loading = undefined;
        if (this.again) { this.again = false; void this.reload(); }
      });
    return this.loading;
  }

  private async sel(table: string, build?: (q: Row) => Row): Promise<Row[]> {
    let q: Row = this.sb.from(table).select('*');
    if (build) q = build(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    return (data ?? []) as Row[];
  }

  private async fetchAll(): Promise<TournamentState> {
    const [
      settingsRows, profiles, roles, squadsRows, playersPub, playersRaw, matchRows, rooms, kills,
      events, chat, preds, ledger, rewards, reports, penalties, anns, audit, content,
    ] = await Promise.all([
      this.sel('settings'),
      this.sel('profiles'),
      this.sel('user_roles'),
      this.sel('squads', (q) => (q as Row).order('created_at')),
      this.sel('players_public', (q) => (q as Row).order('position')),
      this.sel('players'),
      this.sel('matches', (q) => (q as Row).order('number')),
      this.sel('match_rooms'),
      this.sel('match_kills'),
      this.sel('match_events', (q) => (q as Row).order('id', { ascending: false }).limit(2000)),
      this.sel('chat_messages', (q) => (q as Row).order('id', { ascending: false }).limit(1500)),
      this.sel('predictions'),
      this.sel('dhd_ledger', (q) => (q as Row).order('id').limit(5000)),
      this.sel('squad_rewards'),
      this.sel('reports', (q) => (q as Row).order('created_at', { ascending: false })),
      this.sel('penalties', (q) => (q as Row).order('created_at', { ascending: false })),
      this.sel('announcements', (q) => (q as Row).order('created_at', { ascending: false })),
      this.sel('audit_log', (q) => (q as Row).order('id', { ascending: false }).limit(300)),
      // tolerate a project where the site_content migration hasn't been run yet
      this.sel('site_content').catch(() => [] as Row[]),
    ]);

    const s = emptyState();
    const st = settingsRows[0] ?? {};
    s.settings = {
      minStake: st.min_stake ?? 10,
      maxStake: st.max_stake ?? 500,
      startingBalance: st.starting_balance ?? 1000,
      victoryReward: st.victory_reward ?? 200,
      enforceRegistrationWindow: !!st.enforce_registration_window,
      sniperRule: { enabled: !!st.sniper_rule_enabled, confirmed: !!st.sniper_rule_confirmed, text: st.sniper_rule_text ?? '' },
      maxLaptops: st.max_laptops ?? 2,
      matchOfDay: st.match_of_day ?? undefined,
    };
    s.groupsLocked = !!st.groups_locked;
    s.drawDone = !!st.draw_done;
    s.championId = st.champion_squad ?? undefined;
    s.championDeclaredAt = st.champion_declared_at ?? undefined;
    s.prizeStatus = { champion: st.champion_paid ? 'paid' : 'pending', topKiller: st.top_killer_paid ? 'paid' : 'pending' };

    // Players: masked public roster, overlaid with raw rows RLS lets this user see
    const raw = new Map(playersRaw.map((p) => [p.id, p]));
    const toPlayer = (p: Row): Player => {
      const r = raw.get(p.id) ?? p;
      return { id: p.id, discord: p.discord, ffUsername: p.ff_username, uid: r.ff_uid, ign: p.ign, role: p.role, slot: p.slot, isCaptain: p.is_captain };
    };
    const bySquad = new Map<string, Player[]>();
    playersPub.forEach((p) => bySquad.set(p.squad_id, [...(bySquad.get(p.squad_id) ?? []), toPlayer(p)]));

    s.squads = squadsRows.map((q): Squad => ({
      id: q.id, number: q.number ?? undefined, name: q.name, tag: q.tag, color: q.color, logo: q.logo_url ?? undefined,
      captainDiscord: q.captain_discord, players: bySquad.get(q.id) ?? [], status: q.status, rejectReason: q.reject_reason ?? undefined,
      createdAt: q.created_at, ownerUserId: q.owner_id, disqualified: q.disqualified,
    }));
    GROUPS.forEach((g) => {
      s.groups[g] = squadsRows.filter((q) => q.group_id === g).sort((a, b) => a.group_slot - b.group_slot).map((q) => q.id);
    });

    // Users
    const rolesBy = new Map<string, Role[]>();
    roles.forEach((r) => rolesBy.set(r.user_id, [...(rolesBy.get(r.user_id) ?? []), r.role]));
    const active = squadsRows.filter((q) => q.status !== 'rejected');
    s.users = profiles.map((p): User => {
      const own = active.find((q) => q.owner_id === p.id)?.id
        ?? playersPub.find((pl) => pl.user_id === p.id && active.some((q) => q.id === pl.squad_id))?.squad_id;
      const rs = rolesBy.get(p.id) ?? ['viewer'];
      // order roles so the most senior shows first in the UI
      const order: Role[] = ['admin', 'supervisor', 'hoster', 'cheat_checker', 'counter', 'commentator', 'captain', 'viewer'];
      return { id: p.id, name: p.display_name, discord: p.discord, roles: order.filter((r) => rs.includes(r)), squadId: own, avatarColor: colorFor(p.id) };
    });

    // Matches
    const roomBy = new Map(rooms.map((r) => [r.match_id, r]));
    s.matches = matchRows.map((m): Match => {
      const mk = kills.filter((k) => k.match_id === m.id);
      const verified = Object.fromEntries(mk.filter((k) => k.verified).map((k) => [k.player_id, k.kills]));
      const pendingKills = Object.fromEntries(mk.filter((k) => !k.verified).map((k) => [k.player_id, k.kills]));
      const room = roomBy.get(m.id);
      return {
        id: m.id, number: m.number, label: m.label, stage: m.stage, group: (m.group_id ?? undefined) as GroupId | undefined, day: m.day,
        date: new Date(m.starts_at).toISOString(), srcA: m.src_a ?? { type: 'fixed' }, srcB: m.src_b ?? { type: 'fixed' },
        a: m.squad_a ?? undefined, b: m.squad_b ?? undefined, map: m.map, roomId: room?.room_id, roomPass: room?.room_password,
        status: m.status, readyA: m.ready_a, readyB: m.ready_b, commentatorId: m.commentator_id ?? undefined, supervisorId: m.supervisor_id ?? undefined,
        pending: m.status === 'review' && m.pending_winner
          ? { winner: m.pending_winner, kills: pendingKills, mvp: m.mvp_player ?? undefined, by: m.pending_by, at: m.pending_at }
          : undefined,
        winner: m.winner ?? undefined, kills: verified, mvp: m.status === 'completed' ? m.mvp_player ?? undefined : undefined,
        predictionsOpen: m.predictions_open, settled: m.settled, startedAt: m.started_at ?? undefined, completedAt: m.completed_at ?? undefined,
        highlights: m.highlights ?? [],
      };
    });

    s.predictions = preds.map((p): Prediction => ({ id: p.id, userId: p.user_id, matchId: p.match_id, pick: p.pick, stake: p.stake, status: p.status, payout: p.payout, createdAt: p.created_at }));
    s.txs = ledger.map((t): Tx => ({ id: String(t.id), userId: t.user_id, amount: t.amount, kind: t.kind, ref: t.ref, memo: t.memo, idemKey: t.idem_key, createdAt: t.created_at }));
    s.rewards = rewards.map((r): SquadReward => ({ id: r.id, squadId: r.squad_id, matchId: r.match_id, amount: r.amount, status: r.status, paidAt: r.paid_at ?? undefined }));
    s.events = events.reverse().map((e): MatchEvent => ({ id: String(e.id), matchId: e.match_id, authorId: e.author_id ?? 'system', kind: e.kind, text: e.body, at: e.created_at }));
    s.chat = chat.reverse().map((c): ChatMsg => ({ id: String(c.id), matchId: c.match_id, userId: c.user_id, text: c.body, at: c.created_at }));
    const discordOf = new Map(profiles.map((p) => [p.id, p.discord]));
    s.reports = reports.map((r): Report => ({
      id: r.id, reporterId: r.reporter_id, reporterName: discordOf.get(r.reporter_id) ?? 'unknown', target: r.target, targetSquadId: r.target_squad ?? undefined,
      uid: r.ff_uid ?? '', matchNumber: r.match_number ?? undefined, when: r.occurred_at, category: r.category, explanation: r.explanation,
      evidence: r.evidence_url, status: r.status, checkerNotes: r.checker_notes ?? undefined, checkerId: r.checker_id ?? undefined,
      decision: r.decision ?? undefined, penalty: r.penalty ?? undefined, decidedBy: r.decided_by ?? undefined, createdAt: r.created_at,
    }));
    s.penalties = penalties.map((p): Penalty => ({ id: p.id, squadId: p.squad_id, type: p.type, reason: p.reason, reportId: p.report_id ?? undefined, issuedBy: p.issued_by, at: p.created_at }));
    s.announcements = anns.map((a): Announcement => ({ id: a.id, category: a.category, title: a.title, body: a.body, authorId: a.author_id, at: a.created_at }));
    s.content = Object.fromEntries(content.map((c) => [c.key, c.value]));
    // Private staff directory (emails) — only administrators can load it
    if (this.userId && roles.some((r) => r.user_id === this.userId && r.role === 'admin')) {
      const { data } = await this.sb.rpc('staff_directory');
      s.staff = ((data ?? []) as Row[]).map((d) => ({ email: d.email, userId: d.user_id ?? undefined, name: d.display_name ?? undefined, roles: d.roles ?? [], signedUp: !!d.signed_up }));
    }
    s.audit = audit.map((a): AuditEntry => ({ id: String(a.id), at: a.created_at, actorId: a.actor_id ?? 'system', action: a.action, detail: a.detail }));
    return s;
  }

  /* ───────── RPC plumbing ───────── */

  private async rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    if (!this.userId) throw new ServerError('Sign in with Discord first.');
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw new ServerError(cleanError(error.message));
    await this.reload();
    return data as T;
  }

  /* ───────── Auth ───────── */

  async signIn() {
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await this.sb.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo } });
    if (error) throw new ServerError(error.message);
  }

  async signInWithEmail(email: string) {
    const e = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new ServerError('Enter a valid email address.');
    const emailRedirectTo = window.location.origin + window.location.pathname;
    let error: { message: string; status?: number } | null = null;
    try {
      ({ error } = await this.sb.auth.signInWithOtp({ email: e, options: { emailRedirectTo, shouldCreateUser: true } }));
    } catch {
      throw new ServerError('Could not reach the sign-in service. Check your internet connection and try again.');
    }
    if (error) {
      if (/fetch|network/i.test(error.message)) throw new ServerError('Could not reach the sign-in service. Check your internet connection and try again.');
      if (error.status === 429 || /rate limit/i.test(error.message)) throw new ServerError('Too many sign-in emails were sent. Wait a few minutes and try again.');
      throw new ServerError(error.message);
    }
  }

  async signOut() {
    await this.sb.auth.signOut();
  }

  /* ───────── Actions (1:1 with supabase/schema.sql) ───────── */

  registerSquad(input: Parameters<Backend['registerSquad']>[0]) { return this.rpc<string>('register_squad', { p: input }); }
  reviewSquad(id: string, decision: 'approved' | 'rejected', reason?: string) { return this.rpc<void>('review_squad', { p_squad: id, p_decision: decision, p_reason: reason ?? null }); }
  editSquad(id: string, patch: Parameters<Backend['editSquad']>[1]) { return this.rpc<void>('edit_squad', { p_squad: id, p: patch }); }
  async setSquadEliminated(id: string, reason: string) { await this.rpc('eliminate_squad', { p_squad: id, p_reason: reason }); await this.trySync(); }

  runDraw() { return this.rpc('run_draw'); }
  swapInGroups(a: string, b: string) { return this.rpc<void>('swap_groups', { p_a: a, p_b: b }); }
  lockGroups(locked: boolean) { return this.rpc<void>('lock_groups', { p_lock: locked }); }

  initFixtures() {
    const fx = buildFixtures().map((m) => ({ number: m.number, label: m.label, stage: m.stage, group: m.group ?? null, day: m.day, date: m.date, srcA: m.srcA, srcB: m.srcB, map: m.map }));
    return this.rpc<void>('seed_fixtures', { p: fx });
  }

  /** Recomputes knockout participants from verified results and pushes changes. */
  async syncBracket() {
    await this.reload();
    const draft: TournamentState = structuredClone(this.snapshot.state);
    const before = new Map(draft.matches.map((m) => [m.id, `${m.a}|${m.b}`]));
    resolveParticipants(draft);
    const changes = draft.matches
      .filter((m) => m.stage !== 'group' && m.srcA.type !== 'fixed' && before.get(m.id) !== `${m.a}|${m.b}`)
      .map((m) => ({ id: m.id, a: m.a ?? null, b: m.b ?? null }));
    if (changes.length) await this.rpc('sync_participants', { p: changes });
  }

  private async trySync() {
    try { await this.syncBracket(); } catch { /* caller may lack bracket permission; staff can re-sync from Admin */ }
  }

  editMatch(id: string, patch: Parameters<Backend['editMatch']>[1]) {
    const p: Record<string, unknown> = {};
    if ('date' in patch) p.date = patch.date;
    if ('map' in patch) p.map = patch.map;
    if ('commentatorId' in patch) p.commentatorId = patch.commentatorId ?? null;
    if ('supervisorId' in patch) p.supervisorId = patch.supervisorId ?? null;
    return this.rpc<void>('edit_match', { p_match: id, p });
  }
  setKoParticipants(id: string, a: string, b: string) { return this.rpc<void>('set_participants', { p_match: id, p_a: a, p_b: b }); }
  async createTiebreak(group: GroupId, a: string, b: string) { await this.rpc('create_tiebreak', { p_group: group, p_a: a, p_b: b }); }
  setRoom(id: string, roomId: string, roomPass: string) { return this.rpc<void>('set_room', { p_match: id, p_room: roomId, p_pass: roomPass }); }
  confirmReady(id: string) { return this.rpc<void>('confirm_ready', { p_match: id }); }
  startMatch(id: string) { return this.rpc<void>('start_match', { p_match: id }); }
  submitResult(id: string, winner: string, kills: Record<string, number>, mvp?: string) { return this.rpc<void>('submit_result', { p_match: id, p_winner: winner, p_kills: kills, p_mvp: mvp ?? null }); }
  async verifyResult(id: string) { await this.rpc('verify_result', { p_match: id }); await this.trySync(); }
  rejectResult(id: string) { return this.rpc<void>('reject_result', { p_match: id }); }
  async cancelMatch(id: string, reason: string) { await this.rpc('cancel_match', { p_match: id, p_reason: reason }); await this.trySync(); }
  postEvent(matchId: string, kind: string, text: string) { return this.rpc<void>('post_event', { p_match: matchId, p_kind: kind, p_body: text }); }
  sendChat(matchId: string, text: string) { return this.rpc<void>('post_chat', { p_match: matchId, p_body: text }); }
  addHighlight(matchId: string, url: string) { return this.rpc<void>('add_highlight', { p_match: matchId, p_url: url }); }

  placePrediction(matchId: string, pick: string, stake: number, idemKey: string) { return this.rpc<string>('place_prediction', { p_match: matchId, p_pick: pick, p_stake: stake, p_idem: idemKey }); }
  setPredictionsOpen(matchId: string, open: boolean) { return this.rpc<void>('set_predictions_open', { p_match: matchId, p_open: open }); }
  cancelPredictions(matchId: string) { return this.rpc<void>('cancel_predictions', { p_match: matchId }); }
  setStakeLimits(min: number, max: number) { return this.rpc<void>('set_stake_limits', { p_min: min, p_max: max }); }
  markRewardPaid(rewardId: string) { return this.rpc<void>('mark_reward_paid', { p_reward: rewardId }); }
  markPrizePaid(prize: 'champion' | 'topKiller') { return this.rpc<void>('mark_prize_paid', { p_prize: prize }); }
  declareChampion() { return this.rpc<void>('declare_champion'); }
  setMatchOfDay(matchId?: string) { return this.rpc<void>('set_match_of_day', { p_match: matchId ?? null }); }
  updateSettings(patch: Parameters<Backend['updateSettings']>[0]) { return this.rpc<void>('update_settings', { p: patch }); }

  submitReport(input: Parameters<Backend['submitReport']>[0]) { return this.rpc<string>('submit_report', { p: input }); }
  checkerReview(reportId: string, notes: string, forward: boolean) { return this.rpc<void>('checker_review', { p_report: reportId, p_notes: notes, p_forward: forward }); }
  async supervisorDecide(reportId: string, decision: string, penalty: string, squadId?: string) {
    await this.rpc('supervisor_decide', { p_report: reportId, p_decision: decision, p_penalty: penalty, p_squad: squadId ?? null });
    if (penalty === 'tournament_dq') await this.trySync();
  }
  async issuePenalty(squadId: string, type: string, reason: string) {
    await this.rpc('issue_penalty', { p_squad: squadId, p_type: type, p_reason: reason });
    if (type === 'tournament_dq') await this.trySync();
  }
  announceReport(reportId: string) { return this.rpc<void>('announce_report', { p_report: reportId }); }

  publishAnnouncement(category: string, title: string, body: string) { return this.rpc<void>('publish_announcement', { p_category: category, p_title: title, p_body: body }); }
  deleteAnnouncement(id: string) { return this.rpc<void>('delete_announcement', { p_id: id }); }
  setRoles(userId: string, roles: Role[]) { return this.rpc<void>('set_roles', { p_user: userId, p_roles: roles }); }
  setContent(key: string, value: string | null) { return this.rpc<void>('set_content', { p_key: key, p_value: value }); }
  inviteStaff(email: string, roles: Role[]) { return this.rpc<string>('invite_staff', { p_email: email, p_roles: roles }); }
  removeStaff(email: string) { return this.rpc<void>('remove_staff', { p_email: email }); }
}
