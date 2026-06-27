# AgroSync Análise de Dados — Dashboard Local

Visão geral do que foi implementado, ajustado e validado neste projeto.

## 1) O que é
Dashboard offline em HTML/JS que abre arquivos Excel da pasta local (via File System Access API) e exibe análises de:
- Solinftec (produtividade, frente, equipmentos, permanência)
- Produção/Balança
- Densidade de carga
- Controle de carga
- Consumo (caminhões e colhedoras)
- Disponibilidade (oficina)
- Torta (permanência industrial)

Tudo roda no navegador, sem servidor backend local.

## 2) Rotas de ingestão
O interpretador aceita duas origens:
- Local: seleção de pasta com botão “📁 SELECIONAR PASTA”
- Online: Google Sheets via botão “🌐 ATUALIZAR ONLINE”

Quando carregado localmente, ele vasculha a estrutura padrão em `DADOS/`:
- Producao.xlsx
- Solinftec.xlsx
- CAMINHÃO.xlsx / Colhedoras.xlsx
- ConsumoCanavieiros.xls / ConsumoColhedoras.xls
- OS OFICINA GERAL.xls / OS OFICINA GERAL.pdf
- ConsumoGeral.xls
- Torta.xls

## 3) Fonte da verdade para Solinftec
A base oficial é `DADOS/Solinftec.xlsx`.
A análise depende corretamente da coluna `GRUPO EQUIPAMENTO` para montar as frentes/grupos no dashboard (BIOMASSA, FERTIRRIGACAO, CANAVIEIROS, FRENTE 08..FRENTE 39 etc.), substituindo qualquer derivação antiga só por código de frota.

## 4) O que foi ajustado e validado

### 4.1 Bug Solinftec zerado (crítico)
Problema: aba Geral, Colhedoras e Transbordos apareciam vazias.
Causa: o parser JavaScript precipitava a derivação de frente só pelo código da frota; muitos códigos não fecham com os padrões antigos.
Solução aplicada em `DADOS/agrosync/js/solinftec.js`:
- Leitura explícita de `GRUPO EQUIPAMENTO` (modo matriz e modo objeto).
- Prioridade de montagem de frente:
  1) `GRUPO EQUIPAMENTO`
  2) `Frente` (se existir)
  3) Derivação do código da frota
  4) Próprio código da frota como última opção (evita vazio)

Resultado: aba Geral passa a exibir os grupos reais e os cards Colhedoras/Transbordos passam a ser populados quando aplicável.

### 4.2 Normalização de colunas de Produção
Em `bot_agrosync.py` o parser agora normaliza nomes de coluna, corrigindo `Data/hora Entrada` e `Data/hora Saída` para os nomes esperados pelo Apps Script e pelo dashboard.
Isso elimina a mensagem “Nenhum dado de permanência encontrado” quando a origem existir.

### 4.3 SSL e segurança
`config.json` ajustado:
- `ssl_verify: "certifi"` como padrão.
- `fallback_sem_ssl: true` mantém resiliência em redes com proxy ou certificados não padrão.

## 5) Como usar (modo local)
1. Abra `DADOS/agrosync/index.html`
2. Clique em “📁 SELECIONAR PASTA”
3. Escolha a pasta `DADOS/` da usina
4. Dashboard carrega automaticamente

Atalho de teclado: “Ctrl+Shift+F5” no Chrome/Edge força recarregar scripts sem cache.

## 6) Como usar (modo online)
1. Clique em “🌐 ATUALIZAR ONLINE”
2. O bot Python (`bot_agrosync.py`) lê os arquivos locais e envia ao Apps Script
3. O Google Sheets re-desenha o dashboard online com os mesmos dados

## 7) Estrutura de pastas
```
DADOS/
  agrosync/
    index.html
    js/
      shared.js
      solinftec.js
      balance.js
      densidade.js
      controle.js
      consumo.js
      disponibilidade.js
      torta.js
  Solinftec.xlsx
  Producao.xlsx
  CAMINHÃO.xlsx
  Colhedoras.xlsx
  ConsumoCanavieiros.xls
  ConsumoColhedoras.xls
  OS OFICINA GERAL.xls
  OS OFICINA GERAL.pdf
  ConsumoGeral.xls
  Torta.xls
```

## 8) Status atual
- Aba Solinftec Geral: funcionando com GRUPO EQUIPAMENTO
- Aba Balança / Permanência: funcionando após normalização dos nomes de coluna
- Abas Densidade, Controle, Consumo, Disponibilidade e Torta: operacionais
- Bot de upload para Google Sheets: funcional
