# TeurChat

Aplicativo social mobile-first com identidade visual preta e branca, PWA instalável, autenticação e dados conectados ao Supabase.

## Recursos implementados no cliente

- Autenticação por e-mail e senha usando Supabase Auth.
- Perfil público com nome de usuário, nome de exibição e bio, criado automaticamente no cadastro.
- Feed de publicações compartilhadas entre contas e dispositivos, com aba Seguindo.
- Curtidas e comentários armazenados no banco.
- Busca nas publicações carregadas.
- Mensagens diretas por nome de usuário e atualização em tempo real quando o Realtime estiver habilitado.
- Seguir/deixar de seguir, políticas RLS no esquema SQL e função validada para iniciar conversas diretas.
- Layout responsivo e experiência PWA.

## Configuração obrigatória do Supabase

1. Abra o projeto Supabase **TeurChat** e confirme que está usando o projeto correto.
2. Em **SQL Editor**, execute o arquivo `supabase-schema.sql` completo. Ele cria as tabelas, políticas RLS, permissões da Data API e a função `start_conversation` usada para iniciar mensagens diretas. Se as tabelas já existirem, o script usa `if not exists`/políticas substituíveis para aplicar a estrutura complementar.
3. Em **Authentication → Providers**, habilite Email. Configure a confirmação de e-mail de acordo com sua preferência.
4. Em **Authentication → URL Configuration**, configure a Site URL e Redirect URLs para o endereço real publicado do TeurChat.
5. Em **Project Settings → API** (ou **Connect**), copie a **Project URL** e a **Publishable key** ou a chave pública legada `anon`.
6. Edite `config.js` e preencha `supabaseUrl` e `supabaseAnonKey`. Essas credenciais públicas podem estar no cliente; **nunca** use uma `service_role` ou chave `secret`.
7. Faça commit e aguarde o deploy do site.
8. No Dashboard, habilite Realtime para as tabelas `posts` e `messages` se ainda não estiverem no publication `supabase_realtime`.

## Testes de verificação após configurar

- Criar conta com e-mail confirmado e entrar/sair.
- Criar publicações em uma conta e conferir se aparecem em outra.
- Curtir, remover curtida, comentar e excluir uma publicação própria.
- Atualizar nome de exibição e bio.
- Iniciar conversa com outro usuário usando o nome de usuário, enviar mensagens e conferir que uma terceira conta não consegue ler a conversa.
- Conferir as abas de segurança do Supabase e corrigir alertas antes de abrir ao público.

## Instalação

Publique em HTTPS. No Android/Chrome, abra o menu do navegador e escolha **Instalar app** ou **Adicionar à tela inicial**. Depois abra pelo ícone instalado. O bloqueio fora do modo instalado é apenas uma barreira de experiência, não um mecanismo de segurança.

## Estado de conexão

O cliente está preparado para usar o Supabase, mas precisa dos valores reais no arquivo `config.js` e da execução do esquema no projeto correto. Não considere a implantação pronta até passar os testes acima. Não coloque senhas, tokens de usuário ou chaves secret no repositório.
