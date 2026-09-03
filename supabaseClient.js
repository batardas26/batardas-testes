// Configuração pública EXCLUSIVA de Batardas-Testes. Não publicar na app principal.
// A chave publishable identifica o projeto; as permissões dependem de Auth e RLS.
const SUPABASE_URL = "https://hjpnuustucrewqymsntv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_qtyjd6sWvY3ST8XABWbiYQ_60wWVGeg";
if (SUPABASE_URL !== "https://hjpnuustucrewqymsntv.supabase.co" ||
    !SUPABASE_ANON_KEY.startsWith("sb_publishable_")) {
    throw new Error("Configuração de Testes inválida. Ligação não iniciada.");
}
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { storageKey: "batardas-testes-hjpnuustucrewqymsntv-auth" },
});
const VERSAO_FRONTEND = "R3.3-A.3";

const ROTA_POR_ROLE = {
    admin: "admin.html",
    producao: "producao.html",
    armazem: "armazem.html",
    consulta: "consulta.html",
    qualidade: "qualidade.html",
    manutencao: "manutencao.html",
};

const NOME_ROLE_PARTILHADO = { admin: "Admin", producao: "Produção", armazem: "Armazém", consulta: "Consulta", qualidade: "Qualidade", manutencao: "Manutenção" };

const NOMES_MODULOS_R3 = {
    "admin.html":"Administração", "producao.html":"Produção",
    "armazem.html":"Armazém", "consulta.html":"Consulta",
    "qualidade.html":"Qualidade", "manutencao.html":"Manutenção",
    "modelo-artigos-lotes.html":"Artigos e lotes",
    "artigo.html":"Ficha do artigo",
    "configuracao-r32.html":"Configuração R3.2",
};

/** Barra curta tipo aplicações com separador ativo e X. No telemóvel mostra
 * só o módulo atual. Fechar regressa à homepage; nunca passa pelo login. */
function paginaPermitidaR323(perfil, pagina) {
    if (!perfil || !NOMES_MODULOS_R3[pagina]) return false;
    if (perfil.super_admin) return true;
    const roles = new Set([perfil.role, ...(perfil.acessosExtra ?? [])]);
    const nivel = (area) => ["consulta", "operador", "responsavel", "admin"].includes(nivelNaArea(perfil, area));
    const regras = {
        "admin.html": () => roles.has("admin") || nivel("administracao"),
        "producao.html": () => roles.has("producao") || roles.has("admin") || nivel("producao"),
        "armazem.html": () => roles.has("armazem") || roles.has("admin") || nivel("armazem"),
        "consulta.html": () => roles.has("consulta") || roles.has("admin"),
        "qualidade.html": () => roles.has("qualidade") || roles.has("admin") || nivel("qualidade"),
        "manutencao.html": () => roles.has("manutencao") || roles.has("admin") || nivel("manutencao"),
        "modelo-artigos-lotes.html": () => ["admin", "producao", "armazem", "qualidade"].some((r) => roles.has(r))
            || ["producao", "armazem", "qualidade"].some(nivel),
        "artigo.html": () => true,
        "configuracao-r32.html": () => false,
    };
    return Boolean(regras[pagina]?.());
}

async function instalarBarraModuloR3() {
    const pagina = location.pathname.split("/").pop() || "index.html";
    if (!NOMES_MODULOS_R3[pagina] || document.querySelector(".barra-modulos-r3")) return;
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    const perfil = await obterPerfil(session.user.id);
    if (!perfil) return;
    let abertos=[]; try { abertos=JSON.parse(sessionStorage.getItem("batardas_modulos_abertos")||"[]"); } catch {}
    abertos=abertos.filter((x) => NOMES_MODULOS_R3[x] && paginaPermitidaR323(perfil, x));
    if (paginaPermitidaR323(perfil, pagina)) abertos=[...new Set([...abertos,pagina])];
    sessionStorage.setItem("batardas_modulos_abertos",JSON.stringify(abertos));
    if (!abertos.length) return;
    const barra=document.createElement("nav"); barra.className="barra-modulos-r3"; barra.setAttribute("aria-label","Módulos abertos");
    barra.innerHTML=abertos.map(x=>`<span class="separador-modulo ${x===pagina?"activo":""}" data-pagina="${x}"><a href="${x}">${escaparHtml(NOMES_MODULOS_R3[x])}</a><button type="button" aria-label="Fechar ${escaparHtml(NOMES_MODULOS_R3[x])}" title="Fechar">×</button></span>`).join("");
    barra.querySelectorAll(".separador-modulo button").forEach(botao=>botao.addEventListener("click",(evento)=>{
        evento.preventDefault(); evento.stopPropagation();
        const alvo=botao.closest(".separador-modulo").dataset.pagina;
        const restantes=abertos.filter(x=>x!==alvo);
        sessionStorage.setItem("batardas_modulos_abertos",JSON.stringify(restantes));
        if(alvo===pagina) location.href=restantes.at(-1)||"inicio.html";
        else botao.closest(".separador-modulo").remove();
    }));
    document.body.insertBefore(barra,document.body.firstChild);
}
document.addEventListener("DOMContentLoaded", () => { instalarBarraModuloR3(); });

/** Mostra um pequeno bloco de atalhos, junto ao sino, para os módulos
 *  extra a que a pessoa tem acesso (multi-perfil) — a versão completa
 *  disto (dropdown do menu hambúrguer) fica para mais tarde, mas sem
 *  algo aqui a funcionalidade não era utilizável já. */
/** Junta os acessos extra (multi-perfil) ao fim do menu lateral, tal como
 *  combinado — deixou de ser um botão à parte junto ao sino, agora vive
 *  dentro do mesmo dropdown do hambúrguer no telemóvel (e da barra
 *  lateral normal em ecrã largo). */
function renderizarAcessosExtra(perfil) {
    if (!perfil?.acessosExtra?.length) return;
    const barra = document.querySelector(".barra-lateral");
    if (!barra) return;
    const links = perfil.acessosExtra
        .filter((r) => ROTA_POR_ROLE[r])
        .map((r) => `<a href="${ROTA_POR_ROLE[r]}" style="display:flex; align-items:center; gap:8px; font-size:13.5px; color:var(--ink-suave); text-decoration:none; padding:6px 20px;">${escaparHtml(NOME_ROLE_PARTILHADO[r] ?? r)}</a>`)
        .join("");
    if (!links) return;

    let rodape = barra.querySelector(".rodape-lateral");
    if (!rodape) {
        rodape = document.createElement("div");
        rodape.className = "rodape-lateral";
        barra.appendChild(rodape);
    }
    rodape.innerHTML += `<p style="font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--ink-fraca); margin:12px 0 8px;">Outros acessos</p>${links}`;
}

// Nomes de classe CSS não podem ter espaços/acentos — este mapa liga cada
// estado ao respectivo badge definido em css/style.css
const CLASSE_ESTADO = {
    "Registada": "Registada",
    "Em Produção": "Em-Producao",
    "Em Preparação": "Em-Preparacao",
    "Pronta": "Pronta",
    "Embalada": "Embalada",
    "Carregada": "Carregada",
    "Cancelada": "Cancelada",
};

// A base de dados conserva os valores históricos do enum, mas a interface
// apresenta o significado operacional corrigido. "Em Preparação" passou a
// significar a fila anterior ao embalamento; o picking só acontece depois de
// a encomenda ficar Pronta.
const ROTULO_ESTADO_ENCOMENDA = {
    "Em Preparação": "Por embalar",
    "Embalada": "Picking concluído",
};

function formatarEstadoEncomenda(estado) {
    return ROTULO_ESTADO_ENCOMENDA[estado] ?? estado ?? "—";
}

function formatarData(valor) {
    if (!valor) return "—";
    return new Date(valor).toLocaleDateString("pt-PT");
}

function formatarUnidadeStock(valor) {
    if (!valor) return "POR CONFIRMAR";
    return valor === "pack" ? "PCK" : String(valor).toUpperCase();
}

/**
 * Escapa HTML antes de inserir texto de utilizador em innerHTML — sem
 * isto, alguém escrever "<script>...</script>" num campo livre (nome de
 * cliente, observações) executava no ecrã de outra pessoa. Cobre & < > "
 * e ' explicitamente (não só < > &), para ser seguro tanto dentro de
 * texto entre tags como dentro de atributos tipo value="...".
 */
function escaparHtml(texto) {
    return String(texto ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}

/**
 * Confirma que há sessão activa; se não houver, manda para o login.
 * Chamar no topo de cada página protegida.
 */
async function exigirSessao() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = "index.html";
        return null;
    }
    return session;
}

