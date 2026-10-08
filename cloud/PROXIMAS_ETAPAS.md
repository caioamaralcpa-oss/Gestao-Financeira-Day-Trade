# Próximas etapas

1. Crie ou selecione o projeto Supabase e copie a Project URL e a publishable key (`sb_publishable_...`). Nunca use a `service_role`/secret key no navegador.
2. Edite `supabase-config.js` com esses dois valores.
3. No SQL Editor do Supabase, execute `cloud/001_trade_management.sql`.
4. Confirme que `trade_profiles`, `monthly_plans` e `trade_operations` estão expostas à Data API. Os grants e as políticas RLS da migration restringem os dados ao usuário autenticado.
5. Hospede `gestao-operacoes-mini-dolar.html` e `supabase-config.js` juntos em HTTPS.
6. Valide em produção: cadastro/login, confirmação de e-mail conforme a configuração do Auth, inclusão de operação, unicidade por data, exclusão, alteração do capital-base, persistência entre logins e isolamento entre usuários.
7. Inspecione o navegador e confirme que não há operações ou sessão em localStorage, sessionStorage ou IndexedDB. Ao recarregar, o login deve ser solicitado novamente.

## Limites da primeira versão

- Não importa dados do protótipo antigo nem grava arquivos ou exportações.
- O lote de cada mês é fixado na primeira solicitação desse mês; o cálculo usa o saldo no começo do mês e as faixas de margem da especificação.
- Se incluir operações retroativas, um lote mensal já criado continua fixo. Para manter o histórico auditável, não há edição de operações: exclua e registre novamente.
- Esta versão ainda precisa ser validada contra o projeto Supabase real e publicada em um host HTTPS.
