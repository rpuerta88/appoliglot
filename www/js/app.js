// =========================================================================
// 1. CONEXIÓN PURA A SQLITE NATIVO (Optimizado para Android)
// =========================================================================
let db_real = null;
let tarjetaActual = null;
let idElementoEdicion = null;


async function inicializarBaseDatos() {
    try {
        // En Android, Capacitor siempre está disponible a través de su API de Plugins
        const { CapacitorSQLite } = Capacitor.Plugins;
        
        db_real = await CapacitorSQLite.createConnection({
            database: "mi_idioma_app",
            version: 1,
            encrypted: false,
            mode: "no-encryption"
        });

        await db_real.open();
        console.log("📱 ¡Conexión física a SQLite Nativo en Android establecida!");
        
        await crearTablasSiNoExisten();
        await poblarSelectores();
        cambiarPantalla('pantalla-registro');

    } catch (error) {
        console.error("Error crítico en el SQLite de Android:", error);
        alert("Error al inicializar la base de datos local.");
    }
}

async function crearTablasSiNoExisten() {
    const queryCreacion = `
        CREATE TABLE IF NOT EXISTS idiomas (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            nombre TEXT NOT NULL, 
            simbolo TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS categorias (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            nombre TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS elementos (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            idioma_id INTEGER NOT NULL, 
            categoria_id INTEGER NOT NULL,
            termino TEXT NOT NULL,
            fonetica TEXT NOT NULL, 
            traduccion TEXT NOT NULL, 
            contexto TEXT, 
            vistas INTEGER DEFAULT 0,
            tipo TEXT CHECK(tipo IN ('palabra', 'frase')) NOT NULL, 
            creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
            estado TEXT DEFAULT 'aprendizaje', 
            intervalo INTEGER DEFAULT 0, 
            factor_facilidad REAL DEFAULT 2.5,
            repeticiones INTEGER DEFAULT 0, 
            proximo_repaso TEXT,
            FOREIGN KEY (idioma_id) REFERENCES idiomas(id), 
            FOREIGN KEY (categoria_id) REFERENCES categorias(id)
        );
    `;
    await db_real.execute({ statements: queryCreacion });
}


// Combinamos la inicialización de la interfaz y la base de datos en un único punto seguro
document.addEventListener('DOMContentLoaded', () => {
    // 1. Iniciamos la base de datos local SQLite
    inicializarBaseDatos();

    // 2. Vinculamos los eventos de los botones de navegación
    document.querySelectorAll('.btn-nav').forEach(boton => {
        boton.addEventListener('click', function() {
            const pantallaDestino = this.getAttribute('data-pantalla');
            if (pantallaDestino) {
                cambiarPantalla(pantallaDestino);
            }
        });
    });
});


// =========================================================================
// 2. MOTOR DEL ALGORITMO DE REPETICIÓN ESPACIADA (SRS SM-2)
// =========================================================================
function calcularSRS(calificacion, intervaloActual, factorFacilidadActual, repeticionesActuales) {
    let nuevoIntervalo = 0;
    let nuevoFactor = factorFacilidadActual;
    let nuevasRepeticiones = repeticionesActuales;
    let nuevoEstado = "aprendizaje";

    if (calificacion === 1) {
        nuevasRepeticiones = 0;
        nuevoIntervalo = 1;
    } else {
        nuevasRepeticiones++;
        if (nuevasRepeticiones === 1) nuevoIntervalo = 1;
        else if (nuevasRepeticiones === 2) nuevoIntervalo = 3;
        else nuevoIntervalo = Math.round(intervaloActual * factorFacilidadActual);

        if (calificacion === 2) nuevoFactor -= 0.15;
        if (calificacion === 4) nuevoFactor += 0.15;
    }

    if (nuevoFactor < 1.3) nuevoFactor = 1.3;

    if (nuevoIntervalo >= 90) {
        nuevoEstado = "automatizada";
    }

    const fecha = new Date();
    fecha.setDate(fecha.getDate() + nuevoIntervalo);
    const proximoRepaso = fecha.toISOString().split('T')[0];

    return {
        intervalo: nuevoIntervalo,
        factor_facilidad: parseFloat(nuevoFactor.toFixed(2)),
        repeticiones: nuevasRepeticiones,
        estado: nuevoEstado,
        proximo_repaso: proximoRepaso
    };
}

