// =========================================================================
// 1. CONEXIÓN PURA A SQLITE NATIVO (Optimizado para Android) CORREGIDO 20260101
// =========================================================================
const SQLitePlugin = Capacitor.Plugins.CapacitorSQLite;
let db_real = null;
let tarjetaActual = null;
let idElementoEdicion = null;
// Función auxiliar global para mostrar notificaciones nativas en Android
async function mostrarNotificacion(mensaje) {
    try {
        const { Toast } = Capacitor.Plugins;
        if (Toast) {
            await Toast.show({
                text: mensaje,
                duration: 'short',
                position: 'bottom'
            });
        } else {
            console.log("Toast no disponible:", mensaje);
        }
    } catch (e) {
        console.error("Error al mostrar Toast:", e);
    }
}

async function inicializarBaseDatos() {
    try {
        const SQLite = window.Capacitor && window.Capacitor.Plugins ? window.Capacitor.Plugins.CapacitorSQLite : null;
        const dbName = "mi_idioma_app";

        if (!SQLite) {
            throw new Error("El componente CapacitorSQLite no está inyectado en el APK.");
        }

        // 1. Verificación defensiva estricta de consistencia nativa
        let consistencia;
        try {
            consistencia = await SQLite.checkConnectionsConsistency();
        } catch (e) {
            console.warn("Inconsistencia nativa detectada, procediendo a restaurar conexiones:", e);
            consistencia = { result: false };
        }

        // 2. Comprobar si la conexión ya está activa en la memoria nativa
        let estaConectado;
        try {
            estaConectado = await SQLite.isConnection({ database: dbName });
        } catch (e) {
            estaConectado = { result: false };
        }

        // 3. Flujo inteligente de conexión basado en el estado real
        if (consistencia.result && estaConectado.result) {
            console.log("La conexión ya existía de forma consistente en memoria nativa.");
        } else {
            // Si existía una conexión muerta o corrupta en el pool nativo, la cerramos primero
            if (estaConectado.result) {
                try {
                    await SQLite.closeConnection({ database: dbName });
                } catch(e) {
                    console.warn("No se pudo cerrar la conexión huérfana (operación segura):", e);
                }
            }
            
            // Creamos la conexión de forma limpia
            await SQLite.createConnection({
                database: dbName,
                version: 1,
                encrypted: false,
                mode: "no-encryption",
                readOnly: false
            });
        }

        // 4. Abrir la base de datos ÚNICAMENTE si no se encuentra abierta ya
        let verificacionFinal = await SQLite.isDBOpen({ database: dbName });
        if (!verificacionFinal.result) {
            await SQLite.open({ database: dbName });
        }

        console.log("¡Conexión a SQLite Nativo en Android establecida correctamente!");
        
        // Mapeo corregido y optimizado para Capacitor SQLite Nativo v6
        db_real = {
    query: async function({ statement, values }) {
        const SQLite = window.Capacitor && window.Capacitor.Plugins ? window.Capacitor.Plugins.CapacitorSQLite : null;
        return await SQLite.query({
            database: dbName,
            statement: statement,
            values: values || []
        });
    },
    execute: async function({ statement, values }) {
        const SQLite = window.Capacitor && window.Capacitor.Plugins ? window.Capacitor.Plugins.CapacitorSQLite : null;
        
        // Si tiene parámetros bindings (como los INSERTS/UPDATES), usamos obligatoriamente el método .run() nativo
        if (values && values.length > 0) {
            return await SQLite.run({
                database: dbName,
                statement: statement,
                values: values
            });
        }
        
        // Para sentencias puras estructurales como CREATE TABLE
        return await SQLite.execute({
            database: dbName,
            statements: statement
        });
    }
};
        
       // Crear la estructura física interna de datos
        await crearTablasSiNoExisten();

    } catch (error) {
        console.error("Error crítico en el SQLite de Android:", error);
        const mensajeFinal = error.message || JSON.stringify(error);
        if (typeof mostrarNotificacion === 'function') {
            mostrarNotificacion(`Fallo nativo inicialización: ${mensajeFinal}`, "error");
        }
        throw error; // Propagar el error para frenar la inicialización de la interfaz
    }
}

