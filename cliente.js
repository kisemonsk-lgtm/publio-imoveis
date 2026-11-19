/* ==========================================================
   ÁREA DO CLIENTE — só as casas, nada mais
   ----------------------------------------------------------
   É uma página separada (publio-cliente.html). Ela NÃO usa o app do
   corretor: fala direto com a nuvem (Supabase) e só consegue
   LER. Não existe aqui cadastro, edição, exclusão, área do
   corretor nem nada de administração.
   Se a nuvem não estiver configurada, mostra uma mensagem
   amigável em vez de quebrar.
   ========================================================== */
(function () {
  "use strict";

  var SUPABASE = {
    url: "https://mefhqkjrszvrjztqdlqe.supabase.co",
    chave: "sb_publishable_Y_WmSLQXSke0v2O9P8swgw_9uS5tt_P",
    tabela: "imoveis"
  };
  var CAMPOS = "id,titulo,tipo,finalidade,preco,local,descricao,imagem,imagens,criadoEm,atualizadoEm";
  var INTERVALO = 60000;      // busca novidades na nuvem a cada 1 minuto

  var imoveis = [];
  var filtro = "";
  var tipoAtual = "";
  var buscando = false;

  /* ---------------- utilidades ---------------- */
  function $(sel) { return document.querySelector(sel); }
  function escapar(t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function fmtPreco(valor) {
    var t = String(valor || "").trim();
    if (!t) return "";
    var num = Number(t.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
    if (!isFinite(num) || num <= 0) return t;
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  }
  function imagensDe(im) {
    if (!im) return [];
    if (Array.isArray(im.imagens) && im.imagens.length) return im.imagens.filter(Boolean);
    return im.imagem ? [im.imagem] : [];
  }
  function nuvemAtiva() { return !!(SUPABASE.url && SUPABASE.chave); }
  function sbHeaders() {
    return {
      "apikey": SUPABASE.chave,
      "Authorization": "Bearer " + SUPABASE.chave,
      "Content-Type": "application/json"
    };
  }
  function sbUrl(caminho) { return SUPABASE.url.replace(/\/$/, "") + "/rest/v1/" + caminho; }

  /* ---------------- leitura (só GET) ---------------- */
  var CAMPOS_BASE = "id,titulo,tipo,finalidade,preco,local,descricao,imagem,imagens,criadoEm,atualizadoEm";
  var temColunaVideos = null;

  function lerImoveis() {
    var campos = temColunaVideos === false ? CAMPOS_BASE : (CAMPOS + ",videos");
    var url = sbUrl(SUPABASE.tabela + "?select=" + campos + "&limit=500");
    return fetch(url, { headers: sbHeaders(), cache: "no-store" }).then(function (r) {
      if (r.status === 400 && temColunaVideos !== false) {
        // banco ainda sem a coluna dos vídeos: lê sem ela em vez de ficar sem conexão
        temColunaVideos = false;
        return fetch(sbUrl(SUPABASE.tabela + "?select=" + CAMPOS_BASE + "&limit=500"),
          { headers: sbHeaders(), cache: "no-store" });
      }
      if (r.ok) temColunaVideos = true;
      if (!r.ok) throw new Error("servidor respondeu " + r.status);
      return r;
    }).then(function (r) {
      if (!r.ok) throw new Error("servidor respondeu " + r.status);
      return r.json();
    }).then(function (linhas) {
      return (linhas || []).map(function (l) {
        return {
          id: String(l.id),
          titulo: l.titulo || "",
          tipo: l.tipo || "",
          finalidade: l.finalidade || "",
          preco: l.preco || "",
          local: l.local || "",
          descricao: l.descricao || "",
          imagem: l.imagem || "",
          imagens: Array.isArray(l.imagens) ? l.imagens.filter(Boolean) : (l.imagem ? [l.imagem] : []),
          videos: Array.isArray(l.videos) ? l.videos.filter(Boolean) : [],
          criadoEm: Number(l.criadoEm) || 0,
          atualizadoEm: Number(l.atualizadoEm) || 0
        };
      });
    });
  }

  /* imóveis que o corretor apagou não aparecem para o cliente */
  function lerApagados() {
    var url = sbUrl("imoveis_apagados?select=id&limit=1000");
    return fetch(url, { headers: sbHeaders(), cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (linhas) { return (linhas || []).map(function (l) { return String(l.id); }); })
      .catch(function () { return []; });
  }

  function carregar(mostrarCarregando) {
    if (buscando) return Promise.resolve();
    buscando = true;
    if (mostrarCarregando) mostrarAviso("carregando", "Buscando os imóveis...");

    if (!nuvemAtiva()) {
      buscando = false;
      imoveis = [];
      renderizar();
      mostrarAviso("erro", "A lista de imóveis ainda não foi ligada. Fale com o corretor.");
      return Promise.resolve();
    }

    return Promise.all([lerImoveis(), lerApagados()])
      .then(function (res) {
        var apagados = {};
        res[1].forEach(function (id) { apagados[id] = true; });
        imoveis = res[0].filter(function (im) { return !apagados[im.id]; });
        esconderAviso();
        renderizar();
      })
      .catch(function (e) {
        if (!imoveis.length) {
          mostrarAviso("erro", "Não consegui carregar os imóveis agora. Verifique a internet e toque em tentar de novo.");
        } else {
          mostrarAviso("offline", "Sem conexão com a nuvem — mostrando a última lista carregada.");
        }
      })
      .then(function () { buscando = false; });
  }

  /* ---------------- tela ---------------- */
  function mostrarAviso(tipo, texto) {
    var caixa = $("#avisoCliente");
    if (!caixa) return;
    caixa.hidden = false;
    caixa.className = "cliente-aviso " + (tipo || "");
    caixa.innerHTML = '<span>' + escapar(texto) + "</span>" +
      (tipo === "erro" ? '<button type="button" class="btn btn-neutro btn-mini" id="btnTentarDeNovo">↻ Tentar de novo</button>' : "");
    var b = document.getElementById("btnTentarDeNovo");
    if (b) b.addEventListener("click", function () { carregar(true); });
  }
  function esconderAviso() {
    var caixa = $("#avisoCliente");
    if (caixa) { caixa.hidden = true; caixa.innerHTML = ""; }
  }

  function passaNoFiltro(im) {
    if (tipoAtual && (im.tipo || "") !== tipoAtual) return false;
    if (!filtro) return true;
    var alvo = [im.titulo, im.local, im.tipo, im.finalidade, im.descricao].join(" ").toLowerCase();
    return alvo.indexOf(filtro) !== -1;
  }

  function cardHTML(im) {
    var fotos = imagensDe(im);
    var capa = fotos[0] || "";
    var info = [im.tipo, im.finalidade].filter(Boolean).join(" • ");
    var desc = (im.descricao || "").replace(/\s+/g, " ").trim();
    if (desc.length > 150) desc = desc.slice(0, 150).replace(/\s+\S*$/, "") + "…";
    return '' +
      '<article class="casa" data-id="' + escapar(im.id) + '" tabindex="0" role="button" ' +
        'aria-label="Ver ' + escapar(im.titulo || "imóvel") + '">' +
        '<div class="casa-foto">' +
          (capa
            ? '<img src="' + escapar(capa) + '" alt="' + escapar(im.titulo || "Imóvel") + '" loading="lazy" />'
            : '<div class="casa-sem-foto">sem foto</div>') +
          (fotos.length > 1 ? '<span class="casa-fotos">' + fotos.length + ' fotos</span>' : '') +
          (info ? '<span class="casa-selo">' + escapar(info) + '</span>' : '') +
        '</div>' +
        '<div class="casa-corpo">' +
          '<h3>' + escapar(im.titulo || "Imóvel") + '</h3>' +
          (im.local ? '<p class="casa-local">📍 ' + escapar(im.local) + '</p>' : '') +
          (im.preco ? '<p class="casa-preco">' + escapar(fmtPreco(im.preco)) + '</p>' : '') +
          (desc ? '<p class="casa-desc">' + escapar(desc) + '</p>' : '') +
        '</div>' +
      '</article>';
  }

  function renderizar() {
    var grade = $("#gradeCasas");
    var vazio = $("#casasVazio");
    if (!grade) return;

    var lista = imoveis.filter(passaNoFiltro).sort(function (a, b) {
      return (b.criadoEm || 0) - (a.criadoEm || 0);
    });

    grade.innerHTML = lista.map(cardHTML).join("");
    if (vazio) {
      vazio.hidden = lista.length > 0;
      vazio.textContent = imoveis.length
        ? "Nenhum imóvel encontrado com esse filtro."
        : "Ainda não há imóveis publicados. Volte em breve.";
    }
    var cont = $("#contadorCasas");
    if (cont) {
      cont.textContent = lista.length === 1 ? "1 imóvel disponível" : lista.length + " imóveis disponíveis";
      cont.hidden = !imoveis.length;
    }
  }

  /* ---------------- abrir a casa (foto grande + descrição) ---------------- */
  var casaAberta = null;
  var fotoAtiva = 0;

  function abrirCasa(id) {
    var im = imoveis.filter(function (x) { return x.id === id; })[0];
    if (!im) return;
    casaAberta = im;
    fotoAtiva = 0;

    var fotos = imagensDe(im);
    var modal = $("#casaModal");
    if (!modal) return;

    $("#casaModalTitulo").textContent = im.titulo || "Imóvel";
    $("#casaModalLocal").textContent = im.local || "";
    $("#casaModalEtiqueta").textContent = [im.tipo, im.finalidade].filter(Boolean).join(" • ");
    $("#casaModalPreco").textContent = im.preco ? fmtPreco(im.preco) : "";
    $("#casaModalDescricao").textContent = im.descricao || "";
    $("#casaModalDescricao").hidden = !im.descricao;

    var boxVideos = $("#casaModalVideos");
    var vids = Array.isArray(im.videos) ? im.videos.filter(Boolean) : [];
    if (boxVideos) {
      boxVideos.innerHTML = vids.map(function (u) {
        return '<video class="casa-video" controls preload="metadata" playsinline src="' + escapar(u) + '"></video>';
      }).join("");
      boxVideos.hidden = !vids.length;
    }

    var mini = $("#casaModalMiniaturas");
    mini.innerHTML = fotos.length > 1
      ? fotos.map(function (f, i) {
          return '<button type="button" class="mini-foto' + (i === 0 ? " ativa" : "") + '" data-foto="' + i + '">' +
                 '<img src="' + escapar(f) + '" alt="Foto ' + (i + 1) + '" loading="lazy" /></button>';
        }).join("")
      : "";
    mini.hidden = fotos.length <= 1;

    pintarFoto(0);
    modal.hidden = false;
    document.body.classList.add("casa-aberta");
    try { $("#casaModalFechar").focus({ preventScroll: true }); } catch (_) {}
  }

  function pintarFoto(i) {
    if (!casaAberta) return;
    var fotos = imagensDe(casaAberta);
    if (!fotos.length) {
      $("#casaModalImagem").removeAttribute("src");
      $("#casaModalImagem").hidden = true;
      $("#casaModalSemFoto").hidden = false;
    } else {
      fotoAtiva = (i + fotos.length) % fotos.length;
      var img = $("#casaModalImagem");
      img.hidden = false;
      img.src = fotos[fotoAtiva];
      $("#casaModalSemFoto").hidden = true;
      preencherVizinhas(fotos);
    }
    var total = fotos.length;
    $("#setaEsqCasa").hidden = total <= 1;
    $("#setaDirCasa").hidden = total <= 1;
    var cont = $("#casaModalContador");
    cont.hidden = total <= 1;
    cont.textContent = (fotoAtiva + 1) + " / " + total;
    var minis = document.querySelectorAll("#casaModalMiniaturas .mini-foto");
    for (var k = 0; k < minis.length; k++) {
      minis[k].classList.toggle("ativa", Number(minis[k].dataset.foto) === fotoAtiva);
    }
  }

  /* Coloca a foto anterior e a próxima nas laterais do trilho */
  function preencherVizinhas(fotos) {
    var prev = $("#casaSlidePrev");
    var next = $("#casaSlideNext");
    var total = fotos.length;
    if (!prev || !next) return;
    if (total > 1) {
      prev.hidden = false; next.hidden = false;
      prev.src = fotos[(fotoAtiva - 1 + total) % total];
      next.src = fotos[(fotoAtiva + 1) % total];
    } else {
      prev.hidden = true; next.hidden = true;
      prev.removeAttribute("src"); next.removeAttribute("src");
    }
    centralizarTrilho(false);
  }

  function centralizarTrilho(animar) {
    var trilho = $("#casaTrilho");
    if (!trilho) return;
    if (animar) {
      trilho.classList.add("animando");
      setTimeout(function () { trilho.classList.remove("animando"); }, 300);
    } else {
      trilho.classList.remove("animando");
    }
    trilho.style.transform = "translate3d(-100%, 0, 0)";
  }

  /* Troca de foto com o trilho deslizando (usada pelas setas e pelas miniaturas) */
  function deslizarPara(i) {
    var trilho = $("#casaTrilho");
    if (!trilho) { pintarFoto(i); return; }
    trilho.classList.add("animando");
    trilho.style.transform = "translate3d(-200%, 0, 0)";
    setTimeout(function () {
      trilho.classList.remove("animando");
      pintarFoto(i);
    }, 280);
  }

  function fecharCasa() {
    var modal = $("#casaModal");
    if (modal) modal.hidden = true;
    document.body.classList.remove("casa-aberta");
    casaAberta = null;
    var img = $("#casaModalImagem");
    if (img) img.removeAttribute("src");
    var bv = $("#casaModalVideos");
    if (bv) {
      var vs = bv.querySelectorAll("video");
      for (var i = 0; i < vs.length; i++) { try { vs[i].pause(); } catch (_) {} }
      bv.innerHTML = "";
    }
  }

  /* ---------------- ligações ---------------- */
  function ligar() {
    var grade = $("#gradeCasas");
    if (grade) {
      grade.addEventListener("click", function (ev) {
        var card = ev.target.closest(".casa");
        if (card) abrirCasa(card.dataset.id);
      });
      grade.addEventListener("keydown", function (ev) {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        var card = ev.target.closest(".casa");
        if (card) { ev.preventDefault(); abrirCasa(card.dataset.id); }
      });
    }

    var busca = $("#buscaCliente");
    if (busca) {
      busca.addEventListener("input", function (ev) {
        filtro = ev.target.value.trim().toLowerCase();
        renderizar();
      });
    }

    var chips = document.querySelectorAll("#tiposCliente .chip");
    for (var i = 0; i < chips.length; i++) {
      chips[i].addEventListener("click", function (ev) {
        var b = ev.currentTarget;
        tipoAtual = b.dataset.tipo || "";
        for (var j = 0; j < chips.length; j++) chips[j].classList.toggle("ativo", chips[j] === b);
        renderizar();
      });
    }

    var btnAtualizar = $("#btnAtualizarCliente");
    if (btnAtualizar) btnAtualizar.addEventListener("click", function () {
      btnAtualizar.classList.add("girando");
      carregar(true).then(function () { btnAtualizar.classList.remove("girando"); });
    });

    var fechar = $("#casaModalFechar");
    if (fechar) fechar.addEventListener("click", fecharCasa);
    var fundo = $("#casaModal");
    if (fundo) fundo.addEventListener("click", function (ev) {
      if (ev.target === fundo) fecharCasa();
    });
    var esq = $("#setaEsqCasa");
    if (esq) esq.addEventListener("click", function (ev) { ev.stopPropagation(); deslizarPara(fotoAtiva - 1); });
    var dir = $("#setaDirCasa");
    if (dir) dir.addEventListener("click", function (ev) { ev.stopPropagation(); deslizarPara(fotoAtiva + 1); });
    var mini = $("#casaModalMiniaturas");
    if (mini) mini.addEventListener("click", function (ev) {
      var b = ev.target.closest(".mini-foto");
      if (b) pintarFoto(Number(b.dataset.foto));
    });

    // arrastar a foto no celular: a imagem acompanha o dedo
    var palco = $("#casaModalPalco");
    var trilho = $("#casaTrilho");
    if (palco && trilho) {
      var x0 = null, y0 = null, dx = 0, largura = 1, arrastando = false;

      palco.addEventListener("touchstart", function (ev) {
        if (ev.touches.length !== 1) return;
        var fotos = casaAberta ? imagensDe(casaAberta) : [];
        if (fotos.length <= 1) return;
        x0 = ev.touches[0].clientX;
        y0 = ev.touches[0].clientY;
        dx = 0;
        arrastando = false;
        largura = palco.clientWidth || 1;
        trilho.classList.remove("animando");
      }, { passive: true });

      palco.addEventListener("touchmove", function (ev) {
        if (x0 === null) return;
        dx = ev.touches[0].clientX - x0;
        var dy = ev.touches[0].clientY - (y0 || 0);

        // se o dedo está indo mais para cima/baixo, solta o trilho (rolagem normal)
        if (!arrastando && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) { x0 = null; return; }
        if (Math.abs(dx) > 6) arrastando = true;

        // nas pontas segura com resistência (parece que não tem mais foto)
        var limite = largura;
        var pos = dx;
        if ((fotoAtiva === 0 && dx > 0) || (fotoAtiva === imagensDe(casaAberta).length - 1 && dx < 0)) {
          pos = dx * 0.32;
        }
        trilho.style.transform = "translate3d(calc(-100% + " + pos.toFixed(1) + "px), 0, 0)";
      }, { passive: true });

      function soltar(ev) {
        if (x0 === null) return;
        var total = casaAberta ? imagensDe(casaAberta).length : 0;
        var limiteTroca = Math.min(70, largura * 0.2);
        var deveTrocar = Math.abs(dx) > limiteTroca && arrastando;
        x0 = null;

        if (deveTrocar && total > 1) {
          deslizarPara(fotoAtiva + (dx < 0 ? 1 : -1));
        } else {
          centralizarTrilho(true);   // volta para o lugar
        }
        dx = 0; arrastando = false;
      }

      palco.addEventListener("touchend", soltar, { passive: true });
      palco.addEventListener("touchcancel", soltar, { passive: true });
    }

    document.addEventListener("keydown", function (ev) {
      if (!casaAberta) return;
      if (ev.key === "Escape") fecharCasa();
      if (ev.key === "ArrowLeft") pintarFoto(fotoAtiva - 1);
      if (ev.key === "ArrowRight") pintarFoto(fotoAtiva + 1);
    });

    // ao voltar para a aba, busca novidades
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) carregar(false);
    });
  }

  function iniciar() {
    ligar();
    carregar(true);
    setInterval(function () { if (!document.hidden && !casaAberta) carregar(false); }, INTERVALO);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
