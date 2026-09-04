const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')

const root = join(__dirname, '..')
const read = (path) => readFileSync(join(root, path), 'utf8')

test('space consultation exposes the Ops request dialog only to read-only users', () => {
  const source = read('src/app/menu/spaces/info/SpacesInfoClient.tsx')
  const dialog = read('src/components/spaces/SpaceRequestDialog.tsx')
  assert.match(source, /ready && canView && !canCreate && !canUpdate/)
  assert.match(source, /<SpaceRequestDialog spaces=\{espais\}/)
  assert.match(dialog, /MessageCircle/)
  assert.match(dialog, /createPortal\(/)
  assert.match(dialog, /document\.body/)
  assert.doesNotMatch(dialog, /OpsIcon/)
})

test('creating a space request creates a record, channel, message and memberships', () => {
  const source = read('src/app/api/spaces/requests/route.ts')
  assert.match(source, /SPACES_REQUESTS_COLLECTION/)
  assert.match(source, /source: 'spaces'/)
  assert.match(source, /collection\('channelMembers'\)/)
  assert.match(source, /resolveSpaceRequestManagers\(\)/)
})

test('space request managers are selected through effective permissions', () => {
  const source = read('src/lib/spaces/spaceRequests.server.ts')
  assert.match(source, /SPACES_REQUESTS_MANAGE_PERM/)
  assert.match(source, /isUiPermissionGranted/)
  assert.match(source, /syncSpaceRequestManagerMembershipForUser/)
  assert.match(source, /collection\('user_access_assignments'\)\.get\(\)/)
  assert.match(source, /hasEffectiveSpaceRequestManagerAccess/)
  assert.match(source, /manageEffect === 'allow'/)
  assert.doesNotMatch(source, /usersSnap\.docs\.map\(async/)
})

test('existing space channels prune everyone except requester and explicit managers', () => {
  const helper = read('src/lib/spaces/spaceRequests.server.ts')
  const membersRoute = read('src/app/api/messaging/channels/[id]/members/route.ts')
  const channelsRoute = read('src/app/api/messaging/channels/route.ts')
  assert.match(helper, /reconcileSpaceRequestChannelMembers/)
  assert.match(helper, /allowedIds\.add\(requesterId\)/)
  assert.match(helper, /batch\.delete\(memberDoc\.ref\)/)
  assert.match(membersRoute, /reconcileSpaceRequestChannelMembers\(id\)/)
  assert.match(channelsRoute, /syncSpaceRequestManagerMembershipForUser\(userId\)/)
  assert.match(helper, /normalizeRole\(user\.role\) === 'admin'/)
})

test('space request responds after persistence and defers realtime notifications', () => {
  const source = read('src/app/api/spaces/requests/route.ts')
  const commitIndex = source.indexOf('await batch.commit()')
  const afterIndex = source.indexOf('after(async () =>')
  assert.ok(commitIndex >= 0)
  assert.ok(afterIndex > commitIndex)
  assert.match(source, /return NextResponse\.json\(\{ ok: true/)
})

test('Ops includes a spaces category and request status management', () => {
  const source = read('src/app/menu/missatgeria/page.tsx')
  assert.match(source, /key: 'spaces'/)
  assert.match(source, /updateSpaceRequestStatus/)
  assert.match(source, /value="in_review"/)
  assert.match(source, /value="applied"/)
})
