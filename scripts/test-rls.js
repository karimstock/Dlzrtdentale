// =============================================
// JADOMI — Tests RLS end-to-end sur Supabase
// Crée 2 users + 2 sociétés (silos), puis tente cross-access.
// Doit retourner 0 (ok) si toutes les tentatives de fuite sont bloquées.
//
// Usage :
//   node scripts/test-rls.js
//
// Variables d'env requises :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (admin),
//   SUPABASE_ANON_KEY ou SUPABASE_PUBLIC_KEY (pour signin user)
// =============================================
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLIC_KEY || 'sb_publishable_RcfR0_sq5Z-oWK97ij27Yw_tGfur7UF';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis dans .env');
  process.exit(2);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken:false, persistSession:false } });

const TS = Date.now();
const USER_A = { email: `rls-test-a-${TS}@jadomi.test`, password: 'RlsTestABC!' };
const USER_B = { email: `rls-test-b-${TS}@jadomi.test`, password: 'RlsTestXYZ!' };

const results = [];
function assert(label, cond, detail) {
  const ok = !!cond;
  results.push({ label, ok, detail: detail || '' });
  const sym = ok ? '✅' : '❌';
  console.log(`${sym} ${label}${detail?' — '+detail:''}`);
}

async function createUser(email, password) {
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true
  });
  if (error && !String(error.message).includes('already registered')) throw error;
  if (data?.user) return data.user;
  // existing : fetch
  const { data: users } = await admin.auth.admin.listUsers();
  return (users?.users || []).find(u => (u.email||'').toLowerCase() === email.toLowerCase());
}

