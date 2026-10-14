// Synthetic mocks, as the starting text of the canned and KB fields.
import canned from '../data/canned.json';
import kb from '../data/kb.json';

export const DEFAULT_CANNED = canned.responses.map((r) => r.text).join('\n');
export const DEFAULT_KB = kb.articles.map((a) => `${a.title}: ${a.body}`).join('\n');
