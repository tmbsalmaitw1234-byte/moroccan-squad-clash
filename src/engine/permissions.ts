import { Match, Role, User } from '../types';

export type Permission =
  | 'registration.review'
  | 'squad.edit'
  | 'draw.run'
  | 'match.edit'
  | 'room.manage'
  | 'match.start'
  | 'result.submit'
  | 'result.verify'
  | 'match.cancel'
  | 'commentary.post'
  | 'predictions.manage'
  | 'rewards.manage'
  | 'report.review'
  | 'report.decide'
  | 'penalty.issue'
  | 'announce'
  | 'staff.manage'
  | 'champion.declare'
  | 'audit.view'
  | 'room.view.all'
  | 'identity.verify';

export const ROLE_PERMS: Record<Role, Permission[]> = {
  viewer: [],
  captain: [],
  commentator: ['commentary.post'],
  hoster: ['room.manage', 'match.start', 'room.view.all'],
  cheat_checker: ['report.review', 'identity.verify', 'room.view.all'],
  counter: ['result.submit', 'result.verify', 'room.view.all'],
  supervisor: ['result.verify', 'match.cancel', 'report.review', 'report.decide', 'penalty.issue', 'announce', 'audit.view', 'room.view.all'],
  admin: [
    'registration.review', 'squad.edit', 'draw.run', 'match.edit', 'room.manage', 'match.start', 'result.submit',
    'result.verify', 'match.cancel', 'commentary.post', 'predictions.manage', 'rewards.manage', 'report.review',
    'announce', 'staff.manage', 'champion.declare', 'audit.view', 'room.view.all', 'identity.verify',
  ],
};

export const ROLE_META: Record<Role, { label: string; icon: string; color: string; duties: string[] }> = {
  admin: { label: 'Administrator', icon: '⚙️', color: '#f5c542', duties: ['Runs the platform', 'Approves registrations', 'Generates & locks groups', 'Manages DHD economy', 'Declares the champion'] },
  supervisor: { label: 'Supervisor', icon: '👁️', color: '#a855f7', duties: ['Handles disputes', 'Reviews investigations', 'Approves decisions', 'Issues penalties', 'Has final authority'] },
  hoster: { label: 'Hoster', icon: '🎙️', color: '#0ea5e9', duties: ['Creates custom rooms', 'Publishes room credentials', 'Checks teams', 'Starts matches'] },
  cheat_checker: { label: 'Cheat Checker', icon: '🛡️', color: '#ef4444', duties: ['Verifies player identities', 'Checks UIDs', 'Monitors suspicious activity', 'Collects evidence', 'Reviews reports'] },
  counter: { label: 'Counter', icon: '📊', color: '#22c55e', duties: ['Records winners', 'Verifies results', 'Updates standings', 'Tracks kills', 'Updates leaderboards'] },
  commentator: { label: 'Commentator', icon: '🎤', color: '#f97316', duties: ['Announces match start', 'Introduces squads', 'Publishes live updates & kills', 'Announces MVP'] },
  captain: { label: 'Squad Captain', icon: '🧢', color: '#c1272d', duties: ['Registers the squad', 'Confirms readiness', 'Responsible for squad conduct'] },
  viewer: { label: 'Community Member', icon: '👤', color: '#64748b', duties: ['Watches matches', 'Predicts with DHD', 'Submits reports'] },
};

export function can(u: User | undefined, p: Permission): boolean {
  if (!u) return false;
  return u.roles.some((r) => ROLE_PERMS[r].includes(p));
}

export function isStaff(u: User | undefined) {
  return !!u && u.roles.some((r) => r !== 'viewer' && r !== 'captain');
}

/** Room credentials: staff with room access, or registered members of the two squads. */
export function canSeeRoom(u: User | undefined, m: Match) {
  if (!u) return false;
  if (can(u, 'room.view.all')) return true;
  return !!u.squadId && (u.squadId === m.a || u.squadId === m.b);
}
