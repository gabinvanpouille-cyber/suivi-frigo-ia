/* Export Excel complet : relevés, synthèses, non-conformités, journal. */
import { dateFR, heureCourte, horodatage, pourcentage, versNombre } from './utils'

const BLEU = 'FF0284C7'
const ROUGE_FOND = 'FFFDE8E8'
const ROUGE_TEXTE = 'FFB91C1C'
const VERT_TEXTE = 'FF047857'
const GRIS_FOND = 'FFF1F5F9'

function styliserEntete(feuille, ligne = 1) {
  const l = feuille.getRow(ligne)
  l.height = 22
  l.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLEU } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } }
  })
  l.commit?.()
}

function finaliser(feuille, nbColonnes) {
  feuille.views = [{ state: 'frozen', ySplit: 1 }]
  if (nbColonnes > 0) {
    feuille.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: nbColonnes },
    }
  }
}

/**
 * Construit et télécharge le classeur.
 * @param {Array} mesures  lignes de la vue v_mesures_completes
 * @param {Array} historique  lignes de releve_historique (facultatif)
 * @param {Object} meta  { fermeNom, debut, fin }
 */
export async function exporterExcel(mesures, historique, meta) {
  const ExcelJS = (await import('exceljs')).default
  const classeur = new ExcelJS.Workbook()
  classeur.creator = 'SUIVI FRIGO'
  classeur.created = new Date()

  const periode = `${dateFR(meta.debut)} au ${dateFR(meta.fin)}`

  /* ---------------- Feuille 1 : relevés détaillés ------------------- */
  const f1 = classeur.addWorksheet('Relevés', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  })
  f1.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Heure', key: 'heure', width: 9 },
    { header: 'Frigo', key: 'frigo', width: 26 },
    { header: 'Emplacement', key: 'lieu', width: 18 },
    { header: 'Température (°C)', key: 'temp', width: 15 },
    { header: 'Seuil min', key: 'min', width: 10 },
    { header: 'Seuil max', key: 'max', width: 10 },
    { header: 'Conformité', key: 'conf', width: 14 },
    { header: 'Écart (°C)', key: 'ecart', width: 11 },
    { header: 'Relevé par', key: 'auteur', width: 20 },
    { header: 'Statut', key: 'statut', width: 12 },
    { header: 'Modifications', key: 'modifs', width: 13 },
    { header: 'Remarque frigo', key: 'rq_frigo', width: 34 },
    { header: 'Remarque relevé', key: 'rq_releve', width: 34 },
    { header: 'Photo', key: 'photo', width: 9 },
  ]

  mesures.forEach((m) => {
    const t = versNombre(m.temperature)
    let e = null
    if (t !== null) {
      if (t > Number(m.seuil_max)) e = +(t - Number(m.seuil_max)).toFixed(2)
      else if (t < Number(m.seuil_min)) e = +(t - Number(m.seuil_min)).toFixed(2)
    }
    const ligne = f1.addRow({
      date: dateFR(m.date_releve),
      heure: heureCourte(m.heure_releve),
      frigo: m.frigo_nom,
      lieu: m.frigo_emplacement || '',
      temp: t,
      min: Number(m.seuil_min),
      max: Number(m.seuil_max),
      conf: m.conforme ? 'Conforme' : 'NON CONFORME',
      ecart: e,
      auteur: m.auteur_nom || '',
      statut: m.statut === 'valide' ? 'Validé' : 'Brouillon',
      modifs: m.nb_modifications || 0,
      rq_frigo: m.remarque_mesure || '',
      rq_releve: m.remarque_releve || '',
      photo: m.photo_url ? 'Oui' : '',
    })

    ligne.getCell('temp').numFmt = '0.0'
    ligne.getCell('min').numFmt = '0.0'
    ligne.getCell('max').numFmt = '0.0'
    ligne.getCell('ecart').numFmt = '+0.0;-0.0'
    ligne.getCell('conf').alignment = { horizontal: 'center' }

    if (!m.conforme) {
      ;['temp', 'conf', 'ecart'].forEach((k) => {
        ligne.getCell(k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROUGE_FOND } }
        ligne.getCell(k).font = { bold: true, color: { argb: ROUGE_TEXTE } }
      })
    } else {
      ligne.getCell('conf').font = { color: { argb: VERT_TEXTE } }
    }
    if ((m.nb_modifications || 0) > 0) {
      ligne.getCell('modifs').font = { bold: true, color: { argb: 'FFB45309' } }
    }
  })
  styliserEntete(f1)
  finaliser(f1, f1.columns.length)

  /* ---------------- Feuille 2 : synthèse par frigo ------------------ */
  const f2 = classeur.addWorksheet('Synthèse par frigo')
  f2.columns = [
    { header: 'Frigo', key: 'frigo', width: 28 },
    { header: 'Emplacement', key: 'lieu', width: 18 },
    { header: 'Seuil min', key: 'min', width: 10 },
    { header: 'Seuil max', key: 'max', width: 10 },
    { header: 'Nb mesures', key: 'n', width: 12 },
    { header: 'Moyenne', key: 'moy', width: 11 },
    { header: 'Minimum', key: 'tmin', width: 11 },
    { header: 'Maximum', key: 'tmax', width: 11 },
    { header: 'Écart-type', key: 'sd', width: 11 },
    { header: 'Non conformes', key: 'nc', width: 14 },
    { header: 'Taux de conformité', key: 'taux', width: 18 },
  ]

  const parFrigo = {}
  mesures.forEach((m) => {
    const k = m.frigo_id
    parFrigo[k] ||= { nom: m.frigo_nom, lieu: m.frigo_emplacement, min: m.seuil_min, max: m.seuil_max, vals: [], nc: 0 }
    const t = versNombre(m.temperature)
    if (t !== null) parFrigo[k].vals.push(t)
    if (!m.conforme) parFrigo[k].nc++
  })

  Object.values(parFrigo).forEach((g) => {
    const n = g.vals.length
    const moy = n ? g.vals.reduce((a, b) => a + b, 0) / n : null
    const sd = n > 1 ? Math.sqrt(g.vals.reduce((a, b) => a + (b - moy) ** 2, 0) / (n - 1)) : null
    const ligne = f2.addRow({
      frigo: g.nom,
      lieu: g.lieu || '',
      min: Number(g.min),
      max: Number(g.max),
      n,
      moy: moy === null ? null : +moy.toFixed(2),
      tmin: n ? Math.min(...g.vals) : null,
      tmax: n ? Math.max(...g.vals) : null,
      sd: sd === null ? null : +sd.toFixed(2),
      nc: g.nc,
      taux: n ? (n - g.nc) / n : null,
    })
    ;['min', 'max', 'moy', 'tmin', 'tmax', 'sd'].forEach((k) => (ligne.getCell(k).numFmt = '0.0'))
    ligne.getCell('taux').numFmt = '0.0%'
    if (g.nc > 0) {
      ligne.getCell('nc').font = { bold: true, color: { argb: ROUGE_TEXTE } }
      ligne.getCell('taux').font = { bold: true, color: { argb: ROUGE_TEXTE } }
    }
  })
  styliserEntete(f2)
  finaliser(f2, f2.columns.length)

  /* ---------------- Feuille 3 : synthèse par jour ------------------- */
  const f3 = classeur.addWorksheet('Synthèse par jour')
  f3.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Nb relevés', key: 'nr', width: 12 },
    { header: 'Nb mesures', key: 'nm', width: 12 },
    { header: 'Non conformes', key: 'nc', width: 14 },
    { header: 'Taux de conformité', key: 'taux', width: 18 },
    { header: 'Température moyenne', key: 'moy', width: 20 },
    { header: 'Intervenants', key: 'qui', width: 30 },
  ]

  const parJour = {}
  mesures.forEach((m) => {
    const k = m.date_releve
    parJour[k] ||= { releves: new Set(), vals: [], nc: 0, n: 0, qui: new Set() }
    parJour[k].releves.add(m.releve_id)
    parJour[k].n++
    if (!m.conforme) parJour[k].nc++
    const t = versNombre(m.temperature)
    if (t !== null) parJour[k].vals.push(t)
    if (m.auteur_nom) parJour[k].qui.add(m.auteur_nom)
  })

  Object.keys(parJour).sort().forEach((jour) => {
    const g = parJour[jour]
    const moy = g.vals.length ? g.vals.reduce((a, b) => a + b, 0) / g.vals.length : null
    const ligne = f3.addRow({
      date: dateFR(jour),
      nr: g.releves.size,
      nm: g.n,
      nc: g.nc,
      taux: g.n ? (g.n - g.nc) / g.n : null,
      moy: moy === null ? null : +moy.toFixed(2),
      qui: [...g.qui].join(', '),
    })
    ligne.getCell('taux').numFmt = '0.0%'
    ligne.getCell('moy').numFmt = '0.0'
    if (g.nc > 0) {
      ligne.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROUGE_FOND } }))
    }
  })
  styliserEntete(f3)
  finaliser(f3, f3.columns.length)

  /* ---------------- Feuille 4 : non-conformités --------------------- */
  const nonConformes = mesures.filter((m) => m.conforme === false)
  const f4 = classeur.addWorksheet('Non-conformités')
  f4.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Heure', key: 'heure', width: 9 },
    { header: 'Frigo', key: 'frigo', width: 26 },
    { header: 'Température', key: 'temp', width: 13 },
    { header: 'Seuils autorisés', key: 'seuils', width: 18 },
    { header: 'Écart', key: 'ecart', width: 11 },
    { header: 'Relevé par', key: 'auteur', width: 20 },
    { header: 'Remarque', key: 'rq', width: 45 },
    { header: 'Action corrective (à compléter)', key: 'action', width: 45 },
  ]
  nonConformes.forEach((m) => {
    const t = versNombre(m.temperature)
    const e = t > Number(m.seuil_max) ? t - Number(m.seuil_max) : t - Number(m.seuil_min)
    const ligne = f4.addRow({
      date: dateFR(m.date_releve),
      heure: heureCourte(m.heure_releve),
      frigo: m.frigo_nom,
      temp: t,
      seuils: `${Number(m.seuil_min).toFixed(1)} à ${Number(m.seuil_max).toFixed(1)} °C`,
      ecart: e === null ? null : +e.toFixed(2),
      auteur: m.auteur_nom || '',
      rq: m.remarque_mesure || m.remarque_releve || '',
      action: '',
    })
    ligne.getCell('temp').numFmt = '0.0'
    ligne.getCell('ecart').numFmt = '+0.0;-0.0'
    ligne.getCell('temp').font = { bold: true, color: { argb: ROUGE_TEXTE } }
    ligne.getCell('action').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } }
  })
  if (!nonConformes.length) {
    f4.addRow({ date: 'Aucune non-conformité sur la période.' }).font = { italic: true, color: { argb: VERT_TEXTE } }
  }
  styliserEntete(f4)
  finaliser(f4, f4.columns.length)

  /* ---------------- Feuille 5 : journal des modifications ----------- */
  if (historique?.length) {
    const f5 = classeur.addWorksheet('Journal')
    f5.columns = [
      { header: 'Horodatage', key: 'quand', width: 20 },
      { header: 'Action', key: 'action', width: 16 },
      { header: 'Utilisateur', key: 'qui', width: 22 },
      { header: 'Relevé du', key: 'jour', width: 12 },
      { header: 'Détails', key: 'det', width: 70 },
    ]
    const libelles = {
      creation: 'Création', validation: 'Validation',
      modification: 'Modification', suppression: 'Suppression',
    }
    historique.forEach((h) => {
      const ligne = f5.addRow({
        quand: horodatage(h.created_at),
        action: libelles[h.action] || h.action,
        qui: h.auteur_nom || '',
        jour: h.date_releve ? dateFR(h.date_releve) : '',
        det: JSON.stringify(h.details ?? {}, null, 0).replace(/[{}"]/g, '').replace(/,/g, ' · '),
      })
      if (h.action === 'modification') {
        ligne.getCell('action').font = { bold: true, color: { argb: 'FFB45309' } }
      }
    })
    styliserEntete(f5)
    finaliser(f5, f5.columns.length)
  }

  /* ---------------- Feuille 6 : informations ------------------------ */
  const f6 = classeur.addWorksheet('Informations')
  f6.columns = [
    { header: 'Rubrique', key: 'k', width: 30 },
    { header: 'Valeur', key: 'v', width: 52 },
  ]
  const total = mesures.length
  const nc = nonConformes.length
  const nbReleves = new Set(mesures.map((m) => m.releve_id)).size
  ;[
    ['Exploitation', meta.fermeNom || '—'],
    ['Période exportée', periode],
    ['Date de génération', horodatage(new Date().toISOString())],
    ['Nombre de relevés', nbReleves],
    ['Nombre de mesures', total],
    ['Mesures non conformes', nc],
    ['Taux de conformité', total ? `${pourcentage(total - nc, total)} %` : '—'],
    ['Nombre de frigos suivis', Object.keys(parFrigo).length],
    ['Application', 'SUIVI FRIGO — traçabilité des températures'],
  ].forEach(([k, v]) => {
    const l = f6.addRow({ k, v })
    l.getCell('k').font = { bold: true }
    l.getCell('k').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS_FOND } }
  })
  styliserEntete(f6)

  /* ---------------- Téléchargement ---------------------------------- */
  const buffer = await classeur.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const nomFichier = `suivi-frigo_${(meta.fermeNom || 'export')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}_${meta.debut}_${meta.fin}.xlsx`

  const lien = document.createElement('a')
  lien.href = URL.createObjectURL(blob)
  lien.download = nomFichier
  document.body.appendChild(lien)
  lien.click()
  document.body.removeChild(lien)
  setTimeout(() => URL.revokeObjectURL(lien.href), 4000)

  return nomFichier
}
