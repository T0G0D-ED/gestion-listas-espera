# Gestión de Listas de Espera en Atención Primaria de Salud (APS)

## Descripción

### Problema
En los Centros de Salud Familiar (CESFAM) de comunas con alta demanda, la derivación e interconsulta hacia la atención secundaria presenta severas fallas de sincronización. Al gestionarse mediante planillas y registros dispersos entre establecimientos, los equipos de salud enfrentan dificultades para priorizar casos según criterios clínicos y mantener informados a los pacientes sobre sus tiempos de espera. Esta falta de un mecanismo centralizado y confiable genera incertidumbre, reclamos y el riesgo constante de postergar atenciones clínicamente urgentes.

### Solución propuesta
Se propone el desarrollo de un sistema centralizado de gestión y seguimiento de interconsultas y derivaciones para la red asistencial de atención primaria y secundaria. La plataforma permite a los equipos médicos, administrativos y a los propios pacientes conocer el estado en tiempo real de sus solicitudes, ofreciendo soporte a la priorización clínica, operatividad offline-first para mitigar problemas de conectividad intermitente y resguardo de la confidencialidad de la información médica.

---

## Integrantes
- Gonzalo Yuseff
- Francisco Molinet
- Maximiliano Parra

---

## Arquitectura
**Aplicación web con soporte offline acotado**

* **Frontend:** PWA multipágina servida por Vite, con cola local de reservas pendientes en IndexedDB.
* **Backend:** API Express que consulta y modifica PostgreSQL central; los hitos unificados se guardan en `interconsulta_timeline_events`.
* **Sincronización:** Al recuperar conectividad, el navegador intenta enviar las reservas pendientes. La base central aplica las validaciones y puede rechazar conflictos; no hay resolución automática de conflictos ni sincronización de cambios generales.
* **Alcance de seguridad:** Esta versión de demostración no implementa inicio de sesión, autorización por roles ni cifrado de datos en IndexedDB. No la uses con datos personales o clínicos reales ni la expongas a Internet sin implementar y revisar esos controles.

---

## Tecnologías

* **Frontend:** HTML5, CSS3, Tailwind CSS, JavaScript (ES6+) / Progressive Web App (PWA) / Service Workers (para gestión de caché y conectividad intermitente).
* **Backend:** Node.js, Express.js.
* **Base de Datos:** PostgreSQL (Servidor Central) + IndexedDB / SQLite (Cálculo local y soporte Offline).
* **Control de Versiones & Gestión:** Git, GitHub.

## Casos de prueba funcionales

Los casos de éxito y error para reserva de cupos, notificación y consulta del historial del paciente, junto con sus precondiciones, datos de prueba y pasos repetibles, están documentados en [CASOS_PRUEBA.md](./CASOS_PRUEBA.md).

## API y PostgreSQL

La API central expone `GET /api/cupos` para consultar cupos futuros disponibles y `POST /api/cupos/reservar` para reservar una plaza. También permite consultar el historial de citas activas y canceladas con `GET /api/reservas`, reprogramarlas con `PATCH /api/reservas/:id/reprogramar` y cancelarlas con `PATCH /api/reservas/:id/cancelar`. Las reprogramaciones y cancelaciones requieren un motivo; al seleccionar `Otro` también se exige describirlo. Estas operaciones mantienen el historial de cambios y actualizan la disponibilidad dentro de transacciones PostgreSQL.

Los correos de reserva y reprogramación incluyen una plantilla con los datos variables de la cita y enlaces para confirmar o cancelar la asistencia. Cada enlace usa un token aleatorio de un solo uso, almacenado en la base únicamente como hash y con vencimiento al día siguiente de la cita. El enlace abre `/asistencia.html` y no cambia nada hasta que la persona confirma la acción en esa página; confirmar registra la respuesta, mientras que cancelar también libera el cupo y devuelve la interconsulta a la lista de espera. Tras ejecutar la nueva migración, configura `PUBLIC_APP_URL` con la URL pública del frontend para que los enlaces del correo apunten a la instancia correcta.

