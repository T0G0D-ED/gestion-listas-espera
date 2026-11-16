# Casos de prueba funcionales

Estos casos cubren reserva y notificación de un cupo, y consulta del historial de interconsulta por RUT. Se ejecutan solo con datos ficticios en un entorno local aislado.

## Preparación y repetibilidad

1. Usa una base PostgreSQL desechable y exclusiva para QA; no uses producción ni una base compartida. Configura `DATABASE_URL` en el `.env` local para apuntar a esa base.
2. Para repetir los casos de reserva, recrea esa base QA vacía antes de cada caso y ejecuta desde la carpeta del proyecto:

   ```powershell
   npm run db:migrate
   npm run db:seed
   ```

   No basta con volver a ejecutar el seed sobre una base usada: el seed conserva las reservas activas y recalcula la disponibilidad.
3. Comprueba el estado inicial con estas consultas. Para las pruebas de reserva, `c1` debe estar vigente y tener un cupo; las IC 184 y 185 no deben tener reservas activas:

   ```sql
   SELECT id, appointment_at > LOCALTIMESTAMP AS es_futuro, cupos_disponibles
   FROM appointment_slots
   WHERE id = 'c1';

   SELECT interconsulta_id, COUNT(*) AS reservas_activas
   FROM appointment_reservations
   WHERE status = 'active'
     AND interconsulta_id IN ('IC-2026-000184', 'IC-2026-000185')
   GROUP BY interconsulta_id;
   ```

   El primer resultado debe mostrar `es_futuro = true` y `cupos_disponibles = 1`; la segunda consulta debe devolver cero filas.
4. Inicia backend y frontend según las instrucciones del README. Usa una sesión de navegador limpia por ejecución (sin datos anteriores de `localStorage` ni operaciones pendientes offline) y confirma que el navegador está conectado.
5. Para comprobar un envío real en el caso exitoso, configura `RESEND_API_KEY` y `RESEND_TEST_EMAIL` con credenciales de prueba y un destinatario permitido/verificado. Nunca incluyas credenciales en la evidencia.

La migración carga hitos de demostración para la interconsulta 184. El seed actualiza las 12 citas de ejemplo a fechas futuras; `c1` tiene una plaza, correspondiente a Hospital Comunitario El Pino, San Bernardo, presencial.

## CP-ADM-01 — Reserva confirmada y notificación enviada (éxito)

**Precondiciones**

- Base QA preparada según la sección anterior; `c1` tiene una plaza libre.
- Sin reserva activa para `IC-2026-000184`.
- Sesión limpia, conectada, perfil **Administrativo CESFAM**.
- Servicio de correo configurado para enviar a un destinatario de prueba verificado.

**Datos de prueba**

| Campo | Valor |
|---|---|
| Filtro de establecimiento | Todos los establecimientos |
| Filtro de modalidad | Todas |
| Rango de fechas | Rango por defecto; debe incluir la próxima fecha de `c1` |
| Cupo | `c1` — Hospital Comunitario El Pino, presencial, 1 plaza |
| Interconsulta | `IC-2026-000184` |
| Centro solicitante | CESFAM Nuevo Horizonte |
| Destinatario | Valor de prueba configurado en `RESEND_TEST_EMAIL` |

**Pasos**

1. Abre **Interconsultas** y verifica que el ID actual sea `IC-2026-000184`.
2. Deja los filtros en sus valores indicados y pulsa **Buscar cupos**.
3. Selecciona `c1`, revisa los datos mostrados y pulsa **Confirmar selección**.
4. Revisa el comprobante y el correo enviado al destinatario de prueba.

**Resultado esperado**

- La reserva se confirma una sola vez; la API responde `201`.
- El comprobante indica que el correo fue enviado (`notification.sent = true`).
- Llega un correo al destinatario de prueba con la IC y los datos de la cita, sin RUT ni datos clínicos.
- En PostgreSQL hay una reserva activa para `IC-2026-000184` en `c1`, se registra el evento de reserva y `c1` queda con cero plazas disponibles.

## CP-ADM-02 — Conflicto al intentar reservar el último cupo (error)

**Precondiciones**