/** Obtém nome + role do perfil do utilizador autenticado. */
async function obterPerfil(userId) {
    const { data, error } = await supabaseClient
        .from("perfis")
        .select("nome, role, super_admin, nome_utilizador, email_contacto, data_aniversario, foto_caminho, perfil_completo, deve_alterar_password")
        .eq("id", userId)
        .single();
    if (error) {
        console.error("Erro ao obter perfil:", error);
        return null;
    }
    // Acessos extra (multi-perfil) — além do role principal, esta pessoa
    // pode ter direito a entrar noutros módulos (ex. Consulta + Qualidade).
    const { data: extras } = await supabaseClient.from("acessos_extra").select("role").eq("perfil_id", userId);
    data.acessosExtra = (extras ?? []).map((e) => e.role);
    // Etiquetas de responsabilidade (ex. "manutencao") — decidem quem
    // pode assumir/fechar pedidos numa área, à parte do acesso ao ecrã.
    const { data: etiquetas } = await supabaseClient.from("responsabilidades").select("etiqueta").eq("perfil_id", userId);
    data.etiquetas = (etiquetas ?? []).map((e) => e.etiqueta);
    const { data: areas } = await supabaseClient.from("acessos_area_r31").select("area,nivel,valido_desde,valido_ate").eq("perfil_id", userId);
    data.acessosArea = areas ?? [];
    return data;
}

let estadoBackendR323 = null;
function mostrarBackendDesatualizadoR323() {
    if (document.getElementById("backendR323Bloqueado")) return;
    const aviso = document.createElement("div");
    aviso.id = "backendR323Bloqueado";
    aviso.className = "backend-bloqueado-r323";
    aviso.innerHTML = `<strong>Atualização incompleta</strong><p>A aplicação ${VERSAO_FRONTEND} não encontrou a mesma versão na base de dados. Pede ao Super Admin para executar a migration 31 dos bloqueios do fluxo de PA. Nenhuma operação foi realizada.</p>`;
    document.body.appendChild(aviso);
}

async function verificarBackendR323() {
    if (estadoBackendR323 === true) return true;
    const { data, error } = await supabaseClient.rpc("estado_backend_r323");
    const valido = !error && data?.versao === VERSAO_FRONTEND
        && data?.stock_view === true && data?.reserva_fefo === true
        && data?.rastreabilidade_contrato === true
        && data?.entrega_pa_obrigatoria === true;
    if (!valido) {
        estadoBackendR323 = false;
        mostrarBackendDesatualizadoR323();
        console.error("Backend incompatível com o frontend", { versaoFrontend: VERSAO_FRONTEND, erro: error?.message ?? null });
        return false;
    }
    estadoBackendR323 = true;
    return true;
}

function perfilTemDadosObrigatorios(perfil) {
    return Boolean(perfil?.perfil_completo && perfil?.nome && perfil?.data_aniversario);
}

function rotaPendentePrimeiroAcesso(perfil, utilizadorAuth = null) {
    if (perfil?.deve_alterar_password || utilizadorAuth?.user_metadata?.deve_alterar_password === true) {
        return "redefinir-password.html?primeiro=1";
    }
    if (!perfilTemDadosObrigatorios(perfil)) return "completar-perfil.html";
    return null;
}

function nivelNaArea(perfil, area) {
    if (perfil?.super_admin) return "responsavel";
    return perfil?.acessosArea?.find((a) => a.area === area)?.nivel ?? "sem_acesso";
}

function eResponsavelDeEquipa(perfil) {
    if (perfil?.super_admin) return true;
    return (perfil?.acessosArea ?? []).some((a) => a.nivel === "responsavel" && ["producao","armazem","qualidade","manutencao"].includes(a.area));
}

function aplicarModoOperacionalR31(perfil, area) {
    if(perfil?.super_admin) return;
    const nivel=nivelNaArea(perfil,area);
    if(["operador","responsavel"].includes(nivel)) return;
    const main=document.querySelector("main"); if(!main)return;
    main.dataset.modoConsultaR31="true";
    main.querySelectorAll("button:not(.nav-item), input, select, textarea").forEach(el=>{
        if(el.closest(".filtros, [data-permitir-consulta-r31]"))return;
        el.disabled=true;
    });
    const aviso=document.createElement("div");aviso.className="resumo-operacao";
    aviso.textContent=nivel==="admin"?"Modo acompanhamento: podes consultar esta área, mas as ações pertencem ao responsável e à equipa.":"Modo consulta: não tens execução atribuída nesta área.";
    main.insertBefore(aviso,main.firstChild);
    if(!document.body.dataset.bloqueioOperacionalR31){
        document.body.dataset.bloqueioOperacionalR31="true";
        document.addEventListener("click",evento=>{
            const botao=evento.target.closest("main[data-modo-consulta-r31='true'] button");
            if(!botao || botao.closest(".filtros, [data-permitir-consulta-r31]"))return;evento.preventDefault();evento.stopImmediatePropagation();toast("Esta vista está em modo acompanhamento/consulta.","erro");
        },true);
    }
}

/** Pedido rápido partilhado. Mostrar o botão não concede permissão: a RLS
 * volta a confirmar no servidor que a pessoa é responsável de equipa. */
async function instalarPedidoRapidoManutencao(perfil) {
    if (!eResponsavelDeEquipa(perfil) || document.getElementById("btnPedidoManutencaoR31")) return;
    const botao=document.createElement("button");
    botao.id="btnPedidoManutencaoR31"; botao.className="pedido-manutencao-r31 secundario";
    botao.innerHTML='<i class="ti ti-tool"></i> Pedir manutenção';
    botao.addEventListener("click",async()=>{
        const {data:equipamentos,error}=await supabaseClient.from("equipamentos").select("id,nome").order("nome");
        if(error){ toast(traduzirErro(error.message),"erro"); return; }
        const fundo=document.createElement("div"); fundo.className="modal-r31";
        fundo.innerHTML=`<div class="cartao modal-r31-conteudo"><h2>Pedir manutenção</h2><p class="texto-suave">O pedido fica ligado ao responsável que o registou.</p><select id="pmEquipamento"><option value="">Equipamento (opcional)</option>${(equipamentos||[]).map(e=>`<option value="${e.id}">${escaparHtml(e.nome)}</option>`).join("")}</select><select id="pmUrgencia"><option>Baixa</option><option selected>Média</option><option>Alta</option><option>Crítica</option></select><textarea id="pmDescricao" placeholder="Descreve o problema e onde aconteceu"></textarea><p id="pmErro" class="erro"></p><div class="linha-form"><button class="secundario" id="pmCancelar">Cancelar</button><button id="pmEnviar">Enviar pedido</button></div></div>`;
        document.body.appendChild(fundo);
        fundo.querySelector("#pmCancelar").onclick=()=>fundo.remove();
        fundo.addEventListener("click",e=>{if(e.target===fundo)fundo.remove();});
        fundo.querySelector("#pmEnviar").onclick=async()=>{
            const descricao=fundo.querySelector("#pmDescricao").value.trim();
            if(!descricao){fundo.querySelector("#pmErro").textContent="Descreve o problema.";return;}
            const {data:{session}}=await supabaseClient.auth.getSession();
            const {error:erro}=await supabaseClient.from("pedidos_manutencao").insert({equipamento_id:fundo.querySelector("#pmEquipamento").value||null,descricao,urgencia:fundo.querySelector("#pmUrgencia").value,reportado_por:session.user.id});
            if(erro){fundo.querySelector("#pmErro").textContent=traduzirErro(erro.message);return;}
            fundo.remove(); toast("Pedido de manutenção registado.","sucesso");
        };
    });
    document.body.appendChild(botao);
}

/** Confirma que o perfil actual tem um dos roles esperados nesta página
 *  — pelo principal OU por um acesso extra (multi-perfil) — caso
 *  contrário devolve-o à sua própria página, para evitar acesso cruzado. */
async function exigirRole(rolesPermitidos) {
    const session = await exigirSessao();
    if (!session) return null;
    const perfil = await obterPerfil(session.user.id);
    const rotaPendente = rotaPendentePrimeiroAcesso(perfil, session.user);
    if (rotaPendente) {
        window.location.href = rotaPendente;
        return null;
    }
    if (!await verificarBackendR323()) return null;
    const areaPorRole = { producao: "producao", armazem: "armazem", qualidade: "qualidade", manutencao: "manutencao", admin: "administracao" };
    const temArea = rolesPermitidos.some((role) => {
        const area = areaPorRole[role];
        return area && ["consulta", "operador", "responsavel", "admin"].includes(nivelNaArea(perfil, area));
    });
    const temAcesso = perfil && (perfil.super_admin || rolesPermitidos.includes(perfil.role)
        || perfil.acessosExtra.some((r) => rolesPermitidos.includes(r)) || temArea);
    if (!temAcesso) {
        await supabaseClient.rpc("registar_acesso_negado_r323", { p_pagina: location.pathname.split("/").pop() || "desconhecida" });
        try {
            const abertos=JSON.parse(sessionStorage.getItem("batardas_modulos_abertos")||"[]");
            sessionStorage.setItem("batardas_modulos_abertos",JSON.stringify(abertos.filter((x)=>paginaPermitidaR323(perfil,x))));
        } catch {}
        window.location.href = ROTA_POR_ROLE[perfil?.role] ?? "index.html";
        return null;
    }
    return { session, perfil };
}

