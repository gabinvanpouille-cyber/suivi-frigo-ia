import { useEffect, useState } from 'react'

/** Suit le thème du système pour colorer les graphiques en conséquence. */
export function useThemeSombre() {
  const [sombre, setSombre] = useState(
    () => typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches
  )

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const suivre = (e) => setSombre(e.matches)
    mq.addEventListener?.('change', suivre)
    return () => mq.removeEventListener?.('change', suivre)
  }, [])

  return sombre
}
