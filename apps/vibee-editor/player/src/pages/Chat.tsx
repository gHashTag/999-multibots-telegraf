import { Header } from '@/components/Header'
import { AgentControlCenter } from '@/components/Agent/AgentControlCenter'
import './Chat.css'

/**
 * SAFE BETA Agent surface.
 *
 * The former free-form chat called an external model provider before a tool
 * was selected. That is a paid external action, so a runtime prompt or quota
 * check is not a sufficient release boundary. The compiled beta exposes the
 * useful owner-scoped actions directly through the live MCP registry and
 * leaves model chat visibly disabled. Re-enabling it requires a reviewed
 * capability, price disclosure and an owner approval flow.
 */
function ChatPage() {
  return (
    <div className="chat-page">
      <Header />

      <div className="chat-title">
        <div className="chat-title__text">
          <h1>Агент</h1>
          <p>
            SAFE BETA: профиль владельца, статистика и черновик контент-плана
          </p>
        </div>
      </div>

      <AgentControlCenter compact />

      <div className="chat-container">
        <div className="chat-messages">
          <div className="message agent">
            <div
              className="message-content chat-model-lock"
              role="status"
              id="safe-beta-chat-lock"
            >
              Свободный модельный чат временно выключен: он может расходовать
              платный провайдер. Используйте подтверждённые кнопки выше — они
              читают только ваш профиль и статистику либо сохраняют только
              черновик.
            </div>
          </div>
        </div>
      </div>

      <div className="chat-input-area">
        <div className="chat-input-container">
          <input
            type="text"
            className="chat-input"
            placeholder="Модельный чат недоступен в SAFE BETA"
            disabled
            aria-describedby="safe-beta-chat-lock"
          />
          <button className="send-btn" type="button" disabled>
            Выключен
          </button>
        </div>
      </div>
    </div>
  )
}

export default ChatPage
