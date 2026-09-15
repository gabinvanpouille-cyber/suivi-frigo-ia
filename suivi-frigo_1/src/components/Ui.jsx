import { useEffect } from 'react'
import { IcAlerte, IcCheck, IcInfo, IcCroix } from './Icones'

export function Chargement({ texte = 'Chargement…' }) {
  return (
    <div className="chargement">
      <div className="tourniquet" />
      <span className="petit">{texte}</span>
    </div>
  )
}

export function Vide({ icone: Icone = IcInfo, titre, texte, children }) {
  return (
    <div className="vide">
      <Icone />
      {titre && <h3 style={{ color: 'var(--texte-doux)' }}>{titre}</h3>}
      {texte && <p className="petit">{texte}</p>}
      {children}
    </div>
  )
}

const ICONES = { ok: IcCheck, ko: IcAlerte, att: IcAlerte, info: IcInfo }

export function Message({ type = 'info', children, onFermer }) {
  if (!children) return null
  const Icone = ICONES[type] || IcInfo
  return (
    <div className={`alerte ${type}`} role={type === 'ko' ? 'alert' : 'status'}>
      <Icone />
      <div style={{ flex: 1 }}>{children}</div>
      {onFermer && (
        <button
          type="button"
          onClick={onFermer}
          aria-label="Fermer"
          style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', padding: 0 }}
        >
          <IcCroix style={{ width: 16, height: 16 }} />
        </button>
      )}
    </div>
  )
}

export function Dialogue({ titre, onFermer, children, actions }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onFermer?.()
    document.addEventListener('keydown', esc)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', esc)
      document.body.style.overflow = overflow
    }
  }, [onFermer])

  return (
    <div
      className="dialogue-fond"
      onMouseDown={(e) => e.target === e.currentTarget && onFermer?.()}
      role="dialog"
      aria-modal="true"
      aria-label={titre}
    >
      <div className="dialogue">
        <div className="carte-titre">
          <h2>{titre}</h2>
          <button
            type="button"
            className="btn fantome petit droite"
            onClick={onFermer}
            aria-label="Fermer"
          >
            <IcCroix />
          </button>
        </div>
        {children}
        {actions && <div className="barre-actions mt">{actions}</div>}
      </div>
    </div>
  )
}

export function Etiquette({ type = 'neutre', children }) {
  return <span className={`etiq ${type}`}>{children}</span>
}

/** Indicateur clé (KPI). */
export function Indicateur({ libelle, valeur, detail, ton = '' }) {
  return (
    <div className={`kpi ${ton}`}>
      <div className="lib">{libelle}</div>
      <div className="val">{valeur}</div>
      {detail && <div className="det">{detail}</div>}
    </div>
  )
}
