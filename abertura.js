/* ==========================================================
   TELA INICIAL — a porta se abre quando a pessoa clica em Entrar
   ----------------------------------------------------------
   A tela abre simples: logo, nome e botão Entrar.
   Clicou em Entrar: duas folhas escuras com filete dourado descem
   e fecham a tela pela linha do meio e, logo em seguida, essa
   porta se abre para os lados — o meio se abre e o site aparece.
   Roda no painel do corretor (index.html) e na Públio Cliente
   (publio-cliente.html).
   Quem abre um link de imóvel vai direto para a ficha.
   ========================================================== */
(function () {
  "use strict";

  var CHAVE = "publio-abertura-v6";     // "1" = já entrou nesta sessão
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

  /* abertura simples: logo, nome e o botão Entrar */
  function mostrar() {
    el = document.getElementById("abertura");
    if (!el) return;
    semearPo();
    el.hidden = false;
    el.classList.remove("abrindo", "curtina");
    document.body.classList.add("abertura-ativa");
    window.scrollTo({ top: 0 });

    var btn = document.getElementById("btnEntrarSistema");
    if (btn) {
      btn.addEventListener("click", entrar);
      try { btn.focus({ preventScroll: true }); } catch (_) { }
    }
    document.addEventListener("keydown", teclado);
  }

  /* Enter abre; Escape só sai da abertura se já tiver entrado antes nesta sessão */
  function teclado(ev) {
    if (!el || el.hidden) return;
    if (ev.key === "Enter") {
      ev.preventDefault();
      entrar();
    } else if (ev.key === "Escape" && jaEntrou()) {
      ev.preventDefault();
      entrar();
    }
  }

  function sairDeCena() {
    document.removeEventListener("keydown", teclado);
    document.body.classList.remove("abertura-ativa");
    if (el) {
      el.hidden = true;
      el.style.display = "none";
      el.classList.remove("abrindo", "curtina");
    }
    el = null;

    // o campo de título já fica pronto para digitar (só no painel do corretor)
    var t = document.getElementById("f-titulo");
    var p = document.getElementById("painel");
    if (t && p && !p.hidden) {
      try { t.focus({ preventScroll: true }); } catch (_) { }
    }
  }

  /* clique em Entrar: a porta fecha a tela no meio e depois se abre */
  function entrar() {
    if (!el || indo) return;
    indo = true;
    marcarEntrou();
    document.body.classList.remove("abertura-ativa");

    // 1) a porta aparece fechada, tampando a tela
    el.classList.add("abrindo");

    // 2) e desliza para os lados (translateX ±100%, 1s), revelando o site
    setTimeout(function () {
      if (!el) return;
      el.classList.add("curtina");
    }, reduzido() ? 30 : 90);

    setTimeout(sairDeCena, reduzido() ? 550 : 1500);
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
