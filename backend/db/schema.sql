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
  interconsulta_id TEXT NOT NULL UNIQUE,
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

DO $$
BEGIN
  ALTER TABLE appointment_reservations
    ADD CONSTRAINT appointment_reservations_status_check
    CHECK (status IN ('active', 'cancelled'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS appointment_reservation_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reservation_id BIGINT NOT NULL REFERENCES appointment_reservations(id),
  action TEXT NOT NULL CHECK (action IN ('reserved', 'rescheduled', 'cancelled')),
  reason TEXT NOT NULL,
  from_slot_id TEXT REFERENCES appointment_slots(id),
  to_slot_id TEXT REFERENCES appointment_slots(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

INSERT INTO appointment_reservation_events (reservation_id, action, reason, to_slot_id)
SELECT r.id, 'reserved', 'Reserva registrada antes del historial', r.slot_id
FROM appointment_reservations AS r
WHERE NOT EXISTS (
  SELECT 1
  FROM appointment_reservation_events AS event
  WHERE event.reservation_id = r.id
);

CREATE INDEX IF NOT EXISTS appointment_slots_at_idx
  ON appointment_slots (appointment_at);

CREATE INDEX IF NOT EXISTS appointment_reservations_status_idx
  ON appointment_reservations (status, reserved_at DESC);

CREATE INDEX IF NOT EXISTS appointment_reservation_events_reservation_idx
  ON appointment_reservation_events (reservation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS appointment_waitlist_priority_fifo_idx
  ON appointment_waitlist (prioridad_clinica DESC, entered_at ASC, id ASC)
  WHERE status = 'waiting';
