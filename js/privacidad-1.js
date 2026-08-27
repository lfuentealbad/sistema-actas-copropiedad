(function(){
  'use strict';
  var secciones = [].slice.call(document.querySelectorAll('#preguntas .q'));

  /* ---- índice, construido desde las propias preguntas ---- */
  function pintarIndice(destino){
    var ol = document.getElementById(destino);
    if(!ol) return;
    secciones.forEach(function(s){
      var li = document.createElement('li');
      var a  = document.createElement('a');
      a.href = '#' + s.id;
      a.textContent = s.querySelector('h2').textContent.replace(/^¿|\?$/g, '');
      li.appendChild(a); ol.appendChild(li);
    });
  }
  pintarIndice('ix-esc');
  pintarIndice('ix-mov');

  /* al elegir del índice móvil, se cierra solo */
  var movil = document.querySelector('.indice-movil');
  if(movil){
    movil.addEventListener('click', function(e){
      if(e.target.tagName === 'A') movil.removeAttribute('open');
    });
  }

  /* ---- marcar en qué pregunta va el lector ---- */
  var enlaces = {};
  function marcar(id){
    for(var k in enlaces) enlaces[k].classList.remove('act');
    if(enlaces[id]) enlaces[id].classList.add('act');
  }
  [].slice.call(document.querySelectorAll('#ix-esc a')).forEach(function(a){
    var id = a.getAttribute('href').slice(1);
    enlaces[id] = a;
    /* respuesta inmediata al clic, sin esperar al observador */
    a.addEventListener('click', function(){ marcar(id); });
  });
  if('IntersectionObserver' in window){
    var obs = new IntersectionObserver(function(entradas){
      entradas.forEach(function(en){
        if(enlaces[en.target.id] && en.isIntersecting) marcar(en.target.id);
      });
    }, { rootMargin: '-92px 0px -70% 0px', threshold: 0 });
    secciones.forEach(function(s){ obs.observe(s); });
  }

  /* ---- buscador ---- */
  var campo  = document.getElementById('q-buscar');
  var caja   = document.getElementById('bcampo');
  var stat   = document.getElementById('q-stat');
  var vacio  = document.getElementById('q-vacio');
  var limpiar= document.getElementById('q-limpiar');

  function sinTildes(t){
    return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  /* el texto de cada pregunta se calcula una sola vez */
  secciones.forEach(function(s){ s._txt = sinTildes(s.textContent); });

  function reponer(){
    secciones.forEach(function(s){
      s.style.display = '';
      var d = s.querySelector('details.mas');
      if(d && d.dataset.forzado === '1'){ d.removeAttribute('open'); delete d.dataset.forzado; }
    });
    vacio.style.display = 'none';
    stat.textContent = '';
    caja.classList.remove('tiene');
  }

  function buscar(){
    var q = sinTildes(campo.value.trim());
    if(q.length < 2){ reponer(); if(campo.value) caja.classList.add('tiene'); return; }
    caja.classList.add('tiene');
    var n = 0;
    secciones.forEach(function(s){
      var hay = s._txt.indexOf(q) !== -1;
      s.style.display = hay ? '' : 'none';
      var d = s.querySelector('details.mas');
      if(!d) return;
      if(hay && !d.open){ d.open = true; d.dataset.forzado = '1'; }
      if(!hay && d.dataset.forzado === '1'){ d.removeAttribute('open'); delete d.dataset.forzado; }
      if(hay) n++;
    });
    vacio.style.display = n ? 'none' : 'block';
    stat.textContent = n === 0 ? 'Ninguna pregunta menciona «' + campo.value.trim() + '».'
              : n === 1 ? '1 pregunta menciona «' + campo.value.trim() + '».'
                        : n + ' preguntas mencionan «' + campo.value.trim() + '».';
  }

  campo.addEventListener('input', buscar);
  campo.addEventListener('search', buscar);
  limpiar.addEventListener('click', function(){ campo.value = ''; reponer(); campo.focus(); });
  document.getElementById('q-todo').addEventListener('click', function(e){
    e.preventDefault(); campo.value = ''; reponer(); campo.focus();
  });

  /* ---- si llegan con #p7 desde fuera, se abre esa pregunta ---- */
  function abrirDelHash(traer){
    var id = location.hash.slice(1);
    if(!id) return;
    var s = document.getElementById(id);
    if(s && s.classList.contains('q')){
      var d = s.querySelector('details.mas');
      if(d) d.open = true;
      /* al llegar desde fuera el navegador ancla antes de que abramos el
         detalle, así que reponemos la posición nosotros */
      if(traer) s.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  }
  abrirDelHash(true);
  window.addEventListener('hashchange', abrirDelHash);
})();
