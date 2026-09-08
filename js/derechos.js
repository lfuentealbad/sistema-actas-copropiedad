/* =====================================================================
 *  LOS DERECHOS SE CUENTAN EN ENTEROS
 *
 *  Por qué existe este archivo.
 *
 *  Hasta el 08-09-2026 los tres módulos que resuelven un acuerdo —el acta,
 *  la sala en vivo y la consulta por escrito— sumaban los derechos con
 *  parseFloat y comparaban el total contra el umbral. Eso decide mal en el
 *  borde, porque 0,01 no existe en binario:
 *
 *      17 + 17,01 + 15,99  ->  50.00000000000001   "supera el 50 %"
 *      1 + 63,01 + 1,99    ->  65.99999999999999   "no alcanza el 66 %"
 *
 *  Las dos son falsas. Y hay algo peor: el resultado dependía del ORDEN de
 *  las filas del padrón. El mismo padrón con los mismos votos, ordenado de
 *  otra manera, daba el veredicto contrario:
 *
 *      [17 , 17,01 , 15,99]  ->  50.00000000000001  ->  aprueba
 *      [15,99 , 17,01 , 17]  ->  50                 ->  rechaza
 *
 *  Un acta que cambia de resultado según cómo se ordenó una tabla no es un
 *  acta. Lo encontró una revisión externa el 08-09-2026.
 *
 *  Cómo se corrige.
 *
 *  No con toFixed() al final —eso maquilla el número después de haber
 *  decidido mal— ni con una tolerancia, que convertiría en suficiente algo
 *  que no llega al umbral. Se corrige en la representación: los derechos
 *  entran como texto, se convierten a ENTEROS de diezmilésimas de punto
 *  porcentual y no vuelven a ser decimales hasta que hay que imprimirlos.
 *  La suma de enteros es exacta y no depende del orden.
 *
 *  El rango es holgado: 100 % son 1.000.000 y el entero seguro de
 *  JavaScript llega a 9.007.199.254.740.991.
 *
 *  Y por qué UNA función para los tres módulos: porque eran tres
 *  implementaciones de la misma regla legal y ya habían discrepado antes.
 *
 *  Regla de la casa: nada de JavaScript en línea, la CSP es script-src
 *  'self'. Este archivo se carga con <script src> antes que los módulos.
 * ===================================================================== */
