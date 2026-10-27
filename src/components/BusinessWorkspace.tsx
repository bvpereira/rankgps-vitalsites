"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useApiKey } from "@/hooks/useApiKey";
import { collectBusinesses } from "@/lib/search";
import {
  RESULT_LIMIT,
  type Business,
  type BusinessPage,
  type SearchSnapshot,
} from "@/types/business";
import BusinessCard from "./BusinessCard";

export default function BusinessWorkspace() {
  const key = useApiKey();
  const [query, setQuery] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<SearchSnapshot | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [progress, setProgress] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  const canSearch = key.ready && !!key.apiKey.trim() && !!query.trim() && !busy;

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSearch || inFlight.current) return;
    inFlight.current = true;
    const abort = new AbortController();
    controller.current = abort;
    const term = query.trim();
    const apiKey = key.apiKey.trim();
    setBusy(true);
    setError("");
    setNotice("");
    setProgress(1);
    setSnapshot(null);
    try {
      const message = await collectBusinesses({
        query: term,
        signal: abort.signal,
        onPage: (snapshot, nextPage) => {
          setSnapshot(snapshot);
          setProgress(nextPage);
        },
        fetchPage: async (page, ll): Promise<BusinessPage> => {
          const response = await fetch("/api/businesses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ apiKey, query: term, page, ll }),
            cache: "no-store",
            signal: AbortSignal.any([abort.signal, AbortSignal.timeout(28000)]),
          });
          const data = await response.json();
          if (!response.ok)
            throw new Error(
              data.error || "Não foi possível obter os resultados.",
            );
          if (!Array.isArray(data.businesses) || data.page !== page)
            throw new Error("O servidor retornou uma página inválida.");
          return data;
        },
      });
      setNotice(message);
    } catch (error) {
      if (abort.signal.aborted)
        setNotice(
          "Busca interrompida. Os resultados já recebidos foram preservados; chamadas em andamento podem ter consumido créditos.",
        );
      else
        setError(
          error instanceof Error &&
            !["TypeError", "SyntaxError", "TimeoutError"].includes(error.name)
            ? error.message
            : "Falha ou tempo limite ao buscar a próxima página. Os resultados recebidos foram preservados; a chamada pode ter consumido créditos.",
        );
    } finally {
      setBusy(false);
      inFlight.current = false;
      controller.current = null;
    }
  }

  function updateBusiness(business: Business, amount: number | null) {
    setSnapshot((previous) =>
      previous
        ? {
            ...previous,
            businesses: previous.businesses.map((item) =>
              item.id === business.id ? business : item,
            ),
            credits: previous.credits + (amount ?? 0),
            creditsKnown: previous.creditsKnown && amount !== null,
          }
        : previous,
    );
  }
  const businesses = snapshot?.businesses ?? [];
  const websites = businesses.filter((business) => business.website).length;
  const phones = businesses.filter((business) => business.phone).length;
  const categories = new Set(
    businesses.map((business) => business.primaryCategory).filter(Boolean),
  ).size;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="RankGPS, início">
          <span className="brand-mark" aria-hidden="true">
            R<span>↗</span>
          </span>
          <span>
            RankGPS<small>VITAL SITES</small>
          </span>
        </Link>
        <div className="sidebar-label">ÁREA DE TRABALHO</div>
        <a className="nav-active" href="#buscar">
          <span aria-hidden="true">⌕</span>Explorar empresas
          <span className="nav-dot" />
        </a>
        <section className="key-panel" aria-labelledby="key-heading">
          <div className="key-heading">
            <span className="small-icon" aria-hidden="true">
              ⚿
            </span>
            <h2 id="key-heading">Sua conexão</h2>
            <span
              className={`connection-dot ${key.apiKey.trim() ? "connected" : ""}`}
            />
          </div>
          <label htmlFor="api-key">API Key Serper.dev</label>
          <div className="key-input">
            <input
              id="api-key"
              type={showKey ? "text" : "password"}
              value={key.apiKey}
              disabled={!key.ready || busy}
              onChange={(event) => key.updateKey(event.target.value)}
              placeholder="Cole sua chave aqui"
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="none"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              aria-label={showKey ? "Ocultar chave" : "Mostrar chave"}
            >
              {showKey ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={key.remember}
              disabled={!key.ready || busy}
              onChange={(event) => key.updateRemember(event.target.checked)}
            />
            Lembrar neste navegador
          </label>
          <p className="help">
            {key.remember
              ? "A chave fica neste navegador até você apagá-la ou desmarcar a opção."
              : "A chave será esquecida ao atualizar a página."}
          </p>
          <button
            className="text-button"
            disabled={!key.ready || !key.apiKey || busy}
            type="button"
            onClick={() => {
              key.clearKey();
              setShowKey(false);
            }}
          >
            Apagar / trocar chave
          </button>
          {key.storageError && (
            <p className="feedback" role="alert">
              {key.storageError}
            </p>
          )}
        </section>
        <div className="sidebar-note">
          <span aria-hidden="true">ⓘ</span>
          <p>
            Sua chave é usada apenas para realizar as consultas. Você pode
            trocá-la a qualquer momento.
          </p>
        </div>
        <div className="sidebar-footer">
          <span className="avatar">VS</span>
          <div>
            Vital Sites<small>Workspace pessoal</small>
          </div>
          <span aria-hidden="true">↗</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <strong>Explorar empresas</strong>
          </div>
          <a
            href="https://serper.dev/dashboard"
            target="_blank"
            rel="noreferrer"
          >
            Painel Serper <span aria-hidden="true">↗</span>
          </a>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                <span />
                INTELIGÊNCIA LOCAL
              </p>
              <h1>
                Conheça as empresas.
                <br />
                <span>Encontre as oportunidades.</span>
              </h1>
              <p>
                Explore os perfis do Google Maps e reúna os dados das empresas
                em uma única busca.
              </p>
            </div>
            <span className="source-badge">
              <span className="google-g" aria-hidden="true">
                G
              </span>
              Dados via Serper<small>Google Maps</small>
            </span>
          </div>
          <section
            className="search-panel"
            id="buscar"
            aria-labelledby="search-heading"
          >
            <div className="search-heading">
              <h2 id="search-heading">O que você quer encontrar?</h2>
              <span>ATÉ 50 EMPRESAS POR BUSCA</span>
            </div>
            <form onSubmit={search}>
              <label className="sr-only" htmlFor="query">
                Termo e cidade
              </label>
              <div className="search-input">
                <span aria-hidden="true">⌕</span>
                <input
                  id="query"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  disabled={busy}
                  maxLength={300}
                  placeholder="Ex.: advogado em Rio das Ostras"
                  required
                />
                <button
                  className="button primary"
                  disabled={!canSearch}
                  type="submit"
                >
                  {busy ? (
                    <>
                      <span className="spinner" />
                      Buscando…
                    </>
                  ) : (
                    <>
                      Buscar empresas <span aria-hidden="true">→</span>
                    </>
                  )}
                </button>
              </div>
              <div className="search-footnote">
                <p>
                  Inclua a atividade e a cidade para direcionar os resultados.
                </p>
                <span>
                  <span className="tiny-dot" />
                  {busy
                    ? `Consultando página ${progress} · ${businesses.length}/${RESULT_LIMIT} empresas`
                    : "Consultas consomem créditos Serper"}
                </span>
              </div>
            </form>
            {busy && (
              <div className="search-progress" role="status">
                <div className="progress-track">
                  <span
                    style={{
                      width: `${Math.max(4, (businesses.length / RESULT_LIMIT) * 100)}%`,
                    }}
                  />
                </div>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    controller.current?.abort();
                    setNotice(
                      "Busca interrompida. As páginas recebidas foram preservadas.",
                    );
                  }}
                >
                  Interromper busca
                </button>
              </div>
            )}
          </section>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-icon blue" aria-hidden="true">
                ▤
              </span>
              <div>
                <span>Empresas encontradas</span>
                <strong>
                  {businesses.length}
                  <small>/ 50</small>
                </strong>
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-icon teal" aria-hidden="true">
                ↗
              </span>
              <div>
                <span>Com site informado</span>
                <strong>
                  {websites}
                  <small>empresas</small>
                </strong>
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-icon purple" aria-hidden="true">
                ⌘
              </span>
              <div>
                <span>Com telefone</span>
                <strong>
                  {phones}
                  <small>empresas</small>
                </strong>
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-icon amber" aria-hidden="true">
                ◇
              </span>
              <div>
                <span>Categorias principais</span>
                <strong>
                  {categories}
                  <small>categorias</small>
                </strong>
              </div>
            </div>
          </div>
          <section
            className="results-section"
            aria-labelledby="results-heading"
            aria-busy={busy}
          >
            <div className="results-heading">
              <div>
                <h2 id="results-heading">
                  {snapshot
                    ? "Empresas encontradas"
                    : "Seu próximo panorama começa aqui"}
                  {snapshot && (
                    <span className="count-badge">{businesses.length}</span>
                  )}
                </h2>
                <p>
                  {snapshot
                    ? `Resultados para “${snapshot.query}”`
                    : "Os resultados da sua consulta aparecerão nesta área."}
                </p>
              </div>
              {snapshot && (
                <div className="search-meta">
                  <span>
                    {snapshot.pages}{" "}
                    {snapshot.pages === 1
                      ? "página consultada"
                      : "páginas consultadas"}
                  </span>
                  <span>
                    {snapshot.creditsKnown
                      ? `${snapshot.credits} créditos informados`
                      : `Pelo menos ${snapshot.credits} créditos informados`}
                  </span>
                </div>
              )}
            </div>
            {error && (
              <p className="feedback" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="notice" role="status">
                {notice}
              </p>
            )}
            {snapshot && (
              <p className="data-note">
                Ordem de retorno do Google Maps via Serper, com duplicatas
                removidas. Categoria primária corresponde ao campo principal da
                API; secundárias são as categorias adicionais retornadas. A
                lista pode ter menos de 50 empresas. Sua busca pessoal no Google
                pode apresentar outra ordem.
              </p>
            )}
            {businesses.length ? (
              <div className="business-grid">
                {businesses.map((business, index) => (
                  <BusinessCard
                    key={`${snapshot!.searchedAt}:${business.id}`}
                    business={business}
                    index={index}
                    apiKey={key.apiKey}
                    disabled={busy}
                    onUpdate={updateBusiness}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-illustration" aria-hidden="true">
                  <span className="empty-line" />
                  <span className="empty-pin">⌕</span>
                  <span className="empty-mini">↗</span>
                </div>
                <h3>
                  {busy
                    ? "Reunindo as primeiras empresas…"
                    : snapshot
                      ? "Nenhum resultado nesta consulta"
                      : "Uma busca. Muitos detalhes."}
                </h3>
                <p>
                  Nome, categorias, endereço, telefone, site e avaliações.
                  <br />
                  Tudo o que o provedor disponibilizar, organizado por empresa.
                </p>
                {!snapshot && !busy && (
                  <div className="example-searches">
                    <span>Experimente</span>
                    {[
                      "advogado em Rio das Ostras",
                      "dentista em Macaé",
                      "restaurante em Cabo Frio",
                    ].map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => {
                          setQuery(example);
                          document.getElementById("query")?.focus();
                        }}
                      >
                        {example} <span aria-hidden="true">↗</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {snapshot && (
              <p className="timestamp">
                Consulta iniciada em{" "}
                {new Date(snapshot.searchedAt).toLocaleString("pt-BR")}. Os
                dados são fornecidos pela Serper e podem mudar.
              </p>
            )}
          </section>
          <footer className="site-footer">
            <span>
              RankGPS <span>por Vital Sites</span>
            </span>
            <span>Informações públicas. Novas perspectivas.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
