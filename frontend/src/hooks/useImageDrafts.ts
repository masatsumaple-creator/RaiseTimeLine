import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { validateImageFile } from '../validation/image'

/** 選んだ画像 1 枚。uploadedKey は、S3 へアップロード済みならそのキー(保存に失敗して再試行するとき、やり直さない)。 */
export interface DraftImage {
  id: number
  file: File
  /** プレビュー用の URL(使い終わったら解放される) */
  previewUrl: string
  uploadedKey?: string
  /** アップロードに失敗したときの文言 */
  error?: string
}

interface Options {
  /** 選べる最大の枚数 */
  max: number
  /** max を超えて選ぼうとしたときの文言(replace が true のときは使わない) */
  tooManyMessage: string
  /** true なら、1 枚だけ持ち、新しく選んだ画像で置き換える(アイコン用)。false なら、max 枚まで足していく(投稿用) */
  replace?: boolean
}

/**
 * 選んだ画像(まだ S3 へ送っていない下書き)の管理。投稿フォームとプロフィール編集で、共通に使う。
 * 画像を選ぶと、形式・大きさを検証してプレビュー用の URL を作り、取り除く・置き換える・まとめて消す・画面を離れるときに、
 * その URL を解放する(メモリを使い続けない)。画像は、選んだ時点ではどこにも送らない。
 */
export function useImageDrafts({ max, tooManyMessage, replace = false }: Options) {
  const [drafts, setDrafts] = useState<DraftImage[]>([])
  /** 画像を選んだとき(や、サーバーが画像を拒否したとき)の、エラー文言 */
  const [pickError, setPickError] = useState<string | null>(null)
  const nextId = useRef(1)
  // 最新の下書き。解放のときに、描画を待たずに、最新の内容を見られるようにする
  const draftsRef = useRef<DraftImage[]>([])

  const commit = useCallback((next: DraftImage[]) => {
    draftsRef.current = next
    setDrafts(next)
  }, [])

  useEffect(
    () => () => {
      draftsRef.current.forEach((d) => URL.revokeObjectURL(d.previewUrl))
    },
    [],
  )

  const addFiles = useCallback(
    (files: File[]) => {
      const current = draftsRef.current
      const added: DraftImage[] = []
      let problem: string | null = null
      for (const file of files) {
        if (!replace && current.length + added.length >= max) {
          problem = tooManyMessage
          break
        }
        const fileProblem = validateImageFile(file)
        if (fileProblem) {
          problem ??= fileProblem
          continue
        }
        added.push({ id: nextId.current++, file, previewUrl: URL.createObjectURL(file) })
        if (replace) break
      }
      setPickError(problem)
      if (added.length === 0) return
      if (replace) {
        current.forEach((d) => URL.revokeObjectURL(d.previewUrl))
        commit(added)
      } else {
        commit([...current, ...added])
      }
    },
    [max, tooManyMessage, replace, commit],
  )

  /** file の input の onChange に渡す。選んだ画像を足し、同じ画像を続けて選び直しても change が起きるよう、選択を空にする。 */
  const handlePick = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? [])
      event.target.value = ''
      if (files.length > 0) addFiles(files)
    },
    [addFiles],
  )

  /** 1 枚を取り除く。 */
  const remove = useCallback(
    (id: number) => {
      const current = draftsRef.current
      current.filter((d) => d.id === id).forEach((d) => URL.revokeObjectURL(d.previewUrl))
      commit(current.filter((d) => d.id !== id))
      setPickError(null)
    },
    [commit],
  )

  /** すべて取り除く(投稿できたあと・サーバーが画像を拒否したあとなど)。 */
  const clear = useCallback(() => {
    draftsRef.current.forEach((d) => URL.revokeObjectURL(d.previewUrl))
    commit([])
  }, [commit])

  /** 下書きの内容を書き換える(アップロードできたキー・失敗の印を、書き込むときなど)。プレビューは、触らない。 */
  const update = useCallback(
    (updater: (current: DraftImage[]) => DraftImage[]) => {
      commit(updater(draftsRef.current))
    },
    [commit],
  )

  return { drafts, pickError, setPickError, handlePick, addFiles, remove, clear, update }
}
