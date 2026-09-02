const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  canManageChannelParticipants,
  canShowChannelInvite,
  resolveChannelInvitePermission,
} = require('../src/lib/messaging/channelChatPermissions')

const base = {
  channelId: 'restaurants_nautic',
  actorUserId: 'u-worker',
  actorRole: 'treballador',
}

test('resolveChannelInvitePermission denies missing channel ids', () => {
  assert.equal(resolveChannelInvitePermission({ ...base, channelId: '' }), false)
  assert.equal(resolveChannelInvitePermission({ ...base, channelId: null }), false)
  assert.equal(resolveChannelInvitePermission({ actorRole: 'admin' }), false)
})

test('resolveChannelInvitePermission trusts API or list hints before role checks', () => {
  assert.equal(
    resolveChannelInvitePermission({ ...base, apiCanManage: true, actorRole: 'usuari' }),
    true
  )
  assert.equal(
    resolveChannelInvitePermission({ ...base, hintCanManage: true, actorRole: 'usuari' }),
    true
  )
})

test('resolveChannelInvitePermission denies while members are loading if the list hint is false', () => {
  assert.equal(
    resolveChannelInvitePermission({
      ...base,
      membersLoaded: false,
      hintCanManage: false,
      actorRole: 'treballador',
    }),
    false
  )
})

test('resolveChannelInvitePermission allows admin, direcció aliases, and the channel responsible', () => {
  assert.equal(resolveChannelInvitePermission({ ...base, actorRole: 'admin' }), true)
  assert.equal(resolveChannelInvitePermission({ ...base, actorRole: 'Direcció' }), true)
  assert.equal(
    resolveChannelInvitePermission({
      ...base,
      actorUserId: 'u-resp',
      responsibleUserId: 'u-resp',
    }),
    true
  )
  assert.equal(
    resolveChannelInvitePermission({
      ...base,
      actorUserId: 'u-other',
      responsibleUserId: 'u-resp',
    }),
    false
  )
})

test('channel invite helpers share the same permission rule', () => {
  const allowed = { ...base, actorRole: 'admin' }
  const denied = { ...base, actorRole: 'treballador' }
  assert.equal(canShowChannelInvite(allowed), true)
  assert.equal(canManageChannelParticipants(allowed), true)
  assert.equal(canShowChannelInvite(denied), false)
  assert.equal(canManageChannelParticipants(denied), false)
})
