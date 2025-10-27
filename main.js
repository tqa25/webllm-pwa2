// @version v1.2.1 (2025-10-27): Sessions + Diary on top of v1.1.1, sticky composer welcome, Stop button robust abort + soft-cancel
import * as webllm from "https://esm.run/@mlc-ai/web-llm";

const VERSION = "v1.2.1";
const DIARY_ID = "__diary__";
const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));

const appState = {
  engine: null,
  abortCtrl: null,
  busy: false,
  loadedModelId: null,

  sessions: {},           // id -> { id, title, messages: [] }
  activeId: DIARY_ID,     // current session id
  softCancel: false       // UI stop fallback if stream cannot be aborted
};

// ---------- UI refs ----------
const selModel = $("#modelSelect");
const btnInit = $("#btnInit");
const btnRelease = $("#btnRelease");
const btnExport = $("#btnExport");
const btnTheme = $("#btnTheme");
const btnClearAll = $("#btnClearAll");

const progressEl = $("#progress");
const progressText = $("#progressText");
const statusBadge = $("#statusBadge");
const envInfo = $("#envInfo");
const logEl = $("#log");

const loadedModelChip = $("#loadedModel");
const usageStats = $("#usageStats");
const messagesEl = $("#messages");
const welcomeEl = $("#welcome");
const inputEl = $("#input");
const btnSend = $("#btnSend");
const btnStop = $("#btnStop");

const btnMenu = $("#btnMenu");
const backdrop = $("#backdrop");

const sessionListEl = $("#sessionList");
const btnNewSession = $("#btnNewSession");
const btnRenameSession = $("#btnRenameSession");
const btnDeleteSession = $("#btnDeleteSession");
const btnStartChat = $("#btnStartChat");
const btnOpenDiary = $("#btnOpenDiary");

// ---------- Helpers ----------
function setBadge(text, tone="gray"){ statusBadge.textContent = text; statusBadge.className = "badge " + tone; }
function setChip(text){ loadedModelChip.textContent = text; }
function pad2(n){ return String(n).padStart(2,"0"); }
function ts(){ const d=new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; }
function logEvent(scope, msg){ logEl.textContent += `[${ts()}] ${scope} — ${msg}\n`; logEl.scrollTop = logEl.scrollHeight; }

function saveAll(){
  localStorage.setItem("webllm_sessions", JSON.stringify(appState.sessions));
  localStorage.setItem("webllm_active", appState.activeId || "");
  localStorage.setItem("webllm_loaded_model", appState.loadedModelId || "");
  localStorage.setItem("webllm_version", VERSION);
}
function loadAll(){
  try{
    const s = JSON.parse(localStorage.getItem("webllm_sessions")||"{}");
    if (s && typeof s === "object") appState.sessions = s;
    appState.activeId = localStorage.getItem("webllm_active") || DIARY_ID;
    appState.loadedModelId = localStorage.getItem("webllm_loaded_model") || null;
  }catch{}
  if (!appState.sessions[DIARY_ID]){
    appState.sessions[DIARY_ID] = { id: DIARY_ID, title: "📒 Nhật ký", messages: [] };
  }
}
function currentSession(){ return appState.sessions[appState.activeId] || appState.sessions[DIARY_ID]; }

function ensureTheme(){ const t=localStorage.getItem("theme")||"dark"; document.body.classList.toggle("light", t==="light"); }
function toggleTheme(){ const next = document.body.classList.contains("light")?"dark":"light"; localStorage.setItem("theme", next); ensureTheme(); }

function openSidebar(){ document.body.classList.add("sidebar-open"); }
function closeSidebar(){ document.body.classList.remove("sidebar-open"); }

