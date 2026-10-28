import { useEffect, useState } from 'react'
interface InstallEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: string }>
}
export function InstallAtlas() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null),
    [installed, setInstalled] = useState(false),
    [note, setNote] = useState('')
  useEffect(() => {
    const media = matchMedia('(display-mode: standalone)')
    const update = () =>
      setInstalled(
        media.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone,
      )
    update()
    const capture = (e: Event) => {
      e.preventDefault()
      setPrompt(e as InstallEvent)
    }
    const done = () => {
      setInstalled(true)
      setPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', capture)
    window.addEventListener('appinstalled', done)
    media.addEventListener('change', update)
    return () => {
      window.removeEventListener('beforeinstallprompt', capture)
      window.removeEventListener('appinstalled', done)
      media.removeEventListener('change', update)
    }
  }, [])
  return (
    <section className="account-card">
      <h3>Installa ATLAS</h3>
      {installed ? (
        <p>ATLAS è aperta come app.</p>
      ) : (
        <>
          <p>
            <strong>iPhone · Safari</strong>
            <br />
            Apri il sito in Safari, tocca Condividi, poi “Aggiungi alla schermata Home” e
            “Aggiungi”.
          </p>
          <p>
            <strong>Android · Chrome</strong>
            <br />
            Apri il menu ⋮ e scegli “Installa app” o “Aggiungi a schermata Home”.
          </p>
          {prompt && (
            <button
              className="primary-button"
              onClick={() => {
                void prompt
                  .prompt()
                  .then(() => prompt.userChoice)
                  .then((c) => {
                    setNote(
                      c.outcome === 'accepted'
                        ? 'Installazione richiesta al browser.'
                        : 'Puoi installare ATLAS più tardi.',
                    )
                    setPrompt(null)
                  })
                  .catch(() => setNote('Usa il menu del browser per installare ATLAS.'))
              }}
            >
              Installa ATLAS
            </button>
          )}
        </>
      )}
      <p className="field-help">
        L’installazione richiede HTTPS e non rende disponibili offline mappa, sincronizzazione, AI o
        percorsi. La schermata di accesso può aprirsi offline se già memorizzata.
      </p>
      {note && <p role="status">{note}</p>}
    </section>
  )
}
export function OfflineStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online ? null : (
    <div className="offline-banner" role="status">
      Sei offline. Accesso e salvataggio cloud non disponibili; la mappa può essere incompleta.
      Riconnettiti per aggiornare i dati.
    </div>
  )
}
