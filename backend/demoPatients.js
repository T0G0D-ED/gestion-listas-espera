const firstReferralNumber = 184
const demoPatientCount = 16

function formatRut(body) {
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-0`
}

export const demoPatients = Array.from({ length: demoPatientCount }, (_value, index) => {
  const referralNumber = firstReferralNumber + index
  const interconsultaId = `IC-2026-${String(referralNumber).padStart(6, '0')}`
  const rutBody = `90${String(referralNumber).padStart(6, '0')}`
  return {
    rut: formatRut(rutBody),
    normalizedRut: `${rutBody}0`,
    interconsultaId,
  }
})

export function normalizeRut(value) {
  return typeof value === 'string'
    ? value.replace(/[.\-\s]/g, '').toUpperCase()
    : ''
}

export function isRutFormatValid(value) {
  return /^\d{7,8}[0-9K]$/.test(normalizeRut(value))
}

export function findDemoPatientByRut(value) {
  const normalizedRut = normalizeRut(value)
  return demoPatients.find(patient => patient.normalizedRut === normalizedRut) ?? null
}
