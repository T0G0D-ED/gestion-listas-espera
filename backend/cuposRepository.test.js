import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cancelReservation,
  reserveSlot,
  rescheduleReservation,
} from './cuposRepository.js'

function createFakePool(initialAvailability) {
  const slot = {
    id: 'slot-1',
    at: '2026-10-01T10:00:00.000Z',
    doctor: 'Profesional de prueba',
    est: 'Hospital de prueba',
    comuna: 'Santiago',
    mod: 'Presencial',
    box: 'Box 1',
    cupos_disponibles: initialAvailability,
  }
  const reservations = new Map()
  let nextReservationId = 1

  return {
    slot,
    reservations,
    async connect() {
      let changedSlot = false
      let insertedReservation = null

      return {
        async query(sql, values = []) {
          const statement = sql.replace(/\s+/g, ' ').trim().toUpperCase()

          if (statement === 'BEGIN' || statement === 'COMMIT') {
            if (statement === 'COMMIT') {
              changedSlot = false
              insertedReservation = null
            }
            return { rows: [], rowCount: 0 }
          }

          if (statement.startsWith('SELECT ID, SLOT_ID, STATUS FROM APPOINTMENT_RESERVATIONS')) {
            const existing = reservations.get(values[0])
            const rows = existing ? [{ id: existing.id, slot_id: existing.slotId, status: existing.status }] : []
            return { rows, rowCount: rows.length }
          }

          if (statement.startsWith('UPDATE APPOINTMENT_SLOTS')) {
            if (slot.id !== values[0] || slot.cupos_disponibles < 1) {
              return { rows: [], rowCount: 0 }
            }
            slot.cupos_disponibles -= 1
            changedSlot = true
            return {
              rows: [{ ...slot, cupos: slot.cupos_disponibles }],
              rowCount: 1,
            }
          }

          if (statement.startsWith('SELECT ID FROM APPOINTMENT_SLOTS')) {
            const rows = slot.id === values[0] ? [{ id: slot.id }] : []
            return { rows, rowCount: rows.length }
          }

          if (statement.startsWith('INSERT INTO APPOINTMENT_RESERVATIONS')) {
            const [slotId, interconsultaId, center] = values
            if (reservations.has(interconsultaId)) {
              throw Object.assign(new Error('duplicate interconsulta'), { code: '23505' })
            }
            insertedReservation = interconsultaId
            reservations.set(interconsultaId, {
              id: nextReservationId,
              slotId,
              center,
              status: 'active',
            })
            return {
              rows: [{ id: nextReservationId++, reserved_at: new Date().toISOString() }],
              rowCount: 1,
            }
          }

          if (statement.startsWith('INSERT INTO APPOINTMENT_RESERVATION_EVENTS') ||
              statement.startsWith('INSERT INTO INTERCONSULTA_TIMELINE_EVENTS')) {
            return { rows: [], rowCount: 1 }
          }

          if (statement.startsWith('UPDATE APPOINTMENT_WAITLIST')) {
            return { rows: [], rowCount: 1 }
          }

          if (statement === 'ROLLBACK') {
            if (changedSlot) slot.cupos_disponibles += 1
            if (insertedReservation) reservations.delete(insertedReservation)
            changedSlot = false
            insertedReservation = null
            return { rows: [], rowCount: 0 }
          }

          throw new Error(`Unexpected query: ${statement}`)
        },
        release() {},
      }
    },
  }
}

test('only one center reserves the final slot', async () => {
  const pool = createFakePool(1)
  const reservations = await Promise.all([
    reserveSlot(pool, {
      cupoId: 'slot-1',
      interconsultaId: 'IC-1',
      centroSolicitante: 'CESFAM Norte',
    }),
    reserveSlot(pool, {
      cupoId: 'slot-1',
      interconsultaId: 'IC-2',
      centroSolicitante: 'CESFAM Sur',
    }),
  ])

  assert.deepEqual(reservations.map(result => result.status).sort(), [201, 409])
  assert.equal(pool.slot.cupos_disponibles, 0)
  assert.equal(pool.reservations.size, 1)
})

