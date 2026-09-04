'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { RoleGuard } from '@/lib/withRoleGuard'
import { bindAblyChannelSubscriptions, publishAblyEvent } from '@/lib/ablyClient'
import { useSearchParams } from 'next/navigation'
import { normalizeRole } from '@/lib/roles'
import OpsChannelsSidebar from '@/components/messaging/OpsChannelsSidebar'
import { channelsToSidebarItems } from '@/lib/messaging/channelSidebarItems'
import { canManageChannelParticipants, canShowChannelInvite } from '@/lib/messaging/channelChatPermissions'
import ChannelChatHeader from '@/components/messaging/ChannelChatHeader'
import ChannelParticipantsPanel, {
  type ChannelParticipantMember,
} from '@/components/messaging/ChannelParticipantsPanel'
import type { InviteUserOption } from '@/lib/messaging/userSearch'
import MessageList from './components/MessageList'
import Composer from './components/Composer'
import type { Channel, Member, Message, PendingImage } from './types'
import { eventDateLabel } from './utils'
import { compressRasterImageWithMeta, DEFAULT_MAX_IMAGE_UPLOAD_BYTES } from '@/lib/file-optimization'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import { SPACES_REQUESTS_MANAGE_PERM } from '@/lib/spacesPermissions'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type SessionUser = {
  id?: string
  role?: string
  name?: string
}