async function crearTablasSiNoExisten() {
    try {
        // Sentencias individuales y limpias obligatorias para el motor SQLite nativo
        await db_real.execute({ statement: `CREATE TABLE IF NOT EXISTS idiomas (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, simbolo TEXT NOT NULL UNIQUE);`});
        await db_real.execute({ statement: `CREATE TABLE IF NOT EXISTS categorias (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL UNIQUE);` });
        
        await db_real.execute({ statement: `CREATE TABLE IF NOT EXISTS elementos (
            id INTEGER PRIMARY KEY AUTOINCREMENT, idioma_id INTEGER NOT NULL, categoria_id INTEGER NOT NULL, termino TEXT NOT NULL, fonetica TEXT, traduccion TEXT NOT NULL, contexto TEXT, vistas INTEGER DEFAULT 0, tipo TEXT CHECK(tipo IN ('palabra', 'frase')) NOT NULL, creado_en TEXT DEFAULT CURRENT_TIMESTAMP, estado TEXT DEFAULT 'aprendizaje', intervalo INTEGER DEFAULT 0, factor_facilidad REAL DEFAULT 2.5, repeticiones INTEGER DEFAULT 0, proximo_repaso TEXT, FOREIGN KEY (idioma_id) REFERENCES idiomas(id), FOREIGN KEY (categoria_id) REFERENCES categorias(id));` 
            });
        
        mostrarNotificacion(`Base de datos SQLite creada exitosamente`);
    } catch (error) {
        console.error("Error al crear las tablas internas:", error);
        mostrarNotificacion(`Fallo en la construción de la Base de Datos`, "error")
    }
}

