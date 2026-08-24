import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

export function sha256File(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

export function sha256String(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
