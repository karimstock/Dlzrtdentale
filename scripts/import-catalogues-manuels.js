#!/usr/bin/env node
// =============================================
// JADOMI — Import catalogues manuels
// Fabricants ABSENTS d'EUDAMED et sous-représentés dans GUDID
// Source : catalogues officiels des fabricants (web)
// Anti-doublons : upsert sur gtin + ignoreDuplicates
//
// GTIN synthétiques : MAN-XXX-NNNNN (fabricant absent des bases publiques)
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const LOG_FILE = '/tmp/import-catalogues-manuels.log';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// Génère un GTIN synthétique unique pour les produits sans code-barres officiel
function syntheticGtin(manufacturer, productName, index) {
  const mfgCode = manufacturer.substring(0, 4).toUpperCase().replace(/[^A-Z]/g, 'X');
  const prodHash = productName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 5).toUpperCase();
  return `MAN${mfgCode}${prodHash}${String(index).padStart(3, '0')}`.substring(0, 14);
}

// ═══════════════════════════════════════════════════
// CATALOGUES COMPLETS PAR FABRICANT
// ═══════════════════════════════════════════════════

const CATALOGUES = [

  // ═══════════════════════════════════════
  // SEPTODONT — 79 produits (catalogue officiel septodont-fr.be)
  // ═══════════════════════════════════════
  ...[
    // Page 1 — Anesthésie & Restauration
    { name: 'Alveogyl', category: 'Chirurgie', brand: 'Septodont', desc: 'Pâte alvéolaire hémostatique et analgésique' },
    { name: 'Biodentine', category: 'Composites', brand: 'Septodont', desc: 'Substitut dentinaire bioactif' },
    { name: 'Biodentine XP', category: 'Composites', brand: 'Septodont', desc: 'Substitut dentinaire XP capsules' },
    { name: 'Biodentine XP Gun', category: 'Composites', brand: 'Septodont', desc: 'Applicateur pistolet pour Biodentine XP' },
    { name: 'Biodentine XP Mixer', category: 'Composites', brand: 'Septodont', desc: 'Mixeur pour Biodentine XP' },
    { name: 'BioRoot RCS', category: 'Endodontie', brand: 'Septodont', desc: 'Ciment endodontique bioactif pour obturation canalaire' },
    { name: 'BioRoot Flow', category: 'Endodontie', brand: 'Septodont', desc: 'Ciment endodontique fluide bioactif' },
    { name: 'Canal+ Cream', category: 'Endodontie', brand: 'Septodont', desc: 'Crème EDTA pour préparation canalaire' },
    { name: 'Cimpat LC', category: 'Composites', brand: 'Septodont', desc: 'Obturation temporaire photopolymérisable' },
    { name: 'Cimpat W', category: 'Composites', brand: 'Septodont', desc: 'Obturation temporaire blanc' },
    { name: 'Cimpat P', category: 'Composites', brand: 'Septodont', desc: 'Obturation temporaire rose' },
    { name: 'CryoPulp', category: 'Instruments', brand: 'Septodont', desc: 'Spray réfrigérant test sensibilité pulpaire' },
    // Page 2
    { name: 'Dentapen', category: 'Anesthesie', brand: 'Septodont', desc: 'Seringue électronique pour anesthésie' },
    { name: 'Dentapen Recharge Étui à Carpule', category: 'Anesthesie', brand: 'Septodont', desc: 'Recharge étui carpule Dentapen' },
    { name: 'Dentapen Recharge Housse Protection', category: 'Anesthesie', brand: 'Septodont', desc: 'Recharge housse protection Dentapen' },
    { name: 'Dentapen Recharge Poignée', category: 'Anesthesie', brand: 'Septodont', desc: 'Recharge poignée Dentapen' },
    { name: 'Dentapen Recharge Poignée Stylet', category: 'Anesthesie', brand: 'Septodont', desc: 'Recharge poignée position stylet' },
    { name: 'Détartrine', category: 'Hygiene', brand: 'Septodont', desc: 'Pâte prophylactique détartrage' },
    { name: 'Détartrine Z', category: 'Hygiene', brand: 'Septodont', desc: 'Pâte prophylactique avec zirconium' },
    { name: 'Endo-Perio-Needles', category: 'Endodontie', brand: 'Septodont', desc: 'Aiguilles endo-péri pour irrigation' },
    { name: 'Endométhasone N', category: 'Endodontie', brand: 'Septodont', desc: 'Ciment canalaire à base oxyde de zinc-eugénol' },
    { name: 'Endométhasone Liquide', category: 'Endodontie', brand: 'Septodont', desc: 'Liquide pour Endométhasone' },
    { name: 'Eugénol', category: 'Endodontie', brand: 'Septodont', desc: 'Eugénol pur pour ciments dentaires' },
    { name: 'Endosolv', category: 'Endodontie', brand: 'Septodont', desc: 'Solvant pour désobturation canalaire' },
    { name: 'Epicrem+', category: 'Hygiene', brand: 'Septodont', desc: 'Crème mains protectrice' },
    // Page 3 — Limes GenENDO
    { name: 'GenENDO Glider', category: 'Endodontie', brand: 'Septodont', desc: 'Lime de glide path mécanisée' },
    { name: 'GenENDO Gutta Percha', category: 'Endodontie', brand: 'Septodont', desc: 'Pointes gutta percha GenENDO' },
    { name: 'GenENDO K-Files', category: 'Endodontie', brand: 'Septodont', desc: 'Limes K manuelles GenENDO' },
    { name: 'GenENDO Motor', category: 'Endodontie', brand: 'Septodont', desc: 'Moteur endodontique GenENDO' },
    { name: 'GenENDO Remover', category: 'Endodontie', brand: 'Septodont', desc: 'Lime de retrait GenENDO' },
    { name: 'GenENDO Revo-S+', category: 'Endodontie', brand: 'Septodont', desc: 'Limes rotatives Revo-S+ NiTi' },
    { name: 'Guttasolv', category: 'Endodontie', brand: 'Septodont', desc: 'Solvant gutta percha pour désobturation' },
    { name: 'Hémocollagène', category: 'Chirurgie', brand: 'Septodont', desc: 'Éponge hémostatique collagène résorbable' },
    { name: 'Hemogelatin', category: 'Chirurgie', brand: 'Septodont', desc: 'Éponge hémostatique gélatine résorbable' },
    { name: 'Hydrol', category: 'Composites', brand: 'Septodont', desc: 'Auxiliaire pour restauration' },
    { name: 'Largal L', category: 'Endodontie', brand: 'Septodont', desc: 'Solution EDTA pour préparation canalaire' },
    { name: 'Lignospan', category: 'Anesthesie', brand: 'Septodont', desc: 'Lidocaïne 2% + adrénaline, carpule anesthésique' },
    { name: 'Luer-Lock Seringue', category: 'Endodontie', brand: 'Septodont', desc: 'Seringue irrigation luer lock' },
    { name: 'Parcan L', category: 'Endodontie', brand: 'Septodont', desc: 'Hypochlorite de sodium 3% pour irrigation canalaire' },
    // Page 4 — Empreinte, Endo, Chirurgie
    { name: 'Perfexil Bite Platinium+', category: 'Empreintes', brand: 'Septodont', desc: 'Silicone addition pour enregistrement occlusal' },
    { name: 'Perfexil Platinium+', category: 'Empreintes', brand: 'Septodont', desc: 'Silicone addition pour empreintes' },
    { name: 'Septodont Paper Points', category: 'Endodontie', brand: 'Septodont', desc: 'Pointes papier absorbantes' },
    { name: 'R4 Ultra', category: 'Endodontie', brand: 'Septodont', desc: 'Solution CHX 2% irrigation canalaire luer-lock' },
    { name: 'Quitanet Ultra', category: 'Sterilisation', brand: 'Septodont', desc: 'Solution nettoyage et désinfection instruments' },
    { name: 'R.T.R.+', category: 'Chirurgie', brand: 'Septodont', desc: 'Substitut osseux biphasique β-TCP + HA' },
    { name: 'R.T.R.+ Membrane', category: 'Chirurgie', brand: 'Septodont', desc: 'Membrane résorbable pour régénération osseuse' },
    { name: 'Racecord Caps', category: 'Empreintes', brand: 'Septodont', desc: 'Pâte rétraction gingivale temporaire' },
    { name: 'Racegel', category: 'Empreintes', brand: 'Septodont', desc: 'Gel thermo-gélifiable rétraction gingivale' },
    { name: 'Racestyptine Solution', category: 'Empreintes', brand: 'Septodont', desc: 'Solution rétraction gingivale' },
    { name: 'Restofill', category: 'Composites', brand: 'Septodont', desc: 'Composite nano-hybride restauration' },
    { name: 'Restofill Bulk Flow', category: 'Composites', brand: 'Septodont', desc: 'Composite fluide bulk-fill' },
    // Page 5 — Anesthésie & Instruments
    { name: 'Rotagerm Ultra', category: 'Sterilisation', brand: 'Septodont', desc: 'Désinfection instruments rotatifs' },
    { name: 'Scandonest 3%', category: 'Anesthesie', brand: 'Septodont', desc: 'Mépivacaïne 3% sans vasoconstricteur' },
    { name: 'Septanest Normal', category: 'Anesthesie', brand: 'Septodont', desc: 'Articaïne 4% + adrénaline 1/200 000' },
    { name: 'Septanest Spécial', category: 'Anesthesie', brand: 'Septodont', desc: 'Articaïne 4% + adrénaline 1/100 000' },
    { name: 'Septocal LC', category: 'Composites', brand: 'Septodont', desc: 'Fond de cavité photopolymérisable' },
    { name: 'SeptoCompo Shape', category: 'Instruments', brand: 'Septodont', desc: 'Instruments de mise en forme composite' },
    { name: 'SeptoCone', category: 'Chirurgie', brand: 'Septodont', desc: 'Cône de comblement osseux' },
    { name: 'SeptoContact', category: 'Instruments', brand: 'Septodont', desc: 'Système de restauration point de contact' },
    { name: 'SeptoDiamond Paste', category: 'Instruments', brand: 'Septodont', desc: 'Pâte à polir diamantée' },
    { name: 'SeptoDiamond Strips', category: 'Instruments', brand: 'Septodont', desc: 'Strips à polir diamantés' },
    { name: 'SeptoDiscs', category: 'Instruments', brand: 'Septodont', desc: 'Disques à polir multi-grains' },
    { name: 'Septodont Gutta-Percha', category: 'Endodontie', brand: 'Septodont', desc: 'Pointes gutta percha conventionnelles' },
    // Page 6 — Seringues, Aiguilles, Finition
    { name: 'Septodont Petite & Standard Inox', category: 'Anesthesie', brand: 'Septodont', desc: 'Seringue à carpule inox' },
    { name: 'Septofil N', category: 'Empreintes', brand: 'Septodont', desc: 'Fil rétraction gingivale imprégné' },
    { name: 'SeptoFipo Strips', category: 'Instruments', brand: 'Septodont', desc: 'Strips de finition et polissage' },
    { name: 'Septoject', category: 'Anesthesie', brand: 'Septodont', desc: 'Aiguilles dentaires standard' },
    { name: 'Septoject Evolution', category: 'Anesthesie', brand: 'Septodont', desc: 'Aiguilles dentaires Evolution biseau optimisé' },
    { name: 'Septoject XL', category: 'Anesthesie', brand: 'Septodont', desc: 'Aiguilles dentaires XL extra-longues' },
    { name: 'SeptoMatrix Cervical', category: 'Instruments', brand: 'Septodont', desc: 'Matrices cervicales métalliques' },
    { name: 'SeptoMatrix Sectional', category: 'Instruments', brand: 'Septodont', desc: 'Matrices sectorielles métalliques' },
    { name: 'SeptoPlus Mandrel', category: 'Instruments', brand: 'Septodont', desc: 'Mandrin pour disques polissage' },
    { name: 'SeptoPolisher', category: 'Instruments', brand: 'Septodont', desc: 'Pointes silicone polissage composite' },
    { name: 'SeptoProphy Strips', category: 'Hygiene', brand: 'Septodont', desc: 'Strips prophylaxie interdentaire' },
    { name: 'SeptoTape', category: 'Instruments', brand: 'Septodont', desc: 'Ruban isolation champ opératoire' },
    // Page 7 — Derniers produits
    { name: 'SeptoWedges', category: 'Instruments', brand: 'Septodont', desc: 'Coins interdentaires en bois' },
    { name: 'Temposcell', category: 'Composites', brand: 'Septodont', desc: 'Ciment temporaire à base eugénol' },
    { name: 'Ultra Safety Plus TWIST', category: 'Anesthesie', brand: 'Septodont', desc: 'Système injection sécurisé twist-lock' },
    { name: 'Vaposept Plus', category: 'Sterilisation', brand: 'Septodont', desc: 'Spray désinfection rapide surfaces et DM' },
    { name: 'Xogel', category: 'Anesthesie', brand: 'Septodont', desc: 'Gel anesthésique topique lidocaïne 5%' },
    { name: 'XYLONOR Pellets', category: 'Anesthesie', brand: 'Septodont', desc: 'Pellets anesthésie de surface lidocaïne' },
    { name: 'XYLONOR Spray', category: 'Anesthesie', brand: 'Septodont', desc: 'Spray anesthésie de surface lidocaïne 15%' },
  ].map(p => ({ ...p, manufacturer: 'Septodont' })),

  // ═══════════════════════════════════════
  // ANIOS — Gamme Dentasept + hygiène cabinet
  // ═══════════════════════════════════════
  ...[
    { name: 'Dentasept Ultra 5L', category: 'Sterilisation', desc: 'Désinfectant froid instruments dentaires' },
    { name: 'Dentasept Spray 60 Pro', category: 'Sterilisation', desc: 'Désinfectant surfaces prêt à emploi spray' },
    { name: 'Dentasept Tri-Enzymatique', category: 'Sterilisation', desc: 'Détergent tri-enzymatique pré-désinfection instruments' },
    { name: 'Dentasept 3H Rapid', category: 'Sterilisation', desc: 'Désinfection rapide instruments dentaires' },
    { name: 'Dentasept Aspiration AF+', category: 'Sterilisation', desc: 'Détergent désinfectant systèmes aspiration' },
    { name: 'Dentasept SH Pro Lingettes', category: 'Sterilisation', desc: 'Lingettes désinfectantes surfaces 100 pcs' },
    { name: 'Dentasept SH Pro Spray', category: 'Sterilisation', desc: 'Désinfectant surfaces spray 750ml' },
    { name: 'Dentasept Glycérine Mains', category: 'Hygiene', desc: 'Savon désinfectant mains glycériné' },
    { name: 'Dentasept Spécial Rotatifs', category: 'Sterilisation', desc: 'Détergent spécial instruments rotatifs 2L' },
    { name: 'Surfanios Premium', category: 'Sterilisation', desc: 'Détergent-désinfectant surfaces et sols' },
    { name: 'Aniosyme X3', category: 'Sterilisation', desc: 'Détergent tri-enzymatique pré-désinfection DM' },
    { name: 'Aniosyme DD1', category: 'Sterilisation', desc: 'Détergent désinfectant instruments DM' },
    { name: 'Aniospray Surf 29', category: 'Sterilisation', desc: 'Désinfectant rapide surfaces par pulvérisation' },
    { name: 'Aniospray Quick', category: 'Sterilisation', desc: 'Désinfection rapide petites surfaces' },
    { name: 'Anios Clean Excel D', category: 'Sterilisation', desc: 'Nettoyant désinfectant instruments DM' },
    { name: 'Aniosgel 85 NPC', category: 'Hygiene', desc: 'Gel hydroalcoolique désinfection mains' },
    { name: 'Aniosgel 800', category: 'Hygiene', desc: 'Gel hydroalcoolique grand format' },
    { name: 'Aniosafe Manuclear', category: 'Hygiene', desc: 'Savon doux haute fréquence lavage mains' },
    { name: 'Aniosafe Premium', category: 'Hygiene', desc: 'Savon antiseptique mains chirurgical' },
    { name: 'Aniosurf Premium', category: 'Sterilisation', desc: 'Détergent désinfectant surfaces haut niveau' },
    { name: 'Wip\'Anios Excel', category: 'Sterilisation', desc: 'Lingettes biodégradables désinfection DM' },
    { name: 'Wip\'Anios Premium', category: 'Sterilisation', desc: 'Lingettes imprégnées désinfection surfaces' },
    { name: 'Eltra Anios', category: 'Sterilisation', desc: 'Détergent désinfectant textile et linge' },
    { name: 'Anios TSA', category: 'Sterilisation', desc: 'Traitement spécifique aspiration dentaire' },
  ].map(p => ({ ...p, manufacturer: 'Laboratoires Anios', brand: 'Anios' })),

  // ═══════════════════════════════════════
  // DÜRR DENTAL — Hygiène et entretien cabinet
  // ═══════════════════════════════════════
  ...[
    { name: 'Orotol Plus', category: 'Sterilisation', desc: 'Désinfection systèmes aspiration (concentré)' },
    { name: 'Orotol Ultra', category: 'Sterilisation', desc: 'Désinfection aspiration haute performance' },
    { name: 'MD 555 Cleaner', category: 'Sterilisation', desc: 'Nettoyant spécial systèmes aspiration' },
    { name: 'OroCup', category: 'Sterilisation', desc: 'Récipient doseur dilution Orotol/MD 555' },
    { name: 'FD 312', category: 'Sterilisation', desc: 'Lingettes imprégnées désinfection surfaces rapide' },
    { name: 'FD 322 Premium Wipes', category: 'Sterilisation', desc: 'Lingettes premium désinfection rapide' },
    { name: 'FD 333 Forte', category: 'Sterilisation', desc: 'Désinfection surfaces concentré forte action' },
    { name: 'FD 366 Sensitive', category: 'Sterilisation', desc: 'Lingettes désinfection surfaces sensibles' },
    { name: 'FD 350 Spray', category: 'Sterilisation', desc: 'Spray désinfection rapide surfaces et DM' },
    { name: 'HD 410', category: 'Hygiene', desc: 'Désinfection chirurgicale mains gel' },
    { name: 'HD 435', category: 'Hygiene', desc: 'Savon désinfectant mains' },
    { name: 'ID 212 Forte', category: 'Sterilisation', desc: 'Désinfection instruments immersion concentré' },
    { name: 'ID 213 Instrument', category: 'Sterilisation', desc: 'Nettoyant désinfectant instruments bac ultrasons' },
    { name: 'ID 220', category: 'Sterilisation', desc: 'Huile spray entretien instruments rotatifs' },
  ].map(p => ({ ...p, manufacturer: 'Dürr Dental SE', brand: 'Dürr Dental' })),

  // ═══════════════════════════════════════
  // GC — Gamme complète composite/verre ionomère
  // ═══════════════════════════════════════
  ...[
    // Composites
    { name: 'G-aenial Universal Injectable', category: 'Composites', desc: 'Composite injectable universel' },
    { name: 'G-aenial A\'CHORD', category: 'Composites', desc: 'Composite universel haute esthétique' },
    { name: 'G-aenial Anterior', category: 'Composites', desc: 'Composite antérieur esthétique' },
    { name: 'G-aenial Posterior', category: 'Composites', desc: 'Composite postérieur haute résistance' },
    { name: 'G-aenial Flo X', category: 'Composites', desc: 'Composite fluide radio-opaque' },
    { name: 'Essentia Universal', category: 'Composites', desc: 'Composite esthétique simplification teintes' },
    { name: 'Essentia Modifier', category: 'Composites', desc: 'Modificateurs esthétiques opalescence/valeur' },
    { name: 'everX Flow', category: 'Composites', desc: 'Composite fibre de verre fluide bulk' },
    { name: 'everX Posterior', category: 'Composites', desc: 'Composite renforcé fibres courtes postérieur' },
    { name: 'Gradia Direct', category: 'Composites', desc: 'Composite micro-céramique restauration directe' },
    { name: 'Gradia Core', category: 'Composites', desc: 'Matériau reconstitution core build-up' },
    // Verres ionomères
    { name: 'EQUIA Forte HT', category: 'Composites', desc: 'Verre ionomère haute résistance bulk fill' },
    { name: 'EQUIA Forte HT Coat', category: 'Composites', desc: 'Vernis protection EQUIA Forte' },
    { name: 'Fuji II LC', category: 'Composites', desc: 'Verre ionomère photopolymérisable' },
    { name: 'Fuji IX GP', category: 'Composites', desc: 'Verre ionomère condensable haute viscosité' },
    { name: 'Fuji IX GP FAST', category: 'Composites', desc: 'Verre ionomère prise rapide' },
    { name: 'Fuji IX GP EXTRA', category: 'Composites', desc: 'Verre ionomère extra haute résistance' },
    { name: 'Fuji TRIAGE', category: 'Composites', desc: 'Verre ionomère fluoré prévention caries' },
    { name: 'Fuji PLUS', category: 'Composites', desc: 'Ciment scellement verre ionomère' },
    { name: 'Fuji PLUS EWT', category: 'Composites', desc: 'Ciment scellement temps travail étendu' },
    { name: 'Fuji CEM Evolve', category: 'Composites', desc: 'Ciment de scellement auto-adhésif' },
    // Collage
    { name: 'G-CEM LinkAce', category: 'Composites', desc: 'Ciment résine auto-adhésif dual' },
    { name: 'G-CEM LinkForce', category: 'Composites', desc: 'Ciment résine adhésif esthétique' },
    { name: 'G-Premio BOND', category: 'Composites', desc: 'Adhésif universel 8ème génération' },
    { name: 'G-Bond', category: 'Composites', desc: 'Adhésif auto-mordançant one-step' },
    // Empreintes
    { name: 'EXA\'lence', category: 'Empreintes', desc: 'Silicone addition empreinte haute précision' },
    { name: 'EXA\'lence Light Body', category: 'Empreintes', desc: 'Silicone light body pour wash' },
    { name: 'EXA\'lence Putty', category: 'Empreintes', desc: 'Silicone putty pour première empreinte' },
    // Prothèse
    { name: 'Gradia GUM', category: 'Prothese', desc: 'Composite labo teintes gingivales' },
    { name: 'Gradia Plus', category: 'Prothese', desc: 'Composite labo indirect esthétique' },
    { name: 'UNIFAST III', category: 'Prothese', desc: 'Résine auto-polymérisable provisoire' },
    { name: 'UNIFAST LC', category: 'Prothese', desc: 'Résine photopolymérisable provisoire' },
    { name: 'CeraSmART', category: 'CFAO', desc: 'Bloc hybride céramique CFAO' },
    { name: 'CeraSmART 270', category: 'CFAO', desc: 'Bloc force flexible CFAO' },
    { name: 'Initial LiSi Block', category: 'CFAO', desc: 'Bloc vitrocéramique au disilicate de lithium CFAO' },
    { name: 'Initial LiSi Press', category: 'Prothese', desc: 'Lingot pressé disilicate de lithium' },
    { name: 'Initial Zr-FS', category: 'Prothese', desc: 'Céramique de stratification sur zircone' },
  ].map(p => ({ ...p, manufacturer: 'GC Corporation', brand: 'GC' })),

  // ═══════════════════════════════════════
  // DMG — Matériaux de restauration
  // ═══════════════════════════════════════
  ...[
    { name: 'LuxaCore Z-Dual', category: 'Composites', desc: 'Matériau reconstitution dual avec zircone' },
    { name: 'LuxaCore Dual Automix', category: 'Composites', desc: 'Matériau reconstitution dual' },
    { name: 'LuxaPost', category: 'Composites', desc: 'Tenons fibre de verre' },
    { name: 'Luxatemp Automix Plus', category: 'Prothese', desc: 'Résine provisoire bis-acrylique' },
    { name: 'Luxatemp Fluorescence', category: 'Prothese', desc: 'Résine provisoire fluorescente' },
    { name: 'Luxatemp Star', category: 'Prothese', desc: 'Résine provisoire haute esthétique' },
    { name: 'LuxaFlow Ultra', category: 'Composites', desc: 'Composite fluide réparations temporaires' },
    { name: 'LuxaGlaze', category: 'Composites', desc: 'Vernis protection composite glaçage' },
    { name: 'LuxaBond', category: 'Composites', desc: 'Adhésif universel total-etch' },
    { name: 'LuxaBite', category: 'Empreintes', desc: 'Matériau enregistrement occlusal' },
    { name: 'Honigum Pro', category: 'Empreintes', desc: 'Silicone addition empreinte précision' },
    { name: 'Honigum Light', category: 'Empreintes', desc: 'Silicone light body haute élasticité' },
    { name: 'Honigum Putty', category: 'Empreintes', desc: 'Silicone putty première empreinte' },
    { name: 'Honigum MixStar', category: 'Empreintes', desc: 'Silicone pour mélangeur automatique' },
    { name: 'StatusBlue', category: 'Empreintes', desc: 'Silicone condensation empreinte' },
    { name: 'Icon', category: 'Composites', desc: 'Infiltrant résine caries débutantes sans fraisage' },
    { name: 'Icon Smooth Surface', category: 'Composites', desc: 'Infiltrant caries surfaces lisses' },
    { name: 'Icon Proximal', category: 'Composites', desc: 'Infiltrant caries proximales' },
    { name: 'TempoCem NE', category: 'Composites', desc: 'Ciment provisoire sans eugénol' },
    { name: 'TempoCem ID', category: 'Composites', desc: 'Ciment provisoire implants et overlays' },
    { name: 'PermaCem 2.0', category: 'Composites', desc: 'Ciment définitif auto-adhésif' },
    { name: 'Vitique', category: 'Composites', desc: 'Ciment esthétique facettes et inlays' },
    { name: 'Contax', category: 'Composites', desc: 'Adhésif auto-mordançant dual' },
    { name: 'Constic', category: 'Composites', desc: 'Composite fluide auto-adhésif' },
    { name: 'Ecosite Elements', category: 'Composites', desc: 'Composite universel nano-hybride' },
    { name: 'ClearShield', category: 'Hygiene', desc: 'Vernis fluoré protection caries' },
  ].map(p => ({ ...p, manufacturer: 'DMG Dental-Material GmbH', brand: 'DMG' })),

  // ═══════════════════════════════════════
  // METASYS — Hygiène et traitement eau cabinet
  // ═══════════════════════════════════════
  ...[
    { name: 'Green & Clean N', category: 'Sterilisation', desc: 'Désinfectant surfaces sans alcool' },
    { name: 'Green & Clean SK', category: 'Sterilisation', desc: 'Désinfectant rapide surfaces spray' },
    { name: 'Green & Clean ID', category: 'Sterilisation', desc: 'Désinfectant instruments immersion' },
    { name: 'Green & Clean IK', category: 'Sterilisation', desc: 'Nettoyant concentré instruments rotatifs' },
    { name: 'Green & Clean AL', category: 'Sterilisation', desc: 'Nettoyant aspiration décontaminant' },
    { name: 'Green & Clean WT', category: 'Sterilisation', desc: 'Traitement eau units dentaires biofilm' },
    { name: 'Green & Clean HD', category: 'Hygiene', desc: 'Gel hydroalcoolique désinfection mains' },
    { name: 'Green & Clean HL', category: 'Hygiene', desc: 'Lotion lavante mains douce' },
    { name: 'Comfort Plus Unit Water', category: 'Equipement', desc: 'Système traitement eau continu units' },
  ].map(p => ({ ...p, manufacturer: 'Metasys Medizintechnik GmbH', brand: 'Metasys' })),

  // ═══════════════════════════════════════
  // KULZER (ex Heraeus) — Composites & Prothèse
  // ═══════════════════════════════════════
  ...[
    { name: 'Charisma Classic', category: 'Composites', desc: 'Composite micro-hybride universel' },
    { name: 'Charisma Diamond', category: 'Composites', desc: 'Composite nano-hybride haute esthétique' },
    { name: 'Charisma Topaz', category: 'Composites', desc: 'Composite une seule teinte simplifié' },
    { name: 'Charisma ABC', category: 'Composites', desc: 'Composite nano-hybride système simplifié' },
    { name: 'Charisma Flow', category: 'Composites', desc: 'Composite fluide universel' },
    { name: 'Venus Diamond', category: 'Composites', desc: 'Composite nano-hybride premium esthétique' },
    { name: 'Venus Diamond Flow', category: 'Composites', desc: 'Composite fluide haute charge' },
    { name: 'Venus Diamond ONE', category: 'Composites', desc: 'Composite universel une seule teinte' },
    { name: 'Venus Bulk Fill', category: 'Composites', desc: 'Composite bulk-fill postérieur 4mm' },
    { name: 'Venus Bulk Fill ONE', category: 'Composites', desc: 'Composite bulk-fill teinte unique' },
    { name: 'iBOND Universal', category: 'Composites', desc: 'Adhésif universel tout mode' },
    { name: 'iBOND Self Etch', category: 'Composites', desc: 'Adhésif auto-mordançant 7ème gén' },
    { name: 'Pala Press Vario', category: 'Prothese', desc: 'Résine prothèse presse injection' },
    { name: 'Pala Xpress', category: 'Prothese', desc: 'Résine auto-polymérisable prothèse' },
    { name: 'Pala Digital Dentures', category: 'CFAO', desc: 'Système prothèse numérique CFAO' },
    { name: 'Signum Composite', category: 'Prothese', desc: 'Composite de laboratoire indirect' },
  ].map(p => ({ ...p, manufacturer: 'Kulzer GmbH', brand: 'Kulzer' })),

  // ═══════════════════════════════════════
  // CATTANI — Aspiration & Compresseurs
  // ═══════════════════════════════════════
  ...[
    { name: 'Turbo-Smart A', category: 'Equipement', desc: 'Aspiration chirurgicale unitaire sèche' },
    { name: 'Turbo-Smart 2V', category: 'Equipement', desc: 'Aspiration 2 postes turbine' },
    { name: 'Turbo-Smart 3V', category: 'Equipement', desc: 'Aspiration 3 postes turbine' },
    { name: 'Micro-Smart', category: 'Equipement', desc: 'Micro-aspiration compacte' },
    { name: 'AC 100', category: 'Equipement', desc: 'Compresseur mono-cylindre sans huile 24L' },
    { name: 'AC 200', category: 'Equipement', desc: 'Compresseur bi-cylindre sans huile 30L' },
    { name: 'AC 300', category: 'Equipement', desc: 'Compresseur 3 cylindres sans huile 45L' },
    { name: 'PAL 40', category: 'Equipement', desc: 'Séparateur amalgame haute efficacité' },
    { name: 'Pulse Cleaner', category: 'Sterilisation', desc: 'Système nettoyage pulsé aspiration' },
    { name: 'Cattani Hydrocyclone', category: 'Equipement', desc: 'Séparateur centrifuge aspiration' },
  ].map(p => ({ ...p, manufacturer: 'Cattani S.p.A.', brand: 'Cattani' })),

  // ═══════════════════════════════════════
  // SHOFU — Composites et instruments
  // ═══════════════════════════════════════
  ...[
    { name: 'Beautifil II', category: 'Composites', desc: 'Composite giomer nano-hybride fluoré' },
    { name: 'Beautifil II LS', category: 'Composites', desc: 'Composite giomer basse rétraction' },
    { name: 'Beautifil Flow Plus X', category: 'Composites', desc: 'Composite fluide giomer injectable' },
    { name: 'Beautifil Bulk Flowable', category: 'Composites', desc: 'Composite fluide bulk giomer' },
    { name: 'Beautifil Bulk Restorative', category: 'Composites', desc: 'Composite bulk giomer pâteux' },
    { name: 'Beautifil Kids', category: 'Composites', desc: 'Composite giomer pédiatrique coloré' },
    { name: 'BeautiBond Xtreme', category: 'Composites', desc: 'Adhésif universel giomer' },
    { name: 'BeautiCem SA', category: 'Composites', desc: 'Ciment résine auto-adhésif dual' },
    { name: 'BeautiSealant', category: 'Hygiene', desc: 'Sealant giomer prévention caries' },
    { name: 'Super-Snap', category: 'Instruments', desc: 'Disques polissage multi-grains composite' },
    { name: 'Super-Snap X-Treme', category: 'Instruments', desc: 'Disques polissage céramique et zircone' },
    { name: 'Dura-Green', category: 'Instruments', desc: 'Pointes silicone polissage céramique' },
    { name: 'EyeSpecial C-V', category: 'Instruments', desc: 'Appareil photo dentaire dédié' },
    { name: 'OneGloss', category: 'Instruments', desc: 'Pointes polissage composite mono-étape' },
  ].map(p => ({ ...p, manufacturer: 'Shofu Inc.', brand: 'Shofu' })),

  // ═══════════════════════════════════════
  // KAVO — Instruments rotatifs & équipement
  // ═══════════════════════════════════════
  ...[
    { name: 'MASTERtorque M8900L', category: 'Instruments', desc: 'Turbine LED haute puissance' },
    { name: 'MASTERtorque M9000L', category: 'Instruments', desc: 'Turbine LED mini-tête' },
    { name: 'EXPERTtorque E680L', category: 'Instruments', desc: 'Contre-angle LED multiplicateur 1:5' },
    { name: 'GENTLEpower LUX 7LP', category: 'Instruments', desc: 'Contre-angle LED bague bleue 1:1' },
    { name: 'GENTLEpower LUX 25LP', category: 'Instruments', desc: 'Contre-angle LED réducteur' },
    { name: 'SMARTtorque S619L', category: 'Instruments', desc: 'Contre-angle LED polyvalent' },
    { name: 'INTRA LUX Motor KL 703', category: 'Instruments', desc: 'Micromoteur électrique LED' },
    { name: 'DIAGNOdent Pen', category: 'Instruments', desc: 'Détection caries par fluorescence laser' },
    { name: 'DIAGNOcam', category: 'Instruments', desc: 'Caméra transillumination détection caries' },
    { name: 'PROPHYflex 4', category: 'Instruments', desc: 'Aéropolisseur prophylaxie supra/sous-gingival' },
    { name: 'ESTETICA E70/E80 Vision', category: 'Equipement', desc: 'Unit dentaire haut de gamme' },
    { name: 'KaVo OP 3D', category: 'Radiologie', desc: 'Panoramique et CBCT 3D' },
    { name: 'KaVo OP 3D Pro', category: 'Radiologie', desc: 'CBCT 3D haute résolution' },
    { name: 'KaVo ARCTICA Engine', category: 'CFAO', desc: 'Usineuse CFAO au cabinet' },
  ].map(p => ({ ...p, manufacturer: 'KaVo Dental GmbH', brand: 'KaVo' })),

  // ═══════════════════════════════════════
  // MELAG — Stérilisation
  // ═══════════════════════════════════════
  ...[
    { name: 'Vacuclave 123', category: 'Sterilisation', desc: 'Autoclave classe B 18L' },
    { name: 'Vacuclave 118', category: 'Sterilisation', desc: 'Autoclave classe B 18L compact' },
    { name: 'Cliniclave 45', category: 'Sterilisation', desc: 'Autoclave grande capacité 45L' },
    { name: 'Cliniclave 45 MD', category: 'Sterilisation', desc: 'Autoclave grande capacité MD' },
    { name: 'Euroklav 29-S', category: 'Sterilisation', desc: 'Autoclave classe S 18L' },
    { name: 'MELAtherm 10', category: 'Sterilisation', desc: 'Thermo-désinfecteur automatique instruments' },
    { name: 'MELAquick 12+', category: 'Sterilisation', desc: 'Autoclave cycle rapide premium' },
    { name: 'MELAseal Pro', category: 'Sterilisation', desc: 'Thermosoudeuse sachets stérilisation' },
    { name: 'MELAflash', category: 'Sterilisation', desc: 'Carte mémoire documentation cycles' },
    { name: 'MELAtrace/MELAview', category: 'Sterilisation', desc: 'Logiciel traçabilité stérilisation' },
    { name: 'MELAdem 56', category: 'Sterilisation', desc: 'Système traitement eau osmose inverse' },
    { name: 'MELAdem 53', category: 'Sterilisation', desc: 'Système déminéralisation eau' },
  ].map(p => ({ ...p, manufacturer: 'MELAG Medizintechnik GmbH', brand: 'MELAG' })),

  // ═══════════════════════════════════════
  // PIERRE FABRE ORAL CARE — Hygiène patient
  // ═══════════════════════════════════════
  ...[
    { name: 'Elgydium Protection Caries', category: 'Hygiene', desc: 'Dentifrice fluoré anti-caries' },
    { name: 'Elgydium Sensitive', category: 'Hygiene', desc: 'Dentifrice dents sensibles' },
    { name: 'Elgydium Blancheur', category: 'Hygiene', desc: 'Dentifrice blancheur bicarbonate' },
    { name: 'Elgydium Anti-Plaque', category: 'Hygiene', desc: 'Dentifrice anti-plaque chlorhexidine' },
    { name: 'Elgydium Clinic Gencives', category: 'Hygiene', desc: 'Dentifrice gencives irritées CHX' },
    { name: 'Eludril Care', category: 'Hygiene', desc: 'Bain de bouche quotidien protection complète' },
    { name: 'Eludril Perio', category: 'Hygiene', desc: 'Bain de bouche CHX 0.20% post-chirurgie' },
    { name: 'Eludril Classic', category: 'Hygiene', desc: 'Bain de bouche antiseptique CHX' },
    { name: 'Inava Mono Compact', category: 'Hygiene', desc: 'Brossettes interdentaires mono-touffe' },
    { name: 'Inava Brossettes', category: 'Hygiene', desc: 'Brossettes interdentaires calibrées ISO' },
    { name: 'Arthrodont Protect', category: 'Hygiene', desc: 'Gel gingival protection parodontale' },
    { name: 'Arthrodont Classic', category: 'Hygiene', desc: 'Pâte gingivale enoxolone' },
  ].map(p => ({ ...p, manufacturer: 'Pierre Fabre Oral Care', brand: 'Pierre Fabre' })),
];

