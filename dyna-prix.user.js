// ==UserScript==
// @name         Dyna Prix
// @namespace    local.dynaprix
// @version      0.3.5
// @description  Recherche/scan EAN Dynacad et calcule un prix de vente TTC à partir du prix d'achat HT, de la TVA et de la majoration.
// @match        https://dynacad.carrefour.com/*
// @updateURL    https://raw.githubusercontent.com/oreaweb/dyna-prix/main/dyna-prix.user.js
// @downloadURL  https://raw.githubusercontent.com/oreaweb/dyna-prix/main/dyna-prix.user.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const SITE_EAN = "3020180368049";
  const STORAGE_MARGIN = "dynaprix-margin";
  let product = null;

  const euro = n => Number(n).toLocaleString("fr-FR", {
    style: "currency", currency: "EUR"
  });

  function getCookie(name) {
    const row = document.cookie.split("; ").find(r => r.startsWith(name + "="));
    return row ? decodeURIComponent(row.split("=").slice(1).join("=")) : null;
  }

  function addLauncher() {
    if (document.getElementById("dynaprix-launcher")) return;
    const b = document.createElement("button");
    b.id = "dynaprix-launcher";
    b.textContent = "🛒 Dyna Prix";
    Object.assign(b.style, {
      position:"fixed", right:"18px", bottom:"18px", zIndex:"999998",
      border:"0", borderRadius:"999px", padding:"13px 18px",
      background:"#1769e0", color:"#fff", fontWeight:"800",
      fontSize:"15px", boxShadow:"0 5px 20px rgba(0,0,0,.25)", cursor:"pointer"
    });
    b.onclick = openApp;
    document.body.appendChild(b);
  }

  function openApp() {
    const old = document.getElementById("dynaprix-app");
    if (old) { old.remove(); return; }

    const app = document.createElement("div");
    app.id = "dynaprix-app";
    app.innerHTML = `
      <div style="position:fixed;top:12px;left:50%;transform:translateX(-50%);width:calc(100vw - 24px);max-width:410px;box-sizing:border-box;
        max-height:calc(100vh - 40px);overflow:auto;background:#fff;color:#172033;z-index:999999;
        padding:22px;border-radius:18px;box-shadow:0 8px 35px rgba(0,0,0,.28);
        font-family:Arial,sans-serif">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h2 style="margin:0">🛒 Dyna Prix</h2>
          <button id="dp-close" style="border:0;background:none;font-size:22px;cursor:pointer">✕</button>
        </div>
        <div style="color:#687386;margin:5px 0 20px">Recherche et calcul de prix</div>

        <label><b>Code-barres EAN</b></label>
        <div style="display:flex;gap:8px;margin-top:6px">
          <input id="dp-ean" inputmode="numeric" autocomplete="off" placeholder="Scanner ou saisir l'EAN"
            style="flex:1;min-width:0;padding:12px;font-size:17px;border:1px solid #bbb;border-radius:9px">
          <button id="dp-search" style="padding:12px 15px;background:#1769e0;color:white;border:0;
            border-radius:9px;font-weight:bold;cursor:pointer">Rechercher</button>
        </div>
        <button id="dp-scan" style="width:100%;margin-top:9px;padding:13px;background:#172033;color:white;border:0;
          border-radius:9px;font-weight:bold;font-size:16px;cursor:pointer">📷 Scanner un code-barres</button>
        <div id="dp-camera" style="display:none;margin-top:10px">
          <video id="dp-video" playsinline muted style="width:100%;max-height:280px;background:#000;border-radius:12px"></video>
          <button id="dp-stop" style="width:100%;margin-top:7px;padding:10px;border:1px solid #bbb;background:white;
            border-radius:9px;font-weight:bold;cursor:pointer">Arrêter la caméra</button>
        </div>

        <div id="dp-status" style="margin-top:12px;color:#687386"></div>

        <div id="dp-result" style="display:none">
          <hr style="margin:18px 0;border:0;border-top:1px solid #ddd">
          <h3 id="dp-label" style="margin-bottom:15px"></h3>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div style="background:#f3f5f8;padding:12px;border-radius:10px">
              <small>Prix achat HT</small><br><b id="dp-purchase" style="font-size:21px"></b>
            </div>
            <div style="background:#f3f5f8;padding:12px;border-radius:10px">
              <small>TVA</small><br><b id="dp-vat" style="font-size:21px"></b>
            </div>
          </div>

          <hr style="margin:18px 0;border:0;border-top:1px solid #ddd">
          <label><b>Majoration sur le prix d'achat HT</b></label>
          <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
            <input id="dp-margin" type="number" min="0" step="0.1"
              style="width:110px;padding:10px;font-size:18px;border:1px solid #bbb;border-radius:9px">
            <b>%</b>
          </div>

          <div style="margin-top:18px;padding:16px;background:#eef4ff;border-radius:12px">
            <div style="color:#687386">Prix d'achat HT</div>
            <div id="dp-base" style="font-size:20px;font-weight:bold"></div>
            <div style="color:#687386;margin-top:12px">PRIX DE VENTE TTC PROPOSÉ</div>
            <div id="dp-salettc" style="font-size:38px;font-weight:bold;margin-top:3px"></div>
          </div>
        </div>
      </div>`;

    document.body.appendChild(app);

    const margin = document.getElementById("dp-margin");
    margin.value = localStorage.getItem(STORAGE_MARGIN) || "35";

    document.getElementById("dp-close").onclick = () => { stopScanner(); app.remove(); };
    document.getElementById("dp-search").onclick = searchProduct;
    document.getElementById("dp-scan").onclick = startScanner;
    document.getElementById("dp-stop").onclick = stopScanner;
    document.getElementById("dp-ean").addEventListener("keydown", e => {
      if (e.key === "Enter") searchProduct();
    });
    margin.addEventListener("input", () => {
      localStorage.setItem(STORAGE_MARGIN, margin.value);
      calculate();
    });

    document.getElementById("dp-ean").focus();
  }

  let cameraStream = null;
  let scanTimer = null;

  function stopScanner() {
    if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
    }
    const box = document.getElementById("dp-camera");
    if (box) box.style.display = "none";
  }

  async function startScanner() {
    const status = document.getElementById("dp-status");
    try {
      if (!("BarcodeDetector" in window)) {
        throw new Error("Le scanner automatique n’est pas pris en charge par ce navigateur. La saisie manuelle reste disponible.");
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Accès caméra indisponible dans ce navigateur.");
      }

      stopScanner();
      const supported = await BarcodeDetector.getSupportedFormats();
      const wanted = ["ean_13", "ean_8", "upc_a", "upc_e"].filter(f => supported.includes(f));
      const detector = new BarcodeDetector({ formats: wanted.length ? wanted : undefined });
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } }, audio: false
      });

      const video = document.getElementById("dp-video");
      document.getElementById("dp-camera").style.display = "block";
      video.srcObject = cameraStream;
      await video.play();
      status.style.color = "#687386";
      status.textContent = "Présentez le code-barres devant la caméra…";

      let busy = false;
      scanTimer = setInterval(async () => {
        if (busy || video.readyState < 2) return;
        busy = true;
        try {
          const codes = await detector.detect(video);
          const hit = codes.find(c => /^\d{8,14}$/.test(c.rawValue || ""));
          if (hit) {
            document.getElementById("dp-ean").value = hit.rawValue;
            stopScanner();
            status.textContent = "✓ Code-barres détecté : " + hit.rawValue;
            status.style.color = "green";
            await searchProduct();
          }
        } catch (_) {
          // Une image non lisible est normale pendant le scan.
        } finally { busy = false; }
      }, 350);
    } catch (err) {
      stopScanner();
      status.style.color = "#b00020";
      status.textContent = "⚠ " + err.message;
    }
  }

  function calculate() {
    if (!product) return;
    const base = Number(product.purchasePrice);
    const vat = Number(product.vatPct) || 0;
    const pct = Number(document.getElementById("dp-margin").value) || 0;
    const proposed = base * (1 + vat / 100) * (1 + pct / 100);
    document.getElementById("dp-base").textContent = euro(base);
    document.getElementById("dp-salettc").textContent = euro(proposed);
  }

  async function authenticate() {
    const xsrf = getCookie("XSRF-TOKEN");
    if (!xsrf) throw new Error("Session Dynacad introuvable. Reconnectez-vous à Dynacad.");
    const r = await fetch("/api/authenticate", {
      method:"POST", credentials:"include",
      headers:{"Content-Type":"application/json","x-xsrf-token":xsrf},
      body:"{}"
    });
    if (!r.ok) throw new Error("Authentification Dynacad refusée (" + r.status + ").");
    const data = await r.json();
    if (!data.id_token) throw new Error("Aucun jeton Dynacad reçu.");
    return data.id_token;
  }

  async function searchProduct() {
    const status = document.getElementById("dp-status");
    const result = document.getElementById("dp-result");
    const ean = document.getElementById("dp-ean").value.trim();

    status.style.color = "#687386";
    status.textContent = "Recherche en cours…";
    result.style.display = "none";

    try {
      if (!/^\d{8,14}$/.test(ean)) throw new Error("EAN invalide.");
      const token = await authenticate();

      const payload = {
        siteEan:SITE_EAN, pageIndex:0, pageSize:10,
        sorts:[
          {property:"sectorDesc",direction:"asc"},
          {property:"departmentDesc",direction:"asc"},
          {property:"classGroupDesc",direction:"asc"},
          {property:"classDesc",direction:"asc"},
          {property:"subClassDesc",direction:"asc"},
          {property:"assortmentLevel",direction:"asc"},
          {property:"label",direction:"asc"}
        ],
        filters:{ean:[ean]}
      };

      const r = await fetch("/api/products/search", {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json","Authorization":"Bearer " + token},
        body:JSON.stringify(payload)
      });

      if (!r.ok) throw new Error("Recherche Dynacad impossible (" + r.status + ").");
      const data = await r.json();
      if (!data.data?.length) throw new Error("Produit introuvable.");

      product = data.data[0];
      document.getElementById("dp-label").textContent = product.label || "Produit";
      document.getElementById("dp-purchase").textContent = euro(product.purchasePrice);
      document.getElementById("dp-vat").textContent =
        (Number(product.vatPct) || 0).toLocaleString("fr-FR") + " %";

      result.style.display = "block";
      status.textContent = "✓ Produit trouvé";
      status.style.color = "green";
      calculate();
    } catch (err) {
      status.textContent = "⚠ " + err.message;
      status.style.color = "#b00020";
    }
  }

  addLauncher();
})();
