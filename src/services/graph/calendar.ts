import { storageAdmin } from '@/lib/firebaseAdmin'
import { getGraphToken } from '@/services/sharepoint/graph'

type KickoffAttendee = {
  email: string
  name?: string
}

type CreateKickoffEventInput = {
  organizerEmail: string
  subject: string
  startDateTime: string
  endDateTime: string
  notes?: string
  attendees: KickoffAttendee[]
  projectName: string
}

type GraphEventResponse = {
  id?: string
  webLink?: string
  onlineMeeting?: {
    joinUrl?: string
  }
}

type SendKickoffNotificationEmailInput = {
  organizerEmail: string
  recipients: KickoffAttendee[]
  subject: string
  projectName: string
  startDateTime: string
  endDateTime: string
  notes?: string
}

type CreateProjectMeetingEventInput = {
  organizerEmail: string
  subject: string
  startDateTime: string
  endDateTime: string
  notes?: string
  attendees: KickoffAttendee[]
  projectName: string
  scope: 'block' | 'task'
  scopeName: string
  blockName?: string
  attachments?: Array<{
    name: string
    path: string
    contentType?: string | null
  }>
}

type SendProjectMeetingNotificationEmailInput = {
  organizerEmail: string
  recipients: KickoffAttendee[]
  subject: string
  projectName: string
  startDateTime: string
  endDateTime: string
  notes?: string
  scope: 'block' | 'task'
  scopeName: string
  blockName?: string
  attachments?: Array<{
    name: string
    path: string
    contentType?: string | null
  }>
}

type ProjectRecipient = {
  email: string
  name?: string
}

type SendBlockAssignmentEmailInput = {
  senderEmail: string
  recipient: ProjectRecipient
  projectName: string
  blockName: string
  deadline?: string
}

type CreateBlockDeadlineEventInput = {
  assigneeEmail: string
  projectName: string
  blockName: string
  deadline: string
}

type SendTaskAssignmentEmailInput = {
  senderEmail: string
  recipient: ProjectRecipient
  projectName: string
  blockName: string
  taskName: string
  deadline?: string
}

type CreateTaskDeadlineEventInput = {
  assigneeEmail: string
  projectName: string
  blockName: string
  taskName: string
  deadline: string
}

type SendProjectMissedActivityEmailInput = {
  senderEmail: string
  recipient: ProjectRecipient
  channelName: string
  projectName?: string
  roomName?: string
  messageCount: number
  messages: Array<{
    senderName?: string
    body?: string
    createdAt?: number
  }>
  url?: string
}

type SendMaintenanceSupplierEmailInput = {
  senderEmail: string
  recipient: ProjectRecipient
  subject: string
  ticketCode: string
  location: string
  machine?: string
  description: string
  priority?: string
  createdAt?: number | string | null
  reference?: string | null
  message?: string
  attachments?: Array<{
    name: string
    path: string
    contentType?: string | null
  }>
}

type SendMaintenanceHistoryEmailInput = {
  senderEmail: string
  recipient: ProjectRecipient
  subject: string
  templateName: string
  periodicity?: string | null
  location?: string | null
  recordsCount: number
  validatedCount: number
  message?: string
  attachments?: Array<{
    name: string
    path: string
    contentType?: string | null
  }>
}

type SendMaintenanceCompletedEmailInput = {
  senderEmail: string
  recipient: ProjectRecipient
  subject: string
  title: string
  templateName?: string | null
  worker?: string | null
  status?: string | null
  completedAt?: string | number | null
  checklistDoneCount?: number
  checklistTotalCount?: number
  message?: string
  attachments?: Array<{
    name: string
    path: string
    contentType?: string | null
  }>
}

async function getAccessToken() {
  const tokenData = await getGraphToken()
  return typeof tokenData === 'string' ? tokenData : tokenData.access_token
}

export async function createKickoffCalendarEvent(input: CreateKickoffEventInput) {
  const accessToken = await getAccessToken()

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(input.organizerEmail)}/events`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        subject: input.subject,
        body: {
          contentType: 'HTML',
          content: buildKickoffHtml(input.projectName, input.notes),
        },
        start: {
          dateTime: input.startDateTime,
          timeZone: 'Europe/Madrid',
        },
        end: {
          dateTime: input.endDateTime,
          timeZone: 'Europe/Madrid',
        },
        attendees: input.attendees.map((attendee) => ({
          emailAddress: {
            address: attendee.email,
            name: attendee.name || attendee.email,
          },
          type: 'required',
        })),
        isReminderOn: true,
        allowNewTimeProposals: true,
      }),
      cache: 'no-store',
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`No s ha pogut crear la convocatoria Outlook: ${response.status} ${text}`)
  }

  const data = (await response.json()) as GraphEventResponse
  return {
    id: data.id || '',
    webLink: data.webLink || '',
    joinUrl: data.onlineMeeting?.joinUrl || '',
  }
}

export async function sendKickoffNotificationEmail(input: SendKickoffNotificationEmailInput) {
  const accessToken = await getAccessToken()
  const recipients = input.recipients
    .map((attendee) => ({
      emailAddress: {
        address: attendee.email,
        name: attendee.name || attendee.email,
      },
    }))
    .filter((recipient) => recipient.emailAddress.address.includes('@'))

  if (recipients.length === 0) return

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(input.organizerEmail)}/sendMail`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          subject: input.subject,
          body: {
            contentType: 'HTML',
            content: buildKickoffEmailHtml({
              projectName: input.projectName,
              startDateTime: input.startDateTime,
              endDateTime: input.endDateTime,
              notes: input.notes,
            }),
          },
          toRecipients: recipients,
        },
        saveToSentItems: true,
      }),
      cache: 'no-store',
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`No s ha pogut enviar el correu de convocatoria: ${response.status} ${text}`)
  }
}