- Reestablece el baseline QA antes de ejecutar este caso: `c1` futuro con una plaza libre y sin reservas activas para las IC 184 y 185.
- Dos sesiones limpias de navegador, ambas conectadas y con perfil **Administrativo CESFAM**.
- Las dos sesiones cargan la lista antes de hacer una reserva, para conservar el mismo estado inicial en pantalla.

**Datos de prueba**

| Sesión | Interconsulta | Cupo |
|---|---|---|
| A | `IC-2026-000184` | `c1` |
| B | `IC-2026-000185` | `c1` |

**Pasos**

1. En ambas sesiones, busca y selecciona `c1` mientras aparece disponible.
2. En la sesión B, pulsa **Siguiente interconsulta** antes de reservar y confirma que el ID sea `IC-2026-000185`.
3. Confirma la reserva en la sesión A y espera el resultado exitoso.
4. Sin actualizar la sesión B, confirma allí la selección obsoleta de `c1`.

**Resultado esperado**

- La reserva de A se completa; consume la única plaza.
- La solicitud de B es rechazada por el servidor con `409`; la pantalla informa que el cupo ya no tiene disponibilidad y actualiza la lista.
- No se crea una reserva activa para `IC-2026-000185`, ni se envía una notificación para ese intento.
- La base queda con una sola reserva activa en `c1` y cero plazas disponibles. No se debe registrar el resultado de B como una reserva exitosa.

## CP-PAC-01 — Consulta del historial asociado al RUT (éxito)

**Precondiciones**

- Backend y frontend iniciados, base local con `npm run db:migrate` ejecutado y API disponible.
- Los datos son de demostración; no se necesita introducir información clínica real.
- Perfil **Paciente** en la página **Inicio**.

**Datos de prueba**

| Campo | Valor esperado |
|---|---|
| RUT ficticio | `90.000.184-0` |
| Interconsulta asociada | `IC-2026-000184` |

**Pasos**

1. Abre **Inicio / Portal del paciente**.
2. Ingresa `90.000.184-0` y pulsa **Consultar**.

**Resultado esperado**

- La API responde `200` y asocia el RUT a `IC-2026-000184`.
- La interfaz muestra el identificador de esa IC y su línea de tiempo con los hitos simulados cargados por la migración.
- No aparece información perteneciente a otra interconsulta.

## CP-PAC-02 — RUT inválido o sin interconsulta asociada (error)

**Precondiciones**

- Backend y frontend iniciados; portal del paciente accesible.
- Usar los mismos datos ficticios del ambiente QA; no modificar la base entre variantes.

**Datos de prueba y variantes**

| Variante | RUT | Respuesta esperada |
|---|---|---|
| Formato inválido | `no-es-un-rut` | HTTP `400`, mensaje de formato válido |
| Formato válido no registrado | `12.345.678-9` | HTTP `404`, mensaje de que no existe interconsulta asociada |

**Pasos**

1. Ingresa el RUT de la primera variante y pulsa **Consultar**.
2. Verifica el error y que no se muestre un ID ni eventos de historial.
3. Repite con el RUT válido no registrado y verifica la respuesta correspondiente.

**Resultado esperado**

- La primera variante se rechaza por formato; la segunda por no estar asociada a un RUT ficticio de demostración.
- Ninguna variante muestra la línea de tiempo de otro paciente ni genera una consulta exitosa.

## Evidencia a guardar en cada ejecución

Completa y conserva este registro junto a la evidencia de pantalla:

| Dato | Registro |
|---|---|
| Caso y variante ejecutados | |
| Fecha/hora y responsable | |
| Identificador de la base QA (sin credenciales) | |
| Baseline comprobado: cupos/estado de IC | |
| Datos de prueba utilizados | |
| Resultado observado y esperado (aprobado/reprobado) | |
| Código HTTP o mensaje de interfaz | |
| Estado de notificación, si aplica (sin guardar claves) | |
| Captura de pantalla sin datos personales reales | |

Para repetir, vuelve a preparar la base QA antes de cada caso de reserva y repite las mismas precondiciones y datos. Los casos del portal son de solo lectura y pueden repetirse con los mismos RUT ficticios.
