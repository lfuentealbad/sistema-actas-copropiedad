(function(){
  'use strict';
  var secciones = [].slice.call(document.querySelectorAll('#clausulas .cl'));

  function pintarIndice(destino){
    var ol = document.getElementById(destino);
    if(!ol) return;
    secciones.forEach(function(s){
      var li = document.createElement('li');
      var a  = document.createElement('a');
      a.href = '#' + s.id;
      a.textContent = s.querySelector('h2').textContent.trim();
      li.appendChild(a); ol.appendChild(li);
    });
  }
  pintarIndice('ix-esc');
  pintarIndice('ix-mov');

  var movil = document.querySelector('.indice-movil');
  if(movil){
    movil.addEventListener('click', function(e){
      if(e.target.tagName === 'A') movil.removeAttribute('open');
    });
  }

  var enlaces = {};
  function marcar(id){
    for(var k in enlaces) enlaces[k].classList.remove('act');
    if(enlaces[id]) enlaces[id].classList.add('act');
  }
  [].slice.call(document.querySelectorAll('#ix-esc a')).forEach(function(a){
    var id = a.getAttribute('href').slice(1);
    enlaces[id] = a;
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
})();