export async function createProjectMeetingCalendarEvent(input: CreateProjectMeetingEventInput) {
  const accessToken = await getAccessToken()

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(input.organizerEmail)}/events`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        subject: input.subject,
        body: {
          contentType: 'HTML',
          content: buildProjectMeetingHtml(input),
        },
        start: {
          dateTime: input.startDateTime,
          timeZone: 'Europe/Madrid',
        },
        end: {
          dateTime: input.endDateTime,
          timeZone: 'Europe/Madrid',
        },
        attendees: input.attendees.map((attendee) => ({
          emailAddress: {
            address: attendee.email,
            name: attendee.name || attendee.email,
          },
          type: 'required',
        })),
        isReminderOn: true,
        allowNewTimeProposals: true,
      }),
      cache: 'no-store',
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`No s ha pogut crear la convocatoria Outlook: ${response.status} ${text}`)
  }

  const data = (await response.json()) as GraphEventResponse
  if (data.id && Array.isArray(input.attachments) && input.attachments.length > 0) {
    await attachFilesToGraphEvent(input.organizerEmail, data.id, input.attachments)
  }
  return {
    id: data.id || '',
    webLink: data.webLink || '',
    joinUrl: data.onlineMeeting?.joinUrl || '',
  }
}

export async function sendProjectMeetingNotificationEmail(
  input: SendProjectMeetingNotificationEmailInput
) {
  const accessToken = await getAccessToken()
  const attachments = await buildMailAttachments(input.attachments || [])
  const recipients = input.recipients
    .map((attendee) => ({
      emailAddress: {
        address: attendee.email,
        name: attendee.name || attendee.email,
      },
    }))
    .filter((recipient) => recipient.emailAddress.address.includes('@'))

  if (recipients.length === 0) return

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(input.organizerEmail)}/sendMail`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          subject: input.subject,
          body: {
            contentType: 'HTML',
            content: buildProjectMeetingEmailHtml(input),
          },
          toRecipients: recipients,
          attachments,
        },
        saveToSentItems: true,
      }),
      cache: 'no-store',
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`No s ha pogut enviar el correu de convocatoria: ${response.status} ${text}`)
  }
}

