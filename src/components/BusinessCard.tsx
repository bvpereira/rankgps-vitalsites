"use client";

import { useRef, useState } from "react";
import type { Business } from "@/types/business";
import { mergeDetails } from "@/lib/businesses";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="detail-field">
      <dt>{label}</dt>
      <dd>
        {children ?? <span className="missing">Não informado pela API</span>}
      </dd>
    </div>
  );
}

export default function BusinessCard({
  business,
  index,
  apiKey,
  disabled,
  onUpdate,
}: {
  business: Business;
  index: number;
  apiKey: string;
  disabled: boolean;
  onUpdate: (business: Business, credits: number | null) => void;
}) {
  const [updated, setUpdated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const item = business;
  async function loadDetails() {
    if (inFlight.current || disabled || !apiKey.trim()) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/businesses/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          placeId: business.placeId,
          cid: business.cid,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(28000),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível consultar esta ficha.");
      if (
        !data.business ||
        !(
          (business.placeId && data.business.placeId === business.placeId) ||
          (business.cid && data.business.cid === business.cid)
        )
      )
        throw new Error(
          "A ficha retornada não corresponde à empresa selecionada.",
        );
      onUpdate(mergeDetails(business, data.business), data.credits);
      setUpdated(true);
    } catch (error) {
      setError(
        error instanceof Error &&
          !["TypeError", "SyntaxError", "TimeoutError"].includes(error.name)
          ? error.message
          : "Não foi possível obter os detalhes. A chamada pode ter consumido créditos.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const telephone = item.phone?.replace(/[^+\d]/g, "");
  return (
    <article className="business-card">
      <div className="business-card-top">
        <span className="result-number" aria-label={`Resultado ${index + 1}`}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="business-heading">
          <h3>{item.name}</h3>
          <p>{item.primaryCategory ?? "Categoria principal não informada"}</p>
        </div>
        <a
          className="external-button"
          href={item.mapsUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Abrir ${item.name} no Google Maps`}
        >
          ↗
        </a>
      </div>
      <div className="review-line">
        <span className="star" aria-hidden="true">
          ★
        </span>
        <strong>
          {item.rating === null
            ? "Sem nota informada"
            : item.rating.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}
        </strong>
        <span>
          {item.ratingCount === null
            ? "Quantidade de avaliações não informada"
            : `${item.ratingCount.toLocaleString("pt-BR")} avaliações`}
        </span>
        <span className="page-tag">Página {item.sourcePage}</span>
      </div>
      <dl className="business-fields">
        <Field label="Endereço">{item.address}</Field>
        <Field label="Telefone">
          {item.phone ? (
            telephone ? (
              <a href={`tel:${telephone}`}>{item.phone}</a>
            ) : (
              item.phone
            )
          ) : null}
        </Field>
        <Field label="Categoria primária · API">{item.primaryCategory}</Field>
        <Field label="Categorias secundárias · API">
          {item.secondaryCategories.length ? (
            <div className="tags">
              {item.secondaryCategories.map((category) => (
                <span key={category}>{category}</span>
              ))}
            </div>
          ) : (
            <span className="missing">
              {item.categoriesProvided
                ? "Nenhuma categoria adicional retornada"
                : "Não informadas pela API"}
            </span>
          )}
        </Field>
        <Field label="Site">
          {item.website ? (
            <a
              className="website-link"
              href={item.website}
              target="_blank"
              rel="noreferrer"
            >
              {item.website} <span aria-hidden="true">↗</span>
            </a>
          ) : null}
        </Field>
      </dl>
      <details className="business-details">
        <summary>
          Ver ficha completa <span aria-hidden="true">＋</span>
        </summary>
        <div className="expanded-details">
          <dl className="business-fields">
            <Field label="Descrição">{item.description}</Field>
            <Field label="Coordenadas">
              {item.latitude !== null && item.longitude !== null
                ? `${item.latitude}, ${item.longitude}`
                : null}
            </Field>
            <Field label="Google Place ID">{item.placeId}</Field>
            <Field label="Google CID">{item.cid}</Field>
            <Field label="Posição informada nesta página">
              {item.sourcePosition}
            </Field>
          </dl>
          <p className="help">
            Horários, atributos, fotos, serviços e outros campos aparecem abaixo
            quando a Serper os disponibiliza. A ausência de um campo não
            significa que ele não exista no Google.
          </p>
          <details className="raw-details">
            <summary>Todos os campos retornados pela API</summary>
            <pre>{JSON.stringify(item.fields, null, 2)}</pre>
          </details>
          {(business.placeId || business.cid) && (
            <div className="detail-action">
              <button
                className="button secondary"
                type="button"
                disabled={disabled || busy || !apiKey.trim()}
                onClick={loadDetails}
              >
                {busy
                  ? "Consultando ficha…"
                  : updated
                    ? "Consultar ficha novamente"
                    : "Consultar detalhes adicionais"}
              </button>
              <p className="help">
                Faz uma consulta extra com sua chave Serper e pode consumir
                créditos. O provedor pode retornar os mesmos campos.
              </p>
              {updated && (
                <p className="detail-success" role="status">
                  Ficha consultada pelo identificador da empresa.
                </p>
              )}
            </div>
          )}
          {error && (
            <p className="feedback" role="alert">
              {error}
            </p>
          )}
        </div>
      </details>
    </article>
  );
}
