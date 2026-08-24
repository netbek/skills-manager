export function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (!/^---\r?$/.test(lines[0] ?? '')) {
    return {name: '', description: ''};
  }
  let name = '';
  let description = '';
  let collecting = false;
  for (const raw of lines.slice(1)) {
    const line = raw.replace(/\r$/, '');
    if (/^(---|\.\.\.)$/.test(line)) {
      break;
    }
    if (line.startsWith('name:')) {
      name = line
        .replace(/^name:[ \t]*/, '')
        .replace(/^"/, '')
        .replace(/"[ \t]*$/, '');
    } else if (line.startsWith('description:')) {
      description = line.replace(/^description:[ \t]*(?:[>|][+-]?)?[ \t]*/, '');
      collecting = true;
    } else if (collecting && /^[ \t]/.test(line)) {
      const part = line.replace(/^[ \t]+/, '');
      description = description === '' ? part : `${description} ${part}`;
    } else {
      collecting = false;
    }
  }
  return {name: trim(name), description: trim(description)};
}

function trim(value) {
  return value.replace(/[ \t]+$/, '');
}