// =========================================================================
// 3. FUNCIÓN DE LECTURA (Selectores desde SQLite Real)
// =========================================================================
async function poblarSelectores() {
    const selectIdioma = document.getElementById('reg-idioma');
    const selectCategoria = document.getElementById('reg-categoria');

    if (!selectIdioma || !selectCategoria || !db_real) return;

    selectIdioma.innerHTML = '<option value="">Selecciona un idioma...</option>';
    selectCategoria.innerHTML = '<option value="">Selecciona una categoría...</option>';

    try {
        const resIdiomas = await db_real.query({ statement: "SELECT * FROM idiomas ORDER BY nombre ASC;" });
        const listaIdiomas = resIdiomas.values || [];

        const resCategorias = await db_real.query({ statement: "SELECT * FROM categorias ORDER BY nombre ASC;" });
        const listaCategorias = resCategorias.values || [];

        listaIdiomas.forEach(i => {
            selectIdioma.innerHTML += `<option value="${i.id}">${i.nombre} (${i.simbolo})</option>`;
        });

        listaCategorias.forEach(c => {
            selectCategoria.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
        });
        
        console.log("¡Selectores actualizados desde SQLite móvil!");
    } catch (error) {
        console.error("Error al leer datos nativos para los selectores:", error);
    }
}

// =========================================================================
// 4. CAPA DE NEGOCIO Y FORMULARIOS (Inserciones y Actualizaciones en SQLite)
// =========================================================================

// Registrar nuevo Idioma desde Ajustes
document.getElementById('form-config-idioma').addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!db_real) return;

    const nombre = document.getElementById('conf-idioma-nombre').value.trim();
    const simbolo = document.getElementById('conf-idioma-simbolo').value.trim();

    try {
        await db_real.run({ 
            statement: "INSERT INTO idiomas (nombre, simbolo) VALUES (?, ?);", 
            values: [nombre, simbolo] 
        });
        alert(`Idioma "${nombre}" guardado con éxito.`);
        this.reset();
        await poblarSelectores();
    } catch (error) {
        console.error("Error al insertar idioma:", error);
        alert("Error: El idioma o símbolo ya existe.");
    }
});

// Registrar nueva Categoría desde Ajustes
document.getElementById('form-config-categoria').addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!db_real) return;

    const nombre = document.getElementById('conf-categoria-nombre').value.trim();

    try {
        await db_real.run({ 
            statement: "INSERT INTO categorias (nombre) VALUES (?);", 
            values: [nombre] 
        });
        alert(`Categoría "${nombre}" guardada con éxito.`);
        this.reset();
        await poblarSelectores();
    } catch (error) {
        console.error("Error al insertar categoría:", error);
        alert("Error: Esta categoría ya existe.");
    }
});

// Guardar o Editar una Palabra/Frase en el Vocabulario principal
document.getElementById('formulario-registro').addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!db_real) return;

    const idiomaId = parseInt(document.getElementById('reg-idioma').value);
    const categoriaId = parseInt(document.getElementById('reg-categoria').value);
    const tipo = document.getElementById('reg-tipo').value;
    const termino = document.getElementById('reg-termino').value.trim();
    const fonetica = document.getElementById('reg-fonetica').value.trim();
    const traduccion = document.getElementById('reg-traduccion').value.trim();
    const contexto = document.getElementById('reg-contexto').value.trim();

    if (idElementoEdicion !== null) {
        // --- PROCESO DE EDICIÓN (UPDATE) ---
        const sqlUpdate = `
            UPDATE elementos 
            SET idioma_id = ?, categoria_id = ?, tipo = ?, termino = ?, fonetica = ?, traduccion = ?, contexto = ?
            WHERE id = ?;
        `;
        try {
            await db_real.run({ 
                statement: sqlUpdate, 
                values: [idiomaId, categoriaId, tipo, termino, fonetica, traduccion, contexto, idElementoEdicion] 
            });
            alert("¡Término actualizado con éxito!");
            limpiarModoEdicion();
        } catch (error) {
            console.error("Error al editar en SQLite:", error);
        }
    } else {
        // --- PROCESO DE CREACIÓN (INSERT) ---
        const hoy = new Date().toISOString().split('T')[0];
        const sqlInsert = `
            INSERT INTO elementos (idioma_id, categoria_id, tipo, termino, fonetica, traduccion, contexto, proximo_repaso) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        `;
        try {
            await db_real.run({ 
                statement: sqlInsert, 
                values: [idiomaId, categoriaId, tipo, termino, fonetica, traduccion, contexto, hoy] 
            });
            alert(`¡"${termino}" agendado para estudio hoy!`);
            this.reset();
        } catch (error) {
            console.error("Error al insertar término en SQLite:", error);
        }
    }
});

