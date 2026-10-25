import { jsPDF } from 'jspdf'

// Debe coincidir con computeCounterReferralHash() del backend (mismo orden de campos).
export async function computeDocumentHash(item) {
  if (!globalThis.crypto?.subtle) return null
  const canonical = JSON.stringify([
    item.interconsulta_id,
    item.final_diagnosis,
    item.indications,
    item.therapeutic_plan,
    item.attention_date ?? '',
    item.observations ?? '',
    item.specialist_name,
  ])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function formatDateTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'No disponible'
    : new Intl.DateTimeFormat('es-CL', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date)
}

export async function downloadCounterReferralPdf(item) {
  const localHash = await computeDocumentHash(item)
  const integrity = localHash === null
    ? 'No verificable en este contexto del navegador'
    : localHash === item.document_hash
      ? 'Verificada: el contenido coincide con el hash registrado'
      : 'NO coincide con el hash registrado'

  const pdf = new jsPDF()
  const left = 20
  const width = 170
  let y = 24
  const ensureSpace = needed => {
    if (y + needed > 275) {
      pdf.addPage()
      y = 24
    }
  }
  const heading = text => {
    ensureSpace(14)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    pdf.setTextColor(15, 92, 85)
    pdf.text(text, left, y)
    y += 6
  }
  const paragraph = (text, { size = 11, color = 30 } = {}) => {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(size)
    pdf.setTextColor(color)
    for (const line of pdf.splitTextToSize(String(text || '—'), width)) {
      ensureSpace(6)
      pdf.text(line, left, y)
      y += size * 0.5
    }
    y += 5
  }

  pdf.setProperties({ title: `Contrarreferencia ${item.interconsulta_id}` })
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(18)
  pdf.setTextColor(30)
  pdf.text('Red Salud Pública', left, y)
  y += 10
  pdf.setFontSize(14)
  pdf.text('Contrarreferencia (contra-derivación)', left, y)
  y += 6
  pdf.setDrawColor(15, 92, 85)
  pdf.line(left, y, left + width, y)
  y += 9

  heading('Datos de la interconsulta')
  paragraph(
    `Folio: ${item.interconsulta_id}\n`
    + `Destino (CESFAM): ${item.issuer_establishment}\n`
    + `Profesional emisor: ${item.issuer_professional}\n`
    + `Establecimiento de especialidad: ${item.specialist_establishment ?? ''}\n`
    + `Especialista: ${item.specialist_name}\n`
    + `Fecha de atención: ${item.attention_date ? item.attention_date.split('-').reverse().join('-') : 'No informada'}`,
  )
  heading('Diagnóstico final')
  paragraph(item.final_diagnosis)
  heading('Indicaciones')
  paragraph(item.indications)
  heading('Plan terapéutico')
  paragraph(item.therapeutic_plan)
  if (item.observations) {
    heading('Observaciones para el CESFAM')
    paragraph(item.observations)
  }

  ensureSpace(60)
  y += 4
  pdf.setDrawColor(150)
  pdf.line(left, y, left + width, y)
  y += 8
  heading('Firma electrónica simple (prototipo de demostración)')
  paragraph(
    `Firmado por: ${item.specialist_name}\n`
    + `Fecha y hora de firma: ${formatDateTime(item.created_at)}\n`
    + `Integridad: ${integrity}`,
    { size: 10 },
  )
  pdf.setFont('courier', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(60)
  pdf.text('Hash SHA-256 del contenido:', left, y)
  y += 4
  pdf.text(pdf.splitTextToSize(item.document_hash || 'No disponible', width), left, y)
  y += 12
  paragraph(
    'Este documento NO es una firma electrónica avanzada ni tiene validez legal: '
    + 'el sistema es una demostración sin certificado digital ni identidad institucional. '
    + 'El hash permite detectar cambios posteriores al contenido registrado.',
    { size: 8, color: 100 },
  )

  pdf.save(`contrarreferencia-${item.interconsulta_id}.pdf`)
}