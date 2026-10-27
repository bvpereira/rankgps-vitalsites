import { NextRequest, NextResponse } from "next/server";
import type { City } from "@/types/ranking";

const STATES: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 100) {
    return NextResponse.json(
      { error: "Digite uma cidade com 2 a 100 caracteres." },
      { status: 400 },
    );
  }

  // The provider accepts city names; handle Brazilian state suffixes locally.
  const match = query.match(/^(.*?)\s*(?:[-,/]\s*|\s+)([a-z]{2})$/i);
  const state = match ? STATES[match[2].toUpperCase()] : undefined;
  const name = state && match ? match[1].trim() : query;
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.search = new URLSearchParams({
    name,
    count: "20",
    language: "pt",
    format: "json",
    countryCode: "BR",
  }).toString();

  try {
    const response = await fetch(url, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Geocoding unavailable");
    const data = await response.json();
    if (
      data.error ||
      (data.results !== undefined && !Array.isArray(data.results))
    )
      throw new Error("Invalid response");
    const cities: City[] = (data.results ?? [])
      .filter(
        (item: Record<string, unknown>) =>
          typeof item.id === "number" &&
          typeof item.name === "string" &&
          typeof item.latitude === "number" &&
          typeof item.longitude === "number" &&
          Math.abs(item.latitude) <= 90 &&
          Math.abs(item.longitude) <= 180 &&
          (!state || item.admin1 === state),
      )
      .slice(0, 6)
      .map((item: Record<string, unknown>) => ({
        id: item.id,
        name: item.name,
        region: typeof item.admin1 === "string" ? item.admin1 : "",
        country: typeof item.country === "string" ? item.country : "Brasil",
        lat: item.latitude,
        lng: item.longitude,
      }));
    return NextResponse.json(
      { cities },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=86400, stale-while-revalidate=3600",
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Não foi possível buscar a cidade. Tente novamente em instantes ou navegue pelo mapa.",
      },
      { status: 502 },
    );
  }
}
