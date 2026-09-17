/**
 * Barre d'onglets générique — utilisée pour basculer entre les produits
 * (pommes de terre, échalotes…). Accessible au clavier : flèches ← →.
 *
 * options : [{ code, libelle, badge? }]
 */
export default function Onglets({ options, valeur, onChange, aria = 'Produit' }) {
  if (!options || options.length < 2) return null

  const bouger = (pas) => {
    const i = options.findIndex((o) => o.code === valeur)
    const suivant = options[(i + pas + options.length) % options.length]
    if (suivant) onChange(suivant.code)
  }

  return (
    <div className="onglets" role="tablist" aria-label={aria}>
      {options.map((o) => {
        const actif = o.code === valeur
        return (
          <button
            key={o.code}
            type="button"
            role="tab"
            aria-selected={actif}
            tabIndex={actif ? 0 : -1}
            className={actif ? 'actif' : ''}
            onClick={() => onChange(o.code)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') { e.preventDefault(); bouger(1) }
              if (e.key === 'ArrowLeft') { e.preventDefault(); bouger(-1) }
            }}
          >
            {o.libelle}
            {o.badge != null && <span className="pastille">{o.badge}</span>}
          </button>
        )
      })}
    </div>
  )
}
