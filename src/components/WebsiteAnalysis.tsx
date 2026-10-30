"use client";

import type { AuditEntry } from "@/types/prospecting";

export default function WebsiteAnalysis({
  entry,
  onAnalyze,
  disabled,
}: {
  entry?: AuditEntry;
  onAnalyze: () => void;
  disabled: boolean;
}) {
  const audit = entry?.result;
  const fact = (value: boolean | null, yes: string, no: string) =>
    value === null ? "Não verificado" : value ? yes : no;
  return (
    <section className="website-analysis" aria-label="Análise básica do site">
      <div className="audit-heading">
        <h4>Análise básica do site</h4>
        <button
          className="button secondary"
          type="button"
          disabled={disabled || entry?.status === "pending"}
          onClick={onAnalyze}
        >
          {entry?.status === "pending"
            ? "Analisando…"
            : audit
              ? "Analisar novamente"
              : "Analisar site"}
        </button>
      </div>
      {!entry && (
        <p className="help">
          Verifica esta URL sem consumir créditos Serper. Não inclui teste
          visual nem execução de JavaScript.
        </p>
      )}
      {entry?.status === "error" && (
        <p className="feedback" role="alert">
          {entry.error}
        </p>
      )}
      {audit && (
        <>
          <p className={`audit-status audit-${audit.status}`}>
            {audit.status === "analyzed"
              ? "HTML analisado"
              : audit.status === "http_error"
                ? `Resposta HTTP ${audit.httpStatus}`
                : "Análise inconclusiva"}
          </p>
          <p className="help">{audit.message}</p>
          {audit.status !== "inconclusive" && (
            <dl className="audit-facts">
              <div>
                <dt>URL final</dt>
                <dd>
                  <a
                    href={audit.finalUrl ?? audit.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {audit.finalUrl ?? audit.url} ↗
                  </a>
                </dd>
              </div>
              <div>
                <dt>Conexão da página final</dt>
                <dd>
                  {fact(audit.https, "HTTPS", "HTTP · revisar segurança")}
                </dd>
              </div>
              <div>
              <dt>Tempo da consulta ao HTML</dt>
                <dd>
                  {audit.responseMs === null
                    ? "Não medido"
                    : `${(audit.responseMs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} s · não é o carregamento completo`}
                </dd>
              </div>
              {audit.status === "analyzed" && (
                <>
                  <div>
                    <dt>Título da página</dt>
                    <dd>{audit.title ?? "Não encontrado no HTML"}</dd>
                  </div>
                  <div>
                    <dt>Descrição do site · meta description</dt>
                    <dd>{audit.description ?? "Não encontrada no HTML"}</dd>
                  </div>
                  <div>
                    <dt>Viewport para celular</dt>
                    <dd>
                      {fact(
                        audit.viewport,
                        "Configuração encontrada · conferir layout",
                        "Não encontrado · conferir no celular",
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Link de WhatsApp</dt>
                    <dd>
                      {fact(
                        audit.whatsapp,
                        "Encontrado no HTML",
                        "Não identificado no HTML",
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Link de contato ou formulário</dt>
                    <dd>
                      {fact(
                        audit.contact,
                        "Sinal encontrado · conferir caminho de contato",
                        "Não identificado no HTML",
                      )}
                    </dd>
                  </div>
                </>
              )}
            </dl>
          )}
          <p className="audit-date">
            Verificado em {new Date(audit.checkedAt).toLocaleString("pt-BR")}.
            Sinais ausentes podem ser carregados por JavaScript. Confira antes
            de abordar.
          </p>
        </>
      )}
    </section>
  );
}
