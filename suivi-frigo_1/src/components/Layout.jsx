import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  IcAccueil, IcThermo, IcHistorique, IcCourbe, IcReglages,
  IcFrigo, IcCloche,
} from './Icones'

const LIENS_SALARIE = [
  { to: '/', libelle: 'Accueil', Icone: IcAccueil, exact: true },
  { to: '/releve/nouveau', libelle: 'Relevé', Icone: IcThermo },
  { to: '/courbes', libelle: 'Courbes', Icone: IcCourbe },
  { to: '/historique', libelle: 'Historique', Icone: IcHistorique },
  { to: '/reglages', libelle: 'Réglages', Icone: IcReglages },
]

const LIENS_ADMIN = [
  { to: '/admin', libelle: 'Tableau', Icone: IcAccueil, exact: true },
  // Un administrateur releve les temperatures comme tout le monde : sans ce
  // lien, la saisie n'etait accessible qu'en tapant l'adresse a la main.
  { to: '/releve/nouveau', libelle: 'Saisie', Icone: IcThermo },
  { to: '/admin/releves', libelle: 'Relevés', Icone: IcHistorique },
  { to: '/admin/courbes', libelle: 'Courbes', Icone: IcCourbe },
  { to: '/admin/gestion', libelle: 'Gestion', Icone: IcFrigo },
  { to: '/reglages', libelle: 'Réglages', Icone: IcReglages },
]

export default function Layout() {
  const {
    profil, estAdmin, estSuperAdmin, ferme,
    fermes, fermeSienne, changerFermeVue, consulteAutreFerme,
  } = useAuth()
  const location = useLocation()
  const [nonLues, setNonLues] = useState(0)

  const liens = estAdmin ? LIENS_ADMIN : LIENS_SALARIE

  useEffect(() => {
    if (!profil) return
    let vivant = true

    const compter = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('destinataire_id', profil.id)
        .eq('lu', false)
      if (vivant) setNonLues(count ?? 0)
    }
    compter()

    const canal = supabase
      .channel(`notif-${profil.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `destinataire_id=eq.${profil.id}` },
        compter
      )
      .subscribe()

    return () => {
      vivant = false
      supabase.removeChannel(canal)
    }
  }, [profil, location.pathname])

  return (
    <div className="app">
      <header className="entete">
        <div className="marque">
          <img src="/icons/icon-192.png" alt="" width="30" height="30" />
          <div className="pile" style={{ gap: 0 }}>
            <span>SUIVI FRIGO</span>
            <span className="sous">
              {ferme?.nom || '—'}
              {profil ? ` · ${profil.nom_complet || profil.identifiant}` : ''}
            </span>
          </div>
        </div>
        <div className="droite">
          <NavLink
            to="/notifications"
            className="btn fantome petit"
            aria-label={`Notifications${nonLues ? ` (${nonLues} non lues)` : ''}`}
            style={{ position: 'relative' }}
          >
            <IcCloche />
            {nonLues > 0 && (
              <span className="pastille" style={{ position: 'absolute', top: 2, right: 2 }}>
                {nonLues > 99 ? '99+' : nonLues}
              </span>
            )}
          </NavLink>
        </div>
      </header>

      <nav className="nav" aria-label="Navigation principale">
        {liens.map(({ to, libelle, Icone, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) => (isActive ? 'actif' : undefined)}
          >
            <Icone />
            <span>{libelle}</span>
          </NavLink>
        ))}
      </nav>

      {/* Siège : bascule d'une exploitation à l'autre pour les consulter. */}
      {estSuperAdmin && fermes.length > 1 && (
        <div className={`barre-ferme${consulteAutreFerme ? ' ailleurs' : ''}`}>
          <label htmlFor="fv">Exploitation</label>
          <select
            id="fv"
            value={ferme?.id ?? ''}
            onChange={(e) => changerFermeVue(e.target.value)}
          >
            {fermes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nom}{f.id === fermeSienne?.id ? ' (la vôtre)' : ''}
              </option>
            ))}
          </select>
          {consulteAutreFerme && (
            <span className="note">
              consultation — la saisie reste sur {fermeSienne?.nom}
            </span>
          )}
        </div>
      )}

      <main className="contenu">
        <Outlet />
      </main>
    </div>
  )
}
