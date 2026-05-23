// =============================================
// JADOMI — Templates Documents Prud'homaux
// 8 modèles de documents juridiques pour le module
// de génération documentaire avocat prud'homal
//
// Chaque template : id, nom, description,
// variables_requises, variables_optionnelles,
// contenu (HTML avec {{variables}})
// =============================================

const templates = {

  // ─────────────────────────────────────────────
  // TEMPLATE 1 : Requête introductive d'instance
  // ─────────────────────────────────────────────
  requete_cph: {
    id: 'requete_cph',
    nom: 'Requête introductive d\'instance devant le CPH',
    description: 'Requête introductive d\'instance devant le Conseil de prud\'hommes conformément à l\'article R.1452-2 du Code du travail.',
    variables_requises: [
      'client_nom', 'client_prenom', 'client_adresse',
      'employeur_nom', 'employeur_adresse', 'employeur_siret',
      'juridiction', 'section',
      'date_embauche', 'date_rupture', 'poste', 'salaire_brut',
      'convention_collective', 'motif_saisine',
      'demandes_chiffrees', 'rappel_des_faits'
    ],
    variables_optionnelles: [
      'avocat_nom', 'avocat_barreau', 'avocat_adresse',
      'anciennete', 'classification', 'temps_travail',
      'pieces_jointes'
    ],
    contenu: `<div class="document-juridique requete-cph">
  <div class="entete-juridiction">
    <h1 class="titre-juridiction">CONSEIL DE PRUD'HOMMES DE {{juridiction}}</h1>
    <h2 class="sous-titre-document">REQUÊTE INTRODUCTIVE D'INSTANCE</h2>
    <p class="reference-legale">(Art. R.1452-2 du Code du travail)</p>
    <p class="section-cph">Section : {{section}}</p>
  </div>

  <div class="partie demandeur">
    <h3>DEMANDEUR</h3>
    <p>{{client_prenom}} {{client_nom}}</p>
    <p>Demeurant : {{client_adresse}}</p>
  </div>

  <div class="partie defendeur">
    <h3>DÉFENDEUR</h3>
    <p>{{employeur_nom}}</p>
    <p>Siège social : {{employeur_adresse}}</p>
    <p>SIRET : {{employeur_siret}}</p>
  </div>

  <div class="section-contrat">
    <h3>ÉLÉMENTS DU CONTRAT DE TRAVAIL</h3>
    <ul>
      <li>Date d'embauche : {{date_embauche}}</li>
      <li>Date de rupture : {{date_rupture}}</li>
      <li>Poste occupé : {{poste}}</li>
      <li>Salaire brut mensuel : {{salaire_brut}} €</li>
      <li>Convention collective applicable : {{convention_collective}}</li>
    </ul>
  </div>

  <div class="section-objet">
    <h3>OBJET DE LA DEMANDE</h3>
    <p>{{motif_saisine}}</p>
  </div>

  <div class="section-faits">
    <h3>EXPOSÉ DES FAITS</h3>
    <div class="contenu-faits">{{rappel_des_faits}}</div>
  </div>

  <div class="section-demandes">
    <h3>DEMANDES</h3>
    <p>Il est demandé au Conseil de prud'hommes de bien vouloir :</p>
    <div class="demandes-chiffrees">{{demandes_chiffrees}}</div>
  </div>

  <div class="section-signature">
    <p>Fait à {{juridiction}}, le _______________</p>
    <p class="signature-demandeur">Signature du demandeur</p>
  </div>

  <div class="section-pieces">
    <h3>PIÈCES JOINTES</h3>
    <p>Voir bordereau de communication de pièces annexé.</p>
  </div>
</div>`
  },

  // ─────────────────────────────────────────────
  // TEMPLATE 2 : Conclusions au fond
  // ─────────────────────────────────────────────
  conclusions: {
    id: 'conclusions',
    nom: 'Conclusions au fond devant le CPH',
    description: 'Conclusions en demande ou en défense devant le Conseil de prud\'hommes, avec rappel des faits, discussion juridique et demandes chiffrées.',
    variables_requises: [
      'client_nom', 'client_prenom', 'employeur_nom',
      'juridiction', 'rg_numero',
      'rappel_des_faits', 'discussion_juridique',
      'demandes_chiffrees', 'pieces_liste'
    ],
    variables_optionnelles: [
      'avocat_nom', 'avocat_barreau', 'date_audience',
      'qualite_demandeur', 'moyens_adverses'
    ],
    contenu: `<div class="document-juridique conclusions">
  <div class="entete-conclusions">
    <h1 class="titre-juridiction">CONSEIL DE PRUD'HOMMES DE {{juridiction}}</h1>
    <p class="rg-numero">RG n° {{rg_numero}}</p>
    <h2 class="type-conclusions">CONCLUSIONS EN DEMANDE</h2>
  </div>

  <div class="parties-conclusions">
    <div class="partie pour">
      <h3>POUR :</h3>
      <p>{{client_prenom}} {{client_nom}}</p>
      <p>Demandeur</p>
    </div>
    <div class="partie contre">
      <h3>CONTRE :</h3>
      <p>{{employeur_nom}}</p>
      <p>Défendeur</p>
    </div>
  </div>

  <div class="corps-conclusions">
    <div class="section-rappel">
      <h3>I. RAPPEL DES FAITS</h3>
      <div class="contenu-faits">{{rappel_des_faits}}</div>
    </div>

    <div class="section-discussion">
      <h3>II. DISCUSSION</h3>
      <div class="contenu-discussion">{{discussion_juridique}}</div>
    </div>

    <div class="section-motifs">
      <h3>III. PAR CES MOTIFS</h3>
      <p>Il est demandé au Conseil de prud'hommes de bien vouloir :</p>
      <div class="demandes-chiffrees">{{demandes_chiffrees}}</div>
      <p class="reserves">SOUS TOUTES RÉSERVES</p>
    </div>
  </div>

  <div class="bordereau-pieces">
    <h3>BORDEREAU DE PIÈCES COMMUNIQUÉES</h3>
    <div class="liste-pieces">{{pieces_liste}}</div>
  </div>
</div>`
  },

  // ─────────────────────────────────────────────
  // TEMPLATE 3 : Bordereau de communication
  // ─────────────────────────────────────────────
  bordereau: {
    id: 'bordereau',
    nom: 'Bordereau de communication de pièces',
    description: 'Bordereau de communication de pièces conformément à l\'article R.1453-5 du Code de procédure civile.',
    variables_requises: [
      'client_nom', 'client_prenom', 'employeur_nom',
      'juridiction', 'rg_numero', 'pieces_liste'
    ],
    variables_optionnelles: [
      'avocat_nom', 'avocat_barreau', 'date_communication'
    ],
    contenu: `<div class="document-juridique bordereau">
  <div class="entete-bordereau">
    <h1 class="titre-juridiction">CONSEIL DE PRUD'HOMMES DE {{juridiction}}</h1>
    <p class="rg-numero">RG n° {{rg_numero}}</p>
    <h2 class="sous-titre-document">BORDEREAU DE COMMUNICATION DE PIÈCES</h2>
    <p class="reference-legale">(Art. R.1453-5 du Code de procédure civile)</p>
  </div>

  <div class="parties-bordereau">
    <p><strong>Pièces communiquées par :</strong> {{client_prenom}} {{client_nom}}</p>
    <p><strong>À :</strong> {{employeur_nom}}</p>
  </div>

  <div class="tableau-pieces">
    <table class="table-bordereau">
      <thead>
        <tr>
          <th>Pièce n°</th>
          <th>Désignation</th>
          <th>Date</th>
          <th>Nombre de pages</th>
        </tr>
      </thead>
      <tbody>
        {{pieces_liste}}
      </tbody>
    </table>
  </div>

  <div class="section-signature">
    <p>Fait à {{juridiction}}, le _______________</p>
    <p class="mention-certification">Je certifie que les pièces ci-dessus ont été communiquées à la partie adverse.</p>
    <p class="signature">Signature</p>
  </div>
</div>`
  },

  // ─────────────────────────────────────────────
  // TEMPLATE 4 : Mise en demeure
  // ─────────────────────────────────────────────
  mise_en_demeure: {
    id: 'mise_en_demeure',
    nom: 'Mise en demeure de l\'employeur',
    description: 'Lettre de mise en demeure adressée à l\'employeur par voie recommandée avec accusé de réception.',
    variables_requises: [
      'client_nom', 'client_prenom',
      'employeur_nom', 'employeur_adresse',
      'objet', 'rappel_des_faits',
      'fondement_juridique', 'demande', 'delai_jours'
    ],
    variables_optionnelles: [
      'avocat_nom', 'avocat_barreau', 'avocat_adresse',
      'date_courrier', 'reference_dossier'
    ],
    contenu: `<div class="document-juridique mise-en-demeure">
  <div class="entete-lettre">
    <div class="expediteur">
      <p>{{client_prenom}} {{client_nom}}</p>
    </div>
    <div class="destinataire">
      <p>{{employeur_nom}}</p>
      <p>{{employeur_adresse}}</p>
    </div>
  </div>

  <div class="mention-envoi">
    <p class="type-envoi"><strong>Lettre recommandée avec accusé de réception</strong></p>
  </div>

  <div class="objet-lettre">
    <p><strong>Objet : MISE EN DEMEURE — {{objet}}</strong></p>
  </div>

  <div class="corps-lettre">
    <p>Madame, Monsieur,</p>

    <div class="paragraphe-faits">
      <p>{{rappel_des_faits}}</p>
    </div>

    <div class="paragraphe-fondement">
      <p>Or, conformément aux dispositions de {{fondement_juridique}}, vous êtes tenu(e) de respecter vos obligations à ce titre.</p>
    </div>

    <div class="paragraphe-demande">
      <p>Par la présente, je vous mets en demeure de {{demande}} dans un délai de <strong>{{delai_jours}} jours</strong> à compter de la réception de la présente.</p>
    </div>

    <div class="paragraphe-menace">
      <p>À défaut de réponse satisfaisante dans le délai imparti, je me verrai contraint(e) de saisir le Conseil de prud'hommes afin de faire valoir mes droits, sans qu'il soit besoin d'une nouvelle mise en demeure.</p>
    </div>

    <div class="paragraphe-fermeture">
      <p>Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.</p>
    </div>
  </div>

  <div class="section-signature">
    <p>Fait le _______________</p>
    <p class="signature">{{client_prenom}} {{client_nom}}</p>
  </div>
</div>`
  },

  // ─────────────────────────────────────────────
  // TEMPLATE 5 : Demande de renvoi d'audience
  // ─────────────────────────────────────────────
  demande_renvoi: {
    id: 'demande_renvoi',
    nom: 'Demande de renvoi d\'audience',
    description: 'Courrier adressé au greffe du Conseil de prud\'hommes pour solliciter le renvoi d\'une audience à une date ultérieure.',
    variables_requises: [
      'client_nom', 'employeur_nom',
      'juridiction', 'rg_numero',
      'date_audience', 'motif_renvoi', 'date_souhaitee'
    ],
    variables_optionnelles: [
      'avocat_nom', 'avocat_barreau', 'avocat_adresse',
      'section', 'accord_adverse'
    ],
    contenu: `<div class="document-juridique demande-renvoi">
  <div class="entete-lettre">
    <div class="destinataire">
      <p>Monsieur le Président du</p>
      <p>Conseil de prud'hommes de {{juridiction}}</p>
      <p>Greffe de la section compétente</p>
    </div>
  </div>

  <div class="objet-lettre">
    <p><strong>Objet :</strong> Demande de renvoi d'audience</p>
    <p><strong>RG n° :</strong> {{rg_numero}}</p>
    <p><strong>Audience prévue le :</strong> {{date_audience}}</p>
    <p><strong>Affaire :</strong> {{client_nom}} c/ {{employeur_nom}}</p>
  </div>

  <div class="corps-lettre">
    <p>Monsieur le Président,</p>

    <p>J'ai l'honneur de solliciter le renvoi de l'audience fixée au {{date_audience}} dans l'affaire susvisée opposant {{client_nom}} à {{employeur_nom}}.</p>

    <div class="paragraphe-motif">
      <p><strong>Motif du renvoi :</strong></p>
      <p>{{motif_renvoi}}</p>
    </div>

    <div class="paragraphe-date">
      <p>Je vous serais reconnaissant(e) de bien vouloir fixer une nouvelle date d'audience, si possible au {{date_souhaitee}}, ou à toute date qu'il vous plaira de retenir.</p>
    </div>

    <p>Je vous prie d'agréer, Monsieur le Président, l'expression de ma haute considération.</p>
  </div>

  <div class="section-signature">
    <p>Fait le _______________</p>
    <p class="signature">Signature</p>
  </div>
</div>`
  },

  // ─────────────────────────────────────────────
  // TEMPLATE 6 : Courrier d'information au client
  // ─────────────────────────────────────────────
  courrier_client: {
    id: 'courrier_client',
    nom: 'Courrier d\'information au client',
    description: 'Lettre d\'information adressée au client avec vouvoiement premium et formules de courtoisie adaptées.',
    variables_requises: [
      'client_nom', 'client_prenom',
      'client_civilite', 'objet', 'contenu_lettre'
    ],
    variables_optionnelles: [
      'avocat_nom', 'avocat_barreau', 'avocat_adresse',
      'pieces_jointes', 'reference_dossier', 'date_courrier'
    ],
    contenu: `<div class="document-juridique courrier-client">
  <div class="entete-cabinet">
    <div class="coordonnees-cabinet"></div>
  </div>

  <div class="objet-lettre">
    <p><strong>Objet :</strong> {{objet}}</p>
  </div>

  <div class="corps-lettre">
    <p>Cher(e) {{client_civilite}} {{client_nom}},</p>

    <div class="contenu-courrier">{{contenu_lettre}}</div>

    <p>Je reste à votre entière disposition pour tout renseignement complémentaire que vous pourriez souhaiter et demeure disponible pour convenir d'un rendez-vous à votre meilleure convenance.</p>

    <p>Veuillez agréer, {{client_civilite}} {{client_nom}}, l'expression de mes salutations les plus distinguées et de mon entier dévouement.</p>
  </div>

  <div class="section-signature">
    <p class="signature">Signature de l'avocat</p>
  </div>

  <div class="section-pj">
    <p><strong>Pièces jointes :</strong></p>
    <div class="liste-pj">{{pieces_jointes}}</div>
  </div>
</div>`
  },

  // ─────────────────────────────────────────────
  // TEMPLATE 7 : Courrier au conseil adverse
  // ─────────────────────────────────────────────
  courrier_confrere: {
    id: 'courrier_confrere',
    nom: 'Courrier au conseil adverse',
    description: 'Courrier confraternité adressé à l\'avocat de la partie adverse avec les formules d\'usage entre confrères.',
    variables_requises: [
      'confrere_nom', 'confrere_civilite',
      'client_nom', 'employeur_nom',
      'rg_numero', 'objet', 'contenu_lettre'
    ],
    variables_optionnelles: [
      'avocat_nom', 'avocat_barreau', 'avocat_adresse',
      'confrere_adresse', 'confrere_barreau',
      'date_courrier', 'pieces_jointes'
    ],
    contenu: `<div class="document-juridique courrier-confrere">
  <div class="entete-cabinet">
    <div class="coordonnees-cabinet"></div>
  </div>

  <div class="destinataire-confrere">
    <p>{{confrere_civilite}} {{confrere_nom}}</p>
    <p>Avocat au Barreau</p>
  </div>

  <div class="objet-lettre">
    <p><strong>Objet :</strong> {{objet}}</p>
    <p><strong>Dossier :</strong> {{client_nom}} c/ {{employeur_nom}} — RG n° {{rg_numero}}</p>
  </div>

  <div class="corps-lettre">
    <p>Cher(e) Confrère,</p>

    <div class="contenu-courrier">{{contenu_lettre}}</div>

    <p>Dans l'attente de votre retour, je vous prie de croire, Cher(e) Confrère, en l'assurance de mes sentiments confraternels les meilleurs.</p>

    <p class="formule-fin">Confraternellement,</p>
  </div>

  <div class="section-signature">
    <p class="signature">Signature</p>
  </div>
</div>`
  },

  // ─────────────────────────────────────────────
  // TEMPLATE 8 : Note d'audience
  // ─────────────────────────────────────────────
  note_audience: {
    id: 'note_audience',
    nom: 'Note d\'audience — fiche synthétique',
    description: 'Fiche synthétique A4 optimisée pour lecture rapide en audience, avec points forts, points faibles, arguments clés et jurisprudences à citer.',
    variables_requises: [
      'client_nom', 'employeur_nom',
      'juridiction', 'rg_numero',
      'date_audience', 'section',
      'points_forts', 'points_faibles',
      'arguments_cles', 'jurisprudences_a_citer',
      'pieces_essentielles', 'questions_adverses_probables'
    ],
    variables_optionnelles: [
      'avocat_nom', 'formation', 'duree_estimee',
      'magistrat_nom', 'notes_personnelles'
    ],
    contenu: `<div class="document-juridique note-audience">
  <div class="entete-note">
    <h1 class="titre-note">NOTE D'AUDIENCE</h1>
    <div class="meta-audience">
      <p><strong>RG n° :</strong> {{rg_numero}}</p>
      <p><strong>Date d'audience :</strong> {{date_audience}}</p>
      <p><strong>Juridiction :</strong> CPH de {{juridiction}} — Section {{section}}</p>
      <p><strong>Affaire :</strong> {{client_nom}} c/ {{employeur_nom}}</p>
    </div>
  </div>

  <div class="bloc-note bloc-points-forts">
    <h2 class="titre-bloc titre-forts">POINTS FORTS</h2>
    <div class="contenu-bloc">{{points_forts}}</div>
  </div>

  <div class="bloc-note bloc-points-faibles">
    <h2 class="titre-bloc titre-faibles">POINTS FAIBLES</h2>
    <div class="contenu-bloc">{{points_faibles}}</div>
  </div>

  <div class="bloc-note bloc-arguments">
    <h2 class="titre-bloc titre-arguments">ARGUMENTS CLÉS</h2>
    <div class="contenu-bloc">{{arguments_cles}}</div>
  </div>

  <div class="bloc-note bloc-jurisprudences">
    <h2 class="titre-bloc titre-jurisprudences">JURISPRUDENCES À CITER</h2>
    <div class="contenu-bloc">{{jurisprudences_a_citer}}</div>
  </div>

  <div class="bloc-note bloc-pieces">
    <h2 class="titre-bloc titre-pieces">PIÈCES ESSENTIELLES</h2>
    <div class="contenu-bloc">{{pieces_essentielles}}</div>
  </div>

  <div class="bloc-note bloc-anticiper">
    <h2 class="titre-bloc titre-anticiper">ANTICIPER — Questions adverses probables</h2>
    <div class="contenu-bloc">{{questions_adverses_probables}}</div>
  </div>
</div>`
  }

};

// =============================================
// API publique
// =============================================

/**
 * Retourne un template par son identifiant
 * @param {string} id - Identifiant du template
 * @returns {object|null} Le template complet ou null si non trouvé
 */
function getTemplate(id) {
  return templates[id] || null;
}

/**
 * Retourne la liste résumée de tous les templates disponibles
 * @returns {Array<{id: string, nom: string, description: string, variables_requises: string[]}>}
 */
function listTemplates() {
  return Object.values(templates).map(t => ({
    id: t.id,
    nom: t.nom,
    description: t.description,
    variables_requises: t.variables_requises
  }));
}

module.exports = { templates, getTemplate, listTemplates };
