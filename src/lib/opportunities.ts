import type { Business } from "../types/business.ts";
import type {
  Opportunity,
  OpportunityFilter,
  WebsiteAudit,
} from "../types/prospecting.ts";

const SOCIAL_DOMAINS = [
  "instagram.com",
  "facebook.com",
  "fb.com",
  "wa.me",
  "whatsapp.com",
  "linktr.ee",
  "linktree.com",
  "tiktok.com",
  "linkedin.com",
  "youtube.com",
  "youtu.be",
  "beacons.ai",
];

export function isSocialWebsite(website: string | null) {
  if (!website) return false;
  try {
    const host = new URL(website).hostname.toLowerCase();
    return SOCIAL_DOMAINS.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

export function websiteSignals(audit?: WebsiteAudit): Opportunity[] {
  if (!audit || audit.status === "inconclusive") return [];
  if (audit.status === "http_error")
    return [
      {
        code: "website_flags",
        label: `Resposta HTTP ${audit.httpStatus}`,
        evidence:
          "O site respondeu com erro nesta consulta. Confira no navegador antes de abordar a empresa.",
        kind: "observed",
      },
    ];
  const signals: Opportunity[] = [];
  const add = (
    label: string,
    evidence: string,
    kind: Opportunity["kind"] = "check",
  ) => signals.push({ code: "website_flags", label, evidence, kind });
  if (audit.https === false)
    add(
      "Página final sem HTTPS",
      "A URL final usa HTTP. A análise não verifica todas as páginas do site.",
      "observed",
    );
  if (!audit.title)
    add(
      "Título não encontrado",
      "Não foi encontrado título no HTML recebido da página.",
    );
  if (!audit.description)
    add(
      "Descrição do site não encontrada",
      "Não foi encontrada meta description no HTML. Este campo é do site, não do perfil Google.",
    );
  if (audit.viewport === false)
    add(
      "Revisar apresentação no celular",
      "Não foi encontrada configuração de viewport para a largura do dispositivo. A responsividade visual precisa ser conferida no navegador.",
    );
  if (audit.contact === false)
    add(
      "Contato não identificado no HTML",
      "Não foram identificados link de contato, telefone, e-mail, WhatsApp ou formulário. O site pode carregar esses elementos por JavaScript.",
    );
  if (audit.responseMs !== null && audit.responseMs >= 3000)
    add(
      "Consulta do HTML acima de 3 s",
      "Tempo observado nesta consulta, incluindo conexão e redirecionamentos. Não representa o carregamento completo nem uma medição de Core Web Vitals.",
    );
  return signals;
}

export function opportunitiesFor(
  business: Business,
  reviewLimit: number,
  audit?: WebsiteAudit,
): Opportunity[] {
  const result: Opportunity[] = [];
  if (!business.website)
    result.push({
      code: "missing_site",
      label: "Site não informado pela API",
      evidence:
        "Confira o perfil Google antes de concluir que a empresa não possui site.",
      kind: "check",
    });
  else if (isSocialWebsite(business.website))
    result.push({
      code: "social_site",
      label: "Rede social ou agregador no campo site",
      evidence:
        "O link informado aponta para uma plataforma social ou de links. A empresa pode ter um site próprio em outro endereço.",
      kind: "observed",
    });
  if (business.ratingCount !== null && business.ratingCount <= reviewLimit)
    result.push({
      code: "few_reviews",
      label: `Até ${reviewLimit} avaliações`,
      evidence: `${business.ratingCount} avaliações informadas pela API. Compare com empresas da mesma atividade e cidade.`,
      kind: "observed",
    });
  if (business.rating !== null && business.rating < 4)
    result.push({
      code: "low_rating",
      label: "Nota abaixo de 4",
      evidence: `Nota ${business.rating.toLocaleString("pt-BR")} informada pela API. Confira quantidade e conteúdo das avaliações antes de abordar.`,
      kind: "observed",
    });
  return [...result, ...websiteSignals(audit)];
}

export function matchesOpportunity(
  business: Business,
  filters: OpportunityFilter[],
  reviewLimit: number,
  audit?: WebsiteAudit,
): boolean {
  if (!filters.length) return true;
  const opportunities = opportunitiesFor(business, reviewLimit, audit);
  return filters.some((filter) =>
    filter === "not_analyzed"
      ? !!business.website && !isSocialWebsite(business.website) && !audit
      : opportunities.some((opportunity) => opportunity.code === filter),
  );
}
