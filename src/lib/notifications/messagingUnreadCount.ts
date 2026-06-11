import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

export async function countMessagingUnread(userId: string): Promise<number> {
  const memberSnap = await db
    .collection('channelMembers')
    .where('userId', '==', userId)
    .get()

  return memberSnap.docs.reduce((acc, doc) => {
    const unread = Number((doc.data() as { unreadCount?: unknown }).unreadCount || 0)
    return acc + (Number.isNaN(unread) ? 0 : unread)
  }, 0)
}
