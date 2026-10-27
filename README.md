# RankGPS · Vital Sites

Aplicação pessoal para consultar o ranking local a partir de exatamente cinco pontos escolhidos manualmente. Domínio previsto: https://rankgps.vitalsites.com.br.

## Etapa atual

Interface integrada à Serper Maps. Cada clique em **Pesquisar** faz cinco chamadas (uma por ponto) e pode consumir créditos da chave informada. Sem paginação ou tentativas automáticas. Não há dados simulados na aplicação.

- Termo, estabelecimento e chave Serper editáveis.
- Chave oculta por padrão. Armazenamento em `localStorage` somente com a opção explícita “Lembrar neste navegador”. Desmarcar remove a cópia salva e mantém o campo; apagar limpa ambos. Esse armazenamento não é criptografado nem tem expiração automática.
- Mapa Leaflet/OpenStreetMap, cinco marcadores numerados, coordenadas, remoção individual e limpeza total. Pontos duplicados são recusados; ao remover, a numeração é reorganizada.
- Busca de cidades brasileiras por botão ou Enter, via `/api/cities` e Open-Meteo/GeoNames. Aceita UF como em `Rio das Ostras - RJ`. Escolher uma cidade só reposiciona o mapa, preservando os pontos.
- Para teclado: foque o mapa, use as setas para navegar e o botão “Adicionar ponto no centro”. Também é possível clicar/tocar diretamente no mapa.
- Não há login, banco, histórico, grid ou relatórios. `noindex` evita solicitar indexação, mas não restringe acesso à página.

## Execução

Node.js 24 LTS e npm. O lockfile fixa as versões instaladas.

```sh
npm ci
npm run dev
```

Acesse http://localhost:3000. Para verificar e executar a versão de produção:

```sh
npm run lint
npm test
npm run typecheck
npm run build
npm start
```

## Estrutura

- `src/app`: página, layout, CSS e rotas de cidades e ranking.
- `src/components`: interface, busca de cidade, mapa e lista de pontos.
- `src/hooks/useApiKey.ts`: armazenamento opcional da chave.
- `src/types/ranking.ts`: tipos e limite de pontos compartilhados.
- `src/lib/ranking.ts`: validação, cliente Serper e identificação do estabelecimento.
- `tests/ranking.test.ts`: testes com `fetch` simulado, sem chamadas reais ou créditos.

O mapa é carregado apenas no navegador. Ao pesquisar, a chave é enviada no corpo JSON de `POST /api/ranking` e usada no header `X-API-KEY` da chamada server-side à Serper. Não há chave fixa, variável de ambiente obrigatória, armazenamento no servidor ou logs de credenciais. Respostas e chamadas de ranking usam `no-store`. A chave não participa da busca de cidades e não é devolvida ao frontend pelo servidor.

## Consulta e interpretação

- Endpoint oficial: `POST https://google.serper.dev/maps`, com `q`, `hl: pt-br`, `ll: @latitude,longitude` e `page: 1`. Referência: https://serper.dev/playground.
- A cidade apenas centraliza o mapa. Cada consulta usa a coordenada selecionada, sem enviar zoom à Serper. A abrangência fica a cargo do provedor; isso não garante ausência de limites internos nem simula o GPS do usuário. Não há filtro de distância no aplicativo. O zoom visual é independente. A posição é a informada pela Serper, sem reordenar pela distância.
- Para comparar buscas, usar exatamente o mesmo termo (incluindo a cidade, se ela fizer parte da consulta original). Cada cartão inclui um link para abrir o Maps com esse termo e centro; ele não altera a localização do navegador. Resultados locais da Busca Google, Maps e uma sessão pessoal podem diferir. Não há garantia de reproduzir o ranking visto na conta do usuário.
- Identificação pelo nome completo normalizado: ignora acentos, maiúsculas, pontuação e espaços repetidos. Não faz correspondência aproximada nem assume que um nome parcialmente semelhante seja o estabelecimento.
- Uma correspondência: mostra posição, nome e endereço. Mais de uma: sinaliza ambiguidade e lista candidatos; não escolhe automaticamente uma filial.
- “Não encontrado” significa ausente entre os resultados da primeira página retornada. A interface informa o total analisado e permite conferir a lista. Não implica ausência em todo o Google Maps.
- Cada ponto tem resultado próprio. Erros de autenticação, créditos, limite, conexão, tempo limite ou resposta inválida são apresentados como erros, nunca como ausência no ranking.
- Campos e edição dos pontos ficam bloqueados durante a pesquisa. Alterar termo, estabelecimento, chave ou pontos limpa os resultados antigos; mudar apenas a cidade preserva a seleção e os resultados.
- Cinco chamadas paralelas, timeout de 22 segundos por chamada e duração máxima de rota de 30 segundos. Repetir uma pesquisa consulta novamente todos os pontos e pode consumir mais créditos.

## Serviços externos

- Tiles: https://tile.openstreetmap.org, com atribuição e cache padrão do navegador. Política: https://operations.osmfoundation.org/policies/tiles/.
- Cidades: https://geocoding-api.open-meteo.com/v1/search, dados GeoNames. Buscas só acontecem por ação explícita, com cache de 24 horas no servidor. Acesso gratuito para uso pessoal não comercial; reavaliar o plano/provedor caso o uso se torne comercial. Documentação: https://open-meteo.com/en/docs/geocoding-api.

O funcionamento desses serviços depende de conexão e disponibilidade externas; erros são mostrados na interface. A Serper não participa da geocodificação.

## Vercel

Usar preset **Next.js**, raiz do repositório, Node.js 24.x e comandos padrão (`npm run build`). Remover eventuais overrides de diretório de saída de uma configuração anterior de site estático. Nenhuma variável de ambiente é necessária nesta etapa, incluindo chave Serper. O domínio deve ser associado nas configurações do projeto Vercel.

## Validação

Os testes automatizados cobrem validação de entrada, cinco chamadas geográficas, posição fornecida, nomes normalizados, ausência, ambiguidade, falhas parciais, autenticação, créditos, limite de uso e timeout. Nenhuma chave real é necessária para executá-los. Para homologação real, preencher uma chave válida na interface e pesquisar; essa ação consome os créditos correspondentes na Serper.
