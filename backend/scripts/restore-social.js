#!/usr/bin/env node
/**
 * Rebuild friends and clans from @handles.
 *
 * Friendships, clans and clan membership live only in SQLite — Supabase holds
 * profiles, portfolios and positions, nothing social — so when that database
 * goes, there is nothing to derive the pairs from. This takes the handles and
 * writes the rows, which beats clicking through the app.
 *
 *   node scripts/restore-social.js --friends "alice+bob, alice+carol"
 *   node scripts/restore-social.js --clan "Night Owls|OWL|alice|bob,carol|#e2e8f0"
 *   node scripts/restore-social.js --file social.json
 *   node scripts/restore-social.js --file social.json --dry-run
 *
 * social.json:
 *   {
 *     "friends": [["alice", "bob"], ["alice", "carol"]],
 *     "clans": [{ "name": "Night Owls", "tag": "OWL", "owner": "alice",
 *                 "members": ["bob", "carol"], "color": "#e2e8f0", "description": "" }]
 *   }
 *
 * Handles are resolved against Supabase profiles, so it needs SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY. Idempotent: existing friendships and clans are
 * left alone, and a user already in a clan is never moved out of it.
 */
require('dotenv').config();
const fs = require('fs');

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const all = (name) => argv.reduce((acc, a, i) => (a === name && argv[i + 1] ? [...acc, argv[i + 1]] : acc), []);
const one = (name) => all(name)[0] || null;

const clean = (s) => String(s || '').trim().replace(/^@/, '');

/** "alice+bob, alice+carol" -> [['alice','bob'], ['alice','carol']] */
function parseFriends(spec) {
  return spec.split(',').map((pair) => pair.split('+').map(clean)).filter((p) => p.length === 2 && p[0] && p[1]);
}

/** "Night Owls|OWL|alice|bob,carol|#e2e8f0|description" */
function parseClan(spec) {
  const [name, tag, owner, members, color, description] = spec.split('|');
  return {
    name: String(name || '').trim(),
    tag: String(tag || '').trim(),
    owner: clean(owner),
    members: String(members || '').split(',').map(clean).filter(Boolean),
    color: (color || '').trim() || undefined,
    description: (description || '').trim() || undefined,
  };
}

function readPlan() {
  const file = one('--file');
  const plan = { friends: [], clans: [] };
  if (file) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(raw.friends)) plan.friends.push(...raw.friends.map((p) => p.map(clean)));
    if (Array.isArray(raw.clans)) plan.clans.push(...raw.clans.map((c) => ({ ...c, owner: clean(c.owner), members: (c.members || []).map(clean) })));
  }
  for (const spec of all('--friends')) plan.friends.push(...parseFriends(spec));
  for (const spec of all('--clan')) plan.clans.push(parseClan(spec));
  return plan;
}

async function resolveHandles(handles) {
  const want = [...new Set(handles.filter(Boolean))];
  if (!want.length) return new Map();
  const { supabase } = require('../src/services/supabaseAdmin');
  const { data, error } = await supabase.from('profiles').select('user_id, username').in('username', want);
  if (error) throw new Error(`could not read profiles: ${error.message}`);
  // Usernames are compared case-insensitively here because the clans table is
  // NOCASE and people do not type their friends' handles consistently.
  const byLower = new Map((data || []).map((p) => [String(p.username).toLowerCase(), p.user_id]));
  return new Map(want.map((h) => [h, byLower.get(h.toLowerCase()) || null]));
}

