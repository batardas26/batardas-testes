let ctxModelo = null;
let lotesModelo = [];
let regrasModelo = [];
let familiasModelo = [];
let formatosModelo = [];

const erroModelo = (id, msg = "") => { document.getElementById(id).textContent = msg; };
const unidadeVisivel = (u) => u === "pack" ? "PCK" : String(u ?? "—").toUpperCase();
const isoLocal = (d = new Date()) => {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 16);
};

async function iniciarModelo() {
    ctxModelo = await exigirRole(["admin", "armazem", "producao", "qualidade"]);
    if (!ctxModelo) return;
    const { perfil } = ctxModelo;
    document.getElementById("nomeUtilizador").textContent = perfil.nome || perfil.nome_utilizador;
    document.getElementById("voltarModulo").href = "inicio.html";
    if (perfil.super_admin) document.querySelectorAll(".config-admin").forEach((el) => { el.style.display = ""; });
    document.getElementById("trInicio").value = isoLocal();
    document.getElementById("trFim").value = isoLocal();
    await Promise.all([carregarLotesModelo(), carregarRegrasModelo(), carregarZonasModelo(), carregarFamilias(), carregarFormatos(), carregarTransformacoes(), carregarHistoricoR3()]);
    await Promise.all([
        activarPesquisaArtigo("uaArtigoTexto", "uaArtigo", "uaArtigoResultados", carregarEstadoArtigo),
        activarPesquisaArtigo("cvArtigoTexto", "cvArtigo", "cvArtigoResultados", carregarConversoesArtigo),
        activarPesquisaArtigo("fiArtigoTexto", "fiArtigo", "fiArtigoResultados"),
        activarPesquisaArtigo("rvArtigoTexto", "rvArtigo", "rvArtigoResultados"),
        activarPesquisaArtigo("afArtigoTexto", "afArtigo", "afArtigoResultados"),
    ]);
}

const TITULOS = { transformar: "Transformar lote", rastrear: "Lotes derivados", unidades: "Unidades e conversões", formatos: "Formatos logísticos", validades: "Validades internas" };
document.querySelectorAll("button.nav-item[data-secao]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("button.nav-item[data-secao]").forEach((x) => x.classList.toggle("activo", x === b));
    document.querySelectorAll(".painel").forEach((p) => p.classList.toggle("activo", p.dataset.secao === b.dataset.secao));
    document.getElementById("tituloSecao").textContent = TITULOS[b.dataset.secao];
}));

async function carregarEstadoArtigo(artigoId) {
    const { data } = await supabaseClient.from("artigos").select("designacao, tipo_produto, unidade_stock, unidades_produto_por_stock, configuracao_unidades_confirmada").eq("artigo_id", artigoId).single();
    if (!data) return;
    document.getElementById("uaUnidade").value = data.unidade_stock ?? (data.tipo_produto === "pa" ? "pack" : "un");
    document.getElementById("uaConteudo").value = data.unidades_produto_por_stock ?? (data.tipo_produto === "pa" ? "" : 1);
    document.getElementById("estadoArtigo").innerHTML = `<p><strong>${escaparHtml(data.designacao)}</strong> · ${escaparHtml(data.tipo_produto)} · ${data.configuracao_unidades_confirmada ? `confirmado em ${unidadeVisivel(data.unidade_stock)}` : "<span style='color:var(--perigo)'>por confirmar</span>"}</p>`;
}

document.getElementById("uaUnidade").addEventListener("change", (e) => {
    if (e.target.value === "un") document.getElementById("uaConteudo").value = 1;
});

document.getElementById("btnConfirmarUnidade").addEventListener("click", async () => {
    erroModelo("erroUnidade");
    const artigoId = document.getElementById("uaArtigo").value;
    const unidade = document.getElementById("uaUnidade").value;
    const conteudo = Number(document.getElementById("uaConteudo").value);
    if (!artigoId || !conteudo) { erroModelo("erroUnidade", "Escolhe o artigo, a unidade e o conteúdo físico."); return; }
    const { error } = await supabaseClient.rpc("confirmar_unidade_stock_artigo", { p_artigo_id: artigoId, p_unidade_stock: unidade, p_unidades_produto_por_stock: conteudo });
    if (error) { erroModelo("erroUnidade", traduzirErro(error.message)); return; }
    toast(`Unidade base confirmada: ${unidadeVisivel(unidade)}.`, "sucesso");
    await carregarEstadoArtigo(artigoId); await carregarLotesModelo();
});

