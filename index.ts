// Supabase Edge Function — gestão de utilizadores (criar + repor password)
//
// Corre do lado do servidor porque estas acções exigem uma Secret key,
// que nunca pode estar no código do browser (dava acesso total à base de
// dados a qualquer pessoa que abrisse "ver código-fonte" na página).
//
// SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SECRET_KEYS são injectadas
// automaticamente pelo Supabase. SUPABASE_SECRET_KEYS é um objecto JSON;
// usamos a chave nova chamada "default", nunca a Legacy service_role.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function gerarPassword(): string {
    // Legível o suficiente para comunicar por telefone/papel, mas com
    // entropia real: 6 dígitos (1M combinações) em vez de 4 — com o
    // Attack Protection do Supabase sem CAPTCHA activo, 4 dígitos (9000
    // hipóteses) era adivinhável por tentativa e erro.
    const digitos = Math.floor(100000 + Math.random() * 900000);
    return `Batardas-${digitos}`;
}

// Domínio interno, nunca mostrado nem usado para enviar nada — o
// Supabase Auth exige um "email" por baixo, mas o login passou a ser só
// por nome de utilizador (ex. "f.sena"). Ver email_contacto em "perfis"
// para onde os alertas por email realmente vão.
const DOMINIO_LOGIN_INTERNO = "login.batardas.interno";
const AREAS_OPERACIONAIS = new Set(["producao", "armazem", "qualidade", "manutencao", "administracao"]);
const NIVEIS_OPERACIONAIS = new Set(["consulta", "operador", "responsavel", "admin"]);

function normalizarNomeUtilizador(valor: string): string {
    return valor.trim().toLowerCase();
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    // Verifica QUEM está a chamar isto, usando o próprio token dele — nunca
    // confiar cegamente num "sou admin" vindo do corpo do pedido.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: erroUtilizador } = await userClient.auth.getUser();
    if (erroUtilizador || !user) return json({ error: "Sessão inválida" }, 401);

    const { data: perfil } = await adminClient.from("perfis").select("role, super_admin").eq("id", user.id).single();
    if (perfil?.role !== "admin") {
        return json({ error: "Só administradores podem gerir utilizadores" }, 403);
    }

    const { acao, ...corpo } = await req.json();

    // Criar contas novas fica reservado ao super admin — o admin de
    // gestão pode repor passwords de quem já ficou bloqueado, mas não
    // pode criar acessos novos nem, por extensão, dar-se a si próprio
    // mais permissões.
    if (acao === "criar_utilizador" && !perfil.super_admin) {
        return json({ error: "Só o super admin pode criar utilizadores novos" }, 403);
    }

    if (acao === "listar_utilizadores") {
        const { data: perfis, error } = await adminClient.from("perfis").select("id, nome, role, super_admin, nome_utilizador, email_contacto");
        if (error) return json({ error: error.message }, 400);
        return json({ utilizadores: perfis });
    }

    if (acao === "criar_utilizador") {
        const { nomeUtilizador, nome, role, emailContacto, permissoesOperacionais = [] } = corpo;
        if (!nomeUtilizador || !nome || !role) return json({ error: "Faltam dados" }, 400);
        if (!Array.isArray(permissoesOperacionais)) return json({ error: "Permissões operacionais inválidas" }, 400);

        const permissoesPorArea = new Map<string, string>();
        for (const permissao of permissoesOperacionais) {
            const area = typeof permissao?.area === "string" ? permissao.area : "";
            const nivel = typeof permissao?.nivel === "string" ? permissao.nivel : "";
            if (!AREAS_OPERACIONAIS.has(area) || !NIVEIS_OPERACIONAIS.has(nivel)) {
                return json({ error: "Área ou nível operacional inválido" }, 400);
            }
            permissoesPorArea.set(area, nivel);
        }

        const nomeUtilizadorLimpo = normalizarNomeUtilizador(nomeUtilizador);
        if (!/^[a-z0-9._-]+$/.test(nomeUtilizadorLimpo)) {
            return json({ error: "Nome de utilizador só pode ter letras, números, pontos, hífens ou underscores" }, 400);
        }
        const emailLogin = `${nomeUtilizadorLimpo}@${DOMINIO_LOGIN_INTERNO}`;

        const passwordInicial = gerarPassword();
        const { data: novoUtilizador, error: erroCriar } = await adminClient.auth.admin.createUser({
            email: emailLogin,
            password: passwordInicial,
            email_confirm: true,
            user_metadata: { deve_alterar_password: true },
        });
        if (erroCriar) return json({ error: erroCriar.message }, 400);

        const { error: erroPerfil } = await adminClient
            .from("perfis")
            .insert({ id: novoUtilizador.user.id, nome, role, nome_utilizador: nomeUtilizadorLimpo, email_contacto: emailContacto || null, perfil_completo: false, deve_alterar_password: true });
        if (erroPerfil) {
            // O utilizador de autenticação já foi criado — sem o perfil,
            // ficava uma conta órfã capaz de fazer login mas sem role
            // nenhum. Desfaz o utilizador para não deixar isto pela
            // metade.
            await adminClient.auth.admin.deleteUser(novoUtilizador.user.id);
            return json({ error: erroPerfil.message }, 400);
        }

        if (permissoesPorArea.size) {
            const acessos = [...permissoesPorArea].map(([area, nivel]) => ({ perfil_id: novoUtilizador.user.id, area, nivel, atribuido_por: user.id }));
            const { error: erroAcessos } = await adminClient.from("acessos_area_r31").upsert(acessos, { onConflict: "perfil_id,area" });
            if (erroAcessos) {
                await adminClient.auth.admin.deleteUser(novoUtilizador.user.id);
                return json({ error: erroAcessos.message }, 400);
            }
        }

        return json({ ok: true, password: passwordInicial, nomeUtilizador: nomeUtilizadorLimpo });
    }

    if (acao === "repor_password") {
        const { userId } = corpo;
        if (!userId) return json({ error: "Falta o utilizador" }, 400);

        // Sem isto, um admin de gestão conseguia repor a password do
        // super admin e assumir a conta dele por completo — a separação
        // de níveis não valia nada se este caminho ficasse aberto.
        if (!perfil.super_admin) {
            const { data: perfilAlvo } = await adminClient.from("perfis").select("super_admin").eq("id", userId).single();
            if (perfilAlvo?.super_admin) {
                return json({ error: "Só o super admin pode repor a própria password" }, 403);
            }
        }

        const novaPassword = gerarPassword();
        const { error: erroMarcarTemporaria } = await adminClient.from("perfis").update({ deve_alterar_password: true }).eq("id", userId);
        if (erroMarcarTemporaria) return json({ error: erroMarcarTemporaria.message }, 400);
        const { error } = await adminClient.auth.admin.updateUserById(userId, {
            password: novaPassword,
            user_metadata: { deve_alterar_password: true },
        });
        if (error) return json({ error: error.message }, 400);

        return json({ ok: true, password: novaPassword });
    }

    return json({ error: "Acção desconhecida" }, 400);
});