async function signin(email, password) {
  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  // Renvoie un client authentifié (utilise le token user)
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function createSociete(ownerId, nom, type='societe_commerciale') {
  const { data, error } = await admin.from('societes').insert({
    owner_id: ownerId, type, nom
  }).select('*').single();
  if (error) throw error;
  return data;
}

async function seedData(societeId) {
  // Insère quelques données dans différents modules pour tester l'isolation
  const out = {};
  // clients
  const { data: cli } = await admin.from('clients_societe').insert({
    societe_id: societeId, type: 'professionnel', raison_sociale: 'Test Client', email: 'cli@test'
  }).select('id').single();
  out.client_id = cli?.id;
  // produits
  const { data: prod } = await admin.from('produits_societe').insert({
    societe_id: societeId, designation: 'Service de test', prix_ht: 100, taux_tva: 20
  }).select('id').single();
  out.produit_id = prod?.id;
  return out;
}

async function cleanup(userIds, societeIds) {
  for (const sid of societeIds) {
    try { await admin.from('societes').delete().eq('id', sid); } catch {}
  }
  for (const uid of userIds) {
    try { await admin.auth.admin.deleteUser(uid); } catch {}
  }
}

(async () => {
  let userA, userB, clientA, clientB, socA, socB, dataA, dataB;
  const userIds = [], societeIds = [];
  console.log('\n=== JADOMI — Tests RLS multi-sociétés ===\n');
  try {
    // Setup
    userA = await createUser(USER_A.email, USER_A.password);
    userB = await createUser(USER_B.email, USER_B.password);
    userIds.push(userA.id, userB.id);
    assert('Setup — user A créé', !!userA);
    assert('Setup — user B créé', !!userB);

    socA = await createSociete(userA.id, 'Société Alpha (test)');
    socB = await createSociete(userB.id, 'Société Beta (test)');
    societeIds.push(socA.id, socB.id);
    assert('Setup — société A créée', !!socA);
    assert('Setup — société B créée', !!socB);

    dataA = await seedData(socA.id);
    dataB = await seedData(socB.id);

    // Sign in chaque user → client avec JWT
    clientA = await signin(USER_A.email, USER_A.password);
    clientB = await signin(USER_B.email, USER_B.password);
    assert('Setup — signin A', !!clientA);
    assert('Setup — signin B', !!clientB);

    // === TEST 1 : user A ne voit QUE sa société ===
    const { data: socsA, error: eA } = await clientA.from('societes').select('id, nom');
    assert('RLS societes — A ne voit que sa société',
      !eA && (socsA||[]).length === 1 && socsA[0].id === socA.id,
      eA?.message || `${(socsA||[]).length} société(s) visible(s)`);

    // === TEST 2 : user B ne voit QUE sa société ===
    const { data: socsB } = await clientB.from('societes').select('id, nom');
    assert('RLS societes — B ne voit que sa société',
      (socsB||[]).length === 1 && socsB[0].id === socB.id,
      `${(socsB||[]).length} société(s) visible(s)`);

    // === TEST 3 : user A tente SELECT direct sur société de B ===
    const { data: leakSoc } = await clientA.from('societes').select('id').eq('id', socB.id);
    assert('RLS societes — A ne peut pas SELECT société B par ID',
      (leakSoc||[]).length === 0,
      `leak: ${(leakSoc||[]).length} row`);

    // === TEST 4 : user A tente SELECT sur clients_societe de B ===
    const { data: leakCli } = await clientA.from('clients_societe').select('id').eq('societe_id', socB.id);
    assert('RLS clients_societe — A ne voit pas clients de B',
      (leakCli||[]).length === 0,
      `leak: ${(leakCli||[]).length} row`);

    // === TEST 5 : user A tente SELECT sur produits_societe de B ===
    const { data: leakProd } = await clientA.from('produits_societe').select('id').eq('societe_id', socB.id);
    assert('RLS produits_societe — A ne voit pas produits de B',
      (leakProd||[]).length === 0,
      `leak: ${(leakProd||[]).length} row`);

    // === TEST 6 : user A tente INSERT dans société de B ===
    const { error: insErr } = await clientA.from('clients_societe').insert({
      societe_id: socB.id, type: 'professionnel', raison_sociale: 'HACK'
    });
    assert('RLS clients_societe — A ne peut pas INSERT chez B',
      !!insErr,
      insErr?.message || 'aucune erreur retournée');

    // === TEST 7 : user A tente UPDATE société de B ===
    const { error: updErr } = await clientA.from('societes').update({ nom:'HACKED' }).eq('id', socB.id);
    const { data: afterUpd } = await admin.from('societes').select('nom').eq('id', socB.id).single();
    assert('RLS societes — A ne peut pas UPDATE société B',
      afterUpd?.nom !== 'HACKED',
      `nom après tentative: ${afterUpd?.nom}`);

    // === TEST 8 : user A tente DELETE société de B ===
    const { error: delErr } = await clientA.from('societes').delete().eq('id', socB.id);
    const { data: afterDel } = await admin.from('societes').select('id').eq('id', socB.id).maybeSingle();
    assert('RLS societes — A ne peut pas DELETE société B',
      !!afterDel,
      afterDel ? 'société B intacte' : 'société B supprimée!');

    // === TEST 9 : user A ne voit pas user_societe_roles de B ===
    const { data: leakRoles } = await clientA.from('user_societe_roles').select('id').eq('societe_id', socB.id);
    assert('RLS user_societe_roles — A ne voit pas les rôles de B',
      (leakRoles||[]).length === 0,
      `leak: ${(leakRoles||[]).length} row`);

    // === TEST 10 : user A ne voit pas audit_log de B ===
    const { data: leakAudit } = await clientA.from('audit_log').select('id').eq('societe_id', socB.id);
    assert('RLS audit_log — A ne voit pas les logs de B',
      (leakAudit||[]).length === 0,
      `leak: ${(leakAudit||[]).length} row`);

    // === TEST 11 : user A peut créer une 2e société pour lui-même ===
    const { data: soc2, error: err2 } = await clientA.from('societes').insert({
      owner_id: userA.id, type: 'sci', nom: 'SCI test A'
    }).select('*').single();
    if (soc2?.id) societeIds.push(soc2.id);
    assert('RLS societes — A peut créer une 2e société à lui',
      !err2 && !!soc2,
      err2?.message || '');

    // === TEST 12 : user A ne peut pas créer une société au nom de B ===
    const { error: errSpoof } = await clientA.from('societes').insert({
      owner_id: userB.id, type: 'sci', nom: 'SPOOF'
    });
    assert('RLS societes — A ne peut pas créer une société avec owner_id=B',
      !!errSpoof,
      errSpoof?.message || 'aucune erreur');

  } catch (e) {
    console.error('\n💥 Erreur pendant les tests :', e.message);
    results.push({ label: 'crash', ok: false, detail: e.message });
  } finally {
    console.log('\n=== Cleanup ===');
    await cleanup(userIds, societeIds);
    console.log('Cleanup done.');

    // Bilan
    const passed = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;
    console.log(`\n=== Bilan : ${passed}/${results.length} OK — ${failed} KO ===\n`);
    process.exit(failed === 0 ? 0 : 1);
  }
})();
