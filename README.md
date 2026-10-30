# RankGPS · Explorar empresas

Aplicação pessoal para pesquisar empresas no Google Maps via Serper, reunir até 50 resultados únicos e consultar os dados públicos retornados pelo provedor. Substitui a versão de ranking por cinco pontos.

## Uso

1. Informe sua API Key Serper.dev. A opção de lembrar salva apenas a chave no `localStorage` deste navegador; é possível apagá-la ou trocá-la na interface. Nenhuma chave é fixa no código ou exigida nas variáveis da Vercel.
2. Digite atividade e localidade, por exemplo `advogado em Rio das Ostras`.
3. A busca percorre as páginas sequencialmente, mostra os resultados conforme chegam e encerra ao atingir 50 empresas únicas, receber uma página vazia, receber apenas duplicatas, ficar sem a área de paginação ou alcançar dez páginas.
4. Cada ficha mostra nome, categorias, endereço, telefone, site, nota e quantidade de avaliações. A expansão mostra descrição, coordenadas, identificadores Google e os demais campos públicos recebidos.
5. “Consultar detalhes adicionais” faz uma chamada extra pelo Place ID ou CID da empresa. Pode retornar os mesmos dados. Cada busca e consulta individual consome créditos da Serper.

As empresas permanecem apenas na memória da página. Não há login, banco, histórico, grid ou exportação. A busca pode ser interrompida, preservando páginas já recebidas. Falhas posteriores também preservam resultados parciais. Repetir uma busca faz novas consultas.

## Triagem de oportunidades

Os filtros trabalham sobre as empresas já encontradas, sem novas chamadas à Serper. É possível combinar filtros; a lista mostra empresas que atendem a **qualquer** filtro selecionado, mantendo a ordem original da busca.

- **Site não informado**: ausência de URL utilizável na resposta da API, exigindo conferência no perfil Google. Não comprova que a empresa não tenha site.
- **Link social no campo site**: rede social, WhatsApp ou agregador de links reconhecido pelo domínio. Não comprova ausência de site próprio em outro endereço.
- **Poucas avaliações**: quantidade informada menor ou igual ao limite escolhido (padrão 20, ajustável). Valores ausentes não são tratados como zero.
- **Nota abaixo de 4**: usa apenas a nota efetivamente informada.
- **Site com sinais a revisar**: usa os resultados de análises concluídas, como erro HTTP, URL final sem HTTPS, título/descrição/viewport não encontrados, contato não identificado no HTML ou consulta do HTML acima de três segundos.
- **Site ainda não analisado**: URLs de sites que ainda não tiveram uma verificação concluída nesta página, excluindo links sociais.

Cada sinal indica a evidência e se exige conferência. Não há nota automática de qualidade nem classificação do potencial comercial. As análises e filtros são descartados ao atualizar a página ou iniciar outra busca; o aplicativo serve para selecionar oportunidades, sem substituir a planilha de diagnóstico do usuário.

### Análise básica do site

“Analisar site” verifica uma URL individual; “Analisar sites visíveis” processa os sites ainda não verificados da lista filtrada, com duas consultas simultâneas, removendo URLs idênticas e permitindo interromper. Não consome créditos Serper nem envia a chave a esses sites.

São exibidos: URL final, resultado HTTP, HTTPS, tempo observado, título, meta description, viewport para largura do dispositivo, link de WhatsApp e sinais de contato (telefone, e-mail, página de contato ou formulário). Formulário encontrado não certifica que seja de contato; links detectados não são testados individualmente.

A análise lê apenas o HTML recebido da URL informada, sem executar JavaScript, submeter formulários, carregar recursos ou avaliar layout visual. Viewport não confirma responsividade, tempo de resposta não é tempo completo de carregamento, e ausência de elementos não comprova ausência no site. Bloqueios, falhas de rede, proteção de bots, respostas não HTML, limites ou verificações interrompidas ficam inconclusivos, sem classificar o site como fora do ar. A meta description é do site, diferente da descrição do perfil Google.

A rota `POST /api/website-audit` aceita somente URL pública HTTP/HTTPS sem credenciais e com porta padrão. Valida todos os endereços DNS, fixa o IP aprovado na conexão, mantém Host/SNI e valida novamente cada redirecionamento. IPs privados, locais, reservados e destinos de metadados são bloqueados. Limites: quatro redirecionamentos, 15 segundos e 1 MiB de HTML/transferência, com proteção também ao descompactar respostas. Não há armazenamento ou logs do conteúdo dos sites.

