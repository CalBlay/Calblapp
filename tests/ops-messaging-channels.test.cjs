const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  slugifyOpsLocation,
  getOpsChannelId,
  resolveOpsChannelByLocationName,
} = require('../src/lib/opsMessagingChannels')

test('slugifyOpsLocation strips accents and non-alnum runs', () => {
  assert.equal(slugifyOpsLocation('Nàutic'), 'nautic')
  assert.equal(slugifyOpsLocation('  Clos la Plana  '), 'clos-la-plana')
  assert.equal(slugifyOpsLocation('Font de la Canya!!!'), 'font-de-la-canya')
})

test('getOpsChannelId prefixes source with slugified location', () => {
  assert.equal(getOpsChannelId('restaurants', 'Nàutic'), 'restaurants_nautic')
  assert.equal(getOpsChannelId('finques', 'Clos la Plana'), 'finques_clos-la-plana')
})

test('resolveOpsChannelByLocationName matches accent-insensitively and maps intakeChannel', () => {
  const nautic = resolveOpsChannelByLocationName('  nautic  ')
  assert.deepEqual(nautic, {
    channelId: 'restaurants_nautic',
    intakeChannel: 'restaurant',
    source: 'restaurants',
    location: 'Nàutic',
  })

  const finca = resolveOpsChannelByLocationName('CLOS LA PLANA')
  assert.deepEqual(finca, {
    channelId: 'finques_clos-la-plana',
    intakeChannel: 'finca',
    source: 'finques',
    location: 'Clos la Plana',
  })

  assert.equal(resolveOpsChannelByLocationName(''), null)
  assert.equal(resolveOpsChannelByLocationName('Desconegut'), null)
})
