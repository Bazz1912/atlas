import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import App from '../App'
import { AuthScreen } from './AuthScreen'
import { backend, supabase } from './client'
import { setScope } from './scope'
import { OfflineStatus } from './InstallAtlas'
import { PwaLifecycle } from './PwaLifecycle'
import { AccountPanel } from './AccountPanel'
import { MapTopBar } from '../components/MapTopBar'
export interface Profile {
  id: string
  display_name: string
  username: string
  avatar_path: string | null
  avatarUrl?: string
  created_at: string
}
export interface AtlasMap {
  id: string
  name: string
  type: 'personal' | 'shared'
  created_by: string
}
interface AccountContextValue {
  profile: Profile
  maps: AtlasMap[]
  map: AtlasMap
  members: Profile[]
  select: (id: string) => void
  refresh: () => Promise<void>
  open: () => void
}
const Context = createContext<AccountContextValue | null>(null)
export const useAccount = () => useContext(Context)
export function MapSelector() {
  const a = useAccount()
  if (!a) return null
  return (
    <MapTopBar
      maps={a.maps}
      selectedId={a.map.id}
      displayName={a.profile.display_name || a.profile.username}
      onSelect={a.select}
      onProfile={a.open}
    />
  )
}
function Workspace({ session }: { session: Session }) {
  const [data, setData] = useState<{ profile: Profile; maps: AtlasMap[] } | null>(null),
    [selected, setSelected] = useState(''),
    [members, setMembers] = useState<Profile[]>([]),
    [error, setError] = useState(''),
    [panel, setPanel] = useState(false),
    [generation, setGeneration] = useState(0),
    [memberRetry, setMemberRetry] = useState(0)
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
      setScope(null)
    }
  }, [])
  const refresh = async () => {
    const client = backend()
    const [{ data: p, error: pe }, { data: maps, error: me }] = await Promise.all([
      client.from('atlas_profiles').select('*').eq('id', session.user.id).single(),
      client.from('atlas_maps').select('*').order('created_at'),
    ])
    if (pe || me) throw new Error(pe?.message || me?.message)
    if (!live.current) return
    setData({ profile: p as Profile, maps: maps as AtlasMap[] })
    setSelected((old) =>
      maps?.some((m) => m.id === old) ? old : maps?.find((m) => m.type === 'personal')?.id || '',
    )
    setError('')
  }
  useEffect(() => {
    void refresh().catch((e) => {
      if (live.current) setError(e.message)
    })
    // Polling + focus fallback: no subscription needed for private profile/search data.
    const update = () => {
      if (navigator.onLine && document.visibilityState === 'visible')
        void refresh().catch((e) => setError(e.message))
    }
    const timer = setInterval(update, 30000)
    window.addEventListener('focus', update)
    window.addEventListener('online', update)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', update)
      window.removeEventListener('online', update)
    }
    // Session identity is fixed by the parent key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const channel = backend().channel('account:' + session.user.id)
    for (const column of ['sender_id', 'recipient_id'])
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'atlas_connection_requests',
          filter: column + '=eq.' + session.user.id,
        },
        () => {
          void refresh().catch((e) => setError(e.message))
        },
      )
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'atlas_map_members',
        filter: 'user_id=eq.' + session.user.id,
      },
      () => {
        void refresh().catch((e) => setError(e.message))
      },
    )
    channel.subscribe()
    return () => {
      void backend().removeChannel(channel)
    }
  }, [session.user.id])
  const map = data?.maps.find((m) => m.id === selected)
  useEffect(() => {
    setScope(null)
    setMembers([])
    if (!map) return
    let cancelled = false
    void Promise.resolve(backend().from('atlas_map_members').select('user_id').eq('map_id', map.id))
      .then(async ({ data: rows, error }) => {
        if (error) throw error
        const { data: profiles, error: err } = await backend()
          .from('atlas_profiles')
          .select('*')
          .in(
            'id',
            rows!.map((r) => r.user_id),
          )
        if (err) throw err
        const results = await Promise.all(
          (profiles as Profile[]).map(async (p) => {
            if (!p.avatar_path) return p
            const { data } = await backend()
              .storage.from('atlas-avatars')
              .createSignedUrl(p.avatar_path, 900)
            return { ...p, avatarUrl: data?.signedUrl }
          }),
        )
        if (!cancelled) {
          setScope({ mapId: map.id, userId: session.user.id })
          setMembers(results)
          setGeneration((g) => g + 1)
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
      setScope(null)
    }
  }, [map?.id, session.user.id, memberRetry, data?.profile.avatar_path, data?.profile.display_name])
  const select = (id: string) => {
    if (id === selected || !data?.maps.some((m) => m.id === id)) return
    setScope(null)
    setMembers([])
    setSelected(id)
  }
  return (
    <>
      {error && (
        <div className="account-load-error" role="alert">
          {error}{' '}
          <button
            onClick={() => {
              setMemberRetry((n) => n + 1)
              void refresh().catch((e) => setError(e.message))
            }}
          >
            Riprova
          </button>
          <button onClick={() => void backend().auth.signOut()}>Esci</button>
        </div>
      )}
      {data && map && members.length ? (
        <Context.Provider
          value={{
            profile: data.profile,
            maps: data.maps,
            map,
            members,
            select,
            refresh,
            open: () => setPanel(true),
          }}
        >
          <App key={`${session.user.id}:${map.id}:${generation}`} />
          {panel && <AccountPanel onClose={() => setPanel(false)} />}
        </Context.Provider>
      ) : (
        <main className="auth-layout">
          <section className="auth-panel">
            <h1>Apriamo il tuo mondo…</h1>
            <p>Caricamento sicuro di profilo e mappe.</p>
          </section>
        </main>
      )}
    </>
  )
}
export default function AccountGate() {
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(!supabase),
    [recovery, setRecovery] = useState(false),
    [error, setError] = useState('')
  useEffect(() => {
    if (!supabase) return
    let live = true
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      if (!live) return
      if (event === 'SIGNED_OUT') setScope(null)
      setSession(s)
      setReady(true)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') setRecovery(false)
    })
    void supabase.auth.getSession().then(({ data, error }) => {
      if (live) {
        setSession(data.session)
        setReady(true)
        if (error) setError(error.message)
      }
    })
    return () => {
      live = false
      subscription.unsubscribe()
      setScope(null)
    }
  }, [])
  return (
    <>
      <PwaLifecycle />
      <OfflineStatus />
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {!ready ? (
        <main className="auth-layout">
          <p>Verifica della sessione…</p>
        </main>
      ) : recovery && session ? (
        <AuthScreen
          recovery
          onRecovered={() => {
            setRecovery(false)
            history.replaceState(
              null,
              '',
              new URL(import.meta.env.BASE_URL, location.origin).pathname,
            )
          }}
        />
      ) : session ? (
        <Workspace key={session.user.id} session={session} />
      ) : (
        <AuthScreen />
      )}
    </>
  )
}
