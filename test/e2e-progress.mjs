export default async function* e2eProgress(source) {
  const run = { total: 0, done: 0, passed: 0, failed: 0, skipped: 0, startedAt: Date.now() }
  for await (const event of source) {
    const line = lineFor(run, event)
    if (line) yield `${line}\n`
  }
  yield `${summaryOf(run)}\n`
}

const lineFor = (run, { type, data }) => {
  if (type === 'test:stdout') return data.message.trim()
  if (!isTopLevelTest(data)) return ''
  if (type === 'test:enqueue') {
    run.total += 1
    return ''
  }
  if (type === 'test:pass') return finished(run, data, data.skip ? 'skipped' : 'passed')
  if (type === 'test:fail') return finished(run, data, 'failed')
  return ''
}

const isTopLevelTest = data => data?.nesting === 0 && Boolean(data.name) && Boolean(data.file) && !data.file.endsWith(data.name)

const finished = (run, data, outcome) => {
  run.done += 1
  run[outcome] += 1
  const mark = MARKS[outcome]
  const timing = `${clock(elapsedMs(run))} · ~${clock(remainingMs(run))} left`
  const reason = outcome === 'failed' ? ` · ${firstLine(data.details?.error)}` : ''
  return `${run.done}/${run.total} ${mark} ${data.name} · ${timing}${reason}`
}

const summaryOf = run => `Done in ${clock(elapsedMs(run))}: ${run.passed} passed, ${run.failed} failed, ${run.skipped} skipped`

const elapsedMs = run => Date.now() - run.startedAt

const remainingMs = run => run.done ? elapsedMs(run) / run.done * Math.max(0, run.total - run.done) : 0

const firstLine = error => String(error?.cause?.message ?? error?.message ?? error ?? '').split('\n')[0]

const clock = ms => {
  const seconds = Math.round(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const MARKS = Object.freeze({ passed: '✔', failed: '✖', skipped: '-' })
