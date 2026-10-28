import { useEffect, useState } from 'react'
import { Sheet } from '../components/Sheet'
import { useAccount, type Profile } from './AccountGate'
import { backend, rpc } from './client'
import { authMessage, normalizeUsername, validPassword } from './validation'
import { PasswordChecklist } from './AuthScreen'
import { InstallAtlas } from './InstallAtlas'
import { LegacyImport } from './LegacyImport'
interface Request {
  id: string
  sender_id: string
  recipient_id: string
  status: string
  created_at: string
}
export function AccountPanel({ onClose }: { onClose: () => void }) {
  const a = useAccount()!
  const [tab, setTab] = useState<'profile' | 'friends' | 'maps'>('profile'),
    [name, setName] = useState(a.profile.display_name),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [oldPassword, setOldPassword] = useState(''),
    [query, setQuery] = useState(''),
    [results, setResults] = useState<Profile[]>([]),
    [requests, setRequests] = useState<Request[]>([]),
    [people, setPeople] = useState<Profile[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [mapName, setMapName] = useState(a.map.name),
    [leaving, setLeaving] = useState(false)
  const run = async (action: () => Promise<unknown>, success = 'Operazione completata') => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      setNotice(success)
    } catch (e) {
      setError(authMessage(e instanceof Error ? e.message : 'Operazione non riuscita.'))
    } finally {
      setBusy(false)
    }
  }
  const refreshRequests = async () => {
    const { data, error } = await backend()
      .from('atlas_connection_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error
    setRequests(data)
    const ids = [...new Set(data.flatMap((r) => [r.sender_id, r.recipient_id]))]
    if (ids.length) {
      const { data: profiles, error } = await backend()
        .from('atlas_profiles')
        .select('*')
        .in('id', ids)
      if (error) throw error
      setPeople(profiles as Profile[])
    }
  }
  useEffect(() => {
    let stop = false
    const update = () => {
      if (!stop && navigator.onLine) void refreshRequests().catch((e) => setError(e.message))
    }
    update()
    const timer = setInterval(update, 30000)
    return () => {
      stop = true
      clearInterval(timer)
    }
  }, [])
  useEffect(() => {
    setResults([])
    const q = normalizeUsername(query)
    if (q.length < 3) return
    let stop = false
    const timer = setTimeout(() => {
      void rpc<Profile[]>('atlas_search_users', { q })
        .then((r) => {
          if (!stop) setResults(r)
        })
        .catch((e) => {
          if (!stop) setError(e.message)
        })
    }, 400)
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [query])
  const respond = (id: string, decision: string) =>
    run(
      async () => {
        await rpc('atlas_respond_request', { request_id: id, decision })
        await refreshRequests()
        await a.refresh()
      },
      decision === 'accepted'
        ? 'Connessione accettata. La nuova mappa vuota è nel selettore.'
        : 'Richiesta aggiornata.',
    )
  const person = (id: string) => people.find((p) => p.id === id)
  return (
    <Sheet title="Il tuo spazio" full onClose={onClose}>
      <div className="account-content">
        <nav className="account-tabs" aria-label="Gestione account">
          <button aria-pressed={tab === 'profile'} onClick={() => setTab('profile')}>
            Profilo
          </button>
          <button aria-pressed={tab === 'friends'} onClick={() => setTab('friends')}>
            Amici e richieste
          </button>
          <button aria-pressed={tab === 'maps'} onClick={() => setTab('maps')}>
            Mappe
          </button>
        </nav>
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
        {tab === 'profile' && (
          <>
            <h3 className="review-author">
              {a.members.find((p) => p.id === a.profile.id)?.avatarUrl && (
                <img
                  src={a.members.find((p) => p.id === a.profile.id)!.avatarUrl}
                  alt="Il tuo avatar"
                />
              )}
              @{a.profile.username}
            </h3>
            <p className="field-help">Username immutabile. La tua email è privata.</p>
            <label className="field-label">
              Nome visualizzato
              <input maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <button
              className="primary-button"
              disabled={busy || !name.trim()}
              onClick={() =>
                void run(async () => {
                  const { error } = await backend()
                    .from('atlas_profiles')
                    .update({ display_name: name.trim() })
                    .eq('id', a.profile.id)
                  if (error) throw error
                  await a.refresh()
                }, 'Profilo aggiornato')
              }
            >
              Salva profilo
            </button>
            <label className="field-label">
              Avatar facoltativo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  void run(async () => {
                    if (
                      file.size > 2 * 1024 * 1024 ||
                      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
                    )
                      throw new Error('Scegli JPG, PNG o WebP, massimo 2 MB.')
                    const path = `${a.profile.id}/${crypto.randomUUID()}`
                    const { error } = await backend()
                      .storage.from('atlas-avatars')
                      .upload(path, file, { contentType: file.type, cacheControl: '0' })
                    if (error) throw error
                    const { error: pe } = await backend()
                      .from('atlas_profiles')
                      .update({ avatar_path: path })
                      .eq('id', a.profile.id)
                    if (pe) throw pe
                    await a.refresh()
                  }, 'Avatar aggiornato')
                }}
              />
            </label>
            <details className="account-card">
              <summary>Modifica password</summary>
              <label className="field-label">
                Password attuale
                <input
                  type="password"
                  autoComplete="current-password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                />
              </label>
              <label className="field-label">
                Nuova password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <PasswordChecklist password={password} />
              <label className="field-label">
                Conferma nuova password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (!validPassword(password) || password !== confirm)
                      throw new Error('Password non valida o conferma diversa.')
                    const { error } = await backend().auth.updateUser({
                      password,
                      current_password: oldPassword,
                    })
                    if (error) throw error
                    setPassword('')
                    setConfirm('')
                    setOldPassword('')
                  }, 'Password aggiornata')
                }
              >
                Aggiorna password
              </button>
            </details>
            <InstallAtlas />
            <button
              className="danger-button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const { error } = await backend().auth.signOut()
                  if (error) throw error
                })
              }
            >
              Esci dall’account
            </button>
          </>
        )}
        {tab === 'friends' && (
          <>
            <h3>Trova una persona</h3>
            <label className="field-label">
              Cerca per @username
              <input
                autoCapitalize="none"
                maxLength={21}
                value={query}
                onChange={(e) => setQuery(normalizeUsername(e.target.value))}
              />
              <small>Almeno 3 caratteri · massimo 10 risultati</small>
            </label>
            {results.map((p) => (
              <article className="person-row" key={p.id}>
                <div>
                  <strong>{p.display_name}</strong>
                  <small>@{p.username}</small>
                </div>
                <button
                  className="secondary-button"
                  disabled={
                    busy ||
                    requests.some(
                      (r) => r.status === 'pending' && [r.sender_id, r.recipient_id].includes(p.id),
                    )
                  }
                  onClick={() =>
                    void run(async () => {
                      await rpc('atlas_send_request', { recipient: p.id })
                      await refreshRequests()
                    }, 'Richiesta inviata')
                  }
                >
                  Invia richiesta
                </button>
              </article>
            ))}
            {query.length >= 3 && !results.length && (
              <p className="field-help">Nessun risultato da mostrare.</p>
            )}
            <h3>Richieste ricevute e inviate</h3>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void run(refreshRequests, 'Richieste aggiornate')}
            >
              Aggiorna richieste
            </button>
            {!requests.length && <p>Le richieste compariranno qui.</p>}
            {requests.map((r) => (
              <article className="account-card" key={r.id}>
                <strong>
                  {r.recipient_id === a.profile.id ? 'Da' : 'A'}{' '}
                  {person(r.recipient_id === a.profile.id ? r.sender_id : r.recipient_id)
                    ?.display_name || 'Utente'}
                </strong>
                <p>
                  @
                  {person(r.recipient_id === a.profile.id ? r.sender_id : r.recipient_id)?.username}{' '}
                  ·{' '}
                  {{
                    pending: 'In attesa',
                    accepted: 'Accettata',
                    rejected: 'Rifiutata',
                    cancelled: 'Annullata',
                  }[r.status] || r.status}
                </p>
                {r.status === 'pending' &&
                  (r.recipient_id === a.profile.id ? (
                    <div className="account-actions">
                      <button
                        disabled={busy}
                        className="primary-button"
                        onClick={() => void respond(r.id, 'accepted')}
                      >
                        Accetta
                      </button>
                      <button
                        disabled={busy}
                        className="secondary-button"
                        onClick={() => void respond(r.id, 'rejected')}
                      >
                        Rifiuta
                      </button>
                    </div>
                  ) : (
                    <button
                      disabled={busy}
                      className="text-button"
                      onClick={() => void respond(r.id, 'cancelled')}
                    >
                      Annulla richiesta
                    </button>
                  ))}
              </article>
            ))}
          </>
        )}
        {tab === 'maps' && (
          <>
            <h3>Le tue mappe</h3>
            {a.maps.map((m) => (
              <button
                key={m.id}
                className="map-option"
                aria-pressed={a.map.id === m.id}
                onClick={() => {
                  a.select(m.id)
                  onClose()
                }}
              >
                <strong>{m.name}</strong>
                <small>{m.type === 'personal' ? 'Personale' : 'Condivisa'}</small>
              </button>
            ))}
            <section className="account-card">
              <h3>{a.map.name}</h3>
              <label className="field-label">
                Nome della mappa
                <input
                  maxLength={100}
                  value={mapName}
                  onChange={(e) => setMapName(e.target.value)}
                />
              </label>
              <button
                className="secondary-button"
                disabled={busy || !mapName.trim()}
                onClick={() =>
                  void run(async () => {
                    await rpc('atlas_manage_map', { target: a.map.id, new_name: mapName })
                    await a.refresh()
                  }, 'Nome aggiornato')
                }
              >
                Rinomina
              </button>
              <h4>Membri</h4>
              {a.members.map((p) => (
                <div className="person-row" key={p.id}>
                  {p.avatarUrl ? (
                    <img src={p.avatarUrl} alt="" />
                  ) : (
                    <span className="avatar-initial">{p.display_name.slice(0, 1)}</span>
                  )}
                  <div>
                    <strong>{p.display_name}</strong>
                    <small>@{p.username}</small>
                  </div>
                </div>
              ))}
              {a.map.type === 'shared' &&
                (leaving ? (
                  <>
                    <p>
                      Abbandonare questa mappa? Perderai l’accesso ai suoi luoghi. La mappa
                      personale rimane invariata. L’uscita non è annullabile dall’app.
                    </p>
                    <button
                      className="danger-button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await rpc('atlas_manage_map', { target: a.map.id, leave_map: true })
                          await a.refresh()
                          onClose()
                        })
                      }
                    >
                      Conferma uscita
                    </button>
                    <button className="text-button" onClick={() => setLeaving(false)}>
                      Resta nella mappa
                    </button>
                  </>
                ) : (
                  <button className="text-button" onClick={() => setLeaving(true)}>
                    Abbandona mappa condivisa
                  </button>
                ))}
            </section>
            <LegacyImport
              onImported={async () => {
                await a.refresh()
                window.dispatchEvent(new Event('focus'))
              }}
            />
          </>
        )}
      </div>
    </Sheet>
  )
}
