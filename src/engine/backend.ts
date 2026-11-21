/**
 * One interface, two implementations:
 *   • DemoServer      (src/engine/server.ts)   — in-browser, localStorage, no auth
 *   • SupabaseServer  (src/engine/supabase.ts) — Discord sign-in, Postgres, Realtime
 * The UI only talks to `server`, so every page works with either backend.
 * Supabase mode is selected automatically when VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY are set (see .env.example).
 */
import type {
  AnnouncementCategory, EventKind, GroupId, Match, PenaltyType, Player, ReportCategory, Role, Squad, TournamentState, User,
} from '../types';

type R<T> = T | Promise<T>;

export interface Snapshot {
  state: TournamentState;
  me: User;
  mode: 'demo' | 'supabase';
  status: 'loading' | 'ready' | 'error';
  error?: string;
  authed: boolean;
}

export interface Backend {
  readonly mode: 'demo' | 'supabase';
  subscribe(l: () => void): () => void;
  getSnapshot(): Snapshot;

  // identity
  signInAs?(userId: string): void;          // demo only
  signIn?(): R<void>;                       // supabase: Discord OAuth
  signInWithEmail?(email: string): R<void>; // supabase: one-time sign-in link by email
  signOut?(): R<void>;

  // registration
  registerSquad(input: { name: string; tag: string; logo?: string; captainDiscord: string; players: Omit<Player, 'id'>[]; rulesAccepted: boolean }): R<string | undefined>;
  reviewSquad(id: string, decision: 'approved' | 'rejected', reason?: string): R<void>;
  editSquad(id: string, patch: Partial<Pick<Squad, 'name' | 'tag' | 'number' | 'captainDiscord' | 'color'>>): R<void>;
  setSquadEliminated(id: string, reason: string): R<void>;

  // draw & fixtures
  runDraw(): R<unknown>;
  swapInGroups(idA: string, idB: string): R<void>;
  lockGroups(locked: boolean): R<void>;
  initFixtures?(): R<void>;                 // supabase only (demo seeds fixtures locally)
  syncBracket?(): R<void>;                  // supabase only

  // matches
  editMatch(id: string, patch: Partial<Pick<Match, 'date' | 'map' | 'commentatorId' | 'supervisorId'>>): R<void>;
  setKoParticipants(id: string, a: string, b: string): R<void>;
  createTiebreak(group: GroupId, a: string, b: string): R<void>;
  setRoom(id: string, roomId: string, roomPass: string): R<void>;
  confirmReady(id: string): R<void>;
  startMatch(id: string): R<void>;
  submitResult(id: string, winner: string, kills: Record<string, number>, mvp?: string): R<void>;
  verifyResult(id: string): R<void>;
  rejectResult(id: string): R<void>;
  cancelMatch(id: string, reason: string): R<void>;
  postEvent(matchId: string, kind: EventKind, text: string): R<void>;
  sendChat(matchId: string, text: string): R<void>;
  addHighlight(matchId: string, url: string): R<void>;

  // DHD
  placePrediction(matchId: string, pick: string, stake: number, idemKey: string): R<string | undefined>;
  setPredictionsOpen(matchId: string, open: boolean): R<void>;
  cancelPredictions(matchId: string): R<void>;
  setStakeLimits(min: number, max: number): R<void>;
  markRewardPaid(rewardId: string): R<void>;
  markPrizePaid(prize: 'champion' | 'topKiller'): R<void>;
  declareChampion(): R<void>;
  setMatchOfDay(matchId?: string): R<void>;
  updateSettings(patch: Partial<Pick<TournamentState['settings'], 'sniperRule' | 'maxLaptops' | 'enforceRegistrationWindow' | 'victoryReward'>>): R<void>;

  // integrity
  submitReport(input: { target: string; targetSquadId?: string; uid: string; matchNumber?: number; when: string; category: ReportCategory; explanation: string; evidence: string }): R<string | undefined>;
  checkerReview(reportId: string, notes: string, forward: boolean): R<void>;
  supervisorDecide(reportId: string, decision: string, penalty: PenaltyType | 'none', squadId?: string): R<void>;
  issuePenalty(squadId: string, type: PenaltyType, reason: string): R<void>;
  announceReport(reportId: string): R<void>;

  // announcements & staff
  publishAnnouncement(category: AnnouncementCategory, title: string, body: string): R<void>;
  deleteAnnouncement(id: string): R<void>;
  setRoles(userId: string, roles: Role[]): R<void>;
  /** Give staff roles to an email; returns 'applied' (account exists) or 'pending' (on first sign-in). */
  inviteStaff(email: string, roles: Role[]): R<string>;
  removeStaff(email: string): R<void>;

  // website text (admin) — null restores the default wording
  setContent(key: string, value: string | null): R<void>;

  // demo tooling
  resetDemo?(): void;
  loadScenario?(stage: 'groups' | 'knockouts' | 'final' | 'finished'): void;
  simulateNext?(): R<number>;
}
