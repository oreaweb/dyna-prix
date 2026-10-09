// ==UserScript==
// @name         Dyna Stats
// @namespace    local.dynastats
// @version      0.1.1
// @description  Statistiques globales Dyna Prix et Dyna Réception — accès administrateur.
// @match        https://dynacad.carrefour.com/*
// @updateURL    https://raw.githubusercontent.com/oreaweb/dyna-prix/main/dyna-stats.user.js
// @downloadURL  https://raw.githubusercontent.com/oreaweb/dyna-prix/main/dyna-stats.user.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(() => {
  "use strict";
  const URL="https://npgxpdcedhmouhduphte.supabase.co";
  const KEY="sb_publishable_F03AVvc9_J9CiMDzrPKDzQ_wczs5Zfp";
  const VERSION="0.1.1";
  let token=sessionStorage.getItem("dynastats_access")||"";
  let refreshToken=sessionStorage.getItem("dynastats_refresh")||"";
  let panel=null;
  let recoveryToken="";
  const params=new URLSearchParams(location.hash.replace(/^#/, ""));
  if(["recovery","invite"].includes(params.get("type")) && params.get("access_token")){
    recoveryToken=params.get("access_token");
    history.replaceState(null,"",location.pathname+location.search);
  }
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const label={open:"Ouvertures",search_ean:"Recherches EAN",search_label:"Recherches libellé",search_empty:"Sans résultat",search_error:"Erreurs recherche",scan:"Scans",price_calculated:"Calculs de prix",reception_loaded:"Réceptions chargées",reception_item:"Articles contrôlés",reception_unexpected:"Produits non prévus",reception_report:"Bilans consultés",reception_sync_error:"Erreurs de synchronisation"};
  async function request(path,opt={}) {
    const r=await fetch(URL+path,{...opt,headers:{"apikey":KEY,"Content-Type":"application/json",...(token?{"Authorization":"Bearer "+token}:{}),...(opt.headers||{})}});
    const body=await r.json().catch(()=>null);
    if(!r.ok)throw Error(body?.msg||body?.message||body?.error_description||"HTTP "+r.status);
    return body;
  }
  function saveAuth(d) {
    token=d.access_token||"";refreshToken=d.refresh_token||"";
    sessionStorage.setItem("dynastats_access",token);
    sessionStorage.setItem("dynastats_refresh",refreshToken);
  }
  async function refresh() {
    if(!refreshToken)return false;
    try{saveAuth(await request("/auth/v1/token?grant_type=refresh_token",{method:"POST",body:JSON.stringify({refresh_token:refreshToken})}));return true}catch{return false}
  }
  function logout(){token="";refreshToken="";sessionStorage.removeItem("dynastats_access");sessionStorage.removeItem("dynastats_refresh");renderLogin()}
  function renderReset(){
    if(!panel)return;
    $("ds-content").innerHTML='<div style="display:grid;gap:10px"><p style="margin:0;color:#687386">Définis ton mot de passe Dyna Stats.</p><input id="ds-newpass" type="password" autocomplete="new-password" placeholder="Nouveau mot de passe (12 caractères minimum)" style="padding:11px;border:1px solid #ccd3dd;border-radius:9px;font-size:16px"><input id="ds-confirm" type="password" autocomplete="new-password" placeholder="Confirmer le mot de passe" style="padding:11px;border:1px solid #ccd3dd;border-radius:9px;font-size:16px"><button id="ds-setpass" style="padding:12px;border:0;border-radius:9px;background:#1769e0;color:#fff;font-weight:bold">Enregistrer mon mot de passe</button><div id="ds-message" role="status"></div></div>';
    $("ds-setpass").onclick=async()=>{
      const btn=$("ds-setpass"),p=$("ds-newpass").value;
      if(p.length<12||p!==$("ds-confirm").value){$("ds-message").textContent="Utilise au moins 12 caractères et saisis deux fois le même mot de passe.";return}
      btn.disabled=true;
      try{
        const r=await fetch(URL+"/auth/v1/user",{method:"PUT",headers:{"apikey":KEY,"Authorization":"Bearer "+recoveryToken,"Content-Type":"application/json"},body:JSON.stringify({password:p})});
        const d=await r.json().catch(()=>({}));
        if(!r.ok)throw Error(d.msg||d.message||d.error_description||"HTTP "+r.status);
        recoveryToken="";
        renderLogin();
        $("ds-message").style.color="#176a36";
        $("ds-message").textContent="Mot de passe enregistré ! Tu peux maintenant te connecter.";
      }catch(e){$("ds-message").textContent="Impossible d’enregistrer : "+e.message}finally{btn.disabled=false}
    };
  }
  async function sendRecovery(){
    const email=$("ds-email").value.trim(),msg=$("ds-message");
    if(!email){msg.textContent="Saisis d’abord ton adresse e-mail.";return}
    const btn=$("ds-recover");btn.disabled=true;
    try{
      await request("/auth/v1/recover?redirect_to="+encodeURIComponent("https://dynacad.carrefour.com/"),{method:"POST",body:JSON.stringify({email})});
      msg.style.color="#176a36";msg.textContent="Si ce compte existe, un e-mail de réinitialisation vient d’être demandé. Ouvre le lien sur ce téléphone, avec Tampermonkey activé.";
    }catch(e){msg.style.color="#b00020";msg.textContent="Envoi impossible : "+e.message}finally{btn.disabled=false}
  }
  function renderLogin(){
    if(!panel)return;
    $("ds-content").innerHTML='<div style="display:grid;gap:10px"><p style="margin:0;color:#687386">Connexion administrateur Supabase. Aucun mot de passe n’est enregistré par Dyna Stats.</p><input id="ds-email" type="email" autocomplete="username" placeholder="Adresse e-mail" style="padding:11px;border:1px solid #ccd3dd;border-radius:9px;font-size:16px"><input id="ds-password" type="password" autocomplete="current-password" placeholder="Mot de passe" style="padding:11px;border:1px solid #ccd3dd;border-radius:9px;font-size:16px"><button id="ds-login" style="padding:12px;border:0;border-radius:9px;background:#1769e0;color:#fff;font-weight:bold">Se connecter</button><button id="ds-recover" style="padding:9px;border:1px solid #ccd3dd;border-radius:9px;background:white;color:#1769e0">Définir ou réinitialiser mon mot de passe</button><div id="ds-message" style="color:#b00020"></div></div>';
    $("ds-recover").onclick=sendRecovery;
    $("ds-login").onclick=async()=>{const btn=$("ds-login");btn.disabled=true;try{const email=$("ds-email").value.trim(),password=$("ds-password").value;saveAuth(await request("/auth/v1/token?grant_type=password",{method:"POST",body:JSON.stringify({email,password})}));await load()}catch(e){$("ds-message").textContent="Connexion impossible : "+e.message}finally{btn.disabled=false}};
  }
  async function load(){
    if(!panel)return;
    $("ds-content").innerHTML='<div style="color:#687386;padding:12px">Chargement des statistiques…</div>';
    try{
      const days=Number($("ds-period").value),tool=$("ds-tool").value;
      let rows;
      try{rows=await request("/rest/v1/rpc/dyna_stats_summary",{method:"POST",body:JSON.stringify({days_back:days})})}
      catch(e){if(!await refresh())throw e;rows=await request("/rest/v1/rpc/dyna_stats_summary",{method:"POST",body:JSON.stringify({days_back:days})})}
      if(!Array.isArray(rows))throw Error("Réponse inattendue");
      const filtered=rows.filter(r=>tool==="all"||r.tool===tool);
      const totals=new Map(),byDay=new Map(),byVersion=new Map();
      for(const r of filtered){
        const n=Number(r.total)||0;
        totals.set(r.event,(totals.get(r.event)||0)+n);
        byDay.set(r.day,(byDay.get(r.day)||0)+n);
        const key=(r.tool==="prix"?"Prix ":"Réception ")+r.version;
        byVersion.set(key,(byVersion.get(key)||0)+n);
      }
      const all=[...totals.values()].reduce((a,b)=>a+b,0);
      const max=Math.max(1,...byDay.values());
      const daysList=[...byDay].sort((a,b)=>a[0].localeCompare(b[0]));
      const cards=[...totals].sort((a,b)=>b[1]-a[1]).map(([k,v])=>'<div style="background:#f3f5f8;border-radius:10px;padding:12px"><div style="font-size:12px;color:#687386">'+esc(label[k]||k)+'</div><b style="font-size:23px">'+v.toLocaleString("fr-FR")+'</b></div>').join("");
      const graph=daysList.map(([day,n])=>'<div style="display:flex;align-items:center;gap:8px;margin:6px 0"><small style="width:53px;color:#687386">'+esc(day.slice(5))+'</small><div style="height:17px;background:#1769e0;border-radius:4px;width:'+Math.max(2,Math.round(n/max*100))+'%"></div><small>'+n+'</small></div>').join("");
      const versions=[...byVersion].sort((a,b)=>b[1]-a[1]).map(([v,n])=>'<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #eee"><span>'+esc(v)+'</span><b>'+n+'</b></div>').join("");
      $("ds-content").innerHTML='<div style="display:flex;justify-content:space-between;align-items:center"><b>'+all.toLocaleString("fr-FR")+' événements</b><button id="ds-logout" style="padding:6px 9px">Déconnexion</button></div><p style="color:#687386;font-size:12px;margin:5px 0 12px">Comptages globaux, sans suivi des appareils ou des vendeurs. Les versions représentent les événements enregistrés, pas le nombre d’installations.</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+(cards||'<p>Aucune activité enregistrée.</p>')+'</div><h3 style="margin:18px 0 9px">Activité par jour</h3>'+(graph||'<p>Aucune donnée.</p>')+'<h3 style="margin:18px 0 9px">Versions utilisées</h3>'+(versions||'<p>Aucune donnée.</p>');
      $("ds-logout").onclick=logout;
    }catch(e){$("ds-content").innerHTML='<p style="color:#b00020">Accès impossible : '+esc(e.message)+'</p><p style="color:#687386">Vérifie que ton compte Supabase est autorisé comme administrateur Dyna Stats.</p><button id="ds-relogin">Se reconnecter</button>';$("ds-relogin").onclick=logout}
  }
  function open(){
    if(panel){panel.remove();panel=null;return}
    panel=document.createElement("div");panel.id="ds-panel";
    panel.style.cssText="position:fixed;inset:8px auto 8px 50%;transform:translateX(-50%);width:calc(100vw - 16px);max-width:460px;overflow:auto;box-sizing:border-box;background:white;color:#172033;z-index:1000002;padding:15px;border-radius:15px;box-shadow:0 8px 35px #0006;font-family:Arial,sans-serif";
    panel.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center"><div><h2 style="margin:0">📊 Dyna Stats</h2><small style="color:#8a94a6">v'+VERSION+' • 09/10/2026 20h00</small></div><button id="ds-close" style="border:0;background:transparent;font-size:22px">✕</button></div><div style="display:flex;gap:7px;margin:14px 0"><select id="ds-tool" style="flex:1;min-width:0;padding:9px"><option value="all">Les deux outils</option><option value="prix">Dyna Prix</option><option value="reception">Dyna Réception</option></select><select id="ds-period" style="padding:9px"><option value="1">24 h</option><option value="7" selected>7 jours</option><option value="30">30 jours</option><option value="90">90 jours</option></select></div><div id="ds-content"></div>';
    document.body.appendChild(panel);
    $("ds-close").onclick=()=>{panel.remove();panel=null};
    $("ds-tool").onchange=()=>recoveryToken?renderReset():token?load():renderLogin();
    $("ds-period").onchange=()=>recoveryToken?renderReset():token?load():renderLogin();
    if(recoveryToken)renderReset();else if(token)load();else renderLogin();
  }
  const launch=document.createElement("button");
  launch.textContent="📊 Stats";launch.id="ds-launch";
  launch.style.cssText="position:fixed;right:18px;bottom:90px;z-index:999997;background:#26364f;color:white;border:0;border-radius:999px;padding:12px 16px;font-weight:700;box-shadow:0 4px 18px #0004;cursor:pointer";
  launch.onclick=open;document.body.appendChild(launch);
  if(recoveryToken)open();
})();