async function main() {
  const plan = readPlan();
  if (!plan.friends.length && !plan.clans.length) {
    console.log('nothing to do. Pass --friends, --clan or --file (see the top of this file).');
    return;
  }

  const handles = [
    ...plan.friends.flat(),
    ...plan.clans.flatMap((c) => [c.owner, ...(c.members || [])]),
  ];
  const ids = await resolveHandles(handles);
  const unknown = [...ids].filter(([, v]) => !v).map(([k]) => k);
  if (unknown.length) {
    console.log(`unknown handle(s): ${unknown.join(', ')}`);
    console.log('These have no Supabase profile. Check the spelling, or have them sign up first.');
  }

  const db = require('../src/db/schema').getDb();
  const id = (h) => ids.get(h) || null;
  const report = { friends: 0, friendsExisting: 0, clans: 0, clansExisting: 0, members: 0, membersElsewhere: 0, skipped: 0 };

  const insertFriend = db.prepare("INSERT OR IGNORE INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'accepted')");
  const hasFriend = db.prepare('SELECT 1 FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)');

  for (const [a, b] of plan.friends) {
    const [ua, ub] = [id(a), id(b)];
    if (!ua || !ub || ua === ub) { report.skipped++; continue }
    if (hasFriend.get(ua, ub, ub, ua)) { report.friendsExisting++; continue }
    if (!DRY) insertFriend.run(ua, ub);
    report.friends++;
    console.log(`  friends: ${a} + ${b}`);
  }

  const findClan = db.prepare('SELECT id, owner_id FROM clans WHERE name = ? COLLATE NOCASE OR tag = ? COLLATE NOCASE');
  const insertClan = db.prepare('INSERT INTO clans (name, tag, description, color, owner_id) VALUES (?, ?, ?, ?, ?)');
  const memberOf = db.prepare('SELECT clan_id FROM clan_members WHERE user_id = ?');
  const insertMember = db.prepare('INSERT INTO clan_members (user_id, clan_id, role) VALUES (?, ?, ?)');

  for (const c of plan.clans) {
    const owner = id(c.owner);
    if (!c.name || !c.tag || !owner) { console.log(`  clan ${c.name || '(unnamed)'}: skipped — needs a name, a tag and a known owner`); report.skipped++; continue }

    let clanId = findClan.get(c.name, c.tag)?.id;
    if (clanId) { report.clansExisting++; console.log(`  clan ${c.name} [${c.tag}]: already exists`) }
    else if (DRY) { console.log(`  clan ${c.name} [${c.tag}]: would create, owner ${c.owner}`); report.clans++ }
    else {
      clanId = Number(insertClan.run(c.name, c.tag, c.description || '', c.color || '#e2e8f0', owner).lastInsertRowid);
      report.clans++;
      console.log(`  clan ${c.name} [${c.tag}]: created, owner ${c.owner}`);
    }

    // clan_members has user_id as its primary key: one clan per person. Someone
    // already in a clan is left where they are rather than quietly moved.
    for (const [handle, role] of [[c.owner, 'owner'], ...(c.members || []).map((m) => [m, 'member'])]) {
      const uid = id(handle);
      if (!uid) continue;
      const existing = memberOf.get(uid)?.clan_id;
      if (existing != null) {
        if (clanId != null && existing !== clanId) { report.membersElsewhere++; console.log(`    ${handle}: already in clan ${existing}, left alone`) }
        continue;
      }
      if (!DRY && clanId != null) insertMember.run(uid, clanId, role);
      report.members++;
      console.log(`    ${handle}: ${role}`);
    }
  }

  const { summarise, tableRowCounts } = require('../src/db/stats');
  const after = summarise(tableRowCounts(db));
  console.log(`\n${DRY ? 'would write' : 'wrote'}: ${report.friends} friendship(s), ${report.clans} clan(s), ${report.members} membership(s)`);
  if (report.friendsExisting || report.clansExisting || report.membersElsewhere || report.skipped) {
    console.log(`already there: ${report.friendsExisting} friendship(s), ${report.clansExisting} clan(s)${report.membersElsewhere ? `, ${report.membersElsewhere} member(s) in another clan` : ''}${report.skipped ? ` · skipped ${report.skipped}` : ''}`);
  }
  console.log(`database now: ${after.total} rows${after.social.length ? ` · ${after.social.join(' ')}` : ''}`);
  if (DRY) console.log('\n--dry-run: nothing was written.');
}

main().catch((e) => {
  if (/bindings file|NODE_MODULE_VERSION/.test(e.message)) {
    console.error(`better-sqlite3 has no build for this Node (${process.version}). This project needs Node 22.`);
  } else {
    console.error('restore-social failed:', e.message);
  }
  process.exitCode = 1;
});
