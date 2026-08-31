// BATARDAS TESTES — Fase 02A r1. Ficheiro completo, apenas para Testes.
// A Secret key fica no servidor. O token do utilizador é sempre validado
// por Auth antes de consultar permissões ou executar uma operação administrativa.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
if (SUPABASE_URL !== "https://hjpnuustucrewqymsntv.supabase.co") {
    throw new Error("Esta versão de gerir-utilizadores só pode correr em Batardas-Testes.");
}

function obterSecretKey(): string {
    let keys: unknown;
    try {
        keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    } catch {
        throw new Error("Configuração SUPABASE_SECRET_KEYS inválida.");
    }
    const key = keys && typeof keys === "object" && !Array.isArray(keys)
        ? (keys as Record<string, unknown>).default : undefined;
    if (typeof key !== "string" || !key.trim()) {
        throw new Error('Secret key "default" não disponível em SUPABASE_SECRET_KEYS.');
    }
    return key;
}

const adminClient = createClient(SUPABASE_URL, obterSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const ORIGEM_SITE = "https://batardas26.github.io";
const ROLES = new Set(["admin", "consulta", "producao", "armazem", "qualidade", "manutencao"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMITE_CORPO = 8192;

function gerarPassword(): string {
    // 16 caracteres aleatórios de um alfabeto de 64 = 96 bits aleatórios.
    // Prefixo garante os quatro grupos de caracteres, sem reduzir a entropia.
    const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return "Aa1!" + Array.from(bytes, (b) => alfabeto[b & 63]).join("");
}

async function lerCorpo(req: Request): Promise<Record<string, unknown> | null> {
    if (!req.body) return null;
    const reader = req.body.getReader();
    const partes: Uint8Array[] = [];
    let tamanho = 0;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            tamanho += value.byteLength;
            if (tamanho > LIMITE_CORPO) {
                await reader.cancel();
                return null;
            }
            partes.push(value);
        }
        const bytes = new Uint8Array(tamanho);
        let pos = 0;
        for (const parte of partes) { bytes.set(parte, pos); pos += parte.byteLength; }
        const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed as Record<string, unknown> : null;
    } catch {
        return null;
    } finally {
        reader.releaseLock();
    }
}

serve(async (req: Request) => {
    const origin = req.headers.get("Origin");
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Vary": "Origin",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    };
    if (origin === ORIGEM_SITE) headers["Access-Control-Allow-Origin"] = ORIGEM_SITE;
    const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers });
    if (origin && origin !== ORIGEM_SITE) return json({ error: "Origem não autorizada." }, 403);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

    const token = req.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token || token.startsWith("sb_")) return json({ error: "Não autenticado." }, 401);

    try {
        // getUser(token) verifica a sessão em Auth; não é simples descodificação.
        const { data: { user }, error: erroAuth } = await adminClient.auth.getUser(token);
        if (erroAuth || !user) return json({ error: "Sessão inválida. Volta a entrar." }, 401);

        const { data: perfil, error: erroPerfil } = await adminClient.from("perfis")
            .select("role, super_admin").eq("id", user.id).single();
        if (erroPerfil || !perfil || perfil.role !== "admin") {
            return json({ error: "Só administradores podem gerir utilizadores." }, 403);
        }
        if (!(req.headers.get("Content-Type") ?? "").toLowerCase().startsWith("application/json")) {
            return json({ error: "O pedido deve ser JSON." }, 415);
        }
        const corpo = await lerCorpo(req);
        if (!corpo) return json({ error: "Pedido inválido ou demasiado grande." }, 400);
        const superAdmin = perfil.super_admin === true;

        if (corpo.acao === "listar_utilizadores") {
            const { data, error } = await adminClient.from("perfis")
                .select("id, nome, role, super_admin, nome_utilizador, email_contacto").order("nome");
            if (error) return json({ error: "Não foi possível listar utilizadores." }, 503);
            return json({ utilizadores: data ?? [] });
        }

        if (corpo.acao === "criar_utilizador") {
            if (!superAdmin) return json({ error: "Só o super admin pode criar utilizadores novos." }, 403);
            const { nomeUtilizador, nome, role, emailContacto } = corpo;
            if (typeof nomeUtilizador !== "string" || typeof nome !== "string" ||
                typeof role !== "string" || !ROLES.has(role)) {
                return json({ error: "Nome, utilizador ou perfil inválido." }, 400);
            }
            const login = nomeUtilizador.trim().toLowerCase();
            const nomeLimpo = nome.trim();
            if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(login) || !nomeLimpo || nomeLimpo.length > 120) {
                return json({ error: "Usa um nome até 120 caracteres e um utilizador de 3 a 64 caracteres: letras, números, ponto, hífen ou underscore, começando por letra ou número." }, 400);
            }
            if (emailContacto != null && typeof emailContacto !== "string") {
                return json({ error: "Email de contacto inválido." }, 400);
            }
            const email = typeof emailContacto === "string" ? emailContacto.trim() : "";
            if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
                return json({ error: "Email de contacto inválido." }, 400);
            }
            const password = gerarPassword();
            const { data: criado, error: erroCriar } = await adminClient.auth.admin.createUser({
                email: `${login}@login.batardas.interno`, password, email_confirm: true,
            });
            if (erroCriar || !criado?.user?.id) {
                return json({ error: "Não foi possível criar a conta. Confirma se o utilizador já existe e as regras de password em Authentication." }, 400);
            }
            // Apenas campos permitidos: o corpo nunca pode atribuir super_admin.
            let perfilCriado = false;
            try {
                const { error } = await adminClient.from("perfis").insert({
                    id: criado.user.id, nome: nomeLimpo, role, super_admin: false,
                    nome_utilizador: login, email_contacto: email || null,
                });
                perfilCriado = !error;
            } catch { /* Compensar também se o cliente lançar uma exceção. */ }
            if (!perfilCriado) {
                let removido = false;
                try {
                    const { error } = await adminClient.auth.admin.deleteUser(criado.user.id);
                    removido = !error;
                } catch { /* Não anunciar rollback que não foi confirmado. */ }
                return json({ error: removido
                    ? "O perfil não foi criado. A conta nova foi removida; nenhum acesso foi entregue."
                    : "Falhou a criação do perfil e não foi possível confirmar a remoção da conta nova. Para e verifica Authentication → Users antes de repetir." }, 503);
            }
            return json({ ok: true, password, nomeUtilizador: login });
        }

        if (corpo.acao === "repor_password") {
            const userId = corpo.userId;
            if (typeof userId !== "string" || !UUID.test(userId)) {
                return json({ error: "Identificador de utilizador inválido." }, 400);
            }
            // Fail closed: perfil em falta, erro ou super_admin não booleano
            // nunca permitem uma reposição, mesmo a um superadministrador.
            const { data: alvo, error } = await adminClient.from("perfis")
                .select("id, role, super_admin").eq("id", userId).single();
            if (error || !alvo || typeof alvo.super_admin !== "boolean") {
                return json({ error: "Não foi possível confirmar as permissões da conta de destino." }, 403);
            }
            if (alvo.super_admin && !superAdmin) {
                return json({ error: "Só um super admin pode repor a password de um super admin." }, 403);
            }
            const password = gerarPassword();
            const { error: erroRepor } = await adminClient.auth.admin.updateUserById(userId, { password });
            if (erroRepor) return json({ error: "Não foi possível repor a password." }, 503);
            return json({ ok: true, password });
        }
        return json({ error: "Acção desconhecida." }, 400);
    } catch {
        // Nunca expor mensagens de SDK, token, chave, corpo ou password em logs/respostas.
        return json({ error: "Falha temporária do serviço. Não repitas uma criação sem verificar primeiro a lista de contas." }, 503);
    }
});