/** Envia correu des del compte de l’usuari (Outlook) via Graph, mateix patró que projectes. */
export async function sendOutlookTextMail(input: {
  organizerEmail: string
  toRecipients: Array<{ email: string; name?: string }>
  ccRecipients?: Array<{ email: string; name?: string }>
  subject: string
  bodyText: string
  attachments?: Array<{
    name: string
    contentType?: string | null
    contentBytesBase64: string
  }>
}) {
  const accessToken = await getAccessToken()
  const organizerEmail = String(input.organizerEmail || '').trim()
  if (!organizerEmail.includes('@')) {
    throw new Error('Falta el correu de l’usuari que envia (organitzador)')
  }

  const html = `<div style="font-family:Segoe UI,system-ui,sans-serif;font-size:14px;line-height:1.5"><pre style="white-space:pre-wrap;font-family:inherit;margin:0">${escapeHtml(
    input.bodyText
  )}</pre></div>`

  const mapRecipients = (list: Array<{ email: string; name?: string }>) =>
    list
      .map((attendee) => {
        const address = String(attendee.email || '').trim()
        return {
          emailAddress: {
            address,
            name: String(attendee.name || address).trim() || address,
          },
        }
      })
      .filter((r) => r.emailAddress.address.includes('@'))

  const toRecipients = mapRecipients(input.toRecipients)

  if (toRecipients.length === 0) {
    throw new Error('No hi ha destinataris amb correu vàlid')
  }

  const toSet = new Set(toRecipients.map((r) => r.emailAddress.address.toLowerCase()))
  const ccRecipients = mapRecipients(input.ccRecipients || []).filter(
    (r) => !toSet.has(r.emailAddress.address.toLowerCase())
  )

  const message: Record<string, unknown> = {
    subject: input.subject,
    body: {
      contentType: 'HTML',
      content: html,
    },
    toRecipients,
  }
  if (ccRecipients.length > 0) {
    message.ccRecipients = ccRecipients
  }
  const inlineAttachments = (input.attachments || [])
    .map((attachment) => {
      const name = String(attachment.name || '').trim()
      const contentBytes = String(attachment.contentBytesBase64 || '').trim()
      if (!name || !contentBytes) return null
      return {
        '@odata.type': '#microsoft.graph.fileAttachment' as const,
        name,
        contentType:
          String(
            attachment.contentType ||
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          ).trim() || 'application/octet-stream',
        contentBytes,
      }
    })
    .filter(Boolean)
  if (inlineAttachments.length > 0) {
    message.attachments = inlineAttachments
  }

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(organizerEmail)}/sendMail`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message,
        saveToSentItems: true,
      }),
      cache: 'no-store',
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`No s’ha pogut enviar el correu (Outlook): ${response.status} ${text}`)
  }
}

export async function sendBlockAssignmentEmail(input: SendBlockAssignmentEmailInput) {
  const recipientEmail = String(input.recipient.email || '').trim()
  const senderEmail = String(input.senderEmail || '').trim()
  if (!recipientEmail || !senderEmail) return

  const accessToken = await getAccessToken()
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          subject: `Assignacio de bloc · ${input.blockName || 'Bloc'} · ${input.projectName || 'Projecte'}`,
          body: {
            contentType: 'HTML',
            content: buildBlockAssignmentEmailHtml(input),
          },
          toRecipients: [
            {
              emailAddress: {
                address: recipientEmail,
                name: input.recipient.name || recipientEmail,
              },
            },
          ],
        },
        saveToSentItems: true,
      }),
      cache: 'no-store',
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`No s ha pogut enviar el correu d assignacio de bloc: ${response.status} ${text}`)
  }
}

export async function createBlockDeadlineCalendarEvent(input: CreateBlockDeadlineEventInput) {
  const deadline = String(input.deadline || '').trim()
  const assigneeEmail = String(input.assigneeEmail || '').trim()
  if (!deadline || !assigneeEmail) return

  const accessToken = await getAccessToken()
  const endDate = addOneDay(deadline)
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(assigneeEmail)}/events`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        subject: `Entrega bloc · ${input.blockName || 'Bloc'} · ${input.projectName || 'Projecte'}`,
        body: {
          contentType: 'HTML',
          content: buildBlockDeadlineEventHtml(input.projectName, input.blockName, deadline),
        },
        start: {
          dateTime: `${deadline}T00:00:00`,
          timeZone: 'Europe/Madrid',
        },
        end: {
          dateTime: `${endDate}T00:00:00`,
          timeZone: 'Europe/Madrid',
        },
        isAllDay: true,
        isReminderOn: true,
      }),
      cache: 'no-store',
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`No s ha pogut crear l entrega al calendari: ${response.status} ${text}`)
  }
}

type CreateRobaPickupEventInput = {
  assigneeEmail: string
  pickupDate: string
  reference: string
  requestingDepartment: string
  workerName?: string
  /** Text lliure de RRHH (estoc pendent, condicions, etc.) */
  availabilityMessage?: string
  /** Convidats addicionals (p. ex. caps de departament) */
  additionalAttendees?: Array<{ email: string; name?: string }>
}

function buildRobaPickupEventHtml(input: CreateRobaPickupEventInput): string {
  const w = escapeHtml(input.workerName?.trim() || '')
  const dept = escapeHtml(input.requestingDepartment || '')
  const ref = escapeHtml(input.reference || '')
  const day = escapeHtml(formatBarcelonaDate(input.pickupDate))
  const note = (input.availabilityMessage || '').trim()
  const noteHtml = note
    ? `<p><b>Nota de RRHH:</b> ${escapeHtml(note).replace(/\n/g, '<br/>')}</p>`
    : ''
  return `<p>Material de roba llest per recollir.</p><p><b>Referència:</b> ${ref}<br/><b>Departament:</b> ${dept}<br/><b>Treballador:</b> ${w}<br/><b>Dia de recollida:</b> ${day}</p>${noteHtml}<p>Podeu recollir el material a Recursos Humans.</p>`
}