function createManagementPool() {
  const slots = new Map([
    ['slot-1', { id: 'slot-1', cupos_disponibles: 0, total_cupos: 1 }],
    ['slot-2', { id: 'slot-2', cupos_disponibles: 1, total_cupos: 1 }],
  ])
  const reservations = new Map([
    ['1', { id: '1', slot_id: 'slot-1', status: 'active' }],
  ])
  const changes = []

  return {
    slots,
    reservations,
    changes,
    async connect() {
      return {
        async query(sql, values = []) {
          const statement = sql.replace(/\s+/g, ' ').trim().toUpperCase()
          if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(statement)) {
            return { rows: [], rowCount: 0 }
          }
          if (statement.startsWith('SELECT R.ID, R.SLOT_ID, R.STATUS, R.INTERCONSULTA_ID')) {
            const reservation = reservations.get(String(values[0]))
            const rows = reservation?.status === 'active'
              ? [{
                  id: reservation.id,
                  slot_id: reservation.slot_id,
                  status: reservation.status,
                  interconsulta_id: 'IC-2026-000184',
                  centro_solicitante: 'CESFAM de prueba',
                  at: '2026-10-05T10:00:00',
                  doctor: 'Profesional de prueba',
                  est: 'Hospital de prueba',
                  mod: 'Presencial',
                  box: 'Box 1',
                }]
              : []
            return { rows, rowCount: rows.length }
          }
          if (statement.startsWith('SELECT ID FROM APPOINTMENT_SLOTS WHERE ID = ANY')) {
            const rows = values[0].filter(id => slots.has(id)).map(id => ({ id }))
            return { rows, rowCount: rows.length }
          }
          if (statement.startsWith('UPDATE APPOINTMENT_SLOTS') &&
              statement.includes('CUPOS_DISPONIBLES = CUPOS_DISPONIBLES - 1')) {
            const slot = slots.get(values[0])
            if (!slot || slot.cupos_disponibles < 1) return { rows: [], rowCount: 0 }
            slot.cupos_disponibles -= 1
            return { rows: [{ ...slot, cupos: slot.cupos_disponibles }], rowCount: 1 }
          }
          if (statement.startsWith('SELECT ID FROM APPOINTMENT_SLOTS')) {
            const rows = slots.has(values[0]) ? [{ id: values[0] }] : []
            return { rows, rowCount: rows.length }
          }
          if (statement.startsWith('UPDATE APPOINTMENT_SLOTS') &&
              statement.includes('LEAST(TOTAL_CUPOS, CUPOS_DISPONIBLES + 1)')) {
            const slot = slots.get(values[0])
            if (slot) slot.cupos_disponibles = Math.min(slot.total_cupos, slot.cupos_disponibles + 1)
            return { rows: [], rowCount: slot ? 1 : 0 }
          }
          if (statement.startsWith('UPDATE APPOINTMENT_RESERVATIONS SET SLOT_ID')) {
            const reservation = reservations.get(String(values[0]))
            reservation.slot_id = values[1]
            return { rows: [], rowCount: 1 }
          }
          if (statement.startsWith('UPDATE APPOINTMENT_RESERVATIONS SET STATUS')) {
            const reservation = reservations.get(String(values[0]))
            reservation.status = 'cancelled'
            return { rows: [], rowCount: 1 }
          }
          if (statement.startsWith('INSERT INTO APPOINTMENT_RESERVATION_EVENTS') ||
              statement.startsWith('INSERT INTO INTERCONSULTA_TIMELINE_EVENTS')) {
            changes.push(values)
            return { rows: [], rowCount: 1 }
          }
          if (statement.startsWith('INSERT INTO APPOINTMENT_WAITLIST') ||
              statement.startsWith('UPDATE APPOINTMENT_WAITLIST')) {
            return { rows: [], rowCount: 1 }
          }
          throw new Error(`Unexpected query: ${statement}`)
        },
        release() {},
      }
    },
  }
}

test('rescheduling moves the reservation and transfers slot availability', async () => {
  const pool = createManagementPool()
  const result = await rescheduleReservation(pool, {
    reservationId: '1',
    cupoId: 'slot-2',
    reason: 'Solicitud del paciente',
  })

  assert.equal(result.status, 200)
  assert.equal(pool.reservations.get('1').slot_id, 'slot-2')
  assert.equal(pool.slots.get('slot-1').cupos_disponibles, 1)
  assert.equal(pool.slots.get('slot-2').cupos_disponibles, 0)
  assert.deepEqual(pool.changes[0], ['1', 'Solicitud del paciente', 'slot-1', 'slot-2'])
  assert.equal(result.data.notification.action, 'rescheduled')
  assert.equal(result.data.notification.previousSlot.est, 'Hospital de prueba')
  assert.equal(result.data.notification.nextSlot.id, 'slot-2')
})

test('cancellation releases the slot and preserves the required reason', async () => {
  const pool = createManagementPool()
  const result = await cancelReservation(pool, {
    reservationId: '1',
    reason: 'Otro: Problema de traslado',
  })

  assert.equal(result.status, 200)
  assert.equal(pool.reservations.get('1').status, 'cancelled')
  assert.equal(pool.slots.get('slot-1').cupos_disponibles, 1)
  assert.deepEqual(pool.changes[0], ['1', 'Otro: Problema de traslado', 'slot-1'])
  assert.equal(result.data.notification.action, 'cancelled')
  assert.equal(result.data.notification.reason, 'Otro: Problema de traslado')
})