// ---------- Rendering ----------
function renderSessions(){
  // remove dynamic (keep diary)
  sessionListEl.querySelectorAll(".session-item:not([data-id='__diary__'])").forEach(el=>el.remove());
  Object.values(appState.sessions).filter(s=>s.id!==DIARY_ID).forEach(s=>{
    const b=document.createElement("button");
    b.className="session-item"; b.dataset.id=s.id; b.textContent=s.title || ("Chat " + s.id.slice(0,4));
    b.addEventListener("click", ()=>activateSession(s.id));
    sessionListEl.appendChild(b);
  });
  $$(".session-item").forEach(el=>el.classList.toggle("active", el.dataset.id===appState.activeId));
  sessionListEl.querySelector(".session-item[data-id='__diary__']")?.addEventListener("click", ()=>activateSession(DIARY_ID));
}
function renderMessages(){
  const sess=currentSession();
  const empty = (sess.messages.length===0);
  welcomeEl.hidden = !empty;
  messagesEl.innerHTML = "";

  for(const msg of sess.messages){
    const row=document.createElement("div");
    row.className="msg " + (msg.role==="user"?"user":"assistant");
    const avatar=Object.assign(document.createElement("div"),{className:"avatar",textContent:(msg.role==="user"?"U":"A")});
    const bubble=Object.assign(document.createElement("div"),{className:"bubble",innerHTML:formatMD(msg.content)});
    row.append(avatar,bubble);
    messagesEl.append(row);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function formatMD(text){
  const fenced=text.replace(/```([\s\S]*?)```/g,(_,c)=>`<pre class="code">${escapeHtml(c)}</pre>`);
  const inline=fenced.replace(/`([^`]+)`/g,(_,c)=>`<code class="code">${escapeHtml(c)}</code>`);
  return inline.replace(/\n\n+/g,"<br/><br/>").replace(/\n/g,"<br/>");
}
const escapeHtml=(s)=>s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));

// ---------- WebGPU (MDN: navigator.gpu / requestAdapter) ----------
async function ensureWebGPU(){
  if(!("gpu" in navigator)) throw new Error("Trình duyệt không hỗ trợ WebGPU.");
  const adapter = await navigator.gpu.requestAdapter();
  if(!adapter) throw new Error("Không lấy được GPU adapter.");
  const info = await adapter.requestAdapterInfo?.().catch(()=>null);
  envInfo.textContent = info ? `GPU: ${info.description || info.vendor || "Unknown"}` : "GPU adapter OK";
}

// ---------- Engine ----------
async function initEngine(){
  try{
    logEvent("ENGINE","Init yêu cầu");
    setBadge("Đang kiểm tra WebGPU...","gray");
    await ensureWebGPU();

    setBadge("Khởi tạo...","gray");
    if (!appState.engine){
      appState.engine = new webllm.MLCEngine({
        initProgressCallback: (r)=>{
          if (r?.progress != null){ progressEl.value=r.progress; }
          progressText.textContent = r?.text || "";
          if (r?.text) logEvent("LOAD", r.text);
        }
      });
      logEvent("ENGINE","Tạo MLCEngine");
    }
    const modelId = selModel.value;
    setChip(`Đang nạp: ${modelId}`);
    logEvent("ENGINE",`reload(${modelId}) bắt đầu`);
    await appState.engine.reload(modelId,{});
    appState.loadedModelId = modelId;
    setBadge("Đã nạp model","green");
    setChip(`Đã nạp: ${modelId}`);
    progressEl.value=1; progressText.textContent="Hoàn tất";
    logEvent("ENGINE",`reload(${modelId}) hoàn tất`);
    saveAll(); closeSidebar();
  }catch(err){
    setBadge("Lỗi khởi tạo","gray");
    setChip("Chưa nạp model");
    progressEl.value=0; progressText.textContent=String(err.message||err);
    logEvent("ERROR","Init failed: " + (err.message||err));
  }
}

async function releaseEngine(){
  try{
    if (appState.engine){ logEvent("ENGINE","unload()"); await appState.engine.unload(); }
    appState.loadedModelId=null; setBadge("Đã giải phóng","gray"); setChip("Chưa nạp model");
    progressEl.value=0; progressText.textContent="Đã giải phóng"; saveAll();
  }catch(e){ logEvent("ERROR","Unload error: " + (e.message||e)); }
}

// ---------- Sessions ----------
function newSession(){
  const id="s_"+Math.random().toString(36).slice(2,8);
  appState.sessions[id]={ id, title:"Chat mới", messages:[] };
  activateSession(id);
  logEvent("SESS","Tạo session mới");
}
function activateSession(id){
  appState.activeId=id;
  renderSessions(); renderMessages(); saveAll();
  usageStats.textContent = (id===DIARY_ID) ? "Chế độ nhật ký (lưu cục bộ, không gửi LLM)" : "";
}
function renameSession(){
  const s=currentSession(); if (s.id===DIARY_ID) return;
  const name=prompt("Tên mới:", s.title||"");
  if (name){ s.title=name; renderSessions(); saveAll(); logEvent("SESS","Đổi tên"); }
}
function deleteSession(){
  const s=currentSession(); if (s.id===DIARY_ID) return;
  if (confirm("Xoá session hiện tại?")){
    delete appState.sessions[s.id]; activateSession(DIARY_ID); logEvent("SESS","Đã xoá");
  }
}

// ---------- Chat & Diary ----------
function addUserMessage(content){ currentSession().messages.push({role:"user",content}); renderMessages(); saveAll(); }
function addAssistantMessage(content){ currentSession().messages.push({role:"assistant",content}); renderMessages(); saveAll(); }
function setAssistantStreaming(content){
  const sess=currentSession();
  const last=sess.messages[sess.messages.length-1];
  if (!last || last.role!=="assistant") sess.messages.push({role:"assistant",content});
  else last.content=content;
  renderMessages(); saveAll();
}

async function sendMessage(){
  const text=inputEl.value.trim(); if(!text) return;
  const isDiary = (appState.activeId===DIARY_ID);

  if (isDiary){
    inputEl.value=""; inputEl.style.height="auto";
    const content=`【${new Date().toLocaleString()}】\n${text}`;
    addUserMessage(content);
    usageStats.textContent="Đã lưu nhật ký ✓";
    logEvent("DIARY","Lưu 1 mục");
    return;
  }

  if(!appState.engine || !appState.loadedModelId){ logEvent("WARN","Gửi khi chưa nạp model"); return; }
  if(appState.busy){ logEvent("WARN","Đang bận"); return; }

  appState.busy=true; appState.softCancel=false;
  btnStop.disabled=false;
  addUserMessage(text);
  inputEl.value=""; inputEl.style.height="auto";
  appState.abortCtrl = new AbortController();
  const signal = appState.abortCtrl.signal;

  setBadge("Đang sinh phản hồi","green");
  usageStats.textContent="Đang tạo phản hồi…";
  logEvent("CHAT","Bắt đầu generate");

  try{
    const completion = await appState.engine.chat.completions.create({
      stream:true,
      messages:[
        {role:"system",content:"You are a helpful assistant."},
        ...currentSession().messages.map(m=>({role:m.role, content:m.content}))
      ],
      stream_options:{ include_usage:true },
      signal // AbortSignal – nếu thư viện tôn trọng sẽ hủy stream
    });

    let acc="", lastUsage=null, tick=0;
    for await (const chunk of completion){
      if (appState.softCancel) break; // dự phòng nếu signal không hủy được
      const delta = chunk?.choices?.[0]?.delta?.content || "";
      if (delta){
        acc += delta; setAssistantStreaming(acc);
        if ((++tick%10)===0) logEvent("STREAM","… nhận thêm token");
      }
      if (chunk?.usage) lastUsage = chunk.usage;
      const extra = chunk?.extra;
      if (extra?.perf){
        const { prefill_tokens_per_s, decode_tokens_per_s } = extra.perf;
        usageStats.textContent = `Prefill: ${prefill_tokens_per_s?.toFixed?.(1)||"?"} tok/s · Decode: ${decode_tokens_per_s?.toFixed?.(1)||"?"} tok/s`;
      }
    }
    if (acc==="") setAssistantStreaming("");
    if (lastUsage){
      const { prompt_tokens, completion_tokens, total_tokens } = lastUsage;
      usageStats.textContent=`Tokens — prompt: ${prompt_tokens??"?"}, completion: ${completion_tokens??"?"}, total: ${total_tokens??"?"}`;
      logEvent("CHAT",`Hoàn tất · tokens p=${prompt_tokens} c=${completion_tokens} t=${total_tokens}`);
    } else {
      logEvent("CHAT","Hoàn tất (không có usage)");
    }
  }catch(err){
    if (signal.aborted || appState.softCancel){
      usageStats.textContent="Đã dừng."; logEvent("CHAT","Đã dừng");
    } else {
      usageStats.textContent="Lỗi."; logEvent("ERROR","Chat error: " + (err.message||err));
    }
  }finally{
    appState.abortCtrl=null; appState.busy=false; btnStop.disabled=true;
    setBadge(appState.loadedModelId ? "Đã nạp model" : "Chưa khởi tạo", appState.loadedModelId ? "green":"gray");
  }
}

function stopGeneration(){
  // Thử hủy qua AbortController; nếu lib không tôn trọng, bật softCancel để ngừng cập nhật UI
  let flagged=false;
  try{
    if (appState.abortCtrl){ appState.abortCtrl.abort(); flagged=true; }
  }catch(e){ logEvent("ERROR","Abort error: "+(e.message||e)); }
  appState.softCancel = true;
  logEvent("UI","Stop clicked" + (flagged?" (signal sent)":" (soft-cancel)"));
  btnStop.disabled=true;
}

// ---------- Events ----------
btnInit.addEventListener("click", initEngine);
btnRelease.addEventListener("click", releaseEngine);
btnExport.addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify({version:VERSION, model:appState.loadedModelId, sessions:appState.sessions, active:appState.activeId}, null, 2)], {type:"application/json"});
  const u = URL.createObjectURL(blob); const a=Object.assign(document.createElement("a"),{href:u,download:"export.json"}); a.click(); URL.revokeObjectURL(u);
  logEvent("UI","Export JSON");
});
btnTheme.addEventListener("click", ()=>{ toggleTheme(); logEvent("UI","Toggle theme"); });
btnClearAll.addEventListener("click", ()=>{
  if (confirm("Xoá tất cả dữ liệu cục bộ?")){
    localStorage.clear(); appState.sessions={}; appState.activeId=DIARY_ID; appState.loadedModelId=null;
    loadAll(); renderSessions(); renderMessages(); setChip("Chưa nạp model"); usageStats.textContent="";
    logEvent("UI","Đã xoá toàn bộ");
  }
});
btnNewSession.addEventListener("click", newSession);
btnRenameSession.addEventListener("click", renameSession);
btnDeleteSession.addEventListener("click", deleteSession);
btnSend.addEventListener("click", sendMessage);
btnStop.addEventListener("click", stopGeneration);

btnMenu?.addEventListener("click", openSidebar);
backdrop?.addEventListener("click", closeSidebar);
btnStartChat?.addEventListener("click", ()=>{ newSession(); });
btnOpenDiary?.addEventListener("click", ()=>{ activateSession(DIARY_ID); });

// Auto-resize + Enter to send
inputEl.addEventListener("input", ()=>{
  inputEl.style.height="auto";
  inputEl.style.height=Math.min(inputEl.scrollHeight, window.innerHeight*0.4)+"px";
});
inputEl.addEventListener("keydown", (e)=>{
  if (e.key==="Enter" && !e.shiftKey){ e.preventDefault(); btnSend.click(); }
});

// ---------- Boot ----------
(function boot(){
  ensureTheme();
  loadAll();
  (webllm.prebuiltAppConfig?.model_list || []).forEach(m=>{
    const opt=document.createElement("option");
    opt.value=m.model_id; opt.textContent=m.model_id;
    if (m.model_id===appState.loadedModelId) opt.selected=true;
    selModel.appendChild(opt);
  });
  renderSessions();
  activateSession(appState.activeId||DIARY_ID);
  setChip(appState.loadedModelId ? `Đã nạp: ${appState.loadedModelId}` : "Chưa nạp model");
  setBadge("Chưa khởi tạo","gray");
  progressEl.value=0; progressText.textContent="Chưa tải";
  logEvent("BOOT",`UI ${VERSION} khởi động`);
})();
