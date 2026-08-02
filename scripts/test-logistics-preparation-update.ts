import { buildPreparationUpdateFields } from '../src/lib/logistics/preparationUpdate'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const valid = buildPreparationUpdateFields({
  preparacioData: '2026-06-06',
  preparacioHora: '09:30',
})
assert(valid.ok, 'accepts valid date and time')
if (valid.ok) {
  assert(valid.fields.PreparacioData === '2026-06-06', 'maps preparacioData')
  assert(valid.fields.PreparacioHora === '09:30', 'maps preparacioHora')
}

const invalidDate = buildPreparationUpdateFields({
  preparacioData: '06/06/2026',
})
assert(!invalidDate.ok, 'rejects non-ISO dates')

const invalidTime = buildPreparationUpdateFields({
  preparacioHora: '25:00',
})
assert(!invalidTime.ok, 'rejects invalid times')

const empty = buildPreparationUpdateFields({})
assert(!empty.ok, 'rejects empty updates')

console.log('logistics preparation update tests passed')
