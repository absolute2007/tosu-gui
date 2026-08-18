import { useEffect } from 'react'
import { Check, AlertCircle } from 'lucide-react'

interface Props {
  message: string
  type: 'success' | 'error'
  onClose: () => void
}

export function Toast({ message, type, onClose }: Props) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className={`toast -${type}`} role="alert" onClick={onClose}>
      {type === 'success' ? (
        <Check size={15} strokeWidth={2.2} className="toast-icon" />
      ) : (
        <AlertCircle size={15} strokeWidth={2.2} className="toast-icon" />
      )}
      <span className="toast-text">{message}</span>
    </div>
  )
}