function prepararEdicion(elemento) {
    idElementoEdicion = elemento.id;
    document.getElementById('reg-idioma').value = elemento.idioma_id;
    document.getElementById('reg-categoria').value = elemento.categoria_id;
    document.getElementById('reg-tipo').value = elemento.tipo;
    document.getElementById('reg-termino').value = elemento.termino;
    document.getElementById('reg-fonetica').value = elemento.fonetica;
    document.getElementById('reg-traduccion').value = elemento.traduccion;
    document.getElementById('reg-contexto').value = elemento.contexto || "";

    const btnGuardar = document.querySelector('#formulario-registro .btn-guardar');
    btnGuardar.innerText = "🔄 Actualizar Término";
    btnGuardar.style.backgroundColor = "#ff9800";
    cambiarPantalla('pantalla-registro');
}

function limpiarModoEdicion() {
    idElementoEdicion = null;
    const btnGuardar = document.querySelector('#formulario-registro .btn-guardar');
    btnGuardar.innerText = "Guardar en mi Vocabulario";
    btnGuardar.style.backgroundColor = "var(--color-primario)";
    document.getElementById('formulario-registro').reset();
}
//=========================================================================
// 5. SESIÓN DE REPASO INTERACTIVA//
//=========================================================================
async function cargarSesionRepaso() {
      ocultarRespuesta();
      if (!db_real) return;

      const hoy = new Date().toISOString().split('T')[0];
      let pendientes = [];
      
      try {
          const sqlQuery = SELECT e.*, i.nombre AS idioma_nombre, i.simbolo AS idioma_simbolo, c.nombre AS categoria_nombre  FROM elementos e JOIN idiomas i ON e.idioma_id = i.id JOIN categorias c ON e.categoria_id = c.id WHERE e.proximo_repaso <= ? AND e.estado = 'aprendizaje' ORDER BY e.id ASC;;const resultado = await db_real.query({ statement: sqlQuery, values: [hoy] });pendientes = resultado.values || [];
          } catch (error) {
          console.error("Error al cargar repasos desde SQLite:", error);
          }
       const lblTipo = document.getElementById('repaso-tipo');const txtOrigen = document.getElementById('repaso-origen');const txtContexto = document.getElementById('repaso-contexto');const txtDestino = document.getElementById('repaso-destino');const btnMostrar = document.getElementById('btn-mostrar-respuesta');
       
       if (pendientes.length === 0) {if (lblTipo) lblTipo.innerText = "-";if (txtOrigen) txtOrigen.innerText = "¡Estás al día! No hay tarjetas pendientes para repasar hoy.";if (txtContexto) txtContexto.innerText = "";if (btnMostrar) btnMostrar.style.display = 'none';tarjetaActual = null;return;
       }
       
       if (btnMostrar) btnMostrar.style.display = 'block';
       const registro = pendientes[0];
       
       tarjetaActual = {id: registro.id,idioma_id: registro.idioma_id,categoria_id: registro.categoria_id,tipo: registro.tipo,termino: registro.termino,fonetica: registro.fonetica,traduccion: registro.traduccion,contexto: registro.contexto,vistas: (registro.vistas || 0) + 1,intervalo: registro.intervalo || 0,factor_facilidad: registro.factor_facilidad || 2.5,repeticiones: registro.repeticiones || 0,idioma_nombre: registro.idioma_nombre,idioma_simbolo: registro.idioma_simbolo,categoria_nombre: registro.categoria_nombre
       };
       
       if (lblTipo) lblTipo.innerText = ${tarjetaActual.tipo.toUpperCase()} | ${tarjetaActual.idioma_nombre} | ${tarjetaActual.categoria_nombre};if (txtOrigen) txtOrigen.innerText = tarjetaActual.termino;if (txtContexto) txtContexto.innerText = tarjetaActual.contexto || "Sin contexto adicional registrado";if (txtDestino) txtDestino.innerText = tarjetaActual.traduccion;}
       
       async function calificarTarjeta(calificacion) {
       if (!tarjetaActual || !db_real) return;
       
       const srs = calcularSRS(calificacion, tarjetaActual.intervalo, tarjetaActual.factor_facilidad, tarjetaActual.repeticiones);
       
       try {await db_real.run({statement: "UPDATE elementos SET intervalo = ?, factor_facilidad = ?, repeticiones = ?, estado = ?, proximo_repaso = ?, vistas = ? WHERE id = ?;",values: [srs.intervalo, srs.factor_facilidad, srs.repeticiones, srs.estado, srs.proximo_repaso, tarjetaActual.vistas, tarjetaActual.id]
       });
       
       if (srs.estado === 'automatizada') {
       let automatizadas = JSON.parse(localStorage.getItem('palabras_automatizadas')) || [];
       if (!automatizadas.some(item => item.id === tarjetaActual.id)) {
       automatizadas.push({
       id: tarjetaActual.id,
       termino: tarjetaActual.termino,
       fonetica: tarjetaActual.fonetica,
       traduccion: tarjetaActual.traduccion,
       contexto: tarjetaActual.contexto,
       idioma: tarjetaActual.idioma_nombre,
       categoria: tarjetaActual.categoria_nombre
       });
       localStorage.setItem('palabras_automatizadas', JSON.stringify(automatizadas));
       }
       alert(¡Espectacular! Se logró la automatización de este término.);
       }
       } catch (error) {
       console.error("Error al actualizar la tarjeta en SQLite:", error);
       }
       
       await cargarSesionRepaso();
       }


