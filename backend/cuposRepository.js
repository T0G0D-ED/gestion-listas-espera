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
      r.id::text AS reservation_id,
      r.slot_id,
      r.interconsulta_id,
      r.centro_solicitante,
      r.especialidad,
      r.prioridad_clinica,
      r.status,
      r.cancellation_reason,
      w.status AS waitlist_status,
      w.motivo AS waitlist_reason,
      CASE WHEN w.status = 'waiting' THEN (
        SELECT COUNT(*) + 1
        FROM appointment_waitlist AS ahead
        WHERE ahead.status = 'waiting'
          AND (ahead.prioridad_clinica > w.prioridad_clinica
            OR (ahead.prioridad_clinica = w.prioridad_clinica AND (
              ahead.entered_at < w.entered_at
              OR (ahead.entered_at = w.entered_at AND ahead.id < w.id)
            )))
      ) ELSE NULL END AS waitlist_position,
      r.reserved_at,
      to_char(s.appointment_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS at,
      s.doctor,
      s.establishment AS est,
      s.comuna,
      s.modalidad AS mod,
      s.box,
      COALESCE((
        SELECT json_agg(json_build_object(
          'action', event.action,
          'reason', event.reason,
          'fromEst', previous_slot.establishment,
          'fromAt', to_char(previous_slot.appointment_at, 'YYYY-MM-DD"T"HH24:MI:SS'),
          'toEst', next_slot.establishment,
          'toAt', to_char(next_slot.appointment_at, 'YYYY-MM-DD"T"HH24:MI:SS'),
          'createdAt', event.created_at
        ) ORDER BY event.created_at DESC)
        FROM appointment_reservation_events AS event
        LEFT JOIN appointment_slots AS previous_slot ON previous_slot.id = event.from_slot_id
        LEFT JOIN appointment_slots AS next_slot ON next_slot.id = event.to_slot_id
        WHERE event.reservation_id = r.id
      ), '[]'::json) AS history
    FROM appointment_reservations AS r
    JOIN appointment_slots AS s ON s.id = r.slot_id
    LEFT JOIN appointment_waitlist AS w ON w.interconsulta_id = r.interconsulta_id
    ORDER BY r.reserved_at DESC
  `)

  return result.rows
}

export async function listWaitlist(pool) {
  const result = await pool.query(`
    SELECT
      id::text AS waitlist_id,
      interconsulta_id,
      especialidad,
      centro_solicitante,
      prioridad_clinica,
      motivo,
      entered_at,
      ROW_NUMBER() OVER (ORDER BY prioridad_clinica DESC, entered_at ASC, id ASC)::integer AS position
    FROM appointment_waitlist
    WHERE status = 'waiting'
    ORDER BY prioridad_clinica DESC, entered_at ASC, id ASC
  `)

  return result.rows
}

export async function addToWaitlist(pool, {
  interconsultaId,
  especialidad,
  centroSolicitante,
  prioridadClinica,
  reason,
}) {
  const client = await pool.connect()
  let transactionOpen = false

  try {
    await client.query('BEGIN')
    transactionOpen = true
    const activeReservation = await client.query(`
      SELECT id FROM appointment_reservations
      WHERE interconsulta_id = $1 AND status = 'active'
      FOR UPDATE
    `, [interconsultaId])
    if (activeReservation.rowCount) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 409, error: 'La interconsulta ya tiene una cita activa.' }
    }

    const inserted = await client.query(`
      INSERT INTO appointment_waitlist (
        interconsulta_id, especialidad, centro_solicitante, prioridad_clinica, motivo
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (interconsulta_id) DO NOTHING
      RETURNING id::text AS waitlist_id, interconsulta_id
    `, [interconsultaId, especialidad, centroSolicitante, prioridadClinica, reason])
    if (!inserted.rowCount) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 409, error: 'La interconsulta ya está registrada en la lista de espera.' }
    }

    await client.query('COMMIT')
    transactionOpen = false
    return { status: 201, data: inserted.rows[0] }
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function reserveSlot(pool, {
  cupoId,
  interconsultaId,
  centroSolicitante,
  especialidad = 'Traumatología adulto',
  prioridadClinica = 0,
}) {
  const client = await pool.connect()
  let transactionOpen = false

  try {
    await client.query('BEGIN')
    transactionOpen = true

    const previousReservation = await client.query(`
      SELECT id, slot_id, status
      FROM appointment_reservations
      WHERE interconsulta_id = $1
      FOR UPDATE
    `, [interconsultaId])
    if (previousReservation.rowCount && previousReservation.rows[0].status === 'active') {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 409, error: 'Esta interconsulta ya tiene una cita activa.' }
    }

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

    const prior = previousReservation.rows[0]
    const reservation = prior
      ? await client.query(`
        UPDATE appointment_reservations
        SET slot_id = $2, centro_solicitante = $3, especialidad = $4,
            prioridad_clinica = $5, status = 'active', cancellation_reason = NULL,
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, reserved_at
      `, [prior.id, cupoId, centroSolicitante, especialidad, prioridadClinica])
      : await client.query(`
        INSERT INTO appointment_reservations (
          slot_id, interconsulta_id, centro_solicitante, especialidad, prioridad_clinica
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id, reserved_at
      `, [cupoId, interconsultaId, centroSolicitante, especialidad, prioridadClinica])

    await client.query(`
      INSERT INTO appointment_reservation_events (
        reservation_id, action, reason, from_slot_id, to_slot_id
      ) VALUES ($1, $2, $3, $4, $5)
    `, [
      reservation.rows[0].id,
      prior ? 'rescheduled' : 'reserved',
      prior ? 'Reingreso desde lista de espera' : 'Reserva inicial',
      prior?.slot_id ?? null,
      cupoId,
    ])
    await client.query(`
      UPDATE appointment_waitlist
      SET status = 'scheduled', reservation_id = $2, updated_at = NOW()
      WHERE interconsulta_id = $1 AND status = 'waiting'
    `, [interconsultaId, reservation.rows[0].id])

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
    if (error.code === '23503') {
      return { status: 404, error: 'El cupo solicitado no existe en la red asistencial.' }
    }

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
    const found = await client.query(`
      SELECT id, slot_id, status, interconsulta_id, especialidad,
             centro_solicitante, prioridad_clinica
      FROM appointment_reservations
      WHERE id = $1
      FOR UPDATE
    `, [reservationId])

    if (found.rowCount === 0) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 404, error: 'No se encontró la cita.' }
    }

    const reservation = found.rows[0]
    if (reservation.status !== 'active') {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 409, error: 'Esta cita ya fue cancelada.' }
    }

    await client.query(`
      UPDATE appointment_reservations
      SET status = 'cancelled', cancellation_reason = $2, updated_at = NOW()
      WHERE id = $1
    `, [reservationId, reason])
    await client.query(`
      UPDATE appointment_slots
      SET cupos_disponibles = LEAST(total_cupos, cupos_disponibles + 1), updated_at = NOW()
      WHERE id = $1
    `, [reservation.slot_id])
    await client.query(`
      INSERT INTO appointment_reservation_events (reservation_id, action, reason, from_slot_id)
      VALUES ($1, 'cancelled', $2, $3)
    `, [reservationId, reason, reservation.slot_id])
    await client.query(`
      INSERT INTO appointment_waitlist (
        interconsulta_id, reservation_id, especialidad, centro_solicitante,
        prioridad_clinica, status, motivo, entered_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'waiting', $6, NOW(), NOW())
      ON CONFLICT (interconsulta_id) DO UPDATE SET
        reservation_id = EXCLUDED.reservation_id,
        especialidad = EXCLUDED.especialidad,
        centro_solicitante = EXCLUDED.centro_solicitante,
        prioridad_clinica = EXCLUDED.prioridad_clinica,
        status = 'waiting',
        motivo = EXCLUDED.motivo,
        entered_at = NOW(),
        updated_at = NOW()
    `, [reservation.interconsulta_id, reservationId, reservation.especialidad,
      reservation.centro_solicitante, reservation.prioridad_clinica, reason])

    await client.query('COMMIT')
    transactionOpen = false
    return { status: 200, data: { reservationId, status: 'cancelled', reason } }
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK')
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
    const found = await client.query(`
      SELECT id, slot_id, status
      FROM appointment_reservations
      WHERE id = $1
      FOR UPDATE
    `, [reservationId])

    if (found.rowCount === 0) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 404, error: 'No se encontró la cita.' }
    }

    const reservation = found.rows[0]
    if (reservation.status !== 'active') {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 409, error: 'Solo se pueden reprogramar citas activas.' }
    }
    if (reservation.slot_id === cupoId) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 400, error: 'Selecciona un horario distinto al actual.' }
    }

    const slotIds = [reservation.slot_id, cupoId].sort()
    const lockedSlots = await client.query(`
      SELECT id
      FROM appointment_slots
      WHERE id = ANY($1::text[])
      ORDER BY id
      FOR UPDATE
    `, [slotIds])
    if (lockedSlots.rowCount !== 2) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 404, error: 'El nuevo cupo no existe en la red asistencial.' }
    }

    const updated = await client.query(`
      UPDATE appointment_slots
      SET cupos_disponibles = cupos_disponibles - 1, updated_at = NOW()
      WHERE id = $1 AND cupos_disponibles > 0
      RETURNING ${slotColumns}
    `, [cupoId])
    if (updated.rowCount === 0) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 409, error: 'El nuevo horario ya no está disponible.' }
    }

    await client.query(`
      UPDATE appointment_slots
      SET cupos_disponibles = LEAST(total_cupos, cupos_disponibles + 1), updated_at = NOW()
      WHERE id = $1
    `, [reservation.slot_id])
    await client.query(`
      UPDATE appointment_reservations
      SET slot_id = $2, cancellation_reason = NULL, updated_at = NOW()
      WHERE id = $1
    `, [reservationId, cupoId])
    await client.query(`
      UPDATE appointment_waitlist
      SET status = 'scheduled', updated_at = NOW()
      WHERE interconsulta_id = (
        SELECT interconsulta_id FROM appointment_reservations WHERE id = $1
      ) AND status = 'waiting'
    `, [reservationId])
    await client.query(`
      INSERT INTO appointment_reservation_events (
        reservation_id, action, reason, from_slot_id, to_slot_id
      ) VALUES ($1, 'rescheduled', $2, $3, $4)
    `, [reservationId, reason, reservation.slot_id, cupoId])

    await client.query('COMMIT')
    transactionOpen = false
    return { status: 200, data: { reservationId, reason, slot: updated.rows[0] } }
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
