import assert from 'node:assert/strict'
import test from 'node:test'
import { reserveSlot } from './cuposRepository.js'

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
            reservations.set(interconsultaId, { slotId, center })
            return {
              rows: [{ id: nextReservationId++, reserved_at: new Date().toISOString() }],
              rowCount: 1,
            }
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
