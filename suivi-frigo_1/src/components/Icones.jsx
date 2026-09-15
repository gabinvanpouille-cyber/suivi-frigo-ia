/* Jeu d'icônes en SVG inline — aucune dépendance externe. */

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
  xmlns: 'http://www.w3.org/2000/svg',
  'aria-hidden': 'true',
}

const I = (enfants) => (props) => (
  <svg {...base} {...props}>
    {enfants}
  </svg>
)

export const IcAccueil = I(
  <>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M9.5 21v-6h5v6" />
  </>
)

export const IcPlus = I(
  <>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </>
)

export const IcThermo = I(
  <>
    <path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4.5 4.5 0 1 0 4 0z" />
    <path d="M12 9v6.5" />
  </>
)

export const IcHistorique = I(
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7.5V12l3 2" />
  </>
)

export const IcCourbe = I(
  <>
    <path d="M3 3v18h18" />
    <path d="m7 15 4-5 3 3 5-7" />
  </>
)

export const IcFrigo = I(
  <>
    <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
    <path d="M5 10h14" />
    <path d="M8.5 6v2" />
    <path d="M8.5 13v3" />
  </>
)

export const IcUtilisateurs = I(
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16.5 5.2a3.5 3.5 0 0 1 0 5.6" />
    <path d="M18 14.4a6.5 6.5 0 0 1 3.5 5.6" />
  </>
)

export const IcFermeBatiment = I(
  <>
    <path d="M3 10.5 12 4l9 6.5" />
    <path d="M5 9.8V20h14V9.8" />
    <rect x="9.5" y="13" width="5" height="7" />
  </>
)

export const IcReglages = I(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.66 8.6a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </>
)

export const IcAlerte = I(
  <>
    <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4.5" />
    <path d="M12 17.2h.01" />
  </>
)

export const IcCheck = I(<path d="m4.5 12.5 5 5 10-11" />)

export const IcCroix = I(
  <>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </>
)

export const IcPhoto = I(
  <>
    <path d="M21 17V8a2 2 0 0 0-2-2h-2.2l-1.2-2H8.4L7.2 6H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z" />
    <circle cx="12" cy="12.5" r="3.5" />
  </>
)

export const IcCrayon = I(
  <>
    <path d="M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16v4z" />
    <path d="m14.5 5.5 4 4" />
  </>
)

export const IcPoubelle = I(
  <>
    <path d="M4 7h16" />
    <path d="M9 7V4.5h6V7" />
    <path d="M6 7v12.5A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V7" />
    <path d="M10 11v6M14 11v6" />
  </>
)

export const IcCloche = I(
  <>
    <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5z" />
    <path d="M13.7 20a2 2 0 0 1-3.4 0" />
  </>
)

export const IcSortie = I(
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </>
)

export const IcTelecharger = I(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m7 10 5 5 5-5" />
    <path d="M12 15V3" />
  </>
)

export const IcChevron = I(<path d="m9 5 7 7-7 7" />)

export const IcRetour = I(
  <>
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </>
)

export const IcCalendrier = I(
  <>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18" />
    <path d="M8 3v4M16 3v4" />
  </>
)

export const IcInfo = I(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 7.8h.01" />
  </>
)

export const IcCle = I(
  <>
    <circle cx="8" cy="15" r="4" />
    <path d="m10.8 12.2 8.2-8.2" />
    <path d="m16 7 2.5 2.5" />
    <path d="m13.5 9.5 2.5 2.5" />
  </>
)

export const IcInstaller = I(
  <>
    <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
    <path d="M12 7v7" />
    <path d="m9 11 3 3 3-3" />
  </>
)
