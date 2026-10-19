# TeurChat

Rede social mobile-first, com identidade visual preta e branca, que combina feed social, publicações com foto/vídeo, perfis, seguidores, curtidas, comentários, itens salvos, notificações e mensagens em tempo real.

## Recursos

- Cadastro, login, sessão persistente e perfil público.
- Feed “Para você” e feed “Seguindo”.
- Publicações de texto, fotos e vídeos; prévia local antes de publicar.
- Fotos de perfil, denúncia de publicações e registro seguro de denúncias para moderação.
- Supabase Storage com bucket público de mídia, upload autenticado, pastas separadas por usuário e limite de 100 MB por arquivo.
- Reprodução de vídeo no feed com controles nativos e suporte a telas móveis.
- Curtidas, comentários, seguir/deixar de seguir e excluir as próprias publicações.
- Salvar/remover publicações e página “Salvos”.
- Busca de publicações no banco de dados.
- Notificações para curtidas, comentários, novos seguidores e mensagens.
- Mensagens privadas em tempo real, com conversas criadas pelo RPC validado.
- Políticas RLS, funções com permissões restritas, índices e PWA instalável.
- Funciona no navegador móvel; instalar o PWA é opcional.

## Stack

- HTML, CSS e JavaScript.
- Supabase Auth, PostgreSQL, Row Level Security, Storage e Realtime.
- Vercel com deploy automático a partir da branch `main`.

## Configuração

O arquivo `config.js` usa apenas a URL do projeto e uma chave publicável do Supabase. **Nunca** coloque uma chave `service_role` ou uma chave secreta no frontend.

O esquema completo, incluindo Storage, bookmarks, notificações, triggers e políticas, está em `supabase-schema.sql`. No projeto TeurChat, as alterações já foram aplicadas pelo conector e verificadas no banco.

## Limites atuais

- Upload por arquivo limitado a 100 MB pelo bucket. Limites de transferência e armazenamento dependem do plano do Supabase.
- A busca atual localiza publicações por texto; não é um mecanismo de recomendação algorítmica como o TikTok.
- As denúncias são registradas para revisão, mas ainda não existe painel administrativo dedicado nem moderação automatizada. Também não há transmissão ao vivo, edição avançada de vídeo ou notificações push nativas.
- Antes de um lançamento público, faça testes reais de cadastro, confirmação de e-mail, upload, reprodução, mensagens e recuperação de conta nas configurações de Auth do Supabase.

## Desenvolvimento

O projeto é estático: abra `index.html` por um servidor local ou faça deploy na Vercel. Para mudanças no banco, revise `supabase-schema.sql` antes de aplicar.
