/**
 * Every piece of editable website text, with its default wording.
 * Admins change these from the site (✏️ Edit text, or Admin → Site text);
 * edits are saved as overrides, so a "Reset" always brings back this default.
 *
 * Formatting you can use in any text:
 *   **word**     → highlighted (accent colour)
 *   new line     → line break  (in list texts: one item per line)
 *   {maxStake}   → live values where a text mentions them (see `vars` in the page)
 */
export interface TextDef {
  label: string;
  value: string;
  list?: boolean; // one item per line
}

const page = (name: string, kicker: string, title: string, subtitle: string): Record<string, TextDef> => ({
  [`${name}.kicker`]: { label: `${name} page — small heading`, value: kicker },
  [`${name}.title`]: { label: `${name} page — title`, value: title },
  [`${name}.subtitle`]: { label: `${name} page — description`, value: subtitle },
});

export const TEXT_DEFAULTS: Record<string, TextDef> = {
  /* ───── Site-wide ───── */
  'site.brand': { label: 'Logo name (sidebar)', value: 'Squad Clash' },
  'site.brandSub': { label: 'Logo subtitle (sidebar)', value: 'Free Fire' },
  'site.footer': { label: 'Footer', value: 'FREE FIRE: MOROCCAN SQUAD CLASH · Community tournament — not affiliated with Garena. DHD is a virtual Discord currency with no real-money value.' },

  /* ───── Home ───── */
  'home.kicker': { label: 'Home — above the title', value: '🏆 Free Fire Edition' },
  'home.title': { label: 'Home — big title (**word** = coloured)', value: 'Moroccan\n**Squad Clash**' },
  'home.line1': { label: 'Home — slogan part 1', value: '16 Squads.' },
  'home.line2': { label: 'Home — slogan part 2 (green)', value: '8 Days.' },
  'home.line3': { label: 'Home — slogan part 3 (gold)', value: 'One Champion.' },
  'home.quote': { label: 'Home — quote', value: '“7 DAYS TO PROVE YOURSELF. 1 DAY TO TAKE THE CROWN.”' },
  'home.prizeBadge': { label: 'Home — prize badge', value: 'Prize pool · 500 MAD + DHD + 530 💎' },
  'home.ctaRegister': { label: 'Home — register button', value: '📝 Register Your Squad' },
  'home.ctaPredict': { label: 'Home — predictions button', value: '🎰 DHD Prediction Arena' },
  'home.ctaSchedule': { label: 'Home — schedule button', value: '🗓️ Schedule' },
  'home.crownTitle': { label: 'Home — champion box before the final', value: 'The crown awaits…' },
  'home.crownText': { label: 'Home — champion box text before the final', value: 'Champions will be revealed after the Grand Final on December 2, 2026.' },

  /* ───── Page headers ───── */
  ...page('overview', 'Tournament Overview', 'The Road to the Crown', '16 squads, 4 groups, a full round-robin league, then single-elimination knockouts all the way to the Grand Final.'),
  ...page('register', 'Registration · Nov 22–24', 'Register your squad', 'Captains register the whole squad: 3 starting players + 1 substitute. Staff verify every UID before approval — only approved squads take part.'),
  ...page('squads', 'Squads', 'The contenders', 'Every registered squad — only approved squads compete.'),
  ...page('draw', 'Official Group Draw · Nov 24', 'Group draw', '16 approved squads are randomly distributed into 4 groups of 4. Only administrators can run or modify the official draw. Once locked, fixtures are generated automatically.'),
  ...page('standings', 'Group Stage · Days 1–5', 'League standings', 'Victory = 3 points · Defeat = 0. Kills and placement do not count. Tie-breakers: points → head-to-head → deciding match. Tables update automatically after staff verify a result.'),
  ...page('schedule', 'Match Calendar', 'Match schedule', '32 official matches across 8 days. All times are Morocco time (UTC+1). Each matchup has its own custom room — credentials are visible only to the two squads and authorised staff.'),
  ...page('live', 'Live Match Center', 'Live **center**', 'Real-time commentary, match events, official results and viewer chat for every match.'),
  ...page('bracket', 'Knockout Stage · Days 6–8', 'Knockout bracket', 'Single elimination. The bracket fills itself automatically as staff verify results — group winners and runners-up cross over, winners advance, losers are eliminated.'),
  ...page('killers', '🎯 Top Killer Race · 530 Diamonds', 'Leaderboards', 'Official verified results only. Kills count for the Top Killer award and statistics — they never affect squad qualification.'),
  ...page('predict', '🎰 Predict & Win', 'DHD **Prediction Arena**', "Predict match winners with your Discord server's virtual DHD. Transparent pool-based (pari-mutuel) rewards — no fixed odds."),
  ...page('prizes', 'Prize System', 'Prizes & rewards', 'Official prizes and the cumulative 200 DHD victory bonus. Rewards are created automatically when staff verify a win, and marked paid once distributed on Discord.'),
  ...page('rules', 'Rules & Regulations', 'Official rules', 'Every player, captain and staff member is bound by these rules. Registration requires confirming that all squad members have read them.'),
  ...page('report', 'Integrity', 'Report a player', 'Reports go to the Cheat Checker team first, then the Supervisor. A report does not automatically mean guilt.'),
  ...page('staff', 'Tournament Staff', 'Meet the crew', "Every staff member acts only within their role's permissions. All important actions are written to the audit log."),

  /* ───── Overview ───── */
  'overview.registrationItems': { label: 'Overview — registration facts', list: true, value: '🛡️ 16 squads max\n👥 3 starters + 1 sub\n🧢 1 captain per squad\n✅ Staff approval required' },
  'overview.format': { label: 'Overview — format & points (Label :: text)', list: true, value: 'Days 1–5 :: **Group stage league** — 4 groups of 4, every squad plays every squad in its group (6 matches per group, 24 total).\nPoints :: Victory = **3**, defeat = **0**. No kill or placement points.\nTie-breakers :: 1. League points → 2. Head-to-head → 3. Additional deciding match.\nQualification :: Top 2 of each group advance (8 squads). Bottom 2 are eliminated.\nDays 6–8 :: Quarter-finals → Semi-finals → **Grand Final**. Lose and you\'re out.' },

  /* ───── Rules ───── */
  'rules.official': { label: 'Rules — official rules', list: true, value: 'Custom Rooms only.\nBermuda maps.\nAll players must join their assigned room on time.\nNo cheating or unauthorized tools.\nNo exploiting bugs.\nNo teaming with opponents.\nNo account sharing.\nNo impersonation.\nRespect players and staff.\nLosing squads are eliminated from the applicable knockout match.\nAll participants must use their registered accounts.\nCaptains are responsible for their squads.\nStaff decisions must be respected.' },
  'rules.equipment': { label: 'Rules — equipment rules ({laptops} = max laptops setting)', list: true, value: '💻 Maximum **{laptops} laptops** per squad.\n🔁 Every squad must have at least **1 registered substitute**.\n🔫 All weapons must use their **default appearance**.\n🚫 **Weapon skins are prohibited.**' },
  'rules.points': { label: 'Rules — points & tie-breakers', list: true, value: 'Victory = 3 points · Defeat = 0 points\nNo kill points, no placement points\nTie-breakers: 1) league points 2) head-to-head 3) additional deciding match\nTop 2 per group qualify; bottom 2 are eliminated' },
  'rules.penalties': { label: 'Rules — penalties (in order)', list: true, value: '⚠️ Official Warning\n⛔ Match Disqualification\n❌ Tournament Disqualification' },
  'rules.penaltyNote': { label: 'Rules — penalty note', value: 'The Supervisor has final authority. Only the Supervisor can issue official penalties.' },

  /* ───── Registration ───── */
  'register.rules': { label: 'Registration — rules checklist', list: true, value: 'Maximum 16 squads\nNo duplicate UIDs (checked across all squads)\nNo unauthorized players\nCaptains are responsible for their squads\nStaff must approve registrations' },
  'register.confirm': { label: 'Registration — confirmation checkbox', value: 'I confirm all 4 members have read and accept the tournament rules.' },
  'register.done': { label: 'Registration — after submitting', value: 'Your squad is now **pending approval**. A Cheat Checker will verify UIDs, then an administrator approves or rejects the registration.' },

  /* ───── Predictions ───── */
  'predict.rules': { label: 'Predictions — system rules ({maxStake} = max stake)', list: true, value: 'Virtual DHD only — never real money\nDHD cannot be exchanged for cash\nPredictions lock when the match starts\nNo changing predictions after locking\nCancelled matches refund all stakes\nMax {maxStake} DHD per member per match\nStaff verify results before rewards are paid\nIf nobody picked the winner, all stakes are refunded\nPlayers cannot predict on their own matches' },

  /* ───── Prizes ───── */
  'prizes.championTitle': { label: 'Prizes — champion title', value: 'Grand Champion' },
  'prizes.championValue': { label: 'Prizes — champion prize', value: '500 MAD' },
  'prizes.championSub': { label: 'Prizes — champion description', value: '500 Moroccan Dirhams' },
  'prizes.victoryTitle': { label: 'Prizes — victory bonus title', value: 'Match Victory Bonus' },
  'prizes.victoryValue': { label: 'Prizes — victory bonus', value: '200 DHD' },
  'prizes.victorySub': { label: 'Prizes — victory bonus description', value: 'For every verified victory — cumulative (3 wins = 600 DHD)' },
  'prizes.killerTitle': { label: 'Prizes — top killer title', value: 'Top Killer' },
  'prizes.killerValue': { label: 'Prizes — top killer prize', value: '530 💎' },
  'prizes.killerSub': { label: 'Prizes — top killer description', value: 'Free Fire Diamonds · highest verified kills' },

  /* ───── Report ───── */
  'report.rules': { label: 'Report — report rules', list: true, value: '✅ Genuine evidence only\n✅ Explain the issue clearly\n🚫 No false accusations\n🚫 No spam\n🚫 No harassment\n🎮 Reports must concern the tournament' },
  'report.process': { label: 'Report — investigation steps', list: true, value: 'Player submits report\nCheat Checker reviews evidence\nSupervisor investigates\nSupervisor makes final decision\nStaff announces the outcome' },

  /* ───── Staff ───── */
  'staff.duties': { label: 'Staff — separation of duties', list: true, value: '📊 A result submitted by one staff member must be verified by a **different** staff member (four-eyes rule).\n🎤 Commentators publish commentary only — they **cannot** modify official results.\n👁️ Only the **Supervisor** can issue official penalties and close investigations.\n🔐 Room credentials are visible only to the two squads and staff with room access.' },

  /* ───── Champion ceremony ───── */
  'champions.kicker': { label: 'Ceremony — small heading', value: '👑 Moroccan Squad Clash Champions' },
  'champions.title': { label: 'Ceremony — title', value: '🏆 The Champions of Morocco' },
  'champions.quote': { label: 'Ceremony — closing quote', value: '“One tournament. Sixteen squads. One crown.”' },
};

export const TEXT_GROUPS: { id: string; label: string }[] = [
  { id: 'site', label: 'Site-wide' }, { id: 'home', label: 'Home' }, { id: 'overview', label: 'Overview' },
  { id: 'register', label: 'Registration' }, { id: 'squads', label: 'Squads' }, { id: 'draw', label: 'Group draw' },
  { id: 'standings', label: 'Standings' }, { id: 'schedule', label: 'Schedule' }, { id: 'live', label: 'Live center' },
  { id: 'bracket', label: 'Bracket' }, { id: 'killers', label: 'Leaderboards' }, { id: 'predict', label: 'Predictions' },
  { id: 'prizes', label: 'Prizes' }, { id: 'rules', label: 'Rules' }, { id: 'report', label: 'Report' },
  { id: 'staff', label: 'Staff' }, { id: 'champions', label: 'Champion ceremony' },
];
