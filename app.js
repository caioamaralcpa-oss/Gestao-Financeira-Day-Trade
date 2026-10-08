    import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.100.0/+esm';
    import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js';

    const $ = (id) => document.getElementById(id);
    function applyTheme(theme) {
      document.documentElement.dataset.theme=theme;
      const next=theme==='dark'?'light':'dark';
      const label=next==='dark'?'☾ Escuro':'☀ Claro';
      for(const id of ['theme-toggle-auth','theme-toggle-app']){
        const button=$(id);
        button.textContent=label;
        button.setAttribute('aria-label',`Ativar tema ${next==='dark'?'escuro':'claro'}`);
        button.setAttribute('aria-pressed',String(theme==='dark'));
      }
    }
    const initialTheme=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
    applyTheme(initialTheme);
    for(const id of ['theme-toggle-auth','theme-toggle-app']){
      $(id).addEventListener('click',()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
    }
    const configured = !SUPABASE_URL.includes('YOUR_PROJECT_REF') && !SUPABASE_PUBLISHABLE_KEY.includes('YOUR_SUPABASE_PUBLISHABLE_KEY');
    const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, detectSessionInUrl: false, autoRefreshToken: true },
      global: { fetch: (input, options = {}) => fetch(input, { ...options, cache: 'no-store' }) }
    }) : null;
    let authMode = 'login';
    let currentUser = null;
    let operations = [];
    let plan = null;
    const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
    const MAX_SESSION_MS = 8 * 60 * 60 * 1000;
    let lastActivityAt = 0;
    let sessionStartedAt = 0;
    let sessionTimer = null;
    let lastPointerActivityAt = 0;
    const money = (amount) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(amount || 0));
    const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
    const monthOf = (date) => `${date.slice(0,7)}-01`;
    const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function showMessage(id, text, kind='') { const box=$(id); box.textContent=text; box.className=`notice ${kind}`.trim(); box.hidden=false; }
    function clearMessage(id) { $(id).hidden=true; }
    function setBusy(button, busy, label) { button.disabled=busy; button.innerHTML=busy?'<span class="spinner"></span>Aguarde…':label; }
    function showAuth() { $('auth-view').hidden=false; $('app-view').hidden=true; }
    function showApp() { $('auth-view').hidden=true; $('app-view').hidden=false; }
    function clearPrivateView() {
      $('user-email').textContent='';
      $('operations-body').replaceChildren();
      $('alerts').replaceChildren();
      $('drawdown').textContent='';
      $('initial-capital').value='';
      $('operation-date').value='';
      $('operation-form').reset();
      $('capital-form').reset();
      $('empty-state').hidden=true;
      for(const id of ['metric-balance','metric-lot','metric-month','metric-rate','metric-expectancy']) $(id).textContent='—';
      $('metric-lot-hint').textContent='';
      $('metric-month-hint').textContent='';
      $('plan-note').textContent='Entre novamente para acessar seus dados.';
    }
    function clearSession(message) {
      if(sessionTimer) clearTimeout(sessionTimer);
      sessionTimer=null;
      currentUser=null;
      operations=[];
      plan=null;
      lastActivityAt=0;
      sessionStartedAt=0;
      clearPrivateView();
      $('auth-form').reset();
      showAuth();
      setAuthMode('login');
      if(message) showMessage('auth-message',message,'warning');
      if(supabase) void supabase.auth.signOut({scope:'local'}).catch(()=>{});
    }
    function enforceSessionLimits() {
      if(!currentUser) return true;
      const now=Date.now();
      if(now-lastActivityAt>=IDLE_TIMEOUT_MS){
        clearSession('Sessão encerrada após 15 minutos sem atividade. Entre novamente.');
        return false;
      }
      if(now-sessionStartedAt>=MAX_SESSION_MS){
        clearSession('Sessão encerrada após 8 horas. Entre novamente.');
        return false;
      }
      return true;
    }
    function scheduleSessionLock() {
      if(sessionTimer) clearTimeout(sessionTimer);
      if(!currentUser) return;
      const remaining=Math.min(IDLE_TIMEOUT_MS-(Date.now()-lastActivityAt),MAX_SESSION_MS-(Date.now()-sessionStartedAt));
      sessionTimer=setTimeout(enforceSessionLimits,Math.max(0,remaining));
    }
    function startSessionClock() {
      sessionStartedAt=Date.now();
      lastActivityAt=sessionStartedAt;
      scheduleSessionLock();
    }
    function recordUserActivity() {
      if(!currentUser||!enforceSessionLimits()) return;
      lastActivityAt=Date.now();
      scheduleSessionLock();
    }
    function setAuthMode(mode) { authMode=mode; $('tab-login').classList.toggle('active',mode==='login'); $('tab-signup').classList.toggle('active',mode==='signup'); $('auth-submit').textContent=mode==='login'?'Entrar':'Criar conta'; $('auth-password').autocomplete=mode==='login'?'current-password':'new-password'; clearMessage('auth-message'); }
    async function loadData() {
      clearMessage('app-message');
      const [{data: profileData,error: profileError},{data: opsData,error: opsError}] = await Promise.all([
        supabase.from('trade_profiles').select('initial_capital').eq('user_id',currentUser.id).maybeSingle(),
        supabase.from('trade_operations').select('id,operation_date,outcome,contracts,costs,gross_result,net_result').eq('user_id',currentUser.id).order('operation_date',{ascending:false})
      ]);
      if(profileError||opsError) throw profileError||opsError;
      operations=opsData||[];
      $('initial-capital').value=profileData?.initial_capital??0;
      const today=localDate(); $('operation-date').value=today;
      if(Number(profileData?.initial_capital||0)>0){
        const {data: planData,error: planError}=await supabase.rpc('ensure_monthly_plan',{p_month_start:monthOf(today)});
        if(planError) throw planError;
        plan=Array.isArray(planData)?planData[0]:planData;
      }else plan=null;
      $('contracts').value=Math.max(1,Number(plan?.contract_limit||0));
      $('contracts').max=String(plan?.contract_limit||0);
      $('contracts').disabled=!plan||Number(plan.contract_limit)<1;
      $('save-operation').disabled=$('contracts').disabled;
      $('metric-lot').textContent=`${Number(plan?.contract_limit||0)} ${Number(plan?.contract_limit)===1?'contrato':'contratos'}`;
      $('metric-lot-hint').textContent=plan?`Margem ${money(plan.margin_per_contract)} por contrato · saldo no início do mês ${money(plan.starting_balance)}`:'Defina o capital-base para calcular o lote mensal.';
      render();
    }
    function render() {
      const initial=Number($('initial-capital').value||0);
      const total=operations.reduce((sum,op)=>sum+Number(op.net_result),0);
      const balance=initial+total;
      const today=localDate(),month=today.slice(0,7);
      const monthOps=operations.filter(op=>op.operation_date.slice(0,7)===month);
      const monthResult=monthOps.reduce((sum,op)=>sum+Number(op.net_result),0);
      const decided=monthOps.filter(op=>op.outcome!=='flat');
      const wins=decided.filter(op=>op.outcome==='gain').length;
      const rate=decided.length?wins/decided.length*100:null;
      $('metric-balance').textContent=money(balance);
      $('metric-balance').className=`metric ${balance<0?'negative':''}`;
      $('metric-month').textContent=money(monthResult);
      $('metric-month').className=`metric ${monthResult>0?'positive':monthResult<0?'negative':''}`;
      $('metric-month-hint').textContent=`${monthOps.length} ${monthOps.length===1?'operação':'operações'} registradas`;
      $('metric-rate').textContent=rate===null?'—':`${rate.toFixed(1).replace('.',',')}%`;
      $('metric-rate').className=`metric ${rate===null?'':rate>=75?'positive':'negative'}`;
      $('metric-expectancy').textContent=money(400*Number(plan?.contract_limit||0));

      const rows=operations.map(op=>`<tr><td>${new Date(`${op.operation_date}T12:00:00`).toLocaleDateString('pt-BR')}</td><td><span class="pill ${op.outcome}">${op.outcome==='gain'?'Gain':op.outcome==='stop'?'Stop':'Sem resultado'}</span></td><td>${op.contracts}</td><td>${money(op.gross_result)}</td><td>${money(op.costs)}</td><td><strong class="${Number(op.net_result)>0?'positive':Number(op.net_result)<0?'negative':''}">${money(op.net_result)}</strong></td><td><button class="icon-button" type="button" data-delete="${escapeHtml(op.id)}" aria-label="Excluir operação de ${escapeHtml(op.operation_date)}">Excluir</button></td></tr>`).join('');
      $('operations-body').innerHTML=rows;
      $('empty-state').hidden=operations.length>0;
      const chronological=[...operations].sort((a,b)=>a.operation_date.localeCompare(b.operation_date));
      let equity=initial,peak=initial,maxDrawdown=0;
      for(const op of chronological){equity+=Number(op.net_result);peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity);}
      $('drawdown').textContent=`Drawdown máximo: ${money(maxDrawdown)}`;

      const reverseMonth=[...monthOps].sort((a,b)=>b.operation_date.localeCompare(a.operation_date));
      let consecutiveStops=0; for(const op of reverseMonth){if(op.outcome==='stop')consecutiveStops++;else break;}
      const chips=[];
      chips.push(consecutiveStops>=4?`⚠ ${consecutiveStops} stops consecutivos neste mês`: '✓ Sem alerta de stops consecutivos');
      chips.push(balance<1000?'⚠ Saldo abaixo da referência de R$ 1.000 para um contrato':'✓ Saldo acima da referência mínima');
      $('alerts').innerHTML=chips.map((text,i)=>`<span class="alert-chip ${i===0&&consecutiveStops<4||i===1&&balance>=1000?'ok':''}">${escapeHtml(text)}</span>`).join('');
      $('plan-note').textContent=`Lote fixo do mês: ${Number(plan?.contract_limit||0)} contrato(s), calculado sobre ${money(plan?.starting_balance)} no início do período.`;
    }

    $('tab-login').addEventListener('click',()=>setAuthMode('login'));
    $('tab-signup').addEventListener('click',()=>setAuthMode('signup'));
    $('auth-form').addEventListener('submit',async(event)=>{
      event.preventDefault(); clearMessage('auth-message');
      const button=$('auth-submit'),label=authMode==='login'?'Entrar':'Criar conta'; setBusy(button,true,label);
      try{
        const email=$('auth-email').value.trim(),password=$('auth-password').value;
        const result=authMode==='login'?await supabase.auth.signInWithPassword({email,password}):await supabase.auth.signUp({email,password});
        if(result.error) throw result.error;
        if(authMode==='signup'&&!result.data.session){showMessage('auth-message','Conta criada. Confira seu e-mail para confirmar o cadastro e depois entre.');}
        else {currentUser=result.data.user; $('user-email').textContent=currentUser.email||''; showApp(); startSessionClock(); await loadData();}
      }catch(error){showMessage($('app-view').hidden?'auth-message':'app-message',error.message||'Não foi possível autenticar.','error');}
      finally{setBusy(button,false,label);}
    });
    $('signout').addEventListener('click',()=>clearSession('Você saiu. Entre novamente para acessar seus dados.'));
    $('operation-date').addEventListener('change',async()=>{
      const selected=$('operation-date').value;if(!selected)return;
      try{
        if(Number($('initial-capital').value||0)<=0) throw new Error('Informe um capital-base maior que zero antes de registrar operações.');
        const {data,error}=await supabase.rpc('ensure_monthly_plan',{p_month_start:monthOf(selected)});
        if(error)throw error;plan=Array.isArray(data)?data[0]:data;
        $('contracts').max=String(plan.contract_limit);$('contracts').value=Math.max(1,Number(plan.contract_limit));
        $('contracts').disabled=Number(plan.contract_limit)<1;$('save-operation').disabled=$('contracts').disabled;render();
      }catch(error){showMessage('app-message',error.message||'Não foi possível carregar o lote deste mês.','error');}
    });
    $('operation-form').addEventListener('submit',async(event)=>{
      event.preventDefault();clearMessage('app-message');const button=$('save-operation');setBusy(button,true,'Salvar operação');
      try{
        if(Number($('initial-capital').value||0)<=0) throw new Error('Informe um capital-base maior que zero antes de registrar operações.');
        const date=$('operation-date').value, monthStart=monthOf(date);
        const {data: planData,error: planError}=await supabase.rpc('ensure_monthly_plan',{p_month_start:monthStart});
        if(planError)throw planError;
        const monthly=Array.isArray(planData)?planData[0]:planData;
        const count=Number($('contracts').value);
        if(!monthly||count<1||count>Number(monthly.contract_limit))throw new Error(`O lote disponível para este mês é ${monthly?.contract_limit||0} contrato(s).`);
        const {error}=await supabase.from('trade_operations').insert({user_id:currentUser.id,operation_date:date,outcome:$('outcome').value,contracts:count,costs:Number($('costs').value||0)});
        if(error)throw error;
        showMessage('app-message','Operação salva no banco de dados.');
        await loadData();
      }catch(error){showMessage('app-message',error.code==='23505'?'Já existe uma operação para esta data.':error.message||'Não foi possível salvar a operação.','error');}
      finally{setBusy(button,false,'Salvar operação');}
    });
    $('capital-form').addEventListener('submit',async(event)=>{
      event.preventDefault();clearMessage('app-message');const button=$('save-capital');setBusy(button,true,'Atualizar capital-base');
      try{
        const value=Number($('initial-capital').value);
        const {error}=await supabase.from('trade_profiles').upsert({user_id:currentUser.id,initial_capital:value,updated_at:new Date().toISOString()},{onConflict:'user_id'});
        if(error)throw error;showMessage('app-message','Capital-base atualizado.');await loadData();
      }catch(error){showMessage('app-message',error.message||'Não foi possível atualizar o capital-base.','error');}
      finally{setBusy(button,false,'Atualizar capital-base');}
    });
    $('operations-body').addEventListener('click',async(event)=>{
      const id=event.target.closest('[data-delete]')?.dataset.delete;if(!id)return;
      if(!window.confirm('Excluir esta operação? Esta ação não pode ser desfeita.'))return;
      try{const {error}=await supabase.from('trade_operations').delete().eq('id',id);if(error)throw error;showMessage('app-message','Operação excluída.');await loadData();}
      catch(error){showMessage('app-message',error.message||'Não foi possível excluir a operação.','error');}
    });

    for(const eventName of ['pointerdown','keydown','touchstart','scroll']){
      window.addEventListener(eventName,recordUserActivity,{capture:true,passive:true});
    }
    window.addEventListener('pointermove',()=>{
      const now=Date.now();
      if(now-lastPointerActivityAt>=5000){lastPointerActivityAt=now;recordUserActivity();}
    },{passive:true});
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden&&enforceSessionLimits()) scheduleSessionLock();
    });
    window.addEventListener('pagehide',()=>{
      if(currentUser) clearSession('Entre novamente para acessar seus dados.');
    });
    window.addEventListener('pageshow',(event)=>{
      if(event.persisted&&currentUser) clearSession('Entre novamente para acessar seus dados.');
    });

    if(!configured){showAuth();showMessage('auth-message','Configure a URL e a chave publicável do Supabase em supabase-config.js antes de usar.','warning');$('auth-form').querySelectorAll('input,button').forEach(el=>el.disabled=true);}
    else showAuth();
