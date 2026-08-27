  var hdr=document.getElementById('hdr');
  var onScroll=function(){ hdr.classList.toggle('scrolled', window.scrollY>20); };
  onScroll(); window.addEventListener('scroll',onScroll,{passive:true});

  // Las secciones aparecen al entrar en pantalla. Quien pidió menos movimiento
  // en su sistema las ve todas de una vez, sin animación.
  var reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  var mostrarTodo = function(){
    document.querySelectorAll('.reveal').forEach(function(e){ e.classList.add('in'); });
  };

  if(reduce){
    mostrarTodo();
  } else if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(!en.isIntersecting) return;
        en.target.classList.add('in');
        io.unobserve(en.target);
      });
    },{threshold:.16,rootMargin:'0px 0px -8% 0px'});
    document.querySelectorAll('.reveal').forEach(function(e){ io.observe(e); });

    // Red de seguridad. Si el observador no alcanza a disparar -saltos bruscos
    // de scroll, pestaña en segundo plano, un ancla que salta lejos-, la
    // sección se quedaría invisible PARA SIEMPRE: perder el contenido es mucho
    // peor que perder la animación. Cada scroll revisa lo que ya entró en
    // pantalla y lo muestra igual.
    var pendiente = false;
    var repasar = function(){
      pendiente = false;
      var faltan = document.querySelectorAll('.reveal:not(.in)');
      for(var i=0; i<faltan.length; i++){
        if(faltan[i].getBoundingClientRect().top < window.innerHeight * 0.92){
          faltan[i].classList.add('in');
          io.unobserve(faltan[i]);
        }
      }
      // Cuando ya no queda nada oculto, el repaso se retira solo.
      if(!document.querySelector('.reveal:not(.in)')){
        window.removeEventListener('scroll', alScroll);
        window.removeEventListener('resize', alScroll);
      }
    };
    var alScroll = function(){
      if(pendiente) return;
      pendiente = true;
      requestAnimationFrame(repasar);
    };
    window.addEventListener('scroll', alScroll, {passive:true});
    window.addEventListener('resize', alScroll, {passive:true});
  } else {
    // Navegador sin IntersectionObserver: se muestra todo antes que esconder
    // contenido que nunca aparecería.
    mostrarTodo();
  }