// =========================================================================
// 2. MOTOR DEL ALGORITMO DE REPETICIÓN ESPACIADA (SRS SM-2) CORREGIDO 20260901
// =========================================================================
function calcularSRS(calificacion, intervaloActual, factorFacilidadActual, repeticionesActuales) {
    // Escala asumida de calificación (1: Olvidado por completo, 2: Difícil, 3: Bien/Correcto, 4: Muy Fácil)
    let nuevoIntervalo = 0;
    let nuevoFactor = factorFacilidadActual;
    let nuevasRepeticiones = repeticionesActuales;
    let nuevoEstado = "aprendizaje";

    if (calificacion === 1) {
        // REINICIO: Si olvidó la palabra, vuelve a empezar el ciclo
        nuevasRepeticiones = 0;
        nuevoIntervalo = 1;
        // Penalizamos ligeramente el factor de facilidad por haberla olvidado (Matemática segura)
        nuevoFactor = Math.max(1.3, Number((factorFacilidadActual - 0.20).toFixed(2)));
    } else {
        nuevasRepeticiones++;
        
        // Determinación del nuevo intervalo de días
        if (nuevasRepeticiones === 1) {
            nuevoIntervalo = 1;
        } else if (nuevasRepeticiones === 2) {
            nuevoIntervalo = 3; // Puedes usar 4 o 6 días según prefieras el ritmo
        } else {
            nuevoIntervalo = Math.round(intervaloActual * factorFacilidadActual);
        }

        // AJUSTE DEL FACTOR (Implementación SM2 Limpia y segura contra flotantes)

       if (calificacion === 2) {
           nuevoFactor = Number((factorFacilidadActual - 0.15).toFixed(2));
       } else if (calificacion === 3) {
           nuevoFactor = Number(factorFacilidadActual); // Mantiene el factor actual como número
       } else if (calificacion === 4) {
           nuevoFactor = Number((factorFacilidadActual + 0.15).toFixed(2));
       }

    // Límite inferior recomendado por SuperMemo para evitar el "infierno de bajas frecuencias"
    if (nuevoFactor < 1.3) nuevoFactor = 1.3;

    // DETERMINACIÓN DEL ESTADO DE LA TARJETA
    if (nuevoIntervalo >= 90) {
        nuevoEstado = "automatizada";
    } else if (nuevasRepeticiones > 2) {
        nuevoEstado = "repaso"; // Estado intermedio para mejor organización estadística
    }

    // CÁLCULO DE FECHA (Evitando desfases de zona horaria del sistema de forma limpia)
     const fecha = new Date();
    fecha.setDate(fecha.getDate() + nuevoIntervalo);
    
    // Convertimos de forma segura a formato ISO YYYY-MM-DD compatible
    const proximoRepaso = fecha.toISOString().split('T')[0];
    
    return {
        intervalo: nuevoIntervalo,
        factor_facilidad: nuevoFactor,
        repeticiones: nuevasRepeticiones,
        estado: nuevoEstado,
        proximo_repaso: proximoRepaso
    };
}

// =========================================================================
// 3. FUNCIÓN DE LECTURA (Selectores desde SQLite Real) CORREGIDO 20260901
// =========================================================================

async function poblarSelectores() {
    // Capturamos los elementos del DOM de forma explícita antes de evaluar
    const regIdioma = document.getElementById('reg-idioma');
    const regCategoria = document.getElementById('reg-categoria');

    if (!regIdioma || !regCategoria) return;
    if (!db_real) {
        console.warn("Intento de poblar selectores sin una conexión activa a SQLite.");
        return;
    }

    try {
        const [resIdiomas, resCategorias] = await Promise.all([
            db_real.query({ statement: "SELECT id, nombre, simbolo FROM idiomas ORDER BY nombre ASC;" }),
            db_real.query({ statement: "SELECT id, nombre FROM categorias ORDER BY nombre ASC;" })
        ]);

        const listaIdiomas = resIdiomas?.values || [];
        const listaCategorias = resCategorias?.values || [];

        regIdioma.innerHTML = [
            '<option value="">Selecciona un idioma...</option>',
            ...listaIdiomas.map(i => `<option value="${i.id}">${i.nombre} (${i.simbolo})</option>`)
        ].join('');

        regCategoria.innerHTML = [
            '<option value="">Selecciona una categoría...</option>',
            ...listaCategorias.map(c => `<option value="${c.id}">${c.nombre}</option>`)
        ].join('');

        console.log("Selectores de la interfaz sincronizados con SQLite.");
    } catch (error) {
        console.error("Error al leer datos nativos para los selectores:", error);
    }
}

// =========================================================================
// 4. CAPA DE NEGOCIO Y FORMULARIOS (Inserciones y Actualizaciones en SQLite) CORREGIDO 2026-09-01
// =========================================================================

// Registrar nuevo Idioma desde Ajustes
document.getElementById('form-config-idioma').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    // Si la base de datos aún no está lista, avisamos al usuario en vez de fallar en silencio
    if (!db_real) {
        await mostrarNotificacion("Por favor, espera a que la base de datos se inicialice.");
        return;
    }

    const nombre = document.getElementById('conf-idioma-nombre').value.trim();
    const simbolo = document.getElementById('conf-idioma-simbolo').value.trim();
    
    if (!nombre || !simbolo) {
        await mostrarNotificacion("Por favor, rellena todos los campos.");
        return;
    }

    const sqlInsert = `INSERT INTO idiomas (nombre, simbolo) VALUES (?, ?);`;
    try {
        await db_real.execute({ statement: sqlInsert, values: [nombre, simbolo] });
        // CORREGIDO: Se cambió mostrarNotificaciones por mostrarNotificacion
        await mostrarNotificacion(`Idioma "${nombre}" agregado con éxito.`);
        this.reset();

        setTimeout(async () => {
            await poblarSelectores();
        }, 250);
    } catch (error) {
        console.error("Error al insertar idioma:", error);
        await mostrarNotificacion("Error: El símbolo o nombre ya existe.");
    }
});
// Registrar nueva Categoría desde Ajustes
document.getElementById('form-config-categoria').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    if (!db_real) {
        await mostrarNotificacion("Por favor, espera a que la base de datos se inicialice.");
        return;
    }

    const nombre = document.getElementById('conf-categoria-nombre').value.trim();
    
    if (!nombre) {
        await mostrarNotificacion("Por favor, ingresa un nombre para la categoría.");
        return;
    }

    const sqlInsert = `INSERT INTO categorias (nombre) VALUES (?);`;
    try {
        await db_real.execute({ statement: sqlInsert, values: [nombre] });
        // CORREGIDO: Se cambió mostrarNotificaciones por mostrarNotificacion
        await mostrarNotificacion(`Categoría "${nombre}" agregada con éxito.`);
        this.reset();

        setTimeout(async () => {
            await poblarSelectores();
        }, 250);
    } catch (error) {
        console.error("Error al insertar categoría:", error);
        await mostrarNotificacion("Error: Esta categoría ya existe.");
    }
});

// Guardar o Editar una Palabra/Frase en el Vocabulario principal con Fonética Nativa

