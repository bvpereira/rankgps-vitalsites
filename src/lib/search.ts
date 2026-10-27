import { mergeBusinesses } from "./businesses.ts";
import {
  PAGE_LIMIT,
  RESULT_LIMIT,
  type Business,
  type BusinessPage,
  type SearchSnapshot,
} from "../types/business.ts";

export async function collectBusinesses({
  query,
  signal,
  fetchPage,
  onPage,
}: {
  query: string;
  signal: AbortSignal;
  fetchPage: (page: number, ll: string | null) => Promise<BusinessPage>;
  onPage: (snapshot: SearchSnapshot, nextPage: number) => void;
}): Promise<string> {
  let businesses: Business[] = [];
  let ll: string | null = null;
  let credits = 0;
  let creditsKnown = true;
  const searchedAt = new Date().toISOString();
  for (let page = 1; page <= PAGE_LIMIT; page++) {
    signal.throwIfAborted();
    const result = await fetchPage(page, ll);
    const previousCount = businesses.length;
    businesses = mergeBusinesses(businesses, result.businesses, RESULT_LIMIT);
    if (result.credits === null) creditsKnown = false;
    else credits += result.credits;
    ll = result.ll;
    const reachedLimit = businesses.length >= RESULT_LIMIT;
    const exhausted = result.businesses.length === 0;
    const repeated = !exhausted && businesses.length === previousCount;
    onPage(
      {
        query,
        businesses,
        pages: page,
        credits,
        creditsKnown,
        searchedAt,
        complete: reachedLimit || exhausted,
      },
      page + 1,
    );
    if (signal.aborted)
      return "Busca interrompida. Os resultados recebidos foram preservados.";
    if (reachedLimit) return "";
    if (exhausted)
      return businesses.length
        ? "O provedor não retornou mais empresas para esta busca."
        : "Nenhuma empresa foi retornada. Tente incluir a cidade ou usar outro termo.";
    if (repeated)
      return "A Serper repetiu os resultados. A busca foi encerrada para evitar novas chamadas sem empresas adicionais.";
    if (!ll)
      return "A Serper não informou a área necessária para buscar as próximas páginas. Exibimos as empresas recebidas.";
    if (!result.hasMore || page === PAGE_LIMIT)
      return "O limite de páginas desta consulta foi atingido. Exibimos as empresas únicas encontradas até aqui.";
  }
  return "";
}
