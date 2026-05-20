#!/usr/bin/env node
/**
 * JADOMI ARMURE — RLS Guardian Check
 * Script de vérification automatique des tables sans RLS
 * Exécuté par cron chaque jour à 7h00
 * Envoie une alerte email si des tables vulnérables sont détectées
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRLS() {
  console.log('[RLS-GUARDIAN] Vérification démarrée —', new Date().toISOString());

  try {
    // Appeler la fonction d'audit
    const { data, error } = await supabase.rpc('jadomi_rls_vulnerabilities');

    if (error) {
      console.error('[RLS-GUARDIAN] Fonction non disponible:', error.message);
      console.log('[RLS-GUARDIAN] → Exécutez ARMURE_RLS_GUARDIAN.sql sur Supabase Dashboard');
      process.exit(1);
    }

    const vulnerabilities = data || [];

    if (vulnerabilities.length === 0) {
      console.log('[RLS-GUARDIAN] ✓ TOUTES les tables sont sécurisées (RLS activé)');
      process.exit(0);
    }

    // ALERTE : tables vulnérables détectées
    console.error(`[RLS-GUARDIAN] ⚠ ${vulnerabilities.length} TABLES VULNÉRABLES DÉTECTÉES :`);
    vulnerabilities.forEach(v => {
      console.error(`  - ${v.table_name} : ${v.issue}`);
    });

    // Envoyer alerte email
    try {
      const { sendMail } = require('../api/multiSocietes/mailer');
      await sendMail({
        to: process.env.ADMIN_EMAIL,
        subject: `⚠ JADOMI ARMURE — ${vulnerabilities.length} tables sans RLS détectées`,
        html: `
          <h2 style="color:#dc2626;">Alerte Sécurité JADOMI</h2>
          <p>L'audit automatique a détecté <strong>${vulnerabilities.length} tables vulnérables</strong> dans la base de données.</p>
          <table style="border-collapse:collapse;width:100%;">
            <tr style="background:#fee2e2;">
              <th style="border:1px solid #ccc;padding:8px;text-align:left;">Table</th>
              <th style="border:1px solid #ccc;padding:8px;text-align:left;">Problème</th>
            </tr>
            ${vulnerabilities.map(v => `
              <tr>
                <td style="border:1px solid #ccc;padding:8px;font-family:monospace;">${v.table_name}</td>
                <td style="border:1px solid #ccc;padding:8px;">${v.issue}</td>
              </tr>
            `).join('')}
          </table>
          <p style="margin-top:16px;">
            <strong>Action requise :</strong> Connectez-vous au
            <a href="https://supabase.com/dashboard/project/vsbomwjzehnfinfjvhqp/sql">SQL Editor Supabase</a>
            et activez le RLS sur ces tables.
          </p>
          <hr>
          <p style="color:#6b7280;font-size:12px;">JADOMI ARMURE — Vérification automatique quotidienne</p>
        `
      });
      console.log('[RLS-GUARDIAN] Email d\'alerte envoyé à', process.env.ADMIN_EMAIL);
    } catch (emailErr) {
      console.error('[RLS-GUARDIAN] Impossible d\'envoyer l\'email:', emailErr.message);
    }

    process.exit(1); // Exit code 1 = vulnérabilités trouvées
  } catch (e) {
    console.error('[RLS-GUARDIAN] Erreur:', e.message);
    process.exit(2);
  }
}

checkRLS();