/**
 * Torna a mensagem de erro do Supabase/Postgres compreensível, para os
 * erros mais prováveis de aparecer no uso normal. Erros não mapeados
 * aqui continuam a aparecer tal como o Postgres os devolve — melhor
 * teres alguma informação técnica do que nenhuma.
 */
function traduzirErro(mensagem) {
    if (!mensagem) return "Erro desconhecido.";
    if (mensagem.includes("quantidade_nao_negativa")) {
        return "Não há stock suficiente para esta saída — confirma a quantidade disponível antes de tentares outra vez.";
    }
    if (mensagem.includes("duplicate key value")) {
        return "Já existe um registo igual a este — confirma se não estás a repetir algo já criado.";
    }
    if (mensagem.includes("permission denied") || mensagem.includes("new row violates row-level security")) {
        return "O teu perfil não tem permissão para esta acção.";
    }
    if (mensagem.includes("violates foreign key constraint")) {
        return "Este registo está ligado a outro que ainda existe — não é possível remover/alterar assim.";
    }
    const errosR31={
        APENAS_RESPONSAVEL_DA_AREA:"Só o responsável desta área pode organizar ou fechar o dia.",
        APENAS_RESPONSAVEL_PRODUCAO:"Só o responsável de Produção pode entregar PA ao Armazém.",
        APENAS_EQUIPA_ARMAZEM:"Apenas a equipa de Armazém pode confirmar esta receção.",
        CHECKLIST_OBRIGATORIA_INCOMPLETA:"Ainda existem tarefas obrigatórias por concluir.",
        QUANTIDADE_PASSAGEM_SUPERIOR_AO_REMANESCENTE:"A quantidade ultrapassa o PA remanescente ainda não comprometido.",
        DESTINO_PASSAGEM_INVALIDO:"Escolhe Stock, Embalamento ou Encomenda como destino.",
        ENCOMENDA_OBRIGATORIA_NO_DESTINO:"Seleciona a encomenda a que este PA se destina.",
        ARTIGO_NAO_EXISTE_NA_ENCOMENDA:"Esta encomenda não contém uma linha para este artigo.",
        DATA_PLANO_INVALIDA:"Escolhe hoje ou uma data futura para o plano de produção.",
        PLANO_NAO_PODE_SER_REAGENDADO:"Só podes reagendar uma produção que ainda não começou.",
        PLANO_PRODUCAO_NAO_PODE_SER_INICIADO:"Esta produção já foi iniciada, concluída ou cancelada.",
        PLANO_PRODUCAO_NAO_ESTA_EM_EXECUCAO:"Inicia primeiro esta produção antes de registar o resultado.",
        RESULTADO_PRODUCAO_SUPERIOR_AO_PLANEADO:"A quantidade boa mais a quebra não pode ultrapassar o planeado.",
        RESULTADO_PRODUCAO_VAZIO:"Regista quantidade boa ou quebra antes de concluir.",
        LOTE_INTERNO_OBRIGATORIO_PARA_QUANTIDADE_BOA:"Seleciona o lote interno produzido e congelado correspondente à quantidade boa.",
        DIVERGENCIA_OBRIGATORIA:"Explica a divergência entre a quantidade entregue e recebida.",
        PASSAGEM_NAO_DISPONIVEL:"Esta passagem já foi tratada ou deixou de estar disponível.",
        PLANO_EMBALAMENTO_NAO_DISPONIVEL:"Este plano já foi concluído, cancelado ou deixou de estar disponível.",
        QUANTIDADE_BOA_INVALIDA:"A quantidade boa embalada é inválida.",
        QUANTIDADE_QUEBRA_INVALIDA:"A quantidade de quebra é inválida.",
        MOTIVO_QUEBRA_OBRIGATORIO:"Indica o motivo da quebra no embalamento.",
        RESULTADO_EMBALAMENTO_VAZIO:"Regista quantidade boa ou quebra; para não executar, cancela o plano.",
        RESULTADO_EMBALAMENTO_SUPERIOR_AO_PLANO:"A quantidade boa e a quebra ultrapassam a quantidade planeada.",
        LOTE_COMERCIAL_OBRIGATORIO:"Seleciona o lote comercial para a quantidade boa embalada.",
        UNIDADE_CONFIRMADA_DIFERE_DO_PLANO:"Confirma o resultado na mesma unidade usada no plano.",
        CONVERSAO_DO_PLANO_FOI_ALTERADA:"A conversão deste artigo mudou depois do planeamento. Cancela e cria um novo plano.",
        ENCOMENDA_SEM_LINHAS:"Adiciona pelo menos um artigo à encomenda.",
        ARTIGO_OU_UNIDADE_NAO_CONFIRMADOS:"O artigo ainda não tem a unidade de stock confirmada pelo Super Admin.",
        NECESSIDADE_PRODUCAO_NAO_DISPONIVEL:"Esta necessidade já foi planeada ou deixou de existir.",
        QUANTIDADE_RESERVA_SUPERIOR_AO_DISPONIVEL:"A quantidade ultrapassa o PA congelado ainda livre.",
        RESERVA_JA_PLANEADA_PARA_EMBALAMENTO:"Esta reserva já está num plano de embalamento.",
        PA_DISPONIVEL_ESTA_RESERVADO_PARA_ENCOMENDAS:"Esta quantidade está reservada para encomendas. Usa a respetiva linha na lista de PA reservado.",
        PA_AINDA_NAO_RECEBIDO_PELO_ARMAZEM:"Este PA ainda não foi entregue e recebido pelo Armazém.",
        PA_RESERVADO_EXIGE_ENTREGA_A_ENCOMENDA:"Este PA está reservado e só pode ser entregue à respetiva encomenda.",
        QUANTIDADE_SUPERIOR_A_RESERVA_DA_ENCOMENDA:"A quantidade entregue ultrapassa a reserva desta encomenda.",
        PLANO_NAO_CORRESPONDE_A_RESERVA_DA_ENCOMENDA:"O lote ou a quantidade do plano não correspondem à reserva da encomenda.",
        CAIXA_NAO_PERTENCE_A_ESTA_LINHA:"A caixa selecionada não corresponde ao artigo/lote reservado nesta linha.",
        CAIXA_ULTRAPASSA_RESERVA_DA_LINHA:"O conteúdo desta caixa ultrapassa a quantidade reservada para a linha.",
        PALETE_SEM_CAIXAS:"Adiciona pelo menos uma caixa antes de fechar a palete.",
        EXISTEM_PALETES_ABERTAS:"Fecha ou cancela todas as paletes antes de confirmar o carregamento.",
        ENCOMENDA_AINDA_NAO_TEM_STOCK_COMERCIAL_COMPLETO:"Ainda falta produto embalado para completar uma ou mais linhas.",
        PICKING_AINDA_NAO_CONCLUIDO:"Conclui primeiro o picking da encomenda.",
        CAIXAS_ULTRAPASSAM_QUANTIDADE_BOA:"As caixas indicadas contêm mais produto do que a quantidade boa embalada.",
        FORMATO_CAIXA_INCOMPATIVEL_COM_ARTIGO:"O formato de caixa não está parametrizado para este artigo.",
        FORMATO_E_QUANTIDADE_CAIXAS_INCOERENTES:"Escolhe simultaneamente o formato e o número de caixas.",
        CAIXAS_DESTE_EMBALAMENTO_JA_CRIADAS:"As caixas deste embalamento já foram criadas.",
        LOTE_INTERMEDIO_NAO_ENCONTRADO:"Um dos lotes intermédios deixou de estar disponível.",
        CONSUMO_INTERMEDIO_INVALIDO:"Confirma as quantidades dos intermédios consumidos.",
        STOCK_COMERCIAL_INSUFICIENTE_NA_CARGA:"O stock comercial mudou e já não cobre a reserva. Reconfirma os lotes antes da carga.",
        LOTE_INTERNO_INDISPONIVEL_OU_SALDO_INSUFICIENTE:"Este lote interno está bloqueado, expirado ou já não tem quantidade suficiente.",
        LOTE_FORNECEDOR_NAO_ELEGIVEL_PARA_PRODUCAO:"Este lote está bloqueado, sem validade obrigatória ou expirado. Escolhe outro lote.",
        COMPONENTE_NAO_PERTENCE_A_BOM_NEM_TEM_SUBSTITUICAO_APROVADA:"Este artigo não pertence à BOM desta produção. Uma substituição exige aprovação prévia da Qualidade.",
        BOM_ATIVA_NAO_CONFIGURADA:"O artigo ainda não tem uma BOM ativa. O Super Admin tem de a configurar antes do planeamento.",
        DATA_PLANO_OBRIGATORIA:"Escolhe o dia em que a produção será realizada.",
        ENCOMENDA_CARREGADA_NAO_PODE_SER_CANCELADA:"Uma encomenda já carregada fica no histórico e não pode ser cancelada.",
        RETIRE_AS_CAIXAS_DAS_PALETES_ANTES_DE_CANCELAR:"Retira primeiro as caixas das paletes desta encomenda.",
        TERMINE_A_PRODUCAO_EM_CURSO_ANTES_DE_CANCELAR:"Existe uma produção em curso para esta encomenda. Termina ou trata essa produção antes de cancelar.",
        ENCOMENDA_NAO_ESTA_PRONTA_PARA_PICKING:"Esta encomenda ainda não está pronta para o picking ou já foi preparada.",
        ENCOMENDA_SEM_STOCK_COMERCIAL_COMPLETO:"O picking só pode começar quando todas as linhas tiverem stock comercial completo e lote atribuído.",
        ENCOMENDA_SEM_PALETE_FECHADA:"Cria, completa e fecha pelo menos uma palete antes de carregar.",
        CONTEUDO_FISICO_NAO_COINCIDE_COM_AS_RESERVAS:"As caixas nas paletes não coincidem com os artigos, lotes e quantidades reservados.",
        STOCK_COMERCIAL_INSUFICIENTE_OU_EXPIRADO_NA_CARGA:"O stock reservado ficou insuficiente ou expirou. Recalcula a encomenda antes da carga.",
        CAIXA_RESERVADA_PARA_OUTRA_ENCOMENDA:"Esta caixa já está reservada para outra encomenda.",
        CAIXA_JA_ESTA_NUMA_PALETE:"Esta caixa já pertence a uma palete.",
        CAIXA_CONTEM_LOTE_EXPIRADO:"A caixa contém um lote expirado e não pode ser expedida.",
        CONTEUDO_CAIXA_ULTRAPASSA_RESERVA_ENCOMENDA:"O conteúdo da caixa ultrapassa a quantidade reservada para esta encomenda.",
        ACAO_CORRETIVA_OBRIGATORIA:"Descreve a ação corretiva antes de submeter a resolução.",
        NC_NAO_ATRIBUIDA_OU_ESTADO_INVALIDO:"Esta não-conformidade não te está atribuída ou já mudou de estado.",
        NC_AINDA_NAO_ESTA_POR_CONFIRMAR:"A resolução ainda não foi submetida para confirmação.",
        MOTIVO_ANULACAO_OBRIGATORIO:"Indica o motivo da anulação para preservar o histórico.",
    };
    for(const [codigo,texto] of Object.entries(errosR31))if(mensagem.includes(codigo))return texto;
    return mensagem;
}

