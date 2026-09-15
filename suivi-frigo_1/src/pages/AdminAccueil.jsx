import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  aujourdhui, decalerJours, dateLongue, dateFR, heureCourte, temp, depuis, pourcentage, ecart,
} from '../lib/utils'
import { Chargement, Message, Vide, Etiquette, Indicateur } from '../components/Ui'
import { IcAlerte, IcCheck, IcCrayon, IcHistorique, IcThermo, IcCalendrier } from '../components/Icones'

export default function AdminAccueil() {
  const { ferme } = useAuth()
  const location = useLocation()

  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [message, setMessage] = useState(location.state?.message ?? '')
  const [mesures, setMesures] = useState([])
  const [derniers, setDerniers] = useState([])
  const [modifs, setModifs] = useState([])
  const [manquants, setManquants] = useState([])

  const jour = aujourdhui(ferme?.timezone)
  const debut30 = decalerJours(jour, -29)
  const debut7 = decalerJours(jour, -6)

  const charger = useCallback(async () => {
    if (!ferme) return
    setChargement(true)

    const [rMesures, rDerniers, rModifs, rManquants] = await Promise.all([
      supabase
        .from('v_mesures_completes')
        .select('releve_id, date_releve, heure_releve, frigo_nom, temperature, seuil_min, seuil_max, conforme, auteur_nom, statut')
        .eq('ferme_id', ferme.id)
        .gte('date_releve', debut30)
        .lte('date_releve', jour),
      supabase
        .from('releves')
        .select('id, date_releve, heure_releve, statut, nb_modifications, modifie_at, auteur_nom, auteur:profiles(identifiant, nom_complet), mesures(id, conforme)')
        .eq('ferme_id', ferme.id)
        .order('date_releve', { ascending: false })
        .order('heure_releve', { ascending: false })
        .limit(8),
      supabase
        .from('releve_historique')
        .select('id, action, created_at, details, auteur_nom, releve:releves(date_releve, heure_releve), auteur:profiles(identifiant, nom_complet)')
        .eq('ferme_id', ferme.id)
        .eq('action', 'modification')
        .order('created_at', { ascending: false })
        .limit(6),
      supabase.rpc('jours_sans_releve', { p_ferme: ferme.id, p_depuis: debut30, p_jusqu: jour }),
    ])

    if (rMesures.error) setErreur(rMesures.error.message)
    setMesures(rMesures.data ?? [])
    setDerniers(rDerniers.data ?? [])
    setModifs(rModifs.data ?? [])
    setManquants((rManquants.data ?? []).map((r) => r.jour))
    setChargement(false)
  }, [ferme, jour, debut30])

  useEffect(() => { charger() }, [charger])

  if (chargement) return <Chargement />

  const total = mesures.length
  const nonConformes = mesures.filter((m) => m.conforme === false)
  const alertes7 = nonConformes.filter((m) => m.date_releve >= debut7)
  const aujourdHui = mesures.filter((m) => m.date_releve === jour)
  const releveFait = aujourdHui.some((m) => m.statut === 'valide')
  const tauxConformite = pourcentage(total - nonConformes.length, total)
  const manquantsHorsAujourdhui = manquants.filter((j) => j !== jour)

  return (
    <>
      <div className="entre" style={{ marginBottom: '.15rem' }}>
        <h1 className="mb0">Tableau de bord</h1>
        <Link to="/admin/releves" className="petit">Voir tous les relevés</Link>
      </div>
      <p className="muet petit" style={{ textTransform: 'capitalize' }}>
        {ferme?.nom} · {dateLongue(jour)}
      </p>

      <Message type="ok" onFermer={() => setMessage('')}>{message}</Message>
      <Message type="ko" onFermer={() => setErreur('')}>{erreur}</Message>

      {/* ---------------- Indicateurs ---------------- */}
      <div className="grille k4" style={{ marginBottom: '.9rem' }}>
        <Indicateur
          libelle="Relevé du jour"
          valeur={releveFait ? 'Fait' : 'Manquant'}
          detail={releveFait
            ? `${new Set(aujourdHui.map((m) => m.releve_id)).size} relevé(s) · ${aujourdHui.length} mesures`
            : `Alerte à ${heureCourte(ferme?.alerte_admin)}`}
          ton={releveFait ? 'ok' : 'ko'}
        />
        <Indicateur
          libelle="Conformité 30 j"
          valeur={total ? `${tauxConformite} %` : '—'}
          detail={`${total} mesures analysées`}
          ton={tauxConformite >= 98 ? 'ok' : tauxConformite >= 90 ? 'att' : 'ko'}
        />
        <Indicateur
          libelle="Dépassements 7 j"
          valeur={alertes7.length}
          detail={alertes7.length ? 'à traiter' : 'aucun'}
          ton={alertes7.length ? 'ko' : 'ok'}
        />
        <Indicateur
          libelle="Jours sans relevé"
          valeur={manquantsHorsAujourdhui.length}
          detail="sur les 30 derniers jours"
          ton={manquantsHorsAujourdhui.length ? 'att' : 'ok'}
        />
      </div>

      {/* ---------------- Alerte du jour ---------------- */}
      {!releveFait && (
        <Message type="att">
          Aucun relevé validé aujourd’hui. Une alerte partira automatiquement à{' '}
          <strong>{heureCourte(ferme?.alerte_admin)}</strong> si la situation n’évolue pas.
        </Message>
      )}

      {/* ---------------- Dépassements récents ---------------- */}
      {alertes7.length > 0 && (
        <div className="carte" style={{ borderColor: 'var(--rouge)' }}>
          <div className="carte-titre">
            <IcAlerte style={{ width: 20, height: 20, color: 'var(--rouge)' }} />
            <h2 style={{ color: 'var(--rouge)' }}>Dépassements des 7 derniers jours</h2>
          </div>
          <div className="tableau-zone">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Frigo</th><th>Temp.</th><th>Seuils</th><th>Écart</th><th>Relevé par</th>
                </tr>
              </thead>
              <tbody>
                {alertes7.slice(0, 12).map((m, i) => (
                  <tr key={`${m.releve_id}-${m.frigo_nom}-${i}`}>
                    <td className="tres-petit">{dateFR(m.date_releve)}<br />
                      <span className="muet">{heureCourte(m.heure_releve)}</span>
                    </td>
                    <td>{m.frigo_nom}</td>
                    <td className="num" style={{ color: 'var(--rouge)' }}>{temp(m.temperature)}</td>
                    <td className="num tres-petit muet">{temp(m.seuil_min)} → {temp(m.seuil_max)}</td>
                    <td className="tres-petit" style={{ color: 'var(--rouge)' }}>
                      {ecart(m.temperature, m.seuil_min, m.seuil_max)}
                    </td>
                    <td className="tres-petit">{m.auteur_nom}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {alertes7.length > 12 && (
            <p className="tres-petit muet mt mb0">
              … et {alertes7.length - 12} autres. <Link to="/admin/releves">Tout consulter</Link>
            </p>
          )}
        </div>
      )}

      <div className="grille k2" style={{ alignItems: 'start' }}>
        {/* ---------------- Derniers relevés ---------------- */}
        <div className="carte">
          <div className="carte-titre">
            <IcHistorique style={{ width: 19, height: 19 }} />
            <h2>Derniers relevés</h2>
          </div>
          {!derniers.length ? (
            <Vide icone={IcThermo} texte="Aucun relevé enregistré." />
          ) : (
            <ul className="liste-nue">
              {derniers.map((r) => {
                const nc = (r.mesures ?? []).filter((m) => m.conforme === false).length
                return (
                  <li key={r.id} className="item-histo" style={{ alignItems: 'center' }}>
                    <div className="pile" style={{ gap: 0, minWidth: 60 }}>
                      <span className="gras petit">{dateFR(r.date_releve).slice(0, 5)}</span>
                      <span className="tres-petit muet nb">{heureCourte(r.heure_releve)}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="rangee" style={{ gap: '.3rem' }}>
                        {r.statut === 'valide'
                          ? <Etiquette type="ok">Validé</Etiquette>
                          : <Etiquette type="att">Brouillon</Etiquette>}
                        {nc > 0 && <Etiquette type="ko">{nc} hors seuil</Etiquette>}
                        {r.nb_modifications > 0 && <Etiquette type="info">modifié</Etiquette>}
                      </div>
                      <div className="tres-petit muet">
                        {r.auteur?.nom_complet || r.auteur?.identifiant || r.auteur_nom} · {(r.mesures ?? []).length} frigos
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* ---------------- Modifications ---------------- */}
        <div className="carte">
          <div className="carte-titre">
            <IcCrayon style={{ width: 19, height: 19 }} />
            <h2>Modifications récentes</h2>
          </div>
          {!modifs.length ? (
            <Vide icone={IcCheck} texte="Aucun relevé modifié après validation." />
          ) : (
            <ul className="liste-nue">
              {modifs.map((h) => (
                <li key={h.id} className="item-histo">
                  <IcCrayon style={{ width: 17, height: 17, color: 'var(--ambre)', flex: 'none', marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="petit">
                      <strong>{h.auteur?.nom_complet || h.auteur?.identifiant || h.auteur_nom}</strong> a modifié le
                      relevé du {h.releve ? `${dateFR(h.releve.date_releve)} à ${heureCourte(h.releve.heure_releve)}` : '—'}
                    </div>
                    <div className="tres-petit muet">
                      révision n° {h.details?.revision ?? '?'} · {depuis(h.created_at)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ---------------- Jours sans relevé ---------------- */}
      {manquantsHorsAujourdhui.length > 0 && (
        <div className="carte">
          <div className="carte-titre">
            <IcCalendrier style={{ width: 19, height: 19, color: 'var(--ambre)' }} />
            <h2>Jours sans relevé (30 derniers jours)</h2>
          </div>
          <div className="rangee">
            {manquantsHorsAujourdhui.map((j) => (
              <Etiquette key={j} type="att">{dateFR(j)}</Etiquette>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
