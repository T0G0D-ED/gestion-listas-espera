import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { createApp } from './app.js'
import { getAttendanceRequest, respondToAttendance } from './cuposRepository.js'

const token = 'a'.repeat(43)

function createAttendancePool({ expired = false } = {}) {
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const state = {
    response: 'pending',
    reservationStatus: 'active',
    slotAvailability: 0,
    waitlisted: false,
    events: [],
    queryHash: null,
  }
  const appointment = {
    response: state.response,
    attendance_response: state.response,
    is_valid: !expired,
    reservation_status: state.reservationStatus,
    status: state.reservationStatus,
    reservation_id: '42',
    slot_id: 'slot-1',
    interconsulta_id: 'IC-2026-000184',
    especialidad: 'Traumatología adulto',
    centro_solicitante: 'CESFAM de prueba',
    prioridad_clinica: 1,
    at: '2026-10-15T10:30:00',
    doctor: 'Dra. Prueba',
    est: 'Hospital de prueba',
    mod: 'Presencial',
    box: 'Box 2',
  }
  const processQuery = async (sql, values = []) => {
    const statement = sql.replace(/\s+/g, ' ').trim().toUpperCase()
    if (statement.includes('FROM APPOINTMENT_ATTENDANCE_TOKENS AS ATTENDANCE')) {
      state.queryHash = values[0]
      if (values[0] !== tokenHash) return { rows: [], rowCount: 0 }
      return {
        rows: [{
          ...appointment,
          response: state.response,
          attendance_response: state.response,
          reservation_status: state.reservationStatus,
        }],
        rowCount: 1,
      }
    }
    if (statement === 'BEGIN' || statement === 'COMMIT' || statement === 'ROLLBACK') {
      return { rows: [], rowCount: 0 }
    }
    if (statement.startsWith('UPDATE APPOINTMENT_RESERVATIONS SET STATUS')) {
      state.reservationStatus = 'cancelled'
      return { rows: [], rowCount: 1 }
    }
    if (statement.startsWith('UPDATE APPOINTMENT_SLOTS')) {
      state.slotAvailability += 1
      return { rows: [], rowCount: 1 }
    }
    if (statement.startsWith('INSERT INTO APPOINTMENT_WAITLIST')) {
      state.waitlisted = true
      return { rows: [], rowCount: 1 }
    }
    if (statement.startsWith('INSERT INTO APPOINTMENT_RESERVATION_EVENTS') ||
        statement.startsWith('INSERT INTO INTERCONSULTA_TIMELINE_EVENTS')) {
      state.events.push({ statement, values })
      return { rows: [], rowCount: 1 }
    }
    if (statement.startsWith('UPDATE APPOINTMENT_ATTENDANCE_TOKENS')) {
      state.response = values[1]
      return { rows: [], rowCount: 1 }
    }
    throw new Error(`Unexpected query: ${statement}`)
  }

  return {
    state,
    async query(sql, values) {
      return processQuery(sql, values)
    },
    async connect() {
      return {
        query: processQuery,
        release() {},
      }
    },
  }
}

test('attendance link lookup hashes its token and returns appointment details', async () => {
  const pool = createAttendancePool()
  const result = await getAttendanceRequest(pool, token)

  assert.equal(result.status, 200)
  assert.equal(result.data.response, 'pending')
  assert.equal(result.data.interconsultaId, 'IC-2026-000184')
  assert.equal(result.data.slot.est, 'Hospital de prueba')
  assert.notEqual(pool.state.queryHash, token)
})

test('expired attendance links cannot be viewed or used', async () => {
  const pool = createAttendancePool({ expired: true })
  const lookup = await getAttendanceRequest(pool, token)
  const response = await respondToAttendance(pool, { token, response: 'confirmed' })

  assert.equal(lookup.status, 410)
  assert.equal(response.status, 410)
})

test('attendance confirmation is recorded once and cannot be changed later', async () => {
  const pool = createAttendancePool()
  const result = await respondToAttendance(pool, { token, response: 'confirmed' })
  const duplicate = await respondToAttendance(pool, { token, response: 'cancelled' })

  assert.equal(result.status, 200)
  assert.equal(result.data.response, 'confirmed')
  assert.equal(pool.state.response, 'confirmed')
  assert.equal(pool.state.reservationStatus, 'active')
  assert.equal(pool.state.events.length, 2)
  assert.equal(duplicate.status, 409)
})

test('attendance cancellation releases the slot and returns the referral to the waitlist', async () => {
  const pool = createAttendancePool()
  const result = await respondToAttendance(pool, { token, response: 'cancelled' })

  assert.equal(result.status, 200)
  assert.equal(result.data.reservationStatus, 'cancelled')
  assert.equal(pool.state.response, 'cancelled')
  assert.equal(pool.state.reservationStatus, 'cancelled')
  assert.equal(pool.state.slotAvailability, 1)
  assert.equal(pool.state.waitlisted, true)
  assert.equal(pool.state.events.length, 2)
})

test('public attendance endpoints show details without changing them until the patient confirms', async t => {
  const pool = createAttendancePool()
  const server = createApp(pool).listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  t.after(() => new Promise(resolve => server.close(resolve)))
  const url = `http://127.0.0.1:${server.address().port}/api/citas/asistencia/${token}`

  const preview = await fetch(url)
  assert.equal(preview.status, 200)
  assert.equal((await preview.json()).data.response, 'pending')
  assert.equal(pool.state.response, 'pending')

  const confirmation = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response: 'confirmed' }),
  })
  assert.equal(confirmation.status, 200)
  assert.equal((await confirmation.json()).data.response, 'confirmed')
  assert.equal(pool.state.response, 'confirmed')
})
