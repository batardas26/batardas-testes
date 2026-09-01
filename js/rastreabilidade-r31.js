// R3.1 — rastreabilidade única para lote de fornecedor, interno ou comercial.
let ultimoRastreioR31 = null;

function linhasRastreioR31(dados) {
    const linhas=[];
    (dados.fornecedor||[]).forEach(x=>linhas.push(["Fornecedor",x.artigo,x.lote,`Disponível: ${x.quantidade_disponivel??0}`,x.validade||"—"]));
    (dados.internos||[]).forEach(x=>linhas.push(["Interno",x.artigo,x.lote,`Produzido: ${x.produzido}; consumido: ${x.consumido}; remanescente: ${x.remanescente} ${x.unidade}`,x.validade||"—"]));
    (dados.comerciais||[]).forEach(x=>linhas.push(["Comercial",x.artigo,x.lote,`Inicial: ${x.quantidade_inicial}; disponível: ${x.disponivel} ${x.unidade}`,x.validade||"—"]));
    (dados.logistica||[]).forEach(x=>linhas.push(["Logística",x.tipo,x.codigo,`${x.conteudo} ${x.unidade} · ${x.estado}`,"—"]));
    (dados.encomendas||[]).forEach(x=>linhas.push(["Cliente",x.cliente||"Sem cliente",x.lote_comercial,`Encomenda ${x.encomenda_id} · ${x.quantidade} · ${x.estado}`,x.entrega||"—"]));
    return linhas;
}

function renderizarRastreioR31(dados, destino) {
    ultimoRastreioR31=dados;
    const linhas=linhasRastreioR31(dados);
    destino.innerHTML = linhas.length ? `<div class="lista-rastreio-r31">${linhas.map(l=>`<div class="rastreio-camada-r31"><strong>${escaparHtml(l[0])} — ${escaparHtml(l[1]||"—")}</strong><p><span class="mono">${escaparHtml(l[2]||"—")}</span> · ${escaparHtml(l[3]||"—")} · validade ${escaparHtml(l[4]||"—")}</p></div>`).join("")}</div><p class="${dados.completa_ate_cliente?"sucesso":"aviso"}">${dados.completa_ate_cliente?"Rastreabilidade com ligação a cliente.":"Rastreabilidade disponível até ao stock/logística; ainda não existe encomenda/cliente associado."}</p>` : '<p class="texto-suave">Nenhum lote encontrado com esse número.</p>';
}

async function pesquisarRastreioR31(numero,destino) {
    const valor=(numero||"").trim();
    if(!valor){destino.innerHTML='<p class="erro">Indica um número de lote.</p>';return null;}
    destino.innerHTML='<p class="texto-suave">A construir a genealogia completa…</p>';
    const {data,error}=await supabaseClient.rpc("obter_rastreabilidade_r31",{p_numero:valor});
    if(error){destino.innerHTML=`<p class="erro">${escaparHtml(traduzirErro(error.message))}</p>`;return null;}
    renderizarRastreioR31(data,destino); return data;
}

function exportarRastreioPdfR31(dados=ultimoRastreioR31) {
    if(!dados){toast("Pesquisa primeiro um lote.","erro");return;}
    if(!window.jspdf?.jsPDF){toast("O gerador de PDF não ficou disponível.","erro");return;}
    const doc=new window.jspdf.jsPDF();
    doc.setFontSize(16); doc.text("Batardas — Rastreabilidade de lote",14,18);
    doc.setFontSize(10); doc.text(`Pesquisa: ${dados.pesquisa} · emitido em ${new Date().toLocaleString("pt-PT")}`,14,26);
    doc.autoTable({startY:32,head:[["Etapa","Artigo/entidade","Lote/código","Quantidades/estado","Validade/entrega"]],body:linhasRastreioR31(dados),headStyles:ESTILO_CABECALHO_TABELA_PDF,styles:{fontSize:8,cellPadding:2}});
    const finalY=doc.lastAutoTable?.finalY||40;
    doc.text(dados.completa_ate_cliente?"Percurso com ligação a cliente.":"Percurso incompleto: ainda sem encomenda/cliente associado.",14,Math.min(finalY+10,285));
    doc.save(`rastreabilidade-${String(dados.pesquisa).replace(/[^a-z0-9_-]/gi,"-")}.pdf`);
}
