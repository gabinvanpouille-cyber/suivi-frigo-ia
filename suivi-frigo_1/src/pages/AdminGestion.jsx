import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase, normaliser } from '../lib/supabase'
import {
  creerCompte, modifierCompte, changerMotDePasse, supprimerCompte,
  creerFerme, supprimerFerme,
} from '../lib/api'
import { demiHeures, heureCourte, dateFR } from '../lib/utils'
import { useProduits, libelleProduit } from '../lib/produits'
import { Chargement, Message, Vide, Etiquette, Dialogue } from '../components/Ui'
import {
  IcFrigo, IcUtilisateurs, IcFermeBatiment, IcPlus, IcCrayon, IcPoubelle,
  IcCheck, IcCle, IcReglages,
} from '../components/Icones'

const ROLES = { super_admin: 'Administrateur général', admin: 'Administrateur', salarie: 'Salarié' }

export default function AdminGestion() {
  const { profil, ferme, estSuperAdmin, rafraichirProfil } = useAuth()
  const [onglet, setOnglet] = useState('frigos')
  const [msg, setMsg] = useState(null)

  const onglets = [
    { cle: 'frigos', libelle: 'Frigos', Icone: IcFrigo },
    { cle: 'comptes', libelle: 'Comptes', Icone: IcUtilisateurs },
    { cle: 'exploitation', libelle: 'Exploitation', Icone: IcReglages },
    ...(estSuperAdmin
      ? [{ cle: 'fermes', libelle: 'Exploitations', Icone: IcFermeBatiment }]
      : []),
  ]

  return (
    <>
      <h1>Gestion</h1>
      <p className="muet petit">{ferme?.nom} · code {ferme?.code}</p>

      {msg && <Message type={msg.type} onFermer={() => setMsg(null)}>{msg.texte}</Message>}

      <div className="carte compacte">
        <div className="rangee">
          {onglets.map(({ cle, libelle, Icone }) => (
            <button
              key={cle}
              className={`btn petit ${onglet === cle ? 'principal' : ''}`}
              onClick={() => setOnglet(cle)}
            >
              <Icone /> {libelle}
            </button>
          ))}
        </div>
      </div>

      {onglet === 'frigos' && <OngletFrigos ferme={ferme} setMsg={setMsg} />}
      {onglet === 'comptes' && <OngletComptes ferme={ferme} profil={profil} setMsg={setMsg} />}
      {onglet === 'exploitation' && (
        <OngletExploitation ferme={ferme} setMsg={setMsg} onMaj={rafraichirProfil} />
      )}
      {onglet === 'fermes' && (
        <OngletFermes profil={profil} setMsg={setMsg} onMaj={rafraichirProfil} />
      )}
    </>
  )
}

/* ===================================================================== */
/*  Onglet 1 — Frigos                                                    */
/* ===================================================================== */
const FRIGO_VIDE = { nom: '', emplacement: '', produit: 'pdt', temp_min: '0', temp_max: '4', ordre: 0, actif: true }