let _cacheArtigos = null;

/** Vai buscar todos os artigos uma única vez por sessão de página (guarda
 *  em cache) — com muitos artigos, filtrar do lado do browser é instantâneo
 *  e evita um pedido à base de dados a cada letra escrita. */
async function obterTodosArtigos() {
    if (_cacheArtigos) return _cacheArtigos;
    const { data, error } = await supabaseClient
        .from("artigos")
        .select("artigo_id, ref_primavera, designacao, unidade_stock")
        .order("designacao");
    if (error) { console.error(error); return []; }
    _cacheArtigos = data;
    return data;
}

/**
 * Transforma um par (input de texto + input escondido) numa pesquisa de
 * artigo por código Primavera ou nome — usar em vez de <select> quando há
 * demasiados artigos para um dropdown fazer sentido.
 *   idTexto      — id do <input type="text"> visível, onde a pessoa escreve
 *   idOculto     — id do <input type="hidden"> que fica com o artigo_id
 *   idResultados — id do <div> onde a lista de sugestões aparece
 *   onSelect     — chamado com (artigoId, artigo) sempre que se escolhe um
 */
async function activarPesquisaArtigo(idTexto, idOculto, idResultados, onSelect) {
    const inputTexto = document.getElementById(idTexto);
    const inputOculto = document.getElementById(idOculto);
    const listaResultados = document.getElementById(idResultados);
    const artigos = await obterTodosArtigos();

    let filtradosActuais = [];
    let indiceActivo = -1;

    function realcarItem() {
        listaResultados.querySelectorAll(".sugestao-item").forEach((el, i) => {
            el.classList.toggle("sugestao-activa", i === indiceActivo);
            if (i === indiceActivo) el.scrollIntoView({ block: "nearest" });
        });
    }

    function mostrarResultados(filtro) {
        const termo = filtro.trim().toLowerCase();
        filtradosActuais = termo
            ? artigos.filter((a) =>
                a.ref_primavera.toLowerCase().includes(termo) || a.designacao.toLowerCase().includes(termo)
              ).slice(0, 8)
            : artigos.slice(0, 8);
        indiceActivo = -1;
        listaResultados.innerHTML = filtradosActuais.length
            ? filtradosActuais.map((a) =>
                `<div class="sugestao-item" data-id="${a.artigo_id}">${escaparHtml(a.ref_primavera)} — ${escaparHtml(a.designacao)}</div>`
              ).join("")
            : `<div class="sugestao-vazia">Sem resultados</div>`;
        listaResultados.style.display = "block";
    }

    function seleccionar(artigo) {
        if (!artigo) return;
        inputOculto.value = artigo.artigo_id;
        inputTexto.value = `${artigo.ref_primavera} — ${artigo.designacao}`;
        listaResultados.style.display = "none";
        if (onSelect) onSelect(artigo.artigo_id, artigo);
    }

    inputTexto.addEventListener("focus", () => mostrarResultados(inputTexto.value));
    inputTexto.addEventListener("input", () => {
        inputOculto.value = "";
        mostrarResultados(inputTexto.value);
    });
    // O blur corre antes do click na sugestão — o pequeno atraso deixa o
    // click acontecer primeiro, senão a lista desaparecia sem seleccionar nada.
    inputTexto.addEventListener("blur", () => {
        setTimeout(() => { listaResultados.style.display = "none"; }, 150);
    });
    // Setas para percorrer a lista, Enter para escolher o realçado (ou o
    // primeiro resultado, se ainda não tiveres usado as setas) — sem isto
    // tinhas sempre de tirar a mão do teclado para clicar com o rato.
    inputTexto.addEventListener("keydown", (e) => {
        if (listaResultados.style.display === "none" || !filtradosActuais.length) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            indiceActivo = Math.min(indiceActivo + 1, filtradosActuais.length - 1);
            realcarItem();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            indiceActivo = Math.max(indiceActivo - 1, 0);
            realcarItem();
        } else if (e.key === "Enter") {
            e.preventDefault();
            seleccionar(filtradosActuais[indiceActivo] ?? filtradosActuais[0]);
        } else if (e.key === "Escape") {
            listaResultados.style.display = "none";
        }
    });
    listaResultados.addEventListener("click", (e) => {
        const item = e.target.closest(".sugestao-item");
        if (!item) return;
        seleccionar(artigos.find((a) => a.artigo_id === item.dataset.id));
    });
}

/** Procura um artigo já carregado em cache pelo id — útil depois de a
 *  pessoa escolher um resultado da pesquisa, quando só temos o artigo_id
 *  guardado no input escondido e precisamos do nome para gravar. */
async function obterArtigoPorId(artigoId) {
    const artigos = await obterTodosArtigos();
    return artigos.find((a) => a.artigo_id === artigoId) ?? null;
}

/**
 * Pares de unidades convertíveis entre si (métrico, factor fixo) — usado
 * para deixar escrever "500" + "g" em vez de teres de calcular "0.5" de
 * cabeça quando a unidade base do artigo é "kg". Fora destes pares (ex.
 * "un"), não há conversão — o valor entra tal como escrito.
 */
const PARES_UNIDADE = {
    kg: { g: 1000 },
    g: { kg: 0.001 },
    l: { ml: 1000 },
    ml: { l: 0.001 },
};

/** Opções de unidade a oferecer para uma dada unidade base — a própria
 *  unidade base primeiro (valor 1:1, sem conversão), mais a sua par
 *  métrica se existir (ex. base "kg" -> oferece "kg" e "g"). */
function opcoesUnidadePara(unidadeBase) {
    const base = (unidadeBase ?? "un").toLowerCase();
    const opcoes = [{ valor: base, factor: 1, rotulo: base.toUpperCase() }];
    const par = PARES_UNIDADE[base];
    if (par) {
        for (const [unidade, factor] of Object.entries(par)) {
            opcoes.push({ valor: unidade, factor, rotulo: unidade.toUpperCase() });
        }
    }
    return opcoes;
}

/** Converte um valor escrito numa unidade escolhida para a unidade base
 *  do artigo — ex. converterParaUnidadeBase(500, "g", "kg") -> 0.5. */
function converterParaUnidadeBase(valor, unidadeEscolhida, unidadeBase) {
    const base = (unidadeBase ?? "un").toLowerCase();
    const escolhida = (unidadeEscolhida ?? base).toLowerCase();
    if (escolhida === base) return valor;
    const factor = PARES_UNIDADE[base]?.[escolhida];
    return factor ? valor * factor : valor;
}

