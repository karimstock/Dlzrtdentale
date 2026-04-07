// =============================================
// JADOMI — Entry point Vercel serverless
// =============================================
// Vercel detecte api/index.js comme fonction serverless.
// On reexpose simplement l'app Express definie dans server.js.
// La variable VERCEL=1 (injectee par Vercel) empeche server.js
// d'appeler app.listen() en environnement serverless.
// =============================================

module.exports = require('../server.js');
