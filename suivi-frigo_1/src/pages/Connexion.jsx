import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Message } from '../components/Ui'
import { IcInstaller, IcCle } from '../components/Icones'
import { estIOS, estInstallee } from '../lib/push'

const MEMOIRE_FERME = 'suivifrigo-derniere-ferme'
const MEMOIRE_IDENT = 'suivifrigo-dernier-identifiant'

export default function Connexion() {
  const { connexion } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [codeFerme, setCodeFerme] = useState('')
  const [identifiant, setIdentifiant] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [invite, setInvite] = useState(null)

  useEffect(() => {
    try {
      setCodeFerme(localStorage.getItem(MEMOIRE_FERME) || '')
      setIdentifiant(localStorage.getItem(MEMOIRE_IDENT) || '')
    } catch { /* stockage indisponible : sans conséquence */ }
  }, [])

  // Invitation à installer l'application (Android / Chrome / Edge)
  useEffect(() => {
    const capter = (e) => {
      e.preventDefault()
      setInvite(e)
    }
    window.addEventListener('beforeinstallprompt', capter)
    return () => window.removeEventListener('beforeinstallprompt', capter)
  }, [])

  const soumettre = async (e) => {
    e.preventDefault()
    setErreur('')
    setOccupe(true)

    const resultat = await connexion(codeFerme, identifiant, motDePasse)
    setOccupe(false)

    if (resultat.erreur) {
      setErreur(resultat.erreur)
      setMotDePasse('')
      return
    }

    try {
      localStorage.setItem(MEMOIRE_FERME, codeFerme.trim().toLowerCase())
      localStorage.setItem(MEMOIRE_IDENT, identifiant.trim().toLowerCase())
    } catch { /* sans conséquence */ }

    const roleAdmin = ['admin', 'super_admin'].includes(resultat.profil.role)
    const destination = location.state?.de && location.state.de !== '/connexion'
      ? location.state.de
      : roleAdmin ? '/admin' : '/'
    navigate(destination, { replace: true })
  }

  const installer = async () => {
    if (!invite) return
    invite.prompt()
    await invite.userChoice
    setInvite(null)
  }

  const iosNonInstallee = estIOS() && !estInstallee()

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div className="centre" style={{ marginBottom: '1.5rem' }}>
          <img
            src="/icons/icon-192.png"
            alt=""
            width="72"
            height="72"
            style={{ borderRadius: 18, boxShadow: 'var(--ombre-forte)' }}
          />
          <h1 style={{ marginTop: '.85rem', marginBottom: '.15rem' }}>SUIVI FRIGO</h1>
          <p className="petit muet mb0">Relevés de température et traçabilité</p>
        </div>

        <form className="carte" onSubmit={soumettre}>
          <Message type="ko" onFermer={() => setErreur('')}>{erreur}</Message>

          <div className="champ">
            <label htmlFor="ferme">Code de l’exploitation</label>
            <input
              id="ferme"
              type="text"
              value={codeFerme}
              onChange={(e) => setCodeFerme(e.target.value)}
              placeholder="ex. bellevue"
              autoComplete="organization"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              required
            />
          </div>

          <div className="champ">
            <label htmlFor="ident">Identifiant</label>
            <input
              id="ident"
              type="text"
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
              placeholder="ex. marie.d"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              required
            />
          </div>

          <div className="champ">
            <label htmlFor="mdp">Mot de passe</label>
            <input
              id="mdp"
              type="password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button className="btn principal large" type="submit" disabled={occupe}>
            <IcCle />
            {occupe ? 'Connexion…' : 'Se connecter'}
          </button>

          <p className="tres-petit muet centre mt mb0">
            Les comptes sont créés par votre administrateur.
          </p>
        </form>

        {invite && (
          <button className="btn large" type="button" onClick={installer}>
            <IcInstaller />
            Installer l’application
          </button>
        )}

        {iosNonInstallee && (
          <div className="alerte info" style={{ marginTop: '.6rem' }}>
            <IcInstaller />
            <div>
              <strong>Sur iPhone / iPad</strong>
              <div className="tres-petit">
                Touchez <strong>Partager</strong> puis <strong>« Sur l’écran d’accueil »</strong>.
                L’installation est indispensable pour recevoir les notifications.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
