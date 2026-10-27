"use client";

import { useEffect, useRef, useState } from "react";
import { divIcon, DomEvent } from "leaflet";
import {
  MapContainer,
  Marker,
  Popup,
  Tooltip,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import {
  INITIAL_CENTER,
  MAX_POINTS,
  type City,
  type MapPoint,
  type PointResult,
} from "@/types/ranking";
import { resultLabel } from "./RankingResults";

interface Props {
  points: MapPoint[];
  city: City | null;
  onAdd: (lat: number, lng: number) => void;
  onRemove: (id: string) => void;
  results: PointResult[];
  busy: boolean;
}

function MapEvents({ city, onAdd }: Pick<Props, "city" | "onAdd">) {
  const map = useMapEvents({
    click: (event) => {
      const wrapped = event.latlng.wrap();
      onAdd(wrapped.lat, wrapped.lng);
    },
  });
  useEffect(() => {
    if (city) map.setView([city.lat, city.lng], 13);
  }, [city, map]);
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function CenterPointButton({
  onAdd,
  disabled,
}: {
  onAdd: Props["onAdd"];
  disabled: boolean;
}) {
  const map = useMap();
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (buttonRef.current) DomEvent.disableClickPropagation(buttonRef.current);
  }, []);
  return (
    <button
      ref={buttonRef}
      className="map-center-button"
      type="button"
      disabled={disabled}
      onClick={() => {
        const center = map.getCenter().wrap();
        onAdd(center.lat, center.lng);
      }}
    >
      + Adicionar ponto no centro
    </button>
  );
}

export default function RankingMap({
  points,
  city,
  onAdd,
  onRemove,
  results,
  busy,
}: Props) {
  const [tileError, setTileError] = useState(false);
  return (
    <div className="map-shell">
      {tileError && (
        <div className="map-warning" role="status">
          Algumas imagens do mapa não carregaram. Verifique sua conexão.
        </div>
      )}
      <MapContainer
        center={INITIAL_CENTER}
        zoom={13}
        minZoom={3}
        maxZoom={19}
        scrollWheelZoom
        className="ranking-map"
        attributionControl
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{
            tileerror: () => setTileError(true),
            load: () => setTileError(false),
          }}
        />
        <MapEvents city={city} onAdd={onAdd} />
        {points.map((point, index) => {
          const result = results.find((item) => item.pointId === point.id);
          return (
            <Marker
              key={`${point.id}-${index}`}
              position={[point.lat, point.lng]}
              title={`Ponto ${index + 1}`}
              alt={`Ponto ${index + 1}`}
              icon={divIcon({
                className: `numbered-marker marker-${result?.status ?? "pending"}`,
                html: `<span>${index + 1}</span>`,
                iconSize: [36, 36],
                iconAnchor: [18, 18],
                popupAnchor: [0, -20],
              })}
            >
              {(result || busy) && (
                <Tooltip
                  permanent
                  direction="top"
                  offset={[0, -20]}
                  className="rank-tooltip"
                >
                  {busy ? "Consultando…" : result ? resultLabel(result) : ""}
                </Tooltip>
              )}
              <Popup>
                <strong>Ponto {index + 1}</strong>
                <br />
                {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
                <br />
                <span>
                  {busy
                    ? "Consultando…"
                    : result
                      ? resultLabel(result)
                      : "Ranking ainda não consultado"}
                </span>
                {result?.status === "found" && (
                  <p>
                    {result.matches[0].title}
                    <br />
                    {result.matches[0].address}
                  </p>
                )}
                {result?.status === "not_found" && (
                  <p>
                    Nome não encontrado entre {result.places.length} resultados
                    retornados.
                  </p>
                )}
                {result?.status === "ambiguous" && (
                  <p>
                    Mais de um resultado tem esse nome. Confira os endereços na
                    área de resultados.
                  </p>
                )}
                {result?.status === "error" && <p>{result.message}</p>}
                <br />
                <button
                  className="popup-remove"
                  type="button"
                  disabled={busy}
                  onClick={() => onRemove(point.id)}
                >
                  Remover ponto
                </button>
              </Popup>
            </Marker>
          );
        })}
        <CenterPointButton
          onAdd={onAdd}
          disabled={busy || points.length === MAX_POINTS}
        />
      </MapContainer>
      <div className="map-crosshair" aria-hidden="true">
        +
      </div>
    </div>
  );
}
