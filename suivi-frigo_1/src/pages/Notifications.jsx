import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { horodatage, depuis } from '../lib/utils'
import { Chargement, Message, Vide, Etiquette } from '../components/Ui'
import { IcCloche, IcAlerte, IcCheck, IcInfo, IcCrayon } from '../components/Icones'

const TYPES = {
  rappel:          { libelle: 'Rappel',        ton: 'info',   Icone: IcCloche },
  recap:           { libelle: 'Récapitulatif', ton: 'ok',     Icone: IcCheck },
  modification:    { libelle: 'Modification',  ton: 'att',    Icone: IcCrayon },
  alerte_temp:     { libelle: 'Dépassement',   ton: 'ko',     Icone: IcAlerte },
  alerte_manquant: { libelle: 'Relevé manquant', ton: 'ko',   Icone: IcAlerte },
}

export default function Notifications() {
  const { profil } = useAuth()
  const navigate = useNavigate()
  const [liste, setListe] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

  const charger = useCallback(async () => {
    if (!profil) return
    setChargement(true)
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('destinataire_id', profil.id)
      .order('created_at', { ascending: false })
      .limit(120)
    if (error) setErreur(error.message)
    setListe(data ?? [])
    setChargement(false)
  }, [profil])

  useEffect(() => { charger() }, [charger])

  const toutMarquer = async () => {
    const { error } = await supabase
      .from('notifications')
      .update({ lu: true })
      .eq('destinataire_id', profil.id)
      .eq('lu', false)
    if (error) return setErreur(error.message)
    setListe((l) => l.map((n) => ({ ...n, lu: true })))
  }

  const ouvrir = async (n) => {
    if (!n.lu) {
      await supabase.from('notifications').update({ lu: true }).eq('id', n.id)
      setListe((l) => l.map((x) => (x.id === n.id ? { ...x, lu: true } : x)))
    }
    if (n.lien) navigate(n.lien)
  }

  const nonLues = liste.filter((n) => !n.lu).length

  return (
    <>
      <div className="entre" style={{ marginBottom: '.7rem' }}>
        <h1 className="mb0">Notifications</h1>
        {nonLues > 0 && (
          <button className="btn petit" onClick={toutMarquer}>Tout marquer comme lu</button>
        )}
      </div>

      <Message type="ko" onFermer={() => setErreur('')}>{erreur}</Message>

      {chargement ? (
        <Chargement />
      ) : !liste.length ? (
        <div className="carte">
          <Vide
            icone={IcCloche}
            titre="Aucune notification"
            texte="Les rappels, récapitulatifs et alertes apparaîtront ici."
          />
        </div>
      ) : (
        <div className="carte">
          <ul className="liste-nue">
            {liste.map((n) => {
              const t = TYPES[n.type] ?? { libelle: n.type, ton: 'neutre', Icone: IcInfo }
              const { Icone } = t
              return (
                <li
                  key={n.id}
                  className="item-histo"
                  style={{
                    cursor: n.lien ? 'pointer' : 'default',
                    opacity: n.lu ? 0.65 : 1,
                    alignItems: 'flex-start',
                  }}
                  onClick={() => ouvrir(n)}
                >
                  <Icone
                    style={{
                      width: 19, height: 19, flex: 'none', marginTop: 2,
                      color: `var(--${t.ton === 'ko' ? 'rouge' : t.ton === 'att' ? 'ambre' : t.ton === 'ok' ? 'vert' : 'bleu'})`,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="rangee" style={{ gap: '.4rem' }}>
                      <strong style={{ fontWeight: n.lu ? 500 : 700 }}>{n.titre}</strong>
                      <Etiquette type={t.ton}>{t.libelle}</Etiquette>
                      {!n.lu && <span className="pastille" style={{ minWidth: 8, height: 8, padding: 0 }} />}
                    </div>
                    {n.corps && <div className="petit doux" style={{ whiteSpace: 'pre-line' }}>{n.corps}</div>}
                    <div className="tres-petit muet" title={horodatage(n.created_at)}>
                      {depuis(n.created_at)}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </>
  )
}
