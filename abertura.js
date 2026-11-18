/* ==========================================================
   TELA INICIAL — logo animada e botão Entrar
   ----------------------------------------------------------
   Aparece uma vez por sessão do navegador, sempre que a pessoa
   abre o site sem link de ficha (#ver/, #ficha/, #imovel=).
   Quem abre um link de imóvel vai direto para a ficha, sem
   passar pela abertura.
   ========================================================== */
(function () {
  "use strict";

  var CHAVE = "publio-abertura-v1";
  var el = null;
  var indo = false;

  function temLinkDeFicha() {
    var h = location.hash || "";
    return h.indexOf("#ver/") === 0 || h.indexOf("#ficha/") === 0 || h.indexOf("#imovel=") === 0;
  }

  function jaEntrou() {
    try { return sessionStorage.getItem(CHAVE) === "1"; } catch (_) { return false; }
  }

  function marcarEntrou() {
    try { sessionStorage.setItem(CHAVE, "1"); } catch (_) { /* modo privado: mostra sempre */ }
  }

  /* pequenos pontos dourados subindo ao fundo */
  function semearPo() {
    var caixa = document.getElementById("aberturaPo");
    if (!caixa || caixa.childElementCount) return;
    var total = window.innerWidth < 520 ? 14 : 22;
    for (var i = 0; i < total; i++) {
      var p = document.createElement("i");
      var dur = 9 + Math.random() * 9;
      p.style.left = (Math.random() * 100).toFixed(2) + "%";
      p.style.animationDuration = dur.toFixed(2) + "s";
      p.style.animationDelay = (-Math.random() * dur).toFixed(2) + "s";
      p.style.width = p.style.height = (1.5 + Math.random() * 2.5).toFixed(1) + "px";
      p.style.opacity = "0";
      caixa.appendChild(p);
    }
  }

  function mostrar() {
    el = document.getElementById("abertura");
    if (!el) return;
    semearPo();
    el.hidden = false;
    document.body.classList.add("abertura-ativa");
    window.scrollTo({ top: 0 });

    var btn = document.getElementById("btnEntrarSistema");
    if (btn) {
      btn.addEventListener("click", entrar);
      // se o corretor só apertar Enter, também entra
      try { btn.focus({ preventScroll: true }); } catch (_) { }
    }
    document.addEventListener("keydown", teclado);
  }

  function teclado(ev) {
    if (!el || el.hidden) return;
    if (ev.key === "Enter" || ev.key === "Escape") {
      ev.preventDefault();
      entrar();
    }
  }

  function entrar() {
    if (!el || indo) return;
    indo = true;
    marcarEntrou();
    document.removeEventListener("keydown", teclado);
    el.classList.add("saindo");
    document.body.classList.remove("abertura-ativa");

    var fim = function () {
      el.hidden = true;
      el.classList.remove("saindo");
      el = null;
      indo = false;
      // o campo de título já fica pronto para digitar
      var t = document.getElementById("f-titulo");
      if (t && !document.getElementById("painel").hidden) {
        try { t.focus({ preventScroll: true }); } catch (_) { }
      }
    };

    var reduzido = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduzido) { fim(); return; }
    setTimeout(fim, 520);
  }

  /* se alguém abrir um link de ficha com a abertura na tela, sai da frente */
  window.addEventListener("hashchange", function () {
    if (temLinkDeFicha() && el && !el.hidden) {
      marcarEntrou();
      document.removeEventListener("keydown", teclado);
      el.hidden = true;
      el.classList.remove("saindo");
      el = null;
      document.body.classList.remove("abertura-ativa");
    }
  });

  function iniciar() {
    if (temLinkDeFicha() || jaEntrou()) return;
    mostrar();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
