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
async function initEngin