/** Esdeveniment tot el dia al calendari Outlook del sol·licitant (mateix patró que blocs/projectes). */
export async function createRobaPickupCalendarEvent(
  input: CreateRobaPickupEventInput
): Promise<{ id: string; webLink: string }> {
  const pickupDate = String(input.pickupDate || '').trim()
  const assigneeEmail = String(input.assigneeEmail || '').trim()
  if (!pickupDate || !assigneeEmail) {
    return { id: '', webLink: '' }
  }

  const accessToken = await getAccessToken()
  const endDate = addOneDay(pickupDate)
  const attendees = (input.additionalAttendees || [])
    .map((a) => ({
      email: String(a.email || '').trim(),
      name: String(a.name || '').trim(),
    }))
    .filter((a) => a.email)

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(assigneeEmail)}/events`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        subject: `Recollida roba · ${input.reference || 'Sol·licitud'}`,
        body: {
          contentType: 'HTML',
          content: buildRobaPickupEventHtml(input),
        },
        start: {
          dateTime: `${pickupDate}T00:00:00`,
          timeZone: 'Europe/Madrid',
        },
        end: {
          dateTime: `${endDate}T00:00:00`,
          timeZone: 'Europe/Madrid',
        },
        isAllDay: true,
        isReminderOn: true,
        ...(attendees.length
          ? {
              attendees: attendees.map((a) => ({
                emailAddress: { address: a.email, name: a.name || a.email },
                type: 'required',
              })),
            }
          : {}),
      }),
      cache: 'no-store',
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`No s’ha pogut crear el dia de recollida al calendari: ${response.status} ${text}`)
  }

  const data = (await response.json()) as GraphEventResponse
  return {
    id: data.id || '',
    webLink: data.webLink || '',
  }
}

type CreateTransportReviewCalendarEventInput = {
  assigneeEmail: string
  plate: string
  vehicleType?: string
  reviewDate: string
  reviewReason: 'annual' | 'km'
  notes?: string
}

function buildTransportReviewEventHtml(input: CreateTransportReviewCalendarEventInput): string {
  const plate = escapeHtml(input.plate || 'Vehicle')
  const type = escapeHtml(input.vehicleType || '')
  const date = escapeHtml(formatBarcelonaDate(input.reviewDate))
  const reason =
    input.reviewReason === 'km'
      ? 'Revisió pendent per quilometratge'
      : 'Revisió anual pendent'
  const note = String(input.notes || '').trim()
  const noteHtml = note ? `<p><b>Detall:</b> ${escapeHtml(note).replace(/\n/g, '<br/>')}</p>` : ''

  return `<p>${escapeHtml(reason)}.</p><p><b>Vehicle:</b> ${plate}${type ? `<br/><b>Tipus:</b> ${type}` : ''}<br/><b>Data prevista:</b> ${date}</p>${noteHtml}<p>Reviseu el vehicle al mòdul de Transports.</p>`
}

export async function createTransportReviewCalendarEvent(
  input: CreateTransportReviewCalendarEventInput
): Promise<{ id: string; webLink: string }> {
  const reviewDate = String(input.reviewDate || '').trim()
  const assigneeEmail = String(input.assigneeEmail || '').trim()
  if (!reviewDate || !assigneeEmail) {
    return { id: '', webLink: '' }
  }

  const accessToken = await getAccessToken()
  const endDate = addOneDay(reviewDate)
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(assigneeEmail)}/events`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        subject: `Revisio transport · ${input.plate || 'Vehicle'}`,
        body: {
          contentType: 'HTML',
          content: buildTransportReviewEventHtml(input),
        },
        start: {
          dateTime: `${reviewDate}T00:00:00`,
          timeZone: 'Europe/Madrid',
        },
        end: {
          dateTime: `${endDate}T00:00:00`,
          timeZone: 'Europe/Madrid',
        },
        isAllDay: true,
        isReminderOn: true,
      }),
      cache: 'no-store',
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`No s'ha pogut crear la revisio al calendari: ${response.status} ${text}`)
  }

  const data = (await response.json()) as GraphEventResponse
  return {
    id: data.id || '',
    webLink: data.webLink || '',
  }
}

type CreateTransportItvCalendarEventInput = {
  assigneeEmail: string
  plate: string
  vehicleType?: string
  reminderDate: string
  expiryDate: string
}

function buildTransportItvEventHtml(input: CreateTransportItvCalendarEventInput): string {
  const plate = escapeHtml(input.plate || 'Vehicle')
  const type = escapeHtml(input.vehicleType || '')
  const reminderDate = escapeHtml(formatBarcelonaDate(input.reminderDate))
  const expiryDate = escapeHtml(formatBarcelonaDate(input.expiryDate))

  return `<p>Recordatori d'ITV pendent.</p><p><b>Vehicle:</b> ${plate}${type ? `<br/><b>Tipus:</b> ${type}` : ''}<br/><b>Recordatori:</b> ${reminderDate}<br/><b>Caducitat ITV:</b> ${expiryDate}</p><p>Reviseu el vehicle al mòdul de Transports.</p>`
}

export async function createTransportItvCalendarEvent(
  input: CreateTransportItvCalendarEventInput
): Promise<{ id: string; webLink: string }> {
  const reminderDate = String(input.reminderDate || '').trim()
  const expiryDate = String(input.expiryDate || '').trim()
  const assigneeEmail = String(input.assigneeEmail || '').trim()
  if (!reminderDate || !expiryDate || !assigneeEmail) {
    return { id: '', webLink: '' }
  }

  const accessToken = await getAccessToken()
  const endDate = addOneDay(reminderDate)
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(assigneeEmail)}/events`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        subject: `ITV transport · ${input.plate || 'Vehicle'}`,
        body: {
          contentType: 'HTML',
          content: buildTransportItvEventHtml(input),
        },
        start: {
          dateTime: `${reminderDate}T00:00:00`,
          timeZone: 'Europe/Madrid',
        },
        end: {
          dateTime: `${endDate}T00:00:00`,
          timeZone: 'Europe/Madrid',
        },
        isAllDay: true,
        isReminderOn: true,
      }),
      cache: 'no-store',
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`No s'ha pogut crear l'avís d'ITV al calendari: ${response.status} ${text}`)
  }

  const data = (await response.json()) as GraphEventResponse
  return {
    id: data.id || '',
    webLink: data.webLink || '',
  }
}

