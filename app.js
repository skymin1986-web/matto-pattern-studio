(() => {
  const NS = "http://www.w3.org/2000/svg";
  const CELL = 32;
  const STORAGE_KEY = "matto-pattern-studio-v1";
  const LAYOUT_KEY = "matto-pattern-layout-v1";
  const $ = (id) => document.getElementById(id);

  const symbols = {
    crochet: [
      { id: "chain", label: "사슬뜨기", icon: '<ellipse cx="20" cy="20" rx="12" ry="6" fill="none" stroke="currentColor" stroke-width="2.4"/>' },
      { id: "slip", label: "빼뜨기", icon: '<circle cx="20" cy="20" r="4" fill="currentColor"/>' },
      { id: "single", label: "짧은뜨기", icon: '<path d="M11 11L29 29M29 11L11 29" stroke="currentColor" stroke-width="2.4"/>' },
      { id: "half", label: "긴뜨기", icon: '<path d="M20 7V33M11 15H29" stroke="currentColor" stroke-width="2.4"/>' },
      { id: "double", label: "한길긴뜨기", icon: '<path d="M20 5V35M11 13H29M14 23L26 17" stroke="currentColor" stroke-width="2.2"/>' },
      { id: "treble", label: "두길긴뜨기", icon: '<path d="M20 4V36M11 12H29M14 21L26 15M14 29L26 23" stroke="currentColor" stroke-width="2.2"/>' },
      { id: "picot", label: "피코뜨기", icon: '<path d="M10 29Q20 8 30 29" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="20" cy="10" r="3" fill="none" stroke="currentColor" stroke-width="2"/>' },
      { id: "ring", label: "매직링", icon: '<circle cx="20" cy="20" r="12" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="20" cy="20" r="2" fill="currentColor"/>' },
      { id: "arrow", label: "진행방향", icon: '<path d="M7 20H31M24 12L32 20L24 28" fill="none" stroke="currentColor" stroke-width="2.3"/>' }
    ],
    knit: [
      { id: "knit", label: "겉뜨기", icon: '<rect x="8" y="8" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"/>' },
      { id: "purl", label: "안뜨기", icon: '<rect x="8" y="8" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="20" r="4" fill="currentColor"/>' },
      { id: "yarnOver", label: "걸러뜨기", icon: '<circle cx="20" cy="20" r="10" fill="none" stroke="currentColor" stroke-width="2.3"/>' },
      { id: "k2tog", label: "오른코줄임", icon: '<path d="M10 31L30 9M20 31L30 21" fill="none" stroke="currentColor" stroke-width="2.3"/>' },
      { id: "ssk", label: "왼코줄임", icon: '<path d="M30 31L10 9M20 31L10 21" fill="none" stroke="currentColor" stroke-width="2.3"/>' },
      { id: "cable", label: "꽈배기", icon: '<path d="M10 31C25 25 15 15 30 9M30 31C15 25 25 15 10 9" fill="none" stroke="currentColor" stroke-width="2.2"/>' },
      { id: "bobble", label: "방울뜨기", icon: '<circle cx="20" cy="20" r="8" fill="currentColor"/><circle cx="17" cy="17" r="2" fill="white" opacity=".6"/>' },
      { id: "noStitch", label: "코 없음", icon: '<rect x="8" y="8" width="24" height="24" fill="#ddd5cb" stroke="currentColor" stroke-width="1.5"/><path d="M10 30L30 10" stroke="currentColor" stroke-width="1.5"/>' },
      { id: "repeat", label: "반복표시", icon: '<path d="M12 7V33M28 7V33" stroke="currentColor" stroke-width="2.4"/><circle cx="8" cy="17" r="2" fill="currentColor"/><circle cx="32" cy="23" r="2" fill="currentColor"/>' }
    ]
  };

  const state = { tab: "crochet", tool: "select", selectedType: null, selectedId: null, items: [], cols: 40, rows: 25, zoom: 1, showGrid: true, snap: true, color: "#3b2e29", scale: 1, history: [], future: [], meta: {}, spacePan: false, circle: null };
  let drag = null;
  let pan = null;
  let tapCandidate = null;
  let pinch = null;
  let suppressTouchTap = false;
  const activeTouches = new Map();
  let saveTimer;

  function isMobileMode() { return document.body.dataset.uiMode === "mobile"; }
  function preferredLayout() { return localStorage.getItem(LAYOUT_KEY) || "auto"; }
  function resolveLayout(mode = preferredLayout()) {
    if (mode !== "auto") return mode;
    return window.matchMedia("(max-width: 820px), (pointer: coarse)").matches ? "mobile" : "desktop";
  }
  function closeSheets() {
    document.querySelectorAll(".mobile-sheet.open").forEach((el) => el.classList.remove("open"));
    $("sheetBackdrop").classList.remove("open");
    $("sheetBackdrop").setAttribute("aria-hidden", "true");
  }
  function applyLayout(mode = preferredLayout()) {
    $("layoutMode").value = mode;
    document.body.dataset.uiMode = resolveLayout(mode);
    closeSheets();
    requestAnimationFrame(fitCanvas);
  }
  function openSheet(name) {
    if (!isMobileMode()) return;
    closeSheets();
    $(`${name}Panel`).classList.add("open");
    $("sheetBackdrop").classList.add("open");
    $("sheetBackdrop").setAttribute("aria-hidden", "false");
  }

  function symbolDef(type) { return [...symbols.crochet, ...symbols.knit].find((s) => s.id === type); }
  function makeSvg(tag, attrs = {}) { const el = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k,v)); return el; }
  function uid() { return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`; }
  function snapshot() { return JSON.stringify({ items: state.items, cols: state.cols, rows: state.rows }); }
  function checkpoint() { state.history.push(snapshot()); if (state.history.length > 60) state.history.shift(); state.future = []; updateButtons(); }
  function restore(raw) { const data = JSON.parse(raw); state.items = data.items || []; state.cols = data.cols || 40; state.rows = data.rows || 25; syncControls(); render(); scheduleSave(); }
  function undo() { if (!state.history.length) return; state.future.push(snapshot()); restore(state.history.pop()); updateButtons(); }
  function redo() { if (!state.future.length) return; state.history.push(snapshot()); restore(state.future.pop()); updateButtons(); }
  function updateButtons() { const noUndo = !state.history.length, noRedo = !state.future.length; $("undoBtn").disabled = noUndo; $("redoBtn").disabled = noRedo; $("mobileUndoBtn").disabled = noUndo; $("mobileRedoBtn").disabled = noRedo; const noSelection = !state.selectedId; ["duplicateBtn","rotateBtn","deleteBtn"].forEach(id => $(id).disabled = noSelection); $("circleToolBtn").disabled = state.tab !== "crochet" || !state.selectedType; }

  function renderPalette() {
    const root = $("symbolPalette"); root.innerHTML = "";
    symbols[state.tab].forEach((symbol) => {
      const btn = document.createElement("button"); btn.className = `symbol-button${state.selectedType === symbol.id ? " selected" : ""}`;
      btn.innerHTML = `<svg viewBox="0 0 40 40" aria-hidden="true">${symbol.icon}</svg><small>${symbol.label}</small>`;
      btn.title = symbol.label;
      btn.addEventListener("click", () => { state.tool = "place"; state.selectedType = symbol.id; state.selectedId = null; renderPalette(); render(); if (isMobileMode()) closeSheets(); });
      root.appendChild(btn);
    });
  }

  function symbolGroup(item) {
    const def = symbolDef(item.type); const g = makeSvg("g", { "data-id": item.id, transform: `translate(${item.x} ${item.y}) rotate(${item.rotation || 0}) scale(${item.scale || 1})`, color: item.color, cursor: state.tool === "select" ? "grab" : "crosshair" });
    const wrapper = makeSvg("g", { transform: "translate(-20 -20)" }); wrapper.innerHTML = def.icon; g.appendChild(wrapper); return g;
  }

  function render() {
    const width = state.cols * CELL, height = state.rows * CELL;
    $("patternCanvas").setAttribute("viewBox", `0 0 ${width} ${height}`); $("patternCanvas").style.width = `${Math.max(520, width * .75 * state.zoom)}px`; $("patternCanvas").style.height = `${Math.max(320, height * .75 * state.zoom)}px`;
    ["paper","gridLayer"].forEach(id => { $(id).setAttribute("width", width); $(id).setAttribute("height", height); });
    $("gridLayer").style.display = state.showGrid ? "block" : "none";
    const layer = $("symbolsLayer"); layer.innerHTML = ""; state.items.forEach(item => layer.appendChild(symbolGroup(item)));
    const selection = $("selectionLayer"); selection.innerHTML = "";
    const selected = state.items.find(i => i.id === state.selectedId);
    if (selected) { const size = 34 * (selected.scale || 1); selection.appendChild(makeSvg("rect", { class:"symbol-selection", x:selected.x-size/2, y:selected.y-size/2, width:size, height:size, rx:4, fill:"none", stroke:"#a6534d", "stroke-width":2, "stroke-dasharray":"5 3" })); }
    $("symbolCount").textContent = `기호 ${state.items.length}개`; $("canvasSizeLabel").textContent = `${state.cols} × ${state.rows}칸`; $("zoomValue").textContent = `${Math.round(state.zoom*100)}%`;
    $("selectToolBtn").classList.toggle("active-tool", state.tool === "select"); $("panToolBtn").classList.toggle("active-tool", state.tool === "pan"); $("circleToolBtn").classList.toggle("active-tool", state.tool === "circle");
    $("mobileSelectBtn").classList.toggle("active-tool", state.tool === "select"); $("mobilePanBtn").classList.toggle("active-tool", state.tool === "pan");
    $("canvasViewport").classList.toggle("pan-mode", state.tool === "pan" || state.spacePan); $("canvasViewport").classList.toggle("circle-mode", state.tool === "circle"); $("toolHint").textContent = state.tool === "pan" ? "✋ 끌어서 화면 이동" : state.tool === "circle" ? "◯ 원의 중심점을 눌러 배치" : state.tool === "place" ? "＋ 격자를 눌러 기호 배치" : "↖ 기호 선택·이동"; updateButtons();
  }

  function setZoom(next, anchor = null) {
    const viewport = $("canvasViewport"); const oldZoom = state.zoom; const beforeX = anchor ? viewport.scrollLeft + anchor.x : 0; const beforeY = anchor ? viewport.scrollTop + anchor.y : 0;
    state.zoom = Math.max(.35, Math.min(2.2, next)); render();
    if (anchor) { const ratio = state.zoom / oldZoom; viewport.scrollLeft = beforeX * ratio - anchor.x; viewport.scrollTop = beforeY * ratio - anchor.y; }
  }
  function fitCanvas() {
    const viewport = $("canvasViewport"); const baseWidth = state.cols * CELL * .75; const baseHeight = state.rows * CELL * .75;
    const next = Math.min((viewport.clientWidth - 76) / baseWidth, (viewport.clientHeight - 76) / baseHeight, 1.35);
    setZoom(next); requestAnimationFrame(() => { viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2); viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2); });
  }

  function svgPoint(evt) { const svg = $("patternCanvas"), p = svg.createSVGPoint(); p.x = evt.clientX; p.y = evt.clientY; const out = p.matrixTransform(svg.getScreenCTM().inverse()); const snap = (n) => state.snap ? Math.round(n/CELL)*CELL : n; return { x: Math.max(0, Math.min(state.cols*CELL, snap(out.x))), y: Math.max(0, Math.min(state.rows*CELL, snap(out.y))) }; }
  function itemFromTarget(target) { const group = target.closest?.("[data-id]"); return group ? state.items.find(i => i.id === group.dataset.id) : null; }
  function addItem(point) { checkpoint(); const item = { id:uid(), type:state.selectedType, x:point.x, y:point.y, rotation:0, color:state.color, scale:state.scale }; state.items.push(item); state.selectedId = item.id; render(); scheduleSave(); }
  function addCircle(center) {
    if (!state.circle || !state.selectedType) return;
    checkpoint();
    const { count, radiusCells, startAngle, rotateAlongCircle } = state.circle;
    const radius = radiusCells * CELL;
    const maxX = state.cols * CELL, maxY = state.rows * CELL;
    const created = [];
    for (let index = 0; index < count; index += 1) {
      const angle = startAngle + (360 / count) * index;
      const radians = angle * Math.PI / 180;
      const x = center.x + Math.cos(radians) * radius;
      const y = center.y + Math.sin(radians) * radius;
      if (x < 0 || x > maxX || y < 0 || y > maxY) continue;
      created.push({ id:uid(), type:state.selectedType, x, y, rotation:rotateAlongCircle ? angle + 90 : 0, color:state.color, scale:state.scale });
    }
    state.items.push(...created); state.selectedId = null; state.tool = "select"; state.circle = null; render(); scheduleSave();
    toast(created.length === count ? `${count}개 기호를 원형으로 배치했습니다` : `도안 밖을 제외하고 ${created.length}개를 배치했습니다`);
  }
  function deleteSelected() { if (!state.selectedId) return; checkpoint(); state.items = state.items.filter(i => i.id !== state.selectedId); state.selectedId = null; render(); scheduleSave(); }
  function duplicateSelected() { const original = state.items.find(i => i.id === state.selectedId); if (!original) return; checkpoint(); const copy = {...original, id:uid(), x:Math.min(original.x+CELL,state.cols*CELL), y:Math.min(original.y+CELL,state.rows*CELL)}; state.items.push(copy); state.selectedId=copy.id; render(); scheduleSave(); }
  function rotateSelected() { const item=state.items.find(i=>i.id===state.selectedId); if(!item)return; checkpoint(); item.rotation=(item.rotation+45)%360; render(); scheduleSave(); }

  function collectData() { return { version:1, title:$("projectTitle").value, meta:{ name:$("metaName").value, yarn:$("metaYarn").value, needle:$("metaNeedle").value, gauge:$("metaGauge").value, notes:$("metaNotes").value }, grid:{ cols:state.cols, rows:state.rows, show:state.showGrid, snap:state.snap }, items:state.items, savedAt:new Date().toISOString() }; }
  function applyData(data) { state.items = Array.isArray(data.items) ? data.items : []; state.cols = data.grid?.cols || 40; state.rows = data.grid?.rows || 25; state.showGrid = data.grid?.show !== false; state.snap = data.grid?.snap !== false; $("projectTitle").value=data.title||"나의 도안"; const m=data.meta||{}; $("metaName").value=m.name||""; $("metaYarn").value=m.yarn||""; $("metaNeedle").value=m.needle||""; $("metaGauge").value=m.gauge||""; $("metaNotes").value=m.notes||""; state.selectedId=null; state.history=[]; state.future=[]; syncControls(); render(); }
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(collectData())); $("saveStatus").textContent=`저장됨 · ${new Date().toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})}`; }
  function scheduleSave() { clearTimeout(saveTimer); $("saveStatus").textContent="변경사항 저장 중…"; saveTimer=setTimeout(save,450); }
  function download(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
  function safeName(){return (($("projectTitle").value||"matto-pattern").trim().replace(/[^0-9a-zA-Z가-힣_-]+/g,"-")||"matto-pattern")}
  function exportJson(){download(new Blob([JSON.stringify(collectData(),null,2)],{type:"application/json"}),`${safeName()}.json`);toast("JSON 백업을 저장했습니다")}
  function exportSvgSource(){
    state.selectedId=null; render();
    const svg=$("patternCanvas").cloneNode(true);
    ["paper","gridLayer","selectionLayer"].forEach(id=>svg.querySelector(`#${id}`)?.remove());
    svg.querySelectorAll("[cursor]").forEach(el=>el.removeAttribute("cursor"));
    svg.setAttribute("xmlns",NS); svg.setAttribute("width",state.cols*CELL); svg.setAttribute("height",state.rows*CELL);
    const symbols=svg.querySelector("#symbolsLayer");
    if(symbols){symbols.setAttribute("aria-label","matto knitting symbols");symbols.querySelectorAll(":scope > g").forEach((group,index)=>group.setAttribute("id",`symbol-${index+1}`))}
    return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`;
  }
  function exportSvg(){download(new Blob([exportSvgSource()],{type:"image/svg+xml;charset=utf-8"}),`${safeName()}.svg`);toast("Illustrator용 SVG 벡터를 저장했습니다")}
  function exportPng(){ const source=exportSvgSource(); const img=new Image(); img.onload=()=>{const canvas=document.createElement("canvas");canvas.width=state.cols*CELL*2;canvas.height=state.rows*CELL*2;const ctx=canvas.getContext("2d");ctx.scale(2,2);ctx.drawImage(img,0,0);canvas.toBlob(blob=>download(blob,`${safeName()}.png`),"image/png")};img.src=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;toast("격자 없이 PNG를 만드는 중입니다")}
  function toast(msg){const el=$("toast");el.textContent=msg;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),1800)}
  function syncControls(){ $("gridCols").value=state.cols; $("gridRows").value=state.rows; $("showGrid").checked=state.showGrid; $("snapGrid").checked=state.snap; }

  $("patternCanvas").addEventListener("pointerdown", (evt) => {
    if(state.tool === "pan" || state.spacePan || evt.button === 1) return;
    const item=itemFromTarget(evt.target), point=svgPoint(evt);
    if (isMobileMode() && evt.pointerType === "touch" && (state.tool === "circle" || (state.tool === "place" && state.selectedType))) {
      tapCandidate = { pointerId:evt.pointerId, startX:evt.clientX, startY:evt.clientY, point, action:state.tool };
      $("patternCanvas").setPointerCapture(evt.pointerId); return;
    }
    if(state.tool==="circle"){addCircle(point);return}
    if(state.tool==="place"&&state.selectedType){addItem(point);return}
    if(item){state.selectedId=item.id;drag={id:item.id,start:point,ox:item.x,oy:item.y,pointerId:evt.pointerId};$("patternCanvas").setPointerCapture(evt.pointerId)}else state.selectedId=null;render();
  });
  $("patternCanvas").addEventListener("pointermove", (evt)=>{
    if(tapCandidate?.pointerId===evt.pointerId && Math.hypot(evt.clientX-tapCandidate.startX,evt.clientY-tapCandidate.startY)>8) tapCandidate=null;
    if(!drag || drag.pointerId!==evt.pointerId || suppressTouchTap)return;
    const item=state.items.find(i=>i.id===drag.id),p=svgPoint(evt);item.x=Math.max(0,Math.min(state.cols*CELL,drag.ox+p.x-drag.start.x));item.y=Math.max(0,Math.min(state.rows*CELL,drag.oy+p.y-drag.start.y));render()
  });
  function endCanvasPointer(evt){
    if(tapCandidate?.pointerId===evt.pointerId){const candidate=tapCandidate;tapCandidate=null;if(!suppressTouchTap){candidate.action==="circle"?addCircle(candidate.point):addItem(candidate.point)}}
    if(drag?.pointerId===evt.pointerId){if(!suppressTouchTap){state.history.push(JSON.stringify({items:state.items.map(i=>i.id===drag.id?{...i,x:drag.ox,y:drag.oy}:i),cols:state.cols,rows:state.rows}));state.future=[];scheduleSave();updateButtons()}drag=null}
  }
  $("patternCanvas").addEventListener("pointerup",endCanvasPointer); $("patternCanvas").addEventListener("pointercancel",endCanvasPointer);

  $("canvasViewport").addEventListener("pointerdown", (evt) => {
    if(isMobileMode() && evt.pointerType==="touch"){
      activeTouches.set(evt.pointerId,{x:evt.clientX,y:evt.clientY});
      if(activeTouches.size===2){
        evt.preventDefault(); evt.stopPropagation(); suppressTouchTap=true; tapCandidate=null;
        if(drag){const item=state.items.find(i=>i.id===drag.id);if(item){item.x=drag.ox;item.y=drag.oy}drag=null;render()} pan=null; $("canvasViewport").classList.remove("panning");
        const [a,b]=[...activeTouches.values()]; pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),midX:(a.x+b.x)/2,midY:(a.y+b.y)/2}; return;
      }
    }
    if (!(state.tool === "pan" || state.spacePan || evt.button === 1)) return;
    evt.preventDefault(); const viewport = $("canvasViewport"); pan = { pointerId:evt.pointerId, x:evt.clientX, y:evt.clientY, left:viewport.scrollLeft, top:viewport.scrollTop };
    viewport.classList.add("panning"); viewport.setPointerCapture(evt.pointerId);
  }, true);
  $("canvasViewport").addEventListener("pointermove", (evt) => {
    if(activeTouches.has(evt.pointerId)) activeTouches.set(evt.pointerId,{x:evt.clientX,y:evt.clientY});
    if(pinch && activeTouches.size>=2){
      evt.preventDefault(); evt.stopPropagation(); const viewport=$("canvasViewport"),rect=viewport.getBoundingClientRect(); const [a,b]=[...activeTouches.values()];
      const distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),midX=(a.x+b.x)/2,midY=(a.y+b.y)/2;
      const target=state.zoom*(distance/pinch.distance); setZoom(target,{x:midX-rect.left,y:midY-rect.top});
      viewport.scrollLeft-=midX-pinch.midX; viewport.scrollTop-=midY-pinch.midY; pinch={distance,midX,midY}; return;
    }
    if(!pan || pan.pointerId !== evt.pointerId) return; const viewport=$("canvasViewport"); viewport.scrollLeft=pan.left-(evt.clientX-pan.x); viewport.scrollTop=pan.top-(evt.clientY-pan.y);
  },true);
  function endPan(evt){ if(!pan || (evt.pointerId !== undefined && pan.pointerId !== evt.pointerId)) return; pan=null; $("canvasViewport").classList.remove("panning"); }
  function endViewportPointer(evt){
    if(activeTouches.has(evt.pointerId))activeTouches.delete(evt.pointerId); if(activeTouches.size<2)pinch=null; if(activeTouches.size===0)setTimeout(()=>{suppressTouchTap=false},0); endPan(evt);
  }
  $("canvasViewport").addEventListener("pointerup", endViewportPointer,true); $("canvasViewport").addEventListener("pointercancel", endViewportPointer,true);
  $("canvasViewport").addEventListener("wheel", (evt) => { if(!(evt.ctrlKey || evt.metaKey)) return; evt.preventDefault(); const rect=$("canvasViewport").getBoundingClientRect(); setZoom(state.zoom + (evt.deltaY < 0 ? .1 : -.1), {x:evt.clientX-rect.left,y:evt.clientY-rect.top}); }, {passive:false});

  document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{state.tab=btn.dataset.tab;document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b===btn));renderPalette()}));
  $("selectToolBtn").addEventListener("click",()=>{state.tool="select";state.selectedType=null;renderPalette();render()});
  $("panToolBtn").addEventListener("click",()=>{state.tool="pan";state.selectedType=null;state.selectedId=null;renderPalette();render()});
  $("mobileSelectBtn").addEventListener("click",()=>$("selectToolBtn").click());
  $("mobilePanBtn").addEventListener("click",()=>$("panToolBtn").click());
  $("mobileUndoBtn").addEventListener("click",undo); $("mobileRedoBtn").addEventListener("click",redo);
  document.querySelectorAll("[data-open-sheet]").forEach(btn=>btn.addEventListener("click",()=>openSheet(btn.dataset.openSheet)));
  document.querySelectorAll("[data-close-sheet]").forEach(btn=>btn.addEventListener("click",closeSheets));
  $("sheetBackdrop").addEventListener("click",closeSheets);
  $("layoutMode").addEventListener("change",e=>{localStorage.setItem(LAYOUT_KEY,e.target.value);applyLayout(e.target.value)});
  $("circleToolBtn").addEventListener("click",()=>{const def=symbolDef(state.selectedType);if(!def||state.tab!=="crochet")return;$("circleSymbolLabel").textContent=def.label;$("circleDialog").showModal()});
  $("circleForm").addEventListener("submit",e=>{e.preventDefault();const count=Math.max(2,Math.min(60,Number($("circleCount").value)||8));const radiusCells=Math.max(1,Math.min(20,Number($("circleRadius").value)||3));const startAngle=Math.max(-360,Math.min(360,Number($("circleAngle").value)||-90));state.circle={count,radiusCells,startAngle,rotateAlongCircle:$("circleRotate").checked};state.tool="circle";state.selectedId=null;$("circleDialog").close();render();toast("도안에서 원의 중심점을 눌러주세요")});
  ["circleCancelBtn","circleCancelX"].forEach(id=>$(id).addEventListener("click",()=>$("circleDialog").close()));
  $("symbolColor").addEventListener("input",e=>{state.color=e.target.value;const item=state.items.find(i=>i.id===state.selectedId);if(item){checkpoint();item.color=state.color;render();scheduleSave()}});
  $("symbolScale").addEventListener("input",e=>{state.scale=Number(e.target.value)/100;const item=state.items.find(i=>i.id===state.selectedId);if(item){item.scale=state.scale;render();scheduleSave()}});
  $("undoBtn").onclick=undo; $("redoBtn").onclick=redo; $("deleteBtn").onclick=deleteSelected; $("duplicateBtn").onclick=duplicateSelected; $("rotateBtn").onclick=rotateSelected;
  $("zoomInBtn").onclick=()=>setZoom(state.zoom+.1); $("zoomOutBtn").onclick=()=>setZoom(state.zoom-.1); $("fitBtn").onclick=fitCanvas;
  $("gridCols").addEventListener("change",e=>{checkpoint();state.cols=Math.max(10,Math.min(80,Number(e.target.value)||40));render();scheduleSave()});
  $("gridRows").addEventListener("change",e=>{checkpoint();state.rows=Math.max(10,Math.min(60,Number(e.target.value)||25));render();scheduleSave()});
  $("showGrid").addEventListener("change",e=>{state.showGrid=e.target.checked;render();scheduleSave()}); $("snapGrid").addEventListener("change",e=>{state.snap=e.target.checked;scheduleSave()});
  ["projectTitle","metaName","metaYarn","metaNeedle","metaGauge","metaNotes"].forEach(id=>$(id).addEventListener("input",scheduleSave));
  $("saveBtn").onclick=()=>{save();toast("현재 도안을 저장했습니다")}; $("exportJsonBtn").onclick=exportJson; $("exportSvgBtn").onclick=exportSvg; $("exportPngBtn").onclick=exportPng; $("printBtn").onclick=()=>{state.selectedId=null;render();window.print()};
  $("importJsonInput").addEventListener("change",async e=>{try{const data=JSON.parse(await e.target.files[0].text());applyData(data);save();toast("도안을 불러왔습니다")}catch{toast("올바른 도안 파일이 아닙니다")}e.target.value=""});
  $("newBtn").onclick=()=>{if(!confirm("현재 도안을 지우고 새 도안을 만들까요? JSON 백업을 권장합니다."))return;checkpoint();state.items=[];state.selectedId=null;$("projectTitle").value="새 도안";render();save();toast("새 도안을 시작합니다")};
  document.addEventListener("keydown",e=>{if(["INPUT","TEXTAREA"].includes(document.activeElement.tagName))return;if(e.code==="Space"){e.preventDefault();if(!state.spacePan){state.spacePan=true;render()}return}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="z"){e.preventDefault();e.shiftKey?redo():undo()}else if(e.key==="Delete"||e.key==="Backspace")deleteSelected();else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="d"){e.preventDefault();duplicateSelected()}else if(e.key==="Escape"){$("selectToolBtn").click()}else if(e.key==="0")fitCanvas()});
  document.addEventListener("keyup",e=>{if(e.code==="Space"&&state.spacePan){state.spacePan=false;endPan({});render()}}); window.addEventListener("blur",()=>{state.spacePan=false;endPan({});render()});

  const autoLayoutQuery=window.matchMedia("(max-width: 820px), (pointer: coarse)"); autoLayoutQuery.addEventListener?.("change",()=>{if(preferredLayout()==="auto")applyLayout("auto")});
  applyLayout(preferredLayout());
  const saved=localStorage.getItem(STORAGE_KEY); if(saved){try{applyData(JSON.parse(saved))}catch{render()}}else render(); renderPalette(); updateButtons(); requestAnimationFrame(fitCanvas);
})();
