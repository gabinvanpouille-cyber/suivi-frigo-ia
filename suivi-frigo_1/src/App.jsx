import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import { Chargement } from './components/Ui'

const Connexion     = lazy(() => import('./pages/Connexion'))
const Accueil       = lazy(() => import('./pages/Accueil'))
const ReleveForm    = lazy(() => import('./pages/ReleveForm'))
const Historique    = lazy(() => import('./pages/Historique'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Reglages      = lazy(() => import('./pages/Reglages'))
const AdminAccueil  = lazy(() => import('./pages/AdminAccueil'))
const AdminReleves  = lazy(() => import('./pages/AdminReleves'))
const AdminCourbes  = lazy(() => import('./pages/AdminCourbes'))
const AdminGestion  = lazy(() => import('./pages/AdminGestion'))

/** Route protégée : redirige vers la connexion si nécessaire. */
function Protegee({ children, adminRequis = false }) {
  const { session, profil, chargement, estAdmin } = useAuth()
  const location = useLocation()

  if (chargement) return <Chargement />
  if (!session || !profil) return <Navigate to="/connexion" state={{ de: location.pathname }} replace />
  if (adminRequis && !estAdmin) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const { session, profil, chargement, estAdmin } = useAuth()

  if (chargement) return <Chargement texte="Ouverture de SUIVI FRIGO…" />

  return (
    <Suspense fallback={<Chargement />}>
      <Routes>
        <Route
          path="/connexion"
          element={
            session && profil
              ? <Navigate to={estAdmin ? '/admin' : '/'} replace />
              : <Connexion />
          }
        />

        <Route element={<Protegee><Layout /></Protegee>}>
          {/* Espace salarié (accessible aussi aux administrateurs) */}
          <Route index element={estAdmin ? <Navigate to="/admin" replace /> : <Accueil />} />
          <Route path="/releve/nouveau" element={<ReleveForm />} />
          <Route path="/releve/:id" element={<ReleveForm />} />
          <Route path="/courbes" element={<AdminCourbes />} />
          <Route path="/historique" element={<Historique />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/reglages" element={<Reglages />} />

          {/* Espace administrateur */}
          <Route path="/admin" element={<Protegee adminRequis><AdminAccueil /></Protegee>} />
          <Route path="/admin/releves" element={<Protegee adminRequis><AdminReleves /></Protegee>} />
          <Route path="/admin/courbes" element={<Protegee adminRequis><AdminCourbes /></Protegee>} />
          <Route path="/admin/gestion" element={<Protegee adminRequis><AdminGestion /></Protegee>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
