import { ShieldX } from 'lucide-react'
import './CopyAgentButton.css'

export function CopyAgentButton() {
  return (
    <div className="copy-agent">
      <button type="button" disabled aria-disabled="true">
        <ShieldX size={15} /> Скопировать агенту
      </button>
      <small role="status">
        Внешнее подключение временно недоступно до защищённого персонального
        выпуска и отзыва доступа.
      </small>
    </div>
  )
}

export default CopyAgentButton
