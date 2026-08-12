const PAGE_SIZE = 100;

export async function fetchAll<T>(
  fetcher: (offset: number, limit: number) => Promise<T[]>,
  limit?: number,
): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await fetcher(offset, PAGE_SIZE);
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    if (limit && all.length >= limit) {
      all.splice(limit);
      break;
    }
  }
  return all;
}
