import { createContext, useContext } from 'react'

export const ToastContext = createContext<((message: string) => void) | null>(null)

/** 画面下に数秒だけメッセージを出す関数を返す。 */
export function useToast(): (message: string) => void {
  const show = useContext(ToastContext)
  if (!show) throw new Error('useToast は ToastProvider の中で使ってください')
  return show
}