/**
 * Gera o código de lote pela fórmula do Excel "Gerador lotes":
 * AA + Categoria + DiaSemanaISO + NºProdução + DiaJuliano(3dig)
 * Partilhada entre admin.html (Criar lote) e producao.html (Produção diária)
 * — é a mesma fórmula, não pode divergir entre os dois ecrãs.
 *
 * Trabalha sempre em UTC a partir dos números (ano/mês/dia), nunca com
 * `new Date(...).getDay()` em hora local — Portugal muda a hora duas
 * vezes por ano, e isso desalinhava o dia juliano em 1 dia sempre que a
 * data de produção caía depois da mudança de Março (hora de Verão).
 */
function calcularCodigoLote(dataProducaoISO, categoria, numeroProducao) {
    const [ano4, mes, dia] = dataProducaoISO.split("-").map(Number);
    const dataUTC = Date.UTC(ano4, mes - 1, dia);
    const diaSemanaISO = new Date(dataUTC).getUTCDay() || 7; // 0 (domingo) → 7
    const inicioAnoUTC = Date.UTC(ano4, 0, 1);
    const diaJuliano = String(Math.round((dataUTC - inicioAnoUTC) / 86400000) + 1).padStart(3, "0");
    const ano = String(ano4 % 100).padStart(2, "0");
    return `${ano}${categoria}${diaSemanaISO}${numeroProducao}${diaJuliano}`;
}

/**
 * Validade sugerida = produção + 365 dias, tal como o Excel "Gerador
 * lotes". Também em UTC puro, pela mesma razão do de cima — sem isso, o
 * toISOString() podia "recuar" um dia sempre que a meia-noite local caía
 * em hora de Verão (GMT+1), porque converte para UTC antes de cortar a
 * data.
 */
function calcularValidadePadrao(dataProducaoISO) {
    const [ano4, mes, dia] = dataProducaoISO.split("-").map(Number);
    const dataUTC = new Date(Date.UTC(ano4, mes - 1, dia));
    dataUTC.setUTCDate(dataUTC.getUTCDate() + 365);
    return dataUTC.toISOString().slice(0, 10);
}

/**
 * A partir de uma lista de produção planeada [{artigo_id, quantidade}],
 * calcula quanto de cada matéria-prima é necessário (explosão de BOM,
 * somada entre todos os produtos do plano) e compara com o stock actual.
 * Devolve [{ artigo_id, designacao, necessario, stock, em_falta }],
 * ordenado por em_falta decrescente (o mais urgente primeiro).
 */
async function calcularNecessidadesMateriais(itensPlano) {
    if (!itensPlano.length) return [];

    const idsProdutos = itensPlano.map((i) => i.artigo_id);
    const { data: bom } = await supabaseClient
        .from("bom_componentes")
        .select("produto_id, componente_id, quantidade_por_unidade, componente:componente_id(designacao)")
        .in("produto_id", idsProdutos);

    const necessidadePorComponente = {};
    (bom ?? []).forEach((linha) => {
        const itemPlano = itensPlano.find((i) => i.artigo_id === linha.produto_id);
        if (!itemPlano) return;
        const necessario = linha.quantidade_por_unidade * itemPlano.quantidade;
        if (!necessidadePorComponente[linha.componente_id]) {
            necessidadePorComponente[linha.componente_id] = {
                artigo_id: linha.componente_id,
                designacao: linha.componente?.designacao ?? "—",
                necessario: 0,
            };
        }
        necessidadePorComponente[linha.componente_id].necessario += necessario;
    });

    const idsComponentes = Object.keys(necessidadePorComponente);
    if (!idsComponentes.length) return [];

    const { data: lotes } = await supabaseClient
        .from("lotes_artigo")
        .select("artigo_id, quantidade_atual")
        .in("artigo_id", idsComponentes);
    const stockPorArtigo = {};
    (lotes ?? []).forEach((l) => {
        stockPorArtigo[l.artigo_id] = (stockPorArtigo[l.artigo_id] || 0) + Number(l.quantidade_atual);
    });

    return Object.values(necessidadePorComponente)
        .map((n) => {
            const stock = stockPorArtigo[n.artigo_id] || 0;
            return { ...n, stock, em_falta: Math.max(0, n.necessario - stock) };
        })
        .sort((a, b) => b.em_falta - a.em_falta);
}

/**
 * Leva sempre ao ecrã inicial do PERFIL REAL de quem está logado — não da
 * página onde estás neste momento. Isto importa quando o admin está a
 * "visitar" o ecrã do Nuno/Fernando/Consulta: clicar no logótipo devolve-o
 * ao admin.html, não fica preso no ecrã que estava a visitar.
 */
async function irParaInicio() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { window.location.href = "index.html"; return; }
    window.location.href = "inicio.html";
}

let _cacheClientes = null;

/** Equivalente a obterTodosArtigos(), mas para clientes — usado pela
 *  pesquisa de cliente na Nova encomenda. */
async function obterTodosClientes() {
    if (_cacheClientes) return _cacheClientes;
    const { data, error } = await supabaseClient.from("clientes").select("cliente_id, nome").order("nome");
    if (error) { console.error(error); return []; }
    _cacheClientes = data;
    return data;
}

/**
 * Pesquisa de cliente por nome, com o mesmo padrão da pesquisa de artigo
 * (setas + Enter para escolher). Ao contrário da de artigo, permite
 * escrever um nome que ainda não existe — fica sem nada seleccionado no
 * campo escondido, e quem chama decide se cria um cliente novo com esse
 * nome (ver "Nova encomenda" no admin.html).
 */
async function activarPesquisaCliente(idTexto, idOculto, idResultados, onSelect) {
    const inputTexto = document.getElementById(idTexto);
    const inputOculto = document.getElementById(idOculto);
    const listaResultados = document.getElementById(idResultados);
    const clientes = await obterTodosClientes();

    let filtradosActuais = [];
    let indiceActivo = -1;

    function realcarItem() {
        listaResultados.querySelectorAll(".sugestao-item").forEach((el, i) => {
            el.classList.toggle("sugestao-activa", i === indiceActivo);
            if (i === indiceActivo) el.scrollIntoView({ block: "nearest" });
        });
    }

    function mostrarResultados(filtro) {
        const termo = filtro.trim().toLowerCase();
        filtradosActuais = termo
            ? clientes.filter((c) => c.nome.toLowerCase().includes(termo)).slice(0, 8)
            : clientes.slice(0, 8);
        indiceActivo = -1;
        listaResultados.innerHTML = filtradosActuais.length
            ? filtradosActuais.map((c) => `<div class="sugestao-item" data-id="${c.cliente_id}">${escaparHtml(c.nome)}</div>`).join("")
            : `<div class="sugestao-vazia">Sem clientes existentes com esse nome — fica por criar um novo</div>`;
        listaResultados.style.display = "block";
    }

    function seleccionar(cliente) {
        if (!cliente) return;
        inputOculto.value = cliente.cliente_id;
        inputTexto.value = cliente.nome;
        listaResultados.style.display = "none";
        if (onSelect) onSelect(cliente.cliente_id, cliente);
    }

    inputTexto.addEventListener("focus", () => mostrarResultados(inputTexto.value));
    inputTexto.addEventListener("input", () => {
        inputOculto.value = ""; // pode ser um nome novo — decide-se no submit
        mostrarResultados(inputTexto.value);
    });
    inputTexto.addEventListener("blur", () => {
        setTimeout(() => { listaResultados.style.display = "none"; }, 150);
    });
    inputTexto.addEventListener("keydown", (e) => {
        if (listaResultados.style.display === "none" || !filtradosActuais.length) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            indiceActivo = Math.min(indiceActivo + 1, filtradosActuais.length - 1);
            realcarItem();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            indiceActivo = Math.max(indiceActivo - 1, 0);
            realcarItem();
        } else if (e.key === "Enter") {
            if (indiceActivo >= 0) {
                e.preventDefault();
                seleccionar(filtradosActuais[indiceActivo]);
            } // sem item realçado, deixa o Enter seguir para submeter o formulário
        } else if (e.key === "Escape") {
            listaResultados.style.display = "none";
        }
    });
    listaResultados.addEventListener("click", (e) => {
        const item = e.target.closest(".sugestao-item");
        if (!item) return;
        seleccionar(clientes.find((c) => c.cliente_id === item.dataset.id));
    });
}

// --- Sistema de notificações (sino) -----------------------------------------
/** Corre uma vez ao carregar a página protegida — mostra o contador e
 *  actualiza-o periodicamente, sem precisares de recarregar a página. */
async function inicializarAlertas() {
    await actualizarContadorAlertas();
    setInterval(actualizarContadorAlertas, 45000);
}

