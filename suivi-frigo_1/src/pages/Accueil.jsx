import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { aujourdhui, dateLongue, heureCourte, temp, ecart, depuis } from '../lib/utils'
import { Chargement, Message, Vide, Etiquette } from '../components/Ui'
import { IcThermo, IcCheck, IcAlerte, IcCrayon, IcCloche, IcFrigo } from '../components/Icones'
import { abonnementActif, pushDisponible } from '../lib/push'

export default function Accueil() {
  const { profil, ferme } = useAuth()
  const [releves, setReleves] = useState([])
  const [frigos, setFrigos] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [pushOk, setPushOk] = useState(true)

  const jour = aujourdhui(ferme?.timezone)

  const charger = useCallback(async () => {
    if (!ferme) return
    setChargement(true)

    const [r1, r2] = await Promise.all([
      supabase
        .from('releves')
        .select(
          'id, date_releve, heure_releve, statut, remarque, nb_modifications, modifie_at, auteur_id, auteur_nom,' +
          ' auteur:profiles(identifiant, nom_complet),' +
          ' mesures(id, temperature, seuil_min, seuil_max, conforme, remarque, photo_url,' +
          ' frigo:frigos(id, nom, emplacement))'
        )
        .eq('ferme_id', ferme.id)
        .eq('date_releve', jour)
        .order('heure_releve', { ascending: false }),
      supabase
        .from('frigos')
        .select('id, nom')
        .eq('ferme_id', ferme.id)
        .eq('actif', true),
    ])

    if (r1.error) setErreur(r1.error.message)
    setReleves(r1.data ?? [])
    setFrigos(r2.data ?? [])
    setChargement(false)
  }, [ferme, jour])

  useEffect(() => { charger() }, [charger])

  useEffect(() => {
    if (!pushDisponible()) return
    abonnementActif().then(setPushOk)
  }, [])

  if (chargement) return <Chargement />

  const valides = releves.filter((r) => r.statut === 'valide')
  const brouillons = releves.filter((r) => r.statut === 'brouillon')
  const toutesMesures = releves.flatMap((r) => r.mesures ?? [])
  const alertes = toutesMesures.filter((m) => m.conforme === false)
  const faitAujourdhui = valides.length > 0

  return (
    <>
      <h1 style={{ marginBottom: '.15rem' }}>Bonjour {profil?.nom_complet?.split(' ')[0] || profil?.identifiant}</h1>
      <p className="muet petit" style={{ textTransform: 'capitalize' }}>{dateLongue(jour)}</p>

      <Message type="ko" onFermer={() => setErreur('')}>{erreur}</Message>

      {!frigos.length && (
        <Message type="att">
          Aucun frigo n’est encore enregistré pour {ferme?.nom}. Votre administrateur doit en
          créer au moins un avant que vous puissiez faire un relevé.
        </Message>
      )}

      {/* ---- État du jour ---- */}
      <div
        className="carte"
        style={{
          borderColor: faitAujourdhui ? 'var(--vert)' : 'var(--ambre)',
          background: faitAujourdhui ? 'var(--vert-fond)' : 'var(--ambre-fond)',
        }}
      >
        <div className="rangee" style={{ gap: '.7rem', flexWrap: 'nowrap' }}>
          <div
            style={{
              width: 44, height: 44, borderRadius: 12, flex: 'none',
              display: 'grid', placeItems: 'center',
              background: faitAujourdhui ? 'var(--vert)' : 'var(--ambre)', color: '#fff',
            }}
          >
            {faitAujourdhui ? <IcCheck style={{ width: 24, height: 24 }} /> : <IcAlerte style={{ width: 24, height: 24 }} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <strong style={{ color: faitAujourdhui ? 'var(--vert)' : 'var(--ambre)' }}>
              {faitAujourdhui ? 'Relevé du jour effectué' : 'Relevé du jour à faire'}
            </strong>
            <div className="petit doux">
              {faitAujourdhui
                ? `${valides.length} relevé${valides.length > 1 ? 's' : ''} validé${valides.length > 1 ? 's' : ''} aujourd’hui`
                : 'Aucun relevé validé pour aujourd’hui.'}
            </div>
          </div>
        </div>

        <Link
          to="/releve/nouveau"
          className="btn principal large mt"
          style={{ textDecoration: 'none' }}
          aria-disabled={!frigos.length}
        >
          <IcThermo />
          {faitAujourdhui ? 'Ajouter un relevé' : 'Faire le relevé'}
        </Link>
      </div>

      {/* ---- Alertes de dépassement ---- */}
      {alertes.length > 0 && (
        <div className="carte" style={{ borderColor: 'var(--rouge)' }}>
          <div className="carte-titre">
            <IcAlerte style={{ width: 20, height: 20, color: 'var(--rouge)' }} />
            <h2 style={{ color: 'var(--rouge)' }}>
              {alertes.length} dépassement{alertes.length > 1 ? 's' : ''} aujourd’hui
            </h2>
          </div>
          <ul className="liste-nue">
            {alertes.map((m) => (
              <li key={m.id} className="item-histo">
                <IcFrigo style={{ width: 18, height: 18, color: 'var(--rouge)', flex: 'none' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{m.frigo?.nom}</strong>{' '}
                  <span className="gras" style={{ color: 'var(--rouge)' }}>{temp(m.temperature)}</span>
                  <div className="tres-petit muet">
                    {ecart(m.temperature, m.seuil_min, m.seuil_max)} — seuils {temp(m.seuil_min)} à {temp(m.seuil_max)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---- Brouillons ---- */}
      {brouillons.length > 0 && (
        <Message type="att">
          Vous avez {brouillons.length} relevé{brouillons.length > 1 ? 's' : ''} non validé
          {brouillons.length > 1 ? 's' : ''}.{' '}
          <Link to={`/releve/${brouillons[0].id}`}>Reprendre la saisie</Link>
        </Message>
      )}

      {/* ---- Notifications non activées ---- */}
      {pushDisponible() && !pushOk && (
        <Message type="info">
          <strong>Notifications désactivées sur cet appareil.</strong>{' '}
          <Link to="/reglages">Les activer</Link> pour recevoir les rappels de {heureCourte(ferme?.rappel_matin)} et{' '}
          {heureCourte(ferme?.rappel_apresmidi)}.
        </Message>
      )}

      {/* ---- Relevés du jour ---- */}
      <div className="carte">
        <div className="carte-titre">
          <h2>Relevés du jour</h2>
          <Link to="/historique" className="petit droite">Tout l’historique</Link>
        </div>

        {!releves.length ? (
          <Vide icone={IcCloche} texte="Aucun relevé enregistré aujourd’hui." />
        ) : (
          <ul className="liste-nue">
            {releves.map((r) => {
              const nc = (r.mesures ?? []).filter((m) => m.conforme === false).length
              const monReleve = r.auteur_id === profil?.id
              return (
                <li
                  key={r.id}
                  className="item-histo"
                  style={{ alignItems: 'center', gap: '.75rem' }}
                >
                  <div className="nb gras" style={{ fontSize: '1.05rem', minWidth: 46 }}>
                    {heureCourte(r.heure_releve)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="rangee" style={{ gap: '.35rem' }}>
                      {r.statut === 'valide'
                        ? <Etiquette type="ok">Validé</Etiquette>
                        : <Etiquette type="att">Brouillon</Etiquette>}
                      {nc > 0 && <Etiquette type="ko">{nc} hors seuil</Etiquette>}
                      {r.nb_modifications > 0 && (
                        <Etiquette type="info">modifié {r.nb_modifications}×</Etiquette>
                      )}
                    </div>
                    <div className="tres-petit muet">
                      {(r.mesures ?? []).length} frigo{(r.mesures ?? []).length > 1 ? 's' : ''} ·{' '}
                      {r.auteur?.nom_complet || r.auteur?.identifiant || r.auteur_nom || 'compte supprimé'}
                      {r.modifie_at ? ` · modifié ${depuis(r.modifie_at)}` : ''}
                    </div>
                  </div>
                  {monReleve && (
                    <Link to={`/releve/${r.id}`} className="btn petit" aria-label="Modifier">
                      <IcCrayon />
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}
