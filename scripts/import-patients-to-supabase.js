require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SOCIETE_ID = 'c8fe3f0f-c7cf-4201-80ce-e1550d048668'; // Precision Dentaire

(async () => {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const patients = JSON.parse(fs.readFileSync('/tmp/doctolib-all-patients.json', 'utf8'));

  console.log('=== IMPORT PATIENTS DOCTOLIB → SUPABASE ===');
  console.log('Societe:', SOCIETE_ID, '(Precision Dentaire)');
  console.log('Patients a importer:', patients.length);

  let imported = 0, skipped = 0, errors = 0;

  // Import par lots de 100
  for (let i = 0; i < patients.length; i += 100) {
    const batch = patients.slice(i, i + 100).map(p => ({
      societe_id: SOCIETE_ID,
      nom: (p.nom || '').trim().toUpperCase(),
      prenom: (p.prenom || '').trim(),
      telephone: (p.telephone || '').replace(/[\s.]/g, '') || null,
      email: (p.email || '').trim().toLowerCase() || null,
      date_naissance: p.date_naissance ? convertDate(p.date_naissance) : null,
      nombre_consultations: p.consultations || 0,
      source: 'doctolib',
      statut: 'actif',
      metadata: { imported_from: 'doctolib', imported_at: new Date().toISOString() }
    })).filter(p => p.nom && p.nom.length > 1);

    const { data, error } = await db
      .from('patients_jadomi')
      .upsert(batch, {
        onConflict: 'societe_id,nom,prenom,date_naissance',
        ignoreDuplicates: true
      });

    if (error) {
      // Si erreur sur le batch, inserer un par un
      for (const patient of batch) {
        const { error: singleErr } = await db
          .from('patients_jadomi')
          .upsert(patient, {
            onConflict: 'societe_id,nom,prenom,date_naissance',
            ignoreDuplicates: true
          });
        if (singleErr) {
          errors++;
        } else {
          imported++;
        }
      }
    } else {
      imported += batch.length;
    }

    if ((i / 100) % 10 === 0 || i === 0) {
      console.log('[' + (i + batch.length) + '/' + patients.length + '] importes:' + imported + ' erreurs:' + errors);
    }
  }

  console.log('\n=== RESULTAT ===');
  console.log('Importes:', imported);
  console.log('Erreurs:', errors);

  // Verifier le total en base
  const { count } = await db.from('patients_jadomi').select('*', { count: 'exact', head: true }).eq('societe_id', SOCIETE_ID);
  console.log('Total en base:', count);

  console.log('Done');
})();

function convertDate(dateStr) {
  // DD/MM/YYYY → YYYY-MM-DD
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) return match[3] + '-' + match[2] + '-' + match[1];
  return dateStr;
}
