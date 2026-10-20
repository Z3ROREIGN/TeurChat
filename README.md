# TeurChat

Rede social mobile-first com visual preto e branco, feed, perfis, publicações de foto/vídeo, seguidores, curtidas, comentários, itens salvos, busca, mensagens e notificações.

## Recursos implementados

- Cadastro, login, sessão persistente e perfis públicos.
- Feed “Para você” com classificação básica por recência e engajamento; feed “Seguindo”.
- Publicações de texto, imagens e vídeos, com prévia local antes de publicar.
- Foto de perfil, curtidas, comentários, seguir/deixar de seguir e exclusão das próprias publicações.
- Itens salvos e página “Salvos”.
- Busca de publicações por texto.
- Denúncias com motivo, detalhes e status de análise.
- Central de moderação para contas com a função confiável `app_metadata.role = "admin"`.
- Notificações para curtidas, comentários, novos seguidores e mensagens, contador de não lidas e atualizações em tempo real.
- Alertas do navegador quando o TeurChat está aberto e a permissão foi concedida.
- Mensagens privadas em tempo real.
- Supabase Storage com upload autenticado, pastas por usuário e limite de 100 MB por arquivo.
- Políticas RLS, índices e RPC de conversa endurecida, sem funções SECURITY DEFINER expostas diretamente no schema público.
- Funciona no Chrome móvel; instalar o PWA é opcional.

## Ativar a central de moderação

No Supabase, abra **Authentication → Users**, selecione a conta que será administradora e atribua no **app metadata** a propriedade:

```json
{ "role": "admin" }
```

Não coloque essa função em `user_metadata`, pois o próprio usuário pode alterar esse campo. Depois de alterar o app metadata, encerre e inicie a sessão novamente para atualizar o JWT. A política do banco verifica a função e protege a leitura/alteração das denúncias; esconder o botão no site não é a única barreira.

## Stack e configuração

- HTML, CSS e JavaScript.
- Supabase Auth, PostgreSQL, Row Level Security, Storage e Realtime.
- Vercel com deploy automático pela branch `main`.

`config.js` contém apenas a URL do projeto e uma chave publicável do Supabase. Nunca coloque uma chave `service_role` ou secret no frontend.

`supabase-schema.sql` documenta a estrutura completa e as migrações finais do projeto. As mudanças correspondentes já foram aplicadas e verificadas no banco conectado.

## Limites que ainda exigem infraestrutura adicional

- A classificação “Para você” é uma recomendação inicial por recência e engajamento, não um algoritmo de escala semelhante ao TikTok.
- Alertas do navegador funcionam enquanto a página está aberta; **push real quando o site está fechado** requer chaves VAPID e um serviço backend para enviar notificações.
- Ainda não há transmissão ao vivo nem editor avançado de vídeo com corte/renderização. Esses recursos exigem infraestrutura e testes adicionais; controles nativos de reprodução não são um editor.
- O upload de mídia é limitado a 100 MB por arquivo; os limites totais dependem do plano do Supabase.

## Verificação antes do lançamento público

O código JavaScript foi verificado quanto à sintaxe e a implantação da Vercel está como `READY`. O banco foi verificado para RLS em todas as 11 tabelas públicas e sem alertas atuais no advisor de segurança. Isso não substitui um teste de ponta a ponta em navegador com uma conta real. Antes de divulgar, teste cadastro/confirmação de e-mail, login, upload, reprodução, curtidas, comentários, mensagens, denúncias e recuperação de conta.

## Desenvolvimento

O projeto é estático: abra `index.html` por um servidor local ou use a Vercel. Revise o SQL antes de aplicar mudanças em outro projeto.
