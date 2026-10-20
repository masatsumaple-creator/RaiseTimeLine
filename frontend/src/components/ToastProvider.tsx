import { useCallback, useState, type ReactNode } from 'react'
import { ToastContext } from './toast'

const TOAST_MS = 2600

interface ToastItem {
  id: number
  message: string
}

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const show = useCallback((message: string) => {
    const id = nextId++
    setToasts((current) => [...current, { id, message }])
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), TOAST_MS)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
