import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Message, Etiquette } from '../components/Ui'
import { IcCheck, IcCloche, IcInstaller, IcSortie, IcCle, IcInfo } from '../components/Icones'
import {
  activerNotifications, desactiverNotifications, abonnementActif,
  pushDisponible, estIOS, estInstallee, permissionActuelle,
} from '../lib/push'
import { testerNotification } from '../lib/api'
import { heureCourte } from '../lib/utils'

const ROLES = { super_admin: 'Administrateur général', admin: 'Administrateur', salarie: 'Salarié' }

export default function Reglages() {
  const { profil, ferme, deconnexion, rafraichirProfil } = useAuth()
  const navigate = useNavigate()

  const [nom, setNom] = useState(profil?.nom_complet ?? '')
  const [tel, setTel] = useState(profil?.telephone ?? '')
  const [mdp1, setMdp1] = useState('')
  const [mdp2, setMdp2] = useState('')
  const [pushActif, setPushActif] = useState(false)
  const [invite, setInvite] = useState(null)
  const [occupe, setOccupe] = useState('')
  const [msg, setMsg] = useState(null)

  useEffect(() => { abonnementActif().then(setPushActif) }, [])

  useEffect(() => {
    const capter = (e) => { e.preventDefault(); setInvite(e) }
    window.addEventListener('beforeinstallprompt', capter)
    return () => window.removeEventListener('beforeinstallprompt', capter)
  }, [])

  const enregistrerProfil = async (e) => {
    e.preventDefault()
    setOccupe('profil')
    const telNettoye = tel.replace(/[^\d+]/g, '')
    if (telNettoye && !/^\+\d{8,15}$/.test(telNettoye)) {
      setMsg({ type: 'ko', texte: 'Le téléphone doit être au format international, ex. +33612345678.' })
      setOccupe('')
      return
    }
    const { error } = await supabase
      .from('profiles')
      .update({ nom_complet: nom || null, telephone: telNettoye || null })
      .eq('id', profil.id)
    setOccupe('')
    if (error) return setMsg({ type: 'ko', texte: error.message })
    await rafraichirProfil()
    setMsg({ type: 'ok', texte: 'Profil mis à jour.' })
  }

  const changerMdp = async (e) => {
    e.preventDefault()
    if (mdp1.length < 8) return setMsg({ type: 'ko', texte: 'Le mot de passe doit faire au moins 8 caractères.' })
    if (mdp1 !== mdp2) return setMsg({ type: 'ko', texte: 'Les deux mots de passe ne correspondent pas.' })
    setOccupe('mdp')
    const { error } = await supabase.auth.updateUser({ password: mdp1 })
    setOccupe('')
    if (error) return setMsg({ type: 'ko', texte: error.message })
    setMdp1(''); setMdp2('')
    setMsg({ type: 'ok', texte: 'Mot de passe modifié.' })
  }

  const basculerPush = async () => {
    setOccupe('push')
    const r = pushActif ? await desactiverNotifications() : await activerNotifications(profil)
    setOccupe('')
    setMsg({ type: r.ok ? 'ok' : 'ko', texte: r.message })
    setPushActif(await abonnementActif())
  }

  const tester = async () => {
    setOccupe('test')
    try {
      await testerNotification()
      setMsg({ type: 'ok', texte: 'Notification de test envoyée. Elle arrive dans quelques secondes.' })
    } catch (e) {
      setMsg({ type: 'ko', texte: e.message })
    }
    setOccupe('')
  }

  const seDeconnecter = async () => {
    await deconnexion()
    navigate('/connexion', { replace: true })
  }

  const permission = permissionActuelle()
  const iosNonInstallee = estIOS() && !estInstallee()

  return (
    <>
      <h1>Réglages</h1>
      {msg && <Message type={msg.type} onFermer={() => setMsg(null)}>{msg.texte}</Message>}

      {/* ---------------- Compte ---------------- */}
      <form className="carte" onSubmit={enregistrerProfil}>
        <div className="carte-titre">
          <h2>Mon compte</h2>
          <span className="droite">
            <Etiquette type="info">{ROLES[profil?.role] ?? profil?.role}</Etiquette>
          </span>
        </div>

        <div className="grille k2" style={{ marginBottom: '.85rem' }}>
          <div>
            <div className="tres-petit muet">Exploitation</div>
            <strong>{ferme?.nom}</strong>
            <div className="tres-petit muet">code : {ferme?.code}</div>
          </div>
          <div>
            <div className="tres-petit muet">Identifiant</div>
            <strong>{profil?.identifiant}</strong>
          </div>
        </div>

        <div className="champ">
          <label htmlFor="nom">Nom et prénom</label>
          <input id="nom" type="text" value={nom} onChange={(e) => setNom(e.target.value)}
                 placeholder="Marie Dupont" autoComplete="name" />
        </div>

        <div className="champ">
          <label htmlFor="tel">Téléphone mobile</label>
          <input id="tel" type="tel" value={tel} onChange={(e) => setTel(e.target.value)}
                 placeholder="+33612345678" autoComplete="tel" />
          <div className="aide">
            Utilisé uniquement pour les SMS d’alerte en cas de dépassement de température.
            Format international obligatoire.
          </div>
        </div>

        <button className="btn principal" type="submit" disabled={occupe === 'profil'}>
          <IcCheck /> Enregistrer
        </button>
      </form>

      {/* ---------------- Notifications ---------------- */}
      <div className="carte">
        <div className="carte-titre">
          <IcCloche style={{ width: 20, height: 20 }} />
          <h2>Notifications</h2>
          <span className="droite">
            {pushActif ? <Etiquette type="ok">Activées</Etiquette> : <Etiquette type="neutre">Désactivées</Etiquette>}
          </span>
        </div>

        <p className="petit doux">
          Rappels à <strong>{heureCourte(ferme?.rappel_matin)}</strong> et{' '}
          <strong>{heureCourte(ferme?.rappel_apresmidi)}</strong> tant que le relevé du jour n’est pas
          fait, plus les alertes immédiates de dépassement de température.
        </p>

        {!pushDisponible() && (
          <Message type="att">Ce navigateur ne gère pas les notifications push.</Message>
        )}

        {iosNonInstallee && (
          <Message type="info">
            <strong>iPhone / iPad :</strong> les notifications ne fonctionnent que si l’application
            est ajoutée à l’écran d’accueil. Touchez <strong>Partager</strong> puis{' '}
            <strong>« Sur l’écran d’accueil »</strong>, puis rouvrez SUIVI FRIGO depuis cette icône.
          </Message>
        )}

        {permission === 'denied' && (
          <Message type="ko">
            Les notifications ont été bloquées pour ce site. Réautorisez-les dans les réglages du
            navigateur, puis revenez ici.
          </Message>
        )}

        <div className="barre-actions">
          <button
            className={`btn ${pushActif ? '' : 'principal'}`}
            onClick={basculerPush}
            disabled={occupe === 'push' || !pushDisponible() || iosNonInstallee}
          >
            <IcCloche />
            {pushActif ? 'Désactiver sur cet appareil' : 'Activer sur cet appareil'}
          </button>
          {pushActif && (
            <button className="btn" onClick={tester} disabled={occupe === 'test'}>
              Envoyer un test
            </button>
          )}
        </div>
      </div>

      {/* ---------------- Installation ---------------- */}
      <div className="carte">
        <div className="carte-titre">
          <IcInstaller style={{ width: 20, height: 20 }} />
          <h2>Installer l’application</h2>
          <span className="droite">
            {estInstallee() ? <Etiquette type="ok">Installée</Etiquette> : <Etiquette type="neutre">Navigateur</Etiquette>}
          </span>
        </div>

        {estInstallee() ? (
          <p className="petit doux mb0">
            SUIVI FRIGO est installé sur cet appareil. Il fonctionne même sans connexion et reçoit
            les notifications.
          </p>
        ) : invite ? (
          <button
            className="btn principal"
            onClick={async () => { invite.prompt(); await invite.userChoice; setInvite(null) }}
          >
            <IcInstaller /> Installer maintenant
          </button>
        ) : (
          <ul className="petit doux" style={{ paddingLeft: '1.1rem', margin: 0 }}>
            <li><strong>iPhone / iPad :</strong> Partager ▸ « Sur l’écran d’accueil »</li>
            <li><strong>Android :</strong> menu ⋮ ▸ « Installer l’application »</li>
            <li><strong>Ordinateur :</strong> icône d’installation dans la barre d’adresse</li>
          </ul>
        )}
      </div>

      {/* ---------------- Sécurité ---------------- */}
      <form className="carte" onSubmit={changerMdp}>
        <div className="carte-titre">
          <IcCle style={{ width: 20, height: 20 }} />
          <h2>Mot de passe</h2>
        </div>
        <div className="champ">
          <label htmlFor="m1">Nouveau mot de passe</label>
          <input id="m1" type="password" value={mdp1} onChange={(e) => setMdp1(e.target.value)}
                 autoComplete="new-password" minLength={8} />
        </div>
        <div className="champ">
          <label htmlFor="m2">Confirmer</label>
          <input id="m2" type="password" value={mdp2} onChange={(e) => setMdp2(e.target.value)}
                 autoComplete="new-password" minLength={8} />
        </div>
        <button className="btn" type="submit" disabled={occupe === 'mdp' || !mdp1}>
          Modifier le mot de passe
        </button>
      </form>

      {/* ---------------- Déconnexion ---------------- */}
      <div className="carte">
        <button className="btn danger large" onClick={seDeconnecter}>
          <IcSortie /> Se déconnecter
        </button>
        <p className="tres-petit muet centre mt mb0">
          <IcInfo style={{ width: 12, height: 12, verticalAlign: '-2px' }} /> SUIVI FRIGO v1.0
        </p>
      </div>
    </>
  )
}
