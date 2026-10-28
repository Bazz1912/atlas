import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'

interface Props {
  title: string
  children: ReactNode
  onClose: () => void
  full?: boolean
  hidden?: boolean
}
export function Sheet({ title, children, onClose, full = false, hidden = false }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [expanded, setExpanded] = useState(full)
  const start = useRef(0)
  const drag = useRef(false)
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    const node = dialog.current!
    if (hidden) {
      node.close()
      return
    }
    const previous = document.activeElement as HTMLElement | null
    node.showModal()
    return () => {
      node.close()
      previous?.focus()
    }
  }, [hidden])
  return (
    <dialog
      ref={dialog}
      className={`sheet ${full ? 'full-sheet' : ''} ${expanded ? 'expanded' : ''}`}
      style={{ '--drag': `${offset}px` } as React.CSSProperties}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === dialog.current) {
          const bounds = dialog.current.getBoundingClientRect()
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            onClose()
        }
      }}
    >
      {!full && (
        <button
          className="sheet-handle"
          aria-label={expanded ? 'Riduci scheda' : 'Espandi scheda'}
          aria-expanded={expanded}
          onPointerDown={(event) => {
            drag.current = false
            start.current = event.clientY
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
            const distance = event.clientY - start.current
            if (Math.abs(distance) > 8) drag.current = true
            setOffset(Math.max(-60, Math.min(180, distance)))
          }}
          onPointerUp={(event) => {
            const distance = event.clientY - start.current
            if (distance < -40) setExpanded(true)
            else if (distance > 100 && !expanded) onClose()
            else if (distance > 40) setExpanded(false)
            setOffset(0)
          }}
          onPointerCancel={() => setOffset(0)}
          onClick={() => {
            if (!drag.current) setExpanded((value) => !value)
          }}
        >
          <span />
          {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      )}
      <div className="sheet-header">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Chiudi">
          <X size={20} />
        </button>
      </div>
      <div className="sheet-content">{children}</div>
    </dialog>
  )
}
