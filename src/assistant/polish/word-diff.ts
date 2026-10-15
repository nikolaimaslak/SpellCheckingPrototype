export interface DiffSegment {
  type: 'same' | 'removed' | 'added';
  text: string;
}

const TOKEN = /[\p{L}\p{M}\p{N}]+|[^\S\n]+|\n|[^\p{L}\p{M}\p{N}\s]/gu;

const splitIntoTokens = (text: string) => text.match(TOKEN) ?? [];

export function wordDiff(before: string, after: string): DiffSegment[] {
  const oldTokens = splitIntoTokens(before);
  const newTokens = splitIntoTokens(after);
  const commonLengthFrom = longestCommonLengths(oldTokens, newTokens);

  const segments: DiffSegment[] = [];
  const append = (type: DiffSegment['type'], text: string) => {
    const lastSegment = segments.at(-1);
    if (lastSegment?.type === type) {
      lastSegment.text += text;
    } else {
      segments.push({ type, text });
    }
  };

  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldTokens.length || newIndex < newTokens.length) {
    const bothLeft = oldIndex < oldTokens.length && newIndex < newTokens.length;
    if (bothLeft && oldTokens[oldIndex] === newTokens[newIndex]) {
      append('same', oldTokens[oldIndex]);
      oldIndex++;
      newIndex++;
      continue;
    }
    const addingKeepsMore =
      newIndex < newTokens.length &&
      (oldIndex === oldTokens.length || commonLengthFrom[oldIndex][newIndex + 1] > commonLengthFrom[oldIndex + 1][newIndex]);
    if (addingKeepsMore) {
      append('added', newTokens[newIndex]);
      newIndex++;
    } else {
      append('removed', oldTokens[oldIndex]);
      oldIndex++;
    }
  }
  return segments;
}

function longestCommonLengths(oldTokens: string[], newTokens: string[]): number[][] {
  const lengths = Array.from({ length: oldTokens.length + 1 }, () => new Array<number>(newTokens.length + 1).fill(0));
  for (let oldIndex = oldTokens.length - 1; oldIndex >= 0; oldIndex--) {
    for (let newIndex = newTokens.length - 1; newIndex >= 0; newIndex--) {
      lengths[oldIndex][newIndex] =
        oldTokens[oldIndex] === newTokens[newIndex]
          ? lengths[oldIndex + 1][newIndex + 1] + 1
          : Math.max(lengths[oldIndex + 1][newIndex], lengths[oldIndex][newIndex + 1]);
    }
  }
  return lengths;
}