document.getElementById('formulario-registro').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    if (!db_real) {
        await mostrarNotificacion("Por favor, espera a que la base de datos se inicialice.");
        return;
    }

    try {
        const elIdioma = document.getElementById('reg-idioma');
        const elCategoria = document.getElementById('reg-categoria');
        const elTipo = document.getElementById('reg-tipo');
        const elTermino = document.getElementById('reg-termino');
        const elFonetica = document.getElementById('reg-fonetica');
        const elTraduccion = document.getElementById('reg-traduccion');
        const elContexto = document.getElementById('reg-contexto');

        if (!elIdioma.value || !elCategoria.value || !elTermino.value.trim() || !elTraduccion.value.trim()) {
            await mostrarNotificacion("Por favor, rellena los campos obligatorios.");
            return;
        }

        const idiomaId = parseInt(elIdioma.value, 10);
        const categoriaId = parseInt(elCategoria.value, 10);
        const tipo = elTipo.value;
        const termino = elTermino.value.trim();
        const fonetica = elFonetica ? elFonetica.value.trim() : "";
        const traduccion = elTraduccion.value.trim();
        const contexto = elContexto ? elContexto.value.trim() : "";
        const hoy = new Date().toISOString().split('T')[0];

        const esEdicion = (typeof idElementoEdicion !== 'undefined' && idElementoEdicion !== null);

        if (esEdicion) {
            // --- PROCESO DE EDICIÓN CON FONÉTICA ---
            const sqlUpdate = `
                UPDATE elementos SET idioma_id = ?, categoria_id = ?, tipo = ?, termino = ?, fonetica = ?, traduccion = ?, contexto = ? WHERE id = ?;`;
            await db_real.execute({
                statement: sqlUpdate,
                values: [idiomaId, categoriaId, tipo, termino, fonetica, traduccion, contexto, idElementoEdicion]
            });
            
            await mostrarNotificacion("¡Término actualizado con éxito!");
            limpiarModoEdicion();
        } else {
            // --- PROCESO DE CREACIÓN CON FONÉTICA ---
            const sqlInsert = `
                INSERT INTO elementos (idioma_id, categoria_id, tipo, termino, fonetica, traduccion, contexto, proximo_repaso, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aprendizaje');
            `;
            await db_real.execute({
                statement: sqlInsert,
                values: [idiomaId, categoriaId, tipo, termino, fonetica, traduccion, contexto, hoy]
            });
            
            await mostrarNotificacion(`¡"${termino}" guardado en tu vocabulario!`);
            this.reset();
        }

        if (typeof actualizarEstadisticas === 'function') {
            await actualizarEstadisticas();
        }

    } catch (error) {
        console.error("Error al procesar término en SQLite:", error);
        await mostrarNotificacion("❌ Error interno al guardar el vocabulario.");
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
// 5. SESIÓN DE REPASO INTERACTIVA// CORREGIDA 2026-09-01
//=========================================================================
async function cargarSesionRepaso() {
    ocultarRespuesta();
    if (!db_real) return;

    // Ajuste de fecha local segura (tal como optimizamos en el algoritmo anterior)
    const fecha = new Date();
    const hoy = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
    let pendientes = [];
    
    try {
        // CORRECCIÓN 1: Filtramos tanto por 'aprendizaje' como por 'repaso' usando IN
        const sqlQuery = `
            SELECT e.*, i.nombre AS idioma_nombre, i.simbolo AS idioma_simbolo, c.nombre AS categoria_nombre FROM elementos e JOIN idiomas i ON e.idioma_id = i.id  JOIN categorias c ON e.categoria_id = c.id  WHERE e.proximo_repaso <= ? AND e.estado IN ('aprendizaje', 'repaso') ORDER BY e.id ASC;`;
        const resultado = await db_real.query({ statement: sqlQuery, values: [hoy] });
        pendientes = resultado.values || [];
    } catch (error) {
        console.error("Error al cargar repasos desde SQLite:", error);
    }

// REEMPLAZA LAS LÍNEAS 433 A 447 EN cargarSesionRepaso() POR ESTO:
    const lblTipo = document.getElementById('repaso-tipo');
    const txtOrigen = document.getElementById('repaso-origen');
    const txtContexto = document.getElementById('repaso-contexto');
    const txtDestino = document.getElementById('repaso-destino');
    const btnMostrar = document.getElementById('btn-mostrar-respuesta');
    const elContenedorCalif = document.getElementById('botones-calificacion');
    const elTarjetaDorso = document.getElementById('tarjeta-dorso');

    if (pendientes.length === 0) {
        if (lblTipo) lblTipo.innerText = "-";
        if (txtOrigen) txtOrigen.innerText = "¡Estás al día! No hay tarjetas pendientes para repasar hoy.";
        if (txtContexto) txtContexto.innerText = "";
        if (btnMostrar) btnMostrar.style.display = 'none';
        if (elContenedorCalif) elContenedorCalif.classList.add('oculta');
        if (elTarjetaDorso) elTarjetaDorso.classList.add('oculta');
        tarjetaActual = null;
        return;
    }
    
    if (btnMostrar) btnMostrar.style.display = 'block';
    const registro = pendientes[0];
    
    // Mapeo seguro del objeto actual
    tarjetaActual = {
        id: registro.id,
        idioma_id: registro.idioma_id,
        categoria_id: registro.categoria_id,
        tipo: registro.tipo,
        termino: registro.termino,
        fonetica: registro.fonetica,
        traduccion: registro.traduccion,
        contexto: registro.contexto,
        vistas: (registro.vistas || 0) + 1,
        intervalo: registro.intervalo || 0,
        factor_facilidad: registro.factor_facilidad || 2.5,
        repeticiones: registro.repeticiones || 0,
        idioma_nombre: registro.idioma_nombre,
        idioma_simbolo: registro.idioma_simbolo,
        categoria_nombre: registro.categoria_nombre
    };
    
    // CORRECCIÓN 2: Unión limpia del texto usando un único Template Literal con barras separadoras
    if (lblTipo) {
        lblTipo.innerText = `${tarjetaActual.tipo.toUpperCase()} | ${tarjetaActual.idioma_nombre} | ${tarjetaActual.categoria_nombre}`;
    }
    if (txtOrigen) txtOrigen.innerText = tarjetaActual.termino;
    if (txtContexto) txtContexto.innerText = tarjetaActual.contexto || "Sin contexto adicional registrado";
    if (txtDestino) txtDestino.innerText = tarjetaActual.traduccion;
}
    
async function calificarTarjeta(calificacion) {
    if (!tarjetaActual || !db_real) return;
    
    const srs = calcularSRS(calificacion, tarjetaActual.intervalo, tarjetaActual.factor_facilidad, tarjetaActual.repeticiones);
    
    try {
        // Guardamos todos los datos optimizados directamente en SQLite Nativo
        await db_real.execute({
            statement: `UPDATE elementos SET intervalo = ?, factor_facilidad = ?, repeticiones = ?, estado = ?, proximo_repaso = ?, vistas = ? WHERE id = ?;`,
            values: [
               parseInt(srs.intervalo, 10),
               parseFloat(srs.factor_facilidad), // Asegura el tipo REAL en Android
               parseInt(srs.repeticiones, 10),
               String(srs.estado),
               String(srs.proximo_repaso),
               parseInt(tarjetaActual.vistas, 10),
               parseInt(tarjetaActual.id, 10)
                    ]
        });
                
        // CORRECCIÓN 3: Eliminamos el uso innecesario de localStorage
        // BUSCA EL FINAL DE LA FUNCIÓN calificarTarjeta Y REEMPLÁZALA POR ESTO:
        if (srs.estado === 'automatizada') {
            await mostrarNotificacion(`¡Espectacular! Se logró la automatización de: "${tarjetaActual.termino}".`);
        } else {
            await mostrarNotificacion("Calificación registrada con éxito.");
        }
        
        // CORRECCIÓN MÓVIL: Forzamos la actualización inmediata de los contadores en la UI
        if (typeof actualizarEstadisticas === 'function') {
            await actualizarEstadisticas();
        }
        
    } catch (error) {
        console.error("Error al actualizar la tarjeta en SQLite:", error);
        await mostrarNotificacion("❌ Error al guardar la calificación.");
    }
    
    // Saltamos automáticamente a la siguiente tarjeta pendiente
    await cargarSesionRepaso();
}



// =========================================================================
// 6. BUSCADOR DE AUTOMATIZADAS (Consulta Relacional Real) CORREGIDO 20260901
// =========================================================================
async function ejecutarBusqueda() {
    const textoBusqueda = document.getElementById('input-busqueda').value.toLowerCase().trim();
    const contenedorResultados = document.getElementById('lista-automatizadas');
    
    if (!contenedorResultados || !db_real) return;

    // Inicializamos una variable para almacenar los datos de la consulta actual
    // Esto nos permitirá encontrarlos rápidamente al hacer clic en "Editar"
    if (!window.cacheBusquedaActual) window.cacheBusquedaActual = [];

    try {
        const sqlQuery = `
            SELECT e.*, i.nombre AS idioma_nombre, c.nombre AS categoria_nombre FROM elementos e JOIN idiomas i ON e.idioma_id = i.id JOIN categorias c ON e.categoria_id = c.id WHERE e.estado = 'automatizada' AND (e.termino LIKE ? OR e.traduccion LIKE ? OR e.contexto LIKE ?) ORDER BY e.termino ASC;
        `;
        const patron = `%${textoBusqueda}%`;
        const resultado = await db_real.query({ statement: sqlQuery, values: [patron, patron, patron] });
        
        window.cacheBusquedaActual = resultado.values || [];

        if (window.cacheBusquedaActual.length === 0) {
            contenedorResultados.innerHTML = '<p class="busqueda-vacia">No hay coincidencias en tu baúl automatizado.</p>';
            return;
        }

        // MEJORA 1: Creamos todo el HTML en memoria de un solo golpe (Cero lag en la Canaimita)
        // RECOMENDACIÓN: Traslada los estilos inline de aquí a tu archivo CSS usando las clases indicadas
        contenedorResultados.innerHTML = window.cacheBusquedaActual.map(item => `
            <div class="tarjeta-resultado">
                <div class="info-resultado">
                    <strong class="termino-resultado">${item.termino}</strong> 
                    <span class="traduccion-resultado"> - ${item.traduccion}</span>
                    <br>
                    <small class="contexto-resultado">${item.contexto || "Sin contexto adicional registrado"}</small>
                    <br>
                    <span class="etiqueta-resultado">${item.idioma_nombre} | ${item.categoria_nombre}</span>
                </div>
                <div class="acciones-resultado">
                    <button class="btn-editar-item" data-id="${item.id}">✏️</button>
                    <button class="btn-eliminar-item" data-id="${item.id}">🗑️</button>
                </div>
            </div>
        `).join('');

        // MEJORA 2: Delegación de Eventos Única (Elimina por completo las fugas de memoria)
        // Configuramos el contenedor para escuchar los clics una sola vez, si no se ha hecho antes
        if (!contenedorResultados.dataset.listenerActivo) {
            contenedorResultados.addEventListener('click', function(e) {
                // Buscamos si el clic ocurrió en el botón de editar o eliminar
                const btnEditar = e.target.closest('.btn-editar-item');
                const btnEliminar = e.target.closest('.btn-eliminar-item');

                if (btnEditar) {
                    const idBuscar = parseInt(btnEditar.getAttribute('data-id'), 10);
                    const el = window.cacheBusquedaActual.find(item => item.id === idBuscar);
                    if (el) prepararEdicion(el);
                }

                if (btnEliminar) {
                    const idEliminar = parseInt(btnEliminar.getAttribute('data-id'), 10);
                    // Llama a tu función de eliminación nativa
                    eliminarElemento(idEliminar); 
                }
            });
            // Marcamos el contenedor para no duplicar este escuchador en el futuro
            contenedorResultados.dataset.listenerActivo = "true";
        }

    } catch (error) {
        console.error("Error al buscar automatizadas en SQLite:", error);
        await mostrarNotificacion("❌ Error al procesar la búsqueda.");
    }
}

       
// =========================================================================
// 7. ELIMINACIÓN REAL (DELETE en SQLite) CORREGIDA 20260901
// =========================================================================
async function eliminarElemento(idEliminar) {
    if (!db_real) return;

    try {
        // Extraemos Dialog directamente del objeto global de Capacitor
        const { Dialog } = Capacitor.Plugins;

        // MEJORA 1: Confirmación nativa de Android (No bloquea el hilo de la app)
        if (Dialog) {
            const resultadoConfirmacion = await Dialog.confirm({
                title: 'Confirmar eliminación',
                message: '¿Estás seguro de que deseas eliminar este término por completo?',
                okButtonTitle: 'Eliminar',
                cancelButtonTitle: 'Cancelar'
            });

            // Si el usuario presiona "Cancelar", detenemos la ejecución inmediatamente
            if (!resultadoConfirmacion.value) return;
        } else {
            // Respaldo clásico si pruebas el flujo en el navegador de la Canaimita
            const confirmarWeb = confirm("¿Estás seguro de que deseas eliminar este término?");
            if (!confirmarWeb) return;
        }

        // MEJORA 2: Ejecución del borrado en SQLite
        await db_real.execute({ 
            statement: `DELETE FROM elementos WHERE id = ?;`, 
            values: [idEliminar] 
        });

        // MEJORA 3: Reemplazo de alert() por tu función optimizada de Toast nativo
        await mostrarNotificacion("🗑️ Término eliminado de forma permanente.");
        
        // Actualizamos la interfaz gráfica de forma asíncrona y paralela
        await Promise.all([
            ejecutarBusqueda(),
            actualizarEstadisticas()
        ]);

    } catch (error) {
        console.error("Error al eliminar en SQLite:", error);
        await mostrarNotificacion("❌ Error al intentar eliminar el elemento.");
    }
}
// =========================================================================
// 8. INDICADORES DE PROGRESO (Estadísticas Reales) CORREGIDO 20260901
// =========================================================================
async function actualizarEstadisticas() {
    const txtAprendizaje = document.getElementById('est-aprendizaje');
    const txtAutomatizadas = document.getElementById('est-automatizadas');
    
    if (!txtAprendizaje || !txtAutomatizadas || !db_real) return;
    
    try {
        // MEJORA 1: Una única consulta SQL que clasifica y cuenta todo de un solo viaje
        const sqlQuery = `
            SELECT 
                COUNT(CASE WHEN estado IN ('aprendizaje', 'repaso') THEN 1 END) AS total_estudio,
                COUNT(CASE WHEN estado = 'automatizada' THEN 1 END) AS total_auto
            FROM elementos;
        `;
        
        const resultado = await db_real.query({ statement: sqlQuery });
        const metricas = resultado.values?.[0] || { total_estudio: 0, total_auto: 0 };
        
        // MEJORA 2: Inyección directa en la interfaz gráfica
        txtAprendizaje.innerText = metricas.total_estudio;
        txtAutomatizadas.innerText = metricas.total_auto;
        
        console.log("📊 Estadísticas del vocabulario actualizadas en tiempo real.");
    } catch (error) {
        console.error("Error al calcular estadísticas en SQLite:", error);
    }
}
      
// =========================================================================
// 9. HERRAMIENTAS ADICIONALES (TTS de Audio Nativo) CORREGIDA 20260901
// =========================================================================

// --- 1. REPRODUCCIÓN DE VOZ (TEXT-TO-SPEECH AUTOMATIZADO) ---
async function escucharTermino() {
    if (!tarjetaActual || !tarjetaActual.termino) return;    
    
    try {
        // Intentamos usar el motor nativo de Capacitor (Mucho más estable en Android)
        const { TextToSpeech } = Capacitor.Plugins;

        if (TextToSpeech) {
            await TextToSpeech.speak({
                text: tarjetaActual.termino,
                lang: tarjetaActual.idioma_simbolo || 'en-US', // Formato estándar ISO (ej: 'en-US', 'es-ES')
                rate: 0.9, // Velocidad de reproducción ligeramente pausada para aprendizaje
                pitch: 1.0,
                volume: 1.0,
                category: 'ambient'
            });
        } else if ('speechSynthesis' in window) {
            // Respaldo para cuando pruebas la app en el navegador de la Canaimita
            window.speechSynthesis.cancel();
            const enunciado = new SpeechSynthesisUtterance(tarjetaActual.termino);
            enunciado.lang = tarjetaActual.idioma_simbolo || 'en';
            enunciado.rate = 0.9;
            window.speechSynthesis.speak(enunciado);
        } else {
            await mostrarNotificacion("🔊 Tu dispositivo no soporta la reproducción de audio.");
        }
    } catch (error) {
        console.error("Error en el motor de voz (TTS):", error);
        // Respaldo de seguridad si el plugin nativo falla en la inicialización
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const enunciado = new SpeechSynthesisUtterance(tarjetaActual.termino);
            enunciado.lang = tarjetaActual.idioma_simbolo || 'en';
            window.speechSynthesis.speak(enunciado);
        }
    }
}
      window.escucharTermino = escucharTermino;
      
       
