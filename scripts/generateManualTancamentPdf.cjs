const fs = require('fs')
const path = require('path')
const { jsPDF } = require('jspdf')

const root = path.resolve(__dirname, '..')
const output = path.join(root, 'docs', 'Manual-tancament-operatiu.pdf')
const assets = path.join(root, 'docs', 'manual-tancament-operatiu-assets')
const fontRegular = 'C:\\Windows\\Fonts\\arial.ttf'
const fontBold = 'C:\\Windows\\Fonts\\arialbd.ttf'

const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

function registerFont(file, virtualName, family, style) {
  if (!fs.existsSync(file)) return false
  doc.addFileToVFS(virtualName, fs.readFileSync(file).toString('base64'))
  doc.addFont(virtualName, family, style)
  return true
}

const hasRegular = registerFont(fontRegular, 'Arial.ttf', 'Arial', 'normal')
const hasBold = registerFont(fontBold, 'Arial-Bold.ttf', 'Arial', 'bold')
const family = hasRegular && hasBold ? 'Arial' : 'helvetica'

const blue = [37, 99, 235]
const navy = [15, 23, 42]
const slate = [71, 85, 105]
const light = [241, 245, 249]

function header(section) {
  doc.setFillColor(...navy)
  doc.rect(0, 0, 210, 16, 'F')
  doc.setFont(family, 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text('CAL BLAY · MANUAL D’USUARI', 15, 10.5)
  doc.text(section, 195, 10.5, { align: 'right' })
}

function footer() {
  const page = doc.getNumberOfPages()
  doc.setDrawColor(226, 232, 240)
  doc.line(15, 282, 195, 282)
  doc.setFont(family, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...slate)
  doc.text('Tancament operatiu i correcció d’hores', 15, 288)
  doc.text(String(page), 195, 288, { align: 'right' })
}

function title(text, y) {
  doc.setFont(family, 'bold')
  doc.setFontSize(22)
  doc.setTextColor(...navy)
  doc.text(text, 15, y)
}

function paragraph(text, y, options = {}) {
  doc.setFont(family, options.bold ? 'bold' : 'normal')
  doc.setFontSize(options.size || 11)
  doc.setTextColor(...(options.color || slate))
  const lines = doc.splitTextToSize(text, options.width || 180)
  doc.text(lines, options.x || 15, y, { lineHeightFactor: 1.35 })
  return y + lines.length * (options.size || 11) * 0.48
}

function bullet(text, y, checked = false) {
  doc.setDrawColor(...(checked ? blue : slate))
  doc.roundedRect(16, y - 3.4, 4, 4, 0.7, 0.7)
  if (checked) {
    doc.setFont(family, 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...blue)
    doc.text('✓', 16.5, y)
  }
  return paragraph(text, y, { x: 24, width: 170, size: 10.5 }) + 2
}

function callout(text, y, color = blue) {
  const lines = doc.splitTextToSize(text, 164)
  const height = 12 + lines.length * 5.2
  doc.setFillColor(...light)
  doc.setDrawColor(...color)
  doc.roundedRect(15, y, 180, height, 3, 3, 'FD')
  doc.setFont(family, 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(...navy)
  doc.text(lines, 23, y + 9, { lineHeightFactor: 1.3 })
  return y + height
}

function image(file, y, maxHeight) {
  const data = fs.readFileSync(path.join(assets, file)).toString('base64')
  const props = doc.getImageProperties(`data:image/png;base64,${data}`)
  const width = 180
  const height = Math.min(maxHeight, (props.height / props.width) * width)
  const renderedWidth = (props.width / props.height) * height
  const x = 15 + (180 - renderedWidth) / 2
  doc.addImage(data, 'PNG', x, y, renderedWidth, height, undefined, 'FAST')
  return y + height
}

// Portada
doc.setFillColor(...navy)
doc.rect(0, 0, 210, 297, 'F')
doc.setFillColor(...blue)
doc.circle(181, 42, 42, 'F')
doc.setFont(family, 'bold')
doc.setFontSize(13)
doc.setTextColor(147, 197, 253)
doc.text('CAL BLAY', 20, 35)
doc.setFontSize(31)
doc.setTextColor(255, 255, 255)
doc.text(['Manual de tancament', 'operatiu i correcció', 'd’hores'], 20, 78, {
  lineHeightFactor: 1.15,
})
doc.setFont(family, 'normal')
doc.setFontSize(13)
doc.setTextColor(203, 213, 225)
doc.text('Guia ràpida per a responsables i comercials de Foodlovers', 20, 145)
doc.setDrawColor(71, 85, 105)
doc.line(20, 172, 190, 172)
doc.setFontSize(11)
doc.text('Tria el departament · Informa les hores · Desa · Consulta l’informe', 20, 190)
doc.setFontSize(9)
doc.text('Versió novembre 2026', 20, 275)

// Accés i departaments
doc.addPage()
header('1 · ACCÉS I DEPARTAMENTS')
title('1. Obrir el tancament operatiu', 32)
let y = 45
y = bullet('Entra a Esdeveniments.', y)
y = bullet('Obre l’esdeveniment que vols tancar.', y)
y = bullet('Prem Tancament operatiu i entra a Hores reals.', y)
y += 3
title('2. Triar el departament', y + 8)
y += 21
y = paragraph('A la part superior veuràs només els departaments implicats en l’esdeveniment: Cuina, Serveis i/o Logística.', y)
y = image('01-departaments.png', y + 5, 112)
y = callout('Si apareix “Aquest departament és només de consulta”, podràs veure les dades però no modificar-les.', y + 6)
footer()

// Informar hores
doc.addPage()
header('2 · INFORMAR LES HORES')
title('3. Informar les hores reals', 32)
y = 47
y = paragraph('Pots introduir una hora per persona o utilitzar Hora de finalització comuna per aplicar la mateixa hora a totes les persones presents.', y)
y = image('02-desar-hores.png', y + 5, 154)
y += 5
y = bullet('No ha vingut: marca una absència.', y)
y = bullet('Ha arribat tard: informa l’hora real d’arribada.', y)
y = bullet('Ha marxat abans: registra una sortida anticipada.', y)
y = bullet('Quan hagis acabat, prem Desar hores reals.', y)
footer()

// Correccions i informe
doc.addPage()
header('3 · CORRECCIONS I INFORME')
title('4. Corregir unes hores ja desades', 32)
y = 47
y = paragraph('Si canvies una hora ja desada, apareixerà el camp obligatori Motiu de la correcció. Escriu una explicació curta i concreta.', y)
y = image('03-correccio-informe.png', y + 5, 132)
y += 5
y = callout('En desar, el sistema registra l’usuari, la data, el departament, el valor anterior, el valor nou i el motiu.', y)
title('5. Consultar el resultat', y + 18)
y += 31
y = paragraph('Entra a Informes → Esdeveniments. Les hores modificades apareixen amb l’estat Corregit i mostren el motiu. Si tens permís, pots prémer Corregir hores per tornar a obrir el mateix editor.', y)
footer()

// Checklist
doc.addPage()
header('4 · COMPROVACIÓ FINAL')
title('Abans de sortir', 32)
y = 52
y = bullet('He seleccionat el departament correcte.', y)
y = bullet('He revisat totes les persones.', y)
y = bullet('He informat absències, retards o sortides anticipades.', y)
y = bullet('He premut Desar hores reals.', y)
y = bullet('Si era una correcció, he indicat el motiu.', y)
y += 12
y = callout('Si només veus un departament o els camps estan bloquejats, demana que et revisin els permisos de tancament operatiu i d’edició interdepartamental.', y, [245, 158, 11])
footer()

fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, Buffer.from(doc.output('arraybuffer')))
console.log(output)
