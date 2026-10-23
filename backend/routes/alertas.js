import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();


// Tarea #64: Endpoint/Proceso para detectar casos que alcanzan >= 80% de su limite
// GET /api/alertas/criticas
router.get('/criticas', async (req, res) => {
    try {
        // Asegurar de que la tabla 'interconsultas' exista en esta base de datos local
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS interconsultas (
                uuid UUID PRIMARY KEY,
                paciente_rut VARCHAR(20) NOT NULL,
                centro_salud VARCHAR(100),
                especialidad VARCHAR(100),
                prioridad VARCHAR(10) NOT NULL,
                fecha_creacion TIMESTAMP NOT NULL DEFAULT NOW(),
                estado VARCHAR(20) DEFAULT 'pendiente'
            );
        `;
        await pool.query(createTableQuery);

        // Consulta SQL original solicitada por tu instruccion
        const query = `
            SELECT 
                i.uuid,
                i.paciente_rut,
                i.centro_salud,
                i.especialidad,
                i.prioridad,
                i.fecha_creacion,
                p.tiempo_maximo_horas,
                ROUND(
                    EXTRACT(EPOCH FROM (NOW() - i.fecha_creacion))/3600
                )::INT AS horas_transcurridas,
                ROUND(
                    (EXTRACT(EPOCH FROM (NOW() - i.fecha_creacion))/3600) / p.tiempo_maximo_horas * 100
                )::INT AS porcentaje_tiempo_usado
            FROM interconsultas i
            JOIN parametros_prioridad p ON UPPER(i.prioridad) = UPPER(p.categoria)
            WHERE i.estado = 'pendiente'
              AND ((EXTRACT(EPOCH FROM (NOW() - i.fecha_creacion))/3600) / p.tiempo_maximo_horas) >= 0.80
            ORDER BY porcentaje_tiempo_usado DESC;
        `;

        const { rows } = await pool.query(query);

        return res.status(200).json({
            total_alertas: rows.length,
            alertas: rows
        });
    } catch (error) {
        console.error('Error al calcular alertas críticas (#64):', error);
        return res.status(500).json({ error: 'Error interno al procesar alertas críticas' });
    }
});

export default router;