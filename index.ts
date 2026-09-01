// Supabase Edge Function — envia o resumo do dia por email, quando alguém
// carrega no botão "Enviar movimentos do dia" (Produção ou Armazém).
//
// Deixou de ser disparada por Database Webhooks — por pedido explícito,
// não se quer um email por cada movimento/pedido/artigo, só um resumo
// junto quando a pessoa decide enviar. Chamada directamente pela app,
// com o token de sessão de quem está a carregar no botão (mesmo padrão
// de autenticação da gerir-utilizadores).
//
// Usa a API da Resend (https://resend.com) para enviar o email.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
// Aceita um ou vários emails no mesmo secret, separados por vírgula — ex.
// "francisco@batardas.pt, monica@batardas.pt".
const EMAILS_ADMIN = Deno.env.get("EMAIL_ALERTA_DESTINO")!
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
const EMAIL_REMETENTE = Deno.env.get("EMAIL_ALERTA_REMETENTE") ?? "alertas@resend.dev";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
function obterSecretKeyAdministrativa(): string {
    let chaves: unknown;
    try {
        chaves = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    } catch {
        // Nunca propagar o erro do parser: pode incluir excertos do segredo.
        throw new Error("Configuração SUPABASE_SECRET_KEYS inválida.");
    }

    const chave = chaves && typeof chaves === "object" && !Array.isArray(chaves)
        ? (chaves as Record<string, unknown>).default
        : undefined;
    if (typeof chave !== "string" || !chave.trim()) {
        throw new Error('Secret key "default" não disponível em SUPABASE_SECRET_KEYS.');
    }
    return chave;
}

const ADMIN_SECRET_KEY = obterSecretKeyAdministrativa();
const adminClient = createClient(SUPABASE_URL, ADMIN_SECRET_KEY);

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
};

function json(corpo: unknown, status = 200) {
    return new Response(JSON.stringify(corpo), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

async function enviarEmail(destinatarios: string[], assunto: string, corpo: string) {
    if (!destinatarios.length) {
        return { ok: false, erro: "Sem destinatários configurados (EMAIL_ALERTA_DESTINO)." };
    }
    const resposta = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: EMAIL_REMETENTE, to: destinatarios, subject: assunto, html: corpo }),
    });
    if (!resposta.ok) {
        return { ok: false, erro: await resposta.text() };
    }
    return { ok: true };
}

function linhaTabela(colunas: string[]) {
    return `<tr>${colunas.map((c) => `<td style="padding:6px 10px; border-bottom:1px solid #eee; font-size:13px;">${c}</td>`).join("")}</tr>`;
}

