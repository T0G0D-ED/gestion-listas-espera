import assert from 'node:assert/strict'
import test from 'node:test'
import { createApp } from './app.js'

async function startTestServer(t, pool) {
  const server = createApp(pool).listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  t.after(() => new Promise(resolve => server.close(resolve)))
  return `http://127.0.0.1:${server.address().port}`
}

test('demo RUTs map to one interconsulta each', async t => {
  const baseUrl = await startTestServer(t, { async query() { return { rows: [] } } })
  const response = await fetch(`${baseUrl}/api/pacientes/ruts-demostracion`)
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.demo, true)
  assert.equal(payload.data.length, 16)
  assert.equal(payload.data[0].rut, '90.000.184-0')
  assert.equal(payload.data[0].interconsultaId, 'IC-2026-000184')
  assert.equal(new Set(payload.data.map(patient => patient.interconsultaId)).size, 16)
})

test('patient timeline lookup returns only the interconsulta mapped to the RUT', async t => {
  const timelineEvent = {
    id: '1',
    interconsulta_id: 'IC-2026-000184',
    event_type: 'created',
    title: 'Interconsulta creada',
    details: 'Evento de ejemplo',
    establishment: 'CESFAM de demostración',
    professional_name: null,
    actor_name: 'Equipo de demostración',
    actor_role: 'administrativo',
    event_at: '2026-01-01T10:00:00.000Z',
    is_demo: true,
  }
  let queryValues
  const baseUrl = await startTestServer(t, {
    async query(_sql, values) {
      queryValues = values
      return { rows: [timelineEvent] }
    },
  })
  const response = await fetch(`${baseUrl}/api/pacientes/linea-tiempo?rut=90.000.184-0`)
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.deepEqual(queryValues, ['IC-2026-000184'])
  assert.equal(payload.rut, '90.000.184-0')
  assert.equal(payload.interconsultaId, 'IC-2026-000184')
  assert.deepEqual(payload.data, [timelineEvent])
})

test('patient timeline lookup validates RUT format and rejects unknown demo RUTs', async t => {
  const baseUrl = await startTestServer(t, { async query() { return { rows: [] } } })
  const malformed = await fetch(`${baseUrl}/api/pacientes/linea-tiempo?rut=no-es-un-rut`)
  const unknown = await fetch(`${baseUrl}/api/pacientes/linea-tiempo?rut=12.345.678-9`)

  assert.equal(malformed.status, 400)
  assert.equal(unknown.status, 404)
})
