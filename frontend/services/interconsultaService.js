
 //Genera una nueva estructura de interconsulta de forma local.
 //crypto.randomUUID() para asegurar un ID unico universal y evitar
 //colisiones en escenarios Offline-First.
 
 //@param {Object} datosPaciente Contiene la informacion ingresada en el formulario.
 //@returns {Object} Objeto de la interconsulta listo para guardarse localmente.
 
export function crearInterconsultaLocal(datosPaciente) {
    const nuevaInterconsulta = {
        // Genera un UUID v4 estandar de forma nativa 
        uuid: crypto.randomUUID(), 
        pacienteRut: datosPaciente.rut,
        prioridad: datosPaciente.prioridad, // Ej: C1, C2, C3
        fechaCreacion: new Date().toISOString(),
        estado: 'pendiente'
    };

    console.log("Interconsulta creada localmente con UUID:", nuevaInterconsulta.uuid);
    return nuevaInterconsulta;
}