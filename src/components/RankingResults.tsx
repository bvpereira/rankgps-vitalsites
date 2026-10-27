import type { MapPoint, PointResult, RankingResponse } from "@/types/ranking";

export function resultLabel(result: PointResult) {
  if (result.status === "found") return `${result.position}º lugar`;
  if (result.status === "not_found") return "Não encontrado";
  if (result.status === "ambiguous") return "Nome ambíguo";
  return "Erro na consulta";
}

export default function RankingResults({
  data,
  points,
  busy,
  error,
  term,
  business,
}: {
  data: RankingResponse | null;
  points: MapPoint[];
  busy: boolean;
  error: string;
  term: string;
  business: string;
}) {
  return (
    <section
      className="panel ranking-results"
      aria-labelledby="results-heading"
      aria-busy={busy}
    >
      <div className="section-heading">
        <div>
          <span className="step-label">03 / ANALISAR</span>
          <h2 id="results-heading">Resultados da consulta</h2>
        </div>
        {data && (
          <span className="help">
            {new Date(data.searchedAt).toLocaleString("pt-BR")}
          </span>
        )}
      </div>
      <p className="help" role="status">
        {busy
          ? "Consultando os cinco pontos na Serper…"
          : data
            ? `Busca: “${term}” · Estabelecimento: “${business}”`
            : "Preencha os campos e selecione cinco pontos para consultar o Google Maps."}
      </p>
      {error && (
        <p className="feedback" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          <p className="help">
            Primeira página do Google Maps via Serper, centrada em cada ponto,
            sem zoom imposto pelo aplicativo ou filtro por distância. “Não
            encontrado” se refere apenas aos resultados retornados. A Busca
            Google e a sua sessão pessoal podem apresentar outra ordem.
          </p>
          <div className="result-grid">
            {points.map((point, index) => {
              const result = data.results.find(
                (item) => item.pointId === point.id,
              );
              if (!result) return null;
              return (
                <article
                  className={`result-card result-${result.status}`}
                  key={point.id}
                >
                  <span className="step-label">PONTO {index + 1}</span>
                  <h3>{resultLabel(result)}</h3>
                  <p className="coordinates">
                    {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
                  </p>
                  <a
                    className="comparison-link"
                    href={`https://www.google.com/maps/search/${encodeURIComponent(term)}/@${point.lat},${point.lng}?hl=pt-BR`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir esta área no Google Maps ↗
                  </a>
                  <p className="help">
                    O link centraliza o mapa; não altera a localização do seu
                    navegador.
                  </p>
                  {result.status === "error" ? (
                    <p className="help">{result.message}</p>
                  ) : (
                    <>
                      <p className="help">
                        {result.places.length} resultados analisados
                      </p>
                      {result.status === "found" && (
                        <p className="match-detail">
                          <strong>{result.matches[0].title}</strong>
                          <span>
                            {result.matches[0].address ||
                              "Endereço não informado"}
                          </span>
                        </p>
                      )}
                      {result.status === "not_found" && (
                        <p className="help">
                          Confira o nome completo nos resultados abaixo.
                        </p>
                      )}
                      {result.status === "ambiguous" && (
                        <div className="match-detail">
                          <p>
                            Mais de um estabelecimento tem esse nome. Confira os
                            endereços:
                          </p>
                          {result.matches.map((match, i) => (
                            <p key={i}>
                              {match.position}º · {match.title}
                              <br />
                              {match.address || "Endereço não informado"}
                            </p>
                          ))}
                        </div>
                      )}
                      {result.places.length > 0 && (
                        <details>
                          <summary>Ver resultados retornados</summary>
                          <ol className="returned-places">
                            {result.places.map((place, i) => (
                              <li key={i} value={place.position}>
                                <strong>{place.title}</strong>
                                <span>
                                  {place.address || "Endereço não informado"}
                                </span>
                              </li>
                            ))}
                          </ol>
                        </details>
                      )}
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