async function actualizarContadorAlertas() {
    const badge = document.getElementById("badgeAlertasSino");
    if (!badge) return;
    const { count } = await supabaseClient.from("alertas").select("id", { count: "exact", head: true }).eq("lido", false);
    if (count) {
        badge.textContent = count > 9 ? "9+" : String(count);
        badge.style.display = "flex";
    } else {
        badge.style.display = "none";
    }
}

async function alternarPainelAlertas() {
    const painel = document.getElementById("painelAlertas");
    if (!painel) return;
    if (painel.style.display === "block") {
        painel.style.display = "none";
        return;
    }

    const { data, error } = await supabaseClient
        .from("alertas").select("*").order("criado_em", { ascending: false }).limit(30);
    if (error) { console.error(error); return; }

    painel.innerHTML = data.length ? "" : `<p class="sem-alertas">Sem alertas.</p>`;
    data.forEach((a) => {
        const item = document.createElement("div");
        item.className = `item-alerta ${a.lido ? "lido" : "nao-lido"}`;
        item.style.position = "relative";
        item.innerHTML = `
            <button class="fechar-alerta" aria-label="Eliminar alerta" style="position:absolute; top:8px; right:8px; background:none; border:none; cursor:pointer; color:var(--ink-suave); font-size:16px; line-height:1; padding:2px 4px;">×</button>
            <strong>${escaparHtml(a.titulo)}</strong>
            <p>${escaparHtml(a.corpo ?? "")}</p>
            <span class="data-alerta">${new Date(a.criado_em).toLocaleString("pt-PT")}</span>
        `;
        item.querySelector(".fechar-alerta").addEventListener("click", async (ev) => {
            ev.stopPropagation();
            const { error } = await supabaseClient.from("alertas").delete().eq("id", a.id);
            if (error) { toast("Erro ao eliminar: " + traduzirErro(error.message), "erro"); return; }
            item.remove();
            actualizarContadorAlertas();
        });
        item.addEventListener("click", async () => {
            if (!a.lido) {
                await supabaseClient.from("alertas").update({ lido: true }).eq("id", a.id);
            }
            // Cada página resolve a navegação à sua maneira: admin.html tem
            // separadores (mudarSecao), as restantes são de scroll único —
            // tenta a navegação por separador primeiro, senão desliza até
            // ao elemento com esse id.
            if (a.link_secao) {
                if (typeof mudarSecao === "function" && document.querySelector(`.nav-item[data-secao="${a.link_secao}"]`)) {
                    mudarSecao(a.link_secao);
                } else {
                    document.getElementById(a.link_secao)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }
            }
            painel.style.display = "none";
            actualizarContadorAlertas();
        });
        painel.appendChild(item);
    });
    painel.style.display = "block";
}

document.addEventListener("click", (e) => {
    const painel = document.getElementById("painelAlertas");
    const sino = document.getElementById("botaoSino");
    if (painel && painel.style.display === "block" && !painel.contains(e.target) && e.target !== sino && !sino?.contains(e.target)) {
        painel.style.display = "none";
    }
});

// --- Não-conformidades atribuídas a mim (widget partilhado por vários
// ecrãs — Produção, Armazém, Consulta, Admin, além do próprio Qualidade) —
// agora um separador permanente, com provas/soluções anexáveis. ----------
let _todasMinhasNc = [];
let _filtroMinhasNcActual = "todas";

async function carregarMinhasNcPartilhado(meuId) {
    const cartao = document.getElementById("cartaoMinhasNc");
    if (!cartao) return;
    const { data, error } = await supabaseClient
        .from("nc_responsaveis")
        .select("nao_conformidades(id, descricao, gravidade, prazo, estado, accao_correctiva)")
        .eq("perfil_id", meuId);
    if (error) { console.error(error); return; }

    _todasMinhasNc = (data ?? []).map((d) => d.nao_conformidades).filter(Boolean);

    const filtrosEl = document.getElementById("filtrosMinhasNc");
    if (filtrosEl && !filtrosEl.dataset.montado) {
        const estados = ["todas", "Pendente", "Em resolução", "Por confirmar", "Resolvida"];
        filtrosEl.innerHTML = estados.map((e) =>
            `<button data-estado="${e}" class="${e === "todas" ? "filtro-activo" : ""}">${e === "todas" ? "Todas" : e}</button>`
        ).join("");
        filtrosEl.querySelectorAll("button").forEach((btn) => {
            btn.addEventListener("click", () => {
                filtrosEl.querySelector(".filtro-activo")?.classList.remove("filtro-activo");
                btn.classList.add("filtro-activo");
                _filtroMinhasNcActual = btn.dataset.estado;
                renderizarMinhasNcPartilhado();
            });
        });
        filtrosEl.dataset.montado = "1";
    }
    if (filtrosEl) filtrosEl.style.display = _todasMinhasNc.length ? "flex" : "none";

    await renderizarMinhasNcPartilhado();
}

async function renderizarMinhasNcPartilhado() {
    const ncs = _filtroMinhasNcActual === "todas"
        ? _todasMinhasNc
        : _todasMinhasNc.filter((nc) => nc.estado === _filtroMinhasNcActual);

    const corpo = document.getElementById("corpoMinhasNc");
    corpo.innerHTML = ncs.length ? "" : `<p style="font-size:13px; color:var(--ink-suave);">Sem não-conformidades neste filtro.</p>`;

    for (const nc of ncs) {
        corpo.appendChild(await construirCartaoNc(nc));
    }
}

/** Constrói o bloco de uma não-conformidade — descrição, acção correctiva,
 *  anexos já existentes (provas/soluções), e os controlos para carregares
 *  mais (foto ou documento, incluindo a partir da câmara do telemóvel). */
async function construirCartaoNc(nc) {
    const div = document.createElement("div");
    div.style.cssText = "border:1px solid var(--linha); border-radius:var(--raio-peq); padding:14px; margin-bottom:12px;";

    const acaoEstado = nc.estado === "Por confirmar"
        ? `<span class="badge Carregada">Aguarda confirmação</span>`
        : `
            <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
                ${nc.estado === "Pendente" ? `<button class="secundario" onclick="mudarEstadoNcPartilhado('${nc.id}', 'Em resolução')">Em resolução</button>` : ""}
                <button onclick="marcarNcPorConfirmarPartilhado('${nc.id}')">Marcar resolvida</button>
            </div>
        `;

    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
            <div>
                <strong>${escaparHtml(nc.descricao)}</strong>
                <p style="font-size:12px; color:var(--ink-suave); margin:2px 0 0;">
                    ${escaparHtml(nc.gravidade)} · ${nc.prazo ? "Prazo: " + formatarData(nc.prazo) : "sem prazo"} · ${escaparHtml(nc.estado)}
                </p>
                ${nc.accao_correctiva ? `<p style="font-size:13px; margin:6px 0 0;">${escaparHtml(nc.accao_correctiva)}</p>` : ""}
            </div>
            <div>${acaoEstado}</div>
        </div>
        <div id="anexos-nc-${nc.id}" style="margin-top:10px;"></div>
        <div class="linha-form" style="margin-top:10px;">
            <label class="secundario" style="text-align:center; cursor:pointer; display:block;">
                Anexar prova
                <input type="file" accept="image/*,application/pdf,.doc,.docx" capture="environment" style="display:none;" onchange="carregarAnexoNc('${nc.id}', 'prova', this)">
            </label>
            <label class="secundario" style="text-align:center; cursor:pointer; display:block;">
                Anexar solução
                <input type="file" accept="image/*,application/pdf,.doc,.docx" capture="environment" style="display:none;" onchange="carregarAnexoNc('${nc.id}', 'solucao', this)">
            </label>
        </div>
    `;
    renderizarAnexosNc(nc.id, div.querySelector(`#anexos-nc-${nc.id}`));
    return div;
}

async function renderizarAnexosNc(ncId, container) {
    const { data, error } = await supabaseClient
        .from("nc_anexos")
        .select("id, tipo, caminho_ficheiro, nome_original, perfis(nome)")
        .eq("nao_conformidade_id", ncId)
        .order("carregado_em", { ascending: true });
    if (error) { console.error(error); return; }
    container.innerHTML = "";
    if (!data.length) return;

    const provas = data.filter((a) => a.tipo === "prova");
    const solucoes = data.filter((a) => a.tipo === "solucao");

    // Construído por DOM + addEventListener, não por onclick="..." com o
    // caminho interpolado — o caminho inclui o nome original do ficheiro
    // (controlado por quem faz o upload), e uma aspa nesse nome partia o
    // atributo HTML e corria código arbitrário para toda a gente que
    // visse os anexos. O mesmo cuidado que já era tomado nos nomes de
    // clientes/artigos noutros sítios do site.
    function construirLista(titulo, itens) {
        if (!itens.length) return;
        const p = document.createElement("p");
        p.style.cssText = "font-size:12px; font-weight:600; margin:8px 0 2px;";
        p.textContent = titulo;
        container.appendChild(p);
        itens.forEach((a) => {
            const link = document.createElement("a");
            link.href = "#";
            link.style.cssText = "display:block; font-size:13px; color:var(--accent-forte);";
            link.innerHTML = `<i class="ti ti-paperclip" style="font-size:13px; vertical-align:-1px;" aria-hidden="true"></i> ${escaparHtml(a.nome_original ?? "ficheiro")} <span style="color:var(--ink-suave);">— ${escaparHtml(a.perfis?.nome ?? "—")}</span>`;
            link.addEventListener("click", (e) => { e.preventDefault(); abrirAnexoNc(a.caminho_ficheiro); });
            container.appendChild(link);
        });
    }
    construirLista("Provas", provas);
    construirLista("Soluções", solucoes);
}

