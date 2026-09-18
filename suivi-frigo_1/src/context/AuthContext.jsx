import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase, emailTechnique, normaliser } from '../lib/supabase'

const Contexte = createContext(null)

export function useAuth() {
  const c = useContext(Contexte)
  if (!c) throw new Error('useAuth doit être utilisé dans <FournisseurAuth>')
  return c
}

export function FournisseurAuth({ children }) {
  const [session, setSession] = useState(null)
  const [profil, setProfil] = useState(null)
  const [chargement, setChargement] = useState(true)
  const [fermes, setFermes] = useState([])       // toutes les exploitations (siège seulement)
  const [fermeVueId, setFermeVueId] = useState(null)
  const montee = useRef(true)

  const chargerProfil = useCallback(async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, ferme:fermes(*)')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('[SUIVI FRIGO] Profil illisible :', error.message)
      return null
    }
    return data
  }, [])

  useEffect(() => {
    montee.current = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!montee.current) return
      setSession(data.session ?? null)
      if (data.session?.user) setProfil(await chargerProfil(data.session.user.id))
      if (montee.current) setChargement(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (evenement, s) => {
      if (!montee.current) return
      setSession(s ?? null)
      if (s?.user) {
        if (evenement !== 'TOKEN_REFRESHED') {
          setProfil(await chargerProfil(s.user.id))
        }
      } else {
        setProfil(null)
      }
      if (montee.current) setChargement(false)
    })

    return () => {
      montee.current = false
      sub.subscription.unsubscribe()
    }
  }, [chargerProfil])

  /* Le siège — l'administrateur général — peut consulter les autres
     exploitations. Personne d'autre ne charge cette liste, et les règles de
     la base la refuseraient de toute façon. */
  useEffect(() => {
    if (profil?.role !== 'super_admin') {
      setFermes([])
      setFermeVueId(null)
      return
    }
    let vivant = true
    supabase
      .from('fermes')
      .select('*')
      .eq('actif', true)
      .order('nom')
      .then(({ data, error }) => {
        if (error) console.warn('[SUIVI FRIGO] Exploitations illisibles :', error.message)
        if (vivant) setFermes(data ?? [])
      })
    return () => { vivant = false }
  }, [profil?.id, profil?.role])

  const connexion = useCallback(
    async (codeFerme, identifiant, motDePasse) => {
      const code = normaliser(codeFerme)
      const ident = normaliser(identifiant)

      if (!code || !ident || !motDePasse) {
        return { erreur: 'Renseignez le code ferme, l’identifiant et le mot de passe.' }
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailTechnique(ident, code),
        password: motDePasse,
      })

      if (error) {
        const msg = /Invalid login/i.test(error.message)
          ? 'Code ferme, identifiant ou mot de passe incorrect.'
          : /Email not confirmed/i.test(error.message)
          ? "Ce compte n'est pas encore activé. Contactez votre administrateur."
          : error.message
        return { erreur: msg }
      }

      const p = await chargerProfil(data.user.id)
      if (!p) {
        await supabase.auth.signOut()
        return { erreur: "Ce compte n'a pas de profil associé. Contactez votre administrateur." }
      }
      if (!p.actif) {
        await supabase.auth.signOut()
        return { erreur: 'Ce compte a été désactivé. Contactez votre administrateur.' }
      }
      if (p.ferme && p.ferme.actif === false) {
        await supabase.auth.signOut()
        return { erreur: 'Cette exploitation est désactivée. Contactez votre administrateur.' }
      }

      setProfil(p)
      return { profil: p }
    },
    [chargerProfil]
  )

  const deconnexion = useCallback(async () => {
    await supabase.auth.signOut()
    setProfil(null)
    setSession(null)
  }, [])

  const rafraichirProfil = useCallback(async () => {
    if (session?.user) setProfil(await chargerProfil(session.user.id))
  }, [session, chargerProfil])

  /* « ferme » désigne l'exploitation actuellement consultée : pour tout le
     monde sauf le siège, c'est la sienne et rien d'autre. « fermeSienne »
     reste celle du compte — c'est là, et seulement là, qu'on saisit. */
  const fermeSienne = profil?.ferme ?? null
  const fermeVue = fermes.find((f) => f.id === fermeVueId) ?? fermeSienne

  const valeur = {
    session,
    profil,
    ferme: fermeVue,
    fermeSienne,
    fermes,
    changerFermeVue: setFermeVueId,
    consulteAutreFerme: !!fermeSienne && !!fermeVue && fermeVue.id !== fermeSienne.id,
    chargement,
    estAdmin: profil?.role === 'admin' || profil?.role === 'super_admin',
    estSuperAdmin: profil?.role === 'super_admin',
    connexion,
    deconnexion,
    rafraichirProfil,
  }

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}
