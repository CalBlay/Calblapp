process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'commonjs',
  moduleResolution: 'node',
})
process.env.TS_NODE_TRANSPILE_ONLY = 'true'

require('ts-node/register/transpile-only')
require('tsconfig-paths/register')
