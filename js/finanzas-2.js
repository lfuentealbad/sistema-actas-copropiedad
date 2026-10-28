document.addEventListener("DOMContentLoaded",function(){
  if(!window.Cuenta) return;
  Cuenta.montarNav("nav-cuenta",{claro:true});

  // El mes de servicio (paso 17, 07-10-2026). La tabla de las cuentas
  // (paso 31) solo pide que cada uno toque su fila: la puerta del mes es de
  // la pagina. Sin respuesta de la base (sin red) no se cierra nada.
  var puerta=document.getElementById("fin-mes");
  if(!puerta || !Cuenta.pase || document.documentElement.classList.contains("vitrina")) return;
  function mostrar(texto, entrar){
    var t=document.getElementById("finMesTexto"); if(t) t.textContent=texto;
    var b=document.getElementById("finMesEntrar");
    if(b){
      b.hidden=!entrar;
      if(entrar) b.addEventListener("click",function(){ Cuenta.abrirCajon({ alEntrar:function(){ location.reload(); } }); });
    }
    document.documentElement.classList.add("fin-sin-mes");
    puerta.hidden=false;
  }
  Cuenta.usuario(function(u){
    if(!u){ mostrar("Entre a su cuenta: las cuentas del condominio van incluidas en el mes de servicio de su condominio.", true); return; }
    Cuenta.pase.estado(function(e){
      if(e && !e.activo) mostrar(Cuenta.pase.mensaje("pase_requerido", e, ""), false);
    });
  });
});
