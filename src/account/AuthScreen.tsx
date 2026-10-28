import { useEffect, useRef, useState } from 'react'
import { Navigation } from 'lucide-react'
import { authConfigured, backend, redirectUrl } from './client'
import {
  authMessage,
  normalizeUsername,
  passwordRules,
  validPassword,
  validUsername,
} from './validation'
import { InstallAtlas } from './InstallAtlas'
export function PasswordChecklist({ password }: { password: string }) {
  const labels = [
    'Almeno 8 caratteri',
    'Una lettera maiuscola',
    'Un carattere speciale',
    'Una lettera minuscola',
    'Un numero',
  ]
  return (
    <ul className="password-rules">
      {passwordRules(password).map((ok, i) => (
        <li key={labels[i]} className={ok ? 'satisfied' : ''}>
          {ok ? '✓' : '○'} {labels[i]}
        </li>
      ))}
    </ul>
  )
}
export function AuthScreen({
  recovery = false,
  onRecovered,
}: {
  recovery?: boolean
  onRecovered?: () => void
}) {
  const [view, setView] = useState<'login' | 'signup' | 'reset'>('login'),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [name, setName] = useState(''),
    [username, setUsername] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const screen = useRef<HTMLElement>(null)
  useEffect(() => {
    screen.current?.scrollTo({ top: 0 })
    setPassword('')
    setConfirm('')
  }, [view, recovery])
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      if (!authConfigured)
        throw new Error(
          'Accesso non ancora disponibile: configura Supabase. I dati locali esistenti sono conservati.',
        )
      if (recovery || view === 'signup') {
        if (!validPassword(password)) throw new Error('Completa tutti i requisiti della password.')
        if (password !== confirm) throw new Error('Le password non coincidono.')
      }
      if (recovery) {
        const { error } = await backend().auth.updateUser({ password })
        if (error) throw error
        setPassword('')
        setConfirm('')
        onRecovered?.()
      } else if (view === 'signup') {
        if (!validUsername(username))
          throw new Error('Username: da 3 a 20 lettere minuscole, numeri o underscore.')
        const { data, error } = await backend().auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl(),
            data: { display_name: name.trim(), username: normalizeUsername(username) },
          },
        })
        if (error) throw error
        if (data.user?.identities?.length === 0)
          setNotice('Se questa email è già registrata, accedi o recupera la password.')
        else if (!data.session)
          setNotice('Controlla la tua email e conferma l’account prima di accedere.')
        setPassword('')
        setConfirm('')
      } else if (view === 'login') {
        const { error } = await backend().auth.signInWithPassword({ email, password })
        if (error) throw error
        setPassword('')
      } else {
        const { error } = await backend().auth.resetPasswordForEmail(email, {
          redirectTo: redirectUrl() + '?recovery=1',
        })
        if (error) throw error
        setNotice(
          'Se l’indirizzo è registrato, riceverai un link per scegliere una nuova password.',
        )
      }
    } catch (err) {
      setError(authMessage(err instanceof Error ? err.message : 'Operazione non riuscita.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="auth-layout" ref={screen}>
      <section className="auth-panel">
        <div className="auth-brand">
          <Navigation /> ATLAS
        </div>
        <span className="eyebrow">Il tuo mondo, da vivere</span>
        <h1>
          {recovery
            ? 'Una nuova password'
            : view === 'signup'
              ? 'Il viaggio comincia qui'
              : view === 'reset'
                ? 'Ritrova il tuo accesso'
                : 'Bentornato nel tuo mondo'}
        </h1>
        <p>
          {view === 'signup'
            ? 'Crea il tuo account e una mappa tutta tua.'
            : 'I tuoi posti, i tuoi ricordi e le persone con cui condividerli.'}
        </p>
        {!authConfigured && (
          <p className="configuration-note" role="status">
            Account e mappe condivise sono pronti per la configurazione. Supabase non è ancora
            collegato: non è possibile registrarsi o accedere. I tuoi dati locali sono conservati e
            non vengono importati automaticamente.
          </p>
        )}
        <form onSubmit={(e) => void submit(e)}>
          {view === 'signup' && !recovery && (
            <>
              <label className="field-label">
                Nome visualizzato
                <input
                  required
                  maxLength={80}
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="field-label">
                Username
                <span className="username-input">
                  @
                  <input
                    required
                    autoCapitalize="none"
                    autoComplete="username"
                    maxLength={21}
                    value={username}
                    onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                  />
                </span>
                <small>
                  3–20 lettere, numeri o underscore. La disponibilità viene confermata dal database
                  durante la registrazione.
                </small>
              </label>
            </>
          )}
          {!recovery && (
            <label className="field-label">
              Email
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {(recovery || view !== 'reset') && (
            <label className="field-label">
              Password
              <input
                required
                type="password"
                autoComplete={recovery || view === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {(recovery || view === 'signup') && (
            <>
              <PasswordChecklist password={password} />
              <label className="field-label">
                Conferma password
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
              <small>Usiamo anche minuscole e un numero per la policy server Supabase.</small>
            </>
          )}
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="success-note" role="status">
              {notice}
            </p>
          )}
          <button className="primary-button" disabled={busy || !authConfigured}>
            {busy
              ? 'Un momento…'
              : recovery
                ? 'Salva nuova password'
                : view === 'signup'
                  ? 'Crea account'
                  : view === 'reset'
                    ? 'Invia link di recupero'
                    : 'Accedi'}
          </button>
        </form>
        {!recovery && (
          <nav className="auth-links" aria-label="Accesso account">
            {view !== 'login' && (
              <button
                className="text-button"
                onClick={() => {
                  setView('login')
                  setError('')
                  setNotice('')
                }}
              >
                Hai un account? Accedi
              </button>
            )}
            {view !== 'signup' && (
              <button
                className="text-button"
                onClick={() => {
                  setView('signup')
                  setError('')
                  setNotice('')
                }}
              >
                Crea un account
              </button>
            )}
            {view === 'login' && (
              <button
                className="text-button"
                onClick={() => {
                  setView('reset')
                  setError('')
                  setNotice('')
                }}
              >
                Password dimenticata?
              </button>
            )}
          </nav>
        )}
        <InstallAtlas />
      </section>
    </main>
  )
}
