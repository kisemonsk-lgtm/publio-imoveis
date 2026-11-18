/* ==========================================================
   TELA INICIAL — a porta que se abre no meio
   ----------------------------------------------------------
   Duas folhas escuras com filete dourado cobrem a tela e se
   abrem para os lados, revelando a logo, o nome e o botão
   Entrar. Depois de entrar, a porta FECHA de novo (o site
   fica "guardado atrás dela") até a pessoa clicar em abrir.
   Roda no painel do corretor (index.html) e na Públio Cliente
   (publio-cliente.html).
   Quem abre um link de imóvel vai direto para a ficha, sem
   passar pela abertura.
   ========================================================== */
(function () {
  "use strict";

  var CHAVE = "publio-abertura-v3";     // "1" = já entrou nesta sessão
  var el = null;
  var indo = false;
  var fechada = false;                  // a porta está fechando o site?

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

  /* mostra a abertura fechada e depois abre as portas */
  function mostrar() {
    el = document.getElementById("abertura");
    if (!el) return;
    fechada = false;
    semearPo();
    el.hidden = false;
    el.classList.remove("saindo", "fechando");
    document.body.classList.add("abertura-ativa");
    window.scrollTo({ top: 0 });

    var btn = document.getElementById("btnEntrarSistema");
    if (btn) {
      if (!btn._ligado) {
        btn.addEventListener("click", entrar);
        btn._ligado = true;
      }
      try { btn.focus({ preventScroll: true }); } catch (_) { }
    }
    document.addEventListener("keydown", teclado);
  }

  function teclado(ev) {
    if (!el || el.hidden) return;
    if (ev.key === "Enter" || ev.key === "Escape") {
      ev.preventDefault();
      if (fechada) abrirDeNovo();
      else entrar();
    }
  }

  function esconder() {
    if (!el) return;
    el.hidden = true;
    el.classList.remove("saindo", "fechando");
    document.body.classList.remove("abertura-ativa");
    document.removeEventListener("keydown", teclado);
    el = null;
    indo = false;
    fechada = false;
  }

  /* Entrar: a porta abre, o site aparece — e depois a porta fecha de novo */
  function entrar() {
    if (!el || indo) return;
    indo = true;
    marcarEntrou();
    document.body.classList.remove("abertura-ativa");

    var fimDaAbertura = function () {
      // o site fica visível por um instante e a porta se fecha sobre ele
      setTimeout(fecharDeNovo, reduzido() ? 0 : 1300);
    };

    if (reduzido()) { fimDaAbertura(); return; }

    el.classList.add("saindo");
    setTimeout(fimDaAbertura, 1150);
  }

  /* a porta volta a fechar o site, com o botão "Abrir" */
  function fecharDeNovo() {
    if (!el) return;
    el.classList.remove("saindo");
    el.classList.add("fechando");
    fechada = true;
    document.body.classList.add("abertura-ativa");

    var painel = el.querySelector(".abertura-porta-painel");
    if (painel) painel.classList.add("painel-fechado");
    var btn = document.getElementById("btnEntrarSistema");
    if (btn) {
      btn.textContent = "Abrir";
      btn.setAttribute("aria-label", "Abrir o site");
      try { btn.focus({ preventScroll: true }); } catch (_) { }
    }
    var linha = el.querySelector(".abertura-linha");
    if (linha) linha.style.animation = "none";
    indo = false;
  }

  /* abrir de novo: a porta se abre uma vez mais */
  function abrirDeNovo() {
    if (!el || !fechada) return;
    fechada = false;
    indo = true;
    el.classList.remove("fechando");
    el.classList.add("saindo");
    document.body.classList.remove("abertura-ativa");

    var painel = el.querySelector(".abertura-porta-painel");
    if (painel) painel.classList.remove("painel-fechado");
    var btn = document.getElementById("btnEntrarSistema");
    if (btn) btn.textContent = "Entrar";

    var fim = function () {
      esconder();
      // o campo de título já fica pronto para digitar (só no painel do corretor)
      var t = document.getElementById("f-titulo");
      var p = document.getElementById("painel");
      if (t && p && !p.hidden) {
        try { t.focus({ preventScroll: true }); } catch (_) { }
      }
    };
    if (reduzido()) fim();
    else setTimeout(fim, 1150);
  }

  /* se alguém abrir um link de ficha com a abertura na tela, sai da frente */
  window.addEventListener("hashchange", function () {
    if (temLinkDeFicha() && el && !el.hidden) {
      marcarEntrou();
      esconder();
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
