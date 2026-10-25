import assert from 'node:assert/strict'
import test from 'node:test'
import {
  computeCounterReferralHash,
  countUnreadCounterReferrals,
  createCounterReferral,
  markCounterReferralRead,
} from './cuposRepository.js'
import { createApp, parseCounterReferral } from './app.js'

function createPool({ status = 'pending', hasCounter = false } = {}) {
  const state = {
    status,
    counter: hasCounter ? { id: 1 } : null,
    events: [],
    reads: [],
    rows: [
      { interconsulta_id: 'IC-2026-000184', final_diagnosis: 'A', read_at: null },
      { interconsulta_id: 'IC-2026-000185', final_diagnosis: 'B', read_at: '2026-10-24T12:00:00Z' },
      { interconsulta_id: 'IC-2026-000186', final_diagnosis: 'C', read_at: null },
    ],
  }
  return {
    state,
    async query(sql, values = []) {
      const statement = sql.replace(/\s+/g, ' ').trim().toUpperCase()
      if (statement.includes('COUNT(*)::INT AS UNREAD')) {
        return { rows: [{ unread: state.rows.filter(row => !row.read_at).length }], rowCount: 1 }
      }
      if (statement.startsWith('UPDATE INTERCONSULTA_COUNTERREFERRALS SET READ_AT')) {
        const row = state.rows.find(item => item.interconsulta_id === values[0])
        if (!row) return { rows: [], rowCount: 0 }
        row.read_at ??= '2026-10-24T13:00:00Z'
        state.reads.push(values)
        return { rows: [{ ...row, read_by: values[1] }], rowCount: 1 }
      }
      if (statement.includes('FROM INTERCONSULTA_COUNTERREFERRALS AS COUNTER JOIN')) {
        return { rows: state.rows, rowCount: state.rows.length }
      }
      if (statement.includes('FROM INTERCONSULTA_REVIEW_WORKFLOW AS WORKFLOW')) {
        return { rows: [], rowCount: 0 }
      }
      throw new Error(`Unexpected pool query: ${statement}`)
    },
    async connect() {
      return {
        async query(sql, values = []) {
          const statement = sql.replace(/\s+/g, ' ').trim().toUpperCase()
          if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(statement)) return { rows: [], rowCount: 0 }
          if (statement.startsWith('SELECT INTERCONSULTA_ID, STATUS, ISSUER_ESTABLISHMENT')) {
            return values[0] === 'IC-2026-000184'
              ? { rows: [{ interconsulta_id: values[0], status: state.status, issuer_establishment: 'CESFAM Nuevo Horizonte' }], rowCount: 1 }
              : { rows: [], rowCount: 0 }
          }
          if (statement.startsWith('SELECT ID FROM INTERCONSULTA_COUNTERREFERRALS')) {
            return state.counter ? { rows: [state.counter], rowCount: 1 } : { rows: [], rowCount: 0 }
          }
          if (statement.startsWith('INSERT INTO INTERCONSULTA_COUNTERREFERRALS')) {
            const [
              interconsulta_id, final_diagnosis, indications, therapeutic_plan,
              attention_date, observations, , , document_hash,
            ] = values
            state.counter = {
              interconsulta_id, final_diagnosis, indications, therapeutic_plan,
              attention_date, observations, document_hash,
            }
            return { rows: [{ ...state.counter }], rowCount: 1 }
          }
          if (statement.startsWith("UPDATE INTERCONSULTA_REVIEW_WORKFLOW SET STATUS = 'COUNTERREFERRED'")) {
            state.status = 'counterreferred'
            return { rows: [], rowCount: 1 }
          }
          if (statement.startsWith('INSERT INTO INTERCONSULTA_TIMELINE_EVENTS')) {
            state.events.push(values)
            return { rows: [], rowCount: 1 }
          }
          throw new Error(`Unexpected query: ${statement}`)
        },
        release() {},
      }
    },
  }
}

const doctor = { name: 'Dr. Kosme Fulanito', role: 'medico' }
const valid = {
  interconsultaId: 'IC-2026-000184',
  finalDiagnosis: 'Gonartrosis grado II',
  indications: 'Control en 3 meses',
  therapeuticPlan: 'Kinesioterapia y analgesia',
  attentionDate: '2026-10-01',
  observations: '',
  actor: doctor,
}

test('registra la contrarreferencia, finaliza la interconsulta y no filtra contenido clínico a la línea de tiempo', async () => {
  const pool = createPool()
  const result = await createCounterReferral(pool, valid)

  assert.equal(result.status, 201)
  assert.equal(result.data.status, 'counterreferred')
  assert.equal(pool.state.status, 'counterreferred')
  assert.equal(pool.state.counter.final_diagnosis, 'Gonartrosis grado II')
  assert.equal(pool.state.counter.observations, null)
  assert.equal(pool.state.events.length, 1)
  assert.equal(pool.state.events[0][1], 'counterreferred')
  assert.equal(pool.state.events[0][8], true)
  assert.ok(!pool.state.events[0].join(' ').includes('Gonartrosis'))
})

