const express = require('express'); //Importar framework web de node
const app = express(); //Crear app
const PORT = process.env.PORT || 3000; //Definir puerto

app.use(express.json()); // Transformar formularios a lenguaje entendible


// BD simulada temporal
let cuposDisponibles = [
    { id: 1, centroSalud: "Hospital Central", especialidad: "Medicina General", estado: "disponible" },
    { id: 2, centroSalud: "CESFAM Norte", especialidad: "Pediatria", estado: "disponible" },
    { id: 3, centroSalud: "Clínica Sur", especialidad: "Cardiologia", estado: "reservado" }
];


// Tarea 5: Endpoint para consultar cupos disponibles
app.get('/api/cupos', (req, res) => {
    res.status(200).json({
        total: cuposDisponibles.length,
        data: cuposDisponibles
    });
});


// Tarea 5 y 6: Endpoint para reservar cupo con validacion de no doble asignacion
app.post('/api/cupos/reservar', (req, res) => {
    const { cupoId, pacienteRut, centroSolicitante } = req.body;

    // Validación básica de entrada
    if (!cupoId || !pacienteRut || !centroSolicitante) {
        return res.status(400).json({
            error: "Faltan datos obligatorios (cupoId, pacienteRut, centroSolicitante)"
        });
    }

    // Buscar el cupo en la base de datos centralizada
    const cupo = cuposDisponibles.find(c => c.id === parseInt(cupoId));

    if (!cupo) {
        return res.status(404).json({ error: "El cupo solicitado no existe en la red asistencial." });
    }

    // Tarea #6: Validación que impide doble asignación si ya está tomado
    if (cupo.estado !== "disponible") {
        return res.status(409).json({
            error: `Conflicto: El cupo ya fue asignado previamente y no está disponible para ${centroSolicitante}.`
        });
    }

    // Asignación del cupo
    cupo.estado = "reservado";
    cupo.pacienteRut = pacienteRut;
    cupo.asignadoPor = centroSolicitante;
    cupo.fechaReserva = new Date().toISOString();

    return res.status(200).json({
        message: "Cupo reservado con éxito en la red asistencial",
        cupo
    });
});

app.listen(PORT, () => {
    console.log(`Servidor de Red Asistencial corriendo en http://localhost:${PORT}`);
});