import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { urlsPhotos } from '../lib/photos'
import { exporterExcel } from '../lib/excel'
import {
  aujourdhui, decalerJours, dateFR, dateLongue, heureCourte, temp, ecart,
  horodatage, pourcentage,
} from '../lib/utils'
import { Chargement, Message, Vide, Etiquette, Dialogue, Indicateur } from '../components/Ui'
import {
  IcTelecharger, IcHistorique, IcCrayon, IcPoubelle, IcAlerte, IcCheck, IcPhoto,
} from '../components/Icones'
import Onglets from '../components/Onglets'
import { useProduits, libelleProduit } from '../lib/produits'

const RACCOURCIS = [
  { libelle: '7 j', jours: 7 },
  { libelle: '30 j', jours: 30 },
  { libelle: '3 mois', jours: 90 },
  { libelle: '1 an', jours: 365 },
]

export default function AdminReleves() {
  const { ferme, estAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const produits = useProduits()

  const finDefaut = aujourdhui(ferme?.timezone)
  const [debut, setDebut] = useState(decalerJours(finDefaut, -29))
  const [fin, setFin] = useState(finDefaut)
  const [produit, setProduit] = useState('pdt')
  const [filtreFrigo, setFiltreFrigo] = useState('')
  const [filtreConf, setFiltreConf] = useState('')
  const [filtreAuteur, setFiltreAuteur] = useState('')

  const [mesures, setMesures] = useState([])
  const [frigos, setFrigos] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [message, setMessage] = useState(location.state?.message ?? '')
  const [exportEnCours, setExportEnCours] = useState(false)
  const [detail, setDetail] = useState(null)

  const charger = useCallback(async () => {
    if (!ferme) return
    setChargement(true)

    const [rMesures, rFrigos] = await Promise.all([
      supabase
        .from('v_mesures_completes')
        .select('*')
        .eq('ferme_id', ferme.id)
        .eq('produit', produit)
        .gte('date_releve', debut)
        .lte('date_releve', fin)
        .order('date_releve', { ascending: false })
        .order('heure_releve', { ascending: false }),
      supabase.from('frigos').select('id, nom').eq('ferme_id', ferme.id)
        .eq('produit', produit).order('ordre'),
    ])

    if (rMesures.error) setErreur(rMesures.error.message)
    setMesures(rMesures.data ?? [])
    setFrigos(rFrigos.data ?? [])
    setChargement(false)
  }, [ferme, debut, fin, produit])

  useEffect(() => { charger() }, [charger])

  const filtrees = useMemo(
    () =>
      mesures.filter((m) => {
        if (filtreFrigo && m.frigo_id !== filtreFrigo) return false
        if (filtreConf === 'nc' && m.conforme !== false) return false
        if (filtreConf === 'ok' && m.conforme !== true) return false
        if (filtreAuteur && m.auteur_identifiant !== filtreAuteur) return false
        return true
      }),
    [mesures, filtreFrigo, filtreConf, filtreAuteur]
  )

  const auteurs = useMemo(
    () => [...new Map(mesures.map((m) => [m.auteur_identifiant, m.auteur_nom])).entries()]
      .filter(([k]) => k),
    [mesures]
  )

  /* Changer de produit remet à zéro le filtre frigo, qui ne vaut que pour l'autre. */
  const changerProduit = (code) => {
    setFiltreFrigo('')
    setProduit(code)
  }

  const appliquerRaccourci = (jours) => {
    const f = aujourdhui(ferme?.timezone)
    setFin(f)
    setDebut(decalerJours(f, -jours + 1))
  }

  const exporter = async () => {
    setExportEnCours(true)
    setErreur('')
    try {
      const { data: historique } = await supabase
        .from('releve_historique')
        .select('action, created_at, details, auteur_nom, releve:releves(date_releve), auteur:profiles(identifiant, nom_complet)')
        .eq('ferme_id', ferme.id)
        .order('created_at', { ascending: false })
        .limit(2000)

      const histoAplati = (historique ?? []).map((h) => ({
        action: h.action,
        created_at: h.created_at,
        details: h.details,
        date_releve: h.releve?.date_releve,
        auteur_nom: h.auteur?.nom_complet || h.auteur?.identifiant || h.auteur_nom,
      }))

      const nom = await exporterExcel(filtrees, histoAplati, {
        fermeNom: ferme.nom, debut, fin,
        produit: libelleProduit(produits, produit),
      })
      setMessage(`Export généré : ${nom}`)
    } catch (e) {
      setErreur(`Export impossible : ${e.message}`)
    }
    setExportEnCours(false)
  }

  const ouvrirDetail = async (releveId) => {
    const { data, error } = await supabase
      .from('releves')
      .select(
        'id, date_releve, heure_releve, statut, remarque, nb_modifications, modifie_at, valide_at, created_at, auteur_nom,' +
        ' auteur:profiles(identifiant, nom_complet),' +
        ' mesures(id, temperature, seuil_min, seuil_max, conforme, remarque, photo_url, en_descente,' +
        ' hygrometrie, seuil_hygro_min, seuil_hygro_max, hygro_conforme,' +
        ' frigo:frigos(nom, emplacement))'
      )
      .eq('id', releveId)
      .maybeSingle()

    if (error || !data) return setErreur('Relevé introuvable.')

    const { data: histo } = await supabase
      .from('releve_historique')
      .select('id, action, created_at, details, auteur_nom, auteur:profiles(identifiant, nom_complet)')
      .eq('releve_id', releveId)
      .order('created_at', { ascending: true })

    const photos = await urlsPhotos((data.mesures ?? []).map((m) => m.photo_url))
    setDetail({ ...data, historique: histo ?? [], photos })
  }

  const supprimer = async (releveId) => {
    const { error } = await supabase.from('releves').delete().eq('id', releveId)
    if (error) return setErreur(error.message)
    setDetail(null)
    setMessage('Relevé supprimé.')
    charger()
  }

  const nonConformes = filtrees.filter((m) => m.conforme === false).length
  const taux = pourcentage(filtrees.length - nonConformes, filtrees.length)

  // Colonne hygrométrie affichée seulement si la période en contient.
  const colonneHygro = filtrees.some(
    (m) => m.hygrometrie !== null && m.hygrometrie !== undefined
  )

  return (
    <>
      <div className="entre" style={{ marginBottom: '.7rem' }}>
        <h1 className="mb0">Relevés</h1>
        <button className="btn principal petit" onClick={exporter} disabled={exportEnCours || !filtrees.length}>
          <IcTelecharger /> {exportEnCours ? 'Génération…' : 'Export Excel'}
        </button>
      </div>

      <Message type="ok" onFermer={() => setMessage('')}>{message}</Message>
      <Message type="ko" onFermer={() => setErreur('')}>{erreur}</Message>

      <Onglets options={produits} valeur={produit} onChange={changerProduit} aria="Produit" />

      {/* ---------------- Filtres ---------------- */}
      <div className="carte">
        <div className="rangee" style={{ marginBottom: '.7rem' }}>
          {RACCOURCIS.map((r) => (
            <button key={r.jours} className="btn petit" onClick={() => appliquerRaccourci(r.jours)}>
              {r.libelle}
            </button>
          ))}
        </div>

        <div className="filtres">
          <div className="champ">
            <label htmlFor="d1">Du</label>
            <input id="d1" type="date" value={debut} max={fin} onChange={(e) => setDebut(e.target.value)} />
          </div>
          <div className="champ">
            <label htmlFor="d2">Au</label>
            <input id="d2" type="date" value={fin} min={debut} onChange={(e) => setFin(e.target.value)} />
          </div>
          <div className="champ">
            <label htmlFor="ff">Frigo</label>
            <select id="ff" value={filtreFrigo} onChange={(e) => setFiltreFrigo(e.target.value)}>
              <option value="">Tous</option>
              {frigos.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </select>
          </div>
          <div className="champ">
            <label htmlFor="fc">Conformité</label>
            <select id="fc" value={filtreConf} onChange={(e) => setFiltreConf(e.target.value)}>
              <option value="">Toutes</option>
              <option value="nc">Hors seuils</option>
              <option value="ok">Conformes</option>
            </select>
          </div>
          <div className="champ">
            <label htmlFor="fa">Salarié</label>
            <select id="fa" value={filtreAuteur} onChange={(e) => setFiltreAuteur(e.target.value)}>
              <option value="">Tous</option>
              {auteurs.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ---------------- Synthèse ---------------- */}
      <div className="grille k4" style={{ marginBottom: '.9rem' }}>
        <Indicateur libelle="Mesures" valeur={filtrees.length} detail={`du ${dateFR(debut)} au ${dateFR(fin)}`} />
        <Indicateur
          libelle="Relevés"
          valeur={new Set(filtrees.map((m) => m.releve_id)).size}
          detail="sur la période"
        />
        <Indicateur
          libelle="Hors seuils"
          valeur={nonConformes}
          ton={nonConformes ? 'ko' : 'ok'}
          detail={nonConformes ? 'à justifier' : 'aucun'}
        />
        <Indicateur
          libelle="Conformité"
          valeur={filtrees.length ? `${taux} %` : '—'}
          ton={taux >= 98 ? 'ok' : taux >= 90 ? 'att' : 'ko'}
        />
      </div>

      {/* ---------------- Tableau ---------------- */}
      {chargement ? (
        <Chargement />
      ) : !filtrees.length ? (
        <div className="carte">
          <Vide icone={IcHistorique} titre="Aucune mesure" texte="Aucun résultat pour ces filtres." />
        </div>
      ) : (
        <div className="tableau-zone" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Heure</th><th>Frigo</th><th>Temp.</th>
                <th>Seuils</th>{colonneHygro && <th>Hygro.</th>}
                <th>État</th><th>Salarié</th><th>Remarque</th>
              </tr>
            </thead>
            <tbody>
              {filtrees.map((m) => (
                <tr
                  key={m.mesure_id}
                  className="cliquable"
                  onClick={() => ouvrirDetail(m.releve_id)}
                  style={m.conforme === false ? { background: 'var(--rouge-fond)' } : undefined}
                >
                  <td className="tres-petit">{dateFR(m.date_releve)}</td>
                  <td className="num tres-petit">{heureCourte(m.heure_releve)}</td>
                  <td>{m.frigo_nom}</td>
                  <td className="num" style={{ color: m.conforme === false ? 'var(--rouge)' : undefined }}>
                    {temp(m.temperature)}
                  </td>
                  <td className="num tres-petit muet">{temp(m.seuil_min)} → {temp(m.seuil_max)}</td>
                  {colonneHygro && (
                    <td
                      className="num tres-petit"
                      style={{ color: m.hygro_conforme === false ? 'var(--rouge)' : undefined }}
                    >
                      {m.hygrometrie === null || m.hygrometrie === undefined
                        ? '—'
                        : `${Number(m.hygrometrie).toFixed(0)} %`}
                    </td>
                  )}
                  <td>
                    {m.en_descente
                      ? <Etiquette type="info">En descente</Etiquette>
                      : m.conforme === false
                      ? <Etiquette type="ko">Hors seuil</Etiquette>
                      : <Etiquette type="ok">Conforme</Etiquette>}
                    {m.nb_modifications > 0 && <Etiquette type="info">modifié</Etiquette>}
                  </td>
                  <td className="tres-petit">{m.auteur_nom}</td>
                  <td className="tres-petit muet" style={{ maxWidth: 190 }}>
                    {m.remarque_mesure || m.remarque_releve || '—'}
                    {m.photo_url && <IcPhoto style={{ width: 13, height: 13, verticalAlign: '-2px', marginLeft: 4 }} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------------- Détail d'un relevé ---------------- */}
      {detail && (
        <Dialogue
          titre={`Relevé du ${dateFR(detail.date_releve)} à ${heureCourte(detail.heure_releve)}`}
          onFermer={() => setDetail(null)}
          actions={
            <>
              <button className="btn" onClick={() => navigate(`/releve/${detail.id}`)}>
                <IcCrayon /> Modifier
              </button>
              {estAdmin && (
                <button
                  className="btn danger"
                  onClick={() => {
                    if (window.confirm('Supprimer définitivement ce relevé et ses mesures ?')) {
                      supprimer(detail.id)
                    }
                  }}
                >
                  <IcPoubelle /> Supprimer
                </button>
              )}
            </>
          }
        >
          <div className="rangee" style={{ marginBottom: '.7rem' }}>
            {detail.statut === 'valide'
              ? <Etiquette type="ok">Validé</Etiquette>
              : <Etiquette type="att">Brouillon</Etiquette>}
            {detail.nb_modifications > 0 && (
              <Etiquette type="info">modifié {detail.nb_modifications}×</Etiquette>
            )}
            <span className="tres-petit muet">
              par {detail.auteur?.nom_complet || detail.auteur?.identifiant || detail.auteur_nom}
            </span>
          </div>

          <p className="tres-petit muet" style={{ textTransform: 'capitalize' }}>
            {dateLongue(detail.date_releve)}
          </p>

          {(detail.mesures ?? []).map((m) => (
            <div
              key={m.id}
              className={`ligne-frigo ${m.en_descente ? 'en-descente' : m.conforme ? 'conforme' : 'non-conforme'}`}
              style={{ marginBottom: '.55rem' }}
            >
              <div className="tete">
                <strong>{m.frigo?.nom}</strong>
                {m.en_descente && <Etiquette type="info">en descente</Etiquette>}
                <span className="seuils">{temp(m.seuil_min)} → {temp(m.seuil_max)}</span>
              </div>
              <div className="rangee" style={{ gap: '.6rem' }}>
                <span
                  className="gras"
                  style={{ fontSize: '1.3rem', color: m.conforme ? 'var(--vert)' : 'var(--rouge)' }}
                >
                  {temp(m.temperature)}
                </span>
                {m.conforme === false && (
                  <span className="tres-petit gras" style={{ color: 'var(--rouge)' }}>
                    {ecart(m.temperature, m.seuil_min, m.seuil_max)}
                  </span>
                )}
                {m.hygrometrie !== null && m.hygrometrie !== undefined && (
                  <span
                    className="gras"
                    style={{
                      fontSize: '1rem',
                      color: m.hygro_conforme === false ? 'var(--rouge)' : 'var(--texte-doux)',
                    }}
                  >
                    {Number(m.hygrometrie).toFixed(0)} % HR
                  </span>
                )}
                {m.photo_url && detail.photos?.[m.photo_url] && (
                  <img
                    src={detail.photos[m.photo_url]}
                    alt=""
                    className="miniature"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => window.open(detail.photos[m.photo_url], '_blank', 'noopener')}
                  />
                )}
              </div>
              {m.remarque && <div className="tres-petit doux mt">{m.remarque}</div>}
            </div>
          ))}

          {detail.remarque && (
            <div className="carte compacte" style={{ marginTop: '.6rem' }}>
              <div className="tres-petit muet gras">Remarque générale</div>
              <div className="petit">{detail.remarque}</div>
            </div>
          )}

          <h3 style={{ marginTop: '1rem' }}>Journal de traçabilité</h3>
          <ul className="liste-nue">
            {(detail.historique ?? []).map((h) => (
              <li key={h.id} className="item-histo">
                {h.action === 'modification'
                  ? <IcCrayon style={{ width: 16, height: 16, color: 'var(--ambre)', flex: 'none', marginTop: 2 }} />
                  : h.action === 'validation'
                  ? <IcCheck style={{ width: 16, height: 16, color: 'var(--vert)', flex: 'none', marginTop: 2 }} />
                  : <IcAlerte style={{ width: 16, height: 16, color: 'var(--bleu)', flex: 'none', marginTop: 2 }} />}
                <div style={{ flex: 1 }}>
                  <span className="petit gras" style={{ textTransform: 'capitalize' }}>{h.action}</span>{' '}
                  <span className="tres-petit muet">
                    par {h.auteur?.nom_complet || h.auteur?.identifiant || h.auteur_nom || '—'}
                  </span>
                  {h.action === 'modification' && h.details?.heure_avant !== h.details?.heure_apres && (
                    <div className="tres-petit muet">
                      heure : {heureCourte(h.details?.heure_avant)} → {heureCourte(h.details?.heure_apres)}
                    </div>
                  )}
                </div>
                <span className="quand">{horodatage(h.created_at)}</span>
              </li>
            ))}
          </ul>
        </Dialogue>
      )}
    </>
  )
}
