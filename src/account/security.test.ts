/// <reference types="node" />
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
const db = new PGlite()
const alice = '10000000-0000-4000-8000-000000000001',
  bob = '10000000-0000-4000-8000-000000000002',
  eve = '10000000-0000-4000-8000-000000000003'
let personal = '',
  shared = '',
  request = '',
  experience = '20000000-0000-4000-8000-000000000001'
async function as<T>(uid: string, sql: string, args: unknown[] = []) {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`,
  )
  try {
    return await db.query<T>(sql, args)
  } finally {
    await db.exec('reset role')
  }
}
async function map(uid: string) {
  const r = await as<{ id: string }>(uid, "select id from public.atlas_maps where type='personal'")
  return r.rows[0]!.id
}
const data = () => ({
  id: experience,
  title: 'TEST SQL',
  description: '',
  category: 'Food',
  status: 'DONE',
  priority: null,
  environment: 'MIXED',
  address: 'Punto test',
  latitude: 45,
  longitude: 9,
  imagePath: null,
  imageUrl: null,
})
beforeAll(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,storage to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 create table auth.users(id uuid primary key,is_anonymous boolean default false,raw_user_meta_data jsonb not null);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text,name text);alter table storage.objects enable row level security;
 grant select,insert,update,delete on storage.objects to authenticated;
 create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;`)
  const migration = readFileSync(
    new URL('../../supabase/migrations/202610260001_multiuser.sql', import.meta.url),
    'utf8',
  )
  // Bucket pubblico preesistente: l'intera migrazione deve fermarsi e annullarsi.
  await db.exec(
    "insert into storage.buckets(id,name,public) values('atlas-images','atlas-images',true)",
  )
  await expect(db.exec(migration)).rejects.toThrow(/bucket ATLAS esistente è pubblico/)
  await db.exec('rollback')
  expect(
    (
      await db.query<{ relation: string | null }>(
        "select to_regclass('public.atlas_maps')::text relation",
      )
    ).rows[0]!.relation,
  ).toBeNull()
  await db.exec("delete from storage.buckets where id='atlas-images'")
  await db.exec(migration)
  await db.exec(
    readFileSync(
      new URL('../../supabase/migrations/202610260002_ai_explorer.sql', import.meta.url),
      'utf8',
    ),
  )
  await db.exec(
    readFileSync(
      new URL('../../supabase/migrations/202610260003_trip_costs.sql', import.meta.url),
      'utf8',
    ),
  )
  for (const [id, name] of [
    [alice, 'alice'],
    [bob, 'bob'],
    [eve, 'eve'],
  ])
    await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)', [
      id,
      JSON.stringify({ display_name: name, username: name }),
    ])
  personal = await map(alice)
}, 60000)
afterAll(async () => {
  await db.close()
})
describe('PostgreSQL locale: schema, RPC e RLS reali (Auth/Storage simulati solo nel test)', () => {
  it('copre tutte le tabelle, RPC, trigger e FK previsti e ne verifica permessi e RLS', async () => {
    const sql = readFileSync(
      new URL('../../supabase/checks/verify_multiuser.sql', import.meta.url),
      'utf8',
    )
    const checks = await db.exec(sql)
    const rows = checks.flatMap((result) => result.rows) as { component: string; ok: boolean }[]
    expect(rows.length).toBe(61)
    expect(rows.filter((row) => !row.ok)).toEqual([])
  })
  it('backfill opzionale rifiuta valori non compilati senza modificare dati', async () => {
    const sql = readFileSync(
      new URL('../../supabase/optional/backfill_existing_user.sql', import.meta.url),
      'utf8',
    )
    await expect(db.exec(sql)).rejects.toThrow(/Compila target_user/)
    await db.exec('rollback')
    expect((await db.query('select * from atlas_profiles')).rows).toHaveLength(3)
  })
  it('backfill ripetibile crea una mappa vuota solo per un account Auth precedente', async () => {
    const legacy = '10000000-0000-4000-8000-000000000099'
    await db.exec('alter table auth.users disable trigger atlas_signup')
    await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)', [
      legacy,
      JSON.stringify({}),
    ])
    await db.exec('alter table auth.users enable trigger atlas_signup')
    const sql = readFileSync(
      new URL('../../supabase/optional/backfill_existing_user.sql', import.meta.url),
      'utf8',
    )
      .replace('target_user uuid := NULL', `target_user uuid := '${legacy}'`)
      .replace('chosen_username text := NULL', "chosen_username text := 'legacy_test'")
      .replace('chosen_display_name text := NULL', "chosen_display_name text := 'Fixture legacy'")
    await db.exec(sql)
    await db.exec(sql)
    expect((await as(legacy, 'select * from atlas_maps')).rows).toHaveLength(1)
    expect((await as(legacy, 'select * from atlas_experiences')).rows).toHaveLength(0)
    expect((await as(legacy, 'select * from atlas_categories')).rows).toHaveLength(9)
    expect((await as(legacy, 'select * from atlas_profiles')).rows).toHaveLength(1)
  })
  it('crea automaticamente profilo, mappa personale vuota e categorie', async () => {
    expect((await as(alice, 'select * from atlas_maps')).rows).toHaveLength(1)
    expect((await as(alice, 'select * from atlas_experiences')).rows).toHaveLength(0)
    expect((await as(alice, 'select * from atlas_categories')).rows).toHaveLength(9)
  })
  it('conferma username univoco con vincolo DB e rollback onboarding', async () => {
    await expect(
      db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)', [
        crypto.randomUUID(),
        JSON.stringify({ display_name: 'Duplicato', username: 'ALICE' }),
      ]),
    ).rejects.toThrow(/unique|duplicate/i)
  })
  it('impedisce ricerca non autenticata e non espone altri profili direttamente', async () => {
    expect((await as(alice, 'select * from atlas_profiles')).rows).toHaveLength(1)
    await db.exec('set role anon')
    try {
      await expect(db.query("select * from atlas_search_users('bob')")).rejects.toThrow(
        /permission/i,
      )
    } finally {
      await db.exec('reset role')
    }
  })
  it('cerca username senza email con limite e richiesta atomica', async () => {
    const rows = (
      await as<Record<string, unknown>>(alice, "select * from atlas_search_users('BOB')")
    ).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).not.toHaveProperty('email')
    await as(alice, 'select atlas_send_request($1)', [bob])
    const r = await as<{ id: string }>(bob, 'select id from atlas_connection_requests')
    request = r.rows[0]!.id
    await expect(as(alice, 'select atlas_send_request($1)', [bob])).rejects.toThrow()
    await expect(as(alice, 'select atlas_send_request($1)', [alice])).rejects.toThrow()
  })
  it('solo il destinatario accetta: crea una sola mappa vuota con due membri', async () => {
    await expect(
      as(eve, "select atlas_respond_request($1,'accepted')", [request]),
    ).rejects.toThrow()
    const r = await as<{ mid: string }>(bob, "select atlas_respond_request($1,'accepted') mid", [
      request,
    ])
    shared = r.rows[0]!.mid
    expect(
      (await as(alice, 'select * from atlas_map_members where map_id=$1', [shared])).rows,
    ).toHaveLength(2)
    expect(
      (await as(bob, 'select * from atlas_experiences where map_id=$1', [shared])).rows,
    ).toHaveLength(0)
    await expect(
      as(bob, "select atlas_respond_request($1,'accepted')", [request]),
    ).rejects.toThrow()
  })
  it('salva esperienza condivisa, leggibile da entrambi ma non terzi', async () => {
    await as(alice, 'select atlas_save_experience($1,$2,null)', [shared, JSON.stringify(data())])
    expect(
      (await as(bob, 'select * from atlas_experiences where map_id=$1', [shared])).rows,
    ).toHaveLength(1)
    expect(
      (await as(eve, 'select * from atlas_experiences where map_id=$1', [shared])).rows,
    ).toHaveLength(0)
    expect(
      (await as(alice, 'select * from atlas_experiences where map_id=$1', [personal])).rows,
    ).toHaveLength(0)
    await expect(
      as(eve, 'select atlas_save_experience($1,$2,null)', [
        shared,
        JSON.stringify({ ...data(), id: crypto.randomUUID() }),
      ]),
    ).rejects.toThrow()
  })
  it('impedisce spostamenti di ID e membership arbitrarie', async () => {
    await expect(
      as(alice, 'update atlas_experiences set map_id=$1 where id=$2', [personal, experience]),
    ).rejects.toThrow()
    await expect(
      as(eve, "insert into atlas_map_members(map_id,user_id,role) values($1,$2,'owner')", [
        shared,
        eve,
      ]),
    ).rejects.toThrow()
  })
  it('mantiene recensioni distinte e impedisce modifica o cancellazione altrui', async () => {
    for (const [uid, rating] of [
      [alice, 5],
      [bob, 4],
    ] as const)
      await as(uid, 'select atlas_save_review($1,$2,$3)', [
        shared,
        experience,
        JSON.stringify({ rating, notes: 'test', visitedAt: null }),
      ])
    const rs = (await as<{ id: string; author_id: string }>(bob, 'select * from atlas_reviews'))
      .rows
    expect(rs).toHaveLength(2)
    const other = rs.find((r) => r.author_id === alice)!.id
    expect(
      (await as(bob, 'update atlas_reviews set rating=0 where id=$1 returning id', [other])).rows,
    ).toHaveLength(0)
    expect(
      (await as(bob, 'delete from atlas_reviews where id=$1 returning id', [other])).rows,
    ).toHaveLength(0)
    await expect(
      as(bob, 'select atlas_save_review($1,$2,$3)', [
        shared,
        experience,
        JSON.stringify({ id: other, rating: 0, notes: 'x', visitedAt: null }),
      ]),
    ).rejects.toThrow()
    await expect(
      as(bob, 'select atlas_save_review($1,$2,$3)', [
        shared,
        experience,
        JSON.stringify({ rating: 4.2, notes: 'x', visitedAt: null }),
      ]),
    ).rejects.toThrow()
  })
  it('isola itinerari e valida le tappe anche in REST diretto', async () => {
    const item = {
      id: crypto.randomUUID(),
      name: 'Trip',
      waypoints: [{ experienceId: experience, stopMinutes: 60 }],
    }
    await expect(
      as(alice, 'select atlas_save_trip($1,$2)', [personal, JSON.stringify(item)]),
    ).rejects.toThrow()
    await as(bob, 'select atlas_save_trip($1,$2)', [shared, JSON.stringify(item)])
    expect((await as(eve, 'select * from atlas_trips')).rows).toHaveLength(0)
    await expect(
      as(alice, 'insert into atlas_trips(id,map_id,name,data) values($1,$2,$3,$4)', [
        crypto.randomUUID(),
        personal,
        'Trip',
        JSON.stringify(item),
      ]),
    ).rejects.toThrow()
  })
  it('Storage privato controlla membership e proprietario upload', async () => {
    await as(alice, "insert into storage.objects(bucket_id,name) values('atlas-images',$1)", [
      `${shared}/${alice}/test.jpg`,
    ])
    expect(
      (await as(bob, "select * from storage.objects where bucket_id='atlas-images'")).rows,
    ).toHaveLength(1)
    expect(
      (await as(eve, "select * from storage.objects where bucket_id='atlas-images'")).rows,
    ).toHaveLength(0)
    await expect(
      as(eve, "insert into storage.objects(bucket_id,name) values('atlas-images',$1)", [
        `${shared}/${eve}/bad.jpg`,
      ]),
    ).rejects.toThrow()
  })
  it('importa una sola volta e rollback su errori, senza sovrascrivere dati', async () => {
    const id = crypto.randomUUID()
    const bundle = { categories: [], experiences: [{ ...data(), id }], reviews: [], trips: [] }
    await as(alice, 'select atlas_import_legacy($1,$2,$3)', [
      personal,
      'legacy-fixture',
      JSON.stringify(bundle),
    ])
    await expect(
      as(alice, 'select atlas_import_legacy($1,$2,$3)', [
        personal,
        'legacy-fixture',
        JSON.stringify(bundle),
      ]),
    ).rejects.toThrow(/già importato/)
    const bad = { ...bundle, experiences: [{ ...data(), id: crypto.randomUUID() }, data()] }
    await expect(
      as(alice, 'select atlas_import_legacy($1,$2,$3)', [
        personal,
        'bad-fixture',
        JSON.stringify(bad),
      ]),
    ).rejects.toThrow()
    expect(
      (await as(alice, "select * from atlas_imports where source_id='bad-fixture'")).rows,
    ).toHaveLength(0)
  })
  it('solo il proprietario accede alla mappa personale e ai suoi dati anche conoscendone gli ID', async () => {
    const privateId = crypto.randomUUID()
    await as(alice, 'select atlas_save_experience($1,$2,$3)', [
      personal,
      JSON.stringify({ ...data(), id: privateId }),
      JSON.stringify({ rating: 4.5, notes: 'Recensione privata fixture', visitedAt: null }),
    ])
    expect(
      (await as(alice, 'select * from atlas_experiences where map_id=$1', [personal])).rows.length,
    ).toBeGreaterThan(0)
    for (const uid of [bob, eve]) {
      expect(
        (await as(uid, 'select id from atlas_maps where id=$1', [personal])).rows,
      ).toHaveLength(0)
      for (const table of [
        'atlas_map_members',
        'atlas_categories',
        'atlas_experiences',
        'atlas_visits',
        'atlas_reviews',
        'atlas_trips',
      ])
        expect(
          (await as(uid, `select * from ${table} where map_id=$1`, [personal])).rows,
        ).toHaveLength(0)
      await expect(
        as(uid, 'select atlas_save_experience($1,$2,null)', [
          personal,
          JSON.stringify({ ...data(), id: crypto.randomUUID() }),
        ]),
      ).rejects.toThrow()
      expect(
        (
          await as(uid, 'update atlas_experiences set deleted_at=now() where id=$1 returning id', [
            privateId,
          ])
        ).rows,
      ).toHaveLength(0)
    }
  })
  it('il controllo persistente di sola lettura riporta profilo, proprietà, conteggi e bucket senza modificare dati', async () => {
    const sql = readFileSync(
      new URL('../../supabase/checks/verify_account_persistence.sql', import.meta.url),
      'utf8',
    ).replace('values(NULL::uuid)', `values('${alice}'::uuid)`)
    const results = await db.exec(sql)
    const row = results[0]!.rows[0] as Record<string, unknown>
    expect(row.profilo_remoto_presente).toBe(true)
    expect(Number(row.mappe_personali)).toBe(1)
    expect(Number(row.membership_proprietario)).toBe(1)
    expect(Number(row.altri_membri_nella_personale)).toBe(0)
    expect(Number(row.esperienze_attive)).toBeGreaterThan(0)
    expect(results[1]!.rows.every((r) => r.presente && r.privato)).toBe(true)
  })
  it('salva routing e contesto meteo nel JSON esistente senza migrazioni', async () => {
    const route = {
      provider: 'geoapify',
      mode: 'drive',
      distanceMeters: 1234,
      durationSeconds: 456,
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [
            [9, 45],
            [9.1, 45.1],
          ],
        ],
      },
      legs: [],
      fingerprint: 'fixture-only',
      calculatedAt: '2026-10-26T00:00:00Z',
    }
    const item = {
      id: crypto.randomUUID(),
      name: 'Routing fixture SQL',
      planningPreferences: {
        localTime: '14:30',
        weatherVisitTime: '14:30',
        maxDriveMinutes: null,
        notes: '',
        weatherConsents: { [experience]: 'isolated-weather-test-key' },
      },
      waypoints: [{ experienceId: experience, stopMinutes: 30 }],
      routeSummary: route,
    }
    await as(alice, 'select atlas_save_trip($1,$2)', [shared, JSON.stringify(item)])
    const result = await as<{ data: { routeSummary: unknown; planningPreferences: unknown } }>(
      bob,
      'select data from atlas_trips where id=$1',
      [item.id],
    )
    expect(result.rows[0]!.data.routeSummary).toEqual(route)
    expect(result.rows[0]!.data.planningPreferences).toEqual(item.planningPreferences)
    expect(
      (await as(eve, 'select data from atlas_trips where id=$1', [item.id])).rows,
    ).toHaveLength(0)
  })
  it('abbandono condivisa revoca accesso senza toccare personale', async () => {
    await as(bob, 'select atlas_manage_map($1,null,true)', [shared])
    expect(
      (await as(bob, 'select * from atlas_experiences where map_id=$1', [shared])).rows,
    ).toHaveLength(0)
    expect((await as(bob, "select * from atlas_maps where type='personal'")).rows).toHaveLength(1)
  })
})