// --- 2. CONTROL EFICIENTE DE LA PISTA VISUAL ---
function mostrarPistaVisual() {
    // MEJORA: Reutilizamos la referencia global indexada que declaramos antes (elRepasoContexto)
    if (!elRepasoContexto) return;
    
    // Conmutamos la visibilidad de la pista de forma fluida
    elRepasoContexto.classList.toggle('oculta');
}
      window.mostrarPistaVisual = mostrarPistaVisual;



// =========================================================================
// 10. NAVEGACIÓN SPA E INTERFAZ CORREGIDO 20260901
// =========================================================================
// --- CENTRALIZACIÓN DEL DOM DE INTERFAZ (Se declara arriba una sola vez) ---
const panelesPantallas = document.querySelectorAll('.pantalla');
const enlacesNavegacion = document.querySelectorAll('.btn-nav');

// Elementos de la interfaz de repaso interactivo
const elTarjetaDorso = document.getElementById('tarjeta-dorso');
const elBtnMostrarResp = document.getElementById('btn-mostrar-respuesta');
const elContenedorCalif = document.getElementById('botones-calificacion');
const elRepasoContexto = document.getElementById('repaso-contexto');

// --- 1. CONTROL DE NAVEGACIÓN ---
function cambiarPantalla(idPantallaObjetivo) {
    // Apagamos todas las pantallas y limpiamos estilos de botones activos
    panelesPantallas.forEach(p => p.classList.add('oculta'));
    enlacesNavegacion.forEach(b => b.classList.remove('activo'));

    // Encendemos la pantalla seleccionada
    const pantallaDestino = document.getElementById(idPantallaObjetivo);
    if (pantallaDestino) pantallaDestino.classList.remove('oculta');

    // Buscamos y activamos el botón correcto de manera eficiente
    const botonActivo = Array.from(enlacesNavegacion).find(b => b.getAttribute('data-pantalla') === idPantallaObjetivo);
    if (botonActivo) botonActivo.classList.add('activo');

    // Enrutador de carga dinámica de datos (Buenas Prácticas)
    const accionesPantallas = {
        'pantalla-registro': poblarSelectores,
        'pantalla-repaso': cargarSesionRepaso,
        'pantalla-buscador': ejecutarBusqueda,
        'pantalla-configuracion': actualizarEstadisticas
    };

    if (accionesPantallas[idPantallaObjetivo]) {
        accionesPantallas[idPantallaObjetivo]();
    }
}
window.cambiarPantalla = cambiarPantalla;
         
