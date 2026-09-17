/* ---------------------------------------------------------------------
 *  Produits suivis (pommes de terre, échalotes, …).
 *  La liste vient de la table « produits » : en ajouter un se fait par
 *  une simple insertion en base, sans toucher au code des écrans.
 * ------------------------------------------------------------------- */
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

let cache = null

/** Charge la liste une fois pour toute la session. */
export async function chargerProduits() {
  if (cache) return cache
  const { data, error } = await supabase
    .from('produits')
    .select('code, libelle, ordre')
    .order('ordre')
  if (error) {
    console.warn('[SUIVI FRIGO] Produits illisibles :', error.message)
    return []
  }
  cache = data ?? []
  return cache
}

/** Hook : la liste des produits, vide le temps du chargement. */
export function useProduits() {
  const [produits, setProduits] = useState(cache ?? [])
  useEffect(() => {
    let vivant = true
    chargerProduits().then((p) => { if (vivant) setProduits(p) })
    return () => { vivant = false }
  }, [])
  return produits
}

/** Libellé lisible d'un code produit, avec repli sur le code lui-même. */
export function libelleProduit(produits, code) {
  return produits.find((p) => p.code === code)?.libelle ?? code ?? '—'
}

/** Produit retenu par défaut : le premier de la liste. */
export function produitParDefaut(produits) {
  return produits[0]?.code ?? 'pdt'
}
