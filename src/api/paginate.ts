const PAGE_SIZE = 100;

export async function fetchAll<T>(
  fetcher: (offset: number, limit: number) => Promise<T[]>,
  limit?: number,
): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; ;) {
    const pageSize = limit === undefined ? PAGE_SIZE : Math.min(PAGE_SIZE, limit - all.length);
    if (pageSize === 0) break;

    const page = await fetcher(offset, pageSize);
    all.push(...page.slice(0, pageSize));
    if (page.length < pageSize || all.length === limit) break;
    offset += pageSize;
  }
  return all;
}
