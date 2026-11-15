export type SearchParams = Record<string, string | string[] | undefined>;

/** A page's search params as a query string; keys that repeat (the signed query has some) stay repeated. */
export function toQueryString(params: SearchParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, v);
  }
  return query.toString();
}
