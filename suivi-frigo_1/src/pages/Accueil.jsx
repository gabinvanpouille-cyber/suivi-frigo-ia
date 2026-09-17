import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { aujourdhui, dateLongue, heureCourte, temp, ecart, depuis } from '../lib/utils'
import { Chargement, Message, Vide, Etiquette } from '../components/Ui'
import { IcThermo, IcCheck, IcAlerte, IcCrayon, IcCloche, IcFrigo } from '../components/Icones'
import { abonnementActif, pushDisponible } from '../lib/push'
import { useProduits, libelleProduit } from '../lib/produits'

export default function Accueil() {
  const { profil, ferme } = useAuth()
  const produits = useProduits()
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
          'id, date_releve, heure_releve, statut, remarque, nb_modifications, modifie_at, auteur_id, auteur_nom, produit,' +
          ' auteur:profiles(identifiant, nom_complet),' +
          ' mesures(id, temperature, seuil_min, seuil_max, conforme, remarque, photo_url,' +
          ' frigo:frigos(id, nom, emplacement, produit))'
        )
        .eq('ferme_id', ferme.id)
        .eq('date_releve', jour)
        .order('heure_releve', { ascending: false }),
      supabase
        .from('frigos')
        .select('id, nom, produit')
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

  const brouillons = releves.filter((r) => r.statut === 'brouillon')
  const toutesMesures = releves.flatMap((r) => r.mesures ?? [])
  const alertes = toutesMesures.filter((m) => m.conforme === false)

  // Un relevé par produit : chaque produit a son propre état du jour.
  const listeProduits = produits.length ? produits : [{ code: 'pdt', libelle: 'Pommes de terre' }]
  const plusieursProduits = listeProduits.length > 1
  const duProduit = (code) => releves.filter((r) => (r.produit ?? 'pdt') === code)

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

      {/* ---- État du jour : un bloc par produit ---- */}
      {listeProduits.map((pr) => {
        const rel = duProduit(pr.code)
        const valides = rel.filter((r) => r.statut === 'valide')
        const nbFrigos = frigos.filter((f) => (f.produit ?? 'pdt') === pr.code).length
        const fait = valides.length > 0
        return (
          <div
            key={pr.code}
            className="carte"
            style={{
              borderColor: fait ? 'var(--vert)' : 'var(--ambre)',
              background: fait ? 'var(--vert-fond)' : 'var(--ambre-fond)',
            }}
          >
            <div className="rangee" style={{ gap: '.7rem', flexWrap: 'nowrap' }}>
              <div
                style={{
                  width: 44, height: 44, borderRadius: 12, flex: 'none',
                  display: 'grid', placeItems: 'center',
                  background: fait ? 'var(--vert)' : 'var(--ambre)', color: '#fff',
                }}
              >
                {fait ? <IcCheck style={{ width: 24, height: 24 }} /> : <IcAlerte style={{ width: 24, height: 24 }} />}
              </div>
              <div style={{ minWidth: 0 }}>
                <strong style={{ color: fait ? 'var(--vert)' : 'var(--ambre)' }}>
                  {plusieursProduits
                    ? `${pr.libelle} · ${fait ? 'relevé effectué' : 'relevé à faire'}`
                    : fait ? 'Relevé du jour effectué' : 'Relevé du jour à faire'}
                </strong>
                <div className="petit doux">
                  {!nbFrigos
                    ? 'Aucune chambre froide enregistrée pour ce produit.'
                    : fait
                    ? `${valides.length} relevé${valides.length > 1 ? 's' : ''} validé${valides.length > 1 ? 's' : ''} aujourd’hui`
                    : 'Aucun relevé validé pour aujourd’hui.'}
                </div>
              </div>
            </div>

            {nbFrigos > 0 && (
              <Link
                to={`/releve/nouveau?produit=${pr.code}`}
                className="btn principal large mt"
                style={{ textDecoration: 'none' }}
              >
                <IcThermo />
                {fait ? 'Ajouter un relevé' : 'Faire le relevé'}
                {plusieursProduits ? ` — ${pr.libelle.toLowerCase()}` : ''}
              </Link>
            )}
          </div>
        )
      })}

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
                  {plusieursProduits && (
                    <span className="tres-petit muet">{' · '}{libelleProduit(listeProduits, m.frigo?.produit)}</span>
                  )}
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
          <Link to={`/releve/${brouillons[0].id}`}>
            Reprendre la saisie
            {plusieursProduits ? ` (${libelleProduit(listeProduits, brouillons[0].produit).toLowerCase()})` : ''}
          </Link>
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
                      {plusieursProduits && (
                        <Etiquette type="info">{libelleProduit(listeProduits, r.produit)}</Etiquette>
                      )}
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
