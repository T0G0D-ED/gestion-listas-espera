const slotColumns = `
  id,
  to_char(appointment_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS at,
  doctor,
  establishment AS est,
  comuna,
  modalidad AS mod,
  box,
  cupos_disponibles AS cupos
`

export async function listSlots(pool) {
  const result = await pool.query(`
    SELECT ${slotColumns}
    FROM appointment_slots
    ORDER BY appointment_at
  `)

  return result.rows
}

export async function listReservations(pool) {
  const result = await pool.query(`
    SELECT
      r.id AS "reservationId",
      r.interconsulta_id AS "interconsultaId",
      r.centro_solicitante AS "centroSolicitante",
      s.id AS "cupoId",
      to_char(s.appointment_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS at,
      s.doctor,
      s.establishment AS est,
      s.comuna,
      s.modalidad AS mod,
      s.box,
      s.cupos_disponibles AS cupos
    FROM appointment_reservations r
    JOIN appointment_slots s ON s.id = r.slot_id
    WHERE r.status = 'reserved'
    ORDER BY s.appointment_at
  `)

  return result.rows
}

export async function reserveSlot(pool, { cupoId, interconsultaId, centroSolicitante }) {
  const client = await pool.connect()
  let transactionOpen = false

  try {
    await client.query('BEGIN')
    transactionOpen = true

    const updated = await client.query(`
      UPDATE appointment_slots
      SET cupos_disponibles = cupos_disponibles - 1,
          updated_at = NOW()
      WHERE id = $1 AND cupos_disponibles > 0
      RETURNING ${slotColumns}
    `, [cupoId])

    if (updated.rowCount === 0) {
      const existing = await client.query(
        'SELECT id FROM appointment_slots WHERE id = $1',
        [cupoId],
      )
      await client.query('ROLLBACK')
      transactionOpen = false

      return existing.rowCount === 0
        ? { status: 404, error: 'El cupo solicitado no existe en la red asistencial.' }
        : { status: 409, error: 'El cupo ya fue asignado y no tiene disponibilidad.' }
    }

    const reservation = await client.query(`
      INSERT INTO appointment_reservations (slot_id, interconsulta_id, centro_solicitante)
      VALUES ($1, $2, $3)
      RETURNING id, reserved_at
    `, [cupoId, interconsultaId, centroSolicitante])

    await client.query('COMMIT')
    transactionOpen = false

    return {
      status: 201,
      data: {
        reservationId: reservation.rows[0].id,
        reservedAt: reservation.rows[0].reserved_at,
        slot: updated.rows[0],
        notification: {
          action: 'reserved',
          interconsultaId,
          centroSolicitante,
          previousSlot: updated.rows[0],
        },
      },
    }
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK')

    if (error.code === '23505') {
      return {
        status: 409,
        error: 'Esta interconsulta ya tiene una cita reservada en la red asistencial.',
      }
    }
    throw error
  } finally {
    client.release()
  }
}

export async function rescheduleReservation(pool, { reservationId, cupoId, reason }) {
  const client = await pool.connect()
  let transactionOpen = false

  try {
    await client.query('BEGIN')
    transactionOpen = true

    const current = await client.query(`
      SELECT
        r.id,
        r.slot_id,
        r.interconsulta_id,
        r.centro_solicitante,
        to_char(s.appointment_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS at,
        s.doctor,
        s.establishment AS est,
        s.modalidad AS mod,
        s.box
      FROM appointment_reservations r
      JOIN appointment_slots s ON s.id = r.slot_id
      WHERE r.id = $1 AND r.status = 'reserved'
      FOR UPDATE OF r
    `, [reservationId])

    if (current.rowCount === 0) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 404, error: 'La cita ya no está vigente o no existe.' }
    }

    const previousSlotId = current.rows[0].slot_id
    const previousSlot = current.rows[0]
    if (previousSlotId === cupoId) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 400, error: 'Selecciona un cupo distinto al actual.' }
    }

    const nextSlot = await client.query(`
      UPDATE appointment_slots
      SET cupos_disponibles = cupos_disponibles - 1,
          updated_at = NOW()
      WHERE id = $1 AND cupos_disponibles > 0
      RETURNING ${slotColumns}
    `, [cupoId])

    if (nextSlot.rowCount === 0) {
      const exists = await client.query('SELECT id FROM appointment_slots WHERE id = $1', [cupoId])
      await client.query('ROLLBACK')
      transactionOpen = false
      return exists.rowCount === 0
        ? { status: 404, error: 'El cupo seleccionado no existe.' }
        : { status: 409, error: 'El cupo seleccionado ya no está disponible.' }
    }

    await client.query(`
      UPDATE appointment_slots
      SET cupos_disponibles = LEAST(total_cupos, cupos_disponibles + 1),
          updated_at = NOW()
      WHERE id = $1
    `, [previousSlotId])

    await client.query(`
      UPDATE appointment_reservations
      SET slot_id = $1
      WHERE id = $2
    `, [cupoId, reservationId])

    await client.query(`
      INSERT INTO appointment_reservation_changes
        (reservation_id, action, from_slot_id, to_slot_id, reason)
      VALUES ($1, 'rescheduled', $2, $3, $4)
    `, [reservationId, previousSlotId, cupoId, reason])

    await client.query('COMMIT')
    transactionOpen = false
    return {
      status: 200,
      data: {
        slot: nextSlot.rows[0],
        notification: {
          action: 'rescheduled',
          interconsultaId: current.rows[0].interconsulta_id,
          centroSolicitante: current.rows[0].centro_solicitante,
          previousSlot,
          nextSlot: nextSlot.rows[0],
          reason,
        },
      },
    }
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function cancelReservation(pool, { reservationId, reason }) {
  const client = await pool.connect()
  let transactionOpen = false

  try {
    await client.query('BEGIN')
    transactionOpen = true

    const current = await client.query(`
      SELECT
        r.id,
        r.slot_id,
        r.interconsulta_id,
        r.centro_solicitante,
        to_char(s.appointment_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS at,
        s.doctor,
        s.establishment AS est,
        s.modalidad AS mod,
        s.box
      FROM appointment_reservations r
      JOIN appointment_slots s ON s.id = r.slot_id
      WHERE r.id = $1 AND r.status = 'reserved'
      FOR UPDATE OF r
    `, [reservationId])

    if (current.rowCount === 0) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 404, error: 'La cita ya no está vigente o no existe.' }
    }

    const slotId = current.rows[0].slot_id
    await client.query(`
      UPDATE appointment_slots
      SET cupos_disponibles = LEAST(total_cupos, cupos_disponibles + 1),
          updated_at = NOW()
      WHERE id = $1
    `, [slotId])

    await client.query(`
      UPDATE appointment_reservations
      SET status = 'cancelled',
          cancelled_at = NOW()
      WHERE id = $1
    `, [reservationId])

    await client.query(`
      INSERT INTO appointment_reservation_changes
        (reservation_id, action, from_slot_id, reason)
      VALUES ($1, 'cancelled', $2, $3)
    `, [reservationId, slotId, reason])

    await client.query('COMMIT')
    transactionOpen = false
    return {
      status: 200,
      data: {
        reservationId,
        notification: {
          action: 'cancelled',
          interconsultaId: current.rows[0].interconsulta_id,
          centroSolicitante: current.rows[0].centro_solicitante,
          previousSlot: current.rows[0],
          reason,
        },
      },
    }
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