## Dados e limites

- API: `POST https://google.serper.dev/maps`. Busca: `q`, `hl: pt-br`, `page`; a primeira chamada deixa o centro a cargo do provedor. As páginas seguintes usam o `ll` retornado pela Serper. Não se inventa uma área geográfica nem se acrescenta zoom manual.
- A numeração é a ordem de chegada, após remover duplicatas; página e posição original retornada também estão disponíveis. A ordem pode diferir da Busca Google e de uma sessão pessoal.
- Categoria primária: campo `type` (ou `category`) retornado. Secundárias: entradas adicionais de `types`, excluindo a principal. Não se infere a principal a partir da primeira entrada de uma lista. Isso não certifica acesso à configuração completa do Perfil da Empresa.
- Ausências são mostradas como “Não informado pela API”, sem fabricar site, telefone, categoria ou avaliação. A API pode não fornecer horários, fotos, serviços, atributos ou todas as categorias. A seção de campos mostra o que efetivamente veio, com limites de tamanho e remoção de credenciais.
- Deduplicação por Place ID e CID; fallback por nome, endereço e coordenadas. Filiais com identificadores distintos permanecem separadas. Máximo de dez chamadas por busca, além de consultas individuais explícitas. O saldo/crédito é informado pelo próprio provedor; falhas podem consumir créditos sem retornar esse valor.
- A consulta individual só aceita uma ficha com o identificador solicitado. Dados de outra empresa nunca substituem silenciosamente o resultado.
- Referências oficiais: [Serper](https://serper.dev/) e [Playground](https://serper.dev/playground).

## Arquitetura

- Next.js 16 App Router, React 19 e TypeScript.
- `src/components/BusinessWorkspace.tsx`: busca, chave, progresso e resultados.
- `src/components/BusinessCard.tsx`: ficha e consulta de detalhes.
- `src/components/ProspectingResults.tsx`: filtros, evidências e fila de análise dos sites visíveis.
- `src/components/WebsiteAnalysis.tsx`: fatos observados e limitações da análise.
- `src/lib/search.ts`: coleta paginada até 50 resultados, cancelamento e paradas.
- `src/lib/opportunities.ts`: critérios de oportunidade e combinação de filtros.
- `src/lib/website-audit.ts`: leitura segura de páginas públicas e extração do HTML, com Cheerio e ipaddr.js.
- `src/lib/businesses.ts`: validação, cliente Serper, normalização e deduplicação.
- `src/app/api/businesses/route.ts`: uma página por requisição.
- `src/app/api/businesses/details/route.ts`: busca pelo identificador da empresa.
- `src/hooks/useApiKey.ts`: armazenamento opcional, compatível com a chave da versão anterior.

Frontend → rota da aplicação → Serper. A chave vai no corpo POST da aplicação e no header `X-API-KEY` da Serper, sem persistência no servidor. Não há logs de corpo, chave ou erros brutos do provedor. Respostas e consultas usam `no-store`. As rotas validam origem, tamanho e formato da entrada. Cada chamada tem timeout de 22 segundos, com limite de rota de 30 segundos. Cada página usa uma requisição própria para não depender de uma função longa na Vercel.

## Validação e deploy

```sh
npm ci
npm run lint
npm test
npm run typecheck
npm run build
```

Os testes usam respostas simuladas: não precisam de chave real e não gastam créditos. Cobrem paginação até 50, duplicatas, filiais, campos ausentes, categorias, URLs, credenciais, erros, cancelamento e consulta de detalhes. A quantidade e a disponibilidade dos dados reais dependem da Serper e dos perfis encontrados.

Vercel: o arquivo `vercel.json` define preset **Next.js**, instalação `npm ci`, build `npm run build` e detecção padrão do diretório de saída, substituindo configurações antigas de site estático. O `package.json` define Node.js 24.x. Não há variável obrigatória para Serper. A raiz do projeto deve ser a raiz do repositório. Domínio previsto: https://rankgps.vitalsites.com.br. Deploy é controlado pela integração GitHub/Vercel já configurada pelo usuário.

Fluxo de trabalho: validar as alterações e fazer commit e push automaticamente para `origin`. Não iniciar servidor local para apresentar mudanças; o usuário acompanha pela Vercel. A versão anterior foi preservada no histórico Git. `docs/search-comparison.md` é um registro histórico de testes da antiga versão de ranking.

