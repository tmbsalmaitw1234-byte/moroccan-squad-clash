import { Player, PlayerRole, Squad, TournamentState, Tx, User } from '../types';
import { buildFixtures } from './config';
import { rng } from './util';

/** Fictional demo squads — replace with real registrations. */
const SQUAD_DEFS: { name: string; tag: string; color: string; handles: string[] }[] = [
  { name: 'Atlas Wolves', tag: 'ATW', color: '#c1272d', handles: ['Zaki', 'Reaper', 'Amine', 'Tazi'] },
  { name: 'Casablanca Kings', tag: 'CSK', color: '#f5c542', handles: ['Kingo', 'Medo', 'Sniperz', 'Bilal'] },
  { name: 'Rif Raiders', tag: 'RIF', color: '#16a34a', handles: ['Amazigh', 'Nador', 'Wolfy', 'Karim'] },
  { name: 'Sahara Snipers', tag: 'SHS', color: '#f97316', handles: ['Dune', 'Mirage', 'Scope', 'Oasis'] },
  { name: 'Marrakech Phantoms', tag: 'MKP', color: '#a855f7', handles: ['Ghost', 'Jemaa', 'Shade', 'Koutoubia'] },
  { name: 'Tanger Titans', tag: 'TGT', color: '#0ea5e9', handles: ['Strait', 'Titan', 'Hercule', 'Malabata'] },
  { name: 'Fes Falcons', tag: 'FSF', color: '#eab308', handles: ['Falco', 'Medina', 'Talon', 'Qarawi'] },
  { name: 'Agadir Sharks', tag: 'AGS', color: '#06b6d4', handles: ['Shark', 'Taghazout', 'Fin', 'Souss'] },
  { name: 'Rabat Reapers', tag: 'RBR', color: '#ef4444', handles: ['Oudaya', 'Scythe', 'Hassan', 'Chellah'] },
  { name: 'Ouarzazate Storm', tag: 'OZS', color: '#d97706', handles: ['Thunder', 'Kasbah', 'Bolt', 'Draa'] },
  { name: 'Chefchaouen Blue', tag: 'CCB', color: '#3b82f6', handles: ['Azure', 'Rifblue', 'Indigo', 'Akchour'] },
  { name: 'Meknes Vipers', tag: 'MKV', color: '#22c55e', handles: ['Viper', 'Volubilis', 'Fang', 'Ismail'] },
  { name: 'Oujda Outlaws', tag: 'OJO', color: '#e11d48', handles: ['Outlaw', 'Oriental', 'Bandit', 'Saidia'] },
  { name: 'Tetouan Tigers', tag: 'TTT', color: '#fb923c', handles: ['Tiger', 'Martil', 'Stripe', 'Cabo'] },
  { name: 'Kenitra Knights', tag: 'KNK', color: '#94a3b8', handles: ['Knight', 'Sebou', 'Lance', 'Mehdia'] },
  { name: 'Safi Scorpions', tag: 'SFS', color: '#84cc16', handles: ['Sting', 'Sardine', 'Venom', 'Atlantic'] },
];

/** Extra squad used by demo scenarios to fill the 16th slot. */
export const RESERVE_SQUAD = { name: 'Essaouira Waves', tag: 'ESW', color: '#14b8a6', handles: ['Wave', 'Mogador', 'Gnawa', 'Tide'] };

const ROLES: PlayerRole[] = ['IGL', 'Rusher', 'Sniper', 'Support'];

export function makeSquad(def: typeof RESERVE_SQUAD, idx: number, rand: () => number, status: Squad['status']): Squad {
  const id = `sq${idx + 1}`;
  const players: Player[] = def.handles.map((h, i) => ({
    id: `${id}_p${i + 1}`,
    discord: `${h.toLowerCase()}.${def.tag.toLowerCase()}`,
    ffUsername: `${def.tag}${h}`,
    uid: String(1_000_000_000 + Math.floor(rand() * 8_999_999_999)).slice(0, 10),
    ign: `${def.tag}•${h}`,
    role: i === 3 ? 'Flex' : ROLES[i],
    slot: i === 3 ? 'sub' : 'starter',
    isCaptain: i === 0,
  }));
  return {
    id,
    name: def.name,
    tag: def.tag,
    color: def.color,
    captainDiscord: players[0].discord,
    players,
    status,
    createdAt: new Date(Date.UTC(2026, 10, 22, 9 + idx, 15)).toISOString(),
    number: status === 'approved' ? idx + 1 : undefined,
    rejectReason: status === 'rejected' ? 'Duplicate Free Fire UID detected for one player — please re-submit with the correct UID.' : undefined,
  };
}