// =========================================================================
// 6. BUSCADOR DE AUTOMATIZADAS (Consulta Relacional Real)
// =========================================================================
       async function ejecutarBusqueda() {
       const textoBusqueda = document.getElementById('input-busqueda').value.toLowerCase().trim();
       const contenedorResultados = document.getElementById('lista-automatizadas');
       
       if (!contenedorResultados || !db_real) return;
       contenedorResultados.innerHTML = "";
       
       try {
       const sqlQuery = SELECT e.*, i.nombre AS idioma_nombre, c.nombre AS categoria_nombre  FROM elementos e JOIN idiomas i ON e.idioma_id = i.id JOIN categorias c ON e.categoria_id = c.id WHERE e.estado = 'automatizada' AND (e.termino LIKE ? OR e.traduccion LIKE ? OR e.contexto LIKE ?) ORDER BY e.termino ASC;;
       const patron = %${textoBusqueda}%;
       const resultado = await db_real.query({ statement: sqlQuery, values: [patron, patron, patron] });
       const filtradas = resultado.values || [];
       
       if (filtradas.length === 0) {
       contenedorResultados.innerHTML = "No hay coincidencias en tu baúl automatizado.";
       return;
       }
       
       filtradas.forEach(item => {contenedorResultados.innerHTML += <div style="background: white; padding: 12px; margin-top: 10px; border-radius: 8px; border-left: 5px solid #4caf50; box-shadow: 0 2px 4px rgba(0,0,0,0.05); display: flex; justify-content: space-between; align-items: center;"> <div style="flex: 1; padding-right: 10px;"> <strong style="font-size: 1.1rem; color: #333;">${item.termino}</strong> <span>➔ ${item.traduccion}</span> <br> <small style="color: #888; font-style: italic;">${item.contexto || 'Sin contexto'}</small> <br> <span style="font-size: 0.75rem; background: #e0e0e0; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-top: 5px; font-weight: bold;">${item.idioma_nombre} | ${item.categoria_nombre}</span> </div> <div> <button class="btn-editar-item" data-id="${item.id}" style="background: #ff9800; color: white; border: none; padding: 8px 12px; border-radius: 5px; font-weight: bold; cursor: pointer; font-size: 0.9rem; margin-right: 5px;">✏</button> <button class="btn-eliminar-item" data-id="${item.id}" style="background: #f44336; color: white; border: none; padding: 8px 12px; border-radius: 5px; font-weight: bold; cursor: pointer; font-size: 0.9rem;">🗑</button> </div> </div>;});
       
       document.querySelectorAll('.btn-editar-item').forEach(boton => {
       boton.addEventListener('click', function() {
       const idBuscar = parseInt(this.getAttribute('data-id'));
       const el = filtradas.find(e => e.id === idBuscar);
       if (el) prepararEdicion(el);
       });
       });
       
       document.querySelectorAll('.btn-eliminar-item').forEach(boton => {
       boton.addEventListener('click', function() {
       eliminarElemento(parseInt(this.getAttribute('data-id')));
       });
       });
       
       } catch (error) {
       console.error("Error al buscar automatizadas en SQLite:", error);
       }
       }
       
