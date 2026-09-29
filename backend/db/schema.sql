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
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS appointment_slots_at_idx
  ON appointment_slots (appointment_at);