function escaparHtmlEmail(valor: unknown) {
    return String(valor ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c] as string));
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: erroUtilizador } = await userClient.auth.getUser();
    if (erroUtilizador || !user) return json({ error: "Sessão inválida" }, 401);

    const { data: perfil } = await adminClient.from("perfis").select("nome, role").eq("id", user.id).single();
    if (!perfil || !["producao", "armazem", "admin"].includes(perfil.role)) {
        return json({ error: "Sem permissão para enviar isto" }, 403);
    }

    const { acao, inventarioId } = await req.json();

    if (acao === "enviar_movimentos_dia") {
        const { data: envioId, error: erroPreparar } = await adminClient.rpc("preparar_envio_movimentos_r3", { p_utilizador: user.id });
        if (erroPreparar) {
            const semMovimentos = erroPreparar.message.includes("SEM_MOVIMENTOS_POR_ENVIAR");
            return json({ error: semMovimentos ? "Não tens movimentos por enviar." : erroPreparar.message }, 400);
        }

        const { data: itens, error: erroItens } = await adminClient
            .from("envio_movimento_itens")
            .select(`movimentos_stock(
                tipo, quantidade, unidade_movimentacao, data_movimento, observacoes,
                lotes_artigo!movimentos_stock_lote_artigo_id_fkey(numero_lote, artigos(designacao)),
                lote_destino:lotes_artigo!movimentos_stock_lote_artigo_destino_id_fkey(numero_lote, artigos(designacao))
            ), movimentos_stock_sem_lote(
                tipo, quantidade, unidade_movimentacao, ocorrido_em, observacoes,
                artigos(designacao),
                origem:localizacoes!movimentos_stock_sem_lote_localizacao_origem_id_fkey(nome),
                destino:localizacoes!movimentos_stock_sem_lote_localizacao_destino_id_fkey(nome)
            )`).eq("envio_id", envioId);
        if (erroItens) {
            await adminClient.rpc("concluir_envio_movimentos_r3", { p_envio: envioId, p_sucesso: false, p_erro: erroItens.message });
            return json({ error: "Não foi possível preparar o resumo." }, 400);
        }
        const movimentos = (itens ?? []).map((i: any) => i.movimentos_stock ?? (i.movimentos_stock_sem_lote ? {
            ...i.movimentos_stock_sem_lote,
            data_movimento: i.movimentos_stock_sem_lote.ocorrido_em,
            sem_lote: true,
        } : null)).filter(Boolean);

        const linhas = movimentos.map((m) => {
            const origem = m.sem_lote
                ? `${escaparHtmlEmail(m.artigos?.designacao ?? "—")} · sem lote · ${escaparHtmlEmail(m.origem?.nome ?? "—")}`
                : m.lotes_artigo
                ? `${escaparHtmlEmail((m.lotes_artigo as any).artigos?.designacao ?? "—")} · lote ${escaparHtmlEmail((m.lotes_artigo as any).numero_lote)}`
                : "—";
            const destino = m.sem_lote
                ? escaparHtmlEmail(m.destino?.nome ?? "")
                : m.lote_destino
                ? `${escaparHtmlEmail((m.lote_destino as any).artigos?.designacao ?? "—")} · lote ${escaparHtmlEmail((m.lote_destino as any).numero_lote)}`
                : "";
            return linhaTabela([
                new Date(m.data_movimento).toLocaleString("pt-PT"),
                escaparHtmlEmail(m.tipo),
                origem,
                destino,
                `${escaparHtmlEmail(m.quantidade)} ${escaparHtmlEmail(m.unidade_movimentacao)}`,
                escaparHtmlEmail(m.observacoes ?? ""),
            ]);
        }).join("");

        const corpo = `
            <p><strong>${escaparHtmlEmail(perfil.nome)}</strong> enviou os movimentos de stock ainda não enviados — falta passar isto para o Primavera.</p>
            <table style="border-collapse:collapse; width:100%;">
                <thead>
                    <tr>
                        <th style="text-align:left; padding:6px 10px; font-size:12px; border-bottom:2px solid #ccc;">Data</th>
                        <th style="text-align:left; padding:6px 10px; font-size:12px; border-bottom:2px solid #ccc;">Tipo</th>
                        <th style="text-align:left; padding:6px 10px; font-size:12px; border-bottom:2px solid #ccc;">Origem</th>
                        <th style="text-align:left; padding:6px 10px; font-size:12px; border-bottom:2px solid #ccc;">Destino</th>
                        <th style="text-align:left; padding:6px 10px; font-size:12px; border-bottom:2px solid #ccc;">Quantidade</th>
                        <th style="text-align:left; padding:6px 10px; font-size:12px; border-bottom:2px solid #ccc;">Observações</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
            <p style="margin-top:14px;">Depois de passares para o Primavera, marca cada um como "Registado" na secção "Movimentos por registar" do teu ecrã.</p>
        `;

        const resultado = await enviarEmail(EMAILS_ADMIN, `Movimentos de stock — ${perfil.nome} — ${new Date().toLocaleDateString("pt-PT")}`, corpo);
        await adminClient.rpc("concluir_envio_movimentos_r3", {
            p_envio: envioId, p_sucesso: resultado.ok,
            p_erro: resultado.ok ? null : "Falha no serviço de email",
        });
        if (!resultado.ok) return json({ error: "O serviço de email recusou o envio. O lote ficou disponível para tentar novamente." }, 400);

        return json({ ok: true, enviados: movimentos.length, envioId });
    }

    if (acao === "enviar_inventario_revisto") {
        if (perfil.role !== "admin") return json({ error: "Só o admin envia isto" }, 403);
        if (!inventarioId) return json({ error: "Falta o inventarioId" }, 400);

        const { data: inventario } = await adminClient
            .from("inventarios")
            .select("localizacoes(nome)")
            .eq("id", inventarioId)
            .single();
        const nomeZona = inventario?.localizacoes?.nome ?? "—";

        const { data: itens, error } = await adminClient
            .from("inventario_itens")
            .select("numero_lote, quantidade_esperada, quantidade_contada, artigos(designacao)")
            .eq("inventario_id", inventarioId);
        if (error) return json({ error: error.message }, 400);

        const comDiferenca = (itens ?? []).filter(
            (i) => i.quantidade_contada !== null && Number(i.quantidade_contada) !== Number(i.quantidade_esperada)
        );

        const linhas = comDiferenca.map((i) => {
            const diferenca = Number(i.quantidade_contada) - Number(i.quantidade_esperada);
            const cor = diferenca < 0 ? "color:#bc202e;" : "";
            return linhaTabela([
                (i.artigos as any)?.designacao ?? "—",
                i.numero_lote,
                String(i.quantidade_esperada),
                String(i.quantidade_contada),
                `<span style="${cor}">${diferenca > 0 ? "+" : ""}${diferenca}</span>`,
            ]);
        }).join("");

        const corpo = `
            <p>O inventário da zona <strong>${nomeZona}</strong> foi revisto e o stock já foi ajustado no site.</p>
            <p>Resumo das diferenças, para carregares no Primavera:</p>
            <table style="border-collapse:collapse; width:100%;">
                <thead>
                    <tr>
                        <th style="text-align:left; padding:6px 10px; font-size:12px; border-bottom:2px solid #ccc;">Artigo</th>
                        <th style="text-align:left; padding:6px 10px; font-size:12px; border-bottom:2px solid #ccc;">Lote</th>
                        <th style="text-align:left; padding:6px 10px; font-size:12px; border-bottom:2px solid #ccc;">Esperado</th>
                        <th style="text-align:left; padding:6px 10px; font-size:12px; border-bottom:2px solid #ccc;">Contado</th>
                        <th style="text-align:left; padding:6px 10px; font-size:12px; border-bottom:2px solid #ccc;">Diferença</th>
                    </tr>
                </thead>
                <tbody>${linhas || `<tr><td colspan="5" style="padding:8px;">Sem diferenças — tudo bateu certo.</td></tr>`}</tbody>
            </table>
        `;

        const resultado = await enviarEmail(EMAILS_ADMIN, `Inventário revisto — ${nomeZona}`, corpo);
        if (!resultado.ok) return json({ error: resultado.erro }, 400);

        return json({ ok: true });
    }

    return json({ error: "Acção desconhecida" }, 400);
});
