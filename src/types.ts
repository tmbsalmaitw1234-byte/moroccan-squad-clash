export type Role =
  | 'viewer'
  | 'captain'
  | 'commentator'
  | 'hoster'
  | 'cheat_checker'
  | 'counter'
  | 'supervisor'
  | 'admin';

export type GroupId = 'A' | 'B' | 'C' | 'D';
export const GROUPS: GroupId[] = ['A', 'B', 'C', 'D'];

export type PlayerRole = 'IGL' | 'Rusher' | 'Sniper' | 'Support' | 'Flex';

export interface Player {
  id: string;
  discord: string;
  ffUsername: string;
  uid: string;
  ign: string;
  role: PlayerRole;
  slot: 'starter' | 'sub';
  isCaptain: boolean;
}

export type SquadStatus = 'pending' | 'approved' | 'rejected';

export interface Squad {
  id: string;
  number?: number;
  name: string;
  tag: string;
  color: string;
  logo?: string; // data URL (demo) / storage URL (backend)
  captainDiscord: string;
  players: Player[];
  status: SquadStatus;
  rejectReason?: string;
  createdAt: string;
  ownerUserId?: string;
  disqualified?: boolean;
}

export type Stage = 'group' | 'qf' | 'sf' | 'final' | 'tiebreak';
export type MatchStatus = 'upcoming' | 'ready' | 'live' | 'review' | 'completed' | 'cancelled';

export type Source =
  | { type: 'slot'; group: GroupId; slot: number }
  | { type: 'group'; group: GroupId; pos: 1 | 2 }
  | { type: 'winner'; label: string }
  | { type: 'fixed' };

export interface Match {
  id: string;
  number: number;
  label: string; // e.g. "A-R1", "QF1"
  stage: Stage;
  group?: GroupId;
  round?: number;
  day: number;
  date: string; // ISO with +01:00
  srcA: Source;
  srcB: Source;
  a?: string;
  b?: string;
  map: string;
  roomId?: string;
  roomPass?: string;
  status: MatchStatus;
  readyA: boolean;
  readyB: boolean;
  commentatorId?: string;
  supervisorId?: string;
  pending?: { winner: string; kills: Record<string, number>; mvp?: string; by: string; at: string };
  winner?: string;
  kills: Record<string, number>;
  mvp?: string;
  predictionsOpen: boolean;
  settled: boolean;
  startedAt?: string;
  completedAt?: string;
  highlights: string[];
}

export interface User {
  id: string;
  name: string;
  discord: string;
  roles: Role[];
  squadId?: string;
  avatarColor: string;
}

export type PredictionStatus = 'open' | 'won' | 'lost' | 'refunded';

export interface Prediction {
  id: string;
  userId: string;
  matchId: string;
  pick: string;
  stake: number;
  status: PredictionStatus;
  payout: number;
  createdAt: string;
}

export type TxKind = 'grant' | 'stake' | 'payout' | 'refund';

export interface Tx {
  id: string;
  userId: string;
  amount: number;
  kind: TxKind;
  ref: string;
  memo: string;
  idemKey: string;
  createdAt: string;
}

export interface SquadReward {
  id: string;
  squadId: string;
  matchId: string;
  amount: number;
  status: 'pending' | 'paid';
  paidAt?: string;
}

export type EventKind = 'start' | 'intro' | 'update' | 'moment' | 'kill' | 'result' | 'mvp' | 'system';

export interface MatchEvent {
  id: string;
  matchId: string;
  authorId: string;
  kind: EventKind;
  text: string;
  at: string;
}

export interface ChatMsg {
  id: string;
  matchId: string;
  userId: string;
  text: string;
  at: string;
}

export type ReportCategory =
  | 'cheating'
  | 'unauthorized_player'
  | 'incorrect_uid'
  | 'rule_violation'
  | 'room_problem'
  | 'incorrect_result'
  | 'unfair_behavior';

export type ReportStatus = 'submitted' | 'checker_review' | 'investigation' | 'decided' | 'announced' | 'dismissed';

export type PenaltyType = 'warning' | 'match_dq' | 'tournament_dq';

export interface Report {
  id: string;
  reporterId: string;
  reporterName: string;
  target: string;
  targetSquadId?: string;
  uid: string;
  matchNumber?: number;
  when: string;
  category: ReportCategory;
  explanation: string;
  evidence: string;
  status: ReportStatus;
  checkerNotes?: string;
  checkerId?: string;
  decision?: string;
  penalty?: PenaltyType | 'none';
  decidedBy?: string;
  createdAt: string;
}

export interface Penalty {
  id: string;
  squadId: string;
  type: PenaltyType;
  reason: string;
  reportId?: string;
  issuedBy: string;
  at: string;
}

export type AnnouncementCategory =
  | 'registration'
  | 'draw'
  | 'schedule'
  | 'match_start'
  | 'room'
  | 'qualified'
  | 'eliminated'
  | 'investigation'
  | 'prize'
  | 'final'
  | 'champion'
  | 'general';

export interface Announcement {
  id: string;
  category: AnnouncementCategory;
  title: string;
  body: string;
  authorId: string;
  at: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  action: string;
  detail: string;
}

export interface Settings {
  minStake: number;
  maxStake: number;
  startingBalance: number;
  victoryReward: number;
  enforceRegistrationWindow: boolean;
  sniperRule: { enabled: boolean; confirmed: boolean; text: string };
  maxLaptops: number;
  matchOfDay?: string;
}

export interface TournamentState {
  version: number;
  squads: Squad[];
  users: User[];
  matches: Match[];
  groups: Record<GroupId, string[]>;
  groupsLocked: boolean;
  drawDone: boolean;
  predictions: Prediction[];
  txs: Tx[];
  rewards: SquadReward[];
  events: MatchEvent[];
  chat: ChatMsg[];
  reports: Report[];
  penalties: Penalty[];
  announcements: Announcement[];
  audit: AuditEntry[];
  settings: Settings;
  championId?: string;
  championDeclaredAt?: string;
  prizeStatus: { champion: 'pending' | 'paid'; topKiller: 'pending' | 'paid' };
  /** Admin-edited website text, keyed like src/content/defaults.ts. Missing key = default text. */
  content?: Record<string, string>;
  /** Staff access by email — only loaded for administrators. */
  staff?: StaffAccess[];
}

export interface StaffAccess {
  email: string;
  userId?: string;
  name?: string;
  roles: Role[];
  signedUp: boolean;
}