async function carregarConversoesArtigo(artigoId) {
    const { data } = await supabaseClient.from("conversoes_artigo").select("unidade_origem, fator_para_stock, uso, valido_desde").eq("artigo_id", artigoId).eq("ativo", true).order("uso");
    document.getElementById("listaConversoes").innerHTML = (data ?? []).map((c) => `<span class="badge" style="margin:4px;">1 ${unidadeVisivel(c.unidade_origem)} = ${c.fator_para_stock} unidades de stock · ${escaparHtml(c.uso)}</span>`).join("") || `<p style="font-size:13px;color:var(--ink-suave);">Sem conversões adicionais.</p>`;
}

document.getElementById("btnGuardarConversaoNova").addEventListener("click", async () => {
    erroModelo("erroConversaoNova");
    const artigoId = document.getElementById("cvArtigo").value;
    const registo = { artigo_id: artigoId, unidade_origem: document.getElementById("cvOrigem").value, fator_para_stock: Number(document.getElementById("cvFator").value), uso: document.getElementById("cvUso").value };
    if (!artigoId || !registo.fator_para_stock) { erroModelo("erroConversaoNova", "Escolhe o artigo e indica um fator positivo."); return; }
    const { error } = await supabaseClient.from("conversoes_artigo").insert(registo);
    if (error) { erroModelo("erroConversaoNova", traduzirErro(error.message)); return; }
    toast("Conversão guardada.", "sucesso"); carregarConversoesArtigo(artigoId);
});

async function carregarFormatos() {
    const { data, error } = await supabaseClient.from("formatos_logisticos").select("id, codigo, nome, tipo, caixas_por_palete, formato_caixa_id, formato_logistico_itens(quantidade_stock, material_embalagem, artigos(designacao, unidade_stock))").eq("ativo", true).order("nome");
    if (error) { console.error(error); return; }
    formatosModelo = data ?? [];
    const caixas = formatosModelo.filter((f) => f.tipo === "caixa");
    document.getElementById("fmCaixa").innerHTML = `<option value="">Formato de caixa...</option>` + caixas.map((f) => `<option value="${f.id}">${escaparHtml(f.nome)}</option>`).join("");
    document.getElementById("fiFormato").innerHTML = `<option value="">Caixa...</option>` + caixas.map((f) => `<option value="${f.id}">${escaparHtml(f.nome)}</option>`).join("");
    document.getElementById("listaFormatos").innerHTML = formatosModelo.map((f) => `<div style="margin:8px 0;"><strong>${escaparHtml(f.nome)}</strong> · ${f.tipo}${f.caixas_por_palete ? ` · ${f.caixas_por_palete} caixas` : ""}<ul>${(f.formato_logistico_itens ?? []).map((i) => `<li>${i.quantidade_stock} ${unidadeVisivel(i.artigos?.unidade_stock)} — ${escaparHtml(i.artigos?.designacao ?? "—")}${i.material_embalagem ? " (embalagem)" : ""}</li>`).join("")}</ul></div>`).join("") || "Sem formatos.";
}

document.getElementById("fmTipo").addEventListener("change", (e) => { document.getElementById("linhaPalete").style.display = e.target.value === "palete" ? "grid" : "none"; });
document.getElementById("btnCriarFormato").addEventListener("click", async () => {
    erroModelo("erroFormato"); const tipo = document.getElementById("fmTipo").value;
    const registo = { codigo: document.getElementById("fmCodigo").value.trim(), nome: document.getElementById("fmNome").value.trim(), tipo, ref_primavera: document.getElementById("fmRef").value.trim() || null, formato_caixa_id: tipo === "palete" ? document.getElementById("fmCaixa").value || null : null, caixas_por_palete: tipo === "palete" ? Number(document.getElementById("fmQtdCaixas").value) : null };
    if (!registo.codigo || !registo.nome || (tipo === "palete" && (!registo.formato_caixa_id || !registo.caixas_por_palete))) { erroModelo("erroFormato", "Preenche os dados obrigatórios do formato."); return; }
    const { error } = await supabaseClient.from("formatos_logisticos").insert(registo);
    if (error) { erroModelo("erroFormato", traduzirErro(error.message)); return; }
    toast("Formato criado.", "sucesso"); carregarFormatos();
});

