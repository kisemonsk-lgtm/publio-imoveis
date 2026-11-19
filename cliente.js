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
  var finalidadeAtual = "";
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
        telefone: l.telefone || "",
          telefone: l.telefone || "",
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
    if (finalidadeAtual && (im.finalidade || "") !== finalidadeAtual) return false;
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
    pintarContato(im);
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

  /* Deixa o telefone só com números, no formato que o WhatsApp espera */
  function numeroWhats(tel) {
    var d = String(tel || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.length <= 11) d = "55" + d;       // Brasil por padrão
    return d;
  }

  function pintarContato(im) {
    var caixa = $("#casaModalContato");
    if (!caixa) return;
    var tel = (im && im.telefone || "").trim();
    var num = numeroWhats(tel);
    if (!num) { caixa.hidden = true; return; }
    caixa.hidden = false;
    var wa = $("#btnWhatsCasa");
    var ligar = $("#btnLigarCasa");
    var msg = "Olá! Vi o imóvel \"" + (im.titulo || "") + "\" no Públio Imóveis e gostaria de mais informações.";
    if (wa) wa.href = "https://wa.me/" + num + "?text=" + encodeURIComponent(msg);
    if (ligar) ligar.href = "tel:+" + num;
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
      var camadaZ = $("#zoomCamada");
      if (camadaZ && !camadaZ.hidden) { zoomEscala = 1; zoomX = 0; zoomY = 0; $("#zoomImagem").src = fotos[fotoAtiva]; aplicarZoom(false); }
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

  /* ================= ZOOM DA FOTO ================= */
  var zoomEscala = 1, zoomX = 0, zoomY = 0;

  function aplicarZoom(animar) {
    var img = $("#zoomImagem");
    if (!img) return;
    var camada = $("#zoomCamada");
    if (animar) {
      img.classList.add("animando");
      setTimeout(function () { img.classList.remove("animando"); }, 220);
    } else {
      img.classList.remove("animando");
    }
    img.style.transform = "translate3d(" + zoomX + "px," + zoomY + "px,0) scale(" + zoomEscala + ")";
    if (camada && zoomEscala > 1.01 && !animar) camada.classList.add("mexeu");
  }

  function limitarDeslocamento() {
    var camada = $("#zoomCamada");
    var img = $("#zoomImagem");
    if (!camada || !img) return;
    var lw = camada.clientWidth, lh = camada.clientHeight;
    var iw = img.clientWidth * zoomEscala, ih = img.clientHeight * zoomEscala;
    var maxX = Math.max(0, (iw - lw) / 2);
    var maxY = Math.max(0, (ih - lh) / 2);
    if (zoomX > maxX) zoomX = maxX;
    if (zoomX < -maxX) zoomX = -maxX;
    if (zoomY > maxY) zoomY = maxY;
    if (zoomY < -maxY) zoomY = -maxY;
  }

  function abrirZoom() {
    if (!casaAberta) return;
    var fotos = imagensDe(casaAberta);
    if (!fotos.length) return;
    var camada = $("#zoomCamada");
    var img = $("#zoomImagem");
    if (!camada || !img) return;
    zoomEscala = 1; zoomX = 0; zoomY = 0;
    img.src = fotos[fotoAtiva];
    camada.classList.remove("mexeu");
    camada.hidden = false;
    aplicarZoom(false);
  }

  function fecharZoom() {
    var camada = $("#zoomCamada");
    if (camada) camada.hidden = true;
    zoomEscala = 1; zoomX = 0; zoomY = 0;
  }

  function ligarZoom() {
    var camada = $("#zoomCamada");
    var img = $("#zoomImagem");
    var fecharZ = $("#zoomFechar");
    if (!camada || !img) return;
    if (fecharZ) fecharZ.addEventListener("click", fecharZoom);

    var toques = {}, iniciou = {}, escalaInicial = 1, distInicial = 0, moveu = false;

    function distancia(t) {
      var a = t[0], b = t[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }

    camada.addEventListener("touchstart", function (ev) {
      if (ev.touches.length === 2) {
        distInicial = distancia(ev.touches);
        escalaInicial = zoomEscala;
        moveu = true;
      } else if (ev.touches.length === 1) {
        toques.x = ev.touches[0].clientX;
        toques.y = ev.touches[0].clientY;
        iniciou.x = zoomX; iniciou.y = zoomY;
        moveu = false;
      }
    }, { passive: true });

    camada.addEventListener("touchmove", function (ev) {
      if (ev.touches.length === 2) {
        var d = distancia(ev.touches);
        if (distInicial > 0) {
          zoomEscala = Math.min(5, Math.max(1, escalaInicial * (d / distInicial)));
          limitarDeslocamento();
          aplicarZoom(false);
        }
        ev.preventDefault();
      } else if (ev.touches.length === 1 && zoomEscala > 1) {
        var dx = ev.touches[0].clientX - toques.x;
        var dy = ev.touches[0].clientY - toques.y;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moveu = true;
        zoomX = iniciou.x + dx;
        zoomY = iniciou.y + dy;
        limitarDeslocamento();
        aplicarZoom(false);
        ev.preventDefault();
      }
    }, { passive: false });

    camada.addEventListener("touchend", function (ev) {
      if (zoomEscala <= 1.02) {
        zoomEscala = 1; zoomX = 0; zoomY = 0;
        aplicarZoom(true);
      }
      // toque simples (sem arrastar) em zoom 1x: amplia no ponto tocado
      if (!moveu && ev.changedTouches.length === 1 && zoomEscala <= 1.02 && !ev.touches.length) {
        var cx = ev.changedTouches[0].clientX, cy = ev.changedTouches[0].clientY;
        var r = camada.getBoundingClientRect();
        var px = (cx - r.left - r.width / 2);
        var py = (cy - r.top - r.height / 2);
        zoomEscala = 2.2;
        zoomX = -px * 1.2;
        zoomY = -py * 1.2;
        limitarDeslocamento();
        aplicarZoom(true);
      }
    }, { passive: true });

    // roda do mouse / trackpad (computador)
    camada.addEventListener("wheel", function (ev) {
      ev.preventDefault();
      zoomEscala = Math.min(5, Math.max(1, zoomEscala * (ev.deltaY < 0 ? 1.12 : 0.9)));
      if (zoomEscala <= 1.01) { zoomX = 0; zoomY = 0; }
      limitarDeslocamento();
      aplicarZoom(false);
    }, { passive: false });

    camada.addEventListener("dblclick", function (ev) {
      ev.preventDefault();
      if (zoomEscala > 1.05) { zoomEscala = 1; zoomX = 0; zoomY = 0; }
      else { zoomEscala = 2.2; limitarDeslocamento(); }
      aplicarZoom(true);
    });
  }

  function fecharCasa() {
    fecharZoom();
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

    var chipsFin = document.querySelectorAll("#finalidadesCliente .chip");
    for (var f = 0; f < chipsFin.length; f++) {
      chipsFin[f].addEventListener("click", function (ev) {
        var b = ev.currentTarget;
        finalidadeAtual = b.dataset.finalidade || "";
        for (var j = 0; j < chipsFin.length; j++) chipsFin[j].classList.toggle("ativo", chipsFin[j] === b);
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

    ligarZoom();

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

    // abrir o zoom tocando na foto
    var btnZoom = $("#btnZoomCasa");
    if (btnZoom) btnZoom.addEventListener("click", function (ev) { ev.stopPropagation(); abrirZoom(); });
    var palco0 = $("#casaModalPalco");
    if (palco0) {
      palco0.addEventListener("click", function (ev) {
        var alvo = ev.target;
        if (alvo && (alvo.closest("button") || alvo.classList.contains("casa-modal-contador"))) return;
        if (ev.target && ev.target.closest("#casaModalSemFoto")) return;
        abrirZoom();
      });
    }

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
      if (ev.key === "Escape") {
        var camadaZ = $("#zoomCamada");
        if (camadaZ && !camadaZ.hidden) { fecharZoom(); return; }
        fecharCasa();
      }
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
