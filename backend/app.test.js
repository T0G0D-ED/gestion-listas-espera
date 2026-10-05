import assert from 'node:assert/strict'
import test from 'node:test'
import { createApp } from './app.js'

async function startTestServer(t, pool = {
    async query() {
      return { rows: [], rowCount: 0 }
    },
    async connect() {
      throw new Error('Database should not be called for invalid requests.')
    },
  }, options) {
  const app = createApp(pool, options)
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  t.after(() => new Promise(resolve => server.close(resolve)))
  return `http://127.0.0.1:${server.address().port}`
}

test('cancellation requires an allowed reason', async t => {
  const baseUrl = await startTestServer(t)
  const response = await fetch(`${baseUrl}/api/reservas/1/cancelar`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })

  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /motivo/i)
})

test('other reason requires a written explanation', async t => {
  const baseUrl = await startTestServer(t)
  const response = await fetch(`${baseUrl}/api/reservas/1/reprogramar`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cupoId: 'slot-2', motivo: 'Otro', otroMotivo: '  ' }),
  })

  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /otro/i)
})

test('outdated reservation schema returns a migration instruction', async t => {
  const baseUrl = await startTestServer(t, {
    async query() {
      throw Object.assign(new Error('column status does not exist'), { code: '42703' })
    },
  })
  const response = await fetch(`${baseUrl}/api/reservas`)

  assert.equal(response.status, 500)
  assert.match((await response.json()).error, /npm run db:migrate/)
})

test('cancellation remains successful and reports Resend delivery failure', async t => {
  const slot = {
    id: 'slot-1',
    at: '2026-10-05T10:30:00',
    doctor: 'Dra. Prueba',
    est: 'Hospital de prueba',
    mod: 'Presencial',
    box: 'Box 2',
  }
  const pool = {
    async connect() {
      return {
        async query(sql) {
          const statement = sql.replace(/\s+/g, ' ').trim().toUpperCase()
          if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(statement)) {
            return { rows: [], rowCount: 0 }
          }
          if (statement.startsWith('SELECT R.ID, R.SLOT_ID, R.INTERCONSULTA_ID')) {
            return {
              rows: [{
                id: '1',
                slot_id: slot.id,
                interconsulta_id: 'IC-2026-000184',
                centro_solicitante: 'CESFAM de prueba',
                ...slot,
              }],
              rowCount: 1,
            }
          }
          return { rows: [], rowCount: 1 }
        },
        release() {},
      }
    },
  }
  const baseUrl = await startTestServer(t, pool, {
    async notify(notification) {
      assert.equal(notification.action, 'cancelled')
      throw new Error('Resend service unavailable')
    },
  })
  const response = await fetch(`${baseUrl}/api/reservas/1/cancelar`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ motivo: 'Solicitud del paciente' }),
  })
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.data.reservationId, '1')
  assert.equal(payload.data.notification.sent, false)
  assert.match(payload.data.notification.error, /no se pudo enviar/)
})

test('reservation sends a test email and returns its delivery status', async t => {
  const slot = {
    id: 'slot-1',
    at: '2026-10-05T10:30:00',
    doctor: 'Dra. Prueba',
    est: 'Hospital de prueba',
    comuna: 'Santiago',
    mod: 'Presencial',
    box: 'Box 2',
    cupos: 0,
  }
  const pool = {
    async connect() {
      return {
        async query(sql) {
          const statement = sql.replace(/\s+/g, ' ').trim().toUpperCase()
          if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(statement)) {
            return { rows: [], rowCount: 0 }
          }
          if (statement.startsWith('UPDATE APPOINTMENT_SLOTS')) {
            return { rows: [slot], rowCount: 1 }
          }
          if (statement.startsWith('INSERT INTO APPOINTMENT_RESERVATIONS')) {
            return {
              rows: [{ id: '42', reserved_at: '2026-10-05T10:00:00Z' }],
              rowCount: 1,
            }
          }
          throw new Error(`Unexpected query: ${statement}`)
        },
        release() {},
      }
    },
  }
  let notified
  const baseUrl = await startTestServer(t, pool, {
    async notify(notification) {
      notified = notification
      return { sent: true, recipient: 'test@example.com', messageId: 'resend-id' }
    },
  })
  const response = await fetch(`${baseUrl}/api/cupos/reservar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cupoId: 'slot-1',
      interconsultaId: 'IC-2026-000184',
      centroSolicitante: 'CESFAM de prueba',
    }),
  })
  const payload = await response.json()

  assert.equal(response.status, 201)
  assert.equal(notified.action, 'reserved')
  assert.equal(notified.interconsultaId, 'IC-2026-000184')
  assert.equal(payload.data.notification.sent, true)
  assert.equal(payload.data.notification.recipient, 'test@example.com')
})
