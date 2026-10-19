# TeurChat

Aplicativo social com identidade visual preta e branca, experiência mobile-first e instalação como PWA.

## O que está nesta primeira base

- Tela de instalação antes de entrar na experiência social; em navegador comum o feed fica bloqueado.
- Manifest e service worker para instalação e cache básico.
- Feed social com publicações, curtidas locais, busca e layout responsivo inspirado em apps de vídeos curtos.
- Telas iniciais de perfil, autenticação visual e mensagens.
- Interface em português, tema preto e branco.

## Importante: estado atual

Esta é uma base inicial de interface, não uma rede social pronta para produção. Login, contas, publicações, curtidas e mensagens ainda usam armazenamento local do navegador/dispositivo em partes da interface. Isso **não** cria contas seguras nem sincroniza dados entre pessoas e dispositivos. Não use senhas reais nesta versão.

Para tornar o serviço real, conecte Supabase:
1. Ative Authentication (e-mail/senha e confirmação de e-mail).
2. Crie tabelas para profiles, posts, likes, comments, conversations e messages.
3. Ative Row Level Security (RLS) e políticas para cada operação.
4. Guarde imagens/vídeos no Supabase Storage com limites de tamanho e validação.
5. Use Realtime para mensagens e atualizações de feed.
6. Configure as variáveis públicas do Supabase no ambiente de deploy; nunca coloque service-role keys no cliente.

## Instalação

Publique o site em HTTPS. Em Android/Chrome, abra o menu do navegador e escolha **Instalar app** ou **Adicionar à tela inicial**. No desktop, use o ícone de instalação compatível do navegador. Depois, abra pelo ícone instalado. A instalação depende do navegador/sistema; nem todos oferecem o mesmo fluxo.

## Limitação sobre “só funciona instalado”

A interface verifica o modo standalone e mostra a tela de instalação fora dele. Isso é uma barreira de experiência, não DRM: um site público não consegue garantir tecnicamente que ninguém acesse seus arquivos por navegador ou ferramentas.