export async function sendTaskAssignmentEmail(input: SendTaskAssignmentEmailInput) {
  const recipientEmail = String(input.recipient.email || '').trim()
  const senderEmail = String(input.senderEmail || '').trim()
  if (!recipientEmail || !senderEmail) return

  const accessToken = await getAccessToken()
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          subject: `Assignacio de tasca · ${input.taskName || 'Tasca'} · ${input.projectName || 'Projecte'}`,
          body: {
            contentType: 'HTML',
            content: buildTaskAssignmentEmailHtml(input),
          },
          toRecipients: [
            {
              emailAddress: {
                address: recipientEmail,
                name: input.recipient.name || recipientEmail,
              },
            },
          ],
        },
        saveToSentItems: true,
      }),
      cache: 'no-store',
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`No s ha pogut enviar el correu d assignacio de tasca: ${response.status} ${text}`)
  }
}

export async function createTaskDeadlineCalendarEvent(input: CreateTaskDeadlineEventInput) {
  const deadline = String(input.deadline || '').trim()
  const assigneeEmail = String(input.assigneeEmail || '').trim()
  if (!deadline || !assigneeEmail) return

  const accessToken = await getAccessToken()
  const endDate = addOneDay(deadline)
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(assigneeEmail)}/events`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        subject: `Entrega tasca · ${input.taskName || 'Tasca'} · ${input.projectName || 'Projecte'}`,
        body: {
          contentType: 'HTML',
          content: buildTaskDeadlineEventHtml(input.projectName, input.blockName, input.taskName, deadline),
        },
        start: {
          dateTime: `${deadline}T00:00:00`,
          timeZone: 'Europe/Madrid',
        },
        end: {
          dateTime: `${endDate}T00:00:00`,
          timeZone: 'Europe/Madrid',
        },
        isAllDay: true,
        isReminderOn: true,
      }),
      cache: 'no-store',
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`No s ha pogut crear l entrega de tasca al calendari: ${response.status} ${text}`)
  }
}

export async function sendProjectMissedActivityEmail(input: SendProjectMissedActivityEmailInput) {
  const recipientEmail = String(input.recipient.email || '').trim()
  const senderEmail = String(input.senderEmail || '').trim()
  if (!recipientEmail || !senderEmail || input.messageCount <= 0) return

  const accessToken = await getAccessToken()
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          subject: `Activitat pendent · ${input.channelName || input.projectName || 'Projectes'}`,
          body: {
            contentType: 'HTML',
            content: buildProjectMissedActivityEmailHtml(input),
          },
          toRecipients: [
            {
              emailAddress: {
                address: recipientEmail,
                name: input.recipient.name || recipientEmail,
              },
            },
          ],
        },
        saveToSentItems: true,
      }),
      cache: 'no-store',
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`No s ha pogut enviar el correu resum del canal: ${response.status} ${text}`)
  }
}

export async function sendMaintenanceSupplierEmail(input: SendMaintenanceSupplierEmailInput) {
  const recipientEmail = String(input.recipient.email || '').trim()
  const senderEmail = String(input.senderEmail || '').trim()
  const subject = String(input.subject || '').trim()
  if (!recipientEmail || !senderEmail || !subject) return

  const attachments = await buildMailAttachments(input.attachments || [])

  const accessToken = await getAccessToken()
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          subject,
          body: {
            contentType: 'HTML',
            content: buildMaintenanceSupplierEmailHtml(input),
          },
          toRecipients: [
            {
              emailAddress: {
                address: recipientEmail,
                name: input.recipient.name || recipientEmail,
              },
            },
          ],
          attachments,
        },
        saveToSentItems: true,
      }),
      cache: 'no-store',
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`No s ha pogut enviar el correu al proveidor: ${response.status} ${text}`)
  }
}

export async function sendMaintenanceHistoryEmail(input: SendMaintenanceHistoryEmailInput) {
  const recipientEmail = String(input.recipient.email || '').trim()
  const senderEmail = String(input.senderEmail || '').trim()
  const subject = String(input.subject || '').trim()
  if (!recipientEmail || !senderEmail || !subject) return

  const attachments = await buildMailAttachments(input.attachments || [])

  const accessToken = await getAccessToken()
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          subject,
          body: {
            contentType: 'HTML',
            content: buildMaintenanceHistoryEmailHtml(input),
          },
          toRecipients: [
            {
              emailAddress: {
                address: recipientEmail,
                name: input.recipient.name || recipientEmail,
              },
            },
          ],
          attachments,
        },
        saveToSentItems: true,
      }),
      cache: 'no-store',
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`No s ha pogut enviar el correu de l historial: ${response.status} ${text}`)
  }
}

export async function sendMaintenanceCompletedEmail(input: SendMaintenanceCompletedEmailInput) {
  const recipientEmail = String(input.recipient.email || '').trim()
  const senderEmail = String(input.senderEmail || '').trim()
  const subject = String(input.subject || '').trim()
  if (!recipientEmail || !senderEmail || !subject) return

  const attachments = await buildMailAttachments(input.attachments || [])

  const accessToken = await getAccessToken()
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          subject,
          body: {
            contentType: 'HTML',
            content: buildMaintenanceCompletedEmailHtml(input),
          },
          toRecipients: [
            {
              emailAddress: {
                address: recipientEmail,
                name: input.recipient.name || recipientEmail,
              },
            },
          ],
          attachments,
        },
        saveToSentItems: true,
      }),
      cache: 'no-store',
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`No s ha pogut enviar el correu del preventiu: ${response.status} ${text}`)
  }
}

function buildMaintenanceHistoryEmailHtml(input: SendMaintenanceHistoryEmailInput) {
  const details = [
    ['Plantilla', input.templateName || '-'],
    ['Periodicitat', input.periodicity || '-'],
    ['Ubicacio', input.location || '-'],
    ['Registres', String(input.recordsCount || 0)],
    ['Validats', String(input.validatedCount || 0)],
  ]
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 10px;border:1px solid #dbe4dc;background:#f8fbf8;font-weight:600">${escapeHtml(
          label
        )}</td><td style="padding:6px 10px;border:1px solid #dbe4dc">${escapeHtml(value)}</td></tr>`
    )
    .join('')

  const extra = String(input.message || '').trim()
    ? `<p><strong>Missatge:</strong><br/>${escapeHtml(String(input.message || '')).replace(/\n/g, '<br/>')}</p>`
    : ''

  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;line-height:1.5">
      <p>S adjunta el PDF de l historial de manteniment per a la seva revisio.</p>
      <table style="border-collapse:collapse;margin:12px 0 16px;min-width:420px">
        ${details}
      </table>
      ${extra}
      <p>Document adjunt: <strong>${escapeHtml(input.templateName || 'Historial de manteniment')}</strong>.</p>
    </div>
  `
}

function buildMaintenanceCompletedEmailHtml(input: SendMaintenanceCompletedEmailInput) {
  const details = [
    ['Preventiu', input.title || '-'],
    ['Plantilla', input.templateName || '-'],
    ['Operari', input.worker || '-'],
    ['Estat', input.status || '-'],
    ['Data execucio', formatDisplayDateTime(input.completedAt ? Number(new Date(input.completedAt).getTime()) : undefined) || '-'],
    [
      'Checklist',
      `${String(input.checklistDoneCount || 0)}/${String(input.checklistTotalCount || 0)}`,
    ],
  ]
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 10px;border:1px solid #dbe4dc;background:#f8fbf8;font-weight:600">${escapeHtml(
          label
        )}</td><td style="padding:6px 10px;border:1px solid #dbe4dc">${escapeHtml(String(value || '-'))}</td></tr>`
    )
    .join('')

  const extra = String(input.message || '').trim()
    ? `<p><strong>Missatge:</strong><br/>${escapeHtml(String(input.message || '')).replace(/\n/g, '<br/>')}</p>`
    : ''

  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;line-height:1.5">
      <p>S adjunta el PDF de la fitxa del preventiu completat per a la seva revisio.</p>
      <table style="border-collapse:collapse;margin:12px 0 16px;min-width:420px">
        ${details}
      </table>
      ${extra}
      <p>Document adjunt: <strong>${escapeHtml(input.title || 'Preventiu completat')}</strong>.</p>
    </div>
  `
}

function buildKickoffHtml(projectName: string, notes?: string) {
  const extra = notes?.trim()
    ? `<p><strong>Notes:</strong><br/>${escapeHtml(notes).replace(/\n/g, '<br/>')}</p>`
    : ''

  return `
    <p>Convocatoria de kickoff del projecte <strong>${escapeHtml(projectName || 'Projecte')}</strong>.</p>
    ${extra}
    <p>Revisarem objectius, abast, responsables i seguents passos.</p>
  `
}

function buildKickoffEmailHtml(params: {
  projectName: string
  startDateTime: string
  endDateTime: string
  notes?: string
}) {
  const { projectName, startDateTime, endDateTime, notes } = params
  const start = formatBarcelonaDateTime(startDateTime)
  const end = formatBarcelonaDateTime(endDateTime)
  const extra = notes?.trim()
    ? `<p><strong>Notes convocatoria:</strong><br/>${escapeHtml(notes).replace(/\n/g, '<br/>')}</p>`
    : ''

  return `
    <p>S'ha convocat el kickoff del projecte <strong>${escapeHtml(projectName || 'Projecte')}</strong>.</p>
    <p><strong>Data i hora:</strong> ${escapeHtml(start)} - ${escapeHtml(end)}</p>
    ${extra}
    <p>Rebreu tambe la invitacio de calendari d'Outlook per poder acceptar o rebutjar la reunio.</p>
  `
}

function buildProjectMeetingHtml(params: {
  projectName: string
  scope: 'block' | 'task'
  scopeName: string
  blockName?: string
  notes?: string
}) {
  const label = params.scope === 'task' ? 'tasca' : 'bloc'
  const extraBlock =
    params.scope === 'task' && params.blockName
      ? `<p><strong>Bloc:</strong> ${escapeHtml(params.blockName)}</p>`
      : ''
  const extraNotes = params.notes?.trim()
    ? `<p><strong>Notes:</strong><br/>${escapeHtml(params.notes).replace(/\n/g, '<br/>')}</p>`
    : ''

  return `
    <p>Convocatoria de reunio del ${label} <strong>${escapeHtml(params.scopeName || 'Element del projecte')}</strong>.</p>
    <p><strong>Projecte:</strong> ${escapeHtml(params.projectName || 'Projecte')}</p>
    ${extraBlock}
    ${extraNotes}
  `
}

function buildProjectMeetingEmailHtml(params: {
  projectName: string
  startDateTime: string
  endDateTime: string
  notes?: string
  scope: 'block' | 'task'
  scopeName: string
  blockName?: string
}) {
  const label = params.scope === 'task' ? 'tasca' : 'bloc'
  const start = formatBarcelonaDateTime(params.startDateTime)
  const end = formatBarcelonaDateTime(params.endDateTime)
  const extraBlock =
    params.scope === 'task' && params.blockName
      ? `<p><strong>Bloc:</strong> ${escapeHtml(params.blockName)}</p>`
      : ''
  const extraNotes = params.notes?.trim()
    ? `<p><strong>Notes convocatoria:</strong><br/>${escapeHtml(params.notes).replace(/\n/g, '<br/>')}</p>`
    : ''

  return `
    <p>S'ha convocat una reunio del ${label} <strong>${escapeHtml(params.scopeName || 'Element del projecte')}</strong>.</p>
    <p><strong>Projecte:</strong> ${escapeHtml(params.projectName || 'Projecte')}</p>
    ${extraBlock}
    <p><strong>Data i hora:</strong> ${escapeHtml(start)} - ${escapeHtml(end)}</p>
    ${extraNotes}
    <p>Rebreu tambe la invitacio de calendari d'Outlook per poder acceptar o rebutjar la reunio.</p>
  `
}

function buildBlockAssignmentEmailHtml(params: SendBlockAssignmentEmailInput) {
  const deadlineLabel = params.deadline ? formatBarcelonaDate(params.deadline) : 'Sense data'

  return `
    <p>Se t'ha assignat la responsabilitat del bloc <strong>${escapeHtml(params.blockName || 'Bloc')}</strong>.</p>
    <p><strong>Projecte:</strong> ${escapeHtml(params.projectName || 'Projecte')}</p>
    <p><strong>Data limit:</strong> ${escapeHtml(deadlineLabel)}</p>
    <p>També s'ha afegit l'entrega al teu calendari d'Outlook.</p>
  `
}

function buildBlockDeadlineEventHtml(projectName: string, blockName: string, deadline: string) {
  return `
    <p>Entrega prevista del bloc <strong>${escapeHtml(blockName || 'Bloc')}</strong>.</p>
    <p><strong>Projecte:</strong> ${escapeHtml(projectName || 'Projecte')}</p>
    <p><strong>Data limit:</strong> ${escapeHtml(formatBarcelonaDate(deadline))}</p>
  `
}

function buildTaskAssignmentEmailHtml(params: SendTaskAssignmentEmailInput) {
  const deadlineLabel = params.deadline ? formatBarcelonaDate(params.deadline) : 'Sense data'

  return `
    <p>Se t'ha assignat la responsabilitat de la tasca <strong>${escapeHtml(params.taskName || 'Tasca')}</strong>.</p>
    <p><strong>Projecte:</strong> ${escapeHtml(params.projectName || 'Projecte')}</p>
    <p><strong>Bloc:</strong> ${escapeHtml(params.blockName || 'Bloc')}</p>
    <p><strong>Data limit:</strong> ${escapeHtml(deadlineLabel)}</p>
    <p>També s'ha afegit l'entrega al teu calendari d'Outlook.</p>
  `
}

function buildTaskDeadlineEventHtml(projectName: string, blockName: string, taskName: string, deadline: string) {
  return `
    <p>Entrega prevista de la tasca <strong>${escapeHtml(taskName || 'Tasca')}</strong>.</p>
    <p><strong>Projecte:</strong> ${escapeHtml(projectName || 'Projecte')}</p>
    <p><strong>Bloc:</strong> ${escapeHtml(blockName || 'Bloc')}</p>
    <p><strong>Data limit:</strong> ${escapeHtml(formatBarcelonaDate(deadline))}</p>
  `
}

function buildProjectMissedActivityEmailHtml(input: SendProjectMissedActivityEmailInput) {
  const lines = input.messages
    .slice(0, 6)
    .map((message) => {
      const sender = escapeHtml(message.senderName || 'Usuari')
      const body = escapeHtml((message.body || '').trim() || 'Missatge sense text')
      const at = formatDisplayDateTime(message.createdAt)
      return `<li style="margin:0 0 10px"><strong>${sender}</strong>${at ? ` · ${at}` : ''}<br/>${body}</li>`
    })
    .join('')

  const context = [input.projectName, input.roomName].filter(Boolean).join(' · ')
  const cta = input.url
    ? `<p style="margin:18px 0 0"><a href="${escapeHtml(input.url)}" style="display:inline-block;padding:10px 14px;background:#6d28d9;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600">Obrir canal</a></p>`
    : ''

  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;line-height:1.45">
      <p style="margin:0 0 12px">Tens <strong>${input.messageCount}</strong> missatge${input.messageCount === 1 ? '' : 's'} pendent${input.messageCount === 1 ? '' : 's'} al canal <strong>${escapeHtml(input.channelName || 'Projectes')}</strong>.</p>
      ${context ? `<p style="margin:0 0 12px;color:#475569">${escapeHtml(context)}</p>` : ''}
      <ul style="padding-left:18px;margin:0">${lines}</ul>
      ${cta}
    </div>
  `
}

