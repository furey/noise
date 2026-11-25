export const helpFor = (text, place) => text.split(/\n{2,}/)
  .filter(block => isShown(block.split('\n')[0], place))
  .map(block => block.split('\n').filter(line => isShown(line, place)).map(untag).join('\n'))
  .join('\n\n')

export const placeOf = search => {
  const params = new URLSearchParams(search)
  return { desktop: params.get('desktop') === '1', music: params.get('music') === '1' }
}

const isShown = (line, place) => [...line.matchAll(TAG)].every(([, tag]) => place[tag])

const untag = line => line.replace(TAG, '')

const TAG = / \[(desktop|music)\]/g
