import { createHash, randomBytes } from 'node:crypto'
import { demoInterconsultaIds } from './demoPatients.js'

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

const defaultActor = { name: 'Administrativo (prototipo)', role: 'administrativo' }
const doctorOwnedReferralIds = new Set(demoInterconsultaIds)
const attendanceActor = { name: 'Paciente (enlace de correo)', role: 'sistema' }

function hashAttendanceToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

async function issueAttendanceToken(client, reservationId, slotId) {
  const token = randomBytes(32).toString('base64url')
  await client.query(`
    INSERT INTO appointment_attendance_tokens (
      reservation_id, token_hash, expires_at, response, responded_at
    )
    SELECT $1, $2, appointment_at::timestamptz + INTERVAL '1 day', 'pending', NULL
    FROM appointment_slots
    WHERE id = $3
    ON CONFLICT (reservation_id) DO UPDATE SET
      token_hash = EXCLUDED.token_hash,
      expires_at = EXCLUDED.expires_at,
      response = 'pending',
      created_at = NOW(),
      responded_at = NULL
  `, [reservationId, hashAttendanceToken(token), slotId])
  return token
}

export async function listSlots(pool) {
  const result = await pool.query(`
    SELECT ${slotColumns}
    FROM appointment_slots
    WHERE appointment_at > LOCALTIMESTAMP
    ORDER BY appointment_at
  `)

  return result.rows
}

export async function listReservations(pool, { interconsultaIds = null } = {}) {
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
    WHERE $1::text[] IS NULL OR r.interconsulta_id = ANY($1::text[])
    ORDER BY r.reserved_at DESC
  `, [interconsultaIds])

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

export async function listTimelineEvents(pool, interconsultaId) {
  const result = await pool.query(`
    SELECT
      id::text AS id,
      interconsulta_id,
      event_type,
      title,
      details,
      establishment,
      professional_name,
      actor_name,
      actor_role,
      event_at,
      is_demo
    FROM interconsulta_timeline_events
    WHERE interconsulta_id = $1
    ORDER BY event_at ASC, id ASC
  `, [interconsultaId])
  return result.rows
}

export async function listAuditableReferrals(pool) {
  const result = await pool.query(`
    SELECT
      workflow.interconsulta_id,
      workflow.status,
      workflow.issuer_establishment,
      workflow.issuer_professional,
      workflow.observations,
      workflow.missing_exams,
      workflow.rejection_reason,
      workflow.issuer_response,
      workflow.added_exams,
      workflow.updated_at,
      workflow.returned_at,
      workflow.rejected_at,
      workflow.resubmitted_at
    FROM interconsulta_review_workflow AS workflow
    ORDER BY workflow.updated_at DESC, workflow.interconsulta_id
  `)
  return result.rows
}

export async function listReturnedReferrals(pool) {
  const result = await pool.query(`
    SELECT
      workflow.interconsulta_id,
      workflow.status,
      workflow.issuer_establishment,
      workflow.issuer_professional,
      workflow.observations,
      workflow.missing_exams,
      workflow.issuer_response,
      workflow.added_exams,
      workflow.updated_at,
      workflow.returned_at
    FROM interconsulta_review_workflow AS workflow
    WHERE workflow.status = 'returned'
    ORDER BY workflow.returned_at DESC, workflow.interconsulta_id
  `)
  return result.rows
}

async function insertTimelineEvent(client, {
  interconsultaId,
  eventType,
  title,
  details,
  establishment,
  professionalName = null,
  actor = defaultActor,
  isDemo = false,
}) {
  await client.query(`
    INSERT INTO interconsulta_timeline_events (
      interconsulta_id, event_type, title, details, establishment,
      professional_name, actor_name, actor_role, is_demo
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [
    interconsultaId,
    eventType,
    title,
    details,
    establishment,
    professionalName,
    actor.name,
    actor.role,
    isDemo,
  ])
}

