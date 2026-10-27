"use client";

import { useState, type FormEvent } from "react";
import type { City } from "@/types/ranking";

export default function CitySearch({
  onSelect,
}: {
  onSelect: (city: City) => void;
}) {
  const [query, setQuery] = useState("");
  const [cities, setCities] = useState<City[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function search(event: FormEvent) {
    event.preventDefault();
    if (busy || query.trim().length < 2) return;
    setBusy(true);
    setCities([]);
    setMessage("");
    try {
      const response = await fetch(
        `/api/cities?q=${encodeURIComponent(query.trim())}`,
        { signal: AbortSignal.timeout(15000) },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível buscar a cidade.");
      setCities(data.cities);
      if (!data.cities.length)
        setMessage(
          "Nenhuma cidade encontrada. Confira o nome e a UF ou navegue pelo mapa.",
        );
    } catch (error) {
      setMessage(
        error instanceof Error && error.name !== "TimeoutError"
          ? error.message
          : "A busca demorou mais que o esperado. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="city-search">
      <form onSubmit={search}>
        <label htmlFor="city">
          Localizar cidade <span className="optional">Brasil</span>
        </label>
        <div className="city-input-row">
          <input
            id="city"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ex.: Rio das Ostras - RJ"
            maxLength={100}
            disabled={busy}
          />
          <button
            className="button secondary"
            disabled={busy || query.trim().length < 2}
            type="submit"
          >
            {busy ? "Buscando…" : "Localizar"}
          </button>
        </div>
      </form>
      <p className="help">
        A cidade apenas centraliza o mapa. Os pontos definem a localização da
        consulta.
      </p>
      <p className="provider-credit">
        Busca por{" "}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>{" "}
        · Dados{" "}
        <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">
          GeoNames
        </a>
      </p>
      {message && (
        <p className="feedback" role="status">
          {message}
        </p>
      )}
      {cities.length > 0 && (
        <ul className="city-results" aria-label="Cidades encontradas">
          {cities.map((city) => (
            <li key={city.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(city);
                  setCities([]);
                  setMessage(
                    `Mapa centralizado em ${city.name}, ${city.region}.`,
                  );
                }}
              >
                <strong>{city.name}</strong>
                <span>
                  {city.region} · {city.country}
                </span>
                <span aria-hidden="true">↗</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
