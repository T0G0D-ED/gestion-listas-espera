import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

// Tarea #16. Endpoint para obtener lista de espera priorizada
router.get('/', async (req, res) => {
    try {
        const query = `
            SELECT 
                id,
                paciente_rut,
                paciente_nombre,
                categoria_prioridad,
                indice_prioridad,
                fecha_ingreso,
                estado
            FROM lista_espera
            WHERE estado = 'pendiente'
            ORDER BY 
                indice_prioridad DESC, 
                fecha_ingreso ASC;
        `;
        const { rows } = await pool.query(query);
        return res.status(200).json({
            total: rows.length,
            pacientes: rows
        });
    } catch (error) {
        console.error('Error al consultar lista priorizada:', error);
        return res.status(500).json({ error: 'Error al obtener lista de espera' });
    }
});

export default router;