export async function reviewInterconsulta(pool, {
  interconsultaId,
  decision,
  observations = '',
  missingExams = '',
  reason = '',
  actor,
}) {
  const client = await pool.connect()
  let transactionOpen = false

  try {
    await client.query('BEGIN')
    transactionOpen = true
    const found = await client.query(`
      SELECT interconsulta_id, status, issuer_establishment
      FROM interconsulta_review_workflow
      WHERE interconsulta_id = $1
      FOR UPDATE
    `, [interconsultaId])
    if (!found.rowCount) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 404, error: 'No se encontró la interconsulta de demostración.' }
    }
    if (found.rows[0].status !== 'pending') {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 409, error: 'Solo se pueden revisar interconsultas pendientes.' }
    }

    const returned = decision === 'return'
    const nextStatus = returned ? 'returned' : 'rejected'
    const result = await client.query(`
      UPDATE interconsulta_review_workflow
      SET status = $2,
          observations = $3,
          missing_exams = $4,
          rejection_reason = $5,
          updated_at = NOW(),
          returned_at = CASE WHEN $2 = 'returned' THEN NOW() ELSE returned_at END,
          rejected_at = CASE WHEN $2 = 'rejected' THEN NOW() ELSE rejected_at END
      WHERE interconsulta_id = $1
      RETURNING interconsulta_id, status, issuer_establishment, issuer_professional,
        observations, missing_exams, rejection_reason, updated_at
    `, [interconsultaId, nextStatus, observations, missingExams, returned ? null : reason])
    await insertTimelineEvent(client, {
      interconsultaId,
      eventType: nextStatus,
      title: returned ? 'Interconsulta devuelta al CESFAM' : 'Interconsulta rechazada definitivamente',
      details: returned
        ? 'Se solicitaron correcciones al profesional emisor.'
        : 'La interconsulta fue cerrada tras la revisión de pertinencia.',
      establishment: found.rows[0].issuer_establishment,
      actor,
      isDemo: true,
    })
    await client.query('COMMIT')
    transactionOpen = false

    return {
      status: 200,
      data: {
        ...result.rows[0],
        notification: returned ? {
          action: 'returned',
          interconsultaId,
          issuerEstablishment: result.rows[0].issuer_establishment,
          issuerProfessional: result.rows[0].issuer_professional,
          observations,
          missingExams,
        } : null,
      },
    }
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function resubmitReturnedInterconsulta(pool, {
  interconsultaId,
  issuerResponse,
  addedExams,
  actor,
}) {
  const client = await pool.connect()
  let transactionOpen = false

  try {
    await client.query('BEGIN')
    transactionOpen = true
    const found = await client.query(`
      SELECT interconsulta_id, status, issuer_establishment
      FROM interconsulta_review_workflow
      WHERE interconsulta_id = $1
      FOR UPDATE
    `, [interconsultaId])
    if (!found.rowCount) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 404, error: 'No se encontró la interconsulta de demostración.' }
    }
    if (found.rows[0].status !== 'returned') {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 409, error: 'Solo se pueden reenviar interconsultas devueltas.' }
    }

    const result = await client.query(`
      UPDATE interconsulta_review_workflow
      SET status = 'pending',
          issuer_response = $2,
          added_exams = $3,
          updated_at = NOW(),
          resubmitted_at = NOW()
      WHERE interconsulta_id = $1
      RETURNING interconsulta_id, status, issuer_establishment,
        issuer_professional, observations, missing_exams, issuer_response,
        added_exams, updated_at, resubmitted_at
    `, [interconsultaId, issuerResponse, addedExams])
    await insertTimelineEvent(client, {
      interconsultaId,
      eventType: 'resubmitted',
      title: 'Interconsulta reenviada para revisión',
      details: 'El profesional emisor respondió a las observaciones y reenvió la interconsulta.',
      establishment: found.rows[0].issuer_establishment,
      actor,
      isDemo: true,
    })
    await client.query('COMMIT')
    transactionOpen = false
    return { status: 200, data: result.rows[0] }
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

const specialistEstablishment = 'Hospital de referencia (demostración)'

export async function listCounterReferrals(pool) {
  const result = await pool.query(`
    SELECT
      workflow.interconsulta_id,
      workflow.status,
      workflow.issuer_establishment,
      workflow.issuer_professional,
      counter.final_diagnosis,
      counter.indications,
      counter.therapeutic_plan,
      to_char(counter.attention_date, 'YYYY-MM-DD') AS attention_date,
      counter.observations,
      counter.specialist_name,
      counter.created_at
    FROM interconsulta_review_workflow AS workflow
    LEFT JOIN interconsulta_counterreferrals AS counter
      ON counter.interconsulta_id = workflow.interconsulta_id
    ORDER BY (counter.id IS NULL) DESC, counter.created_at DESC, workflow.interconsulta_id
  `)
  return result.rows
}

