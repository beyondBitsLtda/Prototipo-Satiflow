/* ──────────────────────────────────────────────────────────────────────────
   SatiFlow · protótipo — comportamento
   ──────────────────────────────────────────────────────────────────────────

   O que este protótipo se propõe a provar, e o que não:

   PROVA   a navegação, o recorte por perfil e filial, o desenho de cada tela,
           e principalmente os CAMINHOS: liquidar na conciliação, a esteira da
           fatura, o lote item a item, a importação que recusa arquivo que não
           fecha. São esses que o cliente precisa reconhecer como o dia dele.

   NÃO PROVA   nada que dependa de banco, de TMS ou de API. Toda "escrita"
           aqui é encenada: confirma, mostra gravando, mostra relendo, mostra
           confirmado — na ordem que a RN-02 exige — e guarda o resultado na
           memória do navegador. Nenhuma linha sai desta máquina.

   A encenação da escrita é proposital. Se a tela mostrasse o resultado na
   hora, o cliente aprovaria um fluxo que não existe: o sistema de verdade
   precisa escrever no TMS, reler e só então dizer que acabou.
   ────────────────────────────────────────────────────────────────────────── */

(function () {
  "use strict";

  const D = window.DADOS;
  const CHAVE = "satiflow-prototipo-v1";

  // ── estado ───────────────────────────────────────────────────────────────
  const inicial = () => ({
    perfil: "master",
    filial: "todas",
    extrato: JSON.parse(JSON.stringify(D.EXTRATO)),
    dias: JSON.parse(JSON.stringify(D.DIAS_CONC)),
    pagar: JSON.parse(JSON.stringify(D.PAGAR)),
    receber: JSON.parse(JSON.stringify(D.RECEBER)),
    notas: JSON.parse(JSON.stringify(D.NOTAS)),
    esteira: JSON.parse(JSON.stringify(D.ESTEIRA)),
    selecionados: [],
    auditoria: [],
    avisouConcorrencia: false,
  });

  let estado = carregar();

  function carregar() {
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (bruto) return Object.assign(inicial(), JSON.parse(bruto));
    } catch { /* sem armazenamento: a demonstração roda só nesta aba */ }
    return inicial();
  }

  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch { /* ok */ }
  }

  // ── utilidades ───────────────────────────────────────────────────────────
  const $ = (s, raiz = document) => raiz.querySelector(s);
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const moeda = (v) => (v < 0 ? "−" : "") + Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dataBr = (iso) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
  const agora = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const perfil = () => D.PERFIS.find((p) => p.id === estado.perfil);

  /** O recorte da RN-18: vale em lista, painel, relatório e exportação. */
  function daFilial(lista) {
    const p = perfil();
    const alvo = p.filial || (estado.filial === "todas" ? null : estado.filial);
    return alvo ? lista.filter((x) => !x.filial || x.filial === alvo) : lista;
  }

  const pode = (modulo) => perfil().perm[modulo] !== "nao";
  const opera = (modulo) => perfil().perm[modulo] === "opera";

  const ICONES = {
    grafico: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    balanca: '<path d="M12 3v18M5 7h14M7 7l-3 7h6zM17 7l-3 7h6z"/>',
    saida: '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M14 12h5m0 0-2-2m2 2-2 2"/>',
    entrada: '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M10 12H5m0 0 2-2m-2 2 2 2"/>',
    nota: '<path d="M7 3h10l3 3v15H7z"/><path d="M10 9h7M10 13h7M10 17h4"/>',
    upload: '<path d="M12 16V4m0 0L8 8m4-4 4 4M4 18v2h16v-2"/>',
    pessoas: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M17 11a3 3 0 1 0 0-6M19 20a5 5 0 0 0-3-4.6"/>',
  };
  const icone = (nome) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[nome] || ""}</svg>`;

  // ── avisos ───────────────────────────────────────────────────────────────
  function aviso(titulo, detalhe, tipo) {
    const el = document.createElement("div");
    el.className = "toast" + (tipo ? " toast--" + tipo : "");
    el.innerHTML = `<strong>${esc(titulo)}</strong>${detalhe ? `<span>${esc(detalhe)}</span>` : ""}`;
    $("#avisos").appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  // ── trilha de auditoria (RF-46) ──────────────────────────────────────────
  // Ela registra o que ACONTECEU nesta sessão. Não é enfeite: é o jeito de
  // mostrar ao cliente que toda ação deixa rastro, com quem e quando.
  function registrar(acao, alvo, detalhe) {
    estado.auditoria.unshift({
      hora: agora(), quem: perfil().pessoa, papel: perfil().nome, acao, alvo, detalhe,
    });
    $("#selo-auditoria").textContent = estado.auditoria.length;
    salvar();
  }

  /**
   * A encenação da escrita, na ordem da RN-02: confirma, grava, relê, confirma.
   * `conflito` força uma vez o caso da RN-03 — o TMS mudou desde a leitura.
   */
  async function gravarNoTms({ titulo, detalhe, tms, acao, alvo, conflito }, depois) {
    const ok = await confirmar({
      titulo,
      corpo: `
        <p>${detalhe}</p>
        <div class="nota">
          <strong>O que vai acontecer</strong>
          A gravação vai para o <strong>${esc(tms)}</strong>, e o SatiFlow relê logo depois
          para confirmar que existe mesmo. Só então a ação é dada como concluída.
        </div>`,
      confirmar: "Gravar no " + tms,
    });
    if (!ok) return false;

    if (conflito && !estado.avisouConcorrencia) {
      estado.avisouConcorrencia = true;
      salvar();
      const segue = await confirmar({
        titulo: "O TMS mudou desde a última leitura",
        corpo: `
          <div class="nota nota--erro">
            <strong>Diferença encontrada antes de gravar</strong>
            O vencimento no ${esc(tms)} é <strong>12/01</strong>; a tela foi carregada com <strong>10/01</strong>.
            Alguém alterou nesse intervalo.
          </div>
          <p>Gravar por cima substitui o que está lá. Recarregar traz o valor atual e descarta esta edição.</p>`,
        confirmar: "Gravar mesmo assim",
        cancelar: "Recarregar do TMS",
      });
      if (!segue) {
        aviso("Nada foi gravado", "A tela foi recarregada com o valor do TMS.");
        return false;
      }
    }

    aviso("Gravando no " + tms + "…", detalhe);
    await espera(620);
    aviso("Relendo o " + tms + "…", "Conferindo se a escrita existe mesmo.");
    await espera(620);
    aviso("Confirmado", "A releitura encontrou o registro.", "ok");
    registrar(acao, alvo, detalhe);
    if (depois) depois();
    salvar();
    desenhar();
    return true;
  }

  // ── modal ────────────────────────────────────────────────────────────────
  function confirmar({ titulo, corpo, confirmar: textoOk = "Confirmar", cancelar = "Cancelar" }) {
    return new Promise((resolve) => {
      $("#modal-titulo").textContent = titulo;
      $("#modal-corpo").innerHTML = corpo;
      $("#modal-acoes").innerHTML =
        `<button type="button" class="botao" data-m="nao">${esc(cancelar)}</button>` +
        `<button type="button" class="botao botao--principal" data-m="sim">${esc(textoOk)}</button>`;
      $("#modal").hidden = false;

      const fim = (v) => { $("#modal").hidden = true; resolve(v); };
      $("#modal-acoes").onclick = (e) => {
        const b = e.target.closest("[data-m]");
        if (b) fim(b.dataset.m === "sim");
      };
      $("#modal .modal__fundo").onclick = () => fim(false);
      $("#modal-acoes").querySelector('[data-m="sim"]').focus();
    });
  }

  // ── gaveta ───────────────────────────────────────────────────────────────
  function abrirGaveta(titulo, html) {
    $("#gaveta-titulo").textContent = titulo;
    $("#gaveta-corpo").innerHTML = html;
    $("#gaveta").hidden = false;
  }
  const fecharGaveta = () => { $("#gaveta").hidden = true; };

  // ──────────────────────────────────────────────────────────────────────────
  // TELAS
  // ──────────────────────────────────────────────────────────────────────────

  function topo(etiqueta, titulo, apoio) {
    return `<div class="tela__topo">
      <span class="tela__etiqueta">${esc(etiqueta)}</span>
      <h1 class="tela__titulo">${titulo}</h1>
      <p class="tela__apoio">${apoio}</p>
    </div>`;
  }

  // ── fluxo de caixa ───────────────────────────────────────────────────────
  function telaCaixa() {
    const contas = daFilial(D.FONTES);
    const saldo = contas.reduce((s, f) => s + f.saldo, 0);
    const aPagar = daFilial(estado.pagar).reduce((s, f) => s + f.valor, 0);
    const aReceber = daFilial(estado.receber).filter((f) => f.situacao !== "liquidada")
      .reduce((s, f) => s + f.valor, 0);
    const vencidas = daFilial(estado.receber).filter((f) => f.situacao === "vencida");

    return topo("Fluxo de caixa · 1ª guia",
      'Quanto tem agora, e quanto vai ter <span class="destaque">em sete dias</span>',
      "É a primeira tela do sistema de propósito: a primeira pergunta de todo dia é essa.") +

    `<div class="grade grade--2" style="margin-bottom:14px">
      <div class="bloco bloco--escuro">
        <p class="bloco__titulo">Saldo agora <span class="rf">RF-05</span></p>
        <span class="valor valor--gigante">R$ ${moeda(saldo)}</span>
        <span class="origem">${contas.length} conta(s) · extrato do banco, lido às 06:10</span>
      </div>
      <div class="bloco">
        <p class="bloco__titulo">Projetado em 7 dias <span class="rf">RF-06</span></p>
        <span class="valor valor--gigante destaque">R$ ${moeda(saldo + aReceber * 0.42 - aPagar * 0.6)}</span>
        <span class="origem">previsto × realizado · recalculado no último cron, ${agora()}</span>
      </div>
    </div>

    <div class="grade grade--3" style="margin-bottom:14px">
      ${["Hoje", "Amanhã", "7 dias"].map((q, i) => `
        <div class="bloco">
          <p class="bloco__titulo">${q} <span class="rf">RF-07</span></p>
          <div style="display:flex;gap:22px">
            <div><span class="origem" style="margin:0">pagar</span>
              <span class="valor valor--grande valor--pagar">${moeda(aPagar * [0.18, 0.11, 1][i])}</span></div>
            <div><span class="origem" style="margin:0">receber</span>
              <span class="valor valor--grande valor--receber">${moeda(aReceber * [0.09, 0.14, 1][i])}</span></div>
          </div>
          <span class="origem">pendentes dos TMSs + lotes aprovados · a cada cron</span>
        </div>`).join("")}
    </div>

    <div class="grade grade--12">
      <div class="bloco">
        <p class="bloco__titulo">Saldo por conta <span class="rf">RF-08</span></p>
        <p class="bloco__apoio">Cada número diz de onde veio e a que horas foi lido.</p>
        <div class="tabela-caixa"><table>
          <thead><tr><th>Conta</th><th>Entrada</th><th class="num">Saldo</th><th>Lido</th></tr></thead>
          <tbody>${contas.map((f) => `
            <tr><td><strong>${esc(f.banco)}</strong> · ${esc(f.conta)} <span class="origem" style="display:inline">${esc(f.mascara)}</span></td>
              <td><span class="pilula pilula--neutro">${esc(f.via)}</span></td>
              <td class="num">R$ ${moeda(f.saldo)}</td>
              <td><span class="origem" style="margin:0">06:10</span></td></tr>`).join("")}
          </tbody></table></div>
      </div>

      <div class="bloco">
        <p class="bloco__titulo">Inadimplentes <span class="rf">RF-09</span></p>
        <p class="bloco__apoio">${vencidas.length} fatura(s) vencida(s) · só a receber, nunca somado ao que está em atraso do lado de pagar.</p>
        ${vencidas.slice(0, 5).map((f) => `
          <div style="display:flex;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--borda)">
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:13px">${esc(f.cliente)}</div>
              <span class="origem" style="margin:0">${esc(f.id)} · venceu ${dataBr(f.vencimento)}${f.protestos ? " · tem protesto" : ""}</span>
            </div>
            <span class="valor">${moeda(f.valor)}</span>
          </div>`).join("") || '<p class="vazio">Nada vencido nesta filial.</p>'}
        <div class="linha-botoes" style="margin-top:12px">
          <button class="botao botao--pequeno" data-demo="cobrar">Cobrar</button>
          <button class="botao botao--pequeno" data-demo="negociar">Negociar</button>
          <button class="botao botao--pequeno" data-demo="protestar">Protestar</button>
        </div>
      </div>
    </div>

    <div class="grade grade--2" style="margin-top:14px">
      <div class="bloco">
        <p class="bloco__titulo">Gasto e ganho por filial <span class="rf">RF-10</span></p>
        ${D.FILIAIS.map((f, i) => {
          const pct = 28 + ((i * 17) % 60);
          return `<div style="margin-bottom:9px">
            <div style="display:flex;justify-content:space-between;font-size:12.5px">
              <span>${esc(f.nome)}</span><span class="valor">${moeda(18000 + i * 9400)}</span>
            </div>
            <div class="barra-progresso"><span style="width:${pct}%"></span></div>
          </div>`;
        }).join("")}
      </div>
      <div class="bloco">
        <p class="bloco__titulo">Custos: De→Para e rateio <span class="rf">RF-11</span></p>
        <p class="bloco__apoio">Janela de três meses, como já funciona hoje.</p>
        <div class="tabela-caixa"><table>
          <thead><tr><th>Natureza</th><th class="num">Nov</th><th class="num">Dez</th><th class="num">Jan</th></tr></thead>
          <tbody>${["Frete agregado", "Combustível", "Manutenção", "Pedágio", "Tarifas bancárias"].map((n, i) => `
            <tr><td>${esc(n)}</td>
              <td class="num">${moeda(9000 + i * 2300)}</td>
              <td class="num">${moeda(9800 + i * 2100)}</td>
              <td class="num">${moeda(10400 + i * 2500)}</td></tr>`).join("")}
          </tbody></table></div>
      </div>
    </div>`;
  }

  // ── conciliação ──────────────────────────────────────────────────────────
  function telaConciliacao() {
    const dias = estado.dias;
    const divergentes = dias.filter((d) => d.diferenca !== 0);

    return topo("Conciliação",
      'Na Conciliação se resolve <span class="destaque">tudo da conciliação</span>',
      "Clique num dia que diverge: as ações do dia abrem ao lado, e tudo se resolve sem abrir o TMS.") +

    `<div class="grade grade--12">
      <div class="bloco">
        <p class="bloco__titulo">Créditos · janeiro/2026 <span class="rf">RF-12</span></p>
        <p class="bloco__apoio">Sistemas − Banco = Diferença. ${divergentes.length
          ? `<strong>${divergentes.length} dia(s)</strong> ainda não fecham.`
          : "Todos os dias fecham."}</p>
        <div class="tabela-caixa"><table>
          <thead><tr><th>Dia</th><th class="num">Sistemas</th><th class="num">Banco</th><th class="num">Diferença</th><th>Situação</th></tr></thead>
          <tbody>${dias.map((d) => `
            <tr class="${d.diferenca !== 0 ? "diverge clicavel" : ""}" ${d.diferenca !== 0 ? `data-dia="${d.data}"` : ""}>
              <td><strong>${dataBr(d.data)}</strong></td>
              <td class="num">${moeda(d.sistemas)}</td>
              <td class="num">${moeda(d.banco)}</td>
              <td class="num">${d.diferenca === 0 ? "0,00" : moeda(d.diferenca)}</td>
              <td>${d.diferenca === 0
                ? '<span class="pilula pilula--ok">OK</span>'
                : '<span class="pilula pilula--erro">DIVERGE</span>'}</td>
            </tr>`).join("")}
          </tbody></table></div>
        <span class="origem">extrato lido às 06:10 · sistemas relidos no último cron</span>
      </div>

      <div class="bloco bloco--escuro">
        <p class="bloco__titulo">Ações do dia, sem sair da tela <span class="rf">RF-13</span></p>
        <p class="bloco__apoio">O que a tela oferece quando um dia não fecha.</p>
        ${divergentes.length ? divergentes.map((d) => `
          <div class="acao acao--sugerida" data-dia="${d.data}">
            <div class="acao__texto">
              <div class="acao__titulo">Liquidar a fatura paga por PIX avulso</div>
              <div class="acao__apoio">${dataBr(d.data)} · diferença de ${moeda(d.diferenca)} sem par nos sistemas</div>
            </div>
            <button class="botao botao--pequeno" data-dia="${d.data}">Abrir</button>
          </div>`).join("") : '<p class="vazio">Nenhuma pendência. O mês fecha.</p>'}

        <div class="acao" data-acao-conc="tarifas">
          <div class="acao__texto">
            <div class="acao__titulo">Lançar tarifas no TMS <span class="rf">RF-16</span></div>
            <div class="acao__apoio">natureza, conta e departamento do banco · em lote</div>
          </div>
          <button class="botao botao--pequeno" data-acao-conc="tarifas">Lançar 3</button>
        </div>
        <div class="acao" data-acao-conc="acni">
          <div class="acao__texto">
            <div class="acao__titulo">Identificar ACNI <span class="rf">RF-17</span></div>
            <div class="acao__apoio">sugere o documento por valor, pagador, CNPJ e cliente</div>
          </div>
          <button class="botao botao--pequeno" data-acao-conc="acni">Identificar</button>
        </div>
        <div class="acao" data-acao-conc="interna">
          <div class="acao__texto">
            <div class="acao__titulo">Excluir transferência interna <span class="rf">RF-18</span></div>
            <div class="acao__apoio">mesmo valor saindo e entrando no dia 12 · exige termo</div>
          </div>
          <button class="botao botao--pequeno" data-acao-conc="interna">Excluir</button>
        </div>
        <div class="acao" data-acao-conc="anotar">
          <div class="acao__texto">
            <div class="acao__titulo">Anotar e atribuir <span class="rf">RF-19</span></div>
            <div class="acao__apoio">para o caso que é atraso, não erro</div>
          </div>
          <button class="botao botao--pequeno" data-acao-conc="anotar">Anotar</button>
        </div>
      </div>
    </div>`;
  }

  /** O painel do dia que não fecha — e a liquidação que o resolve. */
  function abrirDia(data) {
    const dia = estado.dias.find((d) => d.data === data);
    if (!dia) return;
    const avulsos = estado.extrato.filter((l) => dia.origem.includes(l.id));
    const fatura = estado.receber.find((f) => f.id === "1861-9");
    const soma = (fatura?.pagamentos || []).reduce((s, p) => s + p.valor, 0);

    abrirGaveta(`Dia ${dataBr(data)} · diferença de ${moeda(dia.diferenca)}`, `
      <div class="nota">
        <strong>O que o sistema encontrou</strong>
        ${avulsos.length} crédito(s) no extrato sem par nos sistemas. Somados aos dos
        outros dias divergentes, fecham o valor de uma fatura em aberto.
      </div>

      <h3 style="font-size:13px;margin:16px 0 7px">No extrato</h3>
      <div class="tabela-caixa"><table><tbody>
        ${avulsos.map((l) => `<tr>
          <td>${dataBr(l.data)}</td><td>${esc(l.historico)}</td>
          <td class="num">${moeda(l.valor)}</td></tr>`).join("")}
      </tbody></table></div>

      <h3 style="font-size:13px;margin:18px 0 7px">Fatura sugerida <span class="rf">RF-14</span></h3>
      <div class="bloco" style="box-shadow:none">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <strong>${esc(fatura.id)}</strong> · ${esc(fatura.cliente)}
            <span class="origem" style="margin:0">${esc(fatura.tms)} · vence ${dataBr(fatura.vencimento)}</span>
          </div>
          <span class="valor valor--grande">R$ ${moeda(fatura.valor)}</span>
        </div>
        <p class="bloco__apoio" style="margin:10px 0 0">
          ${(fatura.pagamentos || []).map((p) => `${moeda(p.valor)} (${dataBr(p.data)})`).join(" + ")}
          = <strong>${moeda(soma)}</strong>, exatamente o valor da fatura.
        </p>
      </div>

      ${fatura.situacao === "liquidada"
        ? '<div class="nota"><strong>Já liquidada</strong>A baixa existe no TMS e os dois dias conciliam.</div>'
        : `<div class="linha-botoes" style="margin-top:16px">
             <button class="botao botao--principal" data-liquidar="${esc(fatura.id)}">Liquidar no ${esc(fatura.tms)}</button>
             <button class="botao" data-acao="fechar-gaveta">Agora não</button>
           </div>
           <p class="bloco__apoio" style="margin-top:10px">A baixa é gravada no TMS com a sua identificação, e o sistema relê para confirmar.</p>`}
    `);
  }

  async function liquidarFatura(id) {
    const fatura = estado.receber.find((f) => f.id === id);
    if (!fatura || fatura.situacao === "liquidada") return;

    const ok = await gravarNoTms({
      titulo: "Liquidar a fatura " + fatura.id,
      detalhe: `R$ ${moeda(fatura.valor)} de ${fatura.cliente}, pagos em ${(fatura.pagamentos || []).length} PIX avulsos.`,
      tms: fatura.tms,
      acao: "Liquidar fatura",
      alvo: fatura.id,
    }, () => {
      fatura.situacao = "liquidada";
      estado.dias.forEach((d) => {
        if (d.diferenca !== 0) { d.sistemas = d.banco; d.diferenca = 0; }
      });
      estado.extrato.forEach((l) => { if (l.semPar) { l.conciliado = true; delete l.semPar; } });
    });

    if (ok) {
      fecharGaveta();
      aviso("Os dois dias conciliam", "Sem ninguém abrir o TMS.", "ok");
    }
  }

  // ── a pagar ──────────────────────────────────────────────────────────────
  function telaPagar() {
    const lista = daFilial(estado.pagar);
    const sel = estado.selecionados;
    const somaSel = lista.filter((f) => sel.includes(f.id)).reduce((s, f) => s + f.valor, 0);
    const tmss = new Set(lista.filter((f) => sel.includes(f.id)).map((f) => f.tms));

    return topo("A pagar",
      'A fatura do parceiro vira pagamento <span class="destaque">sem digitação</span>',
      "Painel único dos dois TMSs. Selecione vários, escolha a ação, confirme uma vez — e o sistema grava item a item, no TMS de origem de cada um.") +

    `<div class="bloco" style="margin-bottom:16px">
      <p class="bloco__titulo">Pendentes dos dois TMSs <span class="rf">RF-20</span> <span class="rf">RF-29</span></p>
      <p class="bloco__apoio">${lista.length} lançamento(s)${perfil().filial ? " · só a filial " + perfil().filial : ""}.</p>
      <div class="tabela-caixa"><table>
        <thead><tr>
          <th style="width:34px">${opera("pagar") ? '<input type="checkbox" data-todos>' : ""}</th>
          <th>Favorecido</th><th>TMS</th><th>Natureza</th><th>Filial</th><th>Venc.</th><th class="num">Valor</th><th></th>
        </tr></thead>
        <tbody>${lista.map((f) => `
          <tr>
            <td>${opera("pagar") ? `<input type="checkbox" data-sel="${esc(f.id)}" ${sel.includes(f.id) ? "checked" : ""}>` : ""}</td>
            <td><strong>${esc(f.favorecido)}</strong><span class="origem" style="margin:0">${esc(f.cnpj)}</span></td>
            <td><span class="pilula pilula--neutro">${esc(f.tms)}</span></td>
            <td>${esc(f.natureza)}</td>
            <td>${esc(f.filial)}</td>
            <td>${dataBr(f.vencimento)}</td>
            <td class="num">${moeda(f.valor)}</td>
            <td>${f.situacao === "liquidada"
              ? '<span class="pilula pilula--ok">liquidada</span>'
              : f.situacao === "recusada"
                ? '<span class="pilula pilula--erro">recusada</span>'
                : '<span class="pilula pilula--alerta">pendente</span>'}</td>
          </tr>`).join("")}
        </tbody></table></div>

      ${opera("pagar") ? `
        <div class="barra-lote">
          <span class="valor">${sel.length}</span> selecionado(s)
          <span class="valor">R$ ${moeda(somaSel)}</span>
          <span class="origem" style="margin:0">${tmss.size || 0} TMS(s)</span>
          <span style="flex:1"></span>
          <button class="botao botao--principal" data-lote="liquidar" ${sel.length ? "" : "disabled"}>Liquidar</button>
          <button class="botao" data-lote="banco" ${sel.length ? "" : "disabled"}>Trocar banco</button>
          <button class="botao" data-lote="natureza" ${sel.length ? "" : "disabled"}>Natureza</button>
          <button class="botao" data-lote="vencimento" ${sel.length ? "" : "disabled"}>Vencimento</button>
          <button class="botao" data-lote="aprovar" ${sel.length ? "" : "disabled"}>Aprovar</button>
        </div>` : `
        <div class="nota"><strong>Você está vendo, não operando</strong>
        O perfil ${esc(perfil().nome)} não tem a ação de liquidar neste módulo.</div>`}
    </div>

    <h2 style="font-size:17px;margin:22px 0 4px">Esteira da fatura do parceiro</h2>
    <p class="tela__apoio" style="margin-bottom:14px">
      Nada é lançado no TMS sem passar por todas as etapas. Falhou em qualquer conferência, vira pendência — com o item, o documento e a diferença.
    </p>
    ${estado.esteira.map((f) => esteiraHtml(f)).join("")}`;
  }

  function esteiraHtml(f) {
    const falha = Boolean(f.divergencia);
    const etapas = [
      { n: 1, nome: "Recebe", itens: ["lê o e-mail e os anexos", "identifica pelo CNPJ", "barra fatura já recebida"], estado: "feita" },
      { n: 2, nome: "Confere documentos", itens: ["fatura, XML e boleto presentes", "emissor = parceiro", "soma = valor da fatura"], estado: "feita" },
      { n: 3, nome: "Confere tarifário", itens: falha
          ? [`${f.divergencia.item}: cobrado ${moeda(f.divergencia.cobrado)}`, `combinado ${moeda(f.divergencia.combinado)}`, `diferença ${moeda(f.divergencia.cobrado - f.divergencia.combinado)}`]
          : ["cada CTRC existe no TMS", "valor × preço combinado", "diferença zero"],
        estado: falha ? "falhou" : "feita", falhou: falha },
      { n: 4, nome: "Lança no TMS", itens: ["lançamento a pagar", "anexos junto", "documentos vinculados"], estado: falha ? "espera" : (f.lancada ? "feita" : "atual") },
      { n: 5, nome: "Autoriza", itens: ["quem aprova vê a conferência", "quem montou não aprova"], estado: f.autorizada ? "feita" : "espera" },
      { n: 6, nome: "Paga e liquida", itens: ["remessa e retorno", "liquida na origem", "extrato concilia"], estado: "espera" },
    ];

    return `<div class="bloco" style="margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <p class="bloco__titulo" style="margin:0">Fatura ${esc(f.id)} · ${esc(f.parceiro)}</p>
          <span class="origem" style="margin:0">${esc(f.cnpj)} · ${esc(f.tms)} · ${f.itens} itens · chegou por e-mail</span>
        </div>
        <span class="valor valor--grande">R$ ${moeda(f.valor)}</span>
        ${falha
          ? '<span class="pilula pilula--erro">pendência na etapa 3</span>'
          : f.lancada ? '<span class="pilula pilula--ok">lançada no TMS</span>'
            : '<span class="pilula pilula--novo">pronta para lançar</span>'}
      </div>

      <div class="esteira">${etapas.map((e) => `
        <div class="etapa etapa--${e.estado}">
          <div class="etapa__n">${e.n}</div>
          <div class="etapa__nome">${esc(e.nome)}</div>
          <ul class="etapa__itens">${e.itens.map((i) => `<li class="${e.falhou ? "falha" : ""}">${esc(i)}</li>`).join("")}</ul>
        </div>`).join("")}
      </div>

      ${falha
        ? `<div class="nota nota--erro" style="margin-bottom:0">
             <strong>Nada foi lançado no TMS</strong>
             A diferença é de ${moeda(f.divergencia.cobrado - f.divergencia.combinado)} no ${esc(f.divergencia.item)}.
             A fatura fica como pendência até alguém resolver com o parceiro.
           </div>`
        : f.lancada ? "" : `<div class="linha-botoes" style="margin-top:12px">
             <button class="botao botao--principal" data-esteira="${esc(f.id)}">Lançar no ${esc(f.tms)}</button>
           </div>`}
    </div>`;
  }

  /** Lote: uma confirmação, gravação item a item, resultado individual. */
  async function loteLiquidar() {
    const sel = estado.selecionados;
    const itens = daFilial(estado.pagar).filter((f) => sel.includes(f.id));
    if (!itens.length) return;
    const soma = itens.reduce((s, f) => s + f.valor, 0);
    const tmss = [...new Set(itens.map((f) => f.tms))];

    const ok = await confirmar({
      titulo: "Liquidar " + itens.length + " lançamento(s)",
      corpo: `
        <div class="lista-chave">
          <dt>Itens</dt><dd>${itens.length}</dd>
          <dt>Valor</dt><dd class="valor">R$ ${moeda(soma)}</dd>
          <dt>TMSs</dt><dd>${tmss.map(esc).join(", ")}</dd>
        </div>
        <div class="nota">
          <strong>Uma confirmação, cada item no seu TMS</strong>
          A gravação é item a item, no TMS de origem de cada um. Falha em um não impede os outros,
          e cada item devolve o seu resultado.
        </div>`,
      confirmar: "Confirmar e gravar",
    });
    if (!ok) return;

    aviso("Gravando " + itens.length + " itens…", "Item a item, no TMS de origem.");
    const resultados = [];
    for (const f of itens) {
      await espera(260);
      // Um item recusa de propósito: é o caso que o cliente precisa ver.
      const recusa = f.favorecido.startsWith("Telefonia");
      f.situacao = recusa ? "recusada" : "liquidada";
      resultados.push({ f, recusa });
      registrar(recusa ? "Liquidação recusada" : "Liquidar em lote", f.id,
        `${f.favorecido} · R$ ${moeda(f.valor)} · ${f.tms}` + (recusa ? " · favorecido sem conta cadastrada" : ""));
    }
    estado.selecionados = [];
    salvar();
    desenhar();

    const falhas = resultados.filter((x) => x.recusa);
    abrirGaveta("Resultado, item a item", `
      <p class="bloco__apoio">${resultados.length - falhas.length} de ${resultados.length} gravados.
      ${falhas.length ? "O que falhou volta com o motivo — e não impediu os demais." : ""}</p>
      <div class="tabela-caixa"><table>
        <thead><tr><th>Item</th><th>TMS</th><th class="num">Valor</th><th>Resultado</th></tr></thead>
        <tbody>${resultados.map(({ f, recusa }) => `
          <tr><td>${esc(f.favorecido)}</td><td>${esc(f.tms)}</td>
            <td class="num">${moeda(f.valor)}</td>
            <td>${recusa
              ? '<span class="pilula pilula--erro">recusado</span><span class="origem" style="margin:0">favorecido sem conta cadastrada</span>'
              : '<span class="pilula pilula--ok">feito</span>'}</td></tr>`).join("")}
        </tbody></table></div>`);
  }

  // ── a receber ────────────────────────────────────────────────────────────
  function telaReceber() {
    const lista = daFilial(estado.receber);
    return topo("Faturamento / A receber",
      'Três portas de entrada, <span class="destaque">um só lugar de chegada</span>',
      "Retorno de cobrança, PIX identificado e ACNI assistida terminam no mesmo ponto: baixa no TMS mais conciliação.") +

    `<div class="grade grade--3" style="margin-bottom:16px">
      ${[
        ["Retorno de cobrança", "boleto registrado · arquivo processado pelo app", "RF-31"],
        ["PIX ou TED identificado", "QR dinâmico ligado ao documento · pagador ↔ cliente", "RF-32"],
        ["ACNI assistida", "o app sugere o documento, a pessoa confirma", "RF-33"],
      ].map(([t, a, rf]) => `
        <div class="bloco">
          <p class="bloco__titulo">${esc(t)} <span class="rf">${rf}</span></p>
          <p class="bloco__apoio" style="margin:0">${esc(a)}</p>
          <div class="linha-botoes" style="margin-top:11px">
            <button class="botao botao--pequeno" data-demo="porta">Simular entrada</button>
          </div>
        </div>`).join("")}
    </div>

    <div class="bloco">
      <p class="bloco__titulo">Faturas em aberto <span class="rf">RF-30</span></p>
      <p class="bloco__apoio">Clique numa linha para abrir a ficha completa do documento.</p>
      <div class="tabela-caixa"><table>
        <thead><tr><th>Fatura</th><th>Cliente</th><th>TMS</th><th>Venc.</th><th>Cobrança</th><th class="num">Valor</th><th>Situação</th></tr></thead>
        <tbody>${lista.map((f) => `
          <tr class="clicavel" data-ficha="${esc(f.id)}">
            <td><strong>${esc(f.id)}</strong></td>
            <td>${esc(f.cliente)}${f.protestos ? ' <span class="pilula pilula--erro">protesto</span>' : ""}</td>
            <td><span class="pilula pilula--neutro">${esc(f.tms)}</span></td>
            <td>${dataBr(f.vencimento)}</td>
            <td><span class="origem" style="margin:0">${esc(f.cobranca)}</span></td>
            <td class="num">${moeda(f.valor)}</td>
            <td>${f.situacao === "liquidada" ? '<span class="pilula pilula--ok">liquidada</span>'
              : f.situacao === "vencida" ? '<span class="pilula pilula--erro">vencida</span>'
              : '<span class="pilula pilula--alerta">em aberto</span>'}</td>
          </tr>`).join("")}
        </tbody></table></div>
    </div>

    <div class="bloco" style="margin-top:14px">
      <p class="bloco__titulo">Régua de cobrança <span class="rf">RF-35</span></p>
      <p class="bloco__apoio">Sai do próprio sistema, sem planilha paralela e sem caixa de entrada pessoal.</p>
      <div class="tabela-caixa"><table>
        <thead><tr><th>Momento</th><th>O que sai</th><th>Canal</th></tr></thead>
        <tbody>
          <tr><td>3 dias antes</td><td>lembrete com boleto e PIX</td><td>e-mail</td></tr>
          <tr><td>no vencimento</td><td>aviso de vencimento hoje</td><td>e-mail</td></tr>
          <tr><td>3 dias depois</td><td>cobrança com segunda via</td><td>e-mail</td></tr>
          <tr><td>10 dias depois</td><td>aviso de negativação</td><td>e-mail + ligação</td></tr>
          <tr><td>30 dias depois</td><td>encaminhamento a protesto</td><td>decisão manual</td></tr>
        </tbody></table></div>
    </div>`;
  }

  /** A ficha única: cliente, pagamentos, conciliação e cobrança numa tela. */
  function abrirFicha(id) {
    const f = estado.receber.find((x) => x.id === id);
    if (!f) return;
    const pagos = (f.pagamentos || []).reduce((s, p) => s + p.valor, 0);

    abrirGaveta("Fatura " + f.id, `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px">
        <div>
          <span class="pilula pilula--neutro">${esc(f.tms)}</span>
          <div style="font-weight:700;font-size:15px;margin-top:6px">${esc(f.cliente)}</div>
          <span class="origem" style="margin:0">${esc(f.cnpj)} · filial ${esc(f.filial)}</span>
        </div>
        <span class="valor valor--grande">R$ ${moeda(f.valor)}</span>
      </div>

      <h3 style="font-size:12px;margin:16px 0 6px">Cliente</h3>
      <dl class="lista-chave">
        <dt>Contatos</dt><dd>financeiro@exemplo.com.br · (31) 0000-0000</dd>
        <dt>Protestos</dt><dd>${f.protestos ? `<span class="pilula pilula--erro">${f.protestos} registro</span>` : "nenhum"}</dd>
      </dl>

      <h3 style="font-size:12px;margin:16px 0 6px">Pagamentos</h3>
      ${(f.pagamentos || []).length
        ? `<div class="tabela-caixa"><table><tbody>${f.pagamentos.map((p) => `
            <tr><td>${dataBr(p.data)}</td><td>${esc(p.meio)}</td><td class="num">${moeda(p.valor)}</td></tr>`).join("")}
           </tbody></table></div><p class="bloco__apoio" style="margin-top:6px">Total pago: ${moeda(pagos)}</p>`
        : '<p class="bloco__apoio">Nenhum pagamento identificado.</p>'}

      <h3 style="font-size:12px;margin:16px 0 6px">Conciliação</h3>
      <p class="bloco__apoio">${f.situacao === "liquidada"
        ? "Os dias que recebiam estes valores conciliam."
        : "Enquanto a fatura não é liquidada, os dias do extrato ficam divergentes."}</p>

      <h3 style="font-size:12px;margin:16px 0 6px">Cobrança</h3>
      <p class="bloco__apoio">${esc(f.cobranca)} · e-mails enviados pela régua · anexos disponíveis</p>

      <div class="nota" style="margin-top:18px">
        <strong>Editar grava no TMS <span class="rf">RF-04</span></strong>
        Mudar o vencimento aqui escreve no ${esc(f.tms)}, relê para confirmar e registra na auditoria.
      </div>
      <div class="linha-botoes">
        <button class="botao botao--principal" data-vencimento="${esc(f.id)}">Editar vencimento</button>
      </div>
    `);
  }

  async function editarVencimento(id) {
    const f = estado.receber.find((x) => x.id === id);
    await gravarNoTms({
      titulo: "Editar vencimento da fatura " + f.id,
      detalhe: `Vencimento de ${dataBr(f.vencimento)} para 15/01.`,
      tms: f.tms,
      acao: "Editar vencimento",
      alvo: f.id,
      conflito: true,     // a primeira edição da sessão demonstra a RN-03
    }, () => { f.vencimento = "2026-01-15"; });
    if (!$("#gaveta").hidden) abrirFicha(id);
  }

  // ── fiscal ───────────────────────────────────────────────────────────────
  let abaFiscal = "entrada";
  function telaFiscal() {
    const porAba = {
      entrada: estado.notas,
      conferencia: estado.notas.filter((n) => n.situacao === "a conferir"),
      vinculo: estado.notas.filter((n) => n.vinculo),
      fechamento: estado.notas.filter((n) => n.situacao === "conferida"),
    };
    const lista = porAba[abaFiscal] || [];

    return topo("Fiscal",
      'Igual ou mais completo que hoje, <span class="destaque">com a nota chegando sozinha</span>',
      "A captura é automática. O que continua manual é o julgamento — e isso é deliberado.") +

    `<div class="abas">
      ${[["entrada", "Entrada"], ["conferencia", "Conferência"], ["vinculo", "Vínculo"], ["fechamento", "Fechamento"]]
        .map(([id, nome]) => `<button class="aba" role="tab" aria-selected="${abaFiscal === id}" data-aba="${id}">${nome} (${porAba[id].length})</button>`).join("")}
    </div>

    <div class="grade grade--12">
      <div class="bloco">
        <p class="bloco__titulo">Notas <span class="rf">RF-38</span> <span class="rf">RF-39</span></p>
        <div class="tabela-caixa"><table>
          <thead><tr><th>Tipo</th><th>Emitente</th><th>Chave</th><th class="num">Valor</th><th>Situação</th><th>Vínculo</th></tr></thead>
          <tbody>${lista.map((n) => `
            <tr><td><span class="pilula pilula--neutro">${esc(n.tipo)}</span></td>
              <td>${esc(n.emitente)}</td>
              <td><span class="origem" style="margin:0">…${esc(n.chave.slice(-10))}</span></td>
              <td class="num">${moeda(n.valor)}</td>
              <td>${n.situacao === "conferida"
                ? '<span class="pilula pilula--ok">conferida</span>'
                : '<span class="pilula pilula--alerta">a conferir</span>'}</td>
              <td>${n.vinculo ? esc(n.vinculo) : "—"}</td></tr>`).join("") || '<tr><td colspan="6" class="vazio">Nada nesta aba.</td></tr>'}
          </tbody></table></div>
      </div>

      <div>
        <div class="bloco" style="margin-bottom:14px">
          <p class="bloco__titulo">O que já funciona</p>
          <ul class="etapa__itens" style="font-size:12.5px">
            <li>NFS-e capturada de madrugada, nos CNPJs da operação</li>
            <li>NF-e pela chave e CT-e do TMS</li>
            <li>“Aproveita créditos?” continua manual — é julgamento, não regra</li>
            <li>Só nota conferida cobre pagamento</li>
          </ul>
        </div>
        <div class="bloco">
          <p class="bloco__titulo">O que entra <span class="rf">RF-41</span> <span class="rf">RF-42</span></p>
          <p class="bloco__apoio">Relatórios de faturamento e o lote para a contabilidade — hoje baixado documento por documento.</p>
          <div class="linha-botoes">
            <button class="botao botao--pequeno" data-demo="relatorio">Relatório de faturamento</button>
            <button class="botao botao--pequeno botao--principal" data-demo="zip">Baixar lote ZIP</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  // ── gerência ─────────────────────────────────────────────────────────────
  function telaGerencia() {
    return topo("Gerência",
      'Cada número <span class="destaque">com origem</span>',
      "Os dashboards já existem. O que muda é que cada número passa a dizer de onde veio e a que horas foi lido.") +

    `<div class="grade grade--3">
      ${[
        ["Custo por quilômetro", "R$ 3,41", "rateio de custos · últimos 3 meses"],
        ["Ticket médio do frete", "R$ 1.284,00", "faturas emitidas · janeiro"],
        ["Prazo médio de recebimento", "27 dias", "baixas × emissão · últimos 90 dias"],
        ["Faturas em aberto", "R$ 184.320,00", "TMSs · lido no último cron"],
        ["Inadimplência (a receber)", "4,8%", "vencidas ÷ em aberto · só a receber"],
        ["Tarifas bancárias no mês", "R$ 2.740,15", "extratos · lido às 06:10"],
      ].map(([t, v, o]) => `
        <div class="bloco">
          <p class="bloco__titulo">${esc(t)}</p>
          <span class="valor valor--grande">${esc(v)}</span>
          <span class="origem">${esc(o)}</span>
        </div>`).join("")}
    </div>`;
  }

  // ── importar extrato ─────────────────────────────────────────────────────
  function telaImportar() {
    return topo("Importar extrato",
      'Cada banco entrega de um jeito — <span class="destaque">e o sistema sabe de qual</span>',
      "A leitura é definida por fonte, nunca pela extensão do arquivo. Duas contas abaixo entregam OFX com separador decimal diferente.") +

    `<div class="bloco" style="margin-bottom:16px">
      <p class="bloco__titulo">Como cada fonte é lida <span class="rf">RF-49</span></p>
      <p class="bloco__apoio">É esta tabela que impede valor multiplicado ou dividido por cem em silêncio.</p>
      <div class="tabela-caixa"><table>
        <thead><tr><th>Fonte</th><th>Entrada</th><th>Formato</th><th>Decimal</th><th>Data</th><th>Sinal</th><th>Identificador</th></tr></thead>
        <tbody>${D.FONTES.map((f) => `
          <tr><td><strong>${esc(f.banco)}</strong> · ${esc(f.conta)}</td>
            <td>${esc(f.via)}</td>
            <td>${esc(f.formato)}</td>
            <td>${f.decimal === "ponto"
              ? '<span class="pilula pilula--novo">ponto</span>'
              : '<span class="pilula pilula--neutro">vírgula</span>'}</td>
            <td><span class="origem" style="margin:0">${esc(f.data)}</span></td>
            <td>${esc(f.sinal)}</td>
            <td>${f.identificador === "não traz"
              ? '<span class="pilula pilula--alerta">não traz</span>'
              : esc(f.identificador)}</td></tr>`).join("")}
        </tbody></table></div>
      <div class="nota" style="margin-bottom:0">
        <strong>Por que isso é uma tabela, e não uma suposição</strong>
        Bradesco e Caixa entregam o extrato no mesmo formato de arquivo, com separador decimal
        diferente. Lidos com a mesma regra, os valores saem cem vezes maiores ou menores — e o erro
        só apareceria na conciliação, dias depois.
      </div>
    </div>

    <div class="grade grade--2">
      <div class="bloco">
        <p class="bloco__titulo">Importar um arquivo</p>
        <p class="bloco__apoio">Escolha a conta e o caso a simular. Nenhum arquivo é enviado a lugar nenhum.</p>
        <label class="campo-rotulo" for="imp-fonte" style="color:var(--cinza-texto)">Conta</label>
        <select id="imp-fonte" class="select" style="background:var(--superficie);color:var(--tinta);border-color:var(--borda-forte);margin-bottom:10px">
          ${D.FONTES.map((f) => `<option value="${esc(f.id)}">${esc(f.banco)} · ${esc(f.conta)} (${esc(f.formato)})</option>`).join("")}
        </select>
        <div class="linha-botoes">
          <button class="botao botao--principal" data-import="ok">Arquivo íntegro</button>
          <button class="botao" data-import="truncado">Arquivo truncado</button>
          <button class="botao" data-import="repetido">Mesmo período de novo</button>
        </div>
      </div>

      <div class="bloco">
        <p class="bloco__titulo">As regras que a importação aplica</p>
        <ul class="etapa__itens" style="font-size:12.5px">
          <li>linha de saldo é lida para conferência, não entra como lançamento</li>
          <li>saldo anterior + lançamentos tem de dar o saldo final</li>
          <li>não fechando, o arquivo é recusado inteiro</li>
          <li>reimportar o mesmo período não duplica</li>
          <li>data sem fuso é lida como data de Brasília</li>
          <li>a codificação é detectada, não presumida</li>
        </ul>
      </div>
    </div>`;
  }

  async function importar(caso) {
    const fonte = D.FONTES.find((f) => f.id === $("#imp-fonte").value);
    const qtd = 118 + Math.floor(Math.random() * 40);

    if (caso === "truncado") {
      await confirmar({
        titulo: "Arquivo recusado",
        corpo: `
          <div class="nota nota--erro">
            <strong>O saldo não fecha</strong>
            Saldo anterior mais a soma dos lançamentos dá R$ ${moeda(fonte.saldo - 4120.55)},
            e o arquivo declara saldo final de R$ ${moeda(fonte.saldo)}.
            Diferença de R$ ${moeda(4120.55)}.
          </div>
          <p>Nenhum lançamento foi importado. O arquivo é recusado <strong>inteiro</strong>:
          importar metade de um extrato produz uma conciliação que parece certa e não é.</p>`,
        confirmar: "Entendi",
        cancelar: "Fechar",
      });
      registrar("Importação recusada", fonte.banco + " · " + fonte.conta, "saldo não fechou");
      return;
    }

    if (caso === "repetido") {
      aviso("Nada duplicado", `${qtd} lançamentos já existiam; nenhum foi criado.`, "ok");
      registrar("Importação sem efeito", fonte.banco + " · " + fonte.conta,
        fonte.identificador === "não traz"
          ? "deduplicado por data, valor, documento e histórico"
          : "deduplicado por " + fonte.identificador);
      return;
    }

    aviso("Lendo o arquivo…", `${fonte.formato} · decimal com ${fonte.decimal} · ${fonte.sinal}`);
    await espera(700);
    aviso("Saldo confere", `Saldo anterior + lançamentos = saldo final.`, "ok");
    await espera(400);
    aviso(qtd + " lançamentos importados", "2 linhas de saldo foram lidas para conferência e não viraram movimento.", "ok");
    registrar("Importar extrato", fonte.banco + " · " + fonte.conta, qtd + " lançamentos · saldo conferido");
  }

  // ── usuários e permissões ────────────────────────────────────────────────
  function telaUsuarios() {
    const simbolo = { opera: "●", ve: "○", aprova: "◆", nao: "—" };
    return topo("Usuários e permissões",
      'Permissão por <span class="destaque">ação</span>, em cada módulo, filial e conta',
      "Troque o perfil na barra lateral: o menu e as telas mudam de verdade. É assim que o recorte se demonstra.") +

    `<div class="bloco" style="margin-bottom:14px">
      <p class="bloco__titulo">Matriz de permissões <span class="rf">RF-43</span></p>
      <p class="bloco__apoio">● opera · ○ só vê · ◆ aprova · — sem acesso</p>
      <div class="tabela-caixa"><table>
        <thead><tr><th>Perfil</th>${D.MODULOS.map((m) => `<th>${esc(m.nome)}</th>`).join("")}</tr></thead>
        <tbody>${D.PERFIS.map((p) => `
          <tr class="${p.id === estado.perfil ? "diverge" : ""}">
            <td><strong>${esc(p.nome)}</strong><span class="origem" style="margin:0">${esc(p.pessoa)}${p.filial ? " · só " + p.filial : ""}</span></td>
            ${D.MODULOS.map((m) => `<td style="text-align:center;font-size:15px;color:${
              p.perm[m.id] === "aprova" ? "var(--laranja)" : p.perm[m.id] === "nao" ? "var(--cinza)" : "var(--tinta)"
            }">${simbolo[p.perm[m.id]]}</td>`).join("")}
          </tr>`).join("")}
        </tbody></table></div>
    </div>

    <div class="grade grade--2">
      <div class="bloco">
        <p class="bloco__titulo">Ações controladas</p>
        <p class="bloco__apoio">Permissão é por ação, não por tela inteira.</p>
        <div class="linha-botoes">${D.ACOES_PERM.map((a) => `<span class="pilula pilula--neutro">${esc(a)}</span>`).join("")}</div>
      </div>
      <div class="bloco">
        <p class="bloco__titulo">Recorte por filial <span class="rf">RF-44</span></p>
        <div class="nota" style="margin-top:0">
          <strong>Vale também na exportação</strong>
          Exportação que ignora o recorte anula o recorte inteiro. É o furo mais comum
          desse tipo de controle — por isso ele é aplicado no dado, não na tela.
        </div>
        <p class="bloco__apoio" style="margin:0">Experimente: escolha <strong>Gestor de filial</strong> na barra lateral.
        A filial trava em BHZ e todas as listas passam a mostrar só ela.</p>
      </div>
    </div>`;
  }

  // ── sem permissão ────────────────────────────────────────────────────────
  function telaSemAcesso(modulo) {
    const m = D.MODULOS.find((x) => x.id === modulo);
    return `<div class="bloco" style="max-width:620px;margin:40px auto;text-align:center">
      <p class="tela__etiqueta">Acesso negado</p>
      <h1 class="tela__titulo" style="font-size:21px">${esc(m ? m.nome : modulo)}</h1>
      <p class="tela__apoio" style="margin:0 auto 14px">
        O perfil <strong>${esc(perfil().nome)}</strong> não tem acesso a este módulo.
        Isso não é um aviso de tela: o recorte vale no dado.
      </p>
      <button class="botao botao--principal" data-ir="caixa">Voltar ao início</button>
    </div>`;
  }

  // ── auditoria ────────────────────────────────────────────────────────────
  function abrirAuditoria() {
    abrirGaveta("Trilha de auditoria", `
      <p class="bloco__apoio">Tudo que você fez nesta demonstração, com quem e quando.
      No sistema de verdade a trilha é capturada no banco, por gatilho — assim ela pega
      todo caminho de escrita, e não só os previstos.</p>
      ${estado.auditoria.length ? `<div class="tabela-caixa"><table>
        <thead><tr><th>Hora</th><th>Quem</th><th>Ação</th><th>Alvo</th></tr></thead>
        <tbody>${estado.auditoria.map((a) => `
          <tr><td>${esc(a.hora)}</td>
            <td>${esc(a.quem)}<span class="origem" style="margin:0">${esc(a.papel)}</span></td>
            <td>${esc(a.acao)}<span class="origem" style="margin:0">${esc(a.detalhe || "")}</span></td>
            <td>${esc(a.alvo)}</td></tr>`).join("")}
        </tbody></table></div>`
        : '<p class="vazio">Nada ainda. Liquide uma fatura ou importe um extrato.</p>'}`);
  }

  // ── busca global ─────────────────────────────────────────────────────────
  function buscar(termo) {
    const t = termo.trim().toLowerCase();
    const caixa = $("#paleta-resultados");
    if (!t) {
      caixa.innerHTML = `<div class="paleta__grupo">Pedidos do dia a dia</div>` +
        D.PEDIDOS.map((p) => `<button class="paleta__item" data-pedido="${esc(p)}">${esc(p)}</button>`).join("");
      return;
    }
    const bate = (s) => String(s).toLowerCase().includes(t);
    const fat = estado.receber.filter((f) => bate(f.id) || bate(f.cliente) || bate(f.cnpj) || bate(f.valor)).slice(0, 5);
    const ap = estado.pagar.filter((f) => bate(f.id) || bate(f.favorecido) || bate(f.cnpj) || bate(f.valor)).slice(0, 5);
    const nf = estado.notas.filter((n) => bate(n.chave) || bate(n.emitente)).slice(0, 4);

    const grupo = (titulo, itens) => itens.length
      ? `<div class="paleta__grupo">${titulo}</div>` + itens.join("") : "";

    caixa.innerHTML =
      grupo("Faturas a receber", fat.map((f) => `
        <button class="paleta__item" data-ficha="${esc(f.id)}">
          <span><strong>${esc(f.id)}</strong><br><small>${esc(f.cliente)} · ${esc(f.tms)}</small></span>
          <span class="valor">${moeda(f.valor)}</span></button>`)) +
      grupo("A pagar", ap.map((f) => `
        <button class="paleta__item" data-ir="pagar">
          <span><strong>${esc(f.id)}</strong><br><small>${esc(f.favorecido)} · ${esc(f.tms)}</small></span>
          <span class="valor">${moeda(f.valor)}</span></button>`)) +
      grupo("Notas fiscais", nf.map((n) => `
        <button class="paleta__item" data-ir="fiscal">
          <span><strong>${esc(n.tipo)}</strong><br><small>${esc(n.emitente)} · …${esc(n.chave.slice(-8))}</small></span>
          <span class="valor">${moeda(n.valor)}</span></button>`)) ||
      '<div class="vazio">Nada encontrado para “' + esc(termo) + '”.</div>';
  }

  const abrirBusca = () => {
    $("#paleta").hidden = false;
    $("#paleta-campo").value = "";
    buscar("");
    $("#paleta-campo").focus();
  };
  const fecharBusca = () => { $("#paleta").hidden = true; };

  // ── desenho geral ────────────────────────────────────────────────────────
  const TELAS = {
    caixa: telaCaixa, conciliacao: telaConciliacao, pagar: telaPagar,
    receber: telaReceber, fiscal: telaFiscal, gerencia: telaGerencia,
    importar: telaImportar, usuarios: telaUsuarios,
  };

  function rota() {
    const r = location.hash.replace(/^#\/?/, "") || "caixa";
    return TELAS[r] ? r : "caixa";
  }

  function desenhar() {
    const p = perfil();
    const atual = rota();

    // menu
    $("#menu").innerHTML = D.MODULOS.map((m) => {
      const livre = p.perm[m.id] !== "nao";
      return `<button class="menu__item" ${atual === m.id ? 'aria-current="page"' : ""}
        ${livre ? "" : "disabled"} data-ir="${m.id}">
        ${icone(m.icone)}<span>${esc(m.nome)}</span>
        ${m.id === "caixa" ? '<span class="menu__etiqueta">1ª guia</span>' : ""}
      </button>`;
    }).join("");

    // perfil e filial
    const sel = $("#troca-perfil");
    if (sel.options.length !== D.PERFIS.length) {
      sel.innerHTML = D.PERFIS.map((x) => `<option value="${x.id}">${esc(x.nome)}</option>`).join("");
    }
    sel.value = estado.perfil;
    $("#dica-perfil").textContent = p.filial
      ? `Travado na filial ${p.filial}. Listas, painéis e exportações mostram só ela.`
      : "Vê todas as filiais permitidas pelo seletor acima.";

    const selF = $("#troca-filial");
    if (selF.options.length !== D.FILIAIS.length + 1) {
      selF.innerHTML = '<option value="todas">Todas</option>' +
        D.FILIAIS.map((f) => `<option value="${f.id}">${esc(f.nome)}</option>`).join("");
    }
    selF.value = p.filial || estado.filial;
    selF.disabled = Boolean(p.filial);

    $("#usuario").innerHTML = `
      <div class="usuario__sigla">${esc(p.sigla)}</div>
      <div><div class="usuario__nome">${esc(p.pessoa)}</div><div class="usuario__papel">${esc(p.nome)}</div></div>`;
    $("#selo-auditoria").textContent = estado.auditoria.length;

    $("#principal").innerHTML = p.perm[atual] === "nao" ? telaSemAcesso(atual) : TELAS[atual]();
    document.title = "SatiFlow · " + (D.MODULOS.find((m) => m.id === atual)?.nome || "protótipo");
  }

  // ── eventos ──────────────────────────────────────────────────────────────
  document.addEventListener("click", async (e) => {
    const alvo = (nome) => e.target.closest("[data-" + nome + "]");

    const ir = alvo("ir");
    if (ir && !ir.disabled) { location.hash = "/" + ir.dataset.ir; fecharBusca(); fecharGaveta(); return; }

    if (alvo("acao")) {
      const a = alvo("acao").dataset.acao;
      if (a === "fechar-gaveta") return fecharGaveta();
      if (a === "fechar-modal") return;
      if (a === "abrir-busca") return abrirBusca();
      if (a === "fechar-busca") return fecharBusca();
      if (a === "abrir-auditoria") return abrirAuditoria();
      if (a === "reiniciar") {
        if (await confirmar({
          titulo: "Reiniciar a demonstração",
          corpo: "<p>Tudo volta ao estado inicial: faturas em aberto, dias divergentes e trilha de auditoria vazia.</p>",
          confirmar: "Reiniciar",
        })) {
          estado = inicial();
          salvar();
          desenhar();
          aviso("Demonstração reiniciada", "");
        }
        return;
      }
    }

    const dia = alvo("dia");
    if (dia) return abrirDia(dia.dataset.dia);

    const liq = alvo("liquidar");
    if (liq) return liquidarFatura(liq.dataset.liquidar);

    const ficha = alvo("ficha");
    if (ficha) { fecharBusca(); return abrirFicha(ficha.dataset.ficha); }

    const venc = alvo("vencimento");
    if (venc) return editarVencimento(venc.dataset.vencimento);

    const est = alvo("esteira");
    if (est) {
      const f = estado.esteira.find((x) => x.id === est.dataset.esteira);
      return gravarNoTms({
        titulo: "Lançar a fatura " + f.id,
        detalhe: `R$ ${moeda(f.valor)} de ${f.parceiro}, com ${f.anexos.length} anexo(s) e ${f.itens} documentos vinculados.`,
        tms: f.tms, acao: "Lançar a pagar", alvo: f.id,
      }, () => { f.lancada = true; });
    }

    const lote = alvo("lote");
    if (lote) {
      if (lote.dataset.lote === "liquidar") return loteLiquidar();
      aviso("Ação de lote", "No sistema real isto abre a prévia e grava item a item.");
      return;
    }

    const aba = alvo("aba");
    if (aba) { abaFiscal = aba.dataset.aba; return desenhar(); }

    const imp = alvo("import");
    if (imp) return importar(imp.dataset.import);

    const conc = alvo("acao-conc");
    if (conc) return acaoConciliacao(conc.dataset["acaoConc"]);

    const pedido = alvo("pedido");
    if (pedido) {
      fecharBusca();
      aviso("Pedido do dia a dia", `“${pedido.dataset.pedido}” — no sistema real abre a lista já filtrada.`);
      return;
    }

    if (alvo("demo")) {
      aviso("Protótipo", "Esta ação existe no escopo e será ligada na fase correspondente.");
      return;
    }
  });

  async function acaoConciliacao(qual) {
    if (qual === "interna") {
      const ok = await confirmar({
        titulo: "Excluir transferência interna",
        corpo: `
          <p>No dia 12 há R$ 25.000,00 saindo de uma conta e entrando em outra, no mesmo valor e no mesmo dia.</p>
          <div class="nota"><strong>O sistema propõe, a pessoa decide</strong>
          A exclusão exige termo, e o lançamento excluído continua listado — some da conciliação, não do histórico.</div>`,
        confirmar: "Excluir com termo",
      });
      if (ok) {
        estado.extrato.forEach((l) => { if (l.interna) l.conciliado = true; });
        registrar("Excluir transferência interna", "12/01", "R$ 25.000,00 · com termo");
        salvar();
        aviso("Excluída da conciliação", "Continua listada no histórico.", "ok");
      }
      return;
    }
    const textos = {
      tarifas: ["Lançar tarifas no TMS", "3 tarifas com natureza, conta e departamento do banco."],
      acni: ["Identificar ACNI", "O sistema sugere o documento por valor, pagador, CNPJ e cliente."],
      anotar: ["Anotar e atribuir", "“Compensou no dia seguinte” → aguardar."],
    }[qual];
    aviso(textos[0], textos[1]);
    registrar(textos[0], "conciliação", textos[1]);
  }

  document.addEventListener("change", (e) => {
    if (e.target.id === "troca-perfil") {
      estado.perfil = e.target.value;
      estado.selecionados = [];
      const p = perfil();
      if (p.perm[rota()] === "nao") location.hash = "/" + (D.MODULOS.find((m) => p.perm[m.id] !== "nao")?.id || "caixa");
      salvar(); desenhar();
      aviso("Vendo como " + p.nome, p.filial ? "Travado na filial " + p.filial : "Todas as filiais permitidas.");
      return;
    }
    if (e.target.id === "troca-filial") { estado.filial = e.target.value; salvar(); desenhar(); return; }

    if (e.target.dataset.sel) {
      const id = e.target.dataset.sel;
      estado.selecionados = e.target.checked
        ? [...estado.selecionados, id]
        : estado.selecionados.filter((x) => x !== id);
      salvar(); desenhar(); return;
    }
    if (e.target.hasAttribute("data-todos")) {
      estado.selecionados = e.target.checked ? daFilial(estado.pagar).map((f) => f.id) : [];
      salvar(); desenhar();
    }
  });

  $("#paleta-campo").addEventListener("input", (e) => buscar(e.target.value));

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); abrirBusca(); }
    if (e.key === "Escape") { fecharBusca(); fecharGaveta(); $("#modal").hidden = true; }
  });

  window.addEventListener("hashchange", desenhar);

  if (!location.hash) location.hash = "/caixa";
  desenhar();
})();