describe('AI: limiti persistenti e cache privata, solo database locale', () => {
  async function service<T>(sql: string, args: unknown[]) {
    await db.exec('set role service_role')
    try {
      return await db.query<T>(sql, args)
    } finally {
      await db.exec('reset role')
    }
  }
  const begin = async (
    actor: string,
    target: string,
    requestId = crypto.randomUUID(),
    fingerprint = 'a'.repeat(64),
  ) =>
    (
      await service<{ result: { status: string; response?: unknown; retryAfter?: number } }>(
        'select public.atlas_ai_begin($1,$2,$3,$4) result',
        [actor, target, requestId, fingerprint],
      )
    ).rows[0]!.result
  it('nega il gate al client e a mappe non autorizzate', async () => {
    await expect(
      as(alice, 'select public.atlas_ai_begin($1,$2,$3,$4)', [
        alice,
        personal,
        crypto.randomUUID(),
        'a'.repeat(64),
      ]),
    ).rejects.toThrow(/permission denied/)
    expect((await begin(eve, personal)).status).toBe('forbidden')
    await expect(as(alice, 'select * from atlas_private.ai_requests')).rejects.toThrow(
      /permission denied/,
    )
  })
  it('verifica in sola lettura privilegi e RLS dei quattro componenti AI', async () => {
    const checks = await db.exec(
      readFileSync(
        new URL('../../supabase/checks/verify_ai_explorer.sql', import.meta.url),
        'utf8',
      ),
    )
    const rows = checks.flatMap((result) => result.rows) as { ok: boolean }[]
    expect(rows).toHaveLength(4)
    expect(rows.every((row) => row.ok)).toBe(true)
  })
  it('deduplica tra richieste e impone quote senza possibilità di reset dal browser', async () => {
    await db.exec('truncate atlas_private.ai_usage,atlas_private.ai_requests')
    const id = crypto.randomUUID(),
      hash = 'a'.repeat(64)
    expect((await begin(alice, personal, id, hash)).status).toBe('claimed')
    expect((await begin(alice, personal, id, hash)).status).toBe('busy')
    expect((await begin(alice, personal, crypto.randomUUID(), hash)).status).toBe('busy')
    expect((await begin(alice, personal, id, 'b'.repeat(64))).status).toBe('conflict')
    const response = { status: 'results', proposals: [], criteria: {}, warnings: [] }
    await service('select atlas_ai_finish($1,$2,$3)', [alice, id, JSON.stringify(response)])
    expect(await begin(alice, personal, id, hash)).toMatchObject({ status: 'cached', response })
    expect((await begin(alice, personal, crypto.randomUUID(), hash)).status).toBe('cached')
    expect((await begin(alice, personal, crypto.randomUUID(), 'b'.repeat(64))).status).toBe(
      'claimed',
    )
    expect(await begin(alice, personal, crypto.randomUUID(), 'c'.repeat(64))).toMatchObject({
      status: 'limited',
      retryAfter: 60,
    })
    const counts = await db.query<{ minute_count: number }>(
      'select minute_count from atlas_private.ai_usage where bucket=$1',
      [alice],
    )
    expect(counts.rows[0]!.minute_count).toBe(2)
    await db.query(
      'update atlas_private.ai_usage set minute_count=0,day_count=20 where bucket=$1',
      [alice],
    )
    expect(await begin(alice, personal, crypto.randomUUID(), 'd'.repeat(64))).toMatchObject({
      status: 'limited',
      retryAfter: 86400,
    })
  })
})

