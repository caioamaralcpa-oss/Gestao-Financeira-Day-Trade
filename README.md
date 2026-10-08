# Gestão de operações WDO

Aplicação estática em português para registrar e acompanhar operações de mini dólar. A autenticação e os dados usam Supabase; a página não persiste sessão ou operações no armazenamento local do navegador.

## Publicar no Vercel

Importe este repositório no Vercel, selecione a branch `main`, escolha **Other** como framework preset e mantenha a raiz do projeto em `./`. Não há etapa de build nem dependências npm para instalar. O `vercel.json` encaminha a raiz do domínio para a página da aplicação.

## Configuração do Supabase

`supabase-config.js` contém a Project URL e a publishable key usadas pelo navegador. Nunca substitua a publishable key por uma `service_role`/secret key.

Antes do primeiro acesso, aplique `cloud/001_trade_management.sql` no SQL Editor do projeto Supabase e confirme que as tabelas estão expostas na Data API. O cadastro exige confirmação de e-mail conforme a configuração atual do Auth.

## Desenvolvimento local

Na raiz do repositório, execute:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Abra a página `http://127.0.0.1:8000/` no navegador.
