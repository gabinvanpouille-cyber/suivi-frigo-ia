import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceArea, ReferenceLine,
} from 'recharts'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useThemeSombre } from '../lib/useThemeSombre'
import { couleurSerie, jetons, ETAT, MAX_SERIES } from '../lib/palette'
import {
  aujourdhui, decalerJours, dateCourte, dateFR, heureCourte, temp, pourcentage,
} from '../lib/utils'
import { Chargement, Message, Vide, Etiquette } from '../components/Ui'
import { IcCourbe, IcAlerte } from '../components/Icones'

const RACCOURCIS = [
  { libelle: '7 j', jours: 7 },
  { libelle: '30 j', jours: 30 },
  { libelle: '3 mois', jours: 90 },
]

export default function AdminCourbes() {
  const { ferme } = useAuth()
  const sombre = useThemeSombre()
  const t = jetons(sombre)
  const etat = sombre ? ETAT.sombre : ETAT.clair

  const finDefaut = aujourdhui(ferme?.timezone)
  const [debut, setDebut] = useState(decalerJours(finDefaut, -29))
  const [fin, setFin] = useState(finDefaut)
  const [selection, setSelection] = useState([])   // ids de frigos affichés
  const [frigos, setFrigos] = useState([])
  const [mesures, setMesures] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

  const charger = useCallback(async () => {
    if (!ferme) return
    setChargement(true)

    const [rFrigos, rMesures] = await Promise.all([
      supabase
        .from('frigos')
        .select('id, nom, emplacement, temp_min, temp_max, actif, ordre')
        .eq('ferme_id', ferme.id)
        .order('ordre'),
      supabase
        .from('v_mesures_completes')
        .select('releve_id, frigo_id, frigo_nom, date_releve, heure_releve, temperature, seuil_min, seuil_max, conforme')
        .eq('ferme_id', ferme.id)
        .eq('statut', 'valide')
        .gte('date_releve', debut)
        .lte('date_releve', fin)
        .order('date_releve')
        .order('heure_releve'),
    ])

    if (rMesures.error) setErreur(rMesures.error.message)
    const listeFrigos = rFrigos.data ?? []
    setFrigos(listeFrigos)
    setMesures(rMesures.data ?? [])
    setSelection((s) =>
      s.length ? s : listeFrigos.filter((f) => f.actif).slice(0, MAX_SERIES).map((f) => f.id)
    )
    setChargement(false)
  }, [ferme, debut, fin])

  useEffect(() => { charger() }, [charger])

  /* ---- Séries affichées : couleur figée sur l'identité du frigo ------ */
  const ordreCouleurs = useMemo(() => {
    const m = new Map()
    frigos.forEach((f, i) => m.set(f.id, i))
    return m
  }, [frigos])

  const affiches = useMemo(
    () => frigos.filter((f) => selection.includes(f.id)),
    [frigos, selection]
  )

  /* ---- Construction du jeu de points --------------------------------- */
  const donnees = useMemo(() => {
    const parInstant = new Map()
    mesures.forEach((m) => {
      if (!selection.includes(m.frigo_id)) return
      const cle = `${m.date_releve}T${m.heure_releve}`
      if (!parInstant.has(cle)) {
        parInstant.set(cle, {
          cle,
          etiquette: `${dateCourte(m.date_releve)} ${heureCourte(m.heure_releve)}`,
          jour: m.date_releve,
        })
      }
      parInstant.get(cle)[m.frigo_id] = Number(m.temperature)
      parInstant.get(cle)[`${m.frigo_id}__ok`] = m.conforme
    })
    return [...parInstant.values()].sort((a, b) => a.cle.localeCompare(b.cle))
  }, [mesures, selection])

  /* ---- Bande de conformité : seulement si un seul frigo est affiché --- */
  const bande = affiches.length === 1 ? affiches[0] : null

  /* ---- Statistiques ---------------------------------------------------*/
  const stats = useMemo(
    () =>
      affiches.map((f) => {
        const liste = mesures.filter((m) => m.frigo_id === f.id && m.temperature !== null)
        const vals = liste.map((m) => Number(m.temperature))
        const nc = liste.filter((m) => m.conforme === false).length
        const moy = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
        return {
          frigo: f,
          n: vals.length,
          moy,
          min: vals.length ? Math.min(...vals) : null,
          max: vals.length ? Math.max(...vals) : null,
          nc,
          taux: vals.length ? pourcentage(vals.length - nc, vals.length) : null,
          couleur: couleurSerie(ordreCouleurs.get(f.id) ?? 0, sombre),
        }
      }),
    [affiches, mesures, ordreCouleurs, sombre]
  )

  const basculer = (id) =>
    setSelection((s) => {
      if (s.includes(id)) return s.filter((x) => x !== id)
      if (s.length >= MAX_SERIES) return s
      return [...s, id]
    })

  const appliquerRaccourci = (jours) => {
    const f = aujourdhui(ferme?.timezone)
    setFin(f)
    setDebut(decalerJours(f, -jours + 1))
  }

  /* ---- Infobulle personnalisée --------------------------------------- */
  const Infobulle = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div
        style={{
          background: t.surface, border: `1px solid ${t.bordure}`, borderRadius: 10,
          padding: '.55rem .7rem', boxShadow: '0 6px 22px rgba(0,0,0,.18)', fontSize: '.82rem',
        }}
      >
        <div style={{ color: t.encreDouce, marginBottom: 4, fontWeight: 600 }}>{label}</div>
        {payload.map((p) => {
          const conforme = p.payload[`${p.dataKey}__ok`]
          return (
            <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.encre }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: p.stroke, flex: 'none' }} />
              <span style={{ flex: 1 }}>{p.name}</span>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{temp(p.value)}</strong>
              {conforme === false && (
                <span style={{ color: etat.critique, fontWeight: 700 }}>!</span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  /* ---- Point marqué en rouge si hors seuils --------------------------- */
  const pointConditionnel = (frigoId, couleur) => (props) => {
    const { cx, cy, payload } = props
    if (cx === undefined || cy === undefined || payload[frigoId] === undefined) return null
    const hors = payload[`${frigoId}__ok`] === false
    if (!hors) return null
    return (
      <g>
        <circle cx={cx} cy={cy} r={5.5} fill={etat.critique} stroke={t.surface} strokeWidth={2} />
      </g>
    )
  }

  if (chargement) return <Chargement />

  return (
    <>
      <h1>Courbes de suivi</h1>
      <p className="muet petit">
        Relevés validés du {dateFR(debut)} au {dateFR(fin)} — {ferme?.nom}
      </p>

      <Message type="ko" onFermer={() => setErreur('')}>{erreur}</Message>

      {/* ---------------- Filtres ---------------- */}
      <div className="carte">
        <div className="filtres" style={{ marginBottom: '.7rem' }}>
          {RACCOURCIS.map((r) => (
            <button key={r.jours} className="btn petit" onClick={() => appliquerRaccourci(r.jours)}>
              {r.libelle}
            </button>
          ))}
          <div className="champ" style={{ flex: '0 0 155px' }}>
            <label htmlFor="c1">Du</label>
            <input id="c1" type="date" value={debut} max={fin} onChange={(e) => setDebut(e.target.value)} />
          </div>
          <div className="champ" style={{ flex: '0 0 155px' }}>
            <label htmlFor="c2">Au</label>
            <input id="c2" type="date" value={fin} min={debut} onChange={(e) => setFin(e.target.value)} />
          </div>
        </div>

        <div className="rangee">
          {frigos.map((f) => {
            const actif = selection.includes(f.id)
            const couleur = couleurSerie(ordreCouleurs.get(f.id) ?? 0, sombre)
            return (
              <button
                key={f.id}
                className="btn petit"
                onClick={() => basculer(f.id)}
                style={{
                  borderColor: actif ? couleur : 'var(--bordure)',
                  background: actif ? 'var(--surface-2)' : 'transparent',
                  opacity: actif ? 1 : 0.55,
                }}
              >
                <span
                  style={{
                    width: 10, height: 10, borderRadius: 3, background: couleur,
                    display: 'inline-block', flex: 'none',
                  }}
                />
                {f.nom}
              </button>
            )
          })}
        </div>
        {selection.length >= MAX_SERIES && (
          <p className="tres-petit muet mt mb0">
            {MAX_SERIES} courbes maximum affichées simultanément, pour rester lisible.
          </p>
        )}
      </div>

      {/* ---------------- Graphique ---------------- */}
      <div className="carte">
        <div className="carte-titre">
          <IcCourbe style={{ width: 19, height: 19 }} />
          <h2>Températures relevées</h2>
          {bande && (
            <span className="droite">
              <Etiquette type="ok">
                zone conforme {temp(bande.temp_min)} → {temp(bande.temp_max)}
              </Etiquette>
            </span>
          )}
        </div>

        {!donnees.length ? (
          <Vide
            icone={IcCourbe}
            titre="Aucune donnée"
            texte="Aucun relevé validé sur cette période pour les frigos sélectionnés."
          />
        ) : (
          <div style={{ width: '100%', height: 380 }}>
            <ResponsiveContainer>
              <LineChart data={donnees} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
                <CartesianGrid stroke={t.grille} strokeDasharray="3 3" vertical={false} />

                {bande && (
                  <ReferenceArea
                    y1={Number(bande.temp_min)}
                    y2={Number(bande.temp_max)}
                    fill={etat.bon}
                    fillOpacity={sombre ? 0.12 : 0.09}
                    stroke="none"
                    ifOverflow="extendDomain"
                  />
                )}
                {bande && (
                  <>
                    <ReferenceLine y={Number(bande.temp_max)} stroke={etat.alerte}
                                   strokeDasharray="5 4" strokeWidth={1.5} />
                    <ReferenceLine y={Number(bande.temp_min)} stroke={etat.alerte}
                                   strokeDasharray="5 4" strokeWidth={1.5} />
                  </>
                )}

                <XAxis
                  dataKey="etiquette"
                  tick={{ fill: t.encreFaible, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: t.grille }}
                  minTickGap={28}
                />
                <YAxis
                  unit="°"
                  tick={{ fill: t.encreFaible, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                />
                <Tooltip content={<Infobulle />} cursor={{ stroke: t.encreFaible, strokeDasharray: '3 3' }} />
                {affiches.length > 1 && (
                  <Legend
                    wrapperStyle={{ fontSize: '.8rem', color: t.encreDouce, paddingTop: 6 }}
                    iconType="plainline"
                  />
                )}

                {affiches.map((f) => {
                  const couleur = couleurSerie(ordreCouleurs.get(f.id) ?? 0, sombre)
                  return (
                    <Line
                      key={f.id}
                      type="monotone"
                      dataKey={f.id}
                      name={f.nom}
                      stroke={couleur}
                      strokeWidth={2}
                      dot={pointConditionnel(f.id, couleur)}
                      activeDot={{ r: 5, strokeWidth: 2, stroke: t.surface }}
                      connectNulls
                      isAnimationActive={false}
                    />
                  )
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="tres-petit muet mt mb0">
          <span
            style={{
              width: 9, height: 9, borderRadius: '50%', background: etat.critique,
              display: 'inline-block', marginRight: 5,
            }}
          />
          Les points rouges signalent une mesure hors des seuils autorisés.
        </p>
      </div>

      {/* ---------------- Tableau de synthèse (équivalent textuel) ------- */}
      <div className="carte">
        <div className="carte-titre">
          <h2>Synthèse par frigo</h2>
        </div>
        {!stats.length ? (
          <Vide texte="Sélectionnez au moins un frigo." />
        ) : (
          <div className="tableau-zone">
            <table>
              <thead>
                <tr>
                  <th>Frigo</th><th>Seuils</th><th>Mesures</th><th>Moyenne</th>
                  <th>Mini</th><th>Maxi</th><th>Hors seuils</th><th>Conformité</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.frigo.id}>
                    <td>
                      <span
                        style={{
                          width: 10, height: 10, borderRadius: 3, background: s.couleur,
                          display: 'inline-block', marginRight: 7,
                        }}
                      />
                      {s.frigo.nom}
                    </td>
                    <td className="num tres-petit muet">
                      {temp(s.frigo.temp_min)} → {temp(s.frigo.temp_max)}
                    </td>
                    <td className="num">{s.n}</td>
                    <td className="num">{temp(s.moy)}</td>
                    <td className="num">{temp(s.min)}</td>
                    <td className="num">{temp(s.max)}</td>
                    <td className="num" style={{ color: s.nc ? etat.critique : undefined }}>{s.nc}</td>
                    <td className="num">
                      {s.taux === null ? '—' : (
                        <Etiquette type={s.taux >= 98 ? 'ok' : s.taux >= 90 ? 'att' : 'ko'}>
                          {s.taux} %
                        </Etiquette>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {stats.some((s) => s.nc > 0) && (
          <p className="tres-petit mt mb0" style={{ color: etat.alerte }}>
            <IcAlerte style={{ width: 13, height: 13, verticalAlign: '-2px' }} /> Des dépassements
            ont été enregistrés : pensez à documenter les actions correctives dans l’export Excel.
          </p>
        )}
      </div>
    </>
  )
}
