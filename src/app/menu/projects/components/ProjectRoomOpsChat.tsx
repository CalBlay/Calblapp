'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { getAblyClient } from '@/lib/ablyClient'
import { toast } from '@/components/ui/use-toast'
import MessageList from '@/app/menu/missatgeria/components/MessageList'
import Composer from '@/app/menu/missatgeria/components/Composer'
import type { Member, Message, PendingImage } from '@/app/menu/missatgeria/types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Props = {
  channelId: string
  userId?: string
  canCreateTaskFromHash?: boolean
  onCreateTaskFromHash?: (text: string) => Promise<{ title: string }>
  onOperationalDocumentCreated?: (document: {
    id?: string
    name?: string
    label?: string
    category?: string
    path?: string
    url?: string
    size?: number
    type?: string
  }) => void
}

export default function ProjectRoomOpsChat({
  channelId,
  userId,
  canCreateTaskFromHash = false,
  onCreateTaskFromHash,
  onOperationalDocumentCreated,
}: Props) {
  const [messageText, setMessageText] = useState('')
  const [loadingSend, setLoadingSend] = useState(false)
  const [messagesState, setMessagesState] = useState<Message[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({})
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionTarget, setMentionTarget] = useState<Member | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const messagesCache = useRef<Map<string, Message[]>>(new Map())
  const typingThrottleRef = useRef<number>(0)

  const { data: messagesData, mutate: refreshMessages } = useSWR(
    channelId ? `/api/messaging/channels/${channelId}/messages?limit=20` : null,
    fetcher,
    { refreshInterval: 0 }
  )
  const { data: channelData } = useSWR(
    channelId ? `/api/messaging/channels/${channelId}` : null,
    fetcher
  )
  const { data: membersData } = useSWR(
    channelId ? `/api/messaging/channels/${channelId}/members` : null,
    fetcher
  )

  const members: Member[] = Array.isArray(membersData?.members) ? membersData.members : []
  const messages: Message[] = Array.isArray(messagesData?.messages) ? messagesData.messages : []
  const isReadOnly = String(channelData?.channel?.status || '').toLowerCase() === 'archived'

  const notifyOperationalDocument = (message: Partial<Message> | null | undefined) => {
    if (!message?.fileUrl) return
    onOperationalDocumentCreated?.({
      id: message.id || `room-doc-${Date.now()}`,
      name: message.fileName || '',
      label: message.fileName || 'Document operatiu',
      category: 'other',
      path: message.filePath || '',
      url: message.fileUrl || '',
      size: message.fileMeta?.size || 0,
      type: message.fileMeta?.type || '',
    })
  }

  const sameMessages = (left: Message[], right: Message[]) => {
    if (left === right) return true
    if (left.length !== right.length) return false
    return left.every((message, index) => {
      const next = right[index]
      return (
        next &&
        message.id === next.id &&
        message.createdAt === next.createdAt &&
        message.body === next.body &&
        message.imageUrl === next.imageUrl &&
        message.fileUrl === next.fileUrl
      )
    })
  }

  useEffect(() => {
    setMessagesState((current) => (sameMessages(current, messages) ? current : messages))
    if (channelId) {
      messagesCache.current.set(channelId, messages)
    }
  }, [messagesData?.messages, channelId])

  useEffect(() => {
    if (!channelId) return
    const cached = messagesCache.current.get(channelId)
    if (cached?.length) setMessagesState(cached)
  }, [channelId])

  useEffect(() => {
    if (!channelId || !messagesState.length) return
    const ids = messagesState.map((m) => m.id).filter(Boolean)
    fetch('/api/messaging/messages/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageIds: ids }),
    }).catch(() => {})
    fetch(`/api/messaging/channels/${channelId}/read`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {})
  }, [channelId, messagesState])

  useEffect(() => {
    if (!channelId) return
    const client = getAblyClient()
    const channel = client.channels.get(`chat:${channelId}`)

    const handleMessage = (msg: any) => {
      const data = msg?.data as Message | undefined
      if (!data || data.channelId !== channelId) return
      notifyOperationalDocument(data)
      refreshMessages()
    }

    const handleTyping = (msg: any) => {
      const data = msg?.data as { userId?: string } | undefined
      if (!data?.userId || data.userId === userId) return
      setTypingUsers((prev) => ({ ...prev, [data.userId!]: Date.now() }))
    }

    channel.subscribe('message', handleMessage)
    channel.subscribe('typing', handleTyping)

    return () => {
      channel.unsubscribe('message', handleMessage)
      channel.unsubscribe('typing', handleTyping)
    }
  }, [channelId, refreshMessages, userId])

  useEffect(() => {
    const now = Date.now()
    const active = Object.entries(typingUsers).filter(([, ts]) => now - ts < 3000)
    if (active.length === 0) return
    const timer = setTimeout(() => {
      setTypingUsers((prev) => {
        const next: Record<string, number> = {}
        Object.entries(prev).forEach(([uid, ts]) => {
          if (Date.now() - ts < 3000) next[uid] = ts
        })
        return next
      })
    }, 1000)
    return () => clearTimeout(timer)
  }, [typingUsers])

  const loadMore = async () => {
    if (!channelId || messagesState.length === 0 || loadingMore) return
    try {
      setLoadingMore(true)
      const oldest = messagesState[messagesState.length - 1]
      const before = oldest?.createdAt ? `&before=${oldest.createdAt}` : ''
      const res = await fetch(`/api/messaging/channels/${channelId}/messages?limit=10${before}`)
      const data = await res.json()
      const next = Array.isArray(data?.messages) ? data.messages : []
      const merged = [...messagesState, ...next]
      const dedup = Array.from(new Map(merged.map((m) => [m.id, m])).values())
      setMessagesState(dedup)
      messagesCache.current.set(channelId, dedup)
    } finally {
      setLoadingMore(false)
    }
  }

  const deleteMessage = async (msgId: string) => {
    if (!confirm('Vols esborrar aquest missatge?')) return
    await fetch(`/api/messaging/messages/${msgId}`, { method: 'DELETE' })
    refreshMessages()
  }

  const sendMessage = async () => {
    const trimmedMessage = messageText.trim()
    const hasText = !!trimmedMessage
    const hasImage = !!pendingImage?.url
    const hasFile = !!pendingFile
    if (!channelId || isReadOnly || (!hasText && !hasImage && !hasFile)) return
    const directTarget = mentionTarget?.userId || ''
    const finalVisibility = directTarget ? 'direct' : 'channel'

    try {
      setLoadingSend(true)
      if (hasText && !hasImage && !hasFile && trimmedMessage.startsWith('#')) {
        if (!canCreateTaskFromHash || !onCreateTaskFromHash) {
          toast({
            title: 'No pots crear tasques des del xat',
            description: 'Aquesta accio nomes la pot fer el responsable del bloc o del projecte.',
            variant: 'destructive',
          })
          return
        }

        const taskText = trimmedMessage.replace(/^#\s*/, '').trim()
        if (!taskText) {
          toast({
            title: 'Tasca buida',
            description: 'Escriu text despres del signe # per crear la tasca.',
            variant: 'destructive',
          })
          return
        }

        const createdTask = await onCreateTaskFromHash(taskText)
        await fetch(`/api/messaging/channels/${channelId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `Tasca creada: ${createdTask.title}`,
            visibility: 'channel',
          }),
        })
        setMessageText('')
        setMentionTarget(null)
        setMentionOpen(false)
        setMentionQuery('')
        return
      }

      let filePayload:
        | {
            fileUrl?: string
            filePath?: string
            fileName?: string
            fileMeta?: { size?: number; type?: string }
          }
        | undefined

      if (pendingFile) {
        const form = new FormData()
        form.append('file', pendingFile)
        form.append('channelId', channelId)
        const uploadRes = await fetch('/api/messaging/upload-file', {
          method: 'POST',
          body: form,
        })
        const uploadData = await uploadRes.json().catch(() => ({}))
        if (!uploadRes.ok || !uploadData?.document) {
          throw new Error(uploadData?.error || 'Error pujant el fitxer')
        }
        onOperationalDocumentCreated?.(uploadData.document)
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

      await fetch(`/api/messaging/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: hasText ? trimmedMessage : '',
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
      setMessageText('')
      setPendingImage(null)
      setPendingFile(null)
      setMentionTarget(null)
      setMentionOpen(false)
      setMentionQuery('')
      refreshMessages()
    } catch (err) {
      if (err instanceof Error && err.message === 'cancelled') return
      toast({
        title: 'No s ha pogut enviar',
        description: err instanceof Error ? err.message : 'Error inesperat',
        variant: 'destructive',
      })
    } finally {
      setLoadingSend(false)
    }
  }

  const handleTyping = () => {
    if (!channelId || !userId) return
    const now = Date.now()
    if (now - typingThrottleRef.current < 1500) return
    typingThrottleRef.current = now
    const client = getAblyClient()
    const channel = client.channels.get(`chat:${channelId}`)
    channel.publish('typing', { userId })
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
      if (!value.includes(token)) setMentionTarget(null)
    }
  }

  const selectMention = (member: Member) => {
    setMessageText((current) => current.replace(/@([^\s@]{0,30})$/, `@${member.userName} `))
    setMentionTarget(member)
    setMentionOpen(false)
    setMentionQuery('')
  }

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
    let blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))

    while (blob && blob.size > maxSizeBytes && quality > 0.5) {
      quality -= 0.1
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    }

    URL.revokeObjectURL(url)
    if (!blob) throw new Error('Compress error')
    return { blob, width, height, type: blob.type, size: blob.size }
  }

  const handleAttachmentPick = async (file: File | null) => {
    if (!file || !channelId) return
    setImageError(null)
    if (!file.type.startsWith('image/')) {
      setPendingImage(null)
      setPendingFile(file)
      return
    }
    try {
      setImageUploading(true)
      setPendingFile(null)
      const { blob, width, height, type, size } = await compressImage(file)
      if (size > 1024 * 1024) throw new Error('La imatge encara pesa massa')
      const form = new FormData()
      form.append('file', blob, 'image.jpg')
      form.append('channelId', channelId)
      const res = await fetch('/api/messaging/upload-image', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Error pujant la imatge')
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

  const filteredMembers = useMemo(
    () => members.filter((member) => member.userName.toLowerCase().includes(mentionQuery)),
    [members, mentionQuery]
  )

  return (
    <>
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto px-5 py-4"
        onScroll={(event) => {
          if (event.currentTarget.scrollTop < 40) loadMore()
        }}
      >
        <MessageList
          messages={messagesState}
          userId={userId}
          canCreateTicket={false}
          creatingTicketId={null}
          ticketTypePickerId={null}
          onDelete={deleteMessage}
          onCreateTicket={() => {}}
          onPickTicketType={() => {}}
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
          handleTyping()
        }}
        onRemoveImage={() => setPendingImage(null)}
        onRemovePendingFile={() => setPendingFile(null)}
        onPickFile={() => fileInputRef.current?.click()}
        onSend={sendMessage}
        onQuick={(value) => setMessageText((current) => `${current}${current ? ' ' : ''}${value}`)}
        mentionTarget={mentionTarget}
        mentionOpen={mentionOpen}
        mentionQuery={mentionQuery}
        members={filteredMembers}
        onSelectMention={selectMention}
        isReadOnly={isReadOnly}
        fileInputRef={fileInputRef}
        onFileChange={handleAttachmentPick}
        fileAccept="*/*"
      />
    </>
  )
}
