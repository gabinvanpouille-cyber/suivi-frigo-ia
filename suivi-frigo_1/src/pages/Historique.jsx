import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { aujourdhui, decalerJours, dateLongue, heureCourte, temp, depuis } from '../lib/utils'
import { Chargement, Message, Vide, Etiquette } from '../components/Ui'
import { IcCrayon, IcHistorique, IcChevron } from '../components/Icones'
import Onglets from '../components/Onglets'
import { useProduits } from '../lib/produits'

const PERIODES = [
  { valeur: 7, libelle: '7 jours' },
  { valeur: 30, libelle: '30 jours' },
  { valeur: 90, libelle: '3 mois' },
]

export default function Historique() {
  const { profil, ferme } = useAuth()
  const location = useLocation()
  const produits = useProduits()

  const [produit, setProduit] = useState('pdt')
  const [jours, setJours] = useState(30)
  const [seulementMoi, setSeulementMoi] = useState(false)
  const [releves, setReleves] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [message, setMessage] = useState(location.state?.message ?? '')
  const [ouvert, setOuvert] = useState(null)

  const charger = useCallback(async () => {
    if (!ferme) return
    setChargement(true)

    const fin = aujourdhui(ferme.timezone)
    const debut = decalerJours(fin, -jours + 1)

    let requete = supabase
      .from('releves')
      .select(
        'id, date_releve, heure_releve, statut, remarque, nb_modifications, modifie_at, auteur_id, auteur_nom, produit,' +
        ' auteur:profiles(identifiant, nom_complet),' +
        ' mesures(id, temperature, seuil_min, seuil_max, conforme, remarque, en_descente,' +
        ' hygrometrie, seuil_hygro_min, seuil_hygro_max, hygro_conforme, frigo:frigos(nom))'
      )
      .eq('ferme_id', ferme.id)
      .eq('produit', produit)
      .gte('date_releve', debut)
      .lte('date_releve', fin)
      .order('date_releve', { ascending: false })
      .order('heure_releve', { ascending: false })

    if (seulementMoi) requete = requete.eq('auteur_id', profil.id)

    const { data, error } = await requete
    if (error) setErreur(error.message)
    setReleves(data ?? [])
    setChargement(false)
  }, [ferme, jours, seulementMoi, profil, produit])

  useEffect(() => { charger() }, [charger])

  const parJour = releves.reduce((acc, r) => {
    ;(acc[r.date_releve] ||= []).push(r)
    return acc
  }, {})

  return (
    <>
      <h1>Historique</h1>

      <Onglets options={produits} valeur={produit} onChange={setProduit} aria="Produit" />

      <Message type="ok" onFermer={() => setMessage('')}>{message}</Message>
      <Message type="ko" onFermer={() => setErreur('')}>{erreur}</Message>

      <div className="carte compacte">
        <div className="rangee">
          {PERIODES.map((p) => (
            <button
              key={p.valeur}
              className={`btn petit ${jours === p.valeur ? 'principal' : ''}`}
              onClick={() => setJours(p.valeur)}
            >
              {p.libelle}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button
            className={`btn petit ${seulementMoi ? 'principal' : ''}`}
            onClick={() => setSeulementMoi((v) => !v)}
          >
            Mes relevés
          </button>
        </div>
      </div>

      {chargement ? (
        <Chargement />
      ) : !releves.length ? (
        <div className="carte">
          <Vide icone={IcHistorique} titre="Aucun relevé" texte="Aucun relevé sur cette période." />
        </div>
      ) : (
        Object.entries(parJour).map(([jour, liste]) => (
          <div className="carte" key={jour}>
            <div className="carte-titre">
              <h3 style={{ textTransform: 'capitalize' }}>{dateLongue(jour)}</h3>
              <span className="droite petit muet">
                {liste.length} relevé{liste.length > 1 ? 's' : ''}
              </span>
            </div>

            <ul className="liste-nue">
              {liste.map((r) => {
                const mesures = r.mesures ?? []
                const nc = mesures.filter((m) => m.conforme === false)
                // La colonne hygrométrie ne s'affiche que si ce relevé en porte.
                const aHygro = mesures.some(
                  (m) => m.hygrometrie !== null && m.hygrometrie !== undefined
                )
                const estOuvert = ouvert === r.id
                return (
                  <li key={r.id} style={{ borderBottom: '1px solid var(--bordure)' }}>
                    <div
                      className="rangee"
                      style={{ padding: '.55rem 0', cursor: 'pointer', flexWrap: 'nowrap' }}
                      onClick={() => setOuvert(estOuvert ? null : r.id)}
                    >
                      <IcChevron
                        style={{
                          width: 16, height: 16, flex: 'none', color: 'var(--texte-faible)',
                          transform: estOuvert ? 'rotate(90deg)' : 'none', transition: 'transform .15s',
                        }}
                      />
                      <span className="nb gras" style={{ minWidth: 44 }}>{heureCourte(r.heure_releve)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="rangee" style={{ gap: '.3rem' }}>
                          {r.statut === 'valide'
                            ? <Etiquette type="ok">Validé</Etiquette>
                            : <Etiquette type="att">Brouillon</Etiquette>}
                          {nc.length > 0 && <Etiquette type="ko">{nc.length} hors seuil</Etiquette>}
                          {r.nb_modifications > 0 && (
                            <Etiquette type="info">modifié {r.nb_modifications}×</Etiquette>
                          )}
                        </div>
                        <div className="tres-petit muet">
                          {mesures.length} frigo{mesures.length > 1 ? 's' : ''} ·{' '}
                          {r.auteur?.nom_complet || r.auteur?.identifiant || r.auteur_nom || 'compte supprimé'}
                          {r.modifie_at ? ` · modifié ${depuis(r.modifie_at)}` : ''}
                        </div>
                      </div>
                      {r.auteur_id === profil?.id && (
                        <Link
                          to={`/releve/${r.id}`}
                          className="btn petit"
                          aria-label="Modifier ce relevé"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <IcCrayon />
                        </Link>
                      )}
                    </div>

                    {estOuvert && (
                      <div style={{ padding: '0 0 .7rem 2rem' }}>
                        <div className="tableau-zone">
                          <table>
                            <thead>
                              <tr>
                                <th>Frigo</th>
                                <th>Température</th>
                                <th>Seuils</th>
                                {aHygro && <th>Hygrométrie</th>}
                                <th>Remarque</th>
                              </tr>
                            </thead>
                            <tbody>
                              {mesures.map((m) => (
                                <tr key={m.id}>
                                  <td>{m.frigo?.nom}</td>
                                  <td
                                    className="num"
                                    style={{
                                      color: m.conforme === false ? 'var(--rouge)'
                                        : m.en_descente ? 'var(--bleu)' : undefined,
                                    }}
                                    title={m.en_descente ? 'Chambre en descente de température' : undefined}
                                  >
                                    {temp(m.temperature)}
                                    {m.en_descente && ' ↓'}
                                  </td>
                                  <td className="num muet tres-petit">
                                    {temp(m.seuil_min)} → {temp(m.seuil_max)}
                                  </td>
                                  {aHygro && (
                                    <td
                                      className="num tres-petit"
                                      style={{ color: m.hygro_conforme === false ? 'var(--rouge)' : undefined }}
                                    >
                                      {m.hygrometrie === null || m.hygrometrie === undefined
                                        ? '—'
                                        : `${Number(m.hygrometrie).toFixed(0)} %`}
                                    </td>
                                  )}
                                  <td className="tres-petit muet">{m.remarque || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {r.remarque && (
                          <p className="tres-petit muet mt mb0">Remarque : {r.remarque}</p>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))
      )}
    </>
  )
}
