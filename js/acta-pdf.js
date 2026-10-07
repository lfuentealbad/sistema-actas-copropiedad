/* =====================================================================
 *  EL ACTA COMO PDF DE VERDAD (07-10-2026)
 *
 *  Hasta hoy «Finalizar y guardar como PDF» abría el cuadro de impresión
 *  del navegador y le pedía a la persona elegir «Guardar como PDF». En el
 *  computador se entiende; en el teléfono, y para quien usa poco la
 *  tecnología, es donde más se perdía el trabajo: el último paso.
 *
 *  Este archivo toma el MISMO documento que se imprimía (el HTML que arma
 *  _actaDocumento en acta-1.js) y lo dibuja en un PDF con texto de verdad:
 *  se puede buscar, copiar y firmar electrónicamente. Lo que dice el acta
 *  no cambia; solo cambia cómo se entrega.
 *
 *  Usa jsPDF y jsPDF-AutoTable de vendor/ (ver vendor/PROCEDENCIA.md). Se
 *  cargan recién al finalizar: pesan 450 KB y la mayoría de las visitas no
 *  llega hasta ahí.
 *
 *  Las fuentes son las estándar del PDF (Helvetica), que traen las letras
 *  del castellano. Los pocos signos que no traen (№, →, ✓) se cambian por su
 *  equivalente escrito antes de dibujar.
 * ===================================================================== */