(function (global) {
  'use strict';

  // Diezmilésimas de punto porcentual. Un reglamento de copropiedad rara
  // vez pasa de cuatro decimales; el padrón del acta ofrece dos.
  var DECIMALES = 4;
  var ESCALA = 10000;          // 1 % = 10.000
  var CIEN = 100 * ESCALA;     // 100 % = 1.000.000

  // -------------------------------------------------------------------
  //  Entrada: de texto a entero, sin pasar por coma flotante
  // -------------------------------------------------------------------
  // Se admite coma o punto decimal: el padrón se escribe a mano y se
  // importa de planillas, y en Chile se escribe con coma.
  var RX_NUMERO = /^\d+(?:[.,]\d+)?$/;

  function valido(v) {
    var s = String(v == null ? '' : v).trim();
    return s !== '' && RX_NUMERO.test(s);
  }

  // Devuelve el entero escalado. Lo que no es un número no negativo vale
  // cero: en una suma de derechos es lo único seguro que se puede hacer
  // con un dato roto. Quien necesite avisar del dato roto usa valido().
  function desdeTexto(v) {
    var s = String(v == null ? '' : v).trim().replace(',', '.');
    if (!RX_NUMERO.test(s)) return 0;

    var p = s.split('.');
    var enteros = p[0];
    var dec = p[1] || '';

    // Se redondea a la precisión admitida en vez de truncar: truncar
    // sesga siempre hacia abajo, y sobre un padrón entero eso se nota.
    var sobra = dec.charAt(DECIMALES);
    dec = dec.slice(0, DECIMALES);
    while (dec.length < DECIMALES) dec += '0';

    var n = Number(enteros) * ESCALA + Number(dec);
    if (sobra && Number(sobra) >= 5) n += 1;
    return n;
  }

  // Suma exacta. El orden no altera el resultado, que es justamente lo
  // que se rompía antes.
  function suma(lista) {
    var t = 0;
    for (var i = 0; i < lista.length; i++) t += lista[i];
    return t;
  }

  // -------------------------------------------------------------------
  //  Salida: de entero a texto, exacto
  // -------------------------------------------------------------------
  // num/den como decimal chileno. `den` tiene que dividir a 100.000, que
  // cubre los dos casos que se usan: la escala normal (10.000) y su mitad
  // (20.000), que aparece al partir una base por dos.
  //
  // Se imprimen dos decimales como mínimo —así se lee un porcentaje— y
  // los que hagan falta para no mentir. Un umbral impreso de menos es un
  // umbral que no cuadra cuando alguien rehace la cuenta a mano.
  function texto(num, den) {
    var factor = 100000 / (den || ESCALA);
    var n = Math.round(num * factor);
    var signo = n < 0 ? '-' : '';
    if (n < 0) n = -n;
    var ent = Math.floor(n / 100000);
    var dec = String(n % 100000);
    while (dec.length < 5) dec = '0' + dec;
    dec = dec.replace(/0+$/, '');
    while (dec.length < 2) dec += '0';
    return signo + ent + ',' + dec;
  }

  // Solo para pintar: barras, anchos, porcentajes de relleno. Nunca para
  // decidir ni para imprimir en el acta.
  function aNumero(n) { return n / ESCALA; }

  // -------------------------------------------------------------------
  //  La regla legal
  // -------------------------------------------------------------------
  //  Art. 15 de la Ley N° 21.442: el voto de cada copropietario es
  //  proporcional a los derechos de su unidad en los bienes de dominio
  //  común. Cambia la BASE según el tipo de asamblea.
  //
  //  Mayoría absoluta es MÁS DE LA MITAD, no "51 %": el 50+1 solo
  //  coincide con 51 cuando la base son 100 unidades enteras, y aquí la
  //  base son derechos con decimales.
  var REGLAS = {
    // Asamblea ordinaria: mayoría absoluta de los derechos PRESENTES y
    // hábiles. La comparación va multiplicada por dos para no partir la
    // base y quedarse otra vez con un decimal a medias.
    presentes: {
      base: function (ctx) { return ctx.presentes || 0; },
      alcanza: function (favor, base) { return favor * 2 > base; },
      umbral: function (base) { return { num: base, den: 2 * ESCALA }; },
      describeBase: function (base, personas) {
        return 'Base: ' + texto(base) + ' % de derechos hábiles presentes ('
          + personas + ' asistente' + (personas === 1 ? '' : 's') + ')';
      },
      describeUmbral: function (t) { return 'Mayoría absoluta: más de ' + t + ' % a favor'; }
    },

    // Extraordinaria de mayoría absoluta: más del 50 % de los derechos
    // del condominio, no de los presentes.
    absoluta: {
      base: function () { return CIEN; },
      alcanza: function (favor) { return favor > 50 * ESCALA; },
      umbral: function () { return { num: 50 * ESCALA, den: ESCALA }; },
      describeBase: function () { return 'Base: 100 % de los derechos del condominio'; },
      describeUmbral: function () { return 'Mayoría absoluta: más del 50 % de los derechos a favor'; }
    },

    // Extraordinaria reforzada: al menos el 66 %. Aquí sí es "al menos".
    reforzada: {
      base: function () { return CIEN; },
      alcanza: function (favor) { return favor >= 66 * ESCALA; },
      umbral: function () { return { num: 66 * ESCALA, den: ESCALA }; },
      describeBase: function () { return 'Base: 100 % de los derechos del condominio'; },
      describeUmbral: function () { return 'Mayoría reforzada: al menos 66 % de los derechos a favor'; }
    }
  };

  // -------------------------------------------------------------------
  //  El veredicto
  // -------------------------------------------------------------------
  //  cfg = {
  //    regla:        'presentes' | 'absoluta' | 'reforzada',
  //    favor, contra, abstencion:  enteros escalados,
  //    presentes:    entero escalado (derechos hábiles presentes),
  //    personas:     cuántos asistentes hábiles hay detrás,
  //    personasFavor: cuántos votaron a favor,
  //    sinRegistrar: cuántos asistentes hábiles no han fijado preferencia,
  //    cerrada:      true si la votación ya no admite más votos
  //  }
  //
  //  Devuelve un estado de tres valores, y no dos, porque el acta y la
  //  sala describían de forma distinta el mismo registro: el acta decía
  //  "pendiente" y la sala ya cantaba "APROBADO". Ahora la diferencia
  //  entre una mayoría alcanzada y un resultado definitivo la nombra un
  //  solo lugar.
  //
  //    'aprobado'  la mayoría se alcanzó y no falta nadie por votar
  //    'rechazado' la votación se cerró sin alcanzarla
  //    'pendiente' faltan preferencias, o no hay base sobre la cual votar
  //
  //  `alcanzada` dice si la mayoría está numéricamente lograda AHORA. Con
  //  la votación abierta eso es una tendencia, no un acuerdo.
  function resolver(cfg) {
    var regla = REGLAS[cfg.regla];
    if (!regla) throw new Error('Regla de mayoría desconocida: ' + cfg.regla);

    var favor = cfg.favor || 0;
    var base = regla.base(cfg);
    var sinRegistrar = cfg.sinRegistrar || 0;
    var personas = cfg.personas || 0;

    var alcanzada = base > 0 && regla.alcanza(favor, base);
    var u = regla.umbral(base);
    var umbralTexto = texto(u.num, u.den);

    var estado;
    if (base <= 0) estado = 'pendiente';
    else if (sinRegistrar > 0) estado = 'pendiente';
    else if (!cfg.cerrada && !alcanzada) estado = 'pendiente';
    else estado = alcanzada ? 'aprobado' : 'rechazado';

    return {
      estado: estado,
      alcanzada: alcanzada,
      // Verdadero solo cuando ya no puede cambiar: no queda nadie por
      // votar. Es lo que el acta puede escribir como acuerdo.
      definitivo: base > 0 && sinRegistrar === 0,
      base: base,
      umbral: u,
      sinRegistrar: sinRegistrar,

      baseTexto: texto(base),
      umbralTexto: umbralTexto,
      favorTexto: texto(favor),
      contraTexto: texto(cfg.contra || 0),
      abstencionTexto: texto(cfg.abstencion || 0),

      descripcionBase: regla.describeBase(base, personas),
      descripcionUmbral: regla.describeUmbral(umbralTexto)
    };
  }

  // -------------------------------------------------------------------
  //  Quién es hábil
  // -------------------------------------------------------------------
  //  Art. 14 del Reglamento (D.S. N° 7 de 2023, MINVU): "En caso de
  //  poseer más de una unidad, solo se considerará como copropietario
  //  hábil a aquel que se encuentre al día en el pago de sus obligaciones
  //  económicas para con el condominio, respecto de la TOTALIDAD de sus
  //  unidades."
  //
  //  Es decir: la habilidad es del copropietario, no de la unidad. Si
  //  alguien tiene dos departamentos y debe gastos comunes en uno, no
  //  vota con ninguno de los dos. Filtrar fila por fila —como se hacía—
  //  deja votar al que está moroso en otra de sus unidades.
  //
  //  Recibe filas con { rut, habil } y devuelve la misma lista con
  //  `habil` corregida hacia abajo cuando el RUT aparece más de una vez y
  //  alguna de sus filas viene inhábil. Sin RUT no se puede agrupar: esa
  //  fila se deja como está y se cuenta en `sinRut`, para que la interfaz
  //  pueda pedirlo.
  function normalizarRut(r) {
    return String(r == null ? '' : r).replace(/[.\-\s]/g, '').toLowerCase();
  }

  function habilidadPorCopropietario(filas) {
    var moroso = {}, vistos = {}, sinRut = 0;
    var i, k;

    for (i = 0; i < filas.length; i++) {
      k = normalizarRut(filas[i].rut);
      if (!k) { sinRut++; continue; }
      vistos[k] = (vistos[k] || 0) + 1;
      if (filas[i].habil === false) moroso[k] = true;
    }

    var arrastrados = [];
    var salida = filas.map(function (f) {
      var kk = normalizarRut(f.rut);
      if (kk && moroso[kk] && f.habil !== false) {
        arrastrados.push({ rut: f.rut, unidad: f.unidad });
        return Object.assign({}, f, { habil: false, inhabilPorOtraUnidad: true });
      }
      return f;
    });

    return { filas: salida, arrastrados: arrastrados, sinRut: sinRut };
  }

  // -------------------------------------------------------------------
  //  Las banderas: habil y asiste
  // -------------------------------------------------------------------
  //  `p.habil !== false` daba por habil cualquier cosa que no fuera el
  //  booleano false: el texto "false", el texto "no", null, un campo que
  //  la base devolvio vacio. Un moroso guardado con la bandera en texto
  //  votaba igual, y nadie se enteraba.
  //
  //  Devuelve true, false, o null cuando el valor no se puede interpretar.
  //  null NO es "por omision": es "hay que preguntarlo", y quien llama
  //  decide si lo rechaza o lo cuenta como el valor conservador.
  function bandera(v) {
    if (v === true || v === false) return v;
    if (v === undefined || v === null) return null;
    var s = String(v).trim().toLowerCase();
    if (s === '') return null;
    if (s === 'true' || s === 'si' || s === 'sí' || s === '1') return true;
    if (s === 'false' || s === 'no' || s === '0') return false;
    return null;
  }

  // Para las bases de calculo: lo que no se pudo interpretar se trata como
  // el valor que NO suma. Es la unica direccion segura -de lo contrario un
  // dato roto agrega derechos a la base y baja el umbral de hecho- y quien
  // llama tiene `bandera()` para avisar de que hubo que suponerlo.
  function habilSegura(v) { return bandera(v) === true; }

  global.Derechos = {
    DECIMALES: DECIMALES,
    ESCALA: ESCALA,
    CIEN: CIEN,
    valido: valido,
    desdeTexto: desdeTexto,
    suma: suma,
    texto: texto,
    aNumero: aNumero,
    resolver: resolver,
    bandera: bandera,
    habilSegura: habilSegura,
    normalizarRut: normalizarRut,
    habilidadPorCopropietario: habilidadPorCopropietario
  };

})(typeof window !== 'undefined' ? window : globalThis);
