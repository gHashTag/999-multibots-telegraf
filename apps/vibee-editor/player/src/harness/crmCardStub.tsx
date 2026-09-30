import { useNavigate } from 'react-router-dom'

/*
 * A stand-in for the card: enough to leave the list and come Back to it,
 * which is what the list has to survive (the real card has its own harness).
 */
export function CrmCardStub() {
  const navigate = useNavigate()
  return (
    <button className="harness-back" onClick={() => navigate(-1)}>
      ← back
    </button>
  )
}