async function upsertBatch(supabase, products) {
  if (!products.length) return 0;
  let inserted = 0;
  try {
    const { error } = await supabase
      .from('products_database')
      .upsert(products, { onConflict: 'gtin', ignoreDuplicates: true });
    if (!error) return products.length;
    for (const p of products) {
      try {
        await supabase.from('products_database')
          .upsert(p, { onConflict: 'gtin', ignoreDuplicates: true });
        inserted++;
      } catch (e2) {}
    }
  } catch (e) {
    for (const p of products) {
      try {
        await supabase.from('products_database')
          .upsert(p, { onConflict: 'gtin', ignoreDuplicates: true });
        inserted++;
      } catch (e2) {}
    }
  }
  return inserted;
}

async function main() {
  if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);

  log('╔═════════════════════════════════════════════════════╗');
  log('║  JADOMI — Import Catalogues Manuels Fabricants     ║');
  log(`║  ${CATALOGUES.length} produits de fabricants non-EUDAMED          ║`);
  log('╚═════════════════════════════════════════════════════╝');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { count: before } = await supabase
    .from('products_database')
    .select('*', { count: 'exact', head: true });
  log(`Total produits avant : ${before}`);

  // Transformer en format DB
  let idx = 0;
  const products = CATALOGUES.map(p => {
    idx++;
    return {
      gtin: syntheticGtin(p.manufacturer, p.name, idx),
      name: p.name,
      name_fr: p.desc || p.name,
      brand: p.brand || p.manufacturer.split(' ')[0],
      manufacturer: p.manufacturer,
      category: p.category,
      reference: null,
      market_region: 'FR',
      source: 'manual_catalogue',
      source_metadata: {
        origin: 'catalogue_officiel_fabricant',
        added_date: '2026-04-26',
        description_fr: p.desc
      },
      confidence_score: 0.95,
      last_synced_at: new Date().toISOString()
    };
  });

  // Group by manufacturer for logging
  const byMfg = {};
  products.forEach(p => { byMfg[p.manufacturer] = (byMfg[p.manufacturer] || 0) + 1; });

  log('\nFabricants :');
  Object.entries(byMfg).sort((a, b) => b[1] - a[1]).forEach(([m, c]) => {
    log(`  ${String(c).padStart(3)} | ${m}`);
  });

  // Upsert par batch de 50
  let totalInserted = 0;
  for (let i = 0; i < products.length; i += 50) {
    const batch = products.slice(i, i + 50);
    const n = await upsertBatch(supabase, batch);
    totalInserted += n;
    log(`  Batch ${Math.floor(i / 50) + 1}: ${n}/${batch.length} insérés`);
  }

  const { count: after } = await supabase
    .from('products_database')
    .select('*', { count: 'exact', head: true });

  log(`\n${'═'.repeat(55)}`);
  log(`CATALOGUES MANUELS TERMINÉ`);
  log(`  Produits dans le script : ${CATALOGUES.length}`);
  log(`  Insérés/upsertés : ${totalInserted}`);
  log(`  Total avant : ${before}`);
  log(`  Total après : ${after}`);
  log(`  Nouveaux : ${after - before}`);
  log('═'.repeat(55));
}

main().catch(e => { log('ERREUR FATALE: ' + e.message); process.exit(1); });
