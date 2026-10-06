  var hdr=document.getElementById('hdr');
  // En el telefono la fila de secciones se recoge al bajar leyendo y vuelve
  // al subir o cerca del principio. Bajo 6 px no cuenta: el rebote de iOS y
  // los saltos de la barra del navegador no deben abrirla y cerrarla.
  var ultimoY=window.scrollY;
  var onScroll=function(){
    var y=window.scrollY;
    hdr.classList.toggle('scrolled', y>20);
    if(y<160){ hdr.classList.remove('recogido'); ultimoY=y; return; }
    if(Math.abs(y-ultimoY)<6) return;
    hdr.classList.toggle('recogido', y>ultimoY);
    ultimoY=y;
  };
  onScroll(); window.addEventListener('scroll',onScroll,{passive:true});
  // Quien llega con el teclado a la fila recogida la ve abrirse.
  hdr.addEventListener('focusin',function(){ hdr.classList.remove('recogido'); });

  // La fila se desliza de lado: el borde se desvanece donde queda mas por ver.
  // Sin la fila (otra pagina, una copia vieja del HTML) no se hace nada: un
  // error aqui cortaria el resto del archivo, y con el las apariciones, que
  // dejarian la pagina en blanco.
  var secciones=document.getElementById('nav-secciones');
  if(secciones){
    var bordes=function(){
      var fin=secciones.scrollWidth-secciones.clientWidth;
      secciones.classList.toggle('mas-izq', secciones.scrollLeft>2);
      secciones.classList.toggle('mas-der', fin>2 && secciones.scrollLeft<fin-2);
    };
    bordes();
    secciones.addEventListener('scroll',bordes,{passive:true});
    window.addEventListener('resize',bordes,{passive:true});

    // La seccion que se esta leyendo queda marcada en el menu y, en el
    // telefono, a la vista dentro de la fila. Cuenta la que cruza la mitad de
    // la pantalla; entre secciones (portada, comite, preguntas) no se marca
    // ninguna.
    if('IntersectionObserver' in window){
      var enlaces={};
      secciones.querySelectorAll('a').forEach(function(a){ enlaces[a.getAttribute('href').slice(1)]=a; });
      var marcado;
      var marcar=function(id){
        if(id===marcado) return;
        marcado=id;
        secciones.querySelectorAll('a[aria-current]').forEach(function(a){ a.removeAttribute('aria-current'); });
        var a=enlaces[id];
        if(!a) return;
        a.setAttribute('aria-current','true');
        if(secciones.scrollWidth>secciones.clientWidth){
          secciones.scrollTo({left:a.offsetLeft-(secciones.clientWidth-a.offsetWidth)/2,
            behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});
        }
      };
      var actual=null;
      var vista=new IntersectionObserver(function(entries){
        entries.forEach(function(en){
          if(en.isIntersecting){ actual=en.target.id; }
          else if(actual===en.target.id){ actual=null; }
        });
        marcar(actual);
      },{rootMargin:'-45% 0px -54% 0px'});
      Object.keys(enlaces).forEach(function(id){
        var s=document.getElementById(id);
        if(s) vista.observe(s);
      });
    }
  }

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