function OngletFrigos({ ferme, setMsg }) {
  const [liste, setListe] = useState([])
  const [chargement, setChargement] = useState(true)
  const [edition, setEdition] = useState(null)
  const [occupe, setOccupe] = useState(false)
  const produits = useProduits()

  const charger = useCallback(async () => {
    if (!ferme) return
    setChargement(true)
    const { data, error } = await supabase
      .from('frigos')
      .select('*')
      .eq('ferme_id', ferme.id)
      .order('ordre')
      .order('nom')
    if (error) setMsg({ type: 'ko', texte: error.message })
    setListe(data ?? [])
    setChargement(false)
  }, [ferme, setMsg])

  useEffect(() => { charger() }, [charger])

  const enregistrer = async (e) => {
    e.preventDefault()
    const min = Number(String(edition.temp_min).replace(',', '.'))
    const max = Number(String(edition.temp_max).replace(',', '.'))

    if (!edition.nom.trim()) return setMsg({ type: 'ko', texte: 'Le nom du frigo est obligatoire.' })
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return setMsg({ type: 'ko', texte: 'Les seuils doivent être des nombres.' })
    }
    if (min >= max) {
      return setMsg({ type: 'ko', texte: 'La température minimale doit être inférieure à la maximale.' })
    }

    setOccupe(true)
    const champs = {
      ferme_id: ferme.id,
      nom: edition.nom.trim(),
      emplacement: edition.emplacement?.trim() || null,
      produit: edition.produit || 'pdt',
      temp_min: min,
      temp_max: max,
      ordre: Number(edition.ordre) || 0,
      actif: !!edition.actif,
    }
    const { error } = edition.id
      ? await supabase.from('frigos').update(champs).eq('id', edition.id)
      : await supabase.from('frigos').insert(champs)
    setOccupe(false)

    if (error) return setMsg({ type: 'ko', texte: error.message })
    setMsg({ type: 'ok', texte: edition.id ? 'Frigo mis à jour.' : 'Frigo ajouté.' })
    setEdition(null)
    charger()
  }

  const supprimer = async (f) => {
    if (!window.confirm(
      `Supprimer « ${f.nom} » ? Tous les relevés associés à ce frigo seront également supprimés.\n\n` +
      'Pour conserver l’historique, désactivez-le plutôt que de le supprimer.'
    )) return
    const { error } = await supabase.from('frigos').delete().eq('id', f.id)
    if (error) return setMsg({ type: 'ko', texte: error.message })
    setMsg({ type: 'ok', texte: 'Frigo supprimé.' })
    charger()
  }

  if (chargement) return <Chargement />

  return (
    <>
      <div className="carte">
        <div className="carte-titre">
          <h2>Frigos et équipements</h2>
          <button className="btn principal petit droite" onClick={() => setEdition({ ...FRIGO_VIDE })}>
            <IcPlus /> Ajouter
          </button>
        </div>

        {!liste.length ? (
          <Vide
            icone={IcFrigo}
            titre="Aucun frigo"
            texte="Ajoutez vos équipements froids et définissez leurs seuils de température."
          />
        ) : (
          <div className="tableau-zone">
            <table>
              <thead>
                <tr>
                  <th>Ordre</th><th>Nom</th><th>Produit</th><th>Emplacement</th>
                  <th>Seuil min</th><th>Seuil max</th><th>État</th><th></th>
                </tr>
              </thead>
              <tbody>
                {liste.map((f) => (
                  <tr key={f.id} style={{ opacity: f.actif ? 1 : 0.55 }}>
                    <td className="num muet">{f.ordre}</td>
                    <td className="gras">{f.nom}</td>
                    <td className="tres-petit">{libelleProduit(produits, f.produit)}</td>
                    <td className="tres-petit muet">{f.emplacement || '—'}</td>
                    <td className="num">{Number(f.temp_min).toFixed(1)} °C</td>
                    <td className="num">{Number(f.temp_max).toFixed(1)} °C</td>
                    <td>
                      {f.actif
                        ? <Etiquette type="ok">Actif</Etiquette>
                        : <Etiquette type="neutre">Inactif</Etiquette>}
                    </td>
                    <td>
                      <div className="rangee" style={{ flexWrap: 'nowrap' }}>
                        <button className="btn petit" onClick={() => setEdition({ ...f })} aria-label="Modifier">
                          <IcCrayon />
                        </button>
                        <button className="btn petit fantome" onClick={() => supprimer(f)} aria-label="Supprimer">
                          <IcPoubelle />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {edition && (
        <Dialogue
          titre={edition.id ? 'Modifier le frigo' : 'Nouveau frigo'}
          onFermer={() => setEdition(null)}
        >
          <form onSubmit={enregistrer}>
            <div className="champ">
              <label htmlFor="fn">Nom *</label>
              <input id="fn" type="text" value={edition.nom} required
                     onChange={(e) => setEdition({ ...edition, nom: e.target.value })}
                     placeholder="Chambre froide positive" />
            </div>
            <div className="grille k2">
              <div className="champ">
                <label htmlFor="fe">Emplacement</label>
                <input id="fe" type="text" value={edition.emplacement ?? ''}
                       onChange={(e) => setEdition({ ...edition, emplacement: e.target.value })}
                       placeholder="Laiterie" />
              </div>
              <div className="champ">
                <label htmlFor="fp">Produit *</label>
                <select id="fp" value={edition.produit ?? 'pdt'}
                        onChange={(e) => setEdition({ ...edition, produit: e.target.value })}>
                  {produits.map((pr) => (
                    <option key={pr.code} value={pr.code}>{pr.libelle}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grille k2">
              <div className="champ">
                <label htmlFor="fmin">Température minimale (°C) *</label>
                <input id="fmin" type="text" inputMode="decimal" value={edition.temp_min} required
                       onChange={(e) => setEdition({ ...edition, temp_min: e.target.value })} />
              </div>
              <div className="champ">
                <label htmlFor="fmax">Température maximale (°C) *</label>
                <input id="fmax" type="text" inputMode="decimal" value={edition.temp_max} required
                       onChange={(e) => setEdition({ ...edition, temp_max: e.target.value })} />
              </div>
            </div>
            <div className="grille k2">
              <div className="champ">
                <label htmlFor="fo">Ordre d’affichage</label>
                <input id="fo" type="number" value={edition.ordre}
                       onChange={(e) => setEdition({ ...edition, ordre: e.target.value })} />
              </div>
              <div className="champ">
                <label htmlFor="fa">État</label>
                <select id="fa" value={edition.actif ? '1' : '0'}
                        onChange={(e) => setEdition({ ...edition, actif: e.target.value === '1' })}>
                  <option value="1">Actif (proposé au relevé)</option>
                  <option value="0">Inactif (historique conservé)</option>
                </select>
              </div>
            </div>
            <p className="aide">
              Toute mesure hors de l’intervalle déclenche une alerte immédiate sur les comptes de
              l’exploitation. Les seuils sont figés dans chaque relevé déjà enregistré.
            </p>
            <div className="barre-actions mt">
              <button type="button" className="btn" onClick={() => setEdition(null)}>Annuler</button>
              <button type="submit" className="btn principal" disabled={occupe}>
                <IcCheck /> Enregistrer
              </button>
            </div>
          </form>
        </Dialogue>
      )}
    </>
  )
}

/* ===================================================================== */
/*  Onglet 2 — Comptes                                                   */
/* ===================================================================== */
const COMPTE_VIDE = { identifiant: '', nom_complet: '', role: 'salarie', telephone: '', motDePasse: '' }

function OngletComptes({ ferme, profil, setMsg }) {
  const [liste, setListe] = useState([])
  const [chargement, setChargement] = useState(true)
  const [edition, setEdition] = useState(null)
  const [motDePasse, setMotDePasse] = useState(null)
  const [occupe, setOccupe] = useState(false)

  const charger = useCallback(async () => {
    if (!ferme) return
    setChargement(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('ferme_id', ferme.id)
      .order('role')
      .order('identifiant')
    if (error) setMsg({ type: 'ko', texte: error.message })
    setListe(data ?? [])
    setChargement(false)
  }, [ferme, setMsg])

  useEffect(() => { charger() }, [charger])

  const enregistrer = async (e) => {
    e.preventDefault()
    const identifiant = normaliser(edition.identifiant)

    if (!identifiant || identifiant.length < 2) {
      return setMsg({ type: 'ko', texte: 'Identifiant invalide (lettres, chiffres, point, tiret).' })
    }
    if (!edition.id && edition.motDePasse.length < 8) {
      return setMsg({ type: 'ko', texte: 'Le mot de passe doit faire au moins 8 caractères.' })
    }

    setOccupe(true)
    try {
      if (edition.id) {
        await modifierCompte({
          user_id: edition.id,
          nom_complet: edition.nom_complet || null,
          role: edition.role,
          telephone: edition.telephone || null,
          actif: edition.actif !== false,
        })
        setMsg({ type: 'ok', texte: 'Compte mis à jour.' })
      } else {
        await creerCompte({
          ferme_id: ferme.id,
          identifiant,
          nom_complet: edition.nom_complet || null,
          role: edition.role,
          telephone: edition.telephone || null,
          mot_de_passe: edition.motDePasse,
        })
        setMsg({
          type: 'ok',
          texte: `Compte créé. Connexion : code ferme « ${ferme.code} », identifiant « ${identifiant} ».`,
        })
      }
      setEdition(null)
      charger()
    } catch (err) {
      setMsg({ type: 'ko', texte: err.message })
    }
    setOccupe(false)
  }

  const reinitialiser = async (e) => {
    e.preventDefault()
    if (motDePasse.valeur.length < 8) {
      return setMsg({ type: 'ko', texte: 'Le mot de passe doit faire au moins 8 caractères.' })
    }
    setOccupe(true)
    try {
      await changerMotDePasse({ user_id: motDePasse.compte.id, mot_de_passe: motDePasse.valeur })
      setMsg({ type: 'ok', texte: `Nouveau mot de passe défini pour « ${motDePasse.compte.identifiant} ».` })
      setMotDePasse(null)
    } catch (err) {
      setMsg({ type: 'ko', texte: err.message })
    }
    setOccupe(false)
  }

  const supprimer = async (c) => {
    if (c.id === profil.id) {
      return setMsg({ type: 'ko', texte: 'Vous ne pouvez pas supprimer votre propre compte.' })
    }
    if (!window.confirm(
      `Supprimer définitivement le compte « ${c.identifiant} » ?\n\n` +
      'Les relevés déjà enregistrés par cette personne seront conservés.'
    )) return
    try {
      await supprimerCompte({ user_id: c.id })
      setMsg({ type: 'ok', texte: 'Compte supprimé.' })
      charger()
    } catch (err) {
      setMsg({ type: 'ko', texte: err.message })
    }
  }

  if (chargement) return <Chargement />

  return (
    <>
      <div className="carte">
        <div className="carte-titre">
          <h2>Comptes de l’exploitation</h2>
          <button
            className="btn principal petit droite"
            onClick={() => setEdition({ ...COMPTE_VIDE })}
          >
            <IcPlus /> Créer un compte
          </button>
        </div>

        {!liste.length ? (
          <Vide icone={IcUtilisateurs} titre="Aucun compte" texte="Créez les comptes salariés et administrateurs." />
        ) : (
          <div className="tableau-zone">
            <table>
              <thead>
                <tr>
                  <th>Identifiant</th><th>Nom</th><th>Rôle</th>
                  <th>Téléphone</th><th>État</th><th>Créé le</th><th></th>
                </tr>
              </thead>
              <tbody>
                {liste.map((c) => (
                  <tr key={c.id} style={{ opacity: c.actif ? 1 : 0.55 }}>
                    <td className="gras">{c.identifiant}</td>
                    <td>{c.nom_complet || '—'}</td>
                    <td>
                      <Etiquette type={c.role === 'salarie' ? 'neutre' : 'info'}>
                        {ROLES[c.role]}
                      </Etiquette>
                    </td>
                    <td className="tres-petit muet nb">{c.telephone || '—'}</td>
                    <td>
                      {c.actif
                        ? <Etiquette type="ok">Actif</Etiquette>
                        : <Etiquette type="ko">Désactivé</Etiquette>}
                    </td>
                    <td className="tres-petit muet">{dateFR(c.created_at?.slice(0, 10))}</td>
                    <td>
                      <div className="rangee" style={{ flexWrap: 'nowrap' }}>
                        <button className="btn petit" aria-label="Modifier"
                                onClick={() => setEdition({ ...c, motDePasse: '' })}>
                          <IcCrayon />
                        </button>
                        <button className="btn petit" aria-label="Réinitialiser le mot de passe"
                                onClick={() => setMotDePasse({ compte: c, valeur: '' })}>
                          <IcCle />
                        </button>
                        <button className="btn petit fantome" aria-label="Supprimer"
                                onClick={() => supprimer(c)} disabled={c.id === profil.id}>
                          <IcPoubelle />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="aide mt">
          Chaque personne se connecte avec le code ferme <strong>{ferme?.code}</strong>, son
          identifiant et son mot de passe. Aucune adresse email n’est nécessaire.
        </p>
      </div>

      {/* ---- Création / modification ---- */}
      {edition && (
        <Dialogue
          titre={edition.id ? `Modifier « ${edition.identifiant} »` : 'Nouveau compte'}
          onFermer={() => setEdition(null)}
        >
          <form onSubmit={enregistrer}>
            <div className="champ">
              <label htmlFor="ci">Identifiant *</label>
              <input
                id="ci" type="text" value={edition.identifiant} required
                disabled={!!edition.id}
                autoCapitalize="none" autoCorrect="off" spellCheck="false"
                onChange={(e) => setEdition({ ...edition, identifiant: e.target.value })}
                placeholder="marie.d"
              />
              <div className="aide">
                {edition.id
                  ? "L’identifiant ne peut plus être changé après la création."
                  : 'Minuscules, chiffres, point ou tiret. Il servira à se connecter.'}
              </div>
            </div>

            <div className="champ">
              <label htmlFor="cn">Nom et prénom</label>
              <input id="cn" type="text" value={edition.nom_complet ?? ''}
                     onChange={(e) => setEdition({ ...edition, nom_complet: e.target.value })}
                     placeholder="Marie Dupont" />
            </div>

            <div className="grille k2">
              <div className="champ">
                <label htmlFor="cr">Rôle *</label>
                {edition.role === 'super_admin' ? (
                  /* Le rôle « Administrateur général » n'est pas proposé à la
                     sélection : l'afficher dans une liste qui ne le contient pas
                     ferait basculer le compte en « Salarié » au premier clic. */
                  <select id="cr" value="super_admin" disabled>
                    <option value="super_admin">Administrateur général</option>
                  </select>
                ) : (
                  <select id="cr" value={edition.role}
                          onChange={(e) => setEdition({ ...edition, role: e.target.value })}>
                    <option value="salarie">Salarié</option>
                    <option value="admin">Administrateur</option>
                  </select>
                )}
              </div>
              <div className="champ">
                <label htmlFor="ct">Téléphone (SMS d’alerte)</label>
                <input id="ct" type="tel" value={edition.telephone ?? ''}
                       onChange={(e) => setEdition({ ...edition, telephone: e.target.value })}
                       placeholder="+33612345678" />
              </div>
            </div>

            {!edition.id && (
              <div className="champ">
                <label htmlFor="cm">Mot de passe provisoire *</label>
                <input id="cm" type="text" value={edition.motDePasse} required minLength={8}
                       onChange={(e) => setEdition({ ...edition, motDePasse: e.target.value })}
                       placeholder="8 caractères minimum" />
                <div className="aide">
                  Communiquez-le à la personne : elle pourra le changer dans ses réglages.
                </div>
              </div>
            )}

            {edition.id && (
              <div className="champ">
                <label htmlFor="ca">État du compte</label>
                <select id="ca" value={edition.actif === false ? '0' : '1'}
                        onChange={(e) => setEdition({ ...edition, actif: e.target.value === '1' })}>
                  <option value="1">Actif</option>
                  <option value="0">Désactivé (connexion impossible)</option>
                </select>
              </div>
            )}

            <div className="barre-actions mt">
              <button type="button" className="btn" onClick={() => setEdition(null)}>Annuler</button>
              <button type="submit" className="btn principal" disabled={occupe}>
                <IcCheck /> {edition.id ? 'Enregistrer' : 'Créer le compte'}
              </button>
            </div>
          </form>
        </Dialogue>
      )}

      {/* ---- Réinitialisation du mot de passe ---- */}
      {motDePasse && (
        <Dialogue
          titre={`Mot de passe de « ${motDePasse.compte.identifiant} »`}
          onFermer={() => setMotDePasse(null)}
        >
          <form onSubmit={reinitialiser}>
            <div className="champ">
              <label htmlFor="np">Nouveau mot de passe *</label>
              <input id="np" type="text" value={motDePasse.valeur} required minLength={8}
                     onChange={(e) => setMotDePasse({ ...motDePasse, valeur: e.target.value })}
                     placeholder="8 caractères minimum" />
            </div>
            <div className="barre-actions">
              <button type="button" className="btn" onClick={() => setMotDePasse(null)}>Annuler</button>
              <button type="submit" className="btn principal" disabled={occupe}>
                <IcCle /> Définir
              </button>
            </div>
          </form>
        </Dialogue>
      )}
    </>
  )
}

/* ===================================================================== */
/*  Onglet 3 — Réglages de l'exploitation                                */
/* ===================================================================== */
function OngletExploitation({ ferme, setMsg, onMaj }) {
  const [f, setF] = useState(ferme)
  const [occupe, setOccupe] = useState(false)
  const heures = demiHeures()

  useEffect(() => { setF(ferme) }, [ferme])
  if (!f) return <Chargement />

  const enregistrer = async (e) => {
    e.preventDefault()
    setOccupe(true)
    const { error } = await supabase
      .from('fermes')
      .update({
        nom: f.nom,
        adresse: f.adresse || null,
        rappel_matin: `${heureCourte(f.rappel_matin)}:00`,
        rappel_apresmidi: `${heureCourte(f.rappel_apresmidi)}:00`,
        alerte_admin: `${heureCourte(f.alerte_admin)}:00`,
      })
      .eq('id', f.id)
    setOccupe(false)
    if (error) return setMsg({ type: 'ko', texte: error.message })
    setMsg({ type: 'ok', texte: 'Réglages enregistrés.' })
    onMaj?.()
  }

  return (
    <form className="carte" onSubmit={enregistrer}>
      <div className="carte-titre">
        <h2>Réglages de l’exploitation</h2>
      </div>

      <div className="grille k2">
        <div className="champ">
          <label htmlFor="en">Nom</label>
          <input id="en" type="text" value={f.nom ?? ''}
                 onChange={(e) => setF({ ...f, nom: e.target.value })} />
        </div>
        <div className="champ">
          <label htmlFor="ec">Code de connexion</label>
          <input id="ec" type="text" value={f.code ?? ''} disabled />
          <div className="aide">Non modifiable : il est utilisé par tous les comptes.</div>
        </div>
      </div>

      <div className="champ">
        <label htmlFor="ea">Adresse</label>
        <input id="ea" type="text" value={f.adresse ?? ''}
               onChange={(e) => setF({ ...f, adresse: e.target.value })} />
      </div>

      <h3 style={{ marginTop: '1rem' }}>Horaires des notifications</h3>
      <div className="grille k3">
        <div className="champ">
          <label htmlFor="h1">1ᵉʳ rappel salariés</label>
          <select id="h1" value={heureCourte(f.rappel_matin)}
                  onChange={(e) => setF({ ...f, rappel_matin: e.target.value })}>
            {heures.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
        <div className="champ">
          <label htmlFor="h2">2ᵉ rappel salariés</label>
          <select id="h2" value={heureCourte(f.rappel_apresmidi)}
                  onChange={(e) => setF({ ...f, rappel_apresmidi: e.target.value })}>
            {heures.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
        <div className="champ">
          <label htmlFor="h3">Alerte administrateur</label>
          <select id="h3" value={heureCourte(f.alerte_admin)}
                  onChange={(e) => setF({ ...f, alerte_admin: e.target.value })}>
            {heures.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
      </div>

      <p className="aide">
        Les rappels ne partent que si aucun relevé n’a encore été validé dans la journée.
        L’alerte administrateur signale l’absence totale de relevé. Horaires en heure locale
        ({f.timezone}), par tranches de 30 minutes.
      </p>

      <button className="btn principal" type="submit" disabled={occupe}>
        <IcCheck /> Enregistrer
      </button>
    </form>
  )
}

/* ===================================================================== */
/*  Onglet 4 — Exploitations (administrateur général)                    */
/* ===================================================================== */
function OngletFermes({ profil, setMsg, onMaj }) {
  const [liste, setListe] = useState([])
  const [chargement, setChargement] = useState(true)
  const [creation, setCreation] = useState(null)
  const [occupe, setOccupe] = useState(false)

  const charger = useCallback(async () => {
    setChargement(true)
    const { data, error } = await supabase
      .from('fermes')
      .select('*, profiles(count), frigos(count)')
      .order('nom')
    if (error) setMsg({ type: 'ko', texte: error.message })
    setListe(data ?? [])
    setChargement(false)
  }, [setMsg])

  useEffect(() => { charger() }, [charger])

  const creer = async (e) => {
    e.preventDefault()
    const code = normaliser(creation.code)
    if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(code)) {
      return setMsg({ type: 'ko', texte: 'Code invalide : minuscules, chiffres et tirets, 2 à 31 caractères.' })
    }
    if (!creation.nom.trim()) return setMsg({ type: 'ko', texte: 'Le nom est obligatoire.' })
    if (creation.admin_identifiant && creation.admin_mot_de_passe.length < 8) {
      return setMsg({ type: 'ko', texte: 'Le mot de passe administrateur doit faire 8 caractères minimum.' })
    }

    setOccupe(true)
    try {
      const r = await creerFerme({
        code,
        nom: creation.nom.trim(),
        adresse: creation.adresse || null,
        admin_identifiant: creation.admin_identifiant ? normaliser(creation.admin_identifiant) : null,
        admin_nom: creation.admin_nom || null,
        admin_mot_de_passe: creation.admin_mot_de_passe || null,
      })
      setMsg({
        type: 'ok',
        texte: r.admin_cree
          ? `Exploitation « ${creation.nom} » créée avec son administrateur. Connexion : code « ${code} ».`
          : `Exploitation « ${creation.nom} » créée. Code de connexion : « ${code} ».`,
      })
      setCreation(null)
      charger()
    } catch (err) {
      setMsg({ type: 'ko', texte: err.message })
    }
    setOccupe(false)
  }

  const basculer = async (fermeId) => {
    setOccupe(true)
    try {
      await modifierCompte({ user_id: profil.id, ferme_id: fermeId })
      await onMaj?.()
      setMsg({ type: 'ok', texte: 'Exploitation active changée.' })
    } catch (err) {
      setMsg({ type: 'ko', texte: err.message })
    }
    setOccupe(false)
  }

  const supprimer = async (f) => {
    if (f.id === profil.ferme_id) {
      return setMsg({ type: 'ko', texte: 'Basculez sur une autre exploitation avant de supprimer celle-ci.' })
    }
    if (!window.confirm(
      `Supprimer « ${f.nom} » ?\n\nTous ses comptes, frigos et relevés seront définitivement effacés.`
    )) return
    try {
      await supprimerFerme({ ferme_id: f.id })
      setMsg({ type: 'ok', texte: 'Exploitation supprimée.' })
      charger()
    } catch (err) {
      setMsg({ type: 'ko', texte: err.message })
    }
  }

  if (chargement) return <Chargement />

  return (
    <>
      <div className="carte">
        <div className="carte-titre">
          <h2>Toutes les exploitations</h2>
          <button
            className="btn principal petit droite"
            onClick={() => setCreation({
              code: '', nom: '', adresse: '',
              admin_identifiant: '', admin_nom: '', admin_mot_de_passe: '',
            })}
          >
            <IcPlus /> Nouvelle exploitation
          </button>
        </div>

        <div className="tableau-zone">
          <table>
            <thead>
              <tr>
                <th>Code</th><th>Nom</th><th>Comptes</th><th>Frigos</th>
                <th>Rappels</th><th>Alerte</th><th></th>
              </tr>
            </thead>
            <tbody>
              {liste.map((f) => (
                <tr key={f.id} style={f.id === profil.ferme_id ? { background: 'var(--bleu-fond)' } : undefined}>
                  <td className="gras">
                    {f.code}
                    {f.id === profil.ferme_id && <Etiquette type="info">active</Etiquette>}
                  </td>
                  <td>{f.nom}</td>
                  <td className="num">{f.profiles?.[0]?.count ?? 0}</td>
                  <td className="num">{f.frigos?.[0]?.count ?? 0}</td>
                  <td className="tres-petit nb">
                    {heureCourte(f.rappel_matin)} · {heureCourte(f.rappel_apresmidi)}
                  </td>
                  <td className="tres-petit nb">{heureCourte(f.alerte_admin)}</td>
                  <td>
                    <div className="rangee" style={{ flexWrap: 'nowrap' }}>
                      <button className="btn petit" disabled={occupe || f.id === profil.ferme_id}
                              onClick={() => basculer(f.id)}>
                        Basculer
                      </button>
                      <button className="btn petit fantome" aria-label="Supprimer"
                              onClick={() => supprimer(f)}>
                        <IcPoubelle />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="aide mt">
          « Basculer » change l’exploitation que vous administrez : tableau de bord, relevés,
          courbes et comptes affichent alors les données de cette exploitation.
        </p>
      </div>

      {creation && (
        <Dialogue titre="Nouvelle exploitation" onFermer={() => setCreation(null)}>
          <form onSubmit={creer}>
            <div className="grille k2">
              <div className="champ">
                <label htmlFor="nc">Code de connexion *</label>
                <input id="nc" type="text" value={creation.code} required
                       autoCapitalize="none" autoCorrect="off" spellCheck="false"
                       onChange={(e) => setCreation({ ...creation, code: e.target.value })}
                       placeholder="bellevue" />
              </div>
              <div className="champ">
                <label htmlFor="nn">Nom *</label>
                <input id="nn" type="text" value={creation.nom} required
                       onChange={(e) => setCreation({ ...creation, nom: e.target.value })}
                       placeholder="Ferme de Bellevue" />
              </div>
            </div>
            <div className="champ">
              <label htmlFor="na">Adresse</label>
              <input id="na" type="text" value={creation.adresse}
                     onChange={(e) => setCreation({ ...creation, adresse: e.target.value })} />
            </div>

            <h3 style={{ marginTop: '1rem' }}>Administrateur de l’exploitation</h3>
            <p className="aide" style={{ marginTop: 0 }}>
              Facultatif : vous pouvez aussi créer les comptes plus tard depuis l’onglet Comptes.
            </p>
            <div className="grille k2">
              <div className="champ">
                <label htmlFor="ai">Identifiant</label>
                <input id="ai" type="text" value={creation.admin_identifiant}
                       autoCapitalize="none" autoCorrect="off" spellCheck="false"
                       onChange={(e) => setCreation({ ...creation, admin_identifiant: e.target.value })}
                       placeholder="jean.p" />
              </div>
              <div className="champ">
                <label htmlFor="an">Nom et prénom</label>
                <input id="an" type="text" value={creation.admin_nom}
                       onChange={(e) => setCreation({ ...creation, admin_nom: e.target.value })} />
              </div>
            </div>
            <div className="champ">
              <label htmlFor="am">Mot de passe provisoire</label>
              <input id="am" type="text" value={creation.admin_mot_de_passe} minLength={8}
                     onChange={(e) => setCreation({ ...creation, admin_mot_de_passe: e.target.value })}
                     placeholder="8 caractères minimum" />
            </div>

            <div className="barre-actions mt">
              <button type="button" className="btn" onClick={() => setCreation(null)}>Annuler</button>
              <button type="submit" className="btn principal" disabled={occupe}>
                <IcCheck /> Créer
              </button>
            </div>
          </form>
        </Dialogue>
      )}
    </>
  )
}
