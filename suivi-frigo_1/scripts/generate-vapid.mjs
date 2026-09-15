#!/usr/bin/env node
/**
 * Génère une paire de clés VAPID pour les notifications push.
 * Usage : npm run vapid
 */
import webpush from 'web-push'

const keys = webpush.generateVAPIDKeys()

console.log(`
=====================================================================
  Clés VAPID générées — copiez-les dans votre fichier .env
  ET dans Netlify > Site settings > Environment variables
=====================================================================

VITE_VAPID_PUBLIC_KEY=${keys.publicKey}
VAPID_PUBLIC_KEY=${keys.publicKey}
VAPID_PRIVATE_KEY=${keys.privateKey}
VAPID_SUBJECT=mailto:contact@votre-domaine.fr

---------------------------------------------------------------------
  ATTENTION : ne régénérez jamais ces clés une fois en production,
  tous les appareils déjà abonnés cesseraient de recevoir les
  notifications et devraient se réabonner.
=====================================================================
`)
