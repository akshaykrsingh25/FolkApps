    const root = document.getElementById("asset-register-prototype");
    // A local SVG icon set keeps the interface complete without a network dependency.
    const iconMarkup = {
      'arrow-left':'<path d="M19 12H5M12 19l-7-7 7-7"/>','arrow-right':'<path d="M5 12h14m-7-7 7 7-7 7"/>','arrow-down':'<path d="M12 5v14m7-7-7 7-7-7"/>','arrow-up-right':'<path d="M7 17 17 7M7 7h10v10"/>','chevron-down':'<path d="m6 9 6 6 6-6"/>','chevron-right':'<path d="m9 18 6-6-6-6"/>','plus':'<path d="M12 5v14M5 12h14"/>','check':'<path d="m5 12 4 4L19 6"/>','circle-check':'<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>','check-circle-2':'<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>','search':'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>','camera':'<path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13.5" r="4.2"/><path d="M12 7v1"/>','map-pin':'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>','map-pin-off':'<path d="m3 3 18 18M10 10a2 2 0 0 0 3 2m5-2c0 2-1.5 4.2-3.2 6.3M9 18.5C6.5 15.8 4 12.8 4 10a8 8 0 0 1 13.7-5.7"/>','map':'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15m6-12v15M5.5 14l2 1.5 2-2m6-3 2 1.5 2-2"/>','house':'<path d="M3 10.5 12 3l9 7.5v10H3z"/><path d="M9 20v-6h6v6M6 10h2m8 0h2"/>','boxes':'<path d="m12 3 8 4-8 4-8-4zM4 7v9l8 5 8-5V7M12 11v10"/><path d="M7 7.5v3m10-3v3"/>','package-open':'<path d="m12 3 8 4-8 4-8-4zM4 7v9l8 5 8-5V7m-8 4v10m-4-9 8-4"/>','building':'<path d="M4 21V5l8-3 8 3v16M2 21h20"/><path d="M8 7h2m4 0h2M8 11h2m4 0h2M8 15h2m4 0h2M10 21v-3h4v3"/>','building-2':'<path d="M3 21h18M5 21V4h9v17m0-10h5v10M8 7h3m-3 4h3m-3 4h3m6-1h2m-2 4h2"/>','bell':'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4"/>','bell-ring':'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4M2 8l2 1m18-1-2 1M5 3l2 2m10-2-2 2"/>','qr-code':'<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z"/><path d="M14 14h2v2h-2zm4 0h2m-6 4h2m2-2v4"/>','barcode':'<path d="M4 5v14m2-14v14m4-14v14m2-14v14m4-14v14m2-14v14m2-14v14"/><path d="M8 5v8m8 2v4"/>','scan-line':'<path d="M4 8V5h4m8 0h4v3M4 16v3h4m8 0h4v-3"/><path d="M3 12h18"/><circle cx="12" cy="12" r="1.3"/>','scan-search':'<path d="M4 7V5a1 1 0 0 1 1-1h2m10 0h2a1 1 0 0 1 1 1v2M4 17v2a1 1 0 0 0 1 1h2m10 0h2a1 1 0 0 0 1-1v-2"/><circle cx="11" cy="11" r="3"/><path d="m20 20-3-3"/>','clipboard-check':'<path d="M7 4h10v3H7zM5 6H4v15h16V6h-1"/><path d="M8 12h4m-4 4h3m3-3 1.5 1.5L18 12"/><path d="M6.5 9h2v2h-2z"/>','clipboard-list':'<path d="M7 4h10v3H7zM5 6H4v15h16V6h-1"/><path d="M9 11h7m-7 4h7m-7 4h4M6.5 10h1v2h-1z"/>','clipboard-plus':'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6V7H9zm3 6v6m-3-3h6"/>','calendar-check':'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m-13 5 2 2 4-4"/>','calendar-check-2':'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m-13 5 2 2 4-4"/>','calendar-clock':'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><circle cx="15" cy="15" r="3"/><path d="M15 13v2l1 1"/>','calendar-plus':'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m9 4v6m-3-3h6"/>','clock-3':'<circle cx="12" cy="12" r="9"/><path d="M12 7v5h5"/>','cloud-check':'<path d="M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 20 11a4 4 0 0 1-1 7h-3m-8-3 2 2 4-4"/>','shield-check':'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>','shield-alert':'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="M12 8v5m0 3h.01"/>','wrench':'<path d="M14.7 6.3a5 5 0 0 0-6.4 6.4L3 18l3 3 5.3-5.3a5 5 0 0 0 6.4-6.4L15 12l-3-3z"/>','triangle-alert':'<path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/>','ban':'<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>','image-off':'<path d="m2 2 20 20M10.6 10.6a2 2 0 0 0 2.8 2.8M9 4h10a2 2 0 0 1 2 2v10M5 5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11"/>','users':'<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-7.5a4 4 0 0 1 0 7.7M20 21v-2a4 4 0 0 0-3-3.9"/>','users-round':'<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-7.5a4 4 0 0 1 0 7.7M20 21v-2a4 4 0 0 0-3-3.9"/>','user-plus':'<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm9-3v6m-3-3h6"/>','sparkles':'<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm7 12 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>','file-text':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6m-12 4h8m-8 4h8m-8 4h5"/>','file-check-2':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6m-12 5 2 2 4-4"/>','printer':'<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2m-12-4h12v8H6z"/>','settings-2':'<path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M2 14h4m4-6h4m4 8h4"/>','history':'<path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 2"/>','key-round':'<circle cx="8" cy="15" r="5"/><path d="m21 2-9 9m5-5 3 3m-6-1 3 3"/>','lock-keyhole':'<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V6a4 4 0 1 1 8 0v4m-4 5v3"/>','locate-fixed':'<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/><circle cx="12" cy="12" r="8"/>','move-right':'<path d="M5 12h14m-7-7 7 7-7 7"/>','inside-outside':'<path d="M4 4h16v16H4zM8 8v8h8V8z"/>','layers-2':'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5"/>','layers-3':'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5"/>','store':'<path d="M3 10V5l2-3h14l2 3v5M5 10v11h14V10M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 21v-6h6v6"/>','copy-check':'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3m2-2 2 2 4-4"/>','armchair':'<path d="M5 12V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4m-16 0h18v6H3zm3 6v3m12-3v3"/>','badge-check':'<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>','circle-help':'<circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 1 1 4.3 1.8c-1.2 1-1.9 1.4-1.9 3m0 3h.01"/>','info':'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>','images':'<rect x="3" y="3" width="14" height="14" rx="2"/><path d="m7 13 3-3 3 3 2-2 5 5M8 21h11a2 2 0 0 0 2-2V8"/>','zap':'<path d="m13 2-3 8h7l-6 12 2-9H6z"/>','send':'<path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/>','list-filter':'<path d="M4 6h16M7 12h10m-7 6h4"/>','git-branch':'<path d="M6 3v12m0-8h7a4 4 0 0 1 4 4v1m0 3v6M6 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm11 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/>','switch-camera':'<path d="m16 3 4 4-4 4M20 7H9a6 6 0 0 0-6 6m4 8-4-4 4-4m-4 4h11a6 6 0 0 0 6-6"/>','rfid':'<rect x="3" y="7" width="12" height="10" rx="2"/><circle cx="9" cy="12" r="1.4"/><path d="M19 9a4.2 4.2 0 0 1 0 6m2.6-9a8.2 8.2 0 0 1 0 12"/>','wifi':'<path d="M2 8.8a16 16 0 0 1 20 0M5.3 12.6a11.3 11.3 0 0 1 13.4 0M8.7 16.3a6.6 6.6 0 0 1 6.6 0"/><path d="M12 20h.01"/>','bluetooth':'<path d="M7 7l10 10-5 5V2l5 5L7 17"/>'
    };
    function renderIcons(){root.querySelectorAll('i[data-lucide]').forEach((node)=>{const name=node.getAttribute('data-lucide');const body=iconMarkup[name]||'<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12h8m-4-4v8"/>';const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('data-lucide-icon',name);svg.innerHTML=body;node.replaceChildren(svg);});}
    window.lucide={createIcons:renderIcons};
    renderIcons();

    const picker = root.querySelector("#screen-picker");
    const screens = [...root.querySelectorAll("[data-screen]")];
    root.querySelectorAll("[data-shared-photo]").forEach((img) => { img.src = root.querySelector("#" + img.dataset.sharedPhoto).src; });
    function showScreen(name) {
      screens.forEach((screen) => {
        const active = screen.dataset.screen === name;
        screen.hidden = !active;
        screen.classList.remove("is-entering");
        if (active) {
          void screen.offsetWidth;
          screen.classList.add("is-entering");
          window.setTimeout(() => screen.classList.remove("is-entering"), 360);
        }
      });
      const stack = root.querySelector(".screen-stack");
      if (stack) stack.scrollTop = 0;
      picker.value = name;
      root.querySelectorAll(".nav-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.go === name || (name === "asset-detail" && tab.dataset.go === "inventory") || (name === "scanner" && tab.dataset.go === "home") || (name.startsWith("map-") && tab.dataset.go === "map-india") || (name === "unused-map" && tab.dataset.go === "map-india") || (name === "asset-report" && tab.dataset.go === "reports") || (name === "missing-assets" && tab.dataset.go === "verification")));
      if (name === "add-asset") {
        pendingBatch = [];
        const photoEl = root.querySelector("#add-asset-photo");
        if (photoEl && lastSingleCapturePhoto) photoEl.src = lastSingleCapturePhoto;
      }
      if (name === "scanner") {
        const camera = root.querySelector(".camera-view");
        camera.classList.add("is-scanning");
        window.setTimeout(() => camera.classList.remove("is-scanning"), 1150);
        startCamera();
      } else {
        stopCamera();
      }
      if (name === "qr-label") {
        syncPrinterConnectUI();
        const isBatch = pendingBatch.length > 1;
        const eyebrow = root.querySelector("#qr-label-eyebrow");
        const title = root.querySelector("#qr-label-title");
        const subhead = root.querySelector("#qr-label-subhead");
        const statusTitle = root.querySelector("#qr-status-title");
        const statusSub = root.querySelector("#qr-status-sub");
        if (isBatch && eyebrow) {
          eyebrow.textContent = `${pendingBatch.length} ASSETS SAVED · LABELS READY`;
          title.innerHTML = `Give them<br>scan-to-find tags.`;
          subhead.textContent = `Every label below opens its own asset record and keeps its history attached.`;
          statusTitle.textContent = `${pendingBatch.length} QR codes generated and linked`;
          statusSub.textContent = pendingBatch.slice(0, 3).join(", ") + (pendingBatch.length > 3 ? `, +${pendingBatch.length - 3} more` : "");
          root.querySelector("#qr-label-name").textContent = pendingBatch[0];
        } else if (eyebrow) {
          eyebrow.textContent = "ASSET SAVED · LABEL READY";
          title.innerHTML = "Give it a<br>scan-to-find tag.";
          subhead.textContent = "This label opens the asset record and keeps its history attached.";
          statusTitle.textContent = "QR generated and linked";
          statusSub.textContent = "Asset code: IT-00482 · unique record ID attached";
        }
        if (root.querySelector("#auto-print-toggle")?.checked) {
          window.setTimeout(() => root.querySelector("[data-print-label]")?.click(), 300);
        }
      }
      if (name === "printer-connect") {
        root.querySelectorAll(".printer-mode-tabs button").forEach((b, i) => { b.classList.toggle("is-selected", i === 0); b.setAttribute("aria-pressed", String(i === 0)); });
        renderPrinterDevices("wifi");
      }
    }
    picker.addEventListener("change", () => showScreen(picker.value));
    const activeCentres = [
      ["AHKC","Ahmedabad Krish Cubicle","Ahmedabad","Gujarat"],["AHTL","AHM The Link","Ahmedabad","Gujarat"],["BBJR","Bhubaneswar Janpath","Bhubaneswar","Odisha"],
      ["BGMA","Bangalore Meta Apply","Bangalore","Karnataka"],["BLQS","Bangalore Qube Software","Bangalore","Karnataka"],["BLUB","Bangalore UB City","Bangalore","Karnataka"],["PBTP","Bangalore Prasad Tech Park","Bangalore","Karnataka"],
      ["CHEA2","Chennai Express Avenue","Chennai","Tamil Nadu"],["CHOC","Olympia Crest","Chennai","Tamil Nadu"],["GCA1","Gurgaon Campus 1","Gurgaon","Haryana"],["GCA2","Gurgaon Campus 2","Gurgaon","Haryana"],["GCA3","Gurgaon Campus 3","Gurgaon","Haryana"],
      ["GGOH","DLF One Horizon","Gurgaon","Haryana"],["GMGC","Gurgaon M3M Urbana","Gurgaon","Haryana"],["GGSL","Gurgaon HQ27","Gurgaon","Haryana"],["HYAC","Hyderabad Anand Capital Tower","Hyderabad","Telangana"],
      ["","Hyderabad Gumidelli 4b","Hyderabad","Telangana"],["IA4F","Indore Apollo 4F","Indore","Madhya Pradesh"],["IKDS","iKeva Divyasree 2F Hyd","Hyderabad","Telangana"],["IKDS","iKeva Divyasree 3F Hyd","Hyderabad","Telangana"],
      ["IKIL","iKeva ILab Hyd","Hyderabad","Telangana"],["IKJP","iKeva Jyothi Pinnacle Hyd","Hyderabad","Telangana"],["IKJS","iKeva Jain Satguru Hyd","Hyderabad","Telangana"],["IKKP","iKeva KPHB Hyd","Hyderabad","Telangana"],["IKKS","iKeva Krishe Suphire Hyd","Hyderabad","Telangana"],
      ["IKMH","iKeva My Home Hub Hyd","Hyderabad","Telangana"],["IKMR","iKeva Umiya Marathahalli ORR BLR","Bangalore","Karnataka"],["IKOGM","iKeva OGM Hyd","Hyderabad","Telangana"],["IKOR","iKeva Orbit 16F Hyd","Hyderabad","Telangana"],["IKOR","iKeva Orbit 3F Hyd","Hyderabad","Telangana"],
      ["IKVC","iKeva Vaishnavi 3F Cynosure Hyd","Hyderabad","Telangana"],["IKVC","iKeva Vaishnavi 10F Cynosure Hyd","Hyderabad","Telangana"],["","Rajpushpa GF","Hyderabad","Telangana"],["IKWA","iKeva Western Aqua 6F Hyd","Hyderabad","Telangana"],["IKWA","iKeva Western Aqua-1F Hyd","Hyderabad","Telangana"],
      ["JPGT","Jaipur GT Landmark","Jaipur","Rajasthan"],["KOML","Kochi Oberon Mall","Kochi","Kerala"],["LI8F","Lucknow Indrium 2F","Lucknow","Uttar Pradesh"],["LKEC","LKO Eldeco Chamber","Lucknow","Uttar Pradesh"],["LKEX1","Experion 1st Floor","Lucknow","Uttar Pradesh"],["LKEX6","Experion 6th Floor","Lucknow","Uttar Pradesh"],["LKEX2","Experion 2nd Floor","Lucknow","Uttar Pradesh"],
      ["MULH","Mumbai LightHall","Mumbai","Maharashtra"],["NCA2","Noida Campus 2","Noida","Uttar Pradesh"],["NCGB","Noida Green Boulevard","Noida","Uttar Pradesh"],["NCT2","Noida Corenthum 2F","Noida","Uttar Pradesh"],["NCT3","Noida Corenthum 3F (A)+(B)","Noida","Uttar Pradesh"],["NCT4","Noida Corenthum 4F(A)+(B)","Noida","Uttar Pradesh"],["NFO4","Noida Fortune One","Noida","Uttar Pradesh"],["NOAL","Noida Alphathum","Noida","Uttar Pradesh"],["NWGR","Noida Windsor","Noida","Uttar Pradesh"],
      ["TPBB","Trios Pune Balaji Business Centre","Pune","Maharashtra"],["TPAB","Trios Pune Amar Business Zone","Pune","Maharashtra"],["TPMG","Trios Pune Magnus","Pune","Maharashtra"],["TPSY","Trios Pune Symphony IT Park","Pune","Maharashtra"],["TPTS","Trios Pune Tech Summit","Pune","Maharashtra"],["TPGT","Trios Pune Global Tower","Pune","Maharashtra"],["TPMV","Trios Pune Mont Vert Spectra","Pune","Maharashtra"],["TPIG","Trios Pune Indialand Global Tech Park","Pune","Maharashtra"],["TPFI","Trios Pune Finswell","Pune","Maharashtra"],
      ["TGAO","Trios Gurgaon Akaya One Sec 32","Gurgaon","Haryana"],["TGUC","Trios Gurgaon Unitech Cyber Park Sec 39","Gurgaon","Haryana"],["TRAH","Trivandrum Aspinwall","Trivandrum","Kerala"],["VAMC","Vadodara Alembic City","Vadodara","Gujarat"]
    ].map(([code,name,city,state],i)=>({code,name,city,state,id:`${code||"NO-CODE"}-${i+1}`,pinSeeded:code==="AHKC"||code==="GCA1",locationConflict:code==="TGAO"||code==="TGUC"}));
    const cityCoords={Ahmedabad:[23.0225,72.5714],Bhubaneswar:[20.2961,85.8245],Bangalore:[12.9716,77.5946],Chennai:[13.0827,80.2707],Gurgaon:[28.4595,77.0266],Hyderabad:[17.385,78.4867],Indore:[22.7196,75.8577],Jaipur:[26.9124,75.7873],Kochi:[9.9312,76.2673],Lucknow:[26.8467,80.9462],Mumbai:[19.076,72.8777],Noida:[28.5355,77.391],Pune:[18.5204,73.8567],Trivandrum:[8.5241,76.9366],Vadodara:[22.3072,73.1812]};
    const stateNames=[...new Set(activeCentres.map(c=>c.state))].sort();

    // ---- Demo asset catalog: 300 synthetic assets distributed across the real centre network ----
    const ASSET_CATEGORIES=[
      {key:'chair',label:'Ergonomic office chair',tag:'OF',photo:'concept-photo-1',weight:9},
      {key:'desk',label:'Workstation desk',tag:'OF',art:'desk',weight:8},
      {key:'standing-desk',label:'Standing desk',tag:'OF',art:'desk',weight:3},
      {key:'monitor',label:'24" monitor',tag:'IT',art:'monitor',weight:7},
      {key:'switch',label:'Network switch',tag:'IT',photo:'concept-photo-0',weight:3},
      {key:'router',label:'Wi-Fi router',tag:'IT',art:'router',weight:4},
      {key:'ups',label:'UPS backup unit',tag:'IT',art:'ups',weight:3},
      {key:'rack',label:'Server rack',tag:'IT',photo:'concept-photo-0',weight:2},
      {key:'ac',label:'Split AC unit',tag:'AC',art:'ac',weight:6},
      {key:'printer',label:'Office printer',tag:'OF',photo:'concept-photo-2',weight:4},
      {key:'projector',label:'Projector',tag:'AV',art:'projector',weight:3},
      {key:'phone',label:'Conference phone',tag:'AV',art:'phone',weight:3},
      {key:'display',label:'Meeting-room display',tag:'AV',art:'display',weight:3},
      {key:'cctv',label:'CCTV camera',tag:'SEC',art:'cctv',weight:4},
      {key:'access',label:'Access control reader',tag:'SEC',art:'access',weight:2},
      {key:'water',label:'Water purifier',tag:'OF',art:'water',weight:2,bulk:true},
      {key:'fire',label:'Fire extinguisher',tag:'SAFE',art:'fire',weight:3,bulk:true},
      {key:'coffee',label:'Coffee machine',tag:'OF',art:'coffee',weight:2,bulk:true}
    ];
    const ASSET_ART={
      desk:'<rect x="20" y="88" width="120" height="9" rx="4"/><rect x="32" y="97" width="9" height="32" rx="3"/><rect x="119" y="97" width="9" height="32" rx="3"/><rect x="36" y="62" width="88" height="26" rx="6"/><rect x="46" y="42" width="30" height="20" rx="4"/>',
      monitor:'<rect x="36" y="38" width="88" height="62" rx="8"/><rect x="48" y="50" width="64" height="38" rx="3" fill="none" stroke="#fff" stroke-width="4"/><rect x="72" y="100" width="16" height="13"/><rect x="58" y="113" width="44" height="8" rx="4"/>',
      router:'<rect x="38" y="72" width="84" height="24" rx="8"/><path d="M60 72 54 48M80 72 80 44M100 72 106 48" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="50" cy="84" r="3"/><circle cx="62" cy="84" r="3"/><circle cx="74" cy="84" r="3"/>',
      ups:'<rect x="48" y="30" width="64" height="98" rx="10"/><rect x="58" y="44" width="44" height="16" rx="3" fill-opacity=".55"/><path d="M82 68 70 94h16l-8 20 26-30H86z"/>',
      ac:'<rect x="26" y="54" width="108" height="34" rx="10"/><path d="M38 98 46 86M66 98 70 86M94 98 90 86M120 98 114 86" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/><rect x="36" y="65" width="88" height="6" rx="3" fill-opacity=".55"/>',
      projector:'<rect x="30" y="58" width="100" height="42" rx="12"/><circle cx="104" cy="79" r="14"/><circle cx="104" cy="79" r="6" fill-opacity=".4"/><rect x="40" y="98" width="20" height="8" rx="3"/>',
      phone:'<rect x="34" y="72" width="92" height="18" rx="9"/><circle cx="80" cy="81" r="24" fill="none" stroke="#fff" stroke-width="6"/><circle cx="80" cy="81" r="5"/>',
      display:'<rect x="24" y="42" width="112" height="68" rx="8"/><rect x="36" y="54" width="88" height="44" rx="3" fill-opacity=".5"/><rect x="66" y="112" width="28" height="8" rx="4"/>',
      cctv:'<rect x="30" y="56" width="68" height="28" rx="8"/><circle cx="106" cy="70" r="16"/><circle cx="106" cy="70" r="6" fill-opacity=".4"/><path d="M30 60 16 51v38l14-10z"/>',
      access:'<rect x="50" y="30" width="60" height="100" rx="14"/><circle cx="80" cy="58" r="11" fill-opacity=".9"/><rect x="64" y="78" width="32" height="7" rx="3" fill-opacity=".6"/><rect x="64" y="90" width="22" height="7" rx="3" fill-opacity=".4"/>',
      water:'<path d="M80 28 112 78a32 32 0 1 1-64 0z"/><path d="M66 94a14 14 0 0 0 14 14" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>',
      fire:'<path d="M80 24c20 22 8 30 20 46 9 13 3 28-8 36-17 12-42 7-49-12-6-15 1-25 10-31-3 11 4 17 11 15-7-16 1-27 16-54z"/>',
      coffee:'<rect x="38" y="56" width="64" height="58" rx="10"/><path d="M104 66h10a13 13 0 0 1 0 26h-10" fill="none" stroke="#fff" stroke-width="6"/><path d="M54 42c2 6-4 8-2 14M74 42c2 6-4 8-2 14" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>'
    };
    const ASSET_TINTS=['#202344','#F37F20','#3B9F94','#4C5A78','#C96414','#2C7A71'];
    function assetArtUri(key,idx){
      const body=ASSET_ART[key]||ASSET_ART.desk; const tint=ASSET_TINTS[idx%ASSET_TINTS.length];
      const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" rx="28" fill="${tint}"/><g fill="#fff">${body}</g></svg>`;
      return "data:image/svg+xml,"+encodeURIComponent(svg);
    }
    function mulberry32(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
    const rand=mulberry32(190226);
    const floorsList=["Ground floor","Floor 1","Floor 2","Floor 3","Floor 4","Basement store"];
    const STATUS_TABLE=[
      {status:"Verified today",cls:"status-ok",weight:48},
      {status:"Verified this cycle",cls:"status-ok",weight:31},
      {status:"Tracked · In service",cls:"",weight:13},
      {status:"Needs repair",cls:"",weight:4},
      {status:"Not seen this cycle",cls:"",weight:3},
      {status:"Out of service",cls:"",weight:1}
    ];
    function pickWeighted(list,r){const total=list.reduce((s,i)=>s+i.weight,0);let x=r*total;for(const item of list){if(x<item.weight)return item;x-=item.weight;}return list[list.length-1];}
    function generateAssetCatalog(total){
      const items=[]; const baseSeq={OF:14000,IT:21000,AC:33000,AV:41000,SEC:52000,SAFE:61000};
      const catWeighted=[]; ASSET_CATEGORIES.forEach((c,i)=>{for(let w=0;w<c.weight;w++)catWeighted.push(i);});
      const centreSlots=[]; activeCentres.forEach(c=>{centreSlots.push(c,c);});
      while(centreSlots.length<total){centreSlots.push(activeCentres[Math.floor(rand()*activeCentres.length)]);}
      centreSlots.length=total;
      for(let i=centreSlots.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[centreSlots[i],centreSlots[j]]=[centreSlots[j],centreSlots[i]];}
      for(let i=0;i<total;i++){
        const cat=ASSET_CATEGORIES[catWeighted[Math.floor(rand()*catWeighted.length)]];
        const centre=centreSlots[i];
        const floor=floorsList[Math.floor(rand()*floorsList.length)];
        const statusInfo=pickWeighted(STATUS_TABLE,rand());
        const seqBase=baseSeq[cat.tag]; baseSeq[cat.tag]=seqBase+1;
        const tag=`${cat.tag}-${String(seqBase).padStart(5,"0")}`;
        const isBulk=!!cat.bulk&&rand()<0.55;
        const qty=isBulk?2+Math.floor(rand()*5):1;
        const warrantyMonths=2+Math.floor(rand()*34);
        const imgSrc=cat.photo?null:assetArtUri(cat.art,i);
        items.push({id:`AST-${1000+i}`,label:cat.label,tag,category:cat.key,centreId:centre.id,centreName:centre.name,city:centre.city,state:centre.state,floor,status:statusInfo.status,statusClass:statusInfo.cls,isBulk,qty,warrantyMonths,photoId:cat.photo||null,imgSrc});
      }
      return items;
    }
    const assetCatalog=generateAssetCatalog(300);
    function assetImgSrc(asset){if(asset.photoId){const node=root.querySelector("#"+asset.photoId);return node?node.src:"";}return asset.imgSrc;}
    let selectedAsset=null;
    function renderInventory(filter,query){
      filter=filter||(root.querySelector("[data-inv-filter].active")?.dataset.invFilter)||"all";
      query=query==null?(root.querySelector("#inventory-search")?.value||""):query;
      const list=root.querySelector("#inventory-list"); if(!list)return;
      const q=query.trim().toLowerCase();
      let items=assetCatalog;
      if(filter==="tracked")items=items.filter(a=>!a.isBulk);
      if(filter==="bulk")items=items.filter(a=>a.isBulk);
      if(q)items=items.filter(a=>`${a.label} ${a.tag} ${a.centreName} ${a.city}`.toLowerCase().includes(q));
      const shown=items.slice(0,60);
      list.innerHTML=shown.map(a=>`<button class="inventory-item" data-go="asset-detail" data-asset-id="${a.id}"><img src="${assetImgSrc(a)}" alt="${a.label}"><span><strong>${a.label}</strong><small>${a.tag} · ${a.floor}, ${a.centreName}</small><em class="${a.statusClass}">${a.isBulk?`Bulk group · ${a.qty} units`:a.status}</em></span><i data-lucide="chevron-right" aria-hidden="true"></i></button>`).join("")||'<p class="quiet-note">No assets match your search.</p>';
      const caption=root.querySelector("#inv-result-caption");
      if(caption)caption.textContent=(q||filter!=="all")?`${items.length} match${items.length===1?"":"es"}`:`Showing ${shown.length} of ${items.length} · search to narrow`;
      if(window.lucide)window.lucide.createIcons();
      list.querySelectorAll("[data-asset-id]").forEach(btn=>btn.addEventListener("click",()=>{
        const asset=assetCatalog.find(a=>a.id===btn.dataset.assetId);
        if(asset)openAssetDetail(asset);
        showScreen("asset-detail");
      }));
    }
    function openAssetDetail(asset){
      selectedAsset=asset;
      const img=root.querySelector("#detail-photo-img");if(img)img.src=assetImgSrc(asset);
      const eyebrow=root.querySelector("#detail-eyebrow");if(eyebrow)eyebrow.textContent=`${asset.isBulk?"BULK ASSET":"TRACKED ASSET"} · ${asset.tag}`;
      const title=root.querySelector("#detail-title");if(title)title.textContent=asset.label;
      const pill=root.querySelector("#detail-status-pill");if(pill)pill.innerHTML=`<i data-lucide="${asset.statusClass==="status-ok"?"check":"triangle-alert"}" aria-hidden="true"></i>${asset.isBulk?`${asset.qty} units`:asset.status}`;
      const loc=root.querySelector("#detail-location");if(loc)loc.textContent=`${asset.centreName} · ${asset.floor}`;
      const serial=root.querySelector("#detail-serial");if(serial)serial.textContent=`SN ··· ${asset.id.slice(-4)}`;
      const condition=root.querySelector("#detail-condition");if(condition)condition.textContent=asset.statusClass==="status-ok"?"Good":(asset.status==="Needs repair"?"Needs repair":asset.status==="Out of service"?"Out of service":"Review needed");
      const warranty=root.querySelector("#detail-warranty-text");if(warranty)warranty.textContent=`Warranty active · ${asset.warrantyMonths} months left`;
      if(window.lucide)window.lucide.createIcons();
    }

    function googleMapUrl(c){return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.name}, ${c.city}, ${c.state}, India}`)}`;}
    root.querySelector("#centre-count").textContent=activeCentres.length;
    renderCentreDirectory();
    renderStateList();
    loadIndiaBoundaries();
    renderInventory("all","");
    const invAllCountEl=root.querySelector("#inv-all-count");if(invAllCountEl)invAllCountEl.textContent=assetCatalog.length;
    const invTrackedCountEl=root.querySelector("#inv-tracked-count");if(invTrackedCountEl)invTrackedCountEl.textContent=assetCatalog.filter(a=>!a.isBulk).length;
    const invBulkCountEl=root.querySelector("#inv-bulk-count");if(invBulkCountEl)invBulkCountEl.textContent=assetCatalog.filter(a=>a.isBulk).length;
    const networkAssetTotalEl=root.querySelector("#network-asset-total");if(networkAssetTotalEl)networkAssetTotalEl.textContent=assetCatalog.length;
    const networkAttentionCountEl=root.querySelector("#network-attention-count");if(networkAttentionCountEl)networkAttentionCountEl.textContent=assetCatalog.filter(a=>a.status==="Needs repair"||a.status==="Out of service"||a.status==="Not seen this cycle").length;
    root.querySelectorAll("[data-inv-filter]").forEach(btn=>btn.addEventListener("click",()=>{
      root.querySelectorAll("[data-inv-filter]").forEach(b=>b.classList.toggle("active",b===btn));
      renderInventory(btn.dataset.invFilter,root.querySelector("#inventory-search")?.value||"");
    }));
    root.querySelector("#inventory-search")?.addEventListener("input",e=>{
      const active=root.querySelector("[data-inv-filter].active");
      renderInventory(active?active.dataset.invFilter:"all",e.target.value);
    });
    function renderCentreDirectory(query=""){
      const target=root.querySelector("#centre-directory-list"); if(!target)return;
      const q=query.trim().toLowerCase(); const items=activeCentres.filter(c=>`${c.code} ${c.name} ${c.city} ${c.state}`.toLowerCase().includes(q));
      target.innerHTML=items.map(c=>`<button class="centre-directory-item" data-centre-id="${c.id}" data-go="map-centre"><span class="centre-directory-code">${c.code||"—"}</span><span class="centre-directory-copy"><strong>${c.name}</strong><small>${c.city}, ${c.state} · ${c.code||"Code not listed"}</small></span><span class="pin-status ${c.pinConfirmed?"confirmed":"pending"}">${c.locationConflict?"City mismatch":c.pinSeeded?"Seed pin · verify":"Pin needed"}</span><i data-lucide="chevron-right"></i></button>`).join("")||'<p class="quiet-note">No centres match your search.</p>';
      root.querySelector("#directory-total").textContent=items.length; root.querySelector("#directory-city-count").textContent=new Set(items.map(c=>c.city)).size; if(window.lucide)window.lucide.createIcons();
      target.querySelectorAll("[data-centre-id]").forEach(b=>b.addEventListener("click",()=>{const c=activeCentres.find(x=>x.id===b.dataset.centreId);if(c){chooseCentre(c.name,c);showScreen("map-centre");}}));
    }
    function renderStateList(){const target=root.querySelector("#india-state-list");if(!target)return;target.innerHTML=stateNames.map(state=>{const n=activeCentres.filter(c=>c.state===state).length;return `<button data-go="map-state" data-state="${state}"><span class="state-bullet green"></span><strong>${state}</strong><small>${n} centres</small><i data-lucide="chevron-right"></i></button>`}).join("");if(window.lucide)window.lucide.createIcons();}
    function strHash(s){let h=0;for(let i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))|0;}return Math.abs(h);}
    function floorsForCentre(centre){
      const n=3+(strHash(centre.id)%4);
      const statuses=["is-verified","is-verified","is-due","is-overdue"];
      return Array.from({length:n},(_,i)=>{
        const seed=strHash(centre.id+"-"+i);
        const status=statuses[seed%statuses.length];
        const assets=14+(seed%26);
        const scanned=status==="is-verified"?assets:Math.max(0,assets-1-(seed%5));
        return {num:i+1,status,assets,scanned};
      });
    }
    function renderStateCentres(state){const list=root.querySelector("#state-centre-list");if(!list)return;const items=activeCentres.filter(c=>c.state===state);
      const byCity={};items.forEach(c=>{(byCity[c.city]=byCity[c.city]||[]).push(c);});
      const cities=Object.keys(byCity).sort();
      root.querySelector("#state-centre-heading").textContent=`${cities.length} ${cities.length===1?"city":"cities"}`;
      list.innerHTML=cities.map((city,i)=>{const group=byCity[city];const totalAssets=group.reduce((sum,c)=>sum+floorsForCentre(c).reduce((s,f)=>s+f.assets,0),0);
        return `<button class="centre-card" data-city="${city}"><span class="centre-index">${String(i+1).padStart(2,"0")}</span><span><strong>${city}</strong><small>${group.length} building${group.length===1?"":"s"} · ~${totalAssets} assets</small></span><i data-lucide="chevron-right"></i></button>`;
      }).join("")||'<p class="quiet-note">No centres recorded for this state yet.</p>';
      if(window.lucide)window.lucide.createIcons();
      list.querySelectorAll("[data-city]").forEach(b=>b.addEventListener("click",()=>{chooseCity(state,b.dataset.city);showScreen("map-city");}));
    }
    function chooseCity(state,city){
      root.querySelectorAll(".selected-city,.selected-city-title").forEach(el=>{el.textContent=city;});
      renderCityBuildings(state,city);
    }
    function renderCityBuildings(state,city){
      const target=root.querySelector("#city-building-list");if(!target)return;
      const items=activeCentres.filter(c=>c.state===state&&c.city===city);
      target.innerHTML=items.map(c=>{
        const floors=floorsForCentre(c);
        const mini=floors.map(f=>`<span class="mini-floor ${f.status}"></span>`).join("");
        const label=c.name.startsWith(city)?c.name.slice(city.length).trim().replace(/^[\s·-]+/,"")||c.name:c.name;
        return `<button class="city-building-card" data-centre-id="${c.id}"><span class="mini-building">${mini}<span class="mini-roof"></span></span><strong>${label}</strong><small>${floors.length} floors · ${c.code||"no code"}</small></button>`;
      }).join("")||'<p class="quiet-note">No buildings recorded for this city yet.</p>';
      if(window.lucide)window.lucide.createIcons();
      target.querySelectorAll("[data-centre-id]").forEach(b=>b.addEventListener("click",()=>{const c=items.find(x=>x.id===b.dataset.centreId);if(c){chooseCentre(c.name,c);renderBuildingFloors(c);showScreen("map-building");}}));
    }
    function renderBuildingFloors(c){
      const stack=root.querySelector("#building-floor-stack");if(!stack)return;
      const listView=root.querySelector("#floor-list-view");
      const floors=floorsForCentre(c);
      const current=floors.some(f=>f.num===4)?4:floors[0].num;
      const statusWord={"is-verified":"Verified","is-due":"Due","is-overdue":"Overdue"};
      const goToFloor=(n)=>{
        root.querySelectorAll(".selected-floor").forEach(el=>{el.textContent=`FLOOR ${n}`;});
        root.querySelectorAll(".selected-floor-title").forEach(el=>{el.textContent=`Floor ${n}`;});
        showScreen("map-area");
      };
      stack.innerHTML=floors.map(f=>`<button class="iso-floor ${f.status}${f.num===current?" is-current":""}" data-floor="${f.num}"><span><strong>Floor ${f.num}</strong><small>${f.scanned} of ${f.assets} scanned</small></span><span class="iso-status">${statusWord[f.status]}</span></button>`).join("")+'<div class="iso-roof"></div><div class="iso-depth" aria-hidden="true"></div>';
      if(listView)listView.innerHTML=floors.map(f=>`<button class="floor-list-row ${f.status}${f.num===current?" is-current":""}" data-floor="${f.num}"><i data-lucide="map-pin"></i><span><strong>Floor ${f.num}${f.num===current?" · Main building":""}</strong><small>${f.scanned} of ${f.assets} scanned</small></span><span class="iso-status">${statusWord[f.status]}</span></button>`).join("");
      if(window.lucide)window.lucide.createIcons();
      stack.querySelectorAll(".iso-floor").forEach(btn=>btn.addEventListener("click",()=>goToFloor(btn.dataset.floor)));
      if(listView)listView.querySelectorAll(".floor-list-row").forEach(btn=>btn.addEventListener("click",()=>goToFloor(btn.dataset.floor)));
    }
    async function loadIndiaBoundaries(){
      const target=root.querySelector("#india-state-boundaries"); if(!target)return;
      try { const res=await fetch("https://raw.githubusercontent.com/udit-001/india-maps-data/main/topojson/india.json"); if(!res.ok)throw Error("boundaries unavailable"); const topo=await res.json(); const arcs=topo.arcs.map(arc=>{let x=0,y=0;return arc.map(([dx,dy])=>{x+=dx;y+=dy;return [topo.transform.translate[0]+x*topo.transform.scale[0],topo.transform.translate[1]+y*topo.transform.scale[1]]})});
        const project=([lon,lat])=>[(lon-68.1)*8.4,(37.08-lat)*8.4];
        const arcPoints=id=>{const pts=arcs[id<0?~id:id];return id<0?[...pts].reverse():pts};
        const geoms=topo.objects.districts.geometries; const states=[...new Set(geoms.map(g=>g.properties.st_nm))];
        target.innerHTML=states.map(state=>{const shape=geoms.filter(g=>g.properties.st_nm===state).map(g=>{const polys=g.type==="Polygon"?[g.arcs]:g.arcs;return polys.map(poly=>poly.map(ring=>ring.flatMap((ref,i)=>{const pts=arcPoints(ref);return (i?pts.slice(1):pts).map(project)}).map((pt,i)=>`${i?"L":"M"}${pt[0].toFixed(1)},${pt[1].toFixed(1)}`).join("")+"Z").join("")).map(d=>`<path d="${d}"/>`).join("")}).join("");return `<g class="india-state" data-state="${state}">${shape}<title>${state}</title></g>`}).join("");
        root.querySelectorAll(".india-state").forEach(g=>g.addEventListener("click",()=>{const match=stateNames.find(s=>s.toLowerCase()===g.dataset.state.toLowerCase());if(match){chooseState(match);showScreen("map-state");}}));
        const pins=root.querySelector("#india-map-pins"); const agg={};activeCentres.forEach(c=>agg[c.city]=(agg[c.city]||0)+1);
        pins.innerHTML=Object.entries(agg).map(([city,count])=>{const [lat,lon]=cityCoords[city], [x,y]=project([lon,lat]);return `<g class="city-pin" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" data-city="${city}" role="button" tabindex="0" aria-label="${city} · ${count} centres"><title>${city} · ${count} centres</title><circle r="3.5"/><circle class="pin-pulse" r="7"/><text x="5" y="-5">${city} · ${count}</text></g>`}).join("");
        pins.querySelectorAll(".city-pin").forEach(pin=>{const c=activeCentres.find(x=>x.city===pin.dataset.city);const go=()=>{if(c){chooseState(c.state);showScreen("map-state");}};pin.addEventListener("click",go);pin.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();go();}})});
        renderStateList();
        if(selectedState)chooseState(selectedState);
      } catch(e) { target.innerHTML='<text x="28" y="128" fill="#536277" font-size="11">Map needs an internet connection.</text>'; }
    }
    const stateData = Object.fromEntries(stateNames.map(state=>[state,{centers:activeCentres.filter(c=>c.state===state)}]));
    let selectedCentre=activeCentres[0];
    let selectedState=null;
    chooseState(stateNames[0]);
    function chooseCentre(name, centre) {
      selectedCentre=centre||activeCentres.find(c=>c.name===name)||selectedCentre;
      if(selectedCentre){root.querySelectorAll("[data-centre-field]").forEach(input=>{const f=input.dataset.centreField;input.value=f==="code"?(selectedCentre.code||""):f==="name"?selectedCentre.name:f==="city"?`${selectedCentre.city}, ${selectedCentre.state}`:input.value;});}
      root.querySelector(".selected-centre-title").textContent = name;
      root.querySelector(".selected-centre").textContent = name.toUpperCase();
      const query=centre?googleMapUrl(centre):"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(name);
      root.querySelectorAll(".map-search-link").forEach(a=>a.href=query);
      const sub=root.querySelector("[data-screen=map-centre] .subhead");
      if(sub&&centre){
        const centreAssets=assetCatalog.filter(a=>a.centreId===centre.id);
        const verified=centreAssets.filter(a=>a.statusClass==="status-ok").length;
        const dueSoon=centreAssets.filter(a=>a.status==="Not seen this cycle").length;
        const unmatched=centreAssets.length-verified-dueSoon;
        const verifiedEl=root.querySelector("#centre-stat-verified");if(verifiedEl)verifiedEl.textContent=verified;
        const dueEl=root.querySelector("#centre-stat-due");if(dueEl)dueEl.textContent=dueSoon;
        const unmatchedEl=root.querySelector("#centre-stat-unmatched");if(unmatchedEl)unmatchedEl.textContent=unmatched;
        sub.textContent=`${centreAssets.length} recorded assets · ${centre.code||"No centre code listed"} · ${centre.city}, ${centre.state} · ${centre.pinSeeded?"DPR seed location; confirm building entrance":"city level only; confirm exact building pin"}`;
      }
    }
    function chooseState(name) {
      const data=stateData[name]; if(!data)return;
      selectedState=name;
      root.querySelector(".selected-state-title").textContent=name;root.querySelector(".selected-state").textContent=name.toUpperCase();renderStateCentres(name);
      const group=root.querySelector(`#india-state-boundaries .india-state[data-state="${CSS.escape(name)}"]`);const shape=root.querySelector("#selected-state-shape");
      if(group&&shape){shape.innerHTML=group.innerHTML;const box=group.getBBox();shape.setAttribute("viewBox",`${box.x-4} ${box.y-4} ${box.width+8} ${box.height+8}`);}
    }
    root.querySelector("#centre-search")?.addEventListener("input",e=>renderCentreDirectory(e.target.value));
    root.querySelectorAll("[data-action]").forEach(button=>button.addEventListener("click",()=>{const action=button.dataset.action;if(action==="add-floor"||action==="add-area"){button.textContent=action==="add-floor"?"Floor added":"Area added";button.classList.add("action-done");}else if(action==="save-centre"){button.innerHTML='Centre details saved <i data-lucide="check"></i>';button.classList.add("action-done");if(window.lucide)window.lucide.createIcons();announce("Report filed. Centre Head notified; State Head and Head Office can track it.");}}));
    root.addEventListener("click", (event) => {
      const button = event.target.closest("[data-go]");
      if (!button) return;
      if (button.dataset.state) chooseState(button.dataset.state);
      if (button.classList.contains("centre-card")) chooseCentre(button.querySelector("strong").textContent);
      showScreen(button.dataset.go);
    });
    root.addEventListener("keydown", (event) => {
      const button = event.target.closest("[data-go]");
      if (!button) return;
      if (button.getAttribute("role") === "button" && button.tagName !== "BUTTON" && button.tagName !== "A") {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); button.click(); }
      }
    });
    function announce(message){let toast=root.querySelector(".prototype-toast");if(!toast){toast=document.createElement("div");toast.className="prototype-toast";toast.setAttribute("role","status");toast.setAttribute("aria-live","polite");root.querySelector(".prototype-phone").appendChild(toast);}toast.textContent=message;toast.classList.add("show");window.clearTimeout(toast._timer);toast._timer=window.setTimeout(()=>toast.classList.remove("show"),3200);}
    root.querySelectorAll(".report-type").forEach(button=>button.addEventListener("click",()=>{root.querySelectorAll(".report-type").forEach(b=>b.classList.toggle("is-selected",b===button));}));
    root.querySelectorAll(".space-type").forEach(button=>button.addEventListener("click",()=>{root.querySelectorAll(".space-type").forEach(b=>b.classList.toggle("is-selected",b===button));}));
    root.querySelectorAll("[data-report-filter]").forEach(button=>button.addEventListener("click",()=>{root.querySelectorAll("[data-report-filter]").forEach(b=>b.classList.toggle("active",b===button));}));
    root.querySelectorAll("[data-action]").forEach(button=>button.addEventListener("click",()=>{const action=button.dataset.action;if(action==="add-new-centre"){root.querySelectorAll("[data-centre-field]").forEach(input=>input.value="");root.querySelector('[data-centre-field="code"]').focus();showScreen("centre-manager");}else if(action==="mark-not-seen"){button.textContent="Not seen · Centre Head notified";button.classList.add("action-done");announce("Centre Head and asset custodian notified. If still unconfirmed when the 2-month window closes, it escalates to the State Head and Head Office.");}else if(action==="notify-missing"){button.textContent="Owners and state heads notified";button.classList.add("action-done");announce("Centre owners and State Heads notified. Head Office can track every unresolved asset.");}else if(action==="attach-photo"){button.innerHTML='Photo attached · add another <i data-lucide="check"></i>';button.classList.add("action-done");if(window.lucide)window.lucide.createIcons();announce("Evidence attached to the asset report.");}else if(action==="submit-report"){root.querySelector("#reports-open-count").textContent="19";button.innerHTML='Report submitted · owners notified <i data-lucide="check"></i>';button.classList.add("action-done");if(window.lucide)window.lucide.createIcons();announce("Report filed. Centre Head notified; State Head and Head Office can track it.");}else if(action==="save-space"){const nameInput=root.querySelector("#space-name-input");const name=nameInput.value.trim();if(!name){nameInput.focus();return;}const type=root.querySelector(".space-type.is-selected")?.dataset.spaceType||"Room";const where=root.querySelector("#space-where-input").value.trim();const usage=root.querySelector('[data-screen="add-space"] .segmented button.is-selected')?.textContent||"Internal";const typeIcons={Room:"layers-2",Zone:"inside-outside",Storage:"package-open",Corridor:"move-right"};const list=root.querySelector("#space-list");const row=document.createElement("div");row.className="compact-row";row.innerHTML=`<i data-lucide="${typeIcons[type]}"></i><span><strong>${name}</strong><small>${type} · ${usage.toLowerCase()}${where?" · "+where:""} · 0 assets</small></span><button class="text-action space-move-btn" data-space-name="${name}">Move<i data-lucide="move-right"></i></button>`;list.prepend(row);const count=root.querySelector("#space-count");count.textContent=`${list.children.length} spaces`;nameInput.value="";root.querySelector("#space-where-input").value="";root.querySelectorAll(".space-type").forEach(b=>b.classList.toggle("is-selected",b.dataset.spaceType==="Room"));root.querySelectorAll('[data-screen="add-space"] .segmented button').forEach((b,i)=>{b.classList.toggle("is-selected",i===0);b.setAttribute("aria-pressed",String(i===0));});if(window.lucide)window.lucide.createIcons();announce(`"${name}" added to Floor 4 — assets can now be placed in it.`);}else if(action==="move-assets"){const checked=[...root.querySelectorAll("#move-asset-list input[type=checkbox]:checked")];if(!checked.length||!currentMoveTarget)return;checked.forEach(cb=>{const moveRow=cb.closest(".move-asset-row");moveRow.classList.add("is-moved");const small=moveRow.querySelector("small");small.textContent=small.textContent.replace(/currently:.*/,`currently: ${currentMoveTarget}`);cb.checked=false;});const spaceRow=[...root.querySelectorAll("#space-list .compact-row")].find(r=>r.querySelector(".space-move-btn")?.dataset.spaceName===currentMoveTarget);if(spaceRow){const small=spaceRow.querySelector("small");const match=small.textContent.match(/(\d+) assets?$/);const current=match?parseInt(match[1],10):0;const next=current+checked.length;small.textContent=small.textContent.replace(/\d+ assets?$/,`${next} asset${next===1?"":"s"}`);}announce(`${checked.length} asset${checked.length===1?"":"s"} moved to "${currentMoveTarget}".`);updateMoveButton();showScreen("add-space");}}));
    root.querySelectorAll(".source-choice").forEach((button) => button.addEventListener("click", () => {
      root.querySelectorAll(".source-choice").forEach((choice) => {
        const active = choice === button;
        choice.classList.toggle("is-selected", active);
        choice.setAttribute("aria-pressed", String(active));
      });
      root.querySelector(".source-feedback").textContent = button.textContent.trim() + " selected · add another source to this record";
    }));
    root.querySelectorAll(".capture-mode").forEach((button) => button.addEventListener("click", () => {
      root.querySelectorAll(".capture-mode").forEach((mode) => {
        const active = mode === button;
        mode.classList.toggle("active", active);
        mode.setAttribute("aria-pressed", String(active));
      });
      if (button.textContent.trim() === "Scan code") startScanLoop();
      else stopScanLoop();
    }));
    // --- Real camera: live preview, QR/barcode decode (jsQR), and photo capture ---
    let cameraStream = null;
    let scanLoopId = null;
    let currentFacingMode = "environment";
    let lastDecodedText = "";
    let lastDecodedAt = 0;
    const cameraVideo = root.querySelector("#camera-live-feed");
    const cameraCanvas = root.querySelector("#camera-capture-canvas");
    const cameraFallbackImage = root.querySelector("#camera-fallback-image");

    function activeCaptureMode() {
      return root.querySelector(".capture-mode.active")?.textContent.trim() || "Scan code";
    }

    async function startCamera() {
      const banner = root.querySelector("#camera-permission-banner");
      if (!navigator.mediaDevices?.getUserMedia) {
        if (banner) banner.hidden = false;
        return;
      }
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: currentFacingMode },
          audio: false,
        });
        if (cameraVideo) {
          cameraVideo.srcObject = cameraStream;
          cameraVideo.hidden = false;
          await cameraVideo.play().catch(() => {});
        }
        if (cameraFallbackImage) cameraFallbackImage.hidden = true;
        if (banner) banner.hidden = true;
        try { localStorage.setItem("incuasset-camera-granted", "1"); } catch (e) {}
        if (activeCaptureMode() === "Scan code") startScanLoop();
      } catch (err) {
        // Denied, no camera hardware, or insecure context — fall back to the
        // static concept image so the rest of the prototype still works.
        if (banner) banner.hidden = false;
        if (cameraFallbackImage) cameraFallbackImage.hidden = false;
        if (cameraVideo) cameraVideo.hidden = true;
      }
    }

    function stopCamera() {
      stopScanLoop();
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
        cameraStream = null;
      }
      if (cameraVideo) {
        cameraVideo.pause();
        cameraVideo.srcObject = null;
        cameraVideo.hidden = true;
      }
      if (cameraFallbackImage) cameraFallbackImage.hidden = false;
    }

    async function restartCamera() {
      stopCamera();
      await startCamera();
    }

    function startScanLoop() {
      if (scanLoopId || !cameraVideo || !cameraCanvas || typeof window.jsQR !== "function") return;
      const ctx = cameraCanvas.getContext("2d", { willReadFrequently: true });
      function tick() {
        if (cameraVideo.readyState === cameraVideo.HAVE_ENOUGH_DATA && cameraVideo.videoWidth) {
          cameraCanvas.width = cameraVideo.videoWidth;
          cameraCanvas.height = cameraVideo.videoHeight;
          ctx.drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height);
          const imageData = ctx.getImageData(0, 0, cameraCanvas.width, cameraCanvas.height);
          const result = window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
          if (result && result.data) {
            const now = Date.now();
            if (result.data !== lastDecodedText || now - lastDecodedAt > 2500) {
              lastDecodedText = result.data;
              lastDecodedAt = now;
              onCodeDecoded(result.data);
            }
          }
        }
        scanLoopId = window.requestAnimationFrame(tick);
      }
      scanLoopId = window.requestAnimationFrame(tick);
    }

    function stopScanLoop() {
      if (scanLoopId) {
        window.cancelAnimationFrame(scanLoopId);
        scanLoopId = null;
      }
    }

    function onCodeDecoded(text) {
      if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) {} }
      const qrField = root.querySelector("#add-asset-qr-field");
      if (qrField) qrField.value = text;
      announce(`Code scanned: ${text} · opening the matching asset`);
      window.setTimeout(() => showScreen("asset-detail"), 260);
    }

    // Attempts one decode from the current frame right now (used as a manual
    // fallback when the user taps the shutter instead of waiting for the
    // continuous scan loop to find a code).
    function decodeCurrentFrame() {
      if (!cameraVideo || !cameraCanvas || !cameraVideo.videoWidth || typeof window.jsQR !== "function") return null;
      cameraCanvas.width = cameraVideo.videoWidth;
      cameraCanvas.height = cameraVideo.videoHeight;
      const ctx = cameraCanvas.getContext("2d");
      ctx.drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height);
      const imageData = ctx.getImageData(0, 0, cameraCanvas.width, cameraCanvas.height);
      const result = window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
      return result ? result.data : null;
    }

    function capturePhotoFrame() {
      if (!cameraVideo || !cameraCanvas || !cameraVideo.videoWidth) return null;
      cameraCanvas.width = cameraVideo.videoWidth;
      cameraCanvas.height = cameraVideo.videoHeight;
      const ctx = cameraCanvas.getContext("2d");
      ctx.drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height);
      try { return cameraCanvas.toDataURL("image/jpeg", 0.85); } catch (e) { return null; }
    }

    const sessionCaptures = [];
    let lastSingleCapturePhoto = null;
    const sessionNames = ["Network switch","Office chair","Desktop monitor","Projector","Whiteboard","Fire extinguisher","Printer","Router"];
    function syncCaptureSessionUI() {
      const pill = root.querySelector("#camera-session-pill");
      const countEl = root.querySelector("#camera-session-count");
      const strip = root.querySelector("#capture-thumbstrip");
      const primaryAction = root.querySelector("#scanner-primary-action");
      if (countEl) countEl.textContent = sessionCaptures.length;
      if (pill) pill.hidden = sessionCaptures.length === 0;
      if (strip) {
        strip.hidden = sessionCaptures.length === 0;
        strip.innerHTML = sessionCaptures.map((item) => item.photo
          ? `<img src="${item.photo}" alt="Captured asset photo">`
          : `<img data-shared-photo="concept-photo-0" alt="Captured asset photo">`).join("");
        strip.querySelectorAll("[data-shared-photo]").forEach((img) => { img.src = root.querySelector("#" + img.dataset.sharedPhoto).src; });
      }
      if (primaryAction && sessionCaptures.length > 0) {
        primaryAction.innerHTML = `Review &amp; save ${sessionCaptures.length} asset${sessionCaptures.length > 1 ? "s" : ""} <i data-lucide="arrow-right" aria-hidden="true"></i>`;
        primaryAction.dataset.go = sessionCaptures.length > 1 ? "batch-review" : "add-asset";
        if (window.lucide) window.lucide.createIcons();
      }
    }
    const shutter = root.querySelector(".capture-shutter");
    shutter.addEventListener("click", () => {
      shutter.classList.add("is-captured");
      const activeModeLabel = [...root.querySelectorAll(".capture-mode")].find((mode) => mode.classList.contains("active"))?.textContent.trim();
      window.setTimeout(() => { shutter.classList.remove("is-captured"); }, 260);
      if (activeModeLabel === "Photo") {
        const photo = capturePhotoFrame();
        sessionCaptures.push({ name: sessionNames[sessionCaptures.length % sessionNames.length], photo });
        announce(`Captured · ${sessionCaptures.length} asset${sessionCaptures.length > 1 ? "s" : ""} ready to review. Keep capturing or review & save.`);
        syncCaptureSessionUI();
      } else if (activeModeLabel === "RFID") {
        // Real RFID needs a native NFC bridge (not available to a plain WebView) —
        // this stays a simulated read until that's built.
        announce("RFID tag read · opening the matching asset");
        window.setTimeout(() => showScreen("asset-detail"), 260);
      } else {
        const decoded = decodeCurrentFrame();
        if (decoded) {
          onCodeDecoded(decoded);
        } else {
          announce(cameraStream ? "No code in frame — hold steady and try again" : "Code captured · opening the matching asset");
          if (!cameraStream) window.setTimeout(() => showScreen("asset-detail"), 260);
        }
      }
    });
    root.querySelectorAll("[data-action='grant-camera']").forEach((button) => button.addEventListener("click", () => {
      // startCamera() itself shows/hides the banner based on whether the
      // browser actually grants access — don't force-hide it here.
      restartCamera();
    }));
    let pendingBatch = [];
    function renderBatchReview() {
      const list = root.querySelector("#batch-review-list");
      if (!list) return;
      root.querySelector("#batch-count-label").textContent = sessionCaptures.length;
      root.querySelector("#batch-generate-count").textContent = sessionCaptures.length;
      list.innerHTML = sessionCaptures.map((item, i) => `<div class="batch-review-row">${item.photo ? `<img src="${item.photo}" alt="Captured asset photo">` : `<img data-shared-photo="concept-photo-0" alt="Captured asset photo">`}<div><input value="${item.name}" data-batch-index="${i}" aria-label="Asset name"><small>Building A · Floor 4 · auto-located</small></div></div>`).join("");
      list.querySelectorAll("[data-shared-photo]").forEach((img) => { img.src = root.querySelector("#" + img.dataset.sharedPhoto).src; });
    }
    root.querySelector("#scanner-primary-action")?.addEventListener("click", () => {
      if (sessionCaptures.length > 1) {
        renderBatchReview();
      } else if (sessionCaptures.length === 1) {
        lastSingleCapturePhoto = sessionCaptures[0].photo || null;
      }
      sessionCaptures.length = 0;
      syncCaptureSessionUI();
    });
    root.querySelector("[data-action='generate-batch-labels']")?.addEventListener("click", () => {
      root.querySelectorAll("#batch-review-list [data-batch-index]").forEach((input) => {
        const row = input.closest(".batch-review-row");
        row.dataset.name = input.value.trim() || "Untitled asset";
      });
      pendingBatch = [...root.querySelectorAll("#batch-review-list .batch-review-row")].map((row) => row.dataset.name);
      announce(`${pendingBatch.length} QR labels generated · ready to print`);
      showScreen("qr-label");
    });
    const scanFab = root.querySelector(".scan-fab");
    scanFab.addEventListener("click", () => {
      showScreen("scanner");
      if (scanFab.classList.contains("is-scanning")) return;
      scanFab.classList.add("is-scanning");
      root.querySelector(".scan-live").textContent = "Camera ready · frame the asset label or code";
      window.setTimeout(() => {
        scanFab.classList.remove("is-scanning");
        root.querySelector(".scan-live").textContent = "";
      }, 1200);
    });
    root.querySelectorAll(".camera-switch").forEach((btn) => {
      const toggle = () => {
        currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
        announce(`Switched to ${currentFacingMode === "environment" ? "back" : "front"} camera`);
        if (cameraStream) restartCamera();
      };
      btn.addEventListener("click", toggle);
      btn.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    });
    const purchaseShutter = root.querySelector(".purchase-shutter");
    purchaseShutter?.addEventListener("click", () => {
      purchaseShutter.classList.add("is-captured");
      const tile = root.querySelector(".evidence-tile:not(.done)");
      if (tile) {
        tile.classList.add("done");
        const icon = tile.querySelector("i"); if (icon) icon.setAttribute("data-lucide", "file-check-2");
        const small = tile.querySelector("small"); if (small) small.textContent = "SN · captured just now";
        const em = tile.querySelector("em"); if (em) em.textContent = "Serial matched to invoice";
        if (window.lucide) window.lucide.createIcons();
      }
      announce("Product photo captured · serial matched to invoice");
      window.setTimeout(() => purchaseShutter.classList.remove("is-captured"), 260);
    });
    const printerDevices = {
      wifi: [
        { name: "Zebra ZD230 · Floor 4 IT store", meta: "192.168.1.42 · ready" },
        { name: "Brother QL-820NWB · Admin desk", meta: "192.168.1.58 · ready" },
      ],
      bluetooth: [
        { name: "Zebra ZQ511", meta: "Paired nearby · strong signal" },
        { name: "Brother PT-P710BT", meta: "Paired nearby · moderate signal" },
      ],
      other: [
        { name: "Shared IT print queue", meta: "Floor 4 · network queue" },
        { name: "USB print station", meta: "Front desk · wired" },
      ],
    };
    function getConnectedPrinter() {
      try { return JSON.parse(localStorage.getItem("incuasset-printer") || "null"); } catch (e) { return null; }
    }
    function syncPrinterConnectUI() {
      const printer = getConnectedPrinter();
      const label = root.querySelector("#printer-connect-label");
      const printBtnText = root.querySelector("#qr-print-btn-text");
      if (label) label.textContent = printer ? `Connected · ${printer.name}` : "Printer: not connected · connect over Wi-Fi or Bluetooth";
      if (printBtnText) printBtnText.textContent = printer ? `Print via ${printer.name}` : "Print label";
    }
    function renderPrinterDevices(mode) {
      const list = root.querySelector("#printer-device-list");
      const status = root.querySelector(".printer-scan-status");
      const statusText = root.querySelector("#printer-scan-text");
      if (!list) return;
      list.innerHTML = "";
      if (status) status.classList.remove("is-done");
      const modeLabel = mode === "wifi" ? "Wi-Fi" : mode === "bluetooth" ? "Bluetooth" : "shared/USB";
      if (statusText) statusText.textContent = `Searching for ${modeLabel} printers…`;
      window.setTimeout(() => {
        if (status) status.classList.add("is-done");
        if (statusText) statusText.textContent = `${printerDevices[mode].length} ${modeLabel} printer${printerDevices[mode].length === 1 ? "" : "s"} found`;
        const icon = mode === "bluetooth" ? "bluetooth" : mode === "wifi" ? "wifi" : "printer";
        list.innerHTML = printerDevices[mode].map((d) => `<div class="printer-device-row"><i data-lucide="${icon}" aria-hidden="true"></i><span><strong>${d.name}</strong><small>${d.meta}</small></span><button class="secondary-button" data-connect-printer="${d.name.replace(/"/g, "&quot;")}" data-connect-mode="${mode}">Connect</button></div>`).join("");
        if (window.lucide) window.lucide.createIcons();
        list.querySelectorAll("[data-connect-printer]").forEach((btn) => btn.addEventListener("click", () => {
          const name = btn.dataset.connectPrinter;
          try { localStorage.setItem("incuasset-printer", JSON.stringify({ name, mode: btn.dataset.connectMode })); } catch (e) {}
          announce(`Connected to ${name}`);
          syncPrinterConnectUI();
          showScreen("qr-label");
        }));
      }, 900);
    }
    root.querySelectorAll(".printer-mode-tabs button").forEach((tab) => tab.addEventListener("click", () => {
      root.querySelectorAll(".printer-mode-tabs button").forEach((b) => { b.classList.toggle("is-selected", b === tab); b.setAttribute("aria-pressed", String(b === tab)); });
      renderPrinterDevices(tab.dataset.printerMode);
    }));
    root.querySelectorAll("[data-print-label]").forEach((button) => button.addEventListener("click", () => {
      const printer = getConnectedPrinter();
      if (printer) {
        button.classList.add("action-done");
        const original = button.querySelector("#qr-print-btn-text")?.textContent;
        announce(`Print command sent to ${printer.name}`);
        const label = button.querySelector("#qr-print-btn-text");
        if (label) { label.textContent = "Sent to printer ✓"; window.setTimeout(() => { label.textContent = original; button.classList.remove("action-done"); }, 1800); }
      } else {
        window.print();
      }
    }));
    const labelSizeSelect = root.querySelector("#label-size-select");
    const labelSizeCmd = root.querySelector("#label-size-cmd");
    if (labelSizeSelect && labelSizeCmd) {
      labelSizeSelect.addEventListener("change", () => {
        labelSizeCmd.textContent = labelSizeSelect.selectedOptions[0].dataset.cmd;
      });
    }
    const autoPrintToggle = root.querySelector("#auto-print-toggle");
    if (autoPrintToggle) {
      try { autoPrintToggle.checked = localStorage.getItem("incuasset-auto-print") === "1"; } catch (e) {}
      autoPrintToggle.addEventListener("change", () => {
        try { localStorage.setItem("incuasset-auto-print", autoPrintToggle.checked ? "1" : "0"); } catch (e) {}
      });
    }
    root.querySelectorAll(".switch-ui").forEach((button) => button.addEventListener("click", () => {
      button.classList.toggle("on");
      button.setAttribute("aria-pressed", String(button.classList.contains("on")));
    }));
    root.querySelectorAll(".segmented button").forEach((button) => button.addEventListener("click", () => {
      button.parentElement.querySelectorAll("button").forEach((choice) => {
        const active = choice === button;
        choice.classList.toggle("is-selected", active);
        choice.setAttribute("aria-pressed", String(active));
      });
    }));
    if (activeCentres[0]) {
      const defaultCentre = activeCentres[0];
      root.querySelectorAll(".selected-city,.selected-city-title").forEach((el) => { el.textContent = defaultCentre.city; });
      renderCityBuildings(defaultCentre.state, defaultCentre.city);
      chooseCentre(defaultCentre.name, defaultCentre);
      renderBuildingFloors(defaultCentre);
    }
    let currentMoveTarget = null;
    function updateMoveButton() {
      const checked = root.querySelectorAll("#move-asset-list input[type=checkbox]:checked").length;
      const moveActionBtn = root.querySelector('[data-action="move-assets"]');
      if (!moveActionBtn) return;
      moveActionBtn.disabled = checked === 0;
      root.querySelector("#move-count").textContent = checked;
      root.querySelector("#move-plural").textContent = checked === 1 ? "" : "s";
    }
    root.addEventListener("click", (event) => {
      const moveBtn = event.target.closest(".space-move-btn");
      if (!moveBtn) return;
      currentMoveTarget = moveBtn.dataset.spaceName;
      root.querySelector("#move-target-name").textContent = currentMoveTarget;
      root.querySelectorAll("#move-asset-list input[type=checkbox]").forEach((cb) => { cb.checked = false; });
      root.querySelectorAll(".move-asset-row").forEach((r) => r.classList.remove("is-moved"));
      updateMoveButton();
      showScreen("move-to-space");
    });
    root.addEventListener("change", (event) => {
      if (event.target.closest("#move-asset-list")) updateMoveButton();
    });
    root.addEventListener("click", (event) => {
      const toggleBtn = event.target.closest(".view-toggle button");
      if (!toggleBtn) return;
      const isBuilding = toggleBtn.textContent.trim() === "Building";
      root.querySelector("#building-view-wrap").hidden = !isBuilding;
      root.querySelector("#floor-list-view").hidden = isBuilding;
    });
  