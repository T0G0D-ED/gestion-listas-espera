/**
 * Componente modular para creación de interconsultas (Tareas #54, #55, #70).
 * Diseño adaptado para coincidir con la estética del sistema (Tailwind-like).
 */
export function FormularioInterconsulta() {
    const contenedor = document.createElement('div');
    
    // Estilos base para emular el diseño limpio y moderno de la captura
    contenedor.style.cssText = `
        background-color: #ffffff;
        border-radius: 12px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        padding: 2rem;
        margin: 2rem 0;
        font-family: system-ui, -apple-system, sans-serif;
        max-width: 800px;
    `;

    contenedor.innerHTML = `
        <h3 style="color: #0f766e; font-weight: 700; margin-bottom: 1.5rem; font-size: 1.5rem;">
            Crear Nueva Interconsulta
        </h3>
        
        <form id="form-interconsulta">
            <!-- Diagnóstico -->
            <div style="margin-bottom: 1.5rem;">
                <label for="diagnostico" style="display: block; font-weight: 600; color: #374151; margin-bottom: 0.5rem; font-size: 0.95rem;">
                    Diagnóstico o Criterio Clínico:
                </label>
                <select id="diagnostico" required style="
                    width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 8px; 
                    font-size: 1rem; color: #1f2937; background-color: #fff; outline: none;
                    transition: border-color 0.2s;
                ">
                    <option value="">-- Seleccione un diagnóstico --</option>
                    <option value="C1_ONCO" data-prioridad="C1">Sospecha de Neoplasia / Caso Oncológico (Urgente)</option>
                    <option value="C2_CARDO" data-prioridad="C2">Inestabilidad Hemodinámica / Síntoma Severo</option>
                    <option value="C3_GENERAL" data-prioridad="C3">Consulta General Específica</option>
                    <option value="C4_ELECTIVO" data-prioridad="C4">Control Electivo / Rutina</option>
                </select>
            </div>

            <!-- Tarea #54: Sugerencia Automática (Estilo Alerta Moderna) -->
            <div id="box-sugerencia" class="d-none" style="
                background-color: #f0fdfa; border-left: 4px solid #0d9488; 
                padding: 1rem; border-radius: 6px; margin-bottom: 1.5rem;
            ">
                <div style="font-weight: 700; color: #0f766e; font-size: 0.95rem;">
                    Prioridad Sugerida por Sistema: <span id="badge-sugerido" style="background-color: #0d9488; color: white; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.85rem; margin-left: 0.5rem;">--</span>
                </div>
                <p style="color: #4b5563; font-size: 0.85rem; margin-top: 0.25rem; margin-bottom: 0;">
                    Basado en criterios clínicos estandarizados.
                </p>
            </div>

            <!-- Prioridad Definitiva -->
            <div style="margin-bottom: 1.5rem;">
                <label for="prioridad-seleccionada" style="display: block; font-weight: 600; color: #374151; margin-bottom: 0.5rem; font-size: 0.95rem;">
                    Prioridad Definitiva Asignada:
                </label>
                <select id="prioridad-seleccionada" required disabled style="
                    width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 8px; 
                    font-size: 1rem; color: #1f2937; background-color: #fff; outline: none;
                    transition: border-color 0.2s;
                ">
                    <option value="">-- Seleccione Prioridad --</option>
                    <option value="C1">C1 - Emergencia / Riesgo Vital</option>
                    <option value="C2">C2 - Urgencia Alta</option>
                    <option value="C3">C3 - Prioridad Media</option>
                    <option value="C4">C4 - No Urgente / Electivo</option>
                </select>
            </div>

            <!-- Tarea #55: Justificación de Anulación -->
            <div id="group-justificacion" class="d-none" style="margin-bottom: 1.5rem;">
                <label for="justificacion-clinica" style="display: block; font-weight: 700; color: #b91c1c; margin-bottom: 0.5rem; font-size: 0.95rem;">
                    ⚠️ Justificación Clínica de Anulación (Obligatoria):
                </label>
                <textarea id="justificacion-clinica" rows="3" placeholder="Indique el motivo profesional por el cual modifica la prioridad recomendada..." style="
                    width: 100%; padding: 0.75rem; border: 1px solid #fca5a5; border-radius: 8px; 
                    font-size: 1rem; color: #1f2937; background-color: #fef2f2; outline: none; resize: vertical;
                "></textarea>
                <div style="color: #dc2626; font-size: 0.8rem; margin-top: 0.25rem;">
                    Ha cambiado la prioridad sugerida. Debe fundamentar su decisión clínica.
                </div>
            </div>

            <!-- Botón Principal (Estilo Teal/Green de la captura) -->
            <button type="submit" style="
                width: 100%; background-color: #0f766e; color: white; font-weight: 600; 
                padding: 0.875rem; border: none; border-radius: 8px; font-size: 1rem; cursor: pointer;
                transition: background-color 0.2s; margin-top: 0.5rem;
            " onmouseover="this.style.backgroundColor='#0d9488'" onmouseout="this.style.backgroundColor='#0f766e'">
                Confirmar y Enviar Interconsulta
            </button>
        </form>
        
        <div id="form-feedback" style="margin-top: 1rem;"></div>
    `;

    // --- Lógica Interna (Idéntica a la versión anterior, solo cambia la UI) ---
    let prioridadSugeridaGlobal = null;
    const nivelPrioridad = { 'C1': 1, 'C2': 2, 'C3': 3, 'C4': 4 };

    const selectDiagnostico = contenedor.querySelector('#diagnostico');
    const selectPrioridad = contenedor.querySelector('#prioridad-seleccionada');
    const boxSugerencia = contenedor.querySelector('#box-sugerencia');
    const badgeSugerido = contenedor.querySelector('#badge-sugerido');
    const groupJustificacion = contenedor.querySelector('#group-justificacion');
    const inputJustificacion = contenedor.querySelector('#justificacion-clinica');
    const form = contenedor.querySelector('#form-interconsulta');
    const feedback = contenedor.querySelector('#form-feedback');

    // Tarea #54: Evaluar sugerencia
    selectDiagnostico.addEventListener('change', () => {
        const opcion = selectDiagnostico.options[selectDiagnostico.selectedIndex];
        if (!opcion.value) {
            boxSugerencia.classList.add('d-none');
            selectPrioridad.disabled = true;
            selectPrioridad.value = '';
            return;
        }

        prioridadSugeridaGlobal = opcion.getAttribute('data-prioridad');
        badgeSugerido.textContent = prioridadSugeridaGlobal;
        boxSugerencia.classList.remove('d-none');
        
        selectPrioridad.disabled = false;
        selectPrioridad.value = prioridadSugeridaGlobal;
        validarAnulacion();
    });

    // Tarea #55: Validar anulación
    selectPrioridad.addEventListener('change', validarAnulacion);

    function validarAnulacion() {
        const prioridadDefinitiva = selectPrioridad.value;
        if (!prioridadDefinitiva || !prioridadSugeridaGlobal) {
            groupJustificacion.classList.add('d-none');
            inputJustificacion.required = false;
            return;
        }

        const nivelSugerido = nivelPrioridad[prioridadSugeridaGlobal] || 4;
        const nivelFinal = nivelPrioridad[prioridadDefinitiva] || 4;

        if (nivelFinal > nivelSugerido) {
            groupJustificacion.classList.remove('d-none');
            inputJustificacion.required = true;
        } else {
            groupJustificacion.classList.add('d-none');
            inputJustificacion.required = false;
            inputJustificacion.value = '';
        }
    }

    // Envío del formulario
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        feedback.innerHTML = '<div style="color: #6b7280; text-align: center;">Procesando...</div>';

        const payload = {
            uuid: crypto.randomUUID(),
            paciente_rut: "12.345.678-9", 
            centro_salud: "CESFAM Norte",  
            especialidad: selectDiagnostico.options[selectDiagnostico.selectedIndex].text,
            prioridad_sugerida: prioridadSugeridaGlobal,
            prioridad_final: selectPrioridad.value,
            justificacion_anulacion: inputJustificacion.value || null
        };

        try {
            const res = await fetch('http://localhost:3000/api/interconsultas', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-demo-profile': 'medico' 
                },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (res.ok) {
                feedback.innerHTML = `
                    <div style="
                        background-color: #ecfdf5; border-left: 4px solid #10b981; 
                        padding: 1rem; border-radius: 6px; color: #065f46; font-weight: 500;
                    ">
                        ✅ Interconsulta registrada exitosamente.<br>
                        <small style="color: #047857; font-weight: normal;">ID: ${data.data.uuid}</small>
                    </div>`;
                form.reset();
                boxSugerencia.classList.add('d-none');
                groupJustificacion.classList.add('d-none');
                selectPrioridad.disabled = true;
            } else {
                feedback.innerHTML = `
                    <div style="
                        background-color: #fef2f2; border-left: 4px solid #ef4444; 
                        padding: 1rem; border-radius: 6px; color: #991b1b; font-weight: 500;
                    ">
                        ❌ Error: ${data.error}
                    </div>`;
            }
        } catch (err) {
            feedback.innerHTML = '<div style="color: #dc2626; text-align: center;">❌ Error de conexión con el servidor.</div>';
        }
    });

    return contenedor;
}