/** Núcleo do upload — recebe um File já em mãos, sem depender de um
 *  <input> vivo no ecrã. Devolve {ok, erro}, sem tocar em toasts/inputs,
 *  para poder ser reaproveitado tanto pelo botão "Anexar" normal como
 *  pelo fluxo da auditoria (onde os ficheiros ainda não têm nc_id
 *  quando são escolhidos). */
async function carregarFicheiroAnexoNc(ncId, tipo, ficheiro) {
    if (ficheiro.size > 15 * 1024 * 1024) return { ok: false, erro: "Ficheiro demasiado grande (máx. 15MB)." };
    const tiposPermitidos = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf",
        "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
    if (!tiposPermitidos.has(ficheiro.type)) return { ok: false, erro: "Formato não permitido. Usa JPG, PNG, WEBP, PDF, DOC ou DOCX." };

    // O nome do ficheiro (dado por quem carrega, nunca de confiar) só
    // entra no CAMINHO do Storage depois de limpo — sem isto, um nome com
    // aspas ou barras podia partir o caminho ou, pior, quebrar para fora
    // de um atributo HTML sempre que fosse mostrado (ver correcção em
    // renderizarAnexosNc). O nome original completo continua guardado à
    // parte (nome_original), esse sim mostrado ao utilizador, sempre
    // escapado.
    const nomeLimpo = ficheiro.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const caminho = `${ncId}/${Date.now()}_${nomeLimpo}`;
    const { error: erroUpload } = await supabaseClient.storage.from("nc-anexos").upload(caminho, ficheiro);
    if (erroUpload) return { ok: false, erro: erroUpload.message };

    const { error: erroRegisto } = await supabaseClient.from("nc_anexos").insert({
        nao_conformidade_id: ncId, tipo, caminho_ficheiro: caminho, nome_original: ficheiro.name, tipo_mime: ficheiro.type,
    });
    if (erroRegisto) return { ok: false, erro: erroRegisto.message };
    return { ok: true };
}

async function carregarAnexoNc(ncId, tipo, inputEl) {
    const ficheiro = inputEl.files[0];
    if (!ficheiro) return;
    const resultado = await carregarFicheiroAnexoNc(ncId, tipo, ficheiro);
    if (!resultado.ok) { toast("Erro ao carregar: " + resultado.erro, "erro"); return; }

    toast("Anexo carregado.", "sucesso");
    inputEl.value = "";
    renderizarAnexosNc(ncId, document.getElementById(`anexos-nc-${ncId}`));
}

async function abrirAnexoNc(caminho) {
    const { data, error } = await supabaseClient.storage.from("nc-anexos").createSignedUrl(caminho, 300);
    if (error) { toast("Não foi possível abrir o ficheiro: " + error.message, "erro"); return; }
    window.open(data.signedUrl, "_blank");
}

async function mudarEstadoNcPartilhado(ncId, novoEstado) {
    if (novoEstado !== "Em resolução") return;
    const { error } = await supabaseClient.rpc("iniciar_resolucao_nc_r322", { p_nc: ncId });
    if (error) { toast("Erro: " + traduzirErro(error.message), "erro"); return; }
    toast(`Marcado como "${novoEstado}".`, "sucesso");
    const { data: { session } } = await supabaseClient.auth.getSession();
    carregarMinhasNcPartilhado(session.user.id);
}

async function marcarNcPorConfirmarPartilhado(ncId) {
    const actual = _todasMinhasNc.find((nc) => nc.id === ncId);
    const accao = prompt("Descreve a ação corretiva realizada:", actual?.accao_correctiva ?? "");
    if (accao === null) return;
    const { error } = await supabaseClient.rpc("submeter_resolucao_nc_r322", { p_nc: ncId, p_accao: accao });
    if (error) { toast("Erro: " + error.message, "erro"); return; }
    toast("Marcado como resolvido — a Qualidade vai confirmar.", "sucesso");
    const { data: { session } } = await supabaseClient.auth.getSession();
    carregarMinhasNcPartilhado(session.user.id);
    actualizarContadorAlertas();
}

// --- Cabeçalho comum para todos os PDFs do site — logótipo + cores da
// marca, em vez de cada exportação desenhar o seu próprio título a preto
// e branco. ------------------------------------------------------------
let _logoBase64Cache = null;

async function obterLogoBase64() {
    if (_logoBase64Cache) return _logoBase64Cache;
    const resposta = await fetch("img/logo.png");
    const blob = await resposta.blob();
    _logoBase64Cache = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
    return _logoBase64Cache;
}

/** Desenha o logótipo + título + subtítulo no topo de um PDF já criado
 *  (new jsPDF()) — devolve o Y a partir do qual a tabela pode começar,
 *  para não sobrepor o cabeçalho. */
async function iniciarPdfComMarca(doc, titulo, subtitulo) {
    try {
        const logo = await obterLogoBase64();
        doc.addImage(logo, "PNG", 14, 10, 30, 13);
    } catch (erro) {
        console.error("Logótipo não carregou no PDF:", erro);
    }
    doc.setTextColor(34, 63, 56); // var(--accent-forte)
    doc.setFontSize(16);
    doc.text(titulo, 50, 18);
    if (subtitulo) {
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text(subtitulo, 50, 24);
    }
    doc.setTextColor(0, 0, 0);
    return 34;
}

// Estilo de cabeçalho de tabela a passar em headStyles nas chamadas a
// doc.autoTable(...) — cor da marca em vez do cinzento por defeito.
const ESTILO_CABECALHO_TABELA_PDF = { fillColor: [34, 63, 56] };

/** Alterna o menu do telemóvel (hambúrguer) — abre/fecha a barra lateral
 *  como um dropdown por baixo do logótipo. Não faz nada em ecrã largo
 *  (a barra já está sempre visível aí). */
function alternarMenuMobile() {
    document.querySelector(".barra-lateral")?.classList.toggle("aberta");
}
// Fecha ao clicares em qualquer coisa fora do próprio botão — cobre tanto
// "cliquei fora" como "escolhi uma secção/ligação lá dentro", que devem
// fechar o menu na mesma.
document.addEventListener("click", (e) => {
    const barra = document.querySelector(".barra-lateral");
    if (!barra?.classList.contains("aberta")) return;
    if (e.target.closest("#botaoMenuMobile")) return;
    barra.classList.remove("aberta");
});

// --- Cabeçalho: avatar em vez de email, com edição do próprio perfil ------
const AVATAR_PREDEFINIDO = "img/avatar-batardas.jpg";

async function obterUrlFotoPerfil(caminho) {
    if (!caminho) return AVATAR_PREDEFINIDO;
    const { data, error } = await supabaseClient.storage.from("fotos-perfil").createSignedUrl(caminho, 300);
    if (error) { console.error(error); return AVATAR_PREDEFINIDO; }
    return data.signedUrl;
}

