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
