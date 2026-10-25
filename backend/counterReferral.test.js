import assert from 'node:assert/strict'
import test from 'node:test'
import { createCounterReferral } from './cuposRepository.js'
import { createApp, parseCounterReferral } from './app.js'

function createPool({ status = 'pending', hasCounter = false } = {}) {
  const state = { status, counter: hasCounter ? { id: 1 } : null, events: [] }
  return {
    state,
    async query(sql) {
      if (sql.includes('FROM interconsulta_review_workflow AS workflow')) {
        return { rows: [], rowCount: 0 }
      }
      throw new Error('Unexpected pool query')
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
            const [interconsulta_id, final_diagnosis, indications, therapeutic_plan, attention_date, observations] = values
            state.counter = {
              interconsulta_id, final_diagnosis, indications, therapeutic_plan, attention_date, observations,
            }
            return { rows: [{ ...state.counter }], rowCount: 1 }
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

test('registra la contrarreferencia y deja un evento sin contenido clínico en la línea de tiempo', async () => {
  const pool = createPool()
  const result = await createCounterReferral(pool, valid)

  assert.equal(result.status, 201)
  assert.equal(pool.state.counter.final_diagnosis, 'Gonartrosis grado II')
  assert.equal(pool.state.counter.observations, null)
  assert.equal(pool.state.events.length, 1)
  assert.equal(pool.state.events[0][1], 'counterreferred')
  assert.equal(pool.state.events[0][8], true)
  assert.ok(!pool.state.events[0].join(' ').includes('Gonartrosis'))
})

test('rechaza una segunda contrarreferencia, una interconsulta inexistente y una no pendiente', async () => {
  assert.equal((await createCounterReferral(createPool({ hasCounter: true }), valid)).status, 409)
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

test('la ruta exige perfil médico, valida el cuerpo y responde 201 una sola vez', async t => {
  const pool = createPool()
  const app = createApp(pool)
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  t.after(() => new Promise(resolve => server.close(resolve)))
  const url = `http://127.0.0.1:${server.address().port}/api/interconsultas/IC-2026-000184/contrarreferencia`
  const send = (profile, body) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Demo-Profile': profile },
    body: JSON.stringify(body),
  })
  const payload = {
    finalDiagnosis: 'Diagnóstico', indications: 'Indicaciones', therapeuticPlan: 'Plan',
  }

  assert.equal((await send('administrativo', payload)).status, 403)
  assert.equal((await send('medico', { ...payload, therapeuticPlan: '' })).status, 400)
  const created = await send('medico', payload)
  assert.equal(created.status, 201)
  assert.equal((await created.json()).data.final_diagnosis, 'Diagnóstico')
  assert.equal((await send('medico', payload)).status, 409)
})