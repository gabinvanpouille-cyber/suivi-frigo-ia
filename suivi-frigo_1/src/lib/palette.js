/* ---------------------------------------------------------------------
 *  Palette catégorielle des graphiques.
 *  Les deux colonnes (clair / sombre) sont deux versions choisies des
 *  mêmes teintes, validées séparément contre chaque fond de surface :
 *  bande de luminosité, plancher de chroma, séparation daltonisme
 *  (ΔE adjacent ≥ 8) et plancher vision normale (ΔE ≥ 15).
 *  L'ordre des créneaux est le mécanisme de sécurité : ne pas le modifier.
 * ------------------------------------------------------------------- */

export const SERIES_CLAIR = [
  '#2a78d6', // 1 bleu
  '#eb6834', // 2 orange
  '#1baf7a', // 3 turquoise
  '#eda100', // 4 jaune
  '#e87ba4', // 5 magenta
  '#008300', // 6 vert
  '#4a3aa7', // 7 violet
  '#e34948', // 8 rouge
]

export const SERIES_SOMBRE = [
  '#3987e5', '#d95926', '#199e70', '#c98500',
  '#d55181', '#008300', '#9085e9', '#e66767',
]

/** Couleurs d'état — réservées, jamais réutilisées comme couleur de série. */
export const ETAT = {
  clair:  { bon: '#0f7b4f', alerte: '#b45309', critique: '#c02626' },
  sombre: { bon: '#34d399', alerte: '#fbbf24', critique: '#f87171' },
}

export const MAX_SERIES = SERIES_CLAIR.length

/** Couleur du créneau i (jamais recyclée : au-delà, la série est repliée). */
export function couleurSerie(index, sombre) {
  const p = sombre ? SERIES_SOMBRE : SERIES_CLAIR
  return p[index % p.length]
}

/** Jetons d'encre et de grille, alignés sur la feuille de style. */
export function jetons(sombre) {
  return sombre
    ? { encre: '#e8eef7', encreDouce: '#a4b3c8', encreFaible: '#6b7c94',
        grille: '#26334a', surface: '#131c2e', bordure: '#26334a' }
    : { encre: '#0f172a', encreDouce: '#475569', encreFaible: '#94a3b8',
        grille: '#e2e8f0', surface: '#ffffff', bordure: '#e2e8f0' }
}
