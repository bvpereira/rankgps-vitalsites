"use client";

import { useEffect, useRef, useState } from "react";
import type { Business } from "@/types/business";
import type { AuditEntry, OpportunityFilter } from "@/types/prospecting";
import {
  isSocialWebsite,
  matchesOpportunity,
  opportunitiesFor,
} from "@/lib/opportunities";
import BusinessCard from "./BusinessCard";
import WebsiteAnalysis from "./WebsiteAnalysis";

const FILTERS: { id: OpportunityFilter; label: string }[] = [
  { id: "missing_site", label: "Site não informado" },
  { id: "social_site", label: "Link social no campo site" },
  { id: "few_reviews", label: "Poucas avaliações" },
  { id: "low_rating", label: "Nota abaixo de 4" },
  { id: "website_flags", label: "Site com sinais a revisar" },
  { id: "not_analyzed", label: "Site ainda não analisado" },
];

export default function ProspectingResults({
  businesses,
  apiKey,
  disabled,
  onUpdate,
}: {
  businesses: Business[];
  apiKey: string;
  disabled: boolean;
  onUpdate: (business: Business, credits: number | null) => void;
}) {
  const [filters, setFilters] = useState<OpportunityFilter[]>([]);
  const [reviewLimit, setReviewLimit] = useState(20);
  const [audits, setAudits] = useState<Record<string, AuditEntry>>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  const visible = businesses
    .map((business, index) => ({ business, index }))
    .filter(({ business }) =>
      matchesOpportunity(
        business,
        filters,
        reviewLimit,
        business.website ? audits[business.website]?.result : undefined,
      ),
    );
  const pendingUrls = [
    ...new Set(
      visible
        .map(({ business }) => business.website)
        .filter(
          (url): url is string =>
            !!url && !isSocialWebsite(url) && !audits[url]?.result,
        ),
    ),
  ];
  const opportunityCount = businesses.filter(
    (business) =>
      opportunitiesFor(
        business,
        reviewLimit,
        business.website ? audits[business.website]?.result : undefined,
      ).length > 0,
  ).length;

  async function analyze(urls: string[]) {
    if (disabled || inFlight.current || !urls.length) return;
    inFlight.current = true;
    const abort = new AbortController();
    controller.current = abort;
    const queue = [...new Set(urls)].slice(0, 50);
    let next = 0;
    let done = 0;
    setRunning(true);
    setNotice("");
    setProgress({ done: 0, total: queue.length });
    async function worker() {
      while (!abort.signal.aborted && next < queue.length) {
        const url = queue[next++];
        setAudits((current) => ({
          ...current,
          [url]: { status: "pending", result: current[url]?.result },
        }));
        try {
          const response = await fetch("/api/website-audit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
            cache: "no-store",
            signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20000)]),
          });
          const data = await response.json();
          if (
            !response.ok ||
            !data.audit ||
            !["analyzed", "http_error", "inconclusive"].includes(
              data.audit.status,
            )
          )
            throw new Error("AUDIT_FAILED");
          setAudits((current) => ({
            ...current,
            [url]: { status: "done", result: data.audit },
          }));
        } catch {
          setAudits((current) => ({
            ...current,
            [url]: {
              status: "error",
              result: current[url]?.result,
              error: abort.signal.aborted
                ? "Verificação interrompida. Isso não indica um problema no site."
                : "Não foi possível concluir a verificação. Tente novamente ou abra o site no navegador; a falha não comprova que esteja fora do ar.",
            },
          }));
        } finally {
          done++;
          setProgress({ done, total: queue.length });
        }
      }
    }
    try {
      await Promise.all([worker(), worker()]);
      setNotice(
        abort.signal.aborted
          ? "Análise interrompida. Os resultados concluídos foram preservados."
          : `${done} ${done === 1 ? "URL verificada" : "URLs verificadas"}. Confira os sinais nas fichas; verificações bloqueadas ficam como inconclusivas.`,
      );
    } finally {
      inFlight.current = false;
      controller.current = null;
      setRunning(false);
    }
  }

  return (
    <>
      <section
        className="opportunity-panel"
        aria-labelledby="opportunity-heading"
      >
        <div className="opportunity-heading">
          <div>
            <h3 id="opportunity-heading">Filtrar oportunidades</h3>
            <p>
              {opportunityCount} de {businesses.length} empresas com sinais para
              investigar.
            </p>
          </div>
          <button
            className="text-button"
            type="button"
            onClick={() => setFilters([])}
            disabled={!filters.length}
          >
            Limpar filtros
          </button>
        </div>
        <div className="opportunity-filters">
          {FILTERS.map((filter) => {
            const count = businesses.filter((business) =>
              matchesOpportunity(
                business,
                [filter.id],
                reviewLimit,
                business.website ? audits[business.website]?.result : undefined,
              ),
            ).length;
            return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={filters.includes(filter.id)}
                onClick={() =>
                  setFilters((current) =>
                    current.includes(filter.id)
                      ? current.filter((id) => id !== filter.id)
                      : [...current, filter.id],
                  )
                }
              >
                {filter.label}
                <span>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="filter-settings">
          <label htmlFor="review-limit">
            Poucas avaliações: até{" "}
            <input
              id="review-limit"
              type="number"
              min={0}
              max={10000}
              value={reviewLimit}
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                if (Number.isInteger(value) && value >= 0 && value <= 10000)
                  setReviewLimit(value);
              }}
            />{" "}
            avaliações
          </label>
          <p>
            Com vários filtros, mostramos empresas que atendem a qualquer um
            deles. Avaliações não informadas não contam como zero.
          </p>
        </div>
        <div className="audit-toolbar">
          <div>
            <strong>
              {visible.length} de {businesses.length} empresas visíveis
            </strong>
            <p>
              Analise os sites para revelar outros sinais. Links sociais são
              identificados separadamente.
            </p>
          </div>
          <button
            className="button secondary"
            type="button"
            disabled={disabled || running || !pendingUrls.length}
            onClick={() => analyze(pendingUrls)}
          >
            Analisar sites visíveis ({pendingUrls.length})
          </button>
        </div>
        {running && (
          <div className="audit-progress" role="status">
            <span>
              Verificando {progress.done}/{progress.total} URLs · até dois sites
              por vez
            </span>
            <button
              className="text-button"
              type="button"
              onClick={() => controller.current?.abort()}
            >
              Interromper análise
            </button>
          </div>
        )}
        {notice && (
          <p className="help" role="status">
            {notice}
          </p>
        )}
        <p className="filter-caption">
          Filtros não consomem créditos Serper. As análises acessam os sites
          públicos e ficam apenas nesta página. Um dado ausente na API ou no
          HTML exige conferência; não é um diagnóstico completo.
        </p>
      </section>
      {visible.length ? (
        <div className="business-grid">
          {visible.map(({ business, index }) => {
            const audit = business.website
              ? audits[business.website]
              : undefined;
            const opportunities = opportunitiesFor(
              business,
              reviewLimit,
              audit?.result,
            );
            return (
              <BusinessCard
                key={business.id}
                business={business}
                index={index}
                apiKey={apiKey}
                disabled={disabled || running}
                onUpdate={onUpdate}
              >
                <section
                  className="opportunity-summary"
                  aria-label="Sinais de oportunidade"
                >
                  <h4>
                    {opportunities.length
                      ? "Oportunidades para investigar"
                      : "Nenhum sinal com os critérios atuais"}
                  </h4>
                  {opportunities.length > 0 && (
                    <ul>
                      {opportunities.map((opportunity) => (
                        <li key={`${opportunity.code}:${opportunity.label}`}>
                          <span
                            className={`opportunity-badge ${opportunity.kind}`}
                          >
                            {opportunity.kind === "observed"
                              ? "Observado"
                              : "Conferir"}
                          </span>
                          <strong>{opportunity.label}</strong>
                          <p>{opportunity.evidence}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                {business.website && !isSocialWebsite(business.website) && (
                  <WebsiteAnalysis
                    entry={audit}
                    disabled={disabled || running}
                    onAnalyze={() => analyze([business.website!])}
                  />
                )}
              </BusinessCard>
            );
          })}
        </div>
      ) : (
        <div className="filter-empty">
          <h3>Nenhuma empresa atende aos filtros selecionados.</h3>
          <p>
            Limpe os filtros ou analise os sites antes de usar “Site com sinais
            a revisar”.
          </p>
          <button
            className="button secondary"
            type="button"
            onClick={() => setFilters([])}
          >
            Mostrar todas as empresas
          </button>
        </div>
      )}
    </>
  );
}
