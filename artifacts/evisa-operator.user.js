// ==UserScript==
// @name         eVisa Operator — Telegram
// @namespace    local.evisa.operator
// @version      0.1.1
// @description  Telegram navbatidagi arizani to‘lovgacha tayyorlash. To‘lovni bosmaydi.
// @match        https://visa.visitsaudi.com/Visa/*
// @match        https://visa.visitsaudi.com/Insurance/ChooseInsurance/*
// @match        https://visa.visitsaudi.com/Login*
// @connect      127.0.0.1
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @noframes
// ==/UserScript==
"use strict";
(() => {
  // agent/userscript-dom.mjs
  function scriptDomOperation(command) {
    const visible = (e2) => !!e2.getClientRects().length && getComputedStyle(e2).visibility !== "hidden";
    const clean = (s) => String(s || "").replace(/\s+/g, " ").trim().replace(/\s*\*$/, "").trim();
    const name = (e2) => clean(e2.getAttribute("aria-label") || Array.from(e2.labels || []).map((l) => l.textContent).join(" ") || e2.getAttribute("placeholder") || e2.textContent || e2.value);
    const roleSelectors = { textbox: "input:not([type]),input[type=text],input[type=email],input[type=tel],input[type=number],textarea", combobox: "select", checkbox: "input[type=checkbox]", radio: "input[type=radio]", button: "button,input[type=submit],input[type=button],[role=button]", link: "a[href],a[role=button]" };
    const all = (selector) => {
      let roots = [document];
      for (const part of selector) {
        if (part.css) {
          if (typeof part.css !== "string" || part.css.length > 150) throw Error("Maydon tanlovi noto\u2018g\u2018ri.");
          roots = roots.flatMap((r) => Array.from(r.querySelectorAll(part.css)));
        } else {
          if (!roleSelectors[part.role]) throw Error("Maydon turi qo\u2018llanmagan.");
          roots = roots.flatMap((r) => Array.from(r.querySelectorAll(roleSelectors[part.role]))).filter((e2) => {
            const n = name(e2);
            return typeof part.name === "object" ? new RegExp(part.name.regex, part.name.flags || "").test(n) : part.exact ? n === clean(part.name) : n.includes(clean(part.name));
          });
        }
      }
      return [...new Set(roots)].filter((e2) => !e2.closest("[data-evisa-script]"));
    };
    const text = (e2) => {
      if (e2 !== document.body) return e2.innerText || e2.textContent || "";
      const ui = document.querySelector("[data-evisa-script]"), was = ui?.style.display;
      if (ui) ui.style.display = "none";
      const out = e2.innerText;
      if (ui) ui.style.display = was;
      return out;
    };
    if (command.action === "goto") {
      const u = new URL(command.target);
      if (u.origin !== "https://visa.visitsaudi.com" || !/^\/(Visa\/(Index|PersonalInfo|PassportInfo|Terms|Review)(\/|$)|Insurance\/ChooseInsurance\/|Login(\/|$))/.test(u.pathname)) throw Error("Sahifa manzili noto\u2018g\u2018ri.");
      return { value: true, navigate: command.target };
    }
    if (command.action === "snapshot") return { value: { text: text(document.body).slice(0, 4e4), controls: Array.from(document.querySelectorAll("input,select,textarea,button,a")).filter((e2) => !e2.closest("[data-evisa-script]") && visible(e2) && !["hidden", "password"].includes(e2.type)).map((e2) => ({ tag: e2.tagName.toLowerCase(), id: e2.id, type: e2.type || "", label: name(e2), text: /^(BUTTON|A)$/.test(e2.tagName) ? clean(e2.innerText) : "", required: !!e2.required, ...e2.tagName === "A" && e2.getAttribute("href")?.startsWith("/") ? { href: e2.getAttribute("href") } : {}, ...e2.tagName === "SELECT" ? { options: Array.from(e2.options).map((o) => ({ label: o.text, value: o.value })) } : {}, ...["checkbox", "radio"].includes(e2.type) ? { checked: e2.checked } : {} })) } };
    if (command.action !== "element" || !Array.isArray(command.selector)) throw Error("Amal qo\u2018llanmagan.");
    const elements = all(command.selector), op = command.operation;
    if (op === "count") return { value: elements.length };
    if (op === "visible") return { value: elements.some(visible) };
    if (elements.length !== 1) throw Error(elements.length ? "Bir nechta bir xil maydon topildi. Tekshiring." : "Kerakli maydon topilmadi. Sahifa o\u2018zgargan bo\u2018lishi mumkin.");
    const e = elements[0];
    if (e.type === "password" || e.type === "hidden") throw Error("Bu maydon o\u2018qilmaydi.");
    if (op === "value") return { value: e.value };
    if (op === "text") return { value: text(e) };
    if (op === "checked") return { value: !!e.checked };
    if (op === "editable") return { value: !e.disabled && !e.readOnly };
    if (/^\/Login/.test(location.pathname)) throw Error("Akkauntga kirish, kod va CAPTCHA\u2019ni o\u2018zingiz yakunlang.");
    if (/access denied|too many requests|unusual traffic|verify you are human/i.test(text(document.body))) throw Error("Sayt tekshiruv yoki cheklov ko\u2018rsatmoqda. Operator tekshirsin.");
    if (Array.from(document.querySelectorAll('iframe[title*="challenge" i],iframe[title*="captcha" i],.g-recaptcha,.h-captcha')).some(visible)) throw Error("CAPTCHA chiqdi. Operator yakunlasin.");
    if (e.disabled) throw Error("Maydon yoki tugma hozir faol emas.");
    const change = () => {
      e.dispatchEvent(new Event("input", { bubbles: true }));
      e.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const setValue = (v) => {
      const proto = e.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(e, v);
    };
    if (op === "fill" || op === "type") {
      if (!e.matches(roleSelectors.textbox) || e.readOnly) throw Error("Maydon yozish uchun ochiq emas.");
      e.focus();
      if (op === "fill") setValue(String(command.value));
      else for (const char of String(command.value)) {
        e.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
        e.dispatchEvent(new KeyboardEvent("keypress", { key: char, bubbles: true }));
        setValue(e.value + char);
        e.dispatchEvent(new InputEvent("input", { data: char, inputType: "insertText", bubbles: true }));
        e.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
      }
      change();
      return { value: true };
    }
    if (op === "press") {
      if (command.value !== "Tab") throw Error("Tugma qo\u2018llanmagan.");
      e.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      e.blur();
      e.dispatchEvent(new KeyboardEvent("keyup", { key: "Tab", bubbles: true }));
      return { value: true };
    }
    if (op === "select") {
      if (e.tagName !== "SELECT") throw Error("Tanlov maydoni emas.");
      const options = Array.from(e.options).filter((o) => clean(o.text) === clean(command.value));
      if (options.length !== 1) throw Error("Kerakli tanlov topilmadi.");
      e.value = options[0].value;
      change();
      return { value: true };
    }
    if (op === "portrait") {
      if (e.id !== "AttachmentPersonalPicture" || e.type !== "file" || !/^[A-Za-z0-9+/=]+$/.test(command.value)) throw Error("Portret maydoni noto\u2018g\u2018ri.");
      const bytes = Uint8Array.from(atob(command.value), (c) => c.charCodeAt(0));
      if (bytes.length < 5e3 || bytes.length > 1e5) throw Error("Portret hajmi mos emas.");
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], "portrait.jpg", { type: "image/jpeg" }));
      e.files = transfer.files;
      change();
      return { value: true };
    }
    if (op === "click") {
      const n = name(e);
      if (e.id === "btnPay" || /payment|\bpay\b|checkout/i.test(n)) throw Error("To\u2018lovni faqat operator bajaradi.");
      const choice = ["radio", "checkbox"].includes(e.type), calendar = e.matches("a") && !!e.closest("#ui-datepicker-div") && /^\d{1,2}$/.test(n), allowed = ["btnApplyGroupVisa", "btnCreateGroup"].includes(e.id) || /^(Next|Apply For Individual)$/i.test(n) || /^\+?\s*(?:save\s*(?:&|and)\s*)?add\s+(?:(?:another|new|more)\s+)?(?:person|applicant|member)\s*\+?$/i.test(n);
      if (!choice && !calendar && !allowed && !e.matches("input[readonly]")) throw Error("Bu tugma avtomatik bosilmaydi.");
      if (e.matches("a[href]") && e.getAttribute("href") !== "#" && !e.getAttribute("href").startsWith("javascript:")) {
        const u = new URL(e.href);
        if (u.origin !== location.origin) throw Error("Tashqi havola ochilmaydi.");
      }
      if (choice || calendar || e.matches("input[readonly]")) {
        e.click();
        return { value: true };
      }
      if (!visible(e)) throw Error("Tugma ko\u2018rinmayapti.");
      return { value: true, click: e };
    }
    throw Error("Amal qo\u2018llanmagan.");
  }

  // agent/userscript-client.mjs
  var base = "http://127.0.0.1:47832";
  var documentId = crypto.randomUUID();
  var clientId = sessionStorage.getItem("evisa-script-tab");
  if (!clientId) {
    clientId = crypto.randomUUID();
    sessionStorage.setItem("evisa-script-tab", clientId);
  }
  var token = GM_getValue("bridge-token", "");
  var enabled = sessionStorage.getItem("evisa-script-enabled") === "1";
  var root = document.createElement("aside");
  root.dataset.evisaScript = "1";
  root.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#fff;color:#163b35;border:2px solid #0c8571;border-radius:12px;padding:14px;width:285px;box-shadow:0 3px 18px #0003;font:14px system-ui;";
  var title = document.createElement("strong");
  title.textContent = "eVisa \u2014 Telegram skripti";
  var status = document.createElement("p");
  status.textContent = "To\u2018lovni operator bajaradi.";
  var connect = document.createElement("button");
  var toggle = document.createElement("button");
  connect.textContent = "Ulash";
  for (const b of [connect, toggle]) b.style.cssText = "padding:9px;margin-right:7px;border:0;border-radius:6px;background:#087560;color:white;cursor:pointer";
  root.append(title, status, connect, toggle);
  document.body.append(root);
  var toggleText = () => toggle.textContent = enabled ? "To\u2018xtatish" : "Ishga ruxsat";
  toggleText();
  var request = (route, data = {}) => new Promise((resolve, reject) => GM_xmlhttpRequest({ method: "POST", url: base + route, headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }, data: JSON.stringify({ clientId, documentId, url: location.href, ...data }), timeout: 7e3, onload: (r) => {
    try {
      const x = JSON.parse(r.responseText);
      if (r.status !== 200) throw Error(x.error || "Ulanish ishlamadi.");
      resolve(x);
    } catch (e) {
      reject(e);
    }
  }, onerror: () => reject(Error("Kompyuterdagi bot ishlayotganini tekshiring.")), ontimeout: () => reject(Error("Bot bilan aloqa vaqti tugadi.")) }));
  connect.onclick = () => {
    const value = prompt("http://127.0.0.1:47831/ dagi \u201CBrauzer skripti\u201D ulash kodini kiriting. API kaliti yoki Telegram tokenini kiritmang.");
    if (!value) return;
    if (!/^[a-f0-9]{64}$/i.test(value.trim())) {
      status.textContent = "Ulash kodi 64 belgidan iborat.";
      return;
    }
    token = value.trim();
    GM_setValue("bridge-token", token);
    status.textContent = "Kod saqlandi. \u201CIshga ruxsat\u201Dni bosing.";
  };
  toggle.onclick = async () => {
    enabled = !enabled;
    sessionStorage.setItem("evisa-script-enabled", enabled ? "1" : "0");
    toggleText();
    if (!enabled && token) await request("/poll", { paused: true }).catch(() => {
    });
    status.textContent = enabled ? "Telegram navbati kutilmoqda\u2026" : "Skript to\u2018xtatilgan.";
  };
  async function tick() {
    let delay = 1e3;
    try {
      if (!token || !enabled) return;
      const result = await request("/poll");
      if (!enabled) return;
      const cmd = result.command;
      if (cmd) delay = 100;
      if (!cmd) {
        status.textContent = "Ulangan. Telegram navbati kutilmoqda.";
        return;
      }
      if (cmd.documentId !== documentId || cmd.url !== location.href) throw Error("Sahifa o\u2018zgargan. Qoralamani tekshiring.");
      let operation;
      try {
        operation = scriptDomOperation(cmd);
      } catch (error) {
        await request("/result", { id: cmd.id, error: error.message });
        enabled = false;
        sessionStorage.setItem("evisa-script-enabled", "0");
        toggleText();
        status.textContent = error.message;
        return;
      }
      await request("/result", { id: cmd.id, value: operation.value });
      if (!enabled) return;
      if (operation.navigate) {
        location.assign(operation.navigate);
        return;
      }
      if (operation.click) {
        operation.click.click();
        await new Promise((r) => setTimeout(r, 450));
      }
      status.textContent = "Ariza to\u2018ldirilmoqda\u2026";
    } catch (error) {
      status.textContent = error.message;
    } finally {
      setTimeout(tick, delay);
    }
  }
  tick();
})();