function buildMaintenanceSupplierEmailHtml(input: SendMaintenanceSupplierEmailInput) {
  const createdLabel = formatFlexibleBarcelonaDate(input.createdAt)
  const reference = String(input.reference || '').trim()
  const priority = String(input.priority || '').trim()
  const machine = String(input.machine || '').trim()
  const message = String(input.message || '').trim()
  const description = String(input.description || '').trim()
  const lines = [
    `<p style="margin:0 0 8px"><strong>Ticket:</strong> ${escapeHtml(input.ticketCode || 'TIC')}</p>`,
    `<p style="margin:0 0 8px"><strong>Ubicacio:</strong> ${escapeHtml(input.location || '-')}</p>`,
    machine ? `<p style="margin:0 0 8px"><strong>Maquinaria:</strong> ${escapeHtml(machine)}</p>` : '',
    `<p style="margin:0 0 8px"><strong>Prioritat:</strong> ${escapeHtml(priority || 'normal')}</p>`,
    createdLabel ? `<p style="margin:0 0 8px"><strong>Creat:</strong> ${escapeHtml(createdLabel)}</p>` : '',
    reference ? `<p style="margin:0 0 8px"><strong>Referencia externa:</strong> ${escapeHtml(reference)}</p>` : '',
    description ? `<p style="margin:0 0 8px"><strong>Descripcio:</strong> ${escapeHtml(description)}</p>` : '',
    message ? `<div style="margin:12px 0 0">${escapeHtml(message).replace(/\n/g, '<br/>')}</div>` : '',
  ]
    .filter(Boolean)
    .join('')

  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;line-height:1.45">
      <div style="margin:0;padding:14px 16px;border:1px solid #dbeafe;border-radius:14px;background:#f8fbff">
        ${lines}
      </div>
    </div>
  `
}

async function buildMailAttachments(
  attachments: Array<{ name: string; path: string; contentType?: string | null }>
) {
  const bucket = storageAdmin.bucket()
  const result: Array<{
    '@odata.type': '#microsoft.graph.fileAttachment'
    name: string
    contentType: string
    contentBytes: string
  }> = []

  for (const attachment of attachments) {
    const path = String(attachment.path || '').trim()
    if (!path) continue
    try {
      const [buffer] = await bucket.file(path).download()
      result.push({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: String(attachment.name || 'adjunt.jpg').trim() || 'adjunt.jpg',
        contentType: String(attachment.contentType || 'image/jpeg').trim() || 'image/jpeg',
        contentBytes: buffer.toString('base64'),
      })
    } catch {
      continue
    }
  }

  return result
}

async function attachFilesToGraphEvent(
  organizerEmail: string,
  eventId: string,
  attachments: Array<{ name: string; path: string; contentType?: string | null }>
) {
  const accessToken = await getAccessToken()
  const graphAttachments = await buildMailAttachments(attachments)

  for (const attachment of graphAttachments) {
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
        organizerEmail
      )}/events/${encodeURIComponent(eventId)}/attachments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(attachment),
        cache: 'no-store',
      }
    )

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`No s ha pogut adjuntar el fitxer a la convocatoria: ${response.status} ${text}`)
    }
  }
}

function formatDisplayDateTime(value?: number) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('ca-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatFlexibleBarcelonaDate(value?: number | string | null) {
  if (!value) return ''
  const date =
    typeof value === 'number'
      ? new Date(value)
      : typeof value === 'string'
        ? new Date(value)
        : null
  if (!date || Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ca-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function formatBarcelonaDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('ca-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatBarcelonaDate(value: string) {
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('ca-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function addOneDay(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  date.setDate(date.getDate() + 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