document.getElementById("btnAdicionarItemFormato").addEventListener("click", async () => {
    erroModelo("erroItemFormato");
    const registo = { formato_id: document.getElementById("fiFormato").value, artigo_id: document.getElementById("fiArtigo").value, quantidade_stock: Number(document.getElementById("fiQuantidade").value), material_embalagem: document.getElementById("fiMaterial").checked };
    if (!registo.formato_id || !registo.artigo_id || !registo.quantidade_stock) { erroModelo("erroItemFormato", "Escolhe a caixa, o artigo e a quantidade."); return; }
    const { error } = await supabaseClient.from("formato_logistico_itens").insert(registo);
    if (error) { erroModelo("erroItemFormato", traduzirErro(error.message)); return; }
    toast("Componente adicionado.", "sucesso"); carregarFormatos();
});

async function carregarFamilias() {
    const { data, error } = await supabaseClient.from("familias_validade").select("id, codigo, nome").eq("ativa", true).order("nome");
    if (error) { console.error(error); return; }
    familiasModelo = data ?? [];
    const opcoes = `<option value="">Família...</option>` + familiasModelo.map((f) => `<option value="${f.id}">${escaparHtml(f.nome)}</option>`).join("");
    document.getElementById("rvFamilia").innerHTML = opcoes; document.getElementById("afFamilia").innerHTML = opcoes;
}

document.getElementById("btnCriarFamilia").addEventListener("click", async () => {
    erroModelo("erroFamilia"); const registo = { codigo: document.getElementById("fvCodigo").value.trim(), nome: document.getElementById("fvNome").value.trim(), descricao: document.getElementById("fvDescricao").value.trim() || null };
    if (!registo.codigo || !registo.nome) { erroModelo("erroFamilia", "Código e nome são obrigatórios."); return; }
    const { error } = await supabaseClient.from("familias_validade").insert(registo);
    if (error) { erroModelo("erroFamilia", traduzirErro(error.message)); return; }
    toast("Família criada.", "sucesso"); carregarFamilias();
});

document.getElementById("btnAssociarFamilia").addEventListener("click", async () => {
    erroModelo("erroAssociarFamilia"); const artigoId = document.getElementById("afArtigo").value, familiaId = document.getElementById("afFamilia").value;
    if (!artigoId || !familiaId) { erroModelo("erroAssociarFamilia", "Escolhe o artigo e a família."); return; }
    const { error } = await supabaseClient.from("artigos").update({ familia_validade_id: familiaId }).eq("artigo_id", artigoId);
    if (error) { erroModelo("erroAssociarFamilia", traduzirErro(error.message)); return; }
    toast("Artigo associado à família.", "sucesso");
});

document.getElementById("rvEscopo").addEventListener("change", (e) => {
    const artigo = e.target.value === "artigo"; document.getElementById("rvArtigoBloco").style.display = artigo ? "" : "none"; document.getElementById("rvFamilia").style.display = artigo ? "none" : "block";
});

document.getElementById("btnCriarRegra").addEventListener("click", async () => {
    erroModelo("erroRegra"); const escopoArtigo = document.getElementById("rvEscopo").value === "artigo";
    const registo = {
        codigo: document.getElementById("rvCodigo").value.trim(), nome: document.getElementById("rvNome").value.trim(),
        artigo_id: escopoArtigo ? document.getElementById("rvArtigo").value || null : null, familia_validade_id: escopoArtigo ? null : document.getElementById("rvFamilia").value || null,
        apresentacao_origem: document.getElementById("rvApresentacaoOrigem").value.trim(), estado_origem: document.getElementById("rvEstadoOrigem").value,
        operacao: document.getElementById("rvOperacao").value.trim(), apresentacao_destino: document.getElementById("rvApresentacaoDestino").value.trim(), estado_destino: document.getElementById("rvEstadoDestino").value,
        prazo_minimo: Number(document.getElementById("rvMin").value), prazo_maximo: Number(document.getElementById("rvMax").value), unidade_prazo: document.getElementById("rvUnidade").value,
        condicao_conservacao: document.getElementById("rvConservacao").value.trim(), exige_equipamento: document.getElementById("rvEquipamento").checked, exige_confirmacao_qualidade: document.getElementById("rvQualidade").checked,
        aprovada_por: ctxModelo.session.user.id, aprovada_em: new Date().toISOString(),
    };
    if (!registo.codigo || !registo.nome || !(registo.artigo_id || registo.familia_validade_id) || !registo.apresentacao_origem || !registo.operacao || !registo.apresentacao_destino || !registo.condicao_conservacao || registo.prazo_maximo < registo.prazo_minimo) { erroModelo("erroRegra", "Preenche o escopo, estados, operação, prazos e conservação. O prazo máximo não pode ser inferior ao mínimo."); return; }
    const { error } = await supabaseClient.from("regras_validade").insert(registo);
    if (error) { erroModelo("erroRegra", traduzirErro(error.message)); return; }
    toast(`Regra guardada. Será aplicado o prazo mínimo: ${registo.prazo_minimo} ${registo.unidade_prazo}.`, "sucesso"); await carregarRegrasModelo();
});