// --- 2. MOSTRAR RESPUESTA ---
function mostrarRespuesta() {
    document.getElementById('tarjeta-dorso')?.classList.remove('oculta');
    document.getElementById('btn-mostrar-respuesta')?.classList.add('oculta');
    document.getElementById('botones-calificacion')?.classList.remove('oculta');
}
         
// --- 3. OCULTAR RESPUESTA ---
function ocultarRespuesta() {
    document.getElementById('tarjeta-dorso')?.classList.add('oculta');
    document.getElementById('btn-mostrar-respuesta')?.classList.remove('oculta');
    document.getElementById('botones-calificacion')?.classList.add('oculta');
    document.getElementById('repaso-contexto')?.classList.add('oculta'); // Inicia oculto bajo la pista
}

window.mostrarRespuesta = mostrarRespuesta;
window.ocultarRespuesta = ocultarRespuesta;

// =========================================================================
// 11. INICIALIZADOR DE INTERFAZ Y EVENTOS MÓVILES (Garantía SPA) CORREGIDA 20260901
// =========================================================================
// REEMPLAZA EL INICIO DEL DOMContentLoaded (Líneas 776 a 795) POR ESTE:
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Captura en caliente de los botones de navegación
    const botonesNav = document.querySelectorAll('.btn-nav');
    const panelesPantallas = document.querySelectorAll('.pantalla');
    
    botonesNav.forEach(boton => {
        boton.addEventListener('click', function() {
            const pantallaDestino = this.getAttribute('data-pantalla');
            if (pantallaDestino) {
                cambiarPantalla(pantallaDestino);
            }
        });
    });

    // 2. Encendido visual puro de la pantalla de registro de inmediato
    panelesPantallas.forEach(p => p.classList.add('oculta'));
    document.getElementById('pantalla-registro')?.classList.remove('oculta');
    Array.from(botonesNav).find(b => b.getAttribute('data-pantalla') === 'pantalla-registro')?.classList.add('activo');

    // 3. Conexión aislada de la base de datos
    try {
        await inicializarBaseDatos();
        
        // Filtro dinámico en tiempo real para el buscador
        document.getElementById('input-busqueda')?.addEventListener('input', ejecutarBusqueda);

        // 4. Una vez que la base de datos está 100% lista, poblamos los selectores
        await poblarSelectores();
        console.log("Aplicación e interfaz inicializadas correctamente.");
    } catch (error) {
        console.error("Error en la secuencia de inicialización:", error);
    }
});

