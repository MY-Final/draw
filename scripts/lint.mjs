import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = join(process.cwd(), 'src')
const files = []

function collect(dir) {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name)
    if (statSync(file).isDirectory()) collect(file)
    else if (['.js', '.vue'].includes(extname(file))) files.push(file)
  }
}

collect(root)
const errors = []
for (const file of files) {
  const source = readFileSync(file, 'utf8')
  if (/^(<<<<<<<|=======|>>>>>>>)/m.test(source)) errors.push(`${file}: unresolved merge marker`)
  if (extname(file) !== '.js') continue
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (result.status !== 0) errors.push(`${file}: ${result.stderr.trim()}`)
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  console.log(`lint: checked ${files.length} source files`)
}
