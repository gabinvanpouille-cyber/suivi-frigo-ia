import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { envoyerPhoto, urlsPhotos } from '../lib/photos'
import { notifierReleve } from '../lib/api'
import {
  aujourdhui, heureCourante, dateLongue, temp, versNombre, estConforme, ecart, heureCourte,
} from '../lib/utils'
import { Chargement, Message, Etiquette, Dialogue } from '../components/Ui'
import { IcCheck, IcPhoto, IcCroix, IcAlerte, IcRetour, IcThermo } from '../components/Icones'
import Onglets from '../components/Onglets'
import { useProduits, libelleProduit } from '../lib/produits'

/* ---------------------------------------------------------------------
   Brouillon local : un relevé en cours survit à la mise en veille du
   téléphone, à un rechargement, ou à l'application fermée par le système.
   Stocké sur l'appareil uniquement, effacé dès que le relevé est enregistré.
   --------------------------------------------------------------------- */
const clefBrouillon = (fermeId, produit, jour) =>
  `suivi-frigo:brouillon:${fermeId}:${produit}:${jour}`

function lireBrouillon(clef) {
  try {
    const brut = window.localStorage.getItem(clef)
    return brut ? JSON.parse(brut) : null
  } catch {
    return null
  }
}

function ecrireBrouillon(clef, valeur) {
  try {
    window.localStorage.setItem(clef, JSON.stringify(valeur))
  } catch {
    /* mode privé ou quota plein : on continue sans filet */
  }
}

function effacerBrouillon(clef) {
  try {
    window.localStorage.removeItem(clef)
  } catch {
    /* sans importance */
  }
}

/** Conformité de l'hygrométrie : null quand il n'y a rien à juger. */
function hygroConforme(valeur, min, max) {
  const v = versNombre(valeur)
  if (v === null || min === null || min === undefined || max === null || max === undefined) return null
  return v >= Number(min) && v <= Number(max)
}

