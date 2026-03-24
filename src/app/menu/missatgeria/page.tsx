'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { BellOff, BellRing, Users } from 'lucide-react'
import Link from 'next/link'
import { RoleGuard } from '@/lib/withRoleGuard'
import { getAblyClient } from '@/lib/ablyClient'
import { useSearchParams } from 'next/navigation'
import { normalizeRole } from '@/lib/roles'
import ChannelsSidebar from './components/ChannelsSidebar'
import MembersPanel from './components/MembersPanel'
import MessageList from './components/MessageList'
import Composer from './components/Composer'
import type { Channel, Member, Message, PendingImage } from './types'
import { eventDateLabel, initials } from './utils'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function MissatgeriaPage() {
  const { data: session } = useSession()
  const userId = (session?.user as any)?.id as string | undefined
  const userRole = normalizeRole((session?.user as any)?.role || '')
  const searchParams = useSearchParams()
  const eventMode = searchParams?.get('event') === '1'
  const returnTo = useMemo(() => {
    const raw = searchParams?.get('returnTo')
    return raw ? decodeURIComponent(raw) : null
  }, [searchParams])

  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)
  const [messageText, setMessageText] = useState('')
  const [loadingSend, setLoadingSend] = useState(false)
  const [messagesState, setMessagesState] = useState<Message[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<'finques' | 'restaurants' | 'events' | 'projects'>('finques')
  const [channelQuery, setChannelQuery] = useState('')
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
  const [creatingTicketId, setCreatingTicketId] = useState<string | null>(null)
  const [ticketTypePickerId, setTicketTypePickerId] = useState<string | null>(null)
  const [eventChannel, setEventChannel] = useState<Channel | null>(null)

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
    { refreshInterval: 10000 }
  )

  const channels: Channel[] = Array.isArray(channelsData?.channels)
    ? channelsData.channels
    : []

  useEffect(() => {
    const rawEventId = String(searchParams?.get('eventId') || '').trim()
    if (!rawEventId) return
    if (lastEventIdRef.current === rawEventId) return
    lastEventIdRef.current = rawEventId

    setCategoryFilter('events')
    setChannelQuery('')
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
    const q = channelQuery.trim().toLowerCase()
    if (q) {
      out = out.filter((c) => {
        const hay = [
          c.name,
          c.source,
          c.location,
          c.projectName,
          c.roomName,
          c.eventCode,
          c.eventTitle,
          c.eventStart,
          c.eventEnd,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
    }
    return out
  }, [allChannels, categoryFilter, channelQuery, eventMode, selectedChannelId, isActiveEventChannelForList])

  useEffect(() => {
    const queryChannel = searchParams?.get('channel')
    if (queryChannel && allChannels.some((c) => c.id === queryChannel)) {
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

  const messages: Message[] = Array.isArray(messagesData?.messages)
    ? messagesData.messages
    : []

  const { data: membersData, mutate: refreshMembers } = useSWR(
    selectedChannelId
      ? `/api/messaging/channels/${selectedChannelId}/members`
      : null,
    fetcher
  )

  const members: Member[] = Array.isArray(membersData?.members)
    ? membersData.members
    : []

  const selfMember = useMemo(
    () => members.find((m) => m.userId === userId) || null,
    [members, userId]
  )

  const selectedChannel = useMemo(
    () => allChannels.find((c) => c.id === selectedChannelId) || null,
    [allChannels, selectedChannelId]
  )

  const isReadOnlyChannel = useMemo(() => {
    if (!selectedChannel) return false
    const status = String(selectedChannel.status || '').toLowerCase()
    if (selectedChannel.source === 'projects') {
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

  const canEditResponsible = userRole === 'admin' || userRole === 'direccio'
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
    } catch (err: any) {
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
  }, [messagesData?.messages, selectedChannelId])

  useEffect(() => {
    if (!selectedChannelId) return
    const cached = messagesCache.current.get(selectedChannelId)
    if (cached && cached.length) {
      setMessagesState(cached)
    }
  }, [selectedChannelId])

  useEffect(() => {
    if (!messagesState.length) return
    const ids = messagesState.map((m) => m.id).filter(Boolean)
    fetch('/api/messaging/messages/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageIds: ids }),
    }).catch(() => {})
  }, [messagesState])

  useEffect(() => {
    if (!selectedChannelId) return
    fetch(`/api/messaging/channels/${selectedChannelId}/read`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
    }).then(() => refreshChannels())
  }, [selectedChannelId, refreshChannels])

  useEffect(() => {
    if (!userId) return
    const client = getAblyClient()
    const inboxChannel = client.channels.get(`user:${userId}:inbox`)
    const handler = () => refreshChannels()
    inboxChannel.subscribe('updated', handler)

    return () => {
      inboxChannel.unsubscribe('updated', handler)
    }
  }, [userId, refreshChannels])

  useEffect(() => {
    if (!selectedChannelId) return
    const client = getAblyClient()
    const channel = client.channels.get(`chat:${selectedChannelId}`)
    const direct = userId ? client.channels.get(`user:${userId}:direct`) : null

    const handleMessage = (msg: any) => {
      const data = msg?.data as Message | undefined
      if (!data) return
      if (data.channelId !== selectedChannelId) return
      syncMessagesLocal((current) => [data, ...current.filter((item) => item.id !== data.id)])
    }

    channel.subscribe('message', handleMessage)
    channel.subscribe('typing', (msg) => {
      const data = msg?.data as { userId?: string; userName?: string } | undefined
      if (!data?.userId || data.userId === userId) return
      const typingUserId = String(data.userId)
      setTypingUsers((prev) => ({ ...prev, [typingUserId]: Date.now() }))
    })
    direct?.subscribe('message', handleMessage)

    return () => {
      channel.unsubscribe('message', handleMessage)
      channel.unsubscribe('typing')
      direct?.unsubscribe('message', handleMessage)
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
        senderName: String((session?.user as any)?.name || ''),
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

  const handleTyping = (_value: string) => {
    if (!selectedChannelId || !userId) return
    const now = Date.now()
    if (now - typingThrottleRef.current < 1500) return
    typingThrottleRef.current = now
    const client = getAblyClient()
    const channel = client.channels.get(`chat:${selectedChannelId}`)
    channel.publish('typing', { userId, userName: (session?.user as any)?.name || '' })
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

  const compressImage = async (file: File, maxSizeBytes = 1024 * 1024) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.src = url
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
    })

    const maxDim = 1600
    let { width, height } = img
    if (width > maxDim || height > maxDim) {
      const ratio = Math.min(maxDim / width, maxDim / height)
      width = Math.round(width * ratio)
      height = Math.round(height * ratio)
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No canvas')
    ctx.drawImage(img, 0, 0, width, height)

    let quality = 0.9
    let blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    )

    while (blob && blob.size > maxSizeBytes && quality > 0.5) {
      quality -= 0.1
      blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality)
      )
    }

    URL.revokeObjectURL(url)
    if (!blob) throw new Error('Compress error')
    return { blob, width, height, type: blob.type, size: blob.size }
  }

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
      const { blob, width, height, type, size } = await compressImage(file)
      if (size > 1024 * 1024) {
        throw new Error('La imatge encara pesa massa')
      }
      const form = new FormData()
      form.append('file', blob, 'image.jpg')
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
        meta: { width, height, size, type },
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
    } finally {
      setSavingResponsible(false)
    }
  }

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
      <div className="p-0 lg:p-4">
        {mobileView === 'list' && (
          <div className="px-3 py-2 flex items-center justify-between">
            <Link
              href="/menu"
              className="text-base font-semibold text-gray-900 hover:text-emerald-700 dark:text-slate-100"
            >
              Ops · Canal intern
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className={`lg:col-span-1 ${mobileView === 'chat' ? 'hidden lg:block' : 'block'}`}>
            <ChannelsSidebar
              eventMode={eventMode}
              categoryFilter={categoryFilter}
              setCategoryFilter={setCategoryFilter}
              channelQuery={channelQuery}
              setChannelQuery={setChannelQuery}
              filteredChannels={filteredChannels}
              selectedChannelId={selectedChannelId}
              onOpenChannel={openChannel}
              activeEventUnread={activeEventUnread}
              showArchivedEvents={showArchivedEvents}
              setShowArchivedEvents={setShowArchivedEvents}
              userRole={userRole}
            />
          </div>

          <section
            className={`lg:col-span-3 bg-white dark:bg-slate-900 flex flex-col ${
              mobileView === 'list' ? 'hidden lg:flex' : 'flex'
            } lg:border lg:rounded-xl lg:shadow-sm min-h-[100dvh] lg:min-h-0`}
          >
            <div className="px-3 py-2 lg:py-3 lg:border-b flex items-center justify-between dark:border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="lg:hidden text-2xl text-gray-700 hover:text-gray-900 dark:text-slate-200 dark:hover:text-white -ml-1 px-2"
                  onClick={() => setMobileView('list')}
                  aria-label="Tornar"
                >
                  ←
                </button>
                <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-slate-100 flex items-center justify-center text-xs font-semibold">
                  {initials(
                    selectedChannel?.eventTitle ||
                      selectedChannel?.location ||
                      selectedChannel?.name
                  )}
                </div>
                <div className="min-w-0">
                  {returnTo && selectedChannel ? (
                    <button
                      type="button"
                      className="text-sm font-semibold text-gray-800 dark:text-slate-100 truncate hover:text-emerald-700 dark:hover:text-emerald-300 text-left"
                      onClick={() => {
                        if (typeof window !== 'undefined') {
                          window.location.href = returnTo
                          return
                        }
                      }}
                      title="Tornar a l'esdeveniment"
                    >
                      {selectedChannel?.eventTitle ||
                        selectedChannel?.roomName ||
                        selectedChannel?.location ||
                        selectedChannel?.name ||
                        'Selecciona un canal'}
                    </button>
                  ) : (
                    <div className="text-sm font-semibold text-gray-800 dark:text-slate-100 truncate">
                      {selectedChannel?.eventTitle ||
                        selectedChannel?.roomName ||
                        selectedChannel?.location ||
                        selectedChannel?.name ||
                        'Selecciona un canal'}
                    </div>
                  )}
                  {selectedChannel?.source === 'events' && (
                    <div className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
                      {[selectedChannel.eventCode, eventDateLabel(selectedChannel.eventStart)]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  )}
                  {selectedChannel?.source === 'projects' && (
                    <div className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
                      {[selectedChannel.projectName, selectedChannel.location].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
              </div>
              {selectedChannel && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-gray-600 hover:text-gray-800 dark:text-slate-300 dark:hover:text-white"
                    onClick={() => setMembersOpen((prev) => !prev)}
                    title="Membres del canal"
                  >
                    <Users className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    className="text-gray-600 hover:text-gray-800 dark:text-slate-300 dark:hover:text-white"
                    onClick={async () => {
                      const next = !selectedChannel.muted
                      await fetch(`/api/messaging/channels/${selectedChannel.id}/mute`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ muted: next }),
                      })
                      refreshChannels()
                    }}
                    title={selectedChannel.muted ? 'Activar canal' : 'Silenciar canal'}
                  >
                    {selectedChannel.muted ? (
                      <BellRing className="w-4 h-4" />
                    ) : (
                      <BellOff className="w-4 h-4" />
                    )}
                  </button>
                </div>
              )}
            </div>

            {membersOpen && selectedChannel && (
              <MembersPanel
                members={members}
                selectedChannel={selectedChannel}
                canEditResponsible={canEditResponsible}
                updateResponsible={updateResponsible}
                savingResponsible={savingResponsible}
                userRole={userRole}
                selfMember={selfMember}
                onToggleVisibility={async () => {
                  if (!selectedChannel) return
                  const nextHidden = !(selfMember?.hidden)
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
              members={members}
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





