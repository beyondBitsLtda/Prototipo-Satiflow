/* ──────────────────────────────────────────────────────────────────────────
   SatiFlow · protótipo — dados de demonstração
   ──────────────────────────────────────────────────────────────────────────

   TUDO AQUI É FICTÍCIO, E ISSO É DELIBERADO.

   Os extratos reais do cliente foram lidos para entender os FORMATOS — como
   cada banco escreve valor, data e sinal, que tipos de histórico aparecem e em
   que ordem de grandeza. Os nomes de contraparte, os números de conta e os
   valores foram inventados: este protótipo vai para uma página pública, e
   movimentação financeira de cliente não se publica.

   O que veio dos arquivos reais e vale manter:
     · os TIPOS de histórico de cada banco, que são padrão do setor
     · o fato de duas contas usarem o mesmo formato com separador decimal
       diferente (ver FONTES abaixo) — é o caso que a RN-22 existe para cobrir
     · linha de saldo misturada aos lançamentos, no CSV de um dos bancos
     · identificador de lançamento presente em alguns formatos e ausente em
       outros, que é o que muda a chave de deduplicação (RN-26)
   ────────────────────────────────────────────────────────────────────────── */

(function (global) {
  "use strict";

  /** Gerador determinístico: a demonstração precisa sair igual toda vez. */
  function semente(n) {
    let s = n >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  const r = semente(20261014);
  const sorteia = (lista) => lista[Math.floor(r() * lista.length)];
  const entre = (a, b) => a + r() * (b - a);

  // ── filiais ──────────────────────────────────────────────────────────────
  const FILIAIS = [
    { id: "MAT", nome: "Matriz" },
    { id: "BHZ", nome: "BHZ" },
    { id: "SAO", nome: "SAO" },
    { id: "NSR", nome: "NSR" },
    { id: "AGR", nome: "Agroceres" },
  ];

  // ── contas e as fontes de extrato ────────────────────────────────────────
  // `leitura` é o que a RN-22 exige declarar por fonte. Repare que as duas
  // contas em OFX têm separador decimal diferente: é o caso real.
  const FONTES = [
    {
      id: "brad-mat", banco: "Bradesco", conta: "Matriz", mascara: "••••-5", filial: "MAT",
      via: "API + OFX", formato: "OFX", decimal: "vírgula", data: "aaaammdd, sem fuso",
      sinal: "TRNTYPE", identificador: "FITID", saldo: 1284077.52,
      historicos: ["PFOR TIT OUTROS BANCOS", "LIQUIDACAO DE COBRANCA VALOR DISPONIVEL",
        "TARIFA BANCARIA TRANSF PGTO PIX", "TED-TRANSF ELET DISPON REMET.",
        "PAGFOR C/C R TIME SD L", "RENTAB.INVEST FACILCRED"],
    },
    {
      id: "brad-fil", banco: "Bradesco", conta: "Filial", mascara: "••••-1", filial: "BHZ",
      via: "API + OFX", formato: "OFX", decimal: "vírgula", data: "aaaammdd, sem fuso",
      sinal: "TRNTYPE", identificador: "FITID", saldo: 218440.17,
      historicos: ["PFOR TIT BRADESCO SD L", "TARIFA REGISTRO COBRANCA NA BAIXA",
        "LIQUIDACAO DE COBRANCA VALOR DISPONIVEL", "TAR CC REAL TIME PAGFOR"],
    },
    {
      id: "bb", banco: "Banco do Brasil", conta: "Matriz", mascara: "••••-8", filial: "MAT",
      via: "arquivo", formato: "CSV", decimal: "vírgula", data: "dd.mm.aaaa",
      sinal: "coluna D/C", identificador: "não traz", saldo: 166395.66,
      historicos: ["Pagamento Eletrôn Boleto", "Débito Serviço Cobrança", "Pagamento de Boleto",
        "Cobrança", "BB Rende Fácil", "Pix - Enviado", "Pix - Recebido"],
    },
    {
      id: "caixa", banco: "Caixa", conta: "Matriz", mascara: "••••-3", filial: "MAT",
      via: "arquivo", formato: "OFX", decimal: "ponto", data: "aaaammdd, com fuso",
      sinal: "TRNTYPE", identificador: "FITID", saldo: 74210.08,
      historicos: ["CRED TED", "DEB CESTA DE SERVICOS", "PAGAMENTO DE BOLETO", "DEB PIX"],
    },
    {
      id: "bbc", banco: "BBC", conta: "Operacional", mascara: "••••-7", filial: "SAO",
      via: "arquivo", formato: "CSV", decimal: "vírgula", data: "dd/mm/aaaa",
      sinal: "no número", identificador: "id composto", saldo: 38955.40,
      historicos: ["Transferencia entre contas recebida", "Transferencia entre contas enviada",
        "Pagamento recebido", "Tarifa de pacote"],
    },
  ];

  // ── contrapartes fictícias ───────────────────────────────────────────────
  const PARCEIROS = [
    "Transportes Exemplo Ltda", "Posto Modelo Ltda", "Locadora Fictícia S.A.",
    "Telefonia Teste S.A.", "Agregado Exemplo ME", "Pneus Demonstração Ltda",
    "Oficina Amostra ME", "Seguros Protótipo S.A.", "Pedágio Simulado S.A.",
  ];
  const CLIENTES = [
    "Indústria Alfa S.A.", "Distribuidora Beta Ltda", "Comércio Gama ME",
    "Agro Delta S.A.", "Metalúrgica Épsilon Ltda", "Alimentos Zeta S.A.",
    "Químicos Eta Ltda", "Cerâmica Teta ME",
  ];

  const cnpj = (i) =>
    String(10 + i).padStart(2, "0") + ".345.678/0001-" + String(10 + (i * 7) % 80).padStart(2, "0");

  // ── lançamentos de extrato ───────────────────────────────────────────────
  function lancamentos(fonte, qtd) {
    const saida = [];
    for (let i = 0; i < qtd; i++) {
      const dia = 2 + Math.floor(r() * 26);
      const entrada = r() > 0.52;
      const h = sorteia(fonte.historicos);
      const valor = Number(entre(80, h.includes("TED") || h.includes("COBRANCA") ? 42000 : 7000).toFixed(2));
      saida.push({
        id: fonte.id + "-" + i,
        fonte: fonte.id,
        data: "2026-01-" + String(dia).padStart(2, "0"),
        historico: h.endsWith("REMET.") ? h + sorteia(CLIENTES).toUpperCase() : h,
        valor: entrada ? valor : -valor,
        documento: String(100000 + Math.floor(r() * 899999)),
        conciliado: true,
      });
    }
    return saida.sort((a, b) => a.data.localeCompare(b.data));
  }

  const EXTRATO = FONTES.flatMap((f) => lancamentos(f, f.id === "brad-mat" ? 34 : 18));

  // O caso que o cliente já viu na apresentação: uma fatura de R$ 380 paga em
  // dois PIX avulsos, 280 no dia 08 e 100 no dia 09. Os dois dias divergem até
  // alguém liquidar a fatura — e é isso que a tela de Conciliação resolve.
  EXTRATO.push(
    { id: "pix-08", fonte: "brad-mat", data: "2026-01-08", historico: "PIX RECEBIDO",
      valor: 280.00, documento: "778801", conciliado: false, semPar: true },
    { id: "pix-09", fonte: "brad-mat", data: "2026-01-09", historico: "PIX RECEBIDO",
      valor: 100.00, documento: "778802", conciliado: false, semPar: true },
  );

  // Transferência interna: mesmo valor saindo e entrando no mesmo dia. O
  // sistema propõe a exclusão; quem decide é a pessoa (RN-30).
  EXTRATO.push(
    { id: "tr-01", fonte: "brad-mat", data: "2026-01-12", historico: "TED ENTRE CONTAS PROPRIAS",
      valor: -25000, documento: "990011", conciliado: false, interna: true },
    { id: "tr-02", fonte: "brad-fil", data: "2026-01-12", historico: "TED ENTRE CONTAS PROPRIAS",
      valor: 25000, documento: "990011", conciliado: false, interna: true },
  );

  // ── conciliação dia a dia ────────────────────────────────────────────────
  const DIAS_CONC = [];
  for (let d = 2; d <= 16; d++) {
    const data = "2026-01-" + String(d).padStart(2, "0");
    const banco = Number(entre(18000, 56000).toFixed(2));
    let sistemas = banco;
    if (d === 8) sistemas = Number((banco - 280).toFixed(2));
    if (d === 9) sistemas = Number((banco - 100).toFixed(2));
    DIAS_CONC.push({
      data,
      sistemas,
      banco,
      diferenca: Number((sistemas - banco).toFixed(2)),
      origem: d === 8 ? ["pix-08"] : d === 9 ? ["pix-09"] : [],
    });
  }

  // ── faturas a pagar, pendentes dos dois TMSs ─────────────────────────────
  const TMS = ["SSW 475", "Brudam"];
  const PAGAR = PARCEIROS.map((nome, i) => ({
    id: "AP-" + String(2401 + i),
    favorecido: nome,
    cnpj: cnpj(i),
    tms: TMS[i % 2],
    filial: FILIAIS[i % FILIAIS.length].id,
    vencimento: "2026-01-" + String(14 + (i % 6)).padStart(2, "0"),
    valor: Number(entre(900, 13000).toFixed(2)),
    natureza: sorteia(["Frete agregado", "Combustível", "Locação", "Telefonia", "Manutenção"]),
    situacao: "pendente",
    documentos: 2 + Math.floor(r() * 4),
  }));

  // ── esteira: a fatura que chegou por e-mail ──────────────────────────────
  // Duas: uma que passa em tudo, outra que trava na conferência do tarifário.
  const ESTEIRA = [
    {
      id: "F-8821", parceiro: "Transportes Exemplo Ltda", cnpj: cnpj(0), tms: "SSW 475",
      valor: 12480.00, itens: 14, divergencia: null,
      anexos: ["fatura.pdf", "xml-ctes.zip", "boleto.pdf"],
    },
    {
      id: "F-8822", parceiro: "Agregado Exemplo ME", cnpj: cnpj(4), tms: "Brudam",
      valor: 4380.00, itens: 6,
      divergencia: { item: "AWB 55-7741", cobrado: 742.90, combinado: 718.40 },
      anexos: ["fatura.pdf", "xml-awb.zip", "pix.txt"],
    },
  ];

  // ── a receber ────────────────────────────────────────────────────────────
  const RECEBER = CLIENTES.map((nome, i) => ({
    id: String(1855 + i) + "-" + (i % 9),
    cliente: nome,
    cnpj: cnpj(i + 3),
    tms: TMS[i % 2],
    filial: FILIAIS[i % FILIAIS.length].id,
    emissao: "2026-01-0" + (1 + (i % 5)),
    vencimento: "2026-01-" + String(10 + i).padStart(2, "0"),
    valor: Number(entre(1200, 48000).toFixed(2)),
    situacao: i % 4 === 0 ? "vencida" : "em aberto",
    cobranca: i % 3 === 0 ? "boleto registrado" : i % 3 === 1 ? "PIX com QR" : "sem cobrança",
    protestos: i === 4 ? 1 : 0,
  }));

  // A fatura da apresentação, com os dois PIX por trás.
  RECEBER.unshift({
    id: "1861-9", cliente: "Indústria Alfa S.A.", cnpj: cnpj(1), tms: "SSW 475", filial: "MAT",
    emissao: "2026-01-02", vencimento: "2026-01-10", valor: 380.00,
    situacao: "em aberto", cobranca: "boleto registrado", protestos: 0,
    pagamentos: [
      { data: "2026-01-08", meio: "PIX", valor: 280.00 },
      { data: "2026-01-09", meio: "PIX", valor: 100.00 },
    ],
  });

  // ── fiscal ───────────────────────────────────────────────────────────────
  const NOTAS = [];
  for (let i = 0; i < 16; i++) {
    const conferida = r() > 0.25;
    NOTAS.push({
      chave: "3526" + String(10000000 + Math.floor(r() * 8999999)) + String(1000 + i),
      tipo: sorteia(["NF-e", "NFS-e", "CT-e"]),
      emitente: sorteia(PARCEIROS),
      valor: Number(entre(300, 18000).toFixed(2)),
      data: "2026-01-" + String(2 + (i % 20)).padStart(2, "0"),
      situacao: conferida ? "conferida" : "a conferir",
      vinculo: conferida && r() > 0.4 ? "AP-" + String(2401 + (i % 9)) : null,
      creditos: "manual",
    });
  }

  // ── perfis e permissões (RF-43, RN-17) ───────────────────────────────────
  // opera = faz tudo | ve = só enxerga | aprova = autoriza | nao = sem acesso
  const MODULOS = [
    { id: "caixa", nome: "Fluxo de caixa", icone: "grafico" },
    { id: "conciliacao", nome: "Conciliação", icone: "balanca" },
    { id: "pagar", nome: "A pagar", icone: "saida" },
    { id: "receber", nome: "Faturamento / A receber", icone: "entrada" },
    { id: "fiscal", nome: "Fiscal", icone: "nota" },
    { id: "gerencia", nome: "Gerência", icone: "grafico" },
    { id: "importar", nome: "Importar extrato", icone: "upload" },
    { id: "usuarios", nome: "Usuários", icone: "pessoas" },
  ];

  const PERFIS = [
    { id: "master", nome: "Master", pessoa: "Ana Prado", sigla: "AP", filial: null,
      perm: { caixa: "opera", conciliacao: "opera", pagar: "opera", receber: "opera", fiscal: "opera", gerencia: "opera", importar: "opera", usuarios: "opera" } },
    { id: "diretoria", nome: "Diretoria", pessoa: "Caio Nunes", sigla: "CN", filial: null,
      perm: { caixa: "ve", conciliacao: "ve", pagar: "aprova", receber: "ve", fiscal: "ve", gerencia: "ve", importar: "nao", usuarios: "nao" } },
    { id: "gerente", nome: "Gerente financeiro", pessoa: "Marina Reis", sigla: "MR", filial: null,
      perm: { caixa: "opera", conciliacao: "opera", pagar: "aprova", receber: "opera", fiscal: "opera", gerencia: "opera", importar: "opera", usuarios: "nao" } },
    { id: "ap", nome: "Analista a pagar", pessoa: "Rui Lima", sigla: "RL", filial: null,
      perm: { caixa: "nao", conciliacao: "ve", pagar: "opera", receber: "nao", fiscal: "nao", gerencia: "nao", importar: "opera", usuarios: "nao" } },
    { id: "ar", nome: "Analista a receber", pessoa: "Bia Teles", sigla: "BT", filial: null,
      perm: { caixa: "nao", conciliacao: "ve", pagar: "nao", receber: "opera", fiscal: "nao", gerencia: "nao", importar: "opera", usuarios: "nao" } },
    { id: "fiscal", nome: "Fiscal", pessoa: "Davi Rocha", sigla: "DR", filial: null,
      perm: { caixa: "nao", conciliacao: "ve", pagar: "nao", receber: "nao", fiscal: "opera", gerencia: "nao", importar: "nao", usuarios: "nao" } },
    { id: "filial", nome: "Gestor de filial", pessoa: "Sofia Dias", sigla: "SD", filial: "BHZ",
      perm: { caixa: "nao", conciliacao: "ve", pagar: "ve", receber: "nao", fiscal: "ve", gerencia: "nao", importar: "nao", usuarios: "nao" } },
    { id: "contabil", nome: "Contabilidade", pessoa: "Ivo Martins", sigla: "IM", filial: null,
      perm: { caixa: "ve", conciliacao: "ve", pagar: "ve", receber: "ve", fiscal: "ve", gerencia: "ve", importar: "nao", usuarios: "nao" } },
  ];

  const ACOES_PERM = ["ver", "criar", "editar", "aprovar", "liquidar", "gerar remessa", "baixar/exportar", "ver anexos"];

  // ── pedidos prontos, a um clique da busca (RF-02) ────────────────────────
  const PEDIDOS = [
    "Baixar todos os CT-es desta fatura",
    "O que está em aberto para mim?",
    "Qual o próximo fechamento deste cliente?",
    "Quanto transportamos com este parceiro no mês?",
    "Liberar crédito para este cliente",
    "O que vence amanhã?",
    "Faturas sem nota conferida",
    "Dias que não conciliam no mês",
  ];

  global.DADOS = {
    FILIAIS, FONTES, EXTRATO, DIAS_CONC, PAGAR, ESTEIRA, RECEBER, NOTAS,
    MODULOS, PERFIS, ACOES_PERM, PEDIDOS, PARCEIROS, CLIENTES,
  };
})(window);
