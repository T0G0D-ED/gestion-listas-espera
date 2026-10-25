CREATE TABLE IF NOT EXISTS appointment_slots (
  id TEXT PRIMARY KEY,
  appointment_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  doctor TEXT NOT NULL,
  establishment TEXT NOT NULL,
  comuna TEXT NOT NULL,
  modalidad TEXT NOT NULL,
  box TEXT NOT NULL,
  total_cupos INTEGER NOT NULL CHECK (total_cupos >= 0),
  cupos_disponibles INTEGER NOT NULL CHECK (
    cupos_disponibles >= 0 AND cupos_disponibles <= total_cupos
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appointment_reservations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slot_id TEXT NOT NULL REFERENCES appointment_slots(id),
  interconsulta_id TEXT NOT NULL,
  centro_solicitante TEXT NOT NULL,
  especialidad TEXT NOT NULL DEFAULT 'Traumatología adulto',
  prioridad_clinica SMALLINT NOT NULL DEFAULT 0 CHECK (prioridad_clinica BETWEEN 0 AND 3),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  cancellation_reason TEXT,
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE appointment_reservations
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS especialidad TEXT NOT NULL DEFAULT 'Traumatología adulto',
  ADD COLUMN IF NOT EXISTS prioridad_clinica SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE appointment_reservations
  ALTER COLUMN status SET DEFAULT 'active';

UPDATE appointment_reservations
SET status = 'active'
WHERE status = 'reserved';

ALTER TABLE appointment_reservations
  DROP CONSTRAINT IF EXISTS appointment_reservations_status_check;

ALTER TABLE appointment_reservations
  ADD CONSTRAINT appointment_reservations_status_check
  CHECK (status IN ('active', 'cancelled'));

CREATE TABLE IF NOT EXISTS appointment_reservation_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reservation_id BIGINT NOT NULL REFERENCES appointment_reservations(id),
  action TEXT NOT NULL CHECK (action IN ('reserved', 'rescheduled', 'cancelled', 'attendance_confirmed')),
  reason TEXT NOT NULL,
  from_slot_id TEXT REFERENCES appointment_slots(id),
  to_slot_id TEXT REFERENCES appointment_slots(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE appointment_reservation_events
  DROP CONSTRAINT IF EXISTS appointment_reservation_events_action_check;

ALTER TABLE appointment_reservation_events
  ADD CONSTRAINT appointment_reservation_events_action_check
  CHECK (action IN ('reserved', 'rescheduled', 'cancelled', 'attendance_confirmed'));

CREATE TABLE IF NOT EXISTS appointment_attendance_tokens (
  reservation_id BIGINT PRIMARY KEY REFERENCES appointment_reservations(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  response TEXT NOT NULL DEFAULT 'pending'
    CHECK (response IN ('pending', 'confirmed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS appointment_waitlist (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  interconsulta_id TEXT NOT NULL UNIQUE,
  reservation_id BIGINT REFERENCES appointment_reservations(id),
  especialidad TEXT NOT NULL,
  centro_solicitante TEXT NOT NULL,
  prioridad_clinica SMALLINT NOT NULL DEFAULT 0 CHECK (prioridad_clinica BETWEEN 0 AND 3),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'scheduled', 'withdrawn')),
  motivo TEXT NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interconsulta_timeline_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  interconsulta_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'created', 'reviewed', 'priority_changed', 'waitlisted',
      'appointment_reserved', 'appointment_rescheduled', 'appointment_cancelled',
      'appointment_confirmed', 'returned', 'rejected', 'resubmitted', 'counterreferred'
    )
  ),
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  establishment TEXT NOT NULL,
  professional_name TEXT,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('medico', 'administrativo', 'sistema')),
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_key TEXT UNIQUE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE interconsulta_timeline_events
  DROP CONSTRAINT IF EXISTS interconsulta_timeline_events_event_type_check;

ALTER TABLE interconsulta_timeline_events
  ADD CONSTRAINT interconsulta_timeline_events_event_type_check
  CHECK (
    event_type IN (
      'created', 'reviewed', 'priority_changed', 'waitlisted',
      'appointment_reserved', 'appointment_rescheduled', 'appointment_cancelled',
      'appointment_confirmed', 'returned', 'rejected', 'resubmitted', 'counterreferred'
    )
  );

CREATE TABLE IF NOT EXISTS interconsulta_review_workflow (
  interconsulta_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'returned', 'rejected')),
  issuer_establishment TEXT NOT NULL,
  issuer_professional TEXT NOT NULL,
  observations TEXT,
  missing_exams TEXT,
  rejection_reason TEXT,
  issuer_response TEXT,
  added_exams TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  returned_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  resubmitted_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS interconsulta_counterreferrals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  interconsulta_id TEXT NOT NULL UNIQUE
    REFERENCES interconsulta_review_workflow (interconsulta_id),
  final_diagnosis TEXT NOT NULL CHECK (length(btrim(final_diagnosis)) > 0),
  indications TEXT NOT NULL CHECK (length(btrim(indications)) > 0),
  therapeutic_plan TEXT NOT NULL CHECK (length(btrim(therapeutic_plan)) > 0),
  attention_date DATE,
  observations TEXT,
  specialist_establishment TEXT NOT NULL,
  specialist_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE interconsulta_review_workflow
  DROP CONSTRAINT IF EXISTS interconsulta_review_workflow_status_check;

ALTER TABLE interconsulta_review_workflow
  ADD CONSTRAINT interconsulta_review_workflow_status_check
  CHECK (status IN ('pending', 'returned', 'rejected', 'counterreferred'));

ALTER TABLE interconsulta_counterreferrals
  ADD COLUMN IF NOT EXISTS document_hash TEXT,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_by TEXT;

CREATE INDEX IF NOT EXISTS interconsulta_counterreferrals_unread_idx
  ON interconsulta_counterreferrals (created_at DESC)
  WHERE read_at IS NULL;

INSERT INTO interconsulta_review_workflow (
  interconsulta_id, status, issuer_establishment, issuer_professional
)
SELECT
  'IC-2026-' || LPAD((183 + sample.number)::text, 6, '0'),
  'pending',
  'CESFAM Nuevo Horizonte',
  'Profesional emisor de demostración'
FROM generate_series(1, 16) AS sample(number)
ON CONFLICT (interconsulta_id) DO NOTHING;

INSERT INTO appointment_reservation_events (reservation_id, action, reason, to_slot_id)
SELECT r.id, 'reserved', 'Reserva registrada antes del historial', r.slot_id
FROM appointment_reservations AS r
WHERE NOT EXISTS (
  SELECT 1
  FROM appointment_reservation_events AS event
  WHERE event.reservation_id = r.id
);

INSERT INTO interconsulta_timeline_events (
  interconsulta_id, event_type, title, details, establishment,
  professional_name, actor_name, actor_role, event_at, source_key
)
SELECT
  r.interconsulta_id,
  CASE event.action
    WHEN 'reserved' THEN 'appointment_reserved'
    WHEN 'rescheduled' THEN 'appointment_rescheduled'
    WHEN 'cancelled' THEN 'appointment_cancelled'
    WHEN 'attendance_confirmed' THEN 'appointment_confirmed'
  END,
  CASE event.action
    WHEN 'reserved' THEN 'Cupo asignado'
    WHEN 'rescheduled' THEN 'Cita reprogramada'
    WHEN 'cancelled' THEN 'Cita cancelada'
    WHEN 'attendance_confirmed' THEN 'Asistencia confirmada'
  END,
  event.reason,
  COALESCE(to_slot.establishment, from_slot.establishment, r.centro_solicitante),
  COALESCE(to_slot.doctor, from_slot.doctor),
  'Sistema (evento histórico)',
  'sistema',
  event.created_at,
  'reservation-event:' || event.id::text
FROM appointment_reservation_events AS event
JOIN appointment_reservations AS r ON r.id = event.reservation_id
LEFT JOIN appointment_slots AS to_slot ON to_slot.id = event.to_slot_id
LEFT JOIN appointment_slots AS from_slot ON from_slot.id = event.from_slot_id
ON CONFLICT (source_key) DO NOTHING;

INSERT INTO interconsulta_timeline_events (
  interconsulta_id, event_type, title, details, establishment,
  professional_name, actor_name, actor_role, event_at, source_key, is_demo
)
SELECT
  'IC-2026-' || LPAD((183 + sample_id.number)::text, 6, '0'),
  sample.event_type,
  sample.title,
  sample.details,
  'CESFAM Nuevo Horizonte',
  CASE WHEN sample.event_type = 'reviewed' THEN 'Dr. Kosme Fulanito' ELSE NULL END,
  sample.actor_name,
  sample.actor_role,
  NOW() - sample.days_ago * INTERVAL '1 day',
  'demo:' || sample_id.number::text || ':' || sample.event_type,
  TRUE
FROM generate_series(1, 16) AS sample_id(number)
CROSS JOIN (VALUES
  ('created', 'Interconsulta creada', 'Ingreso de ejemplo al sistema.', 'Equipo CESFAM Nuevo Horizonte', 'administrativo', 90),
  ('reviewed', 'Interconsulta revisada', 'Revisión inicial de antecedentes registrada en el prototipo.', 'Dr. Kosme Fulanito', 'medico', 65),
  ('priority_changed', 'Prioridad clínica actualizada', 'Prioridad de ejemplo actualizada durante la revisión.', 'Dr. Kosme Fulanito', 'medico', 45)
) AS sample(event_type, title, details, actor_name, actor_role, days_ago)
ON CONFLICT (source_key) DO UPDATE SET
  professional_name = EXCLUDED.professional_name,
  actor_name = EXCLUDED.actor_name;

CREATE INDEX IF NOT EXISTS appointment_slots_at_idx
  ON appointment_slots (appointment_at);

CREATE INDEX IF NOT EXISTS appointment_reservations_status_idx
  ON appointment_reservations (status, reserved_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS appointment_reservations_one_active_per_referral_idx
  ON appointment_reservations (interconsulta_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS appointment_reservation_events_reservation_idx
  ON appointment_reservation_events (reservation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS appointment_waitlist_priority_fifo_idx
  ON appointment_waitlist (prioridad_clinica DESC, entered_at ASC, id ASC)
  WHERE status = 'waiting';

CREATE INDEX IF NOT EXISTS interconsulta_timeline_events_referral_idx
  ON interconsulta_timeline_events (interconsulta_id, event_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS interconsulta_review_workflow_status_idx
  ON interconsulta_review_workflow (status, updated_at DESC);