export async function createCounterReferral(pool, {
  interconsultaId,
  finalDiagnosis,
  indications,
  therapeuticPlan,
  attentionDate = null,
  observations = '',
  actor,
}) {
  const client = await pool.connect()
  let transactionOpen = false

  try {
    await client.query('BEGIN')
    transactionOpen = true
    const found = await client.query(`
      SELECT interconsulta_id, status, issuer_establishment
      FROM interconsulta_review_workflow
      WHERE interconsulta_id = $1
      FOR UPDATE
    `, [interconsultaId])
    if (!found.rowCount) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 404, error: 'No se encontró la interconsulta de demostración.' }
    }
    if (found.rows[0].status !== 'pending') {
      await client.query('ROLLBACK')
      transactionOpen = false
      return {
        status: 409,
        error: 'Solo se puede contrarreferir una interconsulta que no esté devuelta ni rechazada.',
      }
    }

    const existing = await client.query(`
      SELECT id FROM interconsulta_counterreferrals WHERE interconsulta_id = $1
    `, [interconsultaId])
    if (existing.rowCount) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 409, error: 'Esta interconsulta ya tiene una contrarreferencia registrada.' }
    }

    const result = await client.query(`
      INSERT INTO interconsulta_counterreferrals (
        interconsulta_id, final_diagnosis, indications, therapeutic_plan,
        attention_date, observations, specialist_establishment, specialist_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING interconsulta_id, final_diagnosis, indications, therapeutic_plan,
        to_char(attention_date, 'YYYY-MM-DD') AS attention_date,
        observations, specialist_name, created_at
    `, [
      interconsultaId,
      finalDiagnosis,
      indications,
      therapeuticPlan,
      attentionDate,
      observations || null,
      specialistEstablishment,
      actor.name,
    ])
    // La línea de tiempo es visible para el paciente: no incluye contenido clínico.
    await insertTimelineEvent(client, {
      interconsultaId,
      eventType: 'counterreferred',
      title: 'Contrarreferencia registrada',
      details: 'El especialista registró la contrarreferencia hacia el CESFAM de origen.',
      establishment: specialistEstablishment,
      professionalName: actor.name,
      actor,
      isDemo: true,
    })
    await client.query('COMMIT')
    transactionOpen = false
    return { status: 201, data: result.rows[0] }
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK')
    if (error.code === '23505') {
      return { status: 409, error: 'Esta interconsulta ya tiene una contrarreferencia registrada.' }
    }
    throw error
  } finally {
    client.release()
  }
}