test('guarda un hash SHA-256 determinista que cambia si cambia el contenido', async () => {
  const pool = createPool()
  await createCounterReferral(pool, valid)
  const expected = computeCounterReferralHash({
    interconsultaId: valid.interconsultaId,
    finalDiagnosis: valid.finalDiagnosis,
    indications: valid.indications,
    therapeuticPlan: valid.therapeuticPlan,
    attentionDate: valid.attentionDate,
    observations: '',
    specialistName: doctor.name,
  })

  assert.match(pool.state.counter.document_hash, /^[0-9a-f]{64}$/)
  assert.equal(pool.state.counter.document_hash, expected)
  const altered = computeCounterReferralHash({
    interconsultaId: valid.interconsultaId,
    finalDiagnosis: 'Otro diagnóstico',
    indications: valid.indications,
    therapeuticPlan: valid.therapeuticPlan,
    attentionDate: valid.attentionDate,
    observations: '',
    specialistName: doctor.name,
  })
  assert.notEqual(altered, expected)
})

test('rechaza una segunda contrarreferencia, una interconsulta inexistente y una no pendiente', async () => {
  assert.equal((await createCounterReferral(createPool({ hasCounter: true }), valid)).status, 409)
  assert.equal((await createCounterReferral(createPool({ status: 'counterreferred' }), valid)).status, 409)
  assert.equal((await createCounterReferral(createPool(), { ...valid, interconsultaId: 'IC-2026-999999' })).status, 404)
  assert.equal((await createCounterReferral(createPool({ status: 'returned' }), valid)).status, 409)
  assert.equal((await createCounterReferral(createPool({ status: 'rejected' }), valid)).status, 409)
})

test('la validación exige los tres campos obligatorios y una fecha real no futura', () => {
  const body = { finalDiagnosis: 'D', indications: 'I', therapeuticPlan: 'P' }
  assert.equal(parseCounterReferral(body).value.attentionDate, null)
  for (const field of ['finalDiagnosis', 'indications', 'therapeuticPlan']) {
    assert.match(parseCounterReferral({ ...body, [field]: '   ' }).error, /Debes completar/)
    assert.match(parseCounterReferral({ ...body, [field]: 'x'.repeat(3001) }).error, /3000/)
  }
  assert.ok(parseCounterReferral({ ...body, attentionDate: '2026-02-30' }).error)
  assert.ok(parseCounterReferral({ ...body, attentionDate: '2999-01-01' }).error)
  assert.ok(parseCounterReferral({ ...body, observations: 5 }).error)
})

test('cuenta las contrarreferencias sin leer y marca una como leída', async () => {
  const pool = createPool()
  assert.equal(await countUnreadCounterReferrals(pool), 2)

  const read = await markCounterReferralRead(pool, { interconsultaId: 'IC-2026-000184', actor: { name: 'María' } })
  assert.equal(read.status, 200)
  assert.ok(read.data.read_at)
  assert.equal(await countUnreadCounterReferrals(pool), 1)

  const missing = await markCounterReferralRead(pool, { interconsultaId: 'IC-2026-999999', actor: { name: 'María' } })
  assert.equal(missing.status, 404)
})

test('las rutas respetan los perfiles, validan el cuerpo y la bandeja del CESFAM cuenta las no leídas', async t => {
  const pool = createPool()
  const app = createApp(pool)
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}`
  const call = (path, profile, { method = 'GET', body } = {}) => fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Demo-Profile': profile },
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = {
    finalDiagnosis: 'Diagnóstico', indications: 'Indicaciones', therapeuticPlan: 'Plan',
  }
  const create = '/api/interconsultas/IC-2026-000184/contrarreferencia'

  assert.equal((await call(create, 'administrativo', { method: 'POST', body: payload })).status, 403)
  assert.equal((await call(create, 'medico', { method: 'POST', body: { ...payload, therapeuticPlan: '' } })).status, 400)
  const created = await call(create, 'medico', { method: 'POST', body: payload })
  assert.equal(created.status, 201)
  assert.equal((await created.json()).data.final_diagnosis, 'Diagnóstico')
  assert.equal((await call(create, 'medico', { method: 'POST', body: payload })).status, 409)

  assert.equal((await call('/api/cesfam/contrarreferencias', 'medico')).status, 403)
  assert.equal((await call('/api/cesfam/contrarreferencias/pendientes', 'medico')).status, 403)
  const inbox = await call('/api/cesfam/contrarreferencias', 'administrativo')
  assert.equal(inbox.status, 200)
  const inboxBody = await inbox.json()
  assert.equal(inboxBody.total, 3)
  assert.equal(inboxBody.unread, 2)

  const pending = await call('/api/cesfam/contrarreferencias/pendientes', 'administrativo')
  assert.equal((await pending.json()).unread, 2)

  const readPath = '/api/cesfam/contrarreferencias/IC-2026-000184/leida'
  assert.equal((await call(readPath, 'medico', { method: 'POST' })).status, 403)
  assert.equal((await call('/api/cesfam/contrarreferencias/NO-EXISTE/leida', 'administrativo', { method: 'POST' })).status, 404)
  assert.equal((await call(readPath, 'administrativo', { method: 'POST' })).status, 200)
  const after = await call('/api/cesfam/contrarreferencias/pendientes', 'administrativo')
  assert.equal((await after.json()).unread, 1)
})