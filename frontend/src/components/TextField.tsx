import type { InputHTMLAttributes } from 'react'

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  id: string
  label: string
  hint?: string
  error?: string
}

/** ラベル・入力欄・ヒント・エラーをひとまとまりにした入力項目。 */
export function TextField({ id, label, hint, error, ...inputProps }: TextFieldProps) {
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')
  return (
    <div className="field">
      <label className="lbl" htmlFor={id}>
        {label}
      </label>
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy || undefined} {...inputProps} />
      {hint && (
        <span id={hintId} className="hint">
          {hint}
        </span>
      )}
      <p id={errorId} className="error" role="alert">
        {error}
      </p>
    </div>
  )
}