export default function MissatgeriaPage() {
  const { data: session } = useSession()
  const sessionUser = (session?.user || {}) as SessionUser
  const userId = sessionUser.id
  const userRole = normalizeRole(sessionUser.role || '')
  const { ready: uiPermissionsReady, hasAction } = useUiPermissions()
  const searchParams = useSearchParams()
  const eventMode = searchParams?.get('event') === '1'

  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)
  const [messageText, setMessageText] = useState('')
  const [loadingSend, setLoadingSend] = useState(false)
  const [messagesState, setMessagesState] = useState<Message[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<'finques' | 'restaurants' | 'events' | 'projects' | 'spaces'>('finques')
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionTarget, setMentionTarget] = useState<Member | null>(null)
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({})
  const [showArchivedEvents, setShowArchivedEvents] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const messagesCache = useRef<Map<string, Message[]>>(new Map())
  const typingThrottleRef = useRef<number>(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const lastEventIdRef = useRef<string | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')
  const [membersOpen, setMembersOpen] = useState(false)
  const [savingResponsible, setSavingResponsible] = useState(false)
  const [addingMember, setAddingMember] = useState(false)
  const [removingUserId, setRemovingUserId] = useState<string | null>(null)
  const [creatingTicketId, setCreatingTicketId] = useState<string | null>(null)
  const [ticketTypePickerId, setTicketTypePickerId] = useState<string | null>(null)
  const [eventChannel, setEventChannel] = useState<Channel | null>(null)
  const [savingSpaceRequestStatus, setSavingSpaceRequestStatus] = useState(false)

  const syncMessagesLocal = useCallback(
    (updater: (current: Message[]) => Message[]) => {
      setMessagesState((current) => {
        const next = updater(current)
          .filter(Boolean)
          .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
        if (selectedChannelId) {
          messagesCache.current.set(selectedChannelId, next)
        }
        return next
      })
    },
    [selectedChannelId]
  )

  const { data: channelsData, mutate: refreshChannels } = useSWR(
    '/api/messaging/channels?scope=mine',
    fetcher,
    { refreshInterval: 0 }
  )

  const channels = useMemo<Channel[]>(
    () => (Array.isArray(channelsData?.channels) ? channelsData.channels : []),
    [channelsData?.channels]
  )

  useEffect(() => {
    const rawEventId = String(searchParams?.get('eventId') || '').trim()
    if (!rawEventId) return
    if (lastEventIdRef.current === rawEventId) return
    lastEventIdRef.current = rawEventId

    setCategoryFilter('events')
    setMobileView('chat')

    let active = true
    fetch('/api/messaging/events/ensure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: rawEventId }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        if (!active) return
        if (!json?.channelId) return
        setSelectedChannelId(String(json.channelId))
        refreshChannels()
      })
      .catch(() => {
        if (!active) return
      })

    return () => {
      active = false
    }
  }, [searchParams, refreshChannels])

  useEffect(() => {
    const queryChannel = searchParams?.get('channel')
    if (!queryChannel) {
      setEventChannel(null)
      return
    }
    if (channels.some((c) => c.id === queryChannel)) {
      setEventChannel(null)
      return
    }
    let active = true
    fetch(`/api/messaging/channels/${queryChannel}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        if (!active) return
        setEventChannel(json?.channel || null)
      })
      .catch(() => {
        if (!active) return
        setEventChannel(null)
      })
    return () => {
      active = false
    }
  }, [searchParams, channels])

  const allChannels = useMemo(() => {
    if (!eventChannel) return channels
    const map = new Map(channels.map((c) => [c.id, c]))
    map.set(eventChannel.id, eventChannel)
    return Array.from(map.values())
  }, [channels, eventChannel])

  const isActiveEventChannelForList = useCallback((c: Channel) => {
    if (c.source !== 'events') return false
    if (!showArchivedEvents && String(c.status || '').toLowerCase() === 'archived') return false

    const until = typeof c.visibleUntil === 'number' ? c.visibleUntil : null
    if (!showArchivedEvents && until && Date.now() > until) return false

    return true
  }, [showArchivedEvents])

  const activeEventChannels = useMemo(
    () => allChannels.filter(isActiveEventChannelForList),
    [allChannels, isActiveEventChannelForList]
  )

  const activeEventUnread = useMemo(
    () => activeEventChannels.reduce((acc, c) => acc + Number(c.unreadCount || 0), 0),
    [activeEventChannels]
  )

  const unreadByCategory = useMemo(() => {
    const counts = {
      finques: 0,
      restaurants: 0,
      projects: 0,
      spaces: 0,
      events: activeEventUnread,
    }

    allChannels.forEach((channel) => {
      const unread = Number(channel.unreadCount || 0)
      if (!unread || Number.isNaN(unread)) return

      if (channel.source === 'finques') counts.finques += unread
      if (channel.source === 'restaurants') counts.restaurants += unread
      if (channel.source === 'projects') counts.projects += unread
      if (channel.source === 'spaces') counts.spaces += unread
    })

    return counts
  }, [activeEventUnread, allChannels])

  const filteredChannels = useMemo(() => {
    let out = allChannels
    if (eventMode && selectedChannelId) {
      return out.filter((c) => c.id === selectedChannelId)
    }
    if (categoryFilter === 'events') {
      out = out.filter(isActiveEventChannelForList)
    } else {
      out = out.filter((c) => c.source === categoryFilter)
    }
    return out
  }, [allChannels, categoryFilter, eventMode, selectedChannelId, isActiveEventChannelForList])

  const sidebarItems = useMemo(
    () => channelsToSidebarItems(filteredChannels),
    [filteredChannels]
  )

  const sidebarFilters = useMemo(
    () =>
      eventMode
        ? undefined
        : [
            {
              key: 'finques',
              label: 'Finques',
              badge: unreadByCategory.finques > 0 ? unreadByCategory.finques : undefined,
            },
            {
              key: 'restaurants',
              label: 'Restaurants',
              badge: unreadByCategory.restaurants > 0 ? unreadByCategory.restaurants : undefined,
            },
            {
              key: 'projects',
              label: 'Projectes',
              badge: unreadByCategory.projects > 0 ? unreadByCategory.projects : undefined,
            },
            {
              key: 'events',
              label: 'Events',
              badge: unreadByCategory.events > 0 ? unreadByCategory.events : undefined,
            },
            {
              key: 'spaces',
              label: 'Espais',
              badge: unreadByCategory.spaces > 0 ? unreadByCategory.spaces : undefined,
            },
          ],
    [eventMode, unreadByCategory]
  )

  useEffect(() => {
    const queryChannel = searchParams?.get('channel')
    const queryChannelData = queryChannel
      ? allChannels.find((channel) => channel.id === queryChannel)
      : null
    if (queryChannel && queryChannelData) {
      if (queryChannelData.source === 'spaces') setCategoryFilter('spaces')
      setSelectedChannelId(queryChannel)
      setMobileView('chat')
      return
    }
    if (filteredChannels.length === 0) return
    if (!selectedChannelId) {
      setSelectedChannelId(filteredChannels[0].id)
      return
    }
    const stillVisible = filteredChannels.some((c) => c.id === selectedChannelId)
    if (!stillVisible) {
      setSelectedChannelId(filteredChannels[0].id)
    }
  }, [allChannels, filteredChannels, selectedChannelId, searchParams])

  const { data: messagesData, mutate: refreshMessages } = useSWR(
    selectedChannelId
      ? `/api/messaging/channels/${selectedChannelId}/messages?limit=15`
      : null,
    fetcher,
    { refreshInterval: 0 }
  )

  const messages = useMemo<Message[]>(
    () => (Array.isArray(messagesData?.messages) ? messagesData.messages : []),
    [messagesData?.messages]
  )

  const { data: membersData, mutate: refreshMembers } = useSWR(
    selectedChannelId
      ? `/api/messaging/channels/${selectedChannelId}/members`
      : null,
    fetcher
  )

  const selectedChannel = useMemo(
    () => allChannels.find((c) => c.id === selectedChannelId) || null,
    [allChannels, selectedChannelId]
  )
  const canManageSelectedSpaceRequest =
    uiPermissionsReady &&
    selectedChannel?.source === 'spaces' &&
    Boolean(selectedChannel.spaceRequestId) &&
    hasAction(SPACES_REQUESTS_MANAGE_PERM)

  const isReadOnlyChannel = useMemo(() => {
    if (!selectedChannel) return false
    const status = String(selectedChannel.status || '').toLowerCase()
    if (selectedChannel.source === 'projects' || selectedChannel.source === 'event_comanda') {
      return status === 'archived'
    }
    if (selectedChannel.source !== 'events') return false
    const until =
      typeof selectedChannel.visibleUntil === 'number'
        ? selectedChannel.visibleUntil
        : null
    if (status === 'archived') return true
    if (until && Date.now() > until) return true
    return false
  }, [selectedChannel])

  const members = useMemo<ChannelParticipantMember[]>(
    () =>
      Array.isArray(membersData?.members)
        ? membersData.members.map((member: ChannelParticipantMember) => ({
            userId: String(member.userId || ''),
            userName: String(member.userName || ''),
            department: member.department,
            role: member.role,
            isResponsible: Boolean(member.isResponsible),
            canRemove: Boolean(member.canRemove),
          }))
        : [],
    [membersData?.members]
  )

  const selfMember = useMemo(
    () => {
      const raw = Array.isArray(membersData?.members) ? membersData.members : []
      return raw.find((member: Member) => member.userId === userId) || null
    },
    [membersData?.members, userId]
  )

  const membersLoaded = membersData !== undefined

  const invitePermission = {
    channelId: selectedChannelId,
    apiCanManage: membersData?.canManageMembers,
    membersLoaded,
    actorUserId: userId,
    actorRole: userRole,
    responsibleUserId: selectedChannel?.responsibleUserId ?? membersData?.responsibleUserId ?? null,
  }
  const canInviteMembers = canShowChannelInvite(invitePermission)
  const canManageParticipants = canManageChannelParticipants(invitePermission)

  const canEditResponsible = Boolean(membersData?.canEditResponsible)
  const canToggleVisibility = userRole === 'admin' || userRole === 'direccio'
  const channelMuted = Boolean(membersData?.viewer?.muted ?? selectedChannel?.muted)
  const selfHidden = Boolean(membersData?.viewer?.hidden ?? selfMember?.hidden)

  const { data: inviteUsersData } = useSWR<InviteUserOption[]>(
    canInviteMembers ? '/api/users?view=project-options' : null,
    fetcher
  )

  const inviteUsers = useMemo<InviteUserOption[]>(() => {
    const users = Array.isArray(inviteUsersData) ? inviteUsersData : []
    const memberIds = new Set(members.map((member) => member.userId))
    return users
      .filter((user) => user.id && user.name && !memberIds.has(user.id))
      .map((user) => ({
        id: user.id,
        name: user.name,
        department: user.department,
        role: user.role,
      }))
  }, [inviteUsersData, members])

  const canCreateTicket =
    !!selectedChannel &&
    selectedChannel.source === 'finques' &&
    !!userId &&
    selectedChannel.responsibleUserId === userId

  const createTicketFromMessage = async (message: Message, ticketType: 'maquinaria' | 'deco') => {
    if (!message?.id || !canCreateTicket) return
    if (message.ticketId) return
    try {
      setCreatingTicketId(message.id)
      const res = await fetch(`/api/messaging/messages/${message.id}/ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketType }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || `HTTP ${res.status}`)
      }
      await refreshMessages()
      await refreshChannels()
    } catch (err: unknown) {
      // @ts-expect-error narrow runtime error message access
      alert(err?.message || 'No s’ha pogut crear el ticket')
    } finally {
      setCreatingTicketId(null)
      setTicketTypePickerId(null)
    }
  }

  useEffect(() => {
    setMessagesState(messages)
    if (selectedChannelId) {
      messagesCache.current.set(selectedChannelId, messages)
    }
  }, [messages, selectedChannelId])

  useEffect(() => {
    if (!selectedChannelId) return
    const cached = messagesCache.current.get(selectedChannelId)
    if (cached && cached.length) {
      setMessagesState(cached)
    }
  }, [selectedChannelId])

  useEffect(() => {
    if (!messagesState.length || !selectedChannelId) return
    const ids = messagesState.map((m) => m.id).filter(Boolean)
    if (ids.length === 0) return
    const timer = window.setTimeout(() => {
      fetch('/api/messaging/messages/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds: ids }),
      }).catch(() => {})
    }, 800)
    return () => window.clearTimeout(timer)
  }, [messagesState, selectedChannelId])

  useEffect(() => {
    if (!selectedChannelId) return
    fetch(`/api/messaging/channels/${selectedChannelId}/read`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
    }).then(() => refreshChannels())
  }, [selectedChannelId, refreshChannels])

  useEffect(() => {
    if (!userId) return
    return bindAblyChannelSubscriptions({
      channelName: `user:${userId}:inbox`,
      userId,
      subscriptions: [
        {
          eventName: 'updated',
          handler: () => refreshChannels(),
        },
      ],
    })
  }, [userId, refreshChannels])

  useEffect(() => {
    if (!selectedChannelId) return

    const handleMessage = (msg: { data?: unknown }) => {
      const data = msg?.data as Message | undefined
      if (!data) return
      if (data.channelId !== selectedChannelId) return
      syncMessagesLocal((current) => [data, ...current.filter((item) => item.id !== data.id)])
    }

    const handleTyping = (msg: { data?: unknown }) => {
      const data = msg?.data as { userId?: string; userName?: string } | undefined
      if (!data?.userId || data.userId === userId) return
      const typingUserId = String(data.userId)
      setTypingUsers((prev) => ({ ...prev, [typingUserId]: Date.now() }))
    }

    const cleanups = [
      bindAblyChannelSubscriptions({
        channelName: `chat:${selectedChannelId}`,
        userId,
        subscriptions: [
          { eventName: 'message', handler: handleMessage },
          { eventName: 'typing', handler: handleTyping },
        ],
      }),
    ]

    if (userId) {
      cleanups.push(
        bindAblyChannelSubscriptions({
          channelName: `user:${userId}:direct`,
          userId,
          subscriptions: [{ eventName: 'message', handler: handleMessage }],
        })
      )
    }

    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [selectedChannelId, userId, syncMessagesLocal])

  const loadMore = async () => {
    if (!selectedChannelId || messagesState.length === 0) return
    try {
      setLoadingMore(true)
      const oldest = messagesState[messagesState.length - 1]
      const before = oldest?.createdAt ? `&before=${oldest.createdAt}` : ''
      const res = await fetch(
        `/api/messaging/channels/${selectedChannelId}/messages?limit=10${before}`
      )
      const data = await res.json()
      const next = Array.isArray(data?.messages) ? data.messages : []
      const merged = [...messagesState, ...next]
      const dedup = Array.from(new Map(merged.map((m) => [m.id, m])).values())
      setMessagesState(dedup)
      messagesCache.current.set(selectedChannelId, dedup)
    } finally {
      setLoadingMore(false)
    }
  }

  const sendMessage = async () => {
    const hasText = !!messageText.trim()
    const hasImage = !!pendingImage?.url
    const hasFile = !!pendingFile
    if (!selectedChannelId || (!hasText && !hasImage && !hasFile)) return
    const directTarget = mentionTarget?.userId || ''
    const finalVisibility = directTarget ? 'direct' : 'channel'

    try {
      setLoadingSend(true)
      let filePayload:
        | {
            fileUrl?: string
            filePath?: string
            fileName?: string
            fileMeta?: { size?: number; type?: string }
          }
        | undefined

      if (pendingFile && selectedChannel?.source === 'projects') {
        const form = new FormData()
        form.append('file', pendingFile)
        form.append('channelId', selectedChannelId)
        const uploadRes = await fetch('/api/messaging/upload-file', {
          method: 'POST',
          body: form,
        })
        const uploadData = await uploadRes.json().catch(() => ({}))
        if (!uploadRes.ok || !uploadData?.document) {
          throw new Error(uploadData?.error || 'Error pujant el fitxer')
        }
        filePayload = {
          fileUrl: uploadData.document.url,
          filePath: uploadData.document.path,
          fileName: uploadData.document.name || uploadData.document.label,
          fileMeta: {
            size: uploadData.document.size,
            type: uploadData.document.type,
          },
        }
      }

      const createdAt = Date.now()
      const sendRes = await fetch(`/api/messaging/channels/${selectedChannelId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: hasText ? messageText.trim() : '',
          visibility: finalVisibility,
          targetUserId: finalVisibility === 'direct' ? directTarget : undefined,
          imageUrl: pendingImage?.url || undefined,
          imagePath: pendingImage?.path || undefined,
          imageMeta: pendingImage?.meta || undefined,
          fileUrl: filePayload?.fileUrl,
          filePath: filePayload?.filePath,
          fileName: filePayload?.fileName,
          fileMeta: filePayload?.fileMeta,
        }),
      })
      const sendData = await sendRes.json().catch(() => ({}))
      if (!sendRes.ok || !sendData?.messageId) {
        throw new Error(sendData?.error || 'No s ha pogut enviar el missatge')
      }
      const optimisticMessage: Message = {
        id: String(sendData.messageId),
        channelId: selectedChannelId,
        senderId: userId || '',
        senderName: String(sessionUser.name || ''),
        body: hasText ? messageText.trim() : '',
        createdAt,
        visibility: finalVisibility,
        targetUserIds: finalVisibility === 'direct' && directTarget ? [directTarget] : [],
        imageUrl: pendingImage?.url || null,
        imagePath: pendingImage?.path || null,
        imageMeta: pendingImage?.meta || null,
        fileUrl: filePayload?.fileUrl || null,
        filePath: filePayload?.filePath || null,
        fileName: filePayload?.fileName || null,
        fileMeta: filePayload?.fileMeta || null,
      }
      syncMessagesLocal((current) => [optimisticMessage, ...current.filter((item) => item.id !== optimisticMessage.id)])
      setMessageText('')
      setPendingImage(null)
      setPendingFile(null)
      setMentionTarget(null)
      setMentionQuery('')
      setMentionOpen(false)
      refreshChannels()
    } finally {
      setLoadingSend(false)
    }
  }

  const deleteMessage = async (msgId: string) => {
    if (!confirm('Vols esborrar aquest missatge?')) return
    const res = await fetch(`/api/messaging/messages/${msgId}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'No s ha pogut esborrar el missatge')
    }
    syncMessagesLocal((current) => current.filter((message) => message.id !== msgId))
    refreshChannels()
  }

  const respondSurvey = async (surveyId: string, response: 'yes' | 'no' | 'maybe') => {
    const res = await fetch(`/api/quadrants/surveys/${surveyId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data?.error || 'No s ha pogut respondre el sondeig')
    }
    syncMessagesLocal((current) =>
      current.map((message) =>
        message.surveyId === surveyId
          ? {
              ...message,
              surveyState: response,
            }
          : message
      )
    )
  }

  const handleTyping = (_value: string) => {
    if (!selectedChannelId || !userId) return
    const now = Date.now()
    if (now - typingThrottleRef.current < 1500) return
    typingThrottleRef.current = now
    publishAblyEvent({
      channelName: `chat:${selectedChannelId}`,
      eventName: 'typing',
      data: { userId, userName: sessionUser.name || '' },
      userId,
    })
  }

  useEffect(() => {
    const now = Date.now()
    const active = Object.entries(typingUsers)
      .filter(([, ts]) => now - ts < 3000)
      .map(([uid]) => uid)
    if (active.length === 0) return
    const timer = setTimeout(() => {
      setTypingUsers((prev) => {
        const next: Record<string, number> = {}
        Object.entries(prev).forEach(([uid, ts]) => {
          if (now - ts < 3000) next[uid] = ts
        })
        return next
      })
    }, 1000)
    return () => clearTimeout(timer)
  }, [typingUsers])

  const handleAttachmentPick = async (file: File | null) => {
    if (!file || !selectedChannelId || !userId) return
    setImageError(null)
    if (!file.type.startsWith('image/')) {
      if (selectedChannel?.source !== 'projects') {
        setImageError('Aquest canal només permet adjuntar imatges')
        return
      }
      setPendingImage(null)
      setPendingFile(file)
      return
    }
    try {
      setImageUploading(true)
      setPendingFile(null)
      const { file: compressed, width, height } = await compressRasterImageWithMeta(
        file,
        DEFAULT_MAX_IMAGE_UPLOAD_BYTES
      )
      if (compressed.size > DEFAULT_MAX_IMAGE_UPLOAD_BYTES) {
        throw new Error('La imatge encara pesa massa')
      }
      const form = new FormData()
      form.append('file', compressed, 'image.jpg')
      form.append('channelId', selectedChannelId)

      const res = await fetch('/api/messaging/upload-image', {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Error pujant la imatge')
      }
      setPendingImage({
        url: data.url,
        path: data.path,
        meta: {
          width,
          height,
          size: compressed.size,
          type: compressed.type,
        },
      })
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Error pujant la imatge')
    } finally {
      setImageUploading(false)
    }
  }

  const updateMentionState = (value: string) => {
    const match = value.match(/@([^\s@]{0,30})$/)
    if (match) {
      setMentionQuery(match[1].toLowerCase())
      setMentionOpen(true)
    } else {
      setMentionQuery('')
      setMentionOpen(false)
    }

    if (mentionTarget) {
      const token = `@${mentionTarget.userName}`
      if (!value.includes(token)) {
        setMentionTarget(null)
      }
    }
  }

  const selectMention = (m: Member) => {
    const value = messageText
    const replaced = value.replace(/@([^\s@]{0,30})$/, `@${m.userName} `)
    setMessageText(replaced)
    setMentionTarget(m)
    setMentionOpen(false)
    setMentionQuery('')
  }

  const openChannel = (id: string) => {
    setSelectedChannelId(id)
    setMobileView('chat')
  }

  const updateResponsible = async (targetUserId: string) => {
    if (!selectedChannel || !canEditResponsible) return
    try {
      setSavingResponsible(true)
      await fetch(`/api/messaging/channels/${selectedChannel.id}/responsible`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUserId }),
      })
      await refreshChannels()
      await refreshMembers()
    } finally {
      setSavingResponsible(false)
    }
  }

  const updateSpaceRequestStatus = async (status: NonNullable<Channel['requestStatus']>) => {
    if (!selectedChannel?.spaceRequestId || !canManageSelectedSpaceRequest) return
    setSavingSpaceRequestStatus(true)
    try {
      const response = await fetch(
        `/api/spaces/requests/${encodeURIComponent(selectedChannel.spaceRequestId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        }
      )
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload?.error || `HTTP ${response.status}`)
      }
      await Promise.all([refreshChannels(), refreshMessages()])
    } catch (error) {
      console.error('[missatgeria] update space request status failed', error)
    } finally {
      setSavingSpaceRequestStatus(false)
    }
  }

  const addParticipant = async (user: InviteUserOption) => {
    if (!selectedChannel?.id || !user.id) return

    setAddingMember(true)
    try {
      const res =
        selectedChannel.source === 'event_comanda' &&
        selectedChannel.eventId &&
        selectedChannel.warehouseId
          ? await fetch(
              `/api/events/${encodeURIComponent(String(selectedChannel.eventId))}/comanda/chat/members`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userId: user.id,
                  warehouseId: selectedChannel.warehouseId,
                  batchId: selectedChannel.batchId,
                }),
              }
            )
          : await fetch(
              `/api/messaging/channels/${encodeURIComponent(selectedChannel.id)}/members`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id }),
              }
            )

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || `HTTP ${res.status}`)
      }
      await Promise.all([refreshMembers(), refreshChannels()])
    } catch (err: unknown) {
      console.error('[missatgeria] add participant failed', err)
    } finally {
      setAddingMember(false)
    }
  }

  const removeParticipant = async (targetUserId: string) => {
    if (!selectedChannel?.id) return

    setRemovingUserId(targetUserId)
    try {
      const res =
        selectedChannel.source === 'event_comanda' &&
        selectedChannel.eventId &&
        selectedChannel.warehouseId
          ? await fetch(
              `/api/events/${encodeURIComponent(String(selectedChannel.eventId))}/comanda/chat/members?userId=${encodeURIComponent(targetUserId)}&warehouseId=${encodeURIComponent(String(selectedChannel.warehouseId))}&batchId=${encodeURIComponent(String(selectedChannel.batchId || ''))}`,
              { method: 'DELETE' }
            )
          : await fetch(
              `/api/messaging/channels/${encodeURIComponent(selectedChannel.id)}/members?userId=${encodeURIComponent(targetUserId)}`,
              { method: 'DELETE' }
            )

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || `HTTP ${res.status}`)
      }
      await Promise.all([refreshMembers(), refreshChannels()])
    } catch (err: unknown) {
      console.error('[missatgeria] remove participant failed', err)
    } finally {
      setRemovingUserId(null)
    }
  }

  const inviteExcludeIds = useMemo(
    () => new Set(members.map((member) => member.userId)),
    [members]
  )

  const selectedChannelTitle =
    selectedChannel?.eventTitle ||
    selectedChannel?.roomName ||
    selectedChannel?.location ||
    selectedChannel?.name ||
    'Selecciona un canal'

  const selectedChannelSubtitle = useMemo(() => {
    if (!selectedChannel) return undefined
    if (selectedChannel.source === 'events' || selectedChannel.source === 'event_comanda') {
      return [
        selectedChannel.eventCode,
        selectedChannel.source === 'event_comanda' ? 'Comanda' : null,
        eventDateLabel(selectedChannel.eventStart),
      ]
        .filter(Boolean)
        .join(' · ')
    }
    if (selectedChannel.source === 'projects') {
      return [selectedChannel.projectName, selectedChannel.location].filter(Boolean).join(' · ')
    }
    if (selectedChannel.source === 'spaces') {
      const labels: Record<string, string> = {
        pending: 'Pendent',
        in_review: 'En revisió',
        accepted: 'Acceptada',
        rejected: 'Rebutjada',
        applied: 'Aplicada',
      }
      return [
        labels[String(selectedChannel.requestStatus || '')] || 'Pendent',
        selectedChannel.requesterUserName,
      ]
        .filter(Boolean)
        .join(' · ')
    }
    return selectedChannel.location || undefined
  }, [selectedChannel])

  const mentionMembers = useMemo<Member[]>(
    () =>
      members.map((member) => ({
        userId: member.userId,
        userName: member.userName,
      })),
    [members]
  )

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
      <div className="p-0 lg:p-4">
        {mobileView === 'list' ? (
          <div className="px-3 py-2 lg:hidden">
            <Link
              href="/menu"
              className="text-sm font-medium text-slate-600 hover:text-amber-700"
            >
              ← Menú
            </Link>
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className={`lg:col-span-1 ${mobileView === 'chat' ? 'hidden lg:block' : 'block'}`}>
            <OpsChannelsSidebar
              eyebrow="Ops"
              description="Canal intern"
              items={sidebarItems}
              selectedId={selectedChannelId}
              onSelect={openChannel}
              filters={sidebarFilters}
              activeFilter={categoryFilter}
              onFilterChange={(key) =>
                setCategoryFilter(key as 'finques' | 'restaurants' | 'events' | 'projects' | 'spaces')
              }
              footer={
                !eventMode && categoryFilter === 'events' && userRole === 'admin' ? (
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={showArchivedEvents}
                      onChange={(event) => setShowArchivedEvents(event.target.checked)}
                    />
                    Veure tots els xats
                  </label>
                ) : null
              }
              listClassName="max-h-[70vh] lg:max-h-none"
            />
          </div>

          <section
            className={`lg:col-span-3 bg-white dark:bg-slate-900 flex flex-col ${
              mobileView === 'list' ? 'hidden lg:flex' : 'flex'
            } lg:border lg:rounded-xl lg:shadow-sm min-h-[100dvh] lg:min-h-0`}
          >
            <div className="flex items-center lg:border-b dark:border-slate-800">
              <button
                type="button"
                className="lg:hidden shrink-0 px-3 py-2 text-2xl text-gray-700 hover:text-gray-900 dark:text-slate-200 dark:hover:text-white"
                onClick={() => setMobileView('list')}
                aria-label="Tornar"
              >
                ←
              </button>
              {selectedChannel ? (
                <div className="min-w-0 flex-1">
                  <ChannelChatHeader
                    channelTitle={selectedChannelTitle}
                    channelSubtitle={selectedChannelSubtitle}
                    avatarLabel={selectedChannelTitle}
                    channelMuted={channelMuted}
                    onToggleMute={async () => {
                      const next = !channelMuted
                      await fetch(`/api/messaging/channels/${selectedChannel.id}/mute`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ muted: next }),
                      })
                      await Promise.all([refreshChannels(), refreshMembers()])
                    }}
                    participantsOpen={membersOpen}
                    onToggleParticipants={() => setMembersOpen((prev) => !prev)}
                    canInvite={canInviteMembers}
                    inviteDisabled={canInviteMembers && !membersLoaded}
                    inviteUsers={inviteUsers}
                    inviteExcludeIds={inviteExcludeIds}
                    onInvite={(user) => void addParticipant(user)}
                    inviteAdding={addingMember}
                    trailingActions={
                      canManageSelectedSpaceRequest ? (
                        <select
                          aria-label="Estat de la petició d'espais"
                          title="Estat de la petició"
                          value={selectedChannel.requestStatus || 'pending'}
                          disabled={savingSpaceRequestStatus}
                          onChange={(event) =>
                            void updateSpaceRequestStatus(
                              event.target.value as NonNullable<Channel['requestStatus']>
                            )
                          }
                          className="max-w-32 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-800 disabled:opacity-60 sm:max-w-none"
                        >
                          <option value="pending">Pendent</option>
                          <option value="in_review">En revisió</option>
                          <option value="accepted">Acceptada</option>
                          <option value="rejected">Rebutjada</option>
                          <option value="applied">Aplicada</option>
                        </select>
                      ) : undefined
                    }
                  />
                </div>
              ) : (
                <div className="px-4 py-3 text-sm text-slate-500">Selecciona un canal</div>
              )}
            </div>

            {membersOpen && selectedChannel && (
              <ChannelParticipantsPanel
                members={members}
                canManage={canManageParticipants}
                onRemove={(targetUserId) => void removeParticipant(targetUserId)}
                removingUserId={removingUserId}
                canEditResponsible={canEditResponsible}
                onSetResponsible={(targetUserId) => void updateResponsible(targetUserId)}
                savingResponsible={savingResponsible}
                canToggleVisibility={canToggleVisibility}
                selfHidden={selfHidden}
                onToggleVisibility={async () => {
                  if (!selectedChannel) return
                  const nextHidden = !selfHidden
                  await fetch(`/api/messaging/channels/${selectedChannel.id}/visibility`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hidden: nextHidden }),
                  })
                  refreshChannels()
                  refreshMembers()
                }}
              />
            )}

            <div
              ref={scrollRef}
              className="flex-1 px-3 py-4 lg:p-4 space-y-3 overflow-y-auto pb-32"
              onScroll={(e) => {
                const el = e.currentTarget
                if (el.scrollTop < 40 && !loadingMore) {
                  loadMore()
                }
              }}
            >
              <MessageList
                messages={messagesState}
                userId={userId}
                canCreateTicket={canCreateTicket}
                creatingTicketId={creatingTicketId}
                ticketTypePickerId={ticketTypePickerId}
                onDelete={deleteMessage}
                onCreateTicket={createTicketFromMessage}
                onPickTicketType={setTicketTypePickerId}
              onRespondSurvey={respondSurvey}
              />
            </div>
            <Composer
              typingUsers={typingUsers}
              pendingImage={pendingImage}
              pendingFileName={pendingFile?.name || null}
              imageError={imageError}
              imageUploading={imageUploading}
              isSending={loadingSend}
              messageText={messageText}
              onTextChange={(value) => {
                setMessageText(value)
                updateMentionState(value)
                handleTyping(value)
              }}
              onRemoveImage={() => setPendingImage(null)}
              onRemovePendingFile={() => setPendingFile(null)}
              onPickFile={() => fileInputRef.current?.click()}
              onSend={sendMessage}
              onQuick={(quick) => setMessageText((prev) => `${prev} ${quick}`.trim())}
              mentionTarget={mentionTarget}
              mentionOpen={mentionOpen}
              mentionQuery={mentionQuery}
              members={mentionMembers}
              onSelectMention={selectMention}
              isReadOnly={isReadOnlyChannel}
              fileInputRef={fileInputRef}
              onFileChange={(file) => handleAttachmentPick(file)}
              fileAccept={selectedChannel?.source === 'projects' ? '*/*' : 'image/*'}
            />
          </section>
        </div>
      </div>
    </RoleGuard>
  )
}
