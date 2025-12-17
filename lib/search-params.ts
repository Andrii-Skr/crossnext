import type { ReadonlyURLSearchParams } from "next/navigation";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

export type SearchParamsInput = ReadonlyURLSearchParams | URLSearchParams | SearchParamsRecord | null | undefined;

export function getSearchParamValue(params: SearchParamsInput, key: string): string | undefined {
  if (!params) return undefined;
  if (typeof (params as URLSearchParams).get === "function") {
    const value = (params as URLSearchParams).get(key);
    return value ?? undefined;
  }
  const value = (params as SearchParamsRecord)[key];
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}
