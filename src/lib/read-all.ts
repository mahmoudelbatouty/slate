/**
 * PostgREST answers with at most 1000 rows and says nothing about the rest.
 *
 * That silence is the dangerous part: a twelve-league account has ~1500 week-1
 * roster entries and ~1050 matchup rows, so the reads came back truncated and
 * whole leagues rendered with an empty lineup — no error, no warning, just a
 * card missing its starters. The cap is per response, not per query, so the
 * only fix is to keep asking.
 *
 * Pass a builder that applies `.range()` to an otherwise finished query. The
 * builder must impose a stable sort, because LIMIT/OFFSET over an unordered
 * result is free to repeat or skip rows between pages.
 */
const PAGE_SIZE = 1000;

interface Page<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export async function readAll<T>(
  build: (from: number, to: number) => PromiseLike<Page<T>>,
  label: string
): Promise<T[]> {
  const all: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);

    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return all;
  }
}

/**
 * Same idea for the other half of the problem: an `.in()` list rides in the
 * query string, and a full account's worth of player ids makes a URL long
 * enough that the request fails outright. Ask in batches, page each batch.
 */
const CHUNK_SIZE = 200;

export async function readAllIn<T>(
  values: string[],
  build: (chunk: string[], from: number, to: number) => PromiseLike<Page<T>>,
  label: string
): Promise<T[]> {
  const all: T[] = [];

  for (let index = 0; index < values.length; index += CHUNK_SIZE) {
    const chunk = values.slice(index, index + CHUNK_SIZE);
    all.push(...(await readAll((from, to) => build(chunk, from, to), label)));
  }

  return all;
}
