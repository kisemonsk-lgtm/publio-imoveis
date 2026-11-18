/* ==========================================================
   TELA INICIAL — a porta que se abre no meio
   ----------------------------------------------------------
   Duas folhas escuras com filete dourado cobrem a tela e se
   abrem para os lados, revelando a logo, o nome e o botão
   Entrar. Clicou em Entrar, a abertura sai de cena de vez e o
   site fica livre (não há segunda etapa, nada de prender).
   Roda no painel do corretor (index.html) e na Públio Cliente
   (publio-cliente.html).
   Quem abre um link de imóvel vai direto para a ficha, sem
   passar pela abertura.
   ========================================================== */
(function () {
  "use strict";

  var CHAVE = "publio-abertura-v4";     // "1" = já entrou nesta sessão
  var el = null;
  var saindo = false;

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

  function reduzido() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
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

  /* mostra a abertura; as portas se abrem sozinhas */
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

  /* sai da frente de vez: esconde, libera a rolagem e não volta */
  function sairDeCena() {
    document.removeEventListener("keydown", teclado);
    document.body.classList.remove("abertura-ativa");
    if (el) {
      el.hidden = true;
      el.style.display = "none";
      el.classList.remove("saindo");
    }
    el = null;

    // o campo de título já fica pronto para digitar (só no painel do corretor)
    var t = document.getElementById("f-titulo");
    var p = document.getElementById("painel");
    if (t && p && !p.hidden) {
      try { t.focus({ preventScroll: true }); } catch (_) { }
    }
  }

  function entrar() {
    if (!el || saindo) return;
    saindo = true;
    marcarEntrou();

    if (reduzido()) { sairDeCena(); return; }

    el.classList.add("saindo");
    setTimeout(sairDeCena, 400);
  }

  /* se alguém abrir um link de ficha com a abertura na tela, sai da frente */
  window.addEventListener("hashchange", function () {
    if (temLinkDeFicha() && el && !el.hidden) {
      marcarEntrou();
      sairDeCena();
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
