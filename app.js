const KEY = "kovbasa.hours.v1";
const defaultState = {
  settings: { rate: 250, ot: 1.5, hol: 2, norm: 8, breakMin: 30 },
  shifts: [],
  running: null
};
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(defaultState);
    const data = JSON.parse(raw);
    return {
      settings: { ...defaultState.settings, ...(data.settings || {}) },
      shifts: Array.isArray(data.shifts) ? data.shifts : [],
      running: data.running || null
    };
  } catch { return structuredClone(defaultState); }
}
function save(state) { localStorage.setItem(KEY, JSON.stringify(state)); }
let state = load();
const $ = (id) => document.getElementById(id);
const pages = { home: $("page-home"), log: $("page-log"), add: $("page-add"), settings: $("page-settings") };
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}
function pad(n) { return String(n).padStart(2, "0"); }
function fmtMoney(n) {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(n || 0);
}
function fmtHours(n) {
  return (Math.round((n || 0) * 100) / 100).toFixed(2);
}
function weekdayUa(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return ["нд","пн","вт","ср","чт","пт","сб"][d.getDay()];
}
function parseHM(hm) {
  const [h, m] = (hm || "00:00").split(":").map(Number);
  return h * 60 + m;
}
function calcHours(start, end, breakMin) {
  let mins = parseHM(end) - parseHM(start);
  if (mins < 0) mins += 24 * 60;
  mins -= Number(breakMin || 0);
  return Math.max(0, mins / 60);
}
function calcPay(hours, type, settings) {
  const { rate, ot, hol, norm } = settings;
  if (type === "weekend" || type === "holiday") return hours * rate * hol;
  const regular = Math.min(hours, norm);
  const extra = Math.max(0, hours - norm);
  return regular * rate + extra * rate * ot;
}
function typeLabel(t) {
  return t === "holiday" ? "свято" : t === "weekend" ? "вихідний" : "будень";
}
function showPage(name) {
  Object.entries(pages).forEach(([k, el]) => el.classList.toggle("hidden", k !== name));
  document.querySelectorAll("nav.tabs button").forEach(b => {
    b.classList.toggle("active", b.dataset.page === name);
  });
  if (name === "log") renderLog();
  if (name === "settings") fillSettings();
  if (name === "add" && !$("editId").value) presetForm();
}
function nowParts() {
  const d = new Date();
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
  };
}
function tick() {
  const d = new Date();
  $("liveClock").textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  $("liveDate").textContent = d.toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" });
  $("todayLabel").textContent = d.toLocaleDateString("uk-UA", { day: "2-digit", month: "short" });
  const btn = $("toggleShift");
  const pill = $("statusPill");
  if (state.running) {
    const start = new Date(state.running.startISO);
    const elapsed = (d - start) / 1000;
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = Math.floor(elapsed % 60);
    pill.textContent = `зміна йде · ${pad(h)}:${pad(m)}:${pad(s)}`;
    pill.classList.add("on");
    btn.textContent = "Закінчити зміну";
    btn.className = "btn btn-stop";
  } else {
    pill.textContent = "зміна не почата";
    pill.classList.remove("on");
    btn.textContent = "Почати зміну";
    btn.className = "btn btn-start";
  }
  renderMonthStats();
}
function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
}
function renderMonthStats() {
  const key = currentMonthKey();
  const list = state.shifts.filter(s => s.date.startsWith(key));
  const hours = list.reduce((a, s) => a + s.hours, 0);
  const pay = list.reduce((a, s) => a + s.pay, 0);
  $("mHours").textContent = fmtHours(hours);
  $("mPay").textContent = fmtMoney(pay);
}
function startShift() {
  if (state.running) return;
  state.running = { startISO: new Date().toISOString() };
  save(state);
  toast("Зміну почато");
  tick();
}
function stopShift() {
  if (!state.running) return;
  const start = new Date(state.running.startISO);
  const end = new Date();
  const date = `${start.getFullYear()}-${pad(start.getMonth()+1)}-${pad(start.getDate())}`;
  const startHM = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
  const endHM = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
  const br = state.settings.breakMin;
  const hours = calcHours(startHM, endHM, br);
  const type = [0,6].includes(start.getDay()) ? "weekend" : "weekday";
  const pay = calcPay(hours, type, state.settings);
  state.shifts.push({ id: crypto.randomUUID(), date, start: startHM, end: endHM, breakMin: br, type, note: "", hours, pay });
  state.running = null;
  save(state);
  toast(`Закрито: ${fmtHours(hours)} год · ${fmtMoney(pay)} грн`);
  tick();
}
function presetForm() {
  const n = nowParts();
  $("editId").value = "";
  $("formTitle").textContent = "Нова зміна";
  $("fDate").value = n.date;
  $("fStart").value = "08:00";
  $("fEnd").value = n.time;
  $("fBreak").value = state.settings.breakMin;
  $("fType").value = "weekday";
  $("fNote").value = "";
  updatePreview();
}
function fillForm(shift) {
  $("editId").value = shift.id;
  $("formTitle").textContent = "Редагувати зміну";
  $("fDate").value = shift.date;
  $("fStart").value = shift.start;
  $("fEnd").value = shift.end;
  $("fBreak").value = shift.breakMin;
  $("fType").value = shift.type;
  $("fNote").value = shift.note || "";
  updatePreview();
}
function updatePreview() {
  const hours = calcHours($("fStart").value, $("fEnd").value, $("fBreak").value);
  const pay = calcPay(hours, $("fType").value, state.settings);
  $("previewPay").textContent = `Вийде ${fmtHours(hours)} год · ${fmtMoney(pay)} грн`;
}
function saveShiftFromForm() {
  const date = $("fDate").value;
  const start = $("fStart").value;
  const end = $("fEnd").value;
  if (!date || !start || !end) { toast("Дата і час обов’язкові"); return; }
  const breakMin = Number($("fBreak").value || 0);
  const type = $("fType").value;
  const note = $("fNote").value.trim();
  const hours = calcHours(start, end, breakMin);
  const pay = calcPay(hours, type, state.settings);
  const id = $("editId").value || crypto.randomUUID();
  const next = { id, date, start, end, breakMin, type, note, hours, pay };
  const idx = state.shifts.findIndex(s => s.id === id);
  if (idx >= 0) state.shifts[idx] = next;
  else state.shifts.push(next);
  state.shifts.sort((a,b) => (a.date + a.start).localeCompare(b.date + b.start));
  save(state);
  toast("Зміну збережено");
  showPage("log");
}
function renderLog() {
  if (!$("monthFilter").value) $("monthFilter").value = currentMonthKey();
  const key = $("monthFilter").value;
  const list = state.shifts.filter(s => s.date.startsWith(key)).slice().reverse();
  const box = $("logList");
  if (!list.length) { box.innerHTML = `<div class="empty">У цьому місяці ще порожньо.</div>`; return; }
  const hours = list.reduce((a,s)=>a+s.hours,0);
  const pay = list.reduce((a,s)=>a+s.pay,0);
  box.innerHTML = `<div class="grid2" style="margin:12px 0 6px"><div class="stat"><span>Годин</span><b>${fmtHours(hours)}</b></div><div class="stat"><span>Гривень</span><b>${fmtMoney(pay)}</b></div></div>` +
    list.map(s => `<div class="shift"><div><div><strong>${s.date.slice(8)}.${s.date.slice(5,7)}</strong> · ${weekdayUa(s.date)} · ${typeLabel(s.type)}</div><div class="meta">${s.start}–${s.end} · перерва ${s.breakMin} хв${s.note ? " · " + s.note : ""}</div><div class="row-actions"><button class="linkish" data-edit="${s.id}">змінити</button><button class="linkish" data-del="${s.id}">видалити</button></div></div><div><div class="pay">${fmtMoney(s.pay)}</div><div class="hours">${fmtHours(s.hours)} год</div></div></div>`).join("");
}
function fillSettings() {
  $("sRate").value = state.settings.rate;
  $("sOt").value = state.settings.ot;
  $("sHol").value = state.settings.hol;
  $("sNorm").value = state.settings.norm;
  $("sBreak").value = state.settings.breakMin;
}
function saveSettings() {
  state.settings = {
    rate: Number($("sRate").value || 0),
    ot: Number($("sOt").value || 1),
    hol: Number($("sHol").value || 1),
    norm: Number($("sNorm").value || 8),
    breakMin: Number($("sBreak").value || 0)
  };
  state.shifts = state.shifts.map(s => {
    const hours = calcHours(s.start, s.end, s.breakMin);
    return { ...s, hours, pay: calcPay(hours, s.type, state.settings) };
  });
  save(state);
  toast("Ставки збережено");
  renderMonthStats();
}
function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `kovbasa-godyny-${currentMonthKey()}.json`;
  a.click();
}
function exportCsv() {
  const rows = [["date","start","end","break_min","type","hours","pay","note"]];
  state.shifts.forEach(s => rows.push([s.date,s.start,s.end,s.breakMin,s.type,s.hours,s.pay,`"${(s.note||"").replaceAll('"','""')}"`]));
  const blob = new Blob([rows.map(r => r.join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "kovbasa-godyny.csv";
  a.click();
}
document.querySelectorAll("nav.tabs button").forEach(b => {
  b.addEventListener("click", () => showPage(b.dataset.page));
});
$("toggleShift").addEventListener("click", () => state.running ? stopShift() : startShift());
$("openManual").addEventListener("click", () => { presetForm(); showPage("add"); });
$("cancelForm").addEventListener("click", () => showPage("home"));
$("saveShift").addEventListener("click", saveShiftFromForm);
["fStart","fEnd","fBreak","fType"].forEach(id => $(id).addEventListener("input", updatePreview));
$("saveSettings").addEventListener("click", saveSettings);
$("exportJson").addEventListener("click", exportJson);
$("exportCsv").addEventListener("click", exportCsv);
$("monthFilter").addEventListener("change", renderLog);
$("logList").addEventListener("click", (e) => {
  const edit = e.target.dataset.edit;
  const del = e.target.dataset.del;
  if (edit) {
    const s = state.shifts.find(x => x.id === edit);
    if (s) { fillForm(s); showPage("add"); }
  }
  if (del && confirm("Видалити цю зміну?")) {
    state.shifts = state.shifts.filter(x => x.id !== del);
    save(state);
    renderLog();
    renderMonthStats();
  }
});
$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.settings || !Array.isArray(data.shifts)) throw new Error("bad");
    state = { settings: { ...defaultState.settings, ...data.settings }, shifts: data.shifts, running: data.running || null };
    save(state);
    fillSettings();
    renderMonthStats();
    toast("Імпортовано");
  } catch { toast("Файл не підійшов"); }
});
tick();
setInterval(tick, 1000);
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