(function (global) {
  'use strict';

  var LIBRERIAS = ['/vendor/jspdf.umd.min.js', '/vendor/jspdf.plugin.autotable.min.js'];

  function cargarScript(src) {
    return new Promise(function (ok, mal) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = function () { ok(); };
      s.onerror = function () { mal(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(s);
    });
  }

  var cargando = null;
  function listas() {
    return !!(global.jspdf && global.jspdf.jsPDF);
  }
  function cargarLibrerias() {
    if (listas() && (typeof global.autoTable === 'function' || global.jspdf.jsPDF.API.autoTable)) return Promise.resolve();
    if (!cargando) {
      cargando = LIBRERIAS.reduce(function (p, r) {
        return p.then(function () { return cargarScript(r); });
      }, Promise.resolve()).catch(function (e) { cargando = null; throw e; });
    }
    return cargando;
  }

  // -------------------------------------------------------------------
  //  Texto: lo que la fuente estándar no trae se escribe con letras
  // -------------------------------------------------------------------
  var CAMBIOS = {
    '№': 'N°',   // №
    '→': '->', '←': '<-', '↑': '', '↓': '',
    '✓': '', '✔': '', '✕': 'x', '✗': 'x',
    '≤': '<=', '≥': '>=', '≠': '!=',
    ' ': ' ', ' ': ' ', ' ': ' ', '​': '', '⁠': '', '﻿': '',
    '−': '-', '‑': '-', '‐': '-'
  };
  // Lo que WinAnsi (la codificación de Helvetica en el PDF) sí trae por
  // encima de Latin-1.
  var WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ' +
    '‘’“”•–—˜™š›œžŸ';

  function limpio(t) {
    var s = String(t == null ? '' : t);
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (Object.prototype.hasOwnProperty.call(CAMBIOS, c)) { out += CAMBIOS[c]; continue; }
      var k = c.charCodeAt(0);
      if (k < 256 || WINANSI_EXTRA.indexOf(c) >= 0) { out += c; continue; }
      // Una letra con un acento raro: la letra sola. Lo demás (emoji, pares
      // sustitutos) se omite.
      var base = c.normalize ? c.normalize('NFD').charAt(0) : '';
      if (base && base.charCodeAt(0) < 256) out += base;
    }
    return out;
  }

  // -------------------------------------------------------------------
  //  Medidas (A4, milímetros) y estilos del documento
  // -------------------------------------------------------------------
  var A4 = { w: 210, h: 297 };
  var M = { izq: 20, der: 20, arr: 20, abajo: 22 };
  var ANCHO = A4.w - M.izq - M.der;
  var PT = 0.3528;          // 1 pt en mm
  var TINTA = [36, 40, 45];
  var GRIS = [92, 97, 104];
  var AZUL = [44, 49, 58];

  function rgb(css) {
    var m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(css || '');
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
    m = /#([0-9a-f]{3}|[0-9a-f]{6})\b/i.exec(css || '');
    if (!m) return null;
    var h = m[1];
    if (h.length === 3) h = h.replace(/(.)/g, '$1$1');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function estilo(el, prop) {
    var st = (el.getAttribute && el.getAttribute('style')) || '';
    var m = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)', 'i').exec(st);
    return m ? m[1].trim() : '';
  }
  function tieneClase(el, c) {
    return !!(el.classList && el.classList.contains(c));
  }

  // -------------------------------------------------------------------
  //  El dibujante
  // -------------------------------------------------------------------
  function Dibujo(jsPDF) {
    this.doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    this.y = M.arr;
    this.marcaAgua = '';
    this.conMarca = {};
  }

  // La marca de agua (DEMOSTRACIÓN, BORRADOR) va DEBAJO del texto: se pinta
  // apenas empieza cada hoja. Pintada al final quedaba encima y tapaba.
  Dibujo.prototype.pintarMarca = function () {
    var pagina = this.doc.getCurrentPageInfo().pageNumber;
    if (!this.marcaAgua || this.conMarca[pagina]) return;
    this.conMarca[pagina] = true;
    this.fuente(true, false, 40);
    this.doc.setTextColor(242, 222, 222);
    this.doc.text(this.marcaAgua, A4.w / 2, A4.h / 2 + 20, { align: 'center', angle: 28 });
  };

  Dibujo.prototype.fuente = function (negrita, cursiva, tam) {
    var estiloF = negrita && cursiva ? 'bolditalic' : negrita ? 'bold' : cursiva ? 'italic' : 'normal';
    this.doc.setFont('helvetica', estiloF);
    this.doc.setFontSize(tam);
  };

  Dibujo.prototype.espacio = function (alto) {
    if (this.y + alto > A4.h - M.abajo) {
      this.doc.addPage();
      this.y = M.arr;
      this.pintarMarca();
      return true;
    }
    return false;
  };

  // Un párrafo: trozos con su estilo, cortados en líneas y, si se pide,
  // justificados (el cuerpo del acta va justificado, como en la pantalla).
  Dibujo.prototype.parrafo = function (trozos, op) {
    op = op || {};
    var tam = op.tam || 10.5;
    var alinear = op.alinear || 'left';
    var alto = tam * PT * (op.interlinea || 1.45);
    var x0 = M.izq + (op.sangria || 0);
    var ancho = (op.ancho || ANCHO) - (op.sangria || 0);
    var color = op.color || TINTA;
    var self = this;

    // Palabras con su estilo. Un salto forzado (<br>) va como palabra vacia
    // con la marca «corte».
    var palabras = [];
    trozos.forEach(function (t) {
      if (t.corte) { palabras.push({ corte: true }); return; }
      var partes = limpio(t.texto).replace(/\s+/g, ' ').split(' ');
      partes.forEach(function (p, i) {
        if (p === '') { if (palabras.length) palabras[palabras.length - 1].espacioDespues = true; return; }
        palabras.push({ t: p, b: !!t.b, i: !!t.i, tam: t.tam || tam, color: t.color || color, espacioAntes: i > 0 });
      });
    });
    // El espacio entre palabras lo decide el texto original.
    for (var k = 1; k < palabras.length; k++) {
      var p = palabras[k], a = palabras[k - 1];
      if (p.corte || a.corte) continue;
      if (!p.espacioAntes && !a.espacioDespues) p.pegada = true;
    }

    var ancho_de = function (w) { self.fuente(w.b, w.i, w.tam); return self.doc.getTextWidth(w.t); };
    var esp = function (w) { self.fuente(w.b, w.i, w.tam); return self.doc.getTextWidth(' '); };

    // Cortar en lineas.
    var lineas = [], actual = [], usado = 0;
    palabras.forEach(function (w) {
      if (w.corte) { lineas.push({ ws: actual, fin: true }); actual = []; usado = 0; return; }
      w.ancho = ancho_de(w);
      var sep = actual.length && !w.pegada ? esp(w) : 0;
      if (actual.length && usado + sep + w.ancho > ancho) {
        lineas.push({ ws: actual, fin: false });
        actual = [w]; usado = w.ancho;
      } else {
        actual.push(w); usado += sep + w.ancho;
      }
    });
    if (actual.length) lineas.push({ ws: actual, fin: true });

    lineas.forEach(function (l) {
      self.espacio(alto);
      var base = self.y + alto * 0.78;
      var ws = l.ws;
      if (!ws.length) { self.y += alto; return; }
      var natural = 0, huecos = 0;
      ws.forEach(function (w, i) {
        natural += w.ancho;
        if (i > 0 && !w.pegada) { natural += esp(w); huecos++; }
      });
      var x = x0, extra = 0;
      if (alinear === 'center') x = x0 + (ancho - natural) / 2;
      else if (alinear === 'right') x = x0 + ancho - natural;
      else if (alinear === 'justify' && !l.fin && huecos > 0) extra = (ancho - natural) / huecos;
      ws.forEach(function (w, i) {
        if (i > 0 && !w.pegada) x += esp(w) + extra;
        self.fuente(w.b, w.i, w.tam);
        self.doc.setTextColor(w.color[0], w.color[1], w.color[2]);
        self.doc.text(w.t, x, base);
        x += w.ancho;
      });
      self.y += alto;
    });
    self.y += op.despues == null ? alto * 0.45 : op.despues;
  };

  // Los trozos de un elemento: negrita, cursiva, chico, saltos.
  function trozosDe(el, heredado) {
    heredado = heredado || {};
    var salida = [];
    el.childNodes.forEach(function (n) {
      if (n.nodeType === 3) {
        if (n.nodeValue) salida.push({ texto: n.nodeValue, b: heredado.b, i: heredado.i, tam: heredado.tam, color: heredado.color });
        return;
      }
      if (n.nodeType !== 1) return;
      var tag = n.tagName.toLowerCase();
      if (tag === 'br') { salida.push({ corte: true }); return; }
      if (tag === 'style' || tag === 'script') return;
      var h = { b: heredado.b, i: heredado.i, tam: heredado.tam, color: heredado.color };
      if (tag === 'strong' || tag === 'b' || /bold|[6-9]00/.test(estilo(n, 'font-weight'))) h.b = true;
      if (tag === 'em' || tag === 'i' || /italic/.test(estilo(n, 'font-style'))) h.i = true;
      if (tag === 'small') h.tam = (heredado.tam || 10.5) * 0.85;
      var fs = estilo(n, 'font-size');
      var mfs = /([\d.]+)\s*(pt|px)/.exec(fs);
      if (mfs) h.tam = mfs[2] === 'pt' ? Number(mfs[1]) : Number(mfs[1]) * 0.75;
      var col = rgb(estilo(n, 'color'));
      if (col) h.color = col;
      var bloque = /block/.test(estilo(n, 'display'));
      if (bloque && salida.length) salida.push({ corte: true });
      salida = salida.concat(trozosDe(n, h));
      if (bloque) salida.push({ corte: true });
    });
    return salida;
  }

  function sinCortesSobrantes(trozos) {
    while (trozos.length && trozos[0].corte) trozos.shift();
    while (trozos.length && trozos[trozos.length - 1].corte) trozos.pop();
    return trozos;
  }

  Dibujo.prototype.tabla = function (tabla) {
    var self = this;
    var celdas = function (tr) {
      return Array.prototype.map.call(tr.children, function (c) {
        return limpio(c.textContent).replace(/\s+/g, ' ').trim();
      });
    };
    var head = Array.prototype.map.call(tabla.querySelectorAll('thead tr'), celdas);
    var filas = tabla.querySelectorAll('tbody tr');
    if (!filas.length) filas = tabla.querySelectorAll('tr');
    var body = Array.prototype.filter.call(filas, function (tr) { return !tr.closest('thead'); }).map(celdas);
    var opciones = {
      head: head, body: body, startY: this.y + 1,
      margin: { left: M.izq, right: M.der, top: M.arr, bottom: M.abajo },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.6, cellPadding: 1.6, textColor: TINTA, lineColor: [215, 214, 206], lineWidth: 0.2, overflow: 'linebreak' },
      headStyles: { fillColor: AZUL, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.8 },
      alternateRowStyles: { fillColor: [244, 244, 240] },
      // Una tabla larga agrega sus propias hojas: también llevan la marca.
      willDrawPage: function () { self.pintarMarca(); }
    };
    if (typeof global.autoTable === 'function') global.autoTable(this.doc, opciones);
    else this.doc.autoTable(opciones);
    var fin = this.doc.lastAutoTable && this.doc.lastAutoTable.finalY;
    this.y = (fin || this.y) + 4;
  };

  Dibujo.prototype.tituloSeccion = function (el) {
    var texto = limpio(el.textContent.replace(/\s+/g, ' ').trim()).toUpperCase();
    this.espacio(14);
    this.y += 2.5;
    this.fuente(true, false, 8.6);
    this.doc.setTextColor(AZUL[0], AZUL[1], AZUL[2]);
    this.doc.text(texto, M.izq, this.y + 3.2);
    this.doc.setDrawColor(AZUL[0], AZUL[1], AZUL[2]);
    this.doc.setLineWidth(0.45);
    this.doc.line(M.izq, this.y + 4.6, M.izq + ANCHO, this.y + 4.6);
    this.y += 7.5;
  };

  Dibujo.prototype.encabezado = function (el) {
    var self = this;
    Array.prototype.forEach.call(el.children, function (h) {
      var texto = limpio(h.textContent.replace(/\s+/g, ' ').trim());
      if (!texto) return;
      if (tieneClase(h, 'acta-title')) {
        self.parrafo([{ texto: texto.toUpperCase(), b: true }], { tam: 14, alinear: 'center', color: AZUL, despues: 1.2 });
      } else if (tieneClase(h, 'acta-subtitle')) {
        self.parrafo([{ texto: texto }], { tam: 10, alinear: 'center', color: GRIS, despues: 0.4 });
      } else {
        self.parrafo([{ texto: texto }], { tam: 9.5, alinear: 'right', color: GRIS, despues: 1 });
      }
    });
    this.y += 1.5;
    this.doc.setDrawColor(AZUL[0], AZUL[1], AZUL[2]);
    this.doc.setLineWidth(0.6);
    this.doc.line(M.izq, this.y, M.izq + ANCHO, this.y);
    this.y += 6;
  };

  // Las firmas: dos por fila, cada una con su línea, y nunca partidas
  // entre dos hojas.
  Dibujo.prototype.firmas = function (el) {
    var self = this;
    var bloques = Array.prototype.filter.call(el.children, function (c) { return c.nodeType === 1; });
    var col = (ANCHO - 12) / 2;
    for (var i = 0; i < bloques.length; i += 2) {
      var par = bloques.slice(i, i + 2);
      var lineasDe = function (b) {
        return sinCortesSobrantes(trozosDe(b)).reduce(function (acc, t) {
          if (t.corte) acc.push([]); else acc[acc.length - 1].push(t);
          return acc;
        }, [[]]).filter(function (l) { return l.length && l.some(function (t) { return String(t.texto || '').trim(); }); });
      };
      var contenidos = par.map(lineasDe);
      var maxLineas = Math.max.apply(null, contenidos.map(function (c) { return c.length; }));
      var alto = 18 + maxLineas * 4.6;
      if (this.espacio(alto)) { /* nueva hoja */ }
      var yLinea = this.y + 16;
      par.forEach(function (b, j) {
        var x = M.izq + j * (col + 12);
        self.doc.setDrawColor(36, 40, 45);
        self.doc.setLineWidth(0.3);
        self.doc.line(x, yLinea, x + col, yLinea);
        var yy = yLinea + 4.6;
        contenidos[j].forEach(function (l, k) {
          var texto = limpio(l.map(function (t) { return t.texto; }).join('').replace(/\s+/g, ' ').trim());
          self.fuente(k === 0, false, k === 0 ? 9.8 : 8.6);
          self.doc.setTextColor(k === 0 ? TINTA[0] : GRIS[0], k === 0 ? TINTA[1] : GRIS[1], k === 0 ? TINTA[2] : GRIS[2]);
          var partes = self.doc.splitTextToSize(texto, col);
          partes.forEach(function (pt) {
            self.doc.text(pt, x + col / 2, yy, { align: 'center' });
            yy += 4.2;
          });
        });
      });
      this.y += alto;
    }
    this.y += 3;
  };

  // Un aviso con fondo de color (el de demostración, por ejemplo).
  Dibujo.prototype.cartel = function (el, fondo) {
    var trozos = sinCortesSobrantes(trozosDe(el, { color: [255, 255, 255] }));
    var claro = (fondo[0] * 299 + fondo[1] * 587 + fondo[2] * 114) / 1000 > 150;
    if (claro) trozos.forEach(function (t) { if (!t.corte && t.color && t.color.join() === '255,255,255') t.color = TINTA; });
    // jsPDF no dibuja detrás de lo ya escrito: el alto se mide antes, con
    // una pasada en seco sobre otro documento, y recién entonces va el
    // fondo y encima el texto.
    var op = { tam: 10, sangria: 4, ancho: ANCHO - 4, despues: 0 };
    var prueba = new Dibujo(global.jspdf.jsPDF);
    prueba.y = 0;
    prueba.parrafo(trozos, op);
    var alto = prueba.y + 8;
    this.espacio(alto);
    var y0 = this.y;
    this.doc.setFillColor(fondo[0], fondo[1], fondo[2]);
    this.doc.roundedRect(M.izq, y0, ANCHO, alto, 1.5, 1.5, 'F');
    this.y = y0 + 4;
    this.parrafo(trozos, op);
    this.y = y0 + alto + 5;
  };

  Dibujo.prototype.bloque = function (el, dentroDeSeccion) {
    var self = this;
    if (el.nodeType === 3) {
      var t = el.nodeValue.replace(/\s+/g, ' ').trim();
      if (t) this.parrafo([{ texto: t }], { alinear: dentroDeSeccion ? 'justify' : 'left' });
      return;
    }
    if (el.nodeType !== 1) return;
    var tag = el.tagName.toLowerCase();
    if (tag === 'style' || tag === 'script' || tag === 'title' || tag === 'meta') return;

    var pos = estilo(el, 'position');
    if (/fixed|absolute/.test(pos)) return;   // la marca de agua: ver construir()
    if (tieneClase(el, 'acta-header-preview')) { this.encabezado(el); return; }
    if (tieneClase(el, 'acta-section-title')) { this.tituloSeccion(el); return; }
    if (tieneClase(el, 'acta-signatures')) { this.firmas(el); return; }
    if (tag === 'table') { this.tabla(el); return; }
    if (/^h[1-6]$/.test(tag)) {
      this.espacio(12);
      this.parrafo(sinCortesSobrantes(trozosDe(el, { b: true })), { tam: tag === 'h1' ? 14 : tag === 'h2' ? 12.5 : 11, color: AZUL, despues: 1.5 });
      return;
    }
    var fondo = rgb(estilo(el, 'background') || estilo(el, 'background-color'));
    if (fondo && tag === 'div' && el.textContent.trim()) { this.cartel(el, fondo); return; }
    if (tag === 'ul' || tag === 'ol') {
      Array.prototype.forEach.call(el.children, function (li, i) {
        var marca = tag === 'ol' ? (i + 1) + '. ' : '• ';
        self.parrafo([{ texto: marca }].concat(sinCortesSobrantes(trozosDe(li))), { sangria: 4, despues: 0.8 });
      });
      this.y += 1.5;
      return;
    }
    if (tag === 'p') {
      var al = estilo(el, 'text-align');
      var alinear = al === 'center' ? 'center' : al === 'right' ? 'right' : (dentroDeSeccion ? 'justify' : 'left');
      var tam = /([\d.]+)\s*px/.exec(estilo(el, 'font-size'));
      var trozos = sinCortesSobrantes(trozosDe(el, {}));
      if (!trozos.length) return;
      if (/border-top/.test(el.getAttribute('style') || '')) {
        this.espacio(20);
        this.y += 3;
        this.doc.setDrawColor(221, 221, 221);
        this.doc.setLineWidth(0.25);
        this.doc.line(M.izq, this.y, M.izq + ANCHO, this.y);
        this.y += 3;
      }
      var mt = /([\d.]+)px/.exec(estilo(el, 'margin-top'));
      if (mt && Number(mt[1]) >= 20) this.y += 3;
      this.parrafo(trozos, { alinear: alinear, tam: tam ? Number(tam[1]) * 0.75 + 1.5 : 10.5 });
      return;
    }
    // Contenedores: se recorre lo que traen.
    var esSeccion = dentroDeSeccion || tieneClase(el, 'acta-section');
    if (tieneClase(el, 'acta-section')) this.y += 1;
    var suelto = [];
    var vaciar = function () {
      var tr = sinCortesSobrantes(suelto);
      suelto = [];
      if (tr.length && tr.some(function (t) { return !t.corte && String(t.texto).trim(); })) {
        self.parrafo(tr, { alinear: esSeccion ? 'justify' : 'left' });
      }
    };
    el.childNodes.forEach(function (n) {
      var enLinea = n.nodeType === 3 || (n.nodeType === 1 && /^(strong|b|em|i|span|small|a|br|code)$/.test(n.tagName.toLowerCase()) && !/block/.test(estilo(n, 'display')));
      if (enLinea) {
        var tmp = document.createElement('div');
        tmp.appendChild(n.cloneNode(true));
        suelto = suelto.concat(trozosDe(tmp));
        return;
      }
      vaciar();
      self.bloque(n, esSeccion);
    });
    vaciar();
  };

  // Pie de cada hoja y marca de agua, una vez que se sabe cuántas hay.
  Dibujo.prototype.cerrar = function (pie) {
    var total = this.doc.getNumberOfPages();
    for (var p = 1; p <= total; p++) {
      this.doc.setPage(p);
      this.fuente(false, false, 7.5);
      this.doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]);
      if (pie) this.doc.text(limpio(pie), M.izq, A4.h - 10);
      this.doc.text('Página ' + p + ' de ' + total, A4.w - M.der, A4.h - 10, { align: 'right' });
    }
  };

  // -------------------------------------------------------------------
  //  Lo que usa el resto del sitio
  // -------------------------------------------------------------------
  // html: el documento completo; nombre: sin extensión; op.pie: el texto
  // que va abajo en cada hoja. Devuelve una promesa con el nombre del
  // archivo que se descargó.
  function construir(html, op) {
    op = op || {};
    var hoja = new DOMParser().parseFromString(String(html || ''), 'text/html');
    var d = new Dibujo(global.jspdf.jsPDF);
    d.doc.setProperties({ title: limpio(op.titulo || op.nombre || 'Acta'), creator: 'actaviva · actascopropiedad.cl' });
    // La marca de agua se conoce antes de empezar, para pintarla debajo.
    var marca = Array.prototype.filter.call(hoja.body.querySelectorAll('[style]'), function (e) {
      return /position\s*:\s*(fixed|absolute)/i.test(e.getAttribute('style')) && e.textContent.trim();
    })[0];
    if (marca) d.marcaAgua = limpio(marca.textContent.replace(/\s+/g, ' ').trim());
    d.pintarMarca();
    Array.prototype.forEach.call(hoja.body.childNodes, function (n) { d.bloque(n, false); });
    d.cerrar(op.pie || '');
    return d.doc;
  }

  function descargar(html, nombre, op) {
    op = op || {};
    return cargarLibrerias().then(function () {
      var doc = construir(html, { nombre: nombre, titulo: op.titulo, pie: op.pie });
      var archivo = String(nombre || 'acta').replace(/[\\/:*?"<>|]+/g, '_') + '.pdf';
      doc.save(archivo);
      return archivo;
    });
  }

  global.ActaPDF = { descargar: descargar, construir: construir, limpio: limpio, cargarLibrerias: cargarLibrerias };
})(typeof window !== 'undefined' ? window : globalThis);