// =========================================================================
// 7. ELIMINACIÓN REAL (DELETE en SQLite)
// =========================================================================
async function eliminarElemento(idEliminar) {
      if (!db_real) return;
      const confirmar = confirm("¿Estás seguro de que deseas eliminar este término por completo?");
      if (!confirmar) return; 
      
      try {
      await db_real.run({ statement: "DELETE FROM elementos WHERE id = ?;", values: [idEliminar] });
      alert("Término eliminado de forma permanente.");
      await ejecutarBusqueda();
      await actualizarEstadisticas();
      } catch (error) {
      console.error("Error al eliminar en SQLite:", error);
      }
      }
      
// =========================================================================
// 8. INDICADORES DE PROGRESO (Estadísticas Reales)
// =========================================================================
async function actualizarEstadisticas() {
      const txtAprendizaje = document.getElementById('est-aprendizaje');const txtAutomatizadas = document.getElementById('est-automatizadas');if (!txtAprendizaje || !txtAutomatizadas || !db_real) return;
      
      try {
      const resAp = await db_real.query({ statement: "SELECT COUNT(*) AS total FROM elementos WHERE estado = 'aprendizaje';" });
      const totalAp = resAp.values[0]?.total || 0;
      
      const resAu = await db_real.query({ statement: "SELECT COUNT(*) AS total FROM elementos WHERE estado = 'automatizada';" });
      const totalAu = resAu.values[0]?.total || 0;
      
      txtAprendizaje.innerText = totalAp;
      txtAutomatizadas.innerText = totalAu;
      } catch (error) {
      console.error("Error al calcular estadísticas en SQLite:", error);
      }
      }
      
// =========================================================================
// 9. HERRAMIENTAS ADICIONALES (TTS de Audio Nativo)
// =========================================================================
function escucharTermino() {
       if (!tarjetaActual || !tarjetaActual.termino) return;    
       
       if ('speechSynthesis' in window) {
       window.speechSynthesis.cancel();
       const enunciado = new SpeechSynthesisUtterance(tarjetaActual.termino);
       enunciado.lang = tarjetaActual.idioma_simbolo || 'en';
       enunciado.rate = 0.9;window.speechSynthesis.speak(enunciado);
       } else {
       alert("Tu dispositivo no soporta la reproducción de audio nativa.");
       }
       }
       
       function mostrarPistaVisual() {
       const txtContexto = document.getElementById('repaso-contexto');
       if (!txtContexto) return;
       txtContexto.classList.toggle('oculta');
       }

// =========================================================================
// 10. NAVEGACIÓN SPA E INTERFAZ
// =========================================================================
function cambiarPantalla(idPantallaObjetivo) {
    document.querySelectorAll('.pantalla').forEach(p => p.classList.add('oculta'));
    document.querySelectorAll('.btn-nav').forEach(b => b.classList.remove('activo'));

    const pantallaDestino = document.getElementById(idPantallaObjetivo);
    if (pantallaDestino) pantallaDestino.classList.remove('oculta');

    const botonActivo = Array.from(document.querySelectorAll('.btn-nav')).find(b => b.getAttribute('data-pantalla') === idPantallaObjetivo);

    if (botonActivo) botonActivo.classList.add('activo');

    // Carga de datos dinámica obligatoria al cambiar de pestaña
    if (idPantallaObjetivo === 'pantalla-registro') poblarSelectores();
    if (idPantallaObjetivo === 'pantalla-repaso') cargarSesionRepaso();
    if (idPantallaObjetivo === 'pantalla-buscador') ejecutarBusqueda();
    if (idPantallaObjetivo === 'pantalla-configuracion') actualizarEstadisticas();
}
window.cambiarPantalla = cambiarPantalla;
         
function mostrarRespuesta() {
         document.getElementById('tarjeta-dorso')?.classList.remove('oculta');
         document.getElementById('btn-mostrar-respuesta')?.classList.add('oculta');
         document.getElementById('botones-calificacion')?.classList.remove('oculta');
}
         
function ocultarRespuesta() {
         document.getElementById('tarjeta-dorso')?.classList.add('oculta');
         document.getElementById('btn-mostrar-respuesta')?.classList.remove('oculta');
         document.getElementById('botones-calificacion')?.classList.add('oculta');
         document.getElementById('repaso-contexto')?.classList.add('oculta');
}

// =========================================================================
// 11. ESCUCHADOR DE NAVEGACIÓN MÓVIL (Solución CSP)
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.btn-nav').forEach(boton => {
        boton.addEventListener('click', function() {
            const pantallaDestino = this.getAttribute('data-pantalla');
            if (pantallaDestino) {
                cambiarPantalla(pantallaDestino);
            }
        });
    });
});
