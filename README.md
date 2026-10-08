# Gestão de operações WDO

Aplicação estática em português para registrar e acompanhar operações de mini dólar. A autenticação e os dados usam Supabase; a página não persiste sessão ou operações no armazenamento local do navegador. A sessão é encerrada após 15 minutos sem atividade, em até 8 horas de uso, ao fechar a página ou ao recarregá-la.

A interface oferece tema claro e escuro. A escolha inicial segue a preferência de aparência do dispositivo; alternar o tema vale até fechar ou recarregar a página e não é gravado localmente.

O painel inclui uma projeção de referência para os próximos 12 meses: usa R$ 400 brutos por contrato/mês, recalcula o lote pelas mesmas faixas de margem definidas no banco e estima taxas pela média por contrato dos últimos seis meses completos registrados. Sem meses completos no histórico, considera custos futuros iguais a zero e informa essa hipótese. A projeção não prevê stops, depósitos, retiradas nem mudanças de estratégia; não é garantia de resultado.

## Publicar no Vercel

Importe este repositório no Vercel, selecione a branch `main`, escolha **Other** como framework preset e mantenha a raiz do projeto em `./`. Não há etapa de build nem dependências npm para instalar. O `vercel.json` encaminha a raiz do domínio para a página da aplicação.

O Vercel envia cabeçalhos de segurança, impede cache da página e define uma Content Security Policy limitada ao próprio site, ao SDK Supabase no jsDelivr e à API deste projeto.

## Configuração do Supabase

`supabase-config.js` contém a Project URL e a publishable key usadas pelo navegador. Nunca substitua a publishable key por uma `service_role`/secret key.

Antes do primeiro acesso, aplique `cloud/001_trade_management.sql` no SQL Editor do projeto Supabase e confirme que as tabelas estão expostas na Data API. O cadastro exige confirmação de e-mail conforme a configuração atual do Auth.

## Desenvolvimento local

Na raiz do repositório, execute:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Abra a página `http://127.0.0.1:8000/` no navegador.