describe('Costi semplificati: PostgreSQL locale, nessun database remoto', () => {
  const costShared = crypto.randomUUID()
  beforeAll(async () => {
    await db.query(
      "insert into atlas_maps(id,name,type,created_by) values($1,'Cost fixture','shared',$2)",
      [costShared, alice],
    )
    await db.query(
      "insert into atlas_map_members(map_id,user_id,role) values($1,$2,'owner'),($1,$3,'editor')",
      [costShared, alice, bob],
    )
    await db.query('select atlas_private.seed_categories($1)', [costShared])
  })
  it('non crea alcuna tabella di configurazione auto', async () => {
    expect(
      (
        await db.query<{ name: string | null }>(
          "select to_regclass('public.atlas_vehicle_preferences')::text name",
        )
      ).rows[0]!.name,
    ).toBeNull()
  })
  it('salva costo nullo/zero/a persona/totale e budget nella mappa condivisa mantenendo recensioni e foto', async () => {
    const id = crypto.randomUUID(),
      item = { ...data(), id, imagePath: null, cost: { amount: 0, mode: 'person' } }
    await as(alice, 'select atlas_save_experience($1,$2,$3)', [
      costShared,
      JSON.stringify(item),
      JSON.stringify({ rating: 4.5, notes: 'Conserva', visitedAt: null }),
    ])
    const before = (await as(alice, 'select id from atlas_reviews where experience_id=$1', [id]))
      .rows
    await as(bob, 'select atlas_save_experience($1,$2,null)', [
      costShared,
      JSON.stringify({ ...item, cost: { amount: 15, mode: 'total' } }),
    ])
    expect(
      (
        await as(alice, "select data->'cost' cost,image_path from atlas_experiences where id=$1", [
          id,
        ])
      ).rows,
    ).toEqual([{ cost: { amount: 15, mode: 'total' }, image_path: null }])
    expect(
      (await as(alice, 'select id from atlas_reviews where experience_id=$1', [id])).rows,
    ).toEqual(before)
    const budget = { participants: 2, max: 100, roundTrip: true, carCategory: 'sport' }
    const trip = {
      id: crypto.randomUUID(),
      name: 'Budget test',
      waypoints: [{ experienceId: id, stopMinutes: 30 }],
      budget,
    }
    await as(alice, 'select atlas_save_trip($1,$2)', [costShared, JSON.stringify(trip)])
    expect(
      (await as(bob, "select data->'budget' budget from atlas_trips where id=$1", [trip.id])).rows,
    ).toEqual([{ budget }])
    await expect(
      as(alice, 'select atlas_save_experience($1,$2,null)', [
        costShared,
        JSON.stringify({ ...item, cost: { amount: -1, mode: 'person' } }),
      ]),
    ).rejects.toThrow()
    await as(alice, 'select atlas_save_experience($1,$2,null)', [
      costShared,
      JSON.stringify({ ...item, cost: null }),
    ])
  })
  it.each(['TO_DO', 'DONE'])(
    'crea luoghi %s senza prezzo, gratuiti e con costo positivo in Supabase locale',
    async (status) => {
      for (const cost of [
        undefined,
        null,
        { amount: 0, mode: 'person' },
        { amount: 25, mode: 'total' },
      ]) {
        const id = crypto.randomUUID(),
          payload = { ...data(), id, status, priority: status === 'TO_DO' ? 'MEDIUM' : null, cost }
        await as(alice, 'select atlas_save_experience($1,$2,null)', [
          costShared,
          JSON.stringify(payload),
        ])
        const row = await as<{ data: { cost?: unknown } }>(
          bob,
          'select data from atlas_experiences where id=$1',
          [id],
        )
        expect(row.rows[0]!.data.cost).toEqual(cost)
      }
    },
  )
  it('HERE gate persistente: negato ai client, limiti, cache e appartenenza', async () => {
    await expect(
      as(alice, 'select atlas_here_begin($1,$2,$3,$4)', [
        alice,
        personal,
        crypto.randomUUID(),
        'a'.repeat(64),
      ]),
    ).rejects.toThrow()
    expect(
      (
        await db.query<{ v: { status: string } }>('select atlas_here_begin($1,$2,$3,$4) v', [
          eve,
          personal,
          crypto.randomUUID(),
          'a'.repeat(64),
        ])
      ).rows[0]!.v.status,
    ).toBe('forbidden')
    const req = crypto.randomUUID(),
      fp = 'a'.repeat(64)
    expect(
      (
        await db.query<{ v: { status: string } }>('select atlas_here_begin($1,$2,$3,$4) v', [
          alice,
          costShared,
          req,
          fp,
        ])
      ).rows[0]!.v.status,
    ).toBe('claimed')
    await db.query('select atlas_here_finish($1,$2,$3)', [
      alice,
      req,
      JSON.stringify({ provider: 'here', fixture: true }),
    ])
    expect(
      (
        await db.query<{ v: { status: string } }>('select atlas_here_begin($1,$2,$3,$4) v', [
          alice,
          costShared,
          crypto.randomUUID(),
          fp,
        ])
      ).rows[0]!.v.status,
    ).toBe('cached')
    for (let n = 0; n < 5; n++)
      await db.query('select atlas_here_begin($1,$2,$3,$4)', [
        alice,
        costShared,
        crypto.randomUUID(),
        String(n).repeat(64),
      ])
    expect(
      (
        await db.query<{ v: { status: string } }>('select atlas_here_begin($1,$2,$3,$4) v', [
          alice,
          costShared,
          crypto.randomUUID(),
          'f'.repeat(64),
        ])
      ).rows[0]!.v.status,
    ).toBe('limited')
    for (const table of ['here_requests', 'here_usage'])
      await expect(as(alice, `select * from atlas_private.${table}`)).rejects.toThrow()
  })
})

it('verifica in sola lettura i cinque componenti della migrazione costi', async () => {
  const result = await db.exec(
    readFileSync(new URL('../../supabase/checks/verify_trip_costs.sql', import.meta.url), 'utf8'),
  )
  const rows = result.flatMap((r) => r.rows) as { ok: boolean }[]
  expect(rows).toHaveLength(5)
  expect(rows.every((r) => r.ok)).toBe(true)
})
