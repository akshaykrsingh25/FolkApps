    const root = document.getElementById("asset-register-prototype");
    // A local SVG icon set keeps the interface complete without a network dependency.
    const iconMarkup = {
      'arrow-left':'<path d="M19 12H5M12 19l-7-7 7-7"/>','arrow-right':'<path d="M5 12h14m-7-7 7 7-7 7"/>','arrow-down':'<path d="M12 5v14m7-7-7 7-7-7"/>','arrow-up-right':'<path d="M7 17 17 7M7 7h10v10"/>','chevron-down':'<path d="m6 9 6 6 6-6"/>','chevron-right':'<path d="m9 18 6-6-6-6"/>','plus':'<path d="M12 5v14M5 12h14"/>','check':'<path d="m5 12 4 4L19 6"/>','circle-check':'<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>','check-circle-2':'<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>','search':'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>','camera':'<path d="M14 5h-4L8 8H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>','map-pin':'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>','map-pin-off':'<path d="m3 3 18 18M10 10a2 2 0 0 0 3 2m5-2c0 2-1.5 4.2-3.2 6.3M9 18.5C6.5 15.8 4 12.8 4 10a8 8 0 0 1 13.7-5.7"/>','map':'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15"/>','house':'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1z"/>','boxes':'<path d="m12 3 8 4-8 4-8-4zM4 7v9l8 5 8-5V7M12 11v10"/>','package-open':'<path d="m12 3 8 4-8 4-8-4zM4 7v9l8 5 8-5V7m-8 4v10m-4-9 8-4"/>','building':'<path d="M4 21V5l8-3 8 3v16M2 21h20M8 7h1m6 0h1M8 11h1m6 0h1M8 15h1m6 0h1M10 21v-3h4v3"/>','building-2':'<path d="M3 21h18M5 21V4h9v17m0-10h5v10M8 7h3m-3 4h3m-3 4h3m6-1h2m-2 4h2"/>','bell':'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4"/>','bell-ring':'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4M2 8l2 1m18-1-2 1M5 3l2 2m10-2-2 2"/>','qr-code':'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zm5 0h2m-7 5h3m2-2v4"/>','barcode':'<path d="M3 5v14m3-14v14m3-14v14m4-14v14m3-14v14m3-14v14m2-14v14"/>','scan-line':'<path d="M4 7V5a1 1 0 0 1 1-1h2m10 0h2a1 1 0 0 1 1 1v2M4 17v2a1 1 0 0 0 1 1h2m10 0h2a1 1 0 0 0 1-1v-2M3 12h18"/>','scan-search':'<path d="M4 7V5a1 1 0 0 1 1-1h2m10 0h2a1 1 0 0 1 1 1v2M4 17v2a1 1 0 0 0 1 1h2m10 0h2a1 1 0 0 0 1-1v-2"/><circle cx="11" cy="11" r="3"/><path d="m20 20-3-3"/>','clipboard-check':'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6V7H9zM8 13l2.5 2.5L16 10"/>','clipboard-list':'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6V7H9zM9 11h6m-6 4h6m-6 4h3"/>','clipboard-plus':'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6V7H9zm3 6v6m-3-3h6"/>','calendar-check':'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m-13 5 2 2 4-4"/>','calendar-check-2':'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m-13 5 2 2 4-4"/>','calendar-clock':'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><circle cx="15" cy="15" r="3"/><path d="M15 13v2l1 1"/>','calendar-plus':'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m9 4v6m-3-3h6"/>','clock-3':'<circle cx="12" cy="12" r="9"/><path d="M12 7v5h5"/>','cloud-check':'<path d="M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 20 11a4 4 0 0 1-1 7h-3m-8-3 2 2 4-4"/>','shield-check':'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>','shield-alert':'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="M12 8v5m0 3h.01"/>','wrench':'<path d="M14.7 6.3a5 5 0 0 0-6.4 6.4L3 18l3 3 5.3-5.3a5 5 0 0 0 6.4-6.4L15 12l-3-3z"/>','triangle-alert':'<path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/>','ban':'<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>','image-off':'<path d="m2 2 20 20M10.6 10.6a2 2 0 0 0 2.8 2.8M9 4h10a2 2 0 0 1 2 2v10M5 5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11"/>','users':'<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-7.5a4 4 0 0 1 0 7.7M20 21v-2a4 4 0 0 0-3-3.9"/>','users-round':'<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-7.5a4 4 0 0 1 0 7.7M20 21v-2a4 4 0 0 0-3-3.9"/>','user-plus':'<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm9-3v6m-3-3h6"/>','sparkles':'<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm7 12 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>','file-text':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6m-12 4h8m-8 4h8m-8 4h5"/>','file-check-2':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6m-12 5 2 2 4-4"/>','printer':'<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2m-12-4h12v8H6z"/>','settings-2':'<path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M2 14h4m4-6h4m4 8h4"/>','history':'<path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 2"/>','key-round':'<circle cx="8" cy="15" r="5"/><path d="m21 2-9 9m5-5 3 3m-6-1 3 3"/>','lock-keyhole':'<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V6a4 4 0 1 1 8 0v4m-4 5v3"/>','locate-fixed':'<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/><circle cx="12" cy="12" r="8"/>','move-right':'<path d="M5 12h14m-7-7 7 7-7 7"/>','inside-outside':'<path d="M4 4h16v16H4zM8 8v8h8V8z"/>','layers-2':'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5"/>','layers-3':'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5"/>','store':'<path d="M3 10V5l2-3h14l2 3v5M5 10v11h14V10M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 21v-6h6v6"/>','copy-check':'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3m2-2 2 2 4-4"/>','armchair':'<path d="M5 12V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4m-16 0h18v6H3zm3 6v3m12-3v3"/>','badge-check':'<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>','circle-help':'<circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 1 1 4.3 1.8c-1.2 1-1.9 1.4-1.9 3m0 3h.01"/>','info':'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>','images':'<rect x="3" y="3" width="14" height="14" rx="2"/><path d="m7 13 3-3 3 3 2-2 5 5M8 21h11a2 2 0 0 0 2-2V8"/>','zap':'<path d="m13 2-3 8h7l-6 12 2-9H6z"/>','send':'<path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/>','list-filter':'<path d="M4 6h16M7 12h10m-7 6h4"/>','git-branch':'<path d="M6 3v12m0-8h7a4 4 0 0 1 4 4v1m0 3v6M6 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm11 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/>','switch-camera':'<path d="m16 3 4 4-4 4M20 7H9a6 6 0 0 0-6 6m4 8-4-4 4-4m-4 4h11a6 6 0 0 0 6-6"/>'
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
      if (name === "scanner") {
        const camera = root.querySelector(".camera-view");
        camera.classList.add("is-scanning");
        window.setTimeout(() => camera.classList.remove("is-scanning"), 1150);
      }
    }
    picker.addEventListener("change", () => showScreen(picker.value));
    renderCentreDirectory();
    renderStateList();
    loadIndiaBoundaries();
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
    function googleMapUrl(c){return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.name}, ${c.city}, ${c.state}, India}`)}`;}
    root.querySelector("#centre-count").textContent=activeCentres.length;
    function renderCentreDirectory(query=""){
      const target=root.querySelector("#centre-directory-list"); if(!target)return;
      const q=query.trim().toLowerCase(); const items=activeCentres.filter(c=>`${c.code} ${c.name} ${c.city} ${c.state}`.toLowerCase().includes(q));
      target.innerHTML=items.map(c=>`<button class="centre-directory-item" data-centre-id="${c.id}" data-go="map-centre"><span class="centre-directory-code">${c.code||"—"}</span><span class="centre-directory-copy"><strong>${c.name}</strong><small>${c.city}, ${c.state} · ${c.code||"Code not listed"}</small></span><span class="pin-status ${c.pinConfirmed?"confirmed":"pending"}">${c.locationConflict?"City mismatch":c.pinSeeded?"Seed pin · verify":"Pin needed"}</span><i data-lucide="chevron-right"></i></button>`).join("")||'<p class="quiet-note">No centres match your search.</p>';
      root.querySelector("#directory-total").textContent=items.length; root.querySelector("#directory-city-count").textContent=new Set(items.map(c=>c.city)).size; if(window.lucide)window.lucide.createIcons();
      target.querySelectorAll("[data-centre-id]").forEach(b=>b.addEventListener("click",()=>{const c=activeCentres.find(x=>x.id===b.dataset.centreId);if(c){chooseCentre(c.name,c);showScreen("map-centre");}}));
    }
    function renderStateList(){const target=root.querySelector("#india-state-list");if(!target)return;target.innerHTML=stateNames.map(state=>{const n=activeCentres.filter(c=>c.state===state).length;return `<button data-go="map-state" data-state="${state}"><span class="state-bullet green"></span><strong>${state}</strong><small>${n} centres</small><i data-lucide="chevron-right"></i></button>`}).join("");if(window.lucide)window.lucide.createIcons();}
    function renderStateCentres(state){const list=root.querySelector("#state-centre-list");if(!list)return;const items=activeCentres.filter(c=>c.state===state);root.querySelector("#state-centre-heading").textContent=`${items.length} centres`;
      list.innerHTML=items.map((c,i)=>`<button class="centre-card" data-centre-id="${c.id}" data-go="map-centre"><span class="centre-index">${String(i+1).padStart(2,"0")}</span><span><strong>${c.name}</strong><small>${c.code||"No code in source list"} · ${c.city}</small><em>${c.locationConflict?"Source mismatch · centre name says Gurgaon; city cell says Pune":c.pinSeeded?"DPR seed coordinates · verify building entrance":"City-level map pin · centre head to confirm building"}</em></span><i data-lucide="chevron-right"></i></button>`).join("");if(window.lucide)window.lucide.createIcons();
      list.querySelectorAll("[data-centre-id]").forEach(b=>b.addEventListener("click",()=>{const c=activeCentres.find(x=>x.id===b.dataset.centreId);if(c){chooseCentre(c.name,c);showScreen("map-centre");}}));
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
        pins.innerHTML=Object.entries(agg).map(([city,count])=>{const [lat,lon]=cityCoords[city], [x,y]=project([lon,lat]);return `<g class="city-pin" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" data-city="${city}" role="button" tabindex="0"><circle r="3.5"/><circle class="pin-pulse" r="7"/><text x="5" y="-5">${city} · ${count}</text></g>`}).join("");
        pins.querySelectorAll(".city-pin").forEach(pin=>{const c=activeCentres.find(x=>x.city===pin.dataset.city);const go=()=>{if(c){chooseState(c.state);showScreen("map-state");}};pin.addEventListener("click",go);pin.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();go();}})});
        renderStateList();
      } catch(e) { target.innerHTML='<text x="28" y="128" fill="#536277" font-size="11">Map needs an internet connection.</text>'; }
    }
    const stateData = Object.fromEntries(stateNames.map(state=>[state,{centers:activeCentres.filter(c=>c.state===state)}]));
    let selectedCentre=activeCentres[0];
    function chooseCentre(name, centre) {
      selectedCentre=centre||activeCentres.find(c=>c.name===name)||selectedCentre;
      if(selectedCentre){root.querySelectorAll("[data-centre-field]").forEach(input=>{const f=input.dataset.centreField;input.value=f==="code"?(selectedCentre.code||""):f==="name"?selectedCentre.name:f==="city"?`${selectedCentre.city}, ${selectedCentre.state}`:input.value;});}
      root.querySelector(".selected-centre-title").textContent = name;
      root.querySelector(".selected-centre").textContent = name.toUpperCase();
      const query=centre?googleMapUrl(centre):"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(name);
      root.querySelectorAll(".map-search-link").forEach(a=>a.href=query);
      const sub=root.querySelector("[data-screen=map-centre] .subhead");if(sub&&centre)sub.textContent=`${centre.code||"No centre code listed"} · ${centre.city}, ${centre.state} · ${centre.pinSeeded?"DPR seed location; confirm building entrance":"city level only; confirm exact building pin"}`;
    }
    function chooseState(name) {
      const data=stateData[name]; if(!data)return;
      root.querySelector(".selected-state-title").textContent=name;root.querySelector(".selected-state").textContent=name.toUpperCase();renderStateCentres(name);
      const group=root.querySelector(`#india-state-boundaries .india-state[data-state="${CSS.escape(name)}"]`);const shape=root.querySelector("#selected-state-shape");
      if(group&&shape){shape.innerHTML=group.innerHTML;const box=group.getBBox();shape.setAttribute("viewBox",`${box.x-4} ${box.y-4} ${box.width+8} ${box.height+8}`);}
    }
    root.querySelector("#centre-search")?.addEventListener("input",e=>renderCentreDirectory(e.target.value));
    root.querySelectorAll("[data-action]").forEach(button=>button.addEventListener("click",()=>{const action=button.dataset.action;if(action==="add-floor"||action==="add-area"){button.textContent=action==="add-floor"?"Floor added":"Area added";button.classList.add("action-done");}else if(action==="save-centre"){button.innerHTML='Centre details saved <i data-lucide="check"></i>';button.classList.add("action-done");if(window.lucide)window.lucide.createIcons();announce("Report filed. Centre Head notified; State Head and Head Office can track it.");}}));
    root.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => {
      if (button.dataset.state) chooseState(button.dataset.state);
      if (button.classList.contains("centre-card")) chooseCentre(button.querySelector("strong").textContent);
      showScreen(button.dataset.go);
    }));
    function announce(message){let toast=root.querySelector(".prototype-toast");if(!toast){toast=document.createElement("div");toast.className="prototype-toast";toast.setAttribute("role","status");toast.setAttribute("aria-live","polite");root.querySelector(".prototype-phone").appendChild(toast);}toast.textContent=message;toast.classList.add("show");window.clearTimeout(toast._timer);toast._timer=window.setTimeout(()=>toast.classList.remove("show"),3200);}
    root.querySelectorAll(".report-type").forEach(button=>button.addEventListener("click",()=>{root.querySelectorAll(".report-type").forEach(b=>b.classList.toggle("is-selected",b===button));}));
    root.querySelectorAll("[data-report-filter]").forEach(button=>button.addEventListener("click",()=>{root.querySelectorAll("[data-report-filter]").forEach(b=>b.classList.toggle("active",b===button));}));
    root.querySelectorAll("[data-action]").forEach(button=>button.addEventListener("click",()=>{const action=button.dataset.action;if(action==="add-new-centre"){root.querySelectorAll("[data-centre-field]").forEach(input=>input.value="");root.querySelector('[data-centre-field="code"]').focus();showScreen("centre-manager");}else if(action==="mark-not-seen"){button.textContent="Not seen · Centre Head notified";button.classList.add("action-done");announce("Centre Head and asset custodian notified. If still unconfirmed when the 2-month window closes, it escalates to the State Head and Head Office.");}else if(action==="notify-missing"){button.textContent="Owners and state heads notified";button.classList.add("action-done");announce("Centre owners and State Heads notified. Head Office can track every unresolved asset.");}else if(action==="attach-photo"){button.innerHTML='Photo attached · add another <i data-lucide="check"></i>';button.classList.add("action-done");if(window.lucide)window.lucide.createIcons();announce("Evidence attached to the asset report.");}else if(action==="submit-report"){root.querySelector("#reports-open-count").textContent="19";button.innerHTML='Report submitted · owners notified <i data-lucide="check"></i>';button.classList.add("action-done");if(window.lucide)window.lucide.createIcons();announce("Report filed. Centre Head notified; State Head and Head Office can track it.");}}));
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
    }));
    const shutter = root.querySelector(".capture-shutter");
    shutter.addEventListener("click", () => {
      shutter.classList.add("is-captured");
      const photoMode = [...root.querySelectorAll(".capture-mode")].some((mode) => mode.classList.contains("active") && mode.textContent.trim() === "Photo");
      announce(photoMode ? "Photo captured · reviewing smart match" : "Code captured · opening the matching asset");
      window.setTimeout(() => { shutter.classList.remove("is-captured"); showScreen(photoMode ? "camera-match" : "asset-detail"); }, 260);
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
    root.querySelectorAll("[data-print-label]").forEach((button) => button.addEventListener("click", () => window.print()));
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
  