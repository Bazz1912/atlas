import { useRegisterSW } from 'virtual:pwa-register/react'
export function PwaLifecycle() {
  const {
    needRefresh: [refresh, setRefresh],
    updateServiceWorker,
  } = useRegisterSW()
  return refresh ? (
    <div className="update-banner glass" role="status">
      <span>Nuova versione di ATLAS. Salva le modifiche prima di aggiornare.</span>
      <button className="text-button" onClick={() => void updateServiceWorker(true)}>
        Aggiorna
      </button>
      <button className="text-button" onClick={() => setRefresh(false)}>
        Più tardi
      </button>
    </div>
  ) : null
}