La lista de espera se consulta con `GET /api/lista-espera` y se registra con `POST /api/lista-espera`, enviando interconsulta, especialidad, centro, motivo y prioridad clínica de 0 a 3. Se ordena por prioridad descendente y, en empate, por antigüedad. Cancelar una cita (`PATCH /api/reservas/:id/cancelar`) la devuelve al final de su nivel de prioridad; reprogramarla (`PATCH /api/reservas/:id/reprogramar`) conserva la cita en el nuevo horario y libera el anterior. Al reservar desde la lista, el registro pasa a `scheduled`.

### Modelo de priorización clínica (en preparación)

La lista de espera permite asociar diagnósticos con sistema y versión de codificación (`CIE-10` o `CIE-11`), además de registrar evaluaciones por código/versión de escala, puntaje, rango, fecha y profesional evaluador. `POST /api/lista-espera` acepta los arreglos opcionales `diagnoses` y `severityAssessments`; `GET /api/lista-espera` los devuelve con cada registro. Las reglas configurables se almacenan en `waitlist_priority_rules`, con especialidad, diagnóstico, escala/umbral, prioridad resultante, versión, evidencia y aprobación.

No se cargan reglas clínicas activas ni se calcula la prioridad automáticamente: la prioridad 0–3 sigue siendo ingresada por el profesional y ordena la lista como antes. CIE identifica y clasifica diagnósticos, pero no determina por sí mismo la urgencia de una persona. No se debe usar coincidencia por prefijo de código para asignar prioridad. Antes de activar reglas, un equipo clínico debe aprobar las combinaciones exactas de diagnóstico, escala, umbral y prioridad, documentar evidencia, resolver casos de datos incompletos o discordantes, y definir revisión/versionado y responsabilidad. El modelo de datos no sustituye ese protocolo ni la validación prospectiva.

