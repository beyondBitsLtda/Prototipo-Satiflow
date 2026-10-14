# SatiFlow · protótipo de validação

Mockup navegável do SatiFlow, para validar o escopo com o cliente **antes** de
escrever o sistema. É site estático: abre direto no navegador e publica no
GitHub Pages sem build.

> **Nada aqui funciona de verdade.** Não há banco, não há TMS, não há banco de
> dados. Toda "gravação" é encenada no navegador e guardada em `localStorage`.

---

## Por que ele existe

Documento de escopo é lido por quem já entende o problema. Protótipo é entendido
por quem vive o problema — e é esse o público desta validação.

O que ele se propõe a provar:

- **os caminhos**, que são o que o cliente precisa reconhecer como o dia dele:
  liquidar na conciliação sem abrir o TMS, a esteira da fatura do parceiro, o
  lote que grava item a item, a importação que recusa arquivo que não fecha;
- **o recorte por perfil e filial**, trocando o perfil na barra lateral e vendo
  o menu e as listas mudarem de verdade;
- **o desenho de cada tela**, para a conversa ser sobre o que falta e não sobre
  o que foi entendido errado.

O que ele não prova: nada que dependa de banco, TMS ou API bancária.

---

## O que experimentar primeiro

Cinco minutos que mostram o essencial:

1. **Conciliação** → clique num dia marcado como `DIVERGE`. O painel sugere a
   fatura cujos pagamentos fecham a diferença; liquide e veja os dois dias
   conciliarem. *Ninguém abriu o TMS.*
2. **A pagar** → selecione várias linhas e use **Liquidar**. Uma confirmação só,
   gravação item a item, e um item volta recusado com o motivo — sem impedir os
   outros.
3. **A pagar**, mais abaixo → as duas esteiras. Uma passa; a outra trava na
   conferência de tarifário e vira pendência, com o item e a diferença.
4. **Importar extrato** → repare na tabela de como cada fonte é lida, e tente o
   botão **Arquivo truncado**: o sistema recusa o arquivo inteiro.
5. **Barra lateral, "Ver o sistema como"** → escolha **Gestor de filial**. O
   menu encolhe, a filial trava e as listas passam a mostrar só BHZ.

A encenação da escrita é proposital: confirma, grava, **relê**, confirma. Se a
tela mostrasse o resultado na hora, o cliente aprovaria um fluxo que não existe.

---

## Sobre os dados

**Tudo fictício.** Os extratos reais do cliente foram lidos para entender os
*formatos* — como cada banco escreve valor, data e sinal, que tipos de histórico
aparecem, em que ordem de grandeza. Nomes de contraparte, números de conta e
valores foram inventados.

Isto é deliberado: a página é pública, e movimentação financeira de cliente não
se publica. Nenhuma chave, credencial ou arquivo de extrato entra aqui.

O que veio dos arquivos reais e vale manter:

- os **tipos de histórico** de cada banco, que são padrão do setor;
- o fato de duas contas usarem o **mesmo formato com separador decimal
  diferente** — vírgula numa, ponto na outra. É o caso que a regra RN-22 existe
  para cobrir, e está na tela *Importar extrato*;
- **linha de saldo** misturada aos lançamentos, num dos CSVs;
- **identificador de lançamento** presente em alguns formatos e ausente em
  outros, que é o que muda a chave de deduplicação.

---

## Publicar no GitHub Pages

A pasta é autocontida; não há etapa de build.

**Opção 1 — a partir de uma branch**

1. `Settings` → `Pages` → *Source*: **Deploy from a branch**
2. Branch: a sua · pasta: `/prototipo`
3. Salve. O endereço sai como
   `https://<usuário>.github.io/<repositório>/`

**Opção 2 — repositório só do protótipo**

Copie o conteúdo desta pasta para a raiz de um repositório novo e aponte o Pages
para a branch principal.

O arquivo `.nojekyll` já está aqui: sem ele o GitHub ignora pastas que começam
com `_` e pode quebrar o carregamento.

---

## Arquivos

```
prototipo/
  index.html          a casca: barra lateral, cabeçalho, gaveta, modal, busca
  assets/estilo.css   os mesmos tokens do sistema, escritos à mão (sem build)
  assets/dados.js     os dados fictícios e as regras de leitura por fonte
  assets/app.js       roteador, telas e as interações
  .nojekyll
```

Paleta igual à do sistema: `#080808`, `#ff6900`, `#ffd200`, `#a9a9a8`, `#fcfcfc`,
mais os dois tons escurecidos para texto sobre fundo claro — que existem porque
laranja e cinza puros sobre branco ficam abaixo dos 4,5:1 da WCAG AA.

---

## Cobertura do escopo

Cada tela traz o código do requisito (`RF-nn`) ao lado do bloco que o
implementa, para a validação poder ser feita item a item contra o documento de
escopo.

| Tela | Requisitos |
|---|---|
| Fluxo de caixa | RF-05 a RF-11 |
| Conciliação | RF-12 a RF-19 |
| A pagar | RF-20 a RF-29 |
| Faturamento / A receber | RF-30 a RF-37 |
| Fiscal | RF-38 a RF-42 |
| Usuários | RF-43, RF-44 |
| Importar extrato | RF-49 |
| Busca, ficha e auditoria | RF-01 a RF-04, RF-46 |
