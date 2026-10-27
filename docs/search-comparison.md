# Comparação de modalidades Serper — 02/10/2026

Objetivo: aproximar a consulta da lista local da Busca Google enviada pelo usuário, mantendo relevância geográfica por ponto. Termo: `dentista rio das ostras`.

Foram feitas seis chamadas reais nesta rodada, com um crédito informado por resposta (seis créditos no total). Chave e coordenadas pessoais não são registradas aqui.

| Teste | Resultado observado |
| --- | --- |
| Places com coordenadas do ponto 5 em `location` | Perla 1, Sorrilagos 3, Sorria Rio 4. Wellen, Laura, Paula e Vanessa não apareceram nos dez retornados. |
| Places com nome da cidade em `location` | Kissila Vieira 1, Adelmo 2, Kíssila Siqueira 3; Perla 9. |
| Search com coordenadas do ponto 5 em `location` | Resposta 200, sem lista `places`. |
| Repetição de Places no ponto 5 | Perla 1, Milena 2, Dental Integra 3, Sorria Rio 5, Sorrilagos 7. |
| Places com coordenadas do ponto 1 | Mesma lista e ordem da repetição no ponto 5. |
| Places sem localização | Perla 1, Kissila Vieira 2, Sorrilagos 3, Sorria Rio 4; semelhante à primeira consulta do ponto 5. |

## Conclusão

Não foi demonstrado que `location` em formato de coordenadas controle a origem geográfica de Places. HTTP 200 não comprova suporte ao parâmetro. As variações entre chamadas e a presença de Perla em primeiro mesmo sem localização impedem atribuir a aproximação às coordenadas. Não incorporar essa alternativa como ranking dos cinco pontos.

O playground oficial expõe `ll` para Maps e `location` com localidades nomeadas para Places/Search. O aplicativo permanece em Maps, enviando latitude e longitude sem zoom explícito e preservando a ordem do provedor.

Uma próxima investigação possível é um provedor com Local Finder e coordenadas documentadas, por exemplo DataForSEO. Nenhuma chamada a esse serviço foi feita e não há garantia de reproduzir uma sessão pessoal do Google. Seriam necessárias credenciais próprias antes de validar resultados.

Referências: [Serper Playground](https://serper.dev/playground), [DataForSEO Local Finder](https://docs.dataforseo.com/v3/serp-google-local_finder-live-advanced/).