const FAN_NAMES = ['Anas', 'Hiba', 'Youssef', 'Khadija', 'Mehdi', 'Sara', 'Ilyas', 'Aya', 'Soufiane', 'Rania', 'Adam', 'Lina'];

export function seedState(): TournamentState {
  const rand = rng(2026);
  const squads = SQUAD_DEFS.map((d, i) => makeSquad(d, i, rand, i < 14 ? 'approved' : i === 14 ? 'pending' : 'rejected'));

  const users: User[] = [
    { id: 'u_admin', name: 'Yassine', discord: 'yassine.td', roles: ['admin', 'supervisor'], avatarColor: '#f5c542' },
    { id: 'u_sup', name: 'Salma', discord: 'salma.sup', roles: ['supervisor'], avatarColor: '#a855f7' },
    { id: 'u_host', name: 'Hamza', discord: 'hamza.host', roles: ['hoster'], avatarColor: '#0ea5e9' },
    { id: 'u_cc', name: 'Imane', discord: 'imane.check', roles: ['cheat_checker'], avatarColor: '#ef4444' },
    { id: 'u_counter', name: 'Omar', discord: 'omar.count', roles: ['counter'], avatarColor: '#22c55e' },
    { id: 'u_comm1', name: 'Reda', discord: 'reda.cast', roles: ['commentator'], avatarColor: '#f97316' },
    { id: 'u_comm2', name: 'Nour', discord: 'nour.cast', roles: ['commentator'], avatarColor: '#ec4899' },
    { id: 'u_cap', name: 'Zaki (Captain, Atlas Wolves)', discord: 'zaki.atw', roles: ['captain'], squadId: 'sq1', avatarColor: '#c1272d' },
    { id: 'u_fan', name: 'Guest Fan', discord: 'guest.fan', roles: ['viewer'], avatarColor: '#64748b' },
    ...FAN_NAMES.map((n, i) => ({
      id: `u_bot${i}`,
      name: n,
      discord: `${n.toLowerCase()}${10 + i}`,
      roles: ['viewer'] as User['roles'],
      avatarColor: `hsl(${(i * 37) % 360} 70% 55%)`,
    })),
  ];
  squads[0].ownerUserId = 'u_cap';

  const startingBalance = 1000;
  const txs: Tx[] = users.map((u) => ({
    id: `tx_grant_${u.id}`,
    userId: u.id,
    amount: startingBalance,
    kind: 'grant',
    ref: 'welcome',
    memo: 'Welcome grant (simulated DHD wallet)',
    idemKey: `grant:${u.id}`,
    createdAt: new Date(Date.UTC(2026, 10, 19)).toISOString(),
  }));

  const matches = buildFixtures();
  matches.forEach((m) => {
    m.commentatorId = m.number % 2 ? 'u_comm1' : 'u_comm2';
    m.supervisorId = m.stage === 'group' ? 'u_sup' : 'u_admin';
  });

  return {
    version: 1,
    squads,
    users,
    matches,
    groups: { A: [], B: [], C: [], D: [] },
    groupsLocked: false,
    drawDone: false,
    predictions: [],
    txs,
    rewards: [],
    events: [],
    chat: [],
    reports: [],
    penalties: [],
    announcements: [
      {
        id: 'an_welcome',
        category: 'registration',
        title: '📝 Registration opens November 22!',
        body: 'Squad captains: registration for FREE FIRE: MOROCCAN SQUAD CLASH 🇲🇦 opens on November 22 and closes November 24. 16 slots only — 3 starters + 1 substitute per squad. Read the rules before you submit.',
        authorId: 'u_admin',
        at: new Date(Date.UTC(2026, 10, 19, 12)).toISOString(),
      },
    ],
    audit: [],
    settings: {
      minStake: 10,
      maxStake: 500,
      startingBalance,
      victoryReward: 200,
      enforceRegistrationWindow: false,
      sniperRule: {
        enabled: true,
        confirmed: false,
        text: 'One sniper setup requires two registered sniper players. If a second sniper is present in the same squad, only one sniper may be used at a time.',
      },
      maxLaptops: 2,
    },
    prizeStatus: { champion: 'pending', topKiller: 'pending' },
  };
}
