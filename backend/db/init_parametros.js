import { pool } from './pool.js';

export async function inicializarParametros() {
    const query = `
        CREATE TABLE IF NOT EXISTS parametros_prioridad (
            id SERIAL PRIMARY KEY,
            categoria VARCHAR(50) UNIQUE NOT NULL,      -- Ej: C1, C2, C3, C4
            descripcion VARCHAR(150),                    -- Ej: Emergencia vital, Urgencia, etc.
            tiempo_maximo_horas INT NOT NULL             -- Límite máximo de espera en horas
        );

        INSERT INTO parametros_prioridad (categoria, descripcion, tiempo_maximo_horas)
        VALUES 
            ('C1', 'Emergencia con riesgo vital', 2),
            ('C2', 'Urgencia alta', 12),
            ('C3', 'Prioridad media', 48),
            ('C4', 'No urgente / Control electivo', 168)
        ON CONFLICT (categoria) DO NOTHING;
    `;
    await pool.query(query);
}