Para evaluación clínica en Traumatología adulto, se pueden considerar como candidatos —no como reglas aprobadas— una escala numérica de dolor 0–10 y medidas funcionales específicas por articulación como KOOS (rodilla) o HOOS (cadera). No son intercambiables ni, por sí solas, escalas de urgencia o de priorización de listas. KOOS/HOOS requieren revisar permisos de uso antes de incorporarlas; este repositorio no reproduce sus cuestionarios. La selección final, traducción/versión validada y puntos de corte deben definirse con especialistas y validarse en la población y flujo local. Referencias: [clasificación CIE de la OMS](https://www.who.int/standards/classifications/classification-of-diseases) y [permisos KOOS/HOOS](https://koos.nu/).

La línea de tiempo tiene una página propia en `/timeline.html`, enlazada en la navegación entre **Interconsultas** y **Cupos tomados**. Permite consultar una interconsulta por su identificador y usa inicialmente el último ID seleccionado en Interconsultas. La API `GET /api/interconsultas/:id/linea-tiempo` devuelve eventos nuevos de lista de espera y citas, además del historial de reservas, reprogramaciones y cancelaciones. Para las 16 interconsultas de demostración también se crean hitos ficticios de ingreso, revisión y prioridad, identificados en la respuesta con `is_demo: true` y en pantalla como **Datos simulados · demo**. Los perfiles de la interfaz son una simulación: no autentican ni autorizan usuarios. No usar esta funcionalidad con datos reales hasta integrar identidad institucional, permisos en el servidor y eventos clínicos verificados.

El perfil **Médico auditor · Dr. Kosme Fulanito** muestra las 16 interconsultas de demostración asignadas en **Interconsultas**, con opciones para devolverlas con observaciones/exámenes requeridos o rechazarlas definitivamente con justificación obligatoria. Una devolución se notifica a `RESEND_TEST_EMAIL`; si Resend falla, la devolución queda guardada y la interfaz informa del problema. El rechazo es terminal. El perfil Administrativo CESFAM dispone de **Devueltas al CESFAM** para agregar una respuesta y/o exámenes y reenviar el mismo ID al auditor, sin modificar el contenido original. Los cambios quedan anotados en la línea de tiempo. En el perfil del médico, **Cupos tomados** solo presenta citas vinculadas a sus interconsultas de demostración y permite cancelarlas o reprogramarlas. Ejecuta `npm run db:migrate` para crear y sembrar el estado inicial del flujo. Los perfiles siguen siendo una simulación local, no controles de acceso productivos.

El menú de perfil de la esquina superior derecha permite cambiar entre **Administrativo CESFAM** y **Paciente**. El perfil Paciente abre **Inicio**, una vista pública adaptable para consultar la línea de tiempo asociada al RUT, sin ClaveÚnica ni código de verificación en esta simulación. `GET /api/pacientes/linea-tiempo?rut=...` resuelve únicamente RUTs ficticios asociados uno a uno con las 16 interconsultas de demostración; `GET /api/pacientes/ruts-demostracion` lista esos pares para probar la interfaz. Esta búsqueda no autentica la identidad ni debe usarse con RUTs, pacientes o datos clínicos reales.

### Inicio rápido con Docker Compose

Requisitos: Docker Desktop (incluye Docker Compose) en ejecución. Desde la carpeta del proyecto, inicia la aplicación completa:

```powershell
docker compose up --build
```

En el primer inicio se crea PostgreSQL, se aplican las migraciones y se cargan los datos de demostración si la base está vacía. Luego abre `http://localhost:5173`; la API queda disponible en `http://localhost:3000/api/health`. Deja la terminal abierta mientras uses la aplicación. Para detener los servicios, pulsa `Ctrl+C` y ejecuta `docker compose down`.

Los datos de PostgreSQL se conservan en el volumen `postgres_data` al detener los contenedores. Las credenciales incluidas en Compose son solo para desarrollo local: no las uses en producción. Para habilitar correos de prueba, define `RESEND_API_KEY` y `RESEND_TEST_EMAIL` en el entorno o en el `.env` local antes de iniciar Compose; sin ellas, las funciones que envían correo no estarán configuradas.

El sembrado automático solo ocurre cuando la tabla de cupos está vacía, así no se desplazan las fechas de demostración en cada reinicio. Si quieres actualizar esas fechas manualmente, ejecuta `docker compose exec backend npm run db:seed`; esto también modifica las fechas de reservas asociadas y debe usarse solo con datos de demostración.

### Inicio local sin Docker

Para iniciar el backend local:

Requisitos: Node.js con npm y un servidor PostgreSQL en funcionamiento. Desde PowerShell, abre la carpeta del proyecto y ejecuta:

```powershell
cd "C:\ruta\al\proyecto\gestion-listas-espera"
npm install
```

Crea un archivo `.env` en la carpeta principal del proyecto (junto a `package.json`). No lo publiques ni compartas: contiene credenciales. Configura la URL de tu base PostgreSQL, los orígenes autorizados y las variables de Resend para notificaciones de prueba:

```dotenv
DATABASE_URL=postgresql://USUARIO:CONTRASENA@localhost:5432/NOMBRE_BASE
PORT=3000
FRONTEND_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
PUBLIC_APP_URL=http://localhost:5173
RESEND_API_KEY=re_REEMPLAZAR_POR_TU_CLAVE
RESEND_TEST_EMAIL=tu-correo-verificado@example.com
```

Reemplaza los valores de ejemplo por los de tu instalación. Si la contraseña contiene caracteres especiales, codifícalos para usarlos en una URL. El archivo `.env` está excluido de Git.

Al reservar, reprogramar o cancelar una cita, el backend envía un aviso a `RESEND_TEST_EMAIL` mediante Resend; nunca toma el destinatario del navegador. Al confirmar una reserva, el comprobante informa si el correo de prueba se envió correctamente o si falló. Para este flujo de prueba se usa el remitente `onboarding@resend.dev`, admitido por Resend para envíos de prueba a destinatarios permitidos/verificados. Los correos incluyen el ID de interconsulta, centro, datos de la cita y, si aplica, el motivo, pero no nombre, RUT ni información clínica. La operación de la cita se conserva aunque Resend no esté disponible y la página informa si falló el envío. No reutilices una clave que haya sido expuesta; revócala en Resend y agrega una clave nueva solo en el `.env` local.

Antes de continuar, inicia PostgreSQL y crea la base de datos indicada en `DATABASE_URL` si todavía no existe. Ejecuta las migraciones y los datos de ejemplo una vez:

```powershell
npm run db:migrate
npm run db:seed
```

Si vencen las fechas de demostración, vuelve a ejecutar `npm run db:seed`: actualizará los 12 cupos ficticios a sus próximas fechas semanales y recalculará la disponibilidad según las reservas activas. Esto también cambia la fecha de las reservas asociadas; úsalo solo con datos de demostración.

Si ya tenías instalada una versión anterior, vuelve a ejecutar `npm run db:migrate` para crear el historial unificado de la línea de tiempo y cargar sus hitos de demostración.

Inicia el backend en una ventana de PowerShell y déjala abierta:

```powershell
npm run dev:backend
```

En otra ventana, inicia el frontend:

```powershell
npm run dev
```

Abre la dirección que indique Vite, normalmente `http://localhost:5173`. Puedes comprobar la API en `http://localhost:3000/api/health`.

En la aplicación, el enlace **Cupos tomados** de la navegación abre una página con las citas activas (`/reservas.html`). Puedes filtrar por IC, doctor, hospital y fecha. Desde ahí se puede reprogramar a otro cupo disponible o cancelar; ambas acciones abren un modal, exigen seleccionar un motivo, y `Otro` requiere una descripción.

La pantalla **Interconsultas** incluye interconsultas de ejemplo desde `IC-2026-000184` hasta `IC-2026-000199`. Usa **Siguiente interconsulta** en el contexto para avanzar a una que todavía no tenga una cita activa y probar varias reservas. El control de última sincronización en ambas páginas muestra la fecha y hora de la última carga correcta.

En **Interconsultas**, el contador de pendientes muestra las reservas guardadas en la cola local de IndexedDB. Selecciona el contador para desplegar las interconsultas que esperan subirse al servidor, con el cupo, establecimiento, profesional y hora en que se encolaron. Si no hay conexión, se puede guardar una reserva para sincronizarla cuando la conexión vuelva; al sincronizarse correctamente se elimina de la cola y el contador y el detalle se actualizan.

Al terminar un intento de sincronización, la pantalla muestra una notificación emergente de éxito si todas las interconsultas se enviaron, o una advertencia con el resultado y el primer error si quedaron elementos pendientes. Las notificaciones se pueden cerrar manualmente y desaparecen automáticamente.

### Permitir el acceso desde otros equipos de la misma red

Estos pasos permiten que otros equipos de la misma red local (por ejemplo, el mismo Wi-Fi) abran la aplicación alojada en este equipo. El equipo que la aloja debe permanecer encendido y ambos equipos deben seguir conectados a la red.

1. En el equipo anfitrión, averigua su dirección IPv4 privada ejecutando `ipconfig` en PowerShell. Busca la dirección IPv4 del adaptador Wi-Fi o Ethernet activo, por ejemplo `192.168.1.25`.
2. Añade esa dirección a `FRONTEND_ORIGINS` en el `.env` de la carpeta principal. Sustituye el ejemplo por la IP real:

   ```dotenv
   FRONTEND_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://192.168.1.25:5173
   ```

3. Reinicia el backend (Ctrl+C y vuelve a ejecutar `npm run dev:backend`) para que cargue el cambio.
4. En una tercera ventana de PowerShell, inicia Vite escuchando en la red local:

   ```powershell
   npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
   ```

5. Si Windows muestra una alerta de Firewall, permite el acceso a Node.js en redes privadas. Si no aparece, crea una regla de entrada para TCP en el puerto `5173` en el Firewall de Windows, limitada a redes privadas. No es necesario abrir el puerto `3000` a los otros equipos; Vite reenvía las llamadas a la API desde el equipo anfitrión.
6. Desde otro equipo conectado a la misma red, abre `http://192.168.1.25:5173`, reemplazando la IP de ejemplo por la del anfitrión.

Si cambia la IP del anfitrión, actualiza `FRONTEND_ORIGINS`, reinicia el backend y usa la nueva dirección en el navegador. Si el puerto `5173` ya está ocupado, libera ese puerto o cambia el puerto y actualiza también `FRONTEND_ORIGINS` y la dirección que compartirás.

### Acceso por Internet

Los pasos anteriores son solo para una red local; no hacen que la aplicación sea accesible desde cualquier lugar de Internet. Para eso hay que desplegar el frontend y la API en un servicio accesible públicamente, configurar PostgreSQL, dominio, HTTPS, CORS y controles de acceso, y asegurar la operación y las copias de seguridad. No expongas directamente el servidor de desarrollo de Vite ni esta API en una red pública. La autenticación institucional y la autorización por roles deben implementarse antes de usar el sistema con información clínica real.

La reserva recibe `cupoId`, `interconsultaId` y `centroSolicitante`; se usa el identificador de interconsulta y no el RUT del paciente. Antes de desplegar en la red asistencial, el endpoint debe derivar el centro y la identidad desde autenticación institucional; CORS no reemplaza autenticación ni autorización.

---

## Organización del Repositorio

```text
.
|-- backend/                     # API Express, lógica de negocio y persistencia
|   |-- db/
|   |   |-- migrate.js           # Migraciones del esquema PostgreSQL
|   |   |-- init.js              # Migra y siembra datos solo si la base está vacía
|   |   |-- pool.js              # Conexión y pool de PostgreSQL
|   |   |-- schema.sql           # Esquema de la base de datos
|   |   `-- seed.js              # Datos de demostración
|   |-- app.js                   # Aplicación Express y endpoints
|   |-- server.js                # Inicio del servidor HTTP
|   |-- cuposRepository.js       # Acceso a datos de cupos y reservas
|   |-- demoPatients.js          # Datos ficticios para pacientes de demostración
|   |-- resendNotifications.js   # Notificaciones de correo mediante Resend
|   `-- *.test.js                # Pruebas del backend
|-- frontend/                    # Aplicación multipágina y PWA (raíz de Vite)
|   |-- assets/                  # Estilos e iconos
|   |-- components/              # Componentes de interfaz compartidos
|   |-- data/                    # Datos estáticos servidos por Vite
|   |-- pages/                   # Logica de cada página y service worker
|   |-- services/                # Cliente API, comprobantes y cola offline
|   `-- *.html                   # Entradas multipágina (interconsultas, reservas, etc.)
|-- src/assets/index.html        # HTML residual; no es la raíz de la aplicacion Vite
|-- correr-cesfam.md             # Guía operativa para ejecutar el sistema
|-- registro_daily_scrum.docx    # Registro de seguimiento del equipo
|-- compose.yaml                 # Servicios locales: PostgreSQL, API y frontend
|-- Dockerfile                   # Imagen Node.js para los servicios de la aplicación
|-- vite.config.js               # Configuración de Vite, proxy API y PWA
|-- package.json                 # Dependencias y scripts de desarrollo, pruebas y base de datos
|-- package-lock.json            # Versiones exactas de dependencias npm
|-- .gitignore                   # Exclusiones de Git (incluye .env y artefactos generados)
`-- README.md                    # Descripción, configuracion y uso del proyecto
```

Las carpetas `node_modules/` y `frontend/dist/` contienen dependencias instaladas y archivos generados por el build, respectivamente; no son codigo fuente.