async function carregarRegrasModelo() {
    const { data, error } = await supabaseClient.from("regras_validade").select("*, artigos!regras_validade_artigo_id_fkey(designacao), familias_validade(nome)").eq("ativa", true).order("nome");
    if (error) { console.error(error); return; }
    regrasModelo = data ?? [];
    document.getElementById("listaRegras").innerHTML = regrasModelo.map((r) => `<p><strong>${escaparHtml(r.nome)}</strong> · ${escaparHtml(r.artigos?.designacao ?? r.familias_validade?.nome ?? "—")} · ${escaparHtml(r.estado_origem)} → ${escaparHtml(r.estado_destino)} · aplica ${r.prazo_minimo} ${escaparHtml(r.unidade_prazo)}${r.prazo_maximo !== r.prazo_minimo ? ` (intervalo aprovado ${r.prazo_minimo}–${r.prazo_maximo})` : ""}</p>`).join("") || "Sem regras.";
}

async function carregarZonasModelo() {
    const { data } = await supabaseClient.from("localizacoes").select("localizacao_id, nome").order("nome");
    document.getElementById("trDestino").innerHTML = `<option value="">Armazém de destino...</option>` + (data ?? []).map((z) => `<option value="${z.localizacao_id}">${escaparHtml(z.nome)}</option>`).join("");
    document.getElementById("histArmazem").innerHTML = `<option value="">Todos os armazéns</option>` + (data ?? []).map((z) => `<option value="${z.localizacao_id}">${escaparHtml(z.nome)}</option>`).join("");
}

