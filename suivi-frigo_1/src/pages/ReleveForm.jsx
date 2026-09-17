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

export default function ReleveForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { profil, ferme, estAdmin } = useAuth()
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
          ' frigo:frigos(id, nom, emplacement, temp_min, temp_max, ordre))'
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
      .select('id, nom, emplacement, temp_min, temp_max, ordre')
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
          revient sur un onglet commencé. */
    if (!id) {
      const conserve = brouillonLocal.current[prod]
      setLignes(
        conserve ??
          (frigos ?? []).map((f) => ({
            frigo: f, mesureId: null, temperature: '', remarqueMesure: '',
            photoChemin: null, fichier: null,
          }))
      )
      setRemarque(remarquesLocales.current[prod] ?? '')
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
          remarqueMesure: m?.remarque ?? '',
          photoChemin: m?.photo_url ?? null,
          fichier: null,
          seuilMin: m?.seuil_min ?? f.temp_min,
          seuilMax: m?.seuil_max ?? f.temp_max,
        }
      })

    setLignes(nouvelles)
    setUrls(await urlsPhotos(nouvelles.map((l) => l.photoChemin)))
    setChargement(false)
  }, [ferme, id, produitDemande])

  useEffect(() => { charger() }, [charger])

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
        if (l.mesureId) {
          aMettreAJour.push({
            id: l.mesureId,
            temperature: valeur,
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
        const conforme = estConforme(l.temperature, min, max)
        const apercuLocal = urls[`local-${l.frigo.id}`]
        const apercuServeur = l.photoChemin ? urls[l.photoChemin] : null
        const photo = apercuLocal || apercuServeur

        return (
          <div
            key={l.frigo.id}
            className={`ligne-frigo ${conforme === true ? 'conforme' : ''} ${conforme === false ? 'non-conforme' : ''}`}
          >
            <div className="tete">
              <strong>{l.frigo.nom}</strong>
              {l.frigo.emplacement && <span className="tres-petit muet">{l.frigo.emplacement}</span>}
              <span className="seuils">
                {temp(min)} → {temp(max)}
              </span>
            </div>

            <div className="saisie">
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

              <div className="pile" style={{ gap: '.45rem' }}>
                <input
                  type="text"
                  placeholder="Remarque (facultatif)"
                  aria-label={`Remarque ${l.frigo.nom}`}
                  value={l.remarqueMesure}
                  onChange={(e) => majLigne(l.frigo.id, { remarqueMesure: e.target.value })}
                />
                <div className="rangee" style={{ gap: '.45rem' }}>
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
