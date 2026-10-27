"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef, useState } from "react";
import { useApiKey } from "@/hooks/useApiKey";
import {
  MAX_POINTS,
  type City,
  type MapPoint,
  type RankingResponse,
} from "@/types/ranking";
import CitySearch from "./CitySearch";
import SelectedPoints from "./SelectedPoints";
import RankingResults from "./RankingResults";

const RankingMap = dynamic(() => import("./RankingMap"), {
  ssr: false,
  loading: () => <div className="map-loading">Carregando mapa…</div>,
});

export default function RankingWorkspace() {
  const key = useApiKey();
  const [showKey, setShowKey] = useState(false);
  const [term, setTerm] = useState("");
  const [business, setBusiness] = useState("");
  const [city, setCity] = useState<City | null>(null);
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [notice, setNotice] = useState("");
  const [results, setResults] = useState<RankingResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchError, setSearchError] = useState("");
  const inFlight = useRef(false);
  function clearResults() {
    setResults(null);
    setSearchError("");
  }
  const canSearch =
    !busy &&
    key.ready &&
    !!key.apiKey.trim() &&
    !!term.trim() &&
    !!business.trim() &&
    points.length === MAX_POINTS;

  async function search() {
    if (!canSearch || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    clearResults();
    setNotice("");
    try {
      const response = await fetch("/api/ranking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: key.apiKey.trim(),
          term: term.trim(),
          business: business.trim(),
          points,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(35000),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível realizar a consulta.");
      if (!Array.isArray(data.results) || data.results.length !== MAX_POINTS)
        throw new Error(
          "Resposta incompleta do servidor. Tente novamente mais tarde.",
        );
      setResults(data);
    } catch (error) {
      setSearchError(
        error instanceof Error && error.name === "TimeoutError"
          ? "A consulta demorou além do limite. Algumas chamadas podem ter consumido créditos. Confira sua conexão antes de pesquisar novamente."
          : error instanceof Error &&
              error.name !== "TypeError" &&
              error.name !== "SyntaxError"
            ? error.message
            : "Falha ao obter a resposta do servidor. Algumas chamadas podem ter consumido créditos. Tente novamente mais tarde.",
      );
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  function addPoint(lat: number, lng: number) {
    if (busy) return;
    if (points.length >= MAX_POINTS) {
      setNotice(
        "Você já selecionou 5 pontos. Remova um deles para escolher outra localização.",
      );
      return;
    }
    if (
      points.some(
        (point) =>
          Math.abs(point.lat - lat) < 0.000001 &&
          Math.abs(point.lng - lng) < 0.000001,
      )
    ) {
      setNotice("Essa localização já foi selecionada. Escolha outro ponto.");
      return;
    }
    setPoints((current) =>
      current.length < MAX_POINTS
        ? [...current, { id: crypto.randomUUID(), lat, lng }]
        : current,
    );
    clearResults();
    setNotice("");
  }

  function removePoint(id: string) {
    if (busy) return;
    setPoints((current) => current.filter((point) => point.id !== id));
    clearResults();
    setNotice("");
  }

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" href="/" aria-label="RankGPS, início">
            <span className="brand-icon" aria-hidden="true">
              ⌖
            </span>
            <span>
              Rank<span className="brand-accent">GPS</span>
              <small>por Vital Sites</small>
            </span>
          </Link>
          <span className="header-label">
            <span className="status-dot" />
            Posicionamento local
          </span>
        </div>
      </header>
      <main className="workspace">
        <div className="page-heading">
          <div>
            <p className="eyebrow">SEU NEGÓCIO, EM CADA PONTO DA CIDADE</p>
            <h1>Uma nova perspectiva do seu ranking.</h1>
            <p>
              Veja a posição do seu negócio a partir de cinco pontos no Google
              Maps.
            </p>
          </div>
          <span className="stage-badge">Google Maps · Serper.dev</span>
        </div>
        <div className="workspace-grid">
          <aside
            className="panel settings-panel"
            aria-labelledby="settings-heading"
          >
            <div className="section-heading">
              <div>
                <span className="step-label">01 / CONFIGURAR</span>
                <h2 id="settings-heading">Sua consulta</h2>
                <p>Defina o que você quer encontrar.</p>
              </div>
            </div>
            <div className="field">
              <label htmlFor="term">Termo de busca</label>
              <input
                id="term"
                disabled={busy}
                value={term}
                placeholder="Ex.: dentista"
                maxLength={200}
                onChange={(event) => {
                  setTerm(event.target.value);
                  clearResults();
                }}
              />
              <p className="help">
                Para comparar, copie a busca completa do Google. “Dentista” e
                “dentista rio das ostras” podem retornar ordens diferentes.
              </p>
            </div>
            <div className="field">
              <label htmlFor="business">Nome do estabelecimento</label>
              <input
                id="business"
                disabled={busy}
                value={business}
                placeholder="Ex.: Vital Odontologia"
                maxLength={200}
                onChange={(event) => {
                  setBusiness(event.target.value);
                  clearResults();
                }}
              />
              <p className="help">
                Use o nome completo do Google Maps. A comparação ignora acentos,
                pontuação e maiúsculas.
              </p>
            </div>
            <div className="key-section">
              <div className="field">
                <label htmlFor="api-key">API Key Serper.dev</label>
                <div className="key-input">
                  <input
                    id="api-key"
                    type={showKey ? "text" : "password"}
                    value={key.apiKey}
                    disabled={!key.ready || busy}
                    onChange={(event) => {
                      key.updateKey(event.target.value);
                      clearResults();
                    }}
                    placeholder="Cole sua chave de API"
                    autoComplete="off"
                    spellCheck={false}
                    autoCapitalize="none"
                    aria-describedby="key-help"
                  />
                  <button
                    type="button"
                    aria-label={showKey ? "Ocultar chave" : "Mostrar chave"}
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
                <p className="help" id="key-help">
                  Sua chave pode ser alterada a qualquer momento.
                </p>
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
              <p className="key-caption">
                {key.remember
                  ? "Salva neste navegador até você apagar ou desmarcar esta opção."
                  : "Sem salvar: a chave será esquecida ao atualizar a página."}
              </p>
              <button
                className="text-button"
                type="button"
                disabled={!key.ready || !key.apiKey || busy}
                onClick={() => {
                  key.clearKey();
                  setShowKey(false);
                  clearResults();
                }}
              >
                Apagar chave
              </button>
              {key.storageError && (
                <p className="feedback" role="alert">
                  {key.storageError}
                </p>
              )}
            </div>
            <div className="search-summary">
              <div className="progress-heading">
                <span>Pontos selecionados</span>
                <strong aria-live="polite">
                  {points.length}/{MAX_POINTS}
                </strong>
              </div>
              <div className="progress-track" aria-hidden="true">
                <span
                  style={{ width: `${(points.length / MAX_POINTS) * 100}%` }}
                />
              </div>
              <button
                className="button primary search-button"
                type="button"
                disabled={!canSearch}
                onClick={search}
              >
                <span aria-hidden="true">⌕</span>{" "}
                {busy ? "Pesquisando…" : "Pesquisar"}{" "}
                <span aria-hidden="true">→</span>
              </button>
              <p className="help centered">
                {busy
                  ? "Consultando os cinco pontos. Aguarde…"
                  : canSearch
                    ? "Cada pesquisa faz 5 consultas e consome créditos da Serper."
                    : "Preencha os três campos e selecione exatamente 5 pontos."}
              </p>
            </div>
            <div className="phase-note">
              <span aria-hidden="true">ⓘ</span>
              <p>
                <strong>Sua chave, sua consulta</strong>A chave é enviada à rota
                do aplicativo e usada somente para consultar a Serper. Não é
                salva no servidor. Cada clique em Pesquisar inicia uma nova
                consulta dos cinco pontos.
              </p>
            </div>
          </aside>
          <div className="map-column">
            <section className="panel map-panel" aria-labelledby="map-heading">
              <div className="map-panel-top">
                <div className="section-heading">
                  <div>
                    <span className="step-label">02 / EXPLORAR</span>
                    <h2 id="map-heading">Escolha seus pontos no mapa</h2>
                  </div>
                  <span
                    className={`count-badge ${points.length === MAX_POINTS ? "complete" : ""}`}
                  >
                    {points.length}/5 pontos
                  </span>
                </div>
                <CitySearch onSelect={setCity} />
              </div>
              <RankingMap
                points={points}
                city={city}
                onAdd={addPoint}
                onRemove={removePoint}
                results={results?.results ?? []}
                busy={busy}
              />
              <div className="map-footer">
                <span>
                  <span className="legend-dot" />
                  Seleção manual
                </span>
                <span>Clique no mapa para adicionar até 5 pontos.</span>
              </div>
              {notice && (
                <p className="map-notice" role="status">
                  {notice}
                </p>
              )}
            </section>
            <div className="panel points-panel">
              <SelectedPoints
                points={points}
                onRemove={removePoint}
                disabled={busy}
                onClear={() => {
                  setPoints([]);
                  setNotice("");
                  clearResults();
                }}
              />
            </div>
          </div>
        </div>
        <RankingResults
          data={results}
          points={points}
          busy={busy}
          error={searchError}
          term={term.trim()}
          business={business.trim()}
        />
        <footer className="site-footer">
          <span>
            RankGPS <span>·</span> Vital Sites
          </span>
          <span>5 pontos. Uma visão mais local.</span>
        </footer>
      </main>
    </>
  );
}
