import { jsPDF } from 'jspdf'

export function downloadReceiptPdf(slot, receiptId) {
  const date = new Date(slot.at)
  const dateLabel = new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
  const timeLabel = new Intl.DateTimeFormat('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)

  const pdf = new jsPDF()
  pdf.setProperties({ title: `Comprobante de cita ${receiptId}` })
  pdf.setFontSize(18)
  pdf.text('Red Salud Publica', 20, 24)
  pdf.setFontSize(14)
  pdf.text('Comprobante de cita', 20, 36)
  pdf.setDrawColor(15, 92, 85)
  pdf.line(20, 42, 190, 42)
  pdf.setFontSize(10)
  pdf.text(`Folio: ${receiptId}`, 20, 51)
  pdf.setFontSize(12)
  pdf.text('Fecha', 20, 67)
  pdf.setFontSize(11)
  pdf.text(dateLabel, 20, 74)
  pdf.setFontSize(12)
  pdf.text('Hora', 20, 88)
  pdf.setFontSize(11)
  pdf.text(timeLabel, 20, 95)
  pdf.setFontSize(12)
  pdf.text('Hospital / establecimiento', 20, 109)
  pdf.setFontSize(11)
  pdf.text(pdf.splitTextToSize(slot.est, 165), 20, 116)
  pdf.setFontSize(12)
  pdf.text('Box', 20, 136)
  pdf.setFontSize(11)
  pdf.text(slot.box, 20, 143)
  pdf.setFontSize(12)
  pdf.text('Profesional', 20, 157)
  pdf.setFontSize(11)
  pdf.text(slot.doctor, 20, 164)
  pdf.setFontSize(9)
  pdf.setTextColor(100)
  pdf.text('Presenta este comprobante al llegar a tu cita.', 20, 184)
  pdf.save(`comprobante-cita-${slot.id}.pdf`)
}