function iniciaisDoNome(nome) {
    return (nome ?? "").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

/** Substitui o texto simples do nome no cabeçalho por um avatar clicável
 *  (foto, ou imagem Batardas predefinida) — clicar abre a edição do
 *  próprio perfil. */
async function renderizarCabecalhoUtilizador(perfil, userId) {
    const span = document.getElementById("nomeUtilizador");
    if (!span) return;
    const urlFoto = await obterUrlFotoPerfil(perfil.foto_caminho);
    span.innerHTML = `
        <button id="botaoAvatarPerfil" title="Editar o meu perfil" style="display:inline-flex; align-items:center; gap:8px; background:none; border:none; cursor:pointer; padding:2px; font:inherit; color:inherit;">
            <span style="width:28px; height:28px; border-radius:50%; background:var(--accent-forte); color:#fff; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:600; overflow:hidden; flex-shrink:0;">
                <img src="${urlFoto}" alt="" style="width:100%; height:100%; object-fit:cover;">
            </span>
            <span>${escaparHtml(perfil.nome)}</span>
        </button>
    `;
    document.getElementById("botaoAvatarPerfil").addEventListener("click", () => abrirModalEditarPerfil(perfil, userId));
    instalarPedidoRapidoManutencao(perfil);
}

async function abrirModalEditarPerfil(perfil, userId) {
    let modal = document.getElementById("modalEditarPerfil");
    if (modal) modal.remove();

    const urlFoto = await obterUrlFotoPerfil(perfil.foto_caminho);
    modal = document.createElement("div");
    modal.id = "modalEditarPerfil";
    modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:1000;";
    modal.innerHTML = `
        <div class="cartao" style="max-width:380px; width:90%; margin:0;">
            <h2>O meu perfil</h2>
            <div style="display:flex; justify-content:center; margin:12px 0;">
                <label for="epFoto" style="cursor:pointer; text-align:center;">
                    <div id="epPreviewFoto" style="width:80px; height:80px; border-radius:50%; background:var(--surface-recuado); display:flex; align-items:center; justify-content:center; overflow:hidden; margin:0 auto;">
                        <img src="${urlFoto}" alt="" style="width:100%; height:100%; object-fit:cover;">
                    </div>
                    <span style="font-size:12px; color:var(--ink-suave); display:block; margin-top:6px;">Trocar foto</span>
                </label>
                <input type="file" id="epFoto" accept="image/*" capture="environment" style="display:none;">
            </div>
            <input id="epNome" type="text" placeholder="Nome completo" value="${escaparHtml(perfil.nome)}">
            <input id="epAniversario" type="date" value="${perfil.data_aniversario ?? ""}">
            <input id="epEmailContacto" type="email" placeholder="Email de contacto (opcional)" value="${escaparHtml(perfil.email_contacto ?? "")}">
            <p style="font-size:12px; color:var(--ink-suave); margin:4px 0 12px;">Nome de utilizador: <strong>${escaparHtml(perfil.nome_utilizador ?? "—")}</strong> (não editável aqui)</p>
            <div class="linha-form">
                <button class="secundario" id="btnFecharModalPerfil">Cancelar</button>
                <button id="btnGuardarModalPerfil">Guardar</button>
            </div>
            <p id="erroModalPerfil" class="erro"></p>
        </div>
    `;
    document.body.appendChild(modal);

    let novoFicheiroFoto = null;
    document.getElementById("epFoto").addEventListener("change", (e) => {
        const ficheiro = e.target.files[0];
        if (!ficheiro) return;
        novoFicheiroFoto = ficheiro;
        const leitor = new FileReader();
        leitor.onload = (ev) => {
            document.getElementById("epPreviewFoto").innerHTML = `<img src="${ev.target.result}" style="width:100%; height:100%; object-fit:cover;">`;
        };
        leitor.readAsDataURL(ficheiro);
    });

    document.getElementById("btnFecharModalPerfil").addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });

    document.getElementById("btnGuardarModalPerfil").addEventListener("click", async () => {
        const erroEl = document.getElementById("erroModalPerfil");
        erroEl.textContent = "";
        const nome = document.getElementById("epNome").value.trim();
        const aniversario = document.getElementById("epAniversario").value || null;
        const emailContacto = document.getElementById("epEmailContacto").value.trim() || null;
        if (!nome) { erroEl.textContent = "O nome não pode ficar vazio."; return; }

        const registo = { nome, data_aniversario: aniversario, email_contacto: emailContacto };

        if (novoFicheiroFoto) {
            const nomeLimpo = novoFicheiroFoto.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const caminho = `${userId}/${Date.now()}_${nomeLimpo}`;
            const { error: erroUpload } = await supabaseClient.storage.from("fotos-perfil").upload(caminho, novoFicheiroFoto);
            if (erroUpload) { erroEl.textContent = "Erro ao carregar a foto: " + erroUpload.message; return; }
            registo.foto_caminho = caminho;
        }

        const { error } = await supabaseClient.from("perfis").update(registo).eq("id", userId);
        if (error) { erroEl.textContent = "Erro ao guardar: " + traduzirErro(error.message); return; }

        toast("Perfil actualizado.", "sucesso");
        modal.remove();
        const perfilActualizado = await obterPerfil(userId);
        renderizarCabecalhoUtilizador(perfilActualizado, userId);
    });
}

/** Chama a Edge Function notificar-alerta autenticada pela sessão actual
 *  — usada pelo botão "Enviar movimentos do dia" em Produção e Armazém.
 *  Mesmo padrão da chamarGestaoUtilizadores do admin.html. */
async function chamarNotificarAlerta(corpo) {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return { error: "Sessão expirada — actualiza a página e entra outra vez." };

        const resposta = await fetch(`${SUPABASE_URL}/functions/v1/notificar-alerta`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${session.access_token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(corpo),
        });

        const texto = await resposta.text();
        let dados;
        try {
            dados = JSON.parse(texto);
        } catch {
            return { error: `A função não respondeu correctamente (estado ${resposta.status}). Confirma em Supabase → Edge Functions se "notificar-alerta" está mesmo publicada.` };
        }
        if (!resposta.ok && !dados.error) {
            return { error: `Erro ${resposta.status}` };
        }
        return dados;
    } catch (erro) {
        return { error: "Não foi possível contactar o servidor: " + erro.message };
    }
}

async function actualizarContadorMovimentosPendentesEnvio() {
    const contadorEl = document.getElementById("contadorMovimentosPendentesEnvio");
    if (!contadorEl) return;
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    const [comLote,semLote] = await Promise.all([
        supabaseClient.from("movimentos_stock").select("*", { count: "exact", head: true }).eq("responsavel", session.user.id).in("estado_envio_email", ["por_enviar", "falhou"]),
        supabaseClient.from("movimentos_stock_sem_lote").select("*", { count: "exact", head: true }).eq("responsavel", session.user.id).in("estado_envio_email", ["por_enviar", "falhou"]),
    ]);
    contadorEl.textContent = (comLote.count ?? 0) + (semLote.count ?? 0);
}

async function enviarMovimentosDoDia() {
    const erroEl = document.getElementById("erroEnvioMovimentos");
    if (erroEl) erroEl.textContent = "";
    const btn = document.getElementById("btnEnviarMovimentosDia");
    if (btn) btn.disabled = true;

    const resultado = await chamarNotificarAlerta({ acao: "enviar_movimentos_dia" });

    if (btn) btn.disabled = false;
    if (resultado.error) { if (erroEl) erroEl.textContent = "Erro: " + resultado.error; return; }

    toast(`Enviados ${resultado.enviados} movimento(s) por email.`, "sucesso");
    actualizarContadorMovimentosPendentesEnvio();
}

const botaoEnviarMovimentosDia = document.getElementById("btnEnviarMovimentosDia");
if (botaoEnviarMovimentosDia) botaoEnviarMovimentosDia.addEventListener("click", enviarMovimentosDoDia);

async function terminarSessao() {
    sessionStorage.removeItem("batardas_modulos_abertos");
    await supabaseClient.auth.signOut();
    window.location.href = "index.html";
}

/**
 * Notificação discreta no canto do ecrã, em vez do alert() nativo do
 * browser — usa tipo "sucesso" ou "erro" para dar cor semântica.
 * Cria a zona de toasts sozinha se ainda não existir na página.
 */
function toast(mensagem, tipo = "info") {
    let zona = document.getElementById("zona-toasts");
    if (!zona) {
        zona = document.createElement("div");
        zona.id = "zona-toasts";
        document.body.appendChild(zona);
    }
    const el = document.createElement("div");
    el.className = `toast ${tipo}`;
    el.textContent = mensagem;
    zona.appendChild(el);
    setTimeout(() => el.remove(), 5000);
}

/**
 * Janela persistente para mostrar uma password gerada — não some sozinha
 * como o toast, porque a pessoa precisa de tempo para a copiar e partilhar.
 */
function mostrarModalPassword(titulo, password) {
    const fundo = document.createElement("div");
    fundo.style.cssText = "position:fixed; inset:0; background:rgba(32,31,28,0.5); display:flex; align-items:center; justify-content:center; z-index:2000;";
    fundo.innerHTML = `
        <div style="background:var(--surface); border-radius:14px; padding:28px; max-width:360px; width:90%; box-shadow:0 12px 40px rgba(0,0,0,0.25);">
            <h2 style="margin:0 0 6px; font-size:17px;">${escaparHtml(titulo)}</h2>
            <p style="font-size:13px; color:var(--ink-suave); margin:0 0 16px;">Partilha isto agora — não fica guardado em lado nenhum.</p>
            <div style="display:flex; gap:8px; align-items:center; background:var(--surface-recuado); border-radius:8px; padding:12px 14px; margin-bottom:16px;">
                <code class="mono" style="font-size:16px; flex:1;">${escaparHtml(password)}</code>
                <button class="secundario" id="btnCopiarPassword" style="padding:6px 12px; font-size:13px;">Copiar</button>
            </div>
            <button id="btnFecharModalPassword" style="width:100%;">Fechar</button>
        </div>
    `;
    document.body.appendChild(fundo);
    document.getElementById("btnCopiarPassword").addEventListener("click", async () => {
        await navigator.clipboard.writeText(password);
        toast("Password copiada.", "sucesso");
    });
    document.getElementById("btnFecharModalPassword").addEventListener("click", () => fundo.remove());
}
