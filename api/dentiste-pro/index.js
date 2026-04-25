// =============================================
// JADOMI — Dentiste Pro : point d'entree
// Monte toutes les routes /api/dentiste-pro/*
// Fonctionne pour TOUTES les professions de sante
// =============================================
const express = require('express');

module.exports = function mountDentistePro(app) {
  const base = '/api/dentiste-pro';

  // Auth patient (OTP + JWT)
  try {
    app.use(`${base}/auth`, require('./auth'));
    console.log('[dentiste-pro] Routes auth montees');
  } catch (e) {
    console.warn('[dentiste-pro] Auth non charge:', e.message);
  }

  // Gestion cabinet (admin praticien)
  try {
    app.use(`${base}/cabinet`, require('./cabinet'));
    console.log('[dentiste-pro] Routes cabinet montees');
  } catch (e) {
    console.warn('[dentiste-pro] Cabinet non charge:', e.message);
  }

  // Chat direct praticien/patient (messagerie)
  try {
    app.use(`${base}/chat`, require('./chat'));
    console.log('[dentiste-pro] Routes chat montees');
  } catch (e) {
    console.warn('[dentiste-pro] Chat non charge:', e.message);
  }

  // Chat IA 24/7 (assistant virtuel patient)
  try {
    app.use(`${base}/chat-ia`, require('./chat-ia'));
    console.log('[dentiste-pro] Routes chat-ia montees');
  } catch (e) {
    console.warn('[dentiste-pro] Chat IA non charge:', e.message);
  }

  // Waitlist intelligente (liste d'attente, detection annulation, urgence)
  try {
    app.use(`${base}/waitlist`, require('./waitlist'));
    console.log('[dentiste-pro] Routes waitlist montees');
  } catch (e) {
    console.warn('[dentiste-pro] Waitlist non charge:', e.message);
  }

  // Rappels SMS/email/push (4 rappels par RDV)
  try {
    app.use(`${base}/rappels`, require('./rappels'));
    console.log('[dentiste-pro] Routes rappels montees');
  } catch (e) {
    console.warn('[dentiste-pro] Rappels non charge:', e.message);
  }

  // Dashboard Morning Huddle (stats, pipeline, programme du jour)
  try {
    app.use(`${base}/dashboard`, require('./dashboard'));
    console.log('[dentiste-pro] Routes dashboard montees');
  } catch (e) {
    console.warn('[dentiste-pro] Dashboard non charge:', e.message);
  }

  // Gestion equipe (roles, permissions, invitations)
  try {
    app.use(`${base}/team`, require('./team'));
    console.log('[dentiste-pro] Routes team montees');
  } catch (e) {
    console.warn('[dentiste-pro] Team non charge:', e.message);
  }

  // Triangle Photo : communication 3 parties Patient-Praticien-Labo
  try {
    app.use(`${base}/triangle`, require('./triangle'));
    console.log('[dentiste-pro] Routes triangle montees');
  } catch (e) {
    console.warn('[dentiste-pro] Triangle non charge:', e.message);
  }

  // Reseau de Soins : coordination interprofessionnelle N praticiens
  try {
    app.use(`${base}/reseau`, require('./reseau'));
    console.log('[dentiste-pro] Routes reseau de soins montees');
  } catch (e) {
    console.warn('[dentiste-pro] Reseau de soins non charge:', e.message);
  }

  // Photo AI : analyse IA des photos (Claude Vision)
  try {
    app.use(`${base}/photo-ai`, require('./photo-ai'));
    console.log('[dentiste-pro] Routes photo-ai montees');
  } catch (e) {
    console.warn('[dentiste-pro] Photo AI non charge:', e.message);
  }
};