export async function addToWaitlist(pool, {
  interconsultaId,
  especialidad,
  centroSolicitante,
  prioridadClinica,
  reason,
  actor = defaultActor,
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

    await insertTimelineEvent(client, {
      interconsultaId,
      eventType: 'waitlisted',
      title: 'Interconsulta incorporada a lista de espera',
      details: reason,
      establishment: centroSolicitante,
      actor,
    })
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
  actor,
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
        AND appointment_at > LOCALTIMESTAMP
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
    await insertTimelineEvent(client, {
      interconsultaId,
      eventType: prior ? 'appointment_rescheduled' : 'appointment_reserved',
      title: prior ? 'Cita reprogramada' : 'Cupo asignado',
      details: prior ? 'Reingreso desde lista de espera' : 'Reserva inicial',
      establishment: updated.rows[0].est,
      professionalName: updated.rows[0].doctor,
      actor,
    })
    const attendanceToken = await issueAttendanceToken(
      client,
      reservation.rows[0].id,
      cupoId,
    )

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
          attendanceToken,
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

export async function getAttendanceRequest(pool, token) {
  const result = await pool.query(`
    SELECT
      attendance.response,
      attendance.expires_at > NOW() AS is_valid,
      reservation.status AS reservation_status,
      reservation.interconsulta_id,
      to_char(slot.appointment_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS at,
      slot.doctor,
      slot.establishment AS est,
      slot.modalidad AS mod,
      slot.box
    FROM appointment_attendance_tokens AS attendance
    JOIN appointment_reservations AS reservation ON reservation.id = attendance.reservation_id
    JOIN appointment_slots AS slot ON slot.id = reservation.slot_id
    WHERE attendance.token_hash = $1
  `, [hashAttendanceToken(token)])

  if (result.rowCount === 0) return { status: 404, error: 'El enlace no es válido.' }
  const appointment = result.rows[0]
  if (!appointment.is_valid) return { status: 410, error: 'El enlace de respuesta venció.' }
  return {
    status: 200,
    data: {
      response: appointment.response,
      reservationStatus: appointment.reservation_status,
      interconsultaId: appointment.interconsulta_id,
      slot: {
        at: appointment.at,
        doctor: appointment.doctor,
        est: appointment.est,
        mod: appointment.mod,
        box: appointment.box,
      },
    },
  }
}

export async function respondToAttendance(pool, { token, response }) {
  const client = await pool.connect()
  let transactionOpen = false

  try {
    await client.query('BEGIN')
    transactionOpen = true
    const found = await client.query(`
      SELECT
        attendance.reservation_id,
        attendance.response AS attendance_response,
        attendance.expires_at > NOW() AS is_valid,
        reservation.slot_id,
        reservation.status AS reservation_status,
        reservation.interconsulta_id,
        reservation.especialidad,
        reservation.centro_solicitante,
        reservation.prioridad_clinica,
        to_char(slot.appointment_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS at,
        slot.doctor,
        slot.establishment AS est,
        slot.modalidad AS mod,
        slot.box
      FROM appointment_attendance_tokens AS attendance
      JOIN appointment_reservations AS reservation ON reservation.id = attendance.reservation_id
      JOIN appointment_slots AS slot ON slot.id = reservation.slot_id
      WHERE attendance.token_hash = $1
      FOR UPDATE OF attendance, reservation
    `, [hashAttendanceToken(token)])

    if (found.rowCount === 0) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 404, error: 'El enlace no es válido.' }
    }

    const appointment = found.rows[0]
    if (!appointment.is_valid) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 410, error: 'El enlace de respuesta venció.' }
    }
    if (appointment.attendance_response !== 'pending' || appointment.reservation_status !== 'active') {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 409, error: 'Esta cita ya tiene una respuesta registrada.' }
    }

    if (response === 'cancelled') {
      const reason = 'Cancelada por el paciente desde el enlace del correo.'
      await client.query(`
        UPDATE appointment_reservations
        SET status = 'cancelled', cancellation_reason = $2, updated_at = NOW()
        WHERE id = $1
      `, [appointment.reservation_id, reason])
      await client.query(`
        UPDATE appointment_slots
        SET cupos_disponibles = LEAST(total_cupos, cupos_disponibles + 1), updated_at = NOW()
        WHERE id = $1
      `, [appointment.slot_id])
      await client.query(`
        INSERT INTO appointment_reservation_events (reservation_id, action, reason, from_slot_id)
        VALUES ($1, 'cancelled', $2, $3)
      `, [appointment.reservation_id, reason, appointment.slot_id])
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
      `, [
        appointment.interconsulta_id,
        appointment.reservation_id,
        appointment.especialidad,
        appointment.centro_solicitante,
        appointment.prioridad_clinica,
        reason,
      ])
      await insertTimelineEvent(client, {
        interconsultaId: appointment.interconsulta_id,
        eventType: 'appointment_cancelled',
        title: 'Asistencia cancelada por el paciente',
        details: reason,
        establishment: appointment.est,
        professionalName: appointment.doctor,
        actor: attendanceActor,
      })
    } else {
      const reason = 'Asistencia confirmada por el paciente desde el enlace del correo.'
      await client.query(`
        INSERT INTO appointment_reservation_events (reservation_id, action, reason, to_slot_id)
        VALUES ($1, 'attendance_confirmed', $2, $3)
      `, [appointment.reservation_id, reason, appointment.slot_id])
      await insertTimelineEvent(client, {
        interconsultaId: appointment.interconsulta_id,
        eventType: 'appointment_confirmed',
        title: 'Asistencia confirmada',
        details: reason,
        establishment: appointment.est,
        professionalName: appointment.doctor,
        actor: attendanceActor,
      })
    }

    await client.query(`
      UPDATE appointment_attendance_tokens
      SET response = $2, responded_at = NOW()
      WHERE reservation_id = $1
    `, [appointment.reservation_id, response])
    await client.query('COMMIT')
    transactionOpen = false

    return {
      status: 200,
      data: {
        response,
        reservationStatus: response === 'cancelled' ? 'cancelled' : 'active',
        interconsultaId: appointment.interconsulta_id,
        slot: {
          at: appointment.at,
          doctor: appointment.doctor,
          est: appointment.est,
          mod: appointment.mod,
          box: appointment.box,
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

export async function cancelReservation(pool, { reservationId, reason, actor = defaultActor }) {
  const client = await pool.connect()
  let transactionOpen = false

  try {
    await client.query('BEGIN')
    transactionOpen = true
    const found = await client.query(`
      SELECT r.id, r.slot_id, r.status, r.interconsulta_id, r.especialidad,
             r.centro_solicitante, r.prioridad_clinica,
             to_char(s.appointment_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS at,
             s.doctor, s.establishment AS est, s.modalidad AS mod, s.box
      FROM appointment_reservations AS r
      JOIN appointment_slots AS s ON s.id = r.slot_id
      WHERE r.id = $1
      FOR UPDATE
    `, [reservationId])

    if (found.rowCount === 0) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 404, error: 'No se encontró la cita.' }
    }

    const reservation = found.rows[0]
    if (actor.role === 'medico' && !doctorOwnedReferralIds.has(reservation.interconsulta_id)) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 403, error: 'Esta cita no pertenece al médico auditor de demostración.' }
    }
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
    await insertTimelineEvent(client, {
      interconsultaId: reservation.interconsulta_id,
      eventType: 'appointment_cancelled',
      title: 'Cita cancelada',
      details: reason,
      establishment: reservation.est,
      professionalName: reservation.doctor,
      actor,
    })
    await client.query('COMMIT')
    transactionOpen = false
    return {
      status: 200,
      data: {
        reservationId,
        status: 'cancelled',
        reason,
        notification: {
          action: 'cancelled',
          interconsultaId: reservation.interconsulta_id,
          centroSolicitante: reservation.centro_solicitante,
          previousSlot: {
            at: reservation.at,
            doctor: reservation.doctor,
            est: reservation.est,
            mod: reservation.mod,
            box: reservation.box,
          },
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

export async function rescheduleReservation(pool, { reservationId, cupoId, reason, actor = defaultActor }) {
  const client = await pool.connect()
  let transactionOpen = false

  try {
    await client.query('BEGIN')
    transactionOpen = true
    const found = await client.query(`
      SELECT r.id, r.slot_id, r.status, r.interconsulta_id,
             r.centro_solicitante,
             to_char(s.appointment_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS at,
             s.doctor, s.establishment AS est, s.modalidad AS mod, s.box
      FROM appointment_reservations AS r
      JOIN appointment_slots AS s ON s.id = r.slot_id
      WHERE r.id = $1
      FOR UPDATE
    `, [reservationId])

    if (found.rowCount === 0) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 404, error: 'No se encontró la cita.' }
    }

    const reservation = found.rows[0]
    if (actor.role === 'medico' && !doctorOwnedReferralIds.has(reservation.interconsulta_id)) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { status: 403, error: 'Esta cita no pertenece al médico auditor de demostración.' }
    }
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
        AND appointment_at > LOCALTIMESTAMP
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
    await insertTimelineEvent(client, {
      interconsultaId: reservation.interconsulta_id,
      eventType: 'appointment_rescheduled',
      title: 'Cita reprogramada',
      details: reason,
      establishment: updated.rows[0].est,
      professionalName: updated.rows[0].doctor,
      actor,
    })
    const attendanceToken = await issueAttendanceToken(client, reservationId, cupoId)

    await client.query('COMMIT')
    transactionOpen = false
    return {
      status: 200,
      data: {
        reservationId,
        reason,
        slot: updated.rows[0],
        notification: {
          action: 'rescheduled',
          interconsultaId: reservation.interconsulta_id,
          centroSolicitante: reservation.centro_solicitante,
          previousSlot: {
            at: reservation.at,
            doctor: reservation.doctor,
            est: reservation.est,
            mod: reservation.mod,
            box: reservation.box,
          },
          nextSlot: updated.rows[0],
          reason,
          attendanceToken,
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
