// =============================================
// JADOMI — Multi-sociétés : point d'entrée (mount central)
// Usage dans server.js :
//   require('./api/multiSocietes')(app);
// =============================================
module.exports = function mountMultiSocietes(app) {
  try { require('./profil')(app); }   catch (e) { console.warn('[multi/profil]', e.message); }
  try { require('./health')(app); }   catch (e) { console.warn('[multi/health]', e.message); }
  try { require('./societes')(app); } catch (e) { console.warn('[multi/societes]', e.message); }
  try { require('./sci')(app); }      catch (e) { console.warn('[multi/sci]', e.message); }
  try { require('./commerce')(app); } catch (e) { console.warn('[multi/commerce]', e.message); }
  try { require('./mailing')(app); }  catch (e) { console.warn('[multi/mailing]', e.message); }
  try { require('./billing')(app); }  catch (e) { console.warn('[multi/billing]', e.message); }
  try { require('./catalogue')(app); } catch (e) { console.warn('[multi/catalogue]', e.message); }
  try { require('./notifications')(app); } catch (e) { console.warn('[multi/notifications]', e.message); }
  try { require('./retours')(app); } catch (e) { console.warn('[multi/retours]', e.message); }
  try { require('./reclamations')(app); } catch (e) { console.warn('[multi/reclamations]', e.message); }
  try { require('./peremption')(app); } catch (e) { console.warn('[multi/peremption]', e.message); }
  try { require('./factureFournImport')(app); } catch (e) { console.warn('[multi/factureFournImport]', e.message); }
  try { require('./market')(app); } catch (e) { console.warn('[multi/market]', e.message); }
  console.log('[JADOMI] Module multi-sociétés monté');
};