export default function ReleveForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // La saisie se fait toujours dans sa propre exploitation, même quand le
  // siège est en train d'en consulter une autre.
  const { profil, fermeSienne: ferme, estAdmin } = useAuth()
  const produits = useProduits()

  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [confirmation, setConfirmation] = useState(false)
  const [apercu, setApercu] = useState(null)

  const [releveId, setReleveId] = useState(id ?? null)
  const [statut, setStatut] = useState('brouillon')
  const [nbModifs, setNbModifs] = useState(0)
  const [dateReleve, setDateReleve] = useState(aujourdhui(ferme?.timezone))
  const [heure, setHeure] = useState(heureCourante(ferme?.timezone))
  const [remarque, setRemarque] = useState('')
  const [lignes, setLignes] = useState([])
  const [urls, setUrls] = useState({})
  const [produit, setProduit] = useState(params.get('produit') || 'pdt')

  const auteurOrigine = useRef(null)
  const [brouillonRepris, setBrouillonRepris] = useState(false)
  // Saisies conservees lorsqu'on bascule d'un onglet produit a l'autre.
  const brouillonLocal = useRef({})
  const remarquesLocales = useRef({})

  // En modification, le produit vient du releve lui-meme : il ne doit pas
  // relancer le chargement, d'ou le null.
  const produitDemande = id ? null : produit

  /* ------------------------------ chargement ------------------------------ */
  const charger = useCallback(async () => {
    if (!ferme) return
    setChargement(true)
    setErreur('')

    /* 1. Un relevé porte un seul produit : en modification, c'est lui qui fixe
          l'onglet, pas l'inverse. */
    let prod = produitDemande ?? 'pdt'
    let releve = null

    if (id) {
      const { data, error: eReleve } = await supabase
        .from('releves')
        .select(
          'id, date_releve, heure_releve, statut, remarque, nb_modifications, auteur_id, produit,' +
          ' mesures(id, frigo_id, temperature, seuil_min, seuil_max, remarque, photo_url,' +
          ' hygrometrie, seuil_hygro_min, seuil_hygro_max, en_descente,' +
          ' frigo:frigos(id, nom, emplacement, temp_min, temp_max, ordre,' +
          ' suivi_hygro, hygro_min, hygro_max))'
        )
        .eq('id', id)
        .maybeSingle()

      if (eReleve || !data) {
        setErreur('Relevé introuvable ou inaccessible.')
        setChargement(false)
        return
      }
      releve = data
      prod = releve.produit ?? 'pdt'
      setProduit(prod)
    }

    /* 2. Les chambres froides de ce produit uniquement. */
    const { data: frigos, error: eFrigos } = await supabase
      .from('frigos')
      .select('id, nom, emplacement, temp_min, temp_max, ordre, suivi_hygro, hygro_min, hygro_max')
      .eq('ferme_id', ferme.id)
      .eq('produit', prod)
      .eq('actif', true)
      .order('ordre')
      .order('nom')

    if (eFrigos) {
      setErreur(eFrigos.message)
      setChargement(false)
      return
    }

    /* 3. Nouveau relevé : lignes vierges, ou saisies déjà faites si l'on
          revient sur un onglet commencé, ou brouillon retrouvé sur l'appareil. */
    if (!id) {
      const conserve = brouillonLocal.current[prod]
      const vierges = (frigos ?? []).map((f) => ({
        frigo: f, mesureId: null, temperature: '', hygrometrie: '',
        enDescente: false, remarqueMesure: '', photoChemin: null, fichier: null,
      }))

      if (conserve) {
        setLignes(conserve)
        setRemarque(remarquesLocales.current[prod] ?? '')
        setChargement(false)
        return
      }

      /* Rien en mémoire : on regarde si le téléphone a gardé un relevé en
         cours (mise en veille, rechargement, application fermée). */
      const enregistre = lireBrouillon(clefBrouillon(ferme.id, prod, dateReleve))
      const saisies = enregistre?.lignes ?? {}
      const quelqueChose = Object.values(saisies).some(
        (v) => v && (v.temperature || v.hygrometrie || v.enDescente || v.remarqueMesure)
      )

      setLignes(
        quelqueChose
          ? vierges.map((l) => ({ ...l, ...(saisies[l.frigo.id] ?? {}) }))
          : vierges
      )
      setRemarque(quelqueChose ? enregistre.remarque ?? '' : remarquesLocales.current[prod] ?? '')
      if (quelqueChose && enregistre.heure) setHeure(enregistre.heure)
      setBrouillonRepris(quelqueChose)
      setChargement(false)
      return
    }

    auteurOrigine.current = releve.auteur_id
    setReleveId(releve.id)
    setStatut(releve.statut)
    setNbModifs(releve.nb_modifications ?? 0)
    setDateReleve(releve.date_releve)
    setHeure(heureCourte(releve.heure_releve))
    setRemarque(releve.remarque ?? '')

    // Frigos actifs + frigos déjà mesurés (même s'ils ont été désactivés depuis)
    const parId = new Map((frigos ?? []).map((f) => [f.id, f]))
    ;(releve.mesures ?? []).forEach((m) => {
      if (m.frigo && !parId.has(m.frigo.id)) parId.set(m.frigo.id, m.frigo)
    })

    const mesuresParFrigo = new Map((releve.mesures ?? []).map((m) => [m.frigo_id, m]))
    const nouvelles = [...parId.values()]
      .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || a.nom.localeCompare(b.nom))
      .map((f) => {
        const m = mesuresParFrigo.get(f.id)
        return {
          frigo: f,
          mesureId: m?.id ?? null,
          temperature: m?.temperature !== undefined && m?.temperature !== null
            ? String(m.temperature).replace('.', ',') : '',
          hygrometrie: m?.hygrometrie !== undefined && m?.hygrometrie !== null
            ? String(m.hygrometrie).replace('.', ',') : '',
          enDescente: m?.en_descente ?? false,
          remarqueMesure: m?.remarque ?? '',
          photoChemin: m?.photo_url ?? null,
          fichier: null,
          seuilMin: m?.seuil_min ?? f.temp_min,
          seuilMax: m?.seuil_max ?? f.temp_max,
          seuilHygroMin: m?.seuil_hygro_min ?? f.hygro_min,
          seuilHygroMax: m?.seuil_hygro_max ?? f.hygro_max,
        }
      })

    setLignes(nouvelles)
    setUrls(await urlsPhotos(nouvelles.map((l) => l.photoChemin)))
    setChargement(false)
  }, [ferme, id, produitDemande])

  useEffect(() => { charger() }, [charger])

  /* Sauvegarde continue du relevé en cours sur l'appareil. Les photos ne
     peuvent pas être conservées ainsi : elles sont à reprendre. */
  useEffect(() => {
    if (id || chargement || !ferme || !lignes.length) return
    const saisies = {}
    lignes.forEach((l) => {
      if (l.temperature || l.hygrometrie || l.enDescente || l.remarqueMesure) {
        saisies[l.frigo.id] = {
          temperature: l.temperature,
          hygrometrie: l.hygrometrie,
          enDescente: !!l.enDescente,
          remarqueMesure: l.remarqueMesure,
        }
      }
    })
    const clef = clefBrouillon(ferme.id, produit, dateReleve)
    if (!Object.keys(saisies).length && !remarque) effacerBrouillon(clef)
    else ecrireBrouillon(clef, { heure, remarque, lignes: saisies })
  }, [id, chargement, ferme, produit, dateReleve, heure, remarque, lignes])

  /* Empêche l'écran de s'éteindre pendant la saisie, quand le navigateur
     le permet. Le verrou est repris au retour d'arrière-plan. */
  useEffect(() => {
    if (id || !('wakeLock' in navigator)) return
    let verrou = null
    let vivant = true

    const demander = async () => {
      if (!vivant || document.visibilityState !== 'visible') return
      try {
        verrou = await navigator.wakeLock.request('screen')
      } catch {
        /* refusé (batterie faible, onglet masqué) : la saisie reste protégée
           par la sauvegarde automatique ci-dessus */
      }
    }
    const auRetour = () => { if (document.visibilityState === 'visible') demander() }

    demander()
    document.addEventListener('visibilitychange', auRetour)
    return () => {
      vivant = false
      document.removeEventListener('visibilitychange', auRetour)
      try { verrou?.release() } catch { /* déjà relâché */ }
    }
  }, [id])

  /* Bascule d'onglet : on mémorise ce qui a déjà été saisi pour y revenir. */
  const changerProduit = (code) => {
    brouillonLocal.current[produit] = lignes
    remarquesLocales.current[produit] = remarque
    setErreur('')
    setProduit(code)
  }

  /* ------------------------------ édition -------------------------------- */
  const majLigne = (frigoId, champs) =>
    setLignes((ls) => ls.map((l) => (l.frigo.id === frigoId ? { ...l, ...champs } : l)))

  const choisirPhoto = (frigoId, fichier) => {
    if (!fichier) return
    if (fichier.size > 12 * 1024 * 1024) {
      setErreur('Photo trop volumineuse (12 Mo maximum).')
      return
    }
    majLigne(frigoId, { fichier, photoChemin: null })
    setUrls((u) => ({ ...u, [`local-${frigoId}`]: URL.createObjectURL(fichier) }))
  }

  const retirerPhoto = (frigoId) => {
    majLigne(frigoId, { fichier: null, photoChemin: null })
    setUrls((u) => {
      const copie = { ...u }
      delete copie[`local-${frigoId}`]
      return copie
    })
  }

  /* ------------------------------ statistiques --------------------------- */
  const saisies = useMemo(
    () => lignes.filter((l) => versNombre(l.temperature) !== null),
    [lignes]
  )
  const horsSeuils = useMemo(
    () =>
      lignes.filter((l) => {
        // Une chambre en descente de température n'est pas jugée : ni hors
        // seuil, ni alerte. La mesure est néanmoins enregistrée.
        if (l.enDescente) return false
        const min = l.seuilMin ?? l.frigo.temp_min
        const max = l.seuilMax ?? l.frigo.temp_max
        return estConforme(l.temperature, min, max) === false
      }),
    [lignes]
  )
  const complet = lignes.length > 0 && saisies.length === lignes.length

  /* ------------------------------ sauvegarde ----------------------------- */
  const enregistrer = async (valider) => {
    setErreur('')

    if (valider && !complet) {
      setErreur(
        `Renseignez la température des ${lignes.length - saisies.length} frigo(s) manquant(s) avant de valider.`
      )
      return
    }
    if (!saisies.length && !valider) {
      setErreur('Saisissez au moins une température avant d’enregistrer.')
      return
    }
    if (!/^\d{2}:\d{2}$/.test(heure)) {
      setErreur('Heure de relevé invalide.')
      return
    }

    setOccupe(true)
    setConfirmation(false)

    try {
      const etaitValide = statut === 'valide'
      const nouveauStatut = valider ? 'valide' : statut

      /* 1. Le relevé lui-même */
      let idCourant = releveId
      if (!idCourant) {
        const { data, error } = await supabase
          .from('releves')
          .insert({
            ferme_id: ferme.id,
            auteur_id: profil.id,
            produit,
            date_releve: dateReleve,
            heure_releve: `${heure}:00`,
            remarque: remarque || null,
            statut: nouveauStatut,
          })
          .select('id, statut, nb_modifications')
          .single()
        if (error) throw error
        idCourant = data.id
        setReleveId(idCourant)
      } else {
        const { error } = await supabase
          .from('releves')
          .update({
            date_releve: dateReleve,
            heure_releve: `${heure}:00`,
            remarque: remarque || null,
            statut: nouveauStatut,
          })
          .eq('id', idCourant)
        if (error) throw error
      }

      /* 2. Photos en attente */
      const avecPhotos = await Promise.all(
        lignes.map(async (l) => {
          if (!l.fichier) return l
          const chemin = await envoyerPhoto(l.fichier, ferme.id, idCourant, `frigo-${l.frigo.id.slice(0, 8)}`)
          return { ...l, photoChemin: chemin, fichier: null }
        })
      )

      /* 3. Mesures : création, mise à jour, suppression */
      const aCreer = []
      const aMettreAJour = []
      const aSupprimer = []

      avecPhotos.forEach((l) => {
        const valeur = versNombre(l.temperature)
        if (valeur === null) {
          if (l.mesureId) aSupprimer.push(l.mesureId)
          return
        }
        // L'hygrométrie est facultative : absente, elle vaut null, pas zéro.
        const hygro = l.frigo.suivi_hygro ? versNombre(l.hygrometrie) : null

        if (l.mesureId) {
          aMettreAJour.push({
            id: l.mesureId,
            temperature: valeur,
            hygrometrie: hygro,
            en_descente: !!l.enDescente,
            remarque: l.remarqueMesure || null,
            photo_url: l.photoChemin,
          })
        } else {
          aCreer.push({
            releve_id: idCourant,
            frigo_id: l.frigo.id,
            temperature: valeur,
            seuil_min: l.frigo.temp_min,
            seuil_max: l.frigo.temp_max,
            hygrometrie: hygro,
            seuil_hygro_min: l.frigo.suivi_hygro ? l.frigo.hygro_min : null,
            seuil_hygro_max: l.frigo.suivi_hygro ? l.frigo.hygro_max : null,
            en_descente: !!l.enDescente,
            remarque: l.remarqueMesure || null,
            photo_url: l.photoChemin,
          })
        }
      })

      if (aSupprimer.length) {
        const { error } = await supabase.from('mesures').delete().in('id', aSupprimer)
        if (error) throw error
      }
      if (aCreer.length) {
        const { error } = await supabase.from('mesures').insert(aCreer)
        if (error) throw error
      }
      for (const m of aMettreAJour) {
        const { id: mid, ...champs } = m
        const { error } = await supabase.from('mesures').update(champs).eq('id', mid)
        if (error) throw error
      }

      /* 4. Notifications (récapitulatif admin + alertes de dépassement) */
      if (nouveauStatut === 'valide') {
        await notifierReleve(idCourant, etaitValide ? 'modification' : 'validation')
      }

      delete brouillonLocal.current[produit]
      delete remarquesLocales.current[produit]
      effacerBrouillon(clefBrouillon(ferme.id, produit, dateReleve))

      navigate(estAdmin ? '/admin/releves' : '/', {
        replace: true,
        state: {
          message: valider
            ? etaitValide ? 'Relevé modifié. L’administrateur en a été informé.'
              : 'Relevé validé et transmis.'
            : 'Brouillon enregistré.',
        },
      })
    } catch (e) {
      setErreur(e.message || 'Enregistrement impossible.')
      setOccupe(false)
    }
  }

  /* ------------------------------ rendu ---------------------------------- */
  if (chargement) return <Chargement />

  const enModification = statut === 'valide'

  return (
    <>
      <div className="rangee" style={{ marginBottom: '.6rem' }}>
        <button className="btn fantome petit" onClick={() => navigate(-1)}>
          <IcRetour /> Retour
        </button>
      </div>

      <h1 style={{ marginBottom: '.15rem' }}>
        {enModification ? 'Modifier le relevé' : id ? 'Reprendre le relevé' : 'Nouveau relevé'}
      </h1>
      <p className="muet petit" style={{ textTransform: 'capitalize' }}>
        {dateLongue(dateReleve)}
        {id && produits.length > 1 && (
          <>
            {' · '}
            <span className="gras" style={{ textTransform: 'none' }}>
              {libelleProduit(produits, produit)}
            </span>
          </>
        )}
      </p>

      {!id && (
        <Onglets
          options={produits}
          valeur={produit}
          onChange={changerProduit}
          aria="Produit du relevé"
        />
      )}

      <Message type="ko" onFermer={() => setErreur('')}>{erreur}</Message>

      {brouillonRepris && (
        <Message type="info" onFermer={() => setBrouillonRepris(false)}>
          Relevé en cours retrouvé sur cet appareil : vos saisies ont été
          restaurées. Les photos, elles, sont à reprendre.
        </Message>
      )}

      {enModification && (
        <Message type="att">
          Ce relevé est déjà validé. Toute modification est enregistrée dans le journal et
          signalée à l’administrateur
          {nbModifs > 0 ? ` (déjà modifié ${nbModifs} fois)` : ''}.
        </Message>
      )}

      {!lignes.length && (
        <Message type="ko">
          Aucune chambre froide active en{' '}
          {libelleProduit(produits, produit).toLowerCase()} dans cette exploitation.{' '}
          {estAdmin ? <Link to="/admin/gestion">En créer une</Link> : 'Contactez votre administrateur.'}
        </Message>
      )}

      {/* ---- En-tête du relevé ---- */}
      <div className="carte">
        <div className="filtres">
          <div className="champ" style={{ flex: '0 0 150px' }}>
            <label htmlFor="heure">Heure du relevé</label>
            <input
              id="heure"
              type="time"
              value={heure}
              onChange={(e) => setHeure(e.target.value)}
              required
            />
          </div>
          {estAdmin && (
            <div className="champ" style={{ flex: '0 0 175px' }}>
              <label htmlFor="date">Date</label>
              <input
                id="date"
                type="date"
                value={dateReleve}
                max={aujourdhui(ferme?.timezone)}
                onChange={(e) => setDateReleve(e.target.value)}
              />
            </div>
          )}
          <div style={{ flex: 1 }} />
          <div className="rangee">
            <Etiquette type={complet ? 'ok' : 'att'}>
              {saisies.length} / {lignes.length} saisis
            </Etiquette>
            {horsSeuils.length > 0 && (
              <Etiquette type="ko">{horsSeuils.length} hors seuil</Etiquette>
            )}
          </div>
        </div>
      </div>

      {/* ---- Une carte par frigo ---- */}
      {lignes.map((l) => {
        const min = l.seuilMin ?? l.frigo.temp_min
        const max = l.seuilMax ?? l.frigo.temp_max
        const hMin = l.seuilHygroMin ?? l.frigo.hygro_min
        const hMax = l.seuilHygroMax ?? l.frigo.hygro_max
        const conforme = l.enDescente ? null : estConforme(l.temperature, min, max)
        const hOk = l.enDescente ? null : hygroConforme(l.hygrometrie, hMin, hMax)
        const apercuLocal = urls[`local-${l.frigo.id}`]
        const apercuServeur = l.photoChemin ? urls[l.photoChemin] : null
        const photo = apercuLocal || apercuServeur

        return (
          <div
            key={l.frigo.id}
            className={`ligne-frigo ${l.enDescente ? 'en-descente' : ''} ${conforme === true ? 'conforme' : ''} ${conforme === false ? 'non-conforme' : ''}`}
          >
            <div className="tete">
              <strong>{l.frigo.nom}</strong>
              {l.frigo.emplacement && <span className="tres-petit muet">{l.frigo.emplacement}</span>}
              {l.enDescente && <Etiquette type="info">en descente</Etiquette>}
              <span className="seuils">
                {temp(min)} → {temp(max)}
                {l.frigo.suivi_hygro && hMin !== null && hMin !== undefined
                  && hMax !== null && hMax !== undefined && (
                  <>
                    <br />
                    {Number(hMin).toFixed(0)}–{Number(hMax).toFixed(0)} % HR
                  </>
                )}
              </span>
            </div>

            <div className="saisie">
              <div className="pile" style={{ gap: '.4rem' }}>
                <input
                  className="temp-input"
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="next"
                  placeholder="—"
                  aria-label={`Température ${l.frigo.nom}`}
                  value={l.temperature}
                  onChange={(e) =>
                    majLigne(l.frigo.id, { temperature: e.target.value.replace(/[^0-9,.\-]/g, '') })
                  }
                  style={
                    conforme === false
                      ? { borderColor: 'var(--rouge)', color: 'var(--rouge)' }
                      : conforme === true
                      ? { borderColor: 'var(--vert)' }
                      : undefined
                  }
                />

                {/* Hygrométrie : proposée seulement où elle est suivie, et jamais obligatoire. */}
                {l.frigo.suivi_hygro && (
                  <input
                    className="hygro-input"
                    type="text"
                    inputMode="decimal"
                    placeholder="% HR"
                    aria-label={`Hygrométrie ${l.frigo.nom} (facultatif)`}
                    value={l.hygrometrie ?? ''}
                    onChange={(e) =>
                      majLigne(l.frigo.id, { hygrometrie: e.target.value.replace(/[^0-9,.]/g, '') })
                    }
                    style={
                      hOk === false
                        ? { borderColor: 'var(--rouge)', color: 'var(--rouge)' }
                        : hOk === true
                        ? { borderColor: 'var(--vert)' }
                        : undefined
                    }
                  />
                )}
              </div>

              <div className="pile" style={{ gap: '.45rem' }}>
                {/* Descente de température : à réarmer à chaque relevé, jamais reportée. */}
                <button
                  type="button"
                  className={`btn petit ${l.enDescente ? 'principal' : 'fantome'}`}
                  aria-pressed={l.enDescente}
                  onClick={() => majLigne(l.frigo.id, { enDescente: !l.enDescente })}
                  title="Chambre en cours de mise en froid : la température est enregistrée sans déclencher d’alerte"
                >
                  <IcThermo />
                  {l.enDescente ? 'En descente' : 'Signaler une descente'}
                </button>
                <input
                  type="text"
                  placeholder="Remarque (facultatif)"
                  aria-label={`Remarque ${l.frigo.nom}`}
                  value={l.remarqueMesure}
                  onChange={(e) => majLigne(l.frigo.id, { remarqueMesure: e.target.value })}
                />
                <div className="rangee" style={{ gap: '.45rem' }}>
                  {/* Mise en froid : à réarmer à chaque relevé, jamais reporté. */}
                  <button
                    type="button"
                    className={`btn petit ${l.enDescente ? 'principal' : 'fantome'}`}
                    aria-pressed={l.enDescente ? 'true' : 'false'}
                    onClick={() => majLigne(l.frigo.id, { enDescente: !l.enDescente })}
                    title="La chambre est en cours de mise en froid : la température est enregistrée mais pas jugée"
                  >
                    <IcThermo /> En descente
                  </button>
                  {photo ? (
                    <>
                      <img
                        src={photo}
                        alt="Photo du relevé"
                        className="miniature"
                        onClick={() => setApercu(photo)}
                      />
                      <button
                        type="button"
                        className="btn petit fantome"
                        onClick={() => retirerPhoto(l.frigo.id)}
                      >
                        <IcCroix /> Retirer
                      </button>
                    </>
                  ) : (
                    <label className="btn petit" style={{ cursor: 'pointer' }}>
                      <IcPhoto /> Photo
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        hidden
                        onChange={(e) => choisirPhoto(l.frigo.id, e.target.files?.[0])}
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>

            {conforme === false && (
              <div className="tres-petit gras mt" style={{ color: 'var(--rouge)' }}>
                <IcAlerte style={{ width: 13, height: 13, verticalAlign: '-2px' }} />{' '}
                {ecart(l.temperature, min, max)}
              </div>
            )}

            {l.enDescente && (
              <div className="tres-petit mt" style={{ color: 'var(--bleu)' }}>
                Chambre en cours de descente : la température est enregistrée mais
                n’est pas jugée, et ne déclenche aucune alerte.
              </div>
            )}

            {hOk === false && (
              <div className="tres-petit gras mt" style={{ color: 'var(--rouge)' }}>
                Hygrométrie hors des seuils ({Number(hMin).toFixed(0)}–{Number(hMax).toFixed(0)} %)
              </div>
            )}

            {l.enDescente && (
              <div className="tres-petit mt" style={{ color: 'var(--bleu)' }}>
                Chambre en descente de température : la mesure est enregistrée, mais elle n’est
                ni jugée ni signalée. À réactiver au prochain relevé si besoin.
              </div>
            )}
          </div>
        )
      })}

      {/* ---- Remarque générale ---- */}
      <div className="carte">
        <div className="champ mb0">
          <label htmlFor="rq">Remarque générale sur le relevé</label>
          <textarea
            id="rq"
            value={remarque}
            onChange={(e) => setRemarque(e.target.value)}
            placeholder="Panne, porte restée ouverte, intervention réalisée…"
          />
        </div>
      </div>

      {/* ---- Actions ---- */}
      <div className="barre-actions" style={{ marginBottom: '1rem' }}>
        {!enModification && (
          <button className="btn" onClick={() => enregistrer(false)} disabled={occupe}>
            Enregistrer le brouillon
          </button>
        )}
        <button
          className={`btn ${horsSeuils.length ? 'danger' : 'succes'}`}
          onClick={() => (horsSeuils.length ? setConfirmation(true) : enregistrer(true))}
          disabled={occupe || !lignes.length}
        >
          {occupe ? (
            'Enregistrement…'
          ) : (
            <>
              <IcCheck />
              {enModification ? 'Enregistrer la modification' : 'Valider le relevé'}
            </>
          )}
        </button>
      </div>

      {/* ---- Confirmation en cas de dépassement ---- */}
      {confirmation && (
        <Dialogue
          titre="Températures hors seuils"
          onFermer={() => setConfirmation(false)}
          actions={
            <>
              <button className="btn" onClick={() => setConfirmation(false)}>
                Corriger la saisie
              </button>
              <button className="btn danger" onClick={() => enregistrer(true)} disabled={occupe}>
                <IcAlerte /> Valider et alerter
              </button>
            </>
          }
        >
          <p className="petit">
            {horsSeuils.length} frigo{horsSeuils.length > 1 ? 's sont' : ' est'} hors des seuils
            autorisés. En validant, une alerte est envoyée immédiatement à tous les comptes de
            l’exploitation.
          </p>
          <ul className="liste-nue">
            {horsSeuils.map((l) => (
              <li key={l.frigo.id} className="item-histo">
                <IcThermo style={{ width: 18, height: 18, color: 'var(--rouge)', flex: 'none' }} />
                <div>
                  <strong>{l.frigo.nom}</strong> —{' '}
                  <span style={{ color: 'var(--rouge)' }} className="gras">
                    {temp(versNombre(l.temperature))}
                  </span>
                  <div className="tres-petit muet">
                    {ecart(l.temperature, l.seuilMin ?? l.frigo.temp_min, l.seuilMax ?? l.frigo.temp_max)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Dialogue>
      )}

      {/* ---- Aperçu photo ---- */}
      {apercu && (
        <Dialogue titre="Photo" onFermer={() => setApercu(null)}>
          <img src={apercu} alt="" style={{ width: '100%', borderRadius: 'var(--r-s)' }} />
        </Dialogue>
      )}
    </>
  )
}