async function carregarLotesModelo() {
    const { data, error } = await supabaseClient.from("lotes_artigo").select("lote_artigo_id, artigo_id, numero_lote, quantidade_atual, validade, validade_hora, apresentacao, estado_conservacao, estado_qualidade, localizacao_id, artigos(designacao, unidade_stock, configuracao_unidades_confirmada, familia_validade_id), localizacoes(nome)").gt("quantidade_atual", 0).eq("estado_qualidade", "disponivel").order("criado_em", { ascending: true });
    if (error) { console.error(error); return; }
    lotesModelo = data ?? [];
    const artigos=[...new Map(lotesModelo.map(l=>[l.artigo_id,l.artigos?.designacao??"—"])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
    const todosArtigos=await obterTodosArtigos();
    const opcoesArtigo=`<option value="">1. Escolhe primeiro o artigo...</option>`+artigos.map(([id,n])=>`<option value="${id}">${escaparHtml(n)}</option>`).join("");
    document.getElementById("trArtigo").innerHTML=opcoesArtigo;
    document.getElementById("clArtigo").innerHTML=opcoesArtigo;
    document.getElementById("histArtigo").innerHTML=`<option value="">Todos os artigos</option>`+todosArtigos.map(a=>`<option value="${a.artigo_id}">${escaparHtml(a.designacao)}</option>`).join("");
    preencherLotesDoArtigo("trArtigo","trLote"); preencherLotesDoArtigo("clArtigo","clLote");
}

function preencherLotesDoArtigo(idArtigo,idLote) {
    const artigoId=document.getElementById(idArtigo).value, select=document.getElementById(idLote);
    const elegiveis=lotesModelo.filter(l=>l.artigo_id===artigoId && Number(l.quantidade_atual)>0);
    select.disabled=!artigoId;
    select.innerHTML=!artigoId?`<option value="">2. Escolhe primeiro o artigo</option>`:`<option value="">2. Escolhe o lote...</option>`+elegiveis.map(l=>`<option value="${l.lote_artigo_id}">${escaparHtml(l.numero_lote)} · ${l.quantidade_atual} ${unidadeVisivel(l.artigos?.unidade_stock)} · ${escaparHtml(l.localizacoes?.nome??"sem armazém")}</option>`).join("");
}
document.getElementById("trArtigo").addEventListener("change",()=>preencherLotesDoArtigo("trArtigo","trLote"));
document.getElementById("clArtigo").addEventListener("change",()=>preencherLotesDoArtigo("clArtigo","clLote"));

document.getElementById("btnClassificarLote").addEventListener("click", async () => {
    erroModelo("erroClassificar");
    const args = { p_lote_id: document.getElementById("clLote").value, p_apresentacao: document.getElementById("clApresentacao").value.trim(), p_estado_conservacao: document.getElementById("clEstado").value, p_lote_fornecedor: document.getElementById("clFornecedor").value.trim() || null };
    if (!args.p_lote_id || !args.p_apresentacao) { erroModelo("erroClassificar", "Escolhe o lote e indica a apresentação."); return; }
    const { error } = await supabaseClient.rpc("classificar_lote_existente", args);
    if (error) { erroModelo("erroClassificar", traduzirErro(error.message)); return; }
    toast("Lote classificado sem alterar stock.", "sucesso"); await carregarLotesModelo();
});

document.getElementById("trLote").addEventListener("change", (e) => {
    const lote = lotesModelo.find((l) => l.lote_artigo_id === e.target.value), select = document.getElementById("trRegra");
    if (!lote) { select.disabled = true; select.innerHTML = `<option value="">Escolhe primeiro o lote</option>`; return; }
    const aplicaveis = regrasModelo.filter((r) => (r.artigo_id === lote.artigo_id || (r.familia_validade_id && r.familia_validade_id === lote.artigos?.familia_validade_id)) && r.apresentacao_origem === lote.apresentacao && r.estado_origem === lote.estado_conservacao);
    select.disabled = false; select.innerHTML = `<option value="">Regra...</option>` + aplicaveis.map((r) => `<option value="${r.id}">${escaparHtml(r.nome)} · ${r.prazo_minimo} ${escaparHtml(r.unidade_prazo)}</option>`).join("");
    document.getElementById("resumoLoteOrigem").innerHTML = `<strong>${escaparHtml(lote.numero_lote)}</strong> · ${escaparHtml(lote.apresentacao)} / ${escaparHtml(lote.estado_conservacao)} · disponível ${lote.quantidade_atual} ${unidadeVisivel(lote.artigos?.unidade_stock)} · validade ${formatarData(lote.validade)}`;
    document.getElementById("trQtdOrigem").max = lote.quantidade_atual; document.getElementById("trQtdDestino").max = lote.quantidade_atual;
});

document.getElementById("trQtdOrigem").addEventListener("input", (e) => { if (!document.getElementById("trQtdDestino").value) document.getElementById("trQtdDestino").value = e.target.value; });

document.getElementById("btnTransformar").addEventListener("click", async () => {
    erroModelo("erroTransformar");
    const args = { p_lote_origem_id: document.getElementById("trLote").value, p_regra_id: document.getElementById("trRegra").value, p_quantidade_origem: Number(document.getElementById("trQtdOrigem").value), p_quantidade_destino: Number(document.getElementById("trQtdDestino").value), p_localizacao_destino_id: document.getElementById("trDestino").value, p_iniciado_em: new Date(document.getElementById("trInicio").value).toISOString(), p_concluido_em: new Date(document.getElementById("trFim").value).toISOString(), p_equipamento: document.getElementById("trEquipamento").value.trim() || null, p_controlos: { observacao_operador: document.getElementById("trObservacoes").value.trim() || null }, p_observacoes: document.getElementById("trObservacoes").value.trim() || null };
    if (!args.p_lote_origem_id || !args.p_regra_id || !args.p_localizacao_destino_id || !args.p_quantidade_origem || !args.p_quantidade_destino) { erroModelo("erroTransformar", "Escolhe lote, regra, armazém e quantidades."); return; }
    const { data: loteId, error } = await supabaseClient.rpc("transformar_lote", args);
    if (error) { erroModelo("erroTransformar", traduzirErro(error.message)); return; }
    const { data: novo } = await supabaseClient.from("lotes_artigo").select("numero_lote, validade, quantidade_atual, apresentacao, estado_conservacao, estado_qualidade, artigos(designacao, unidade_stock), localizacoes(nome)").eq("lote_artigo_id", loteId).single();
    document.getElementById("resultadoTransformacao").style.display = "block";
    document.getElementById("dadosNovoLote").innerHTML = `<p><strong>${escaparHtml(novo.numero_lote)}</strong> · ${escaparHtml(novo.artigos?.designacao ?? "—")}</p><p>${novo.quantidade_atual} ${unidadeVisivel(novo.artigos?.unidade_stock)} · ${escaparHtml(novo.apresentacao)} / ${escaparHtml(novo.estado_conservacao)} · ${escaparHtml(novo.localizacoes?.nome ?? "—")}</p><p>Validade calculada: <strong>${formatarData(novo.validade)}</strong> · Estado: ${escaparHtml(novo.estado_qualidade)}</p><p style="font-size:12px;color:var(--ink-suave);">A impressão da etiqueta interna será ligada no bloco 5+6. Este registo já fica disponível para pré-visualização e rastreabilidade.</p>`;
    toast("Transformação concluída e lote interno criado.", "sucesso"); await Promise.all([carregarLotesModelo(), carregarTransformacoes()]);
});

async function carregarTransformacoes() {
    const { data, error } = await supabaseClient.from("transformacoes_lote").select("criado_em, operacao, quantidade_origem, quantidade_destino, unidade_stock, origem:lote_origem_id(numero_lote), destino:lote_destino_id(numero_lote, validade)").order("criado_em", { ascending: false }).limit(100);
    if (error) { console.error(error); return; }
    document.getElementById("corpoTransformacoes").innerHTML = (data ?? []).map((t) => `<tr><td>${new Date(t.criado_em).toLocaleString("pt-PT")}</td><td>${escaparHtml(t.origem?.numero_lote ?? "—")}</td><td>${escaparHtml(t.operacao)}</td><td>${escaparHtml(t.destino?.numero_lote ?? "—")}</td><td>${t.quantidade_origem} → ${t.quantidade_destino} ${unidadeVisivel(t.unidade_stock)}</td><td>${formatarData(t.destino?.validade)}</td></tr>`).join("") || `<tr><td colspan="6">Sem transformações.</td></tr>`;
}

async function carregarHistoricoR3() {
    let q=supabaseClient.from("historico_lotes_r3").select("*").order("ocorrido_em",{ascending:false}).limit(250);
    const artigo=document.getElementById("histArtigo")?.value, lote=document.getElementById("histLote")?.value.trim(), armazem=document.getElementById("histArmazem")?.value;
    if(artigo) q=q.eq("artigo_id",artigo); if(lote) q=q.ilike("numero_lote",`%${lote}%`); if(armazem) q=q.eq("localizacao_id",armazem);
    const {data,error}=await q; if(error){console.error(error);return;}
    const artigoIds=[...new Set((data||[]).map(x=>x.artigo_id))], zonaIds=[...new Set((data||[]).map(x=>x.localizacao_id).filter(Boolean))];
    const [{data:arts},{data:zonas}]=await Promise.all([supabaseClient.from("artigos").select("artigo_id,designacao").in("artigo_id",artigoIds.length?artigoIds:["00000000-0000-0000-0000-000000000000"]),supabaseClient.from("localizacoes").select("localizacao_id,nome").in("localizacao_id",zonaIds.length?zonaIds:["00000000-0000-0000-0000-000000000000"])]);
    const am=new Map((arts||[]).map(x=>[x.artigo_id,x.designacao])), zm=new Map((zonas||[]).map(x=>[x.localizacao_id,x.nome]));
    document.getElementById("corpoHistoricoR3").innerHTML=(data||[]).map(x=>`<tr><td data-rotulo="Data">${new Date(x.ocorrido_em).toLocaleString("pt-PT")}</td><td data-rotulo="Artigo">${escaparHtml(am.get(x.artigo_id)||"—")}</td><td data-rotulo="Lote">${escaparHtml(x.numero_lote)}</td><td data-rotulo="Armazém">${escaparHtml(zm.get(x.localizacao_id)||"—")}</td><td data-rotulo="Movimento">${escaparHtml(x.movimento)}</td><td data-rotulo="Quantidade">${x.quantidade} ${unidadeVisivel(x.unidade)}</td></tr>`).join("")||`<tr><td colspan="6">Sem movimentos para os filtros escolhidos.</td></tr>`;
}
document.getElementById("btnAplicarHistorico").addEventListener("click",carregarHistoricoR3);

iniciarModelo();
