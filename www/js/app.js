// =========================================================================
// 1. CONEXIÓN INTELIGENTE (Soporte para Navegador PC y Android Nativo)
// =========================================================================
let db_real = null;
let esAndroid = false;

// Variables de respaldo para que la app no falle al probar en la PC
let db_idiomas = [{ id: 1, nombre: 'Inglés Americano', simbolo: 'en-US' }];
let db_categorias = [{ id: 1, nombre: 'Viajes' }];
let db_elementos = [];
let tarjetaActual = null;
let idElementoEdicion = null; // Si es null creamos un registro; si tiene un ID, lo editamos.


async function inicializarBaseDatos() {
    // Detectamos si el objeto Capacitor existe en el entorno actual
    esAndroid = typeof Capacitor !== 'undefined' && Capacitor.Plugins && Capacitor.Plugins.CapacitorSQLite;

    if (!esAndroid) {
        console.warn("⚠️ Ejecutando en modo Navegador (PC). Se usarán datos simulados en memoria.");
        await poblarSelectores(); // Carga los datos base simulados directamente
        return;
    }

    // --- CÓDIGO NATIVO PARA ANDROID ---
    try {
        const { CapacitorSQLite } = Capacitor.Plugins;
        db_real = await CapacitorSQLite.createConnection({
            database: "mi_idioma_app",
            version: 1,
            encrypted: false,
            mode: "no-encryption"
        });

        await db_real.open();
        console.log("📱 ¡Conexión a SQLite Nativo en Android establecida!");
        await crearTablasSiNoExisten();
        await poblarSelectores();

    } catch (error) {
        console.error("Error crítico en el SQLite de Android:", error);
    }
}

async function crearTablasSiNoExisten() {
    const queryCreacion = `
        CREATE TABLE IF NOT EXISTS idiomas (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, simbolo TEXT NOT NULL UNIQUE);
        CREATE TABLE IF NOT EXISTS categorias (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL UNIQUE);
        CREATE TABLE IF NOT EXISTS elementos (
            id INTEGER PRIMARY KEY AUTOINCREMENT, idioma_id INTEGER NOT NULL, categoria_id INTEGER NOT NULL,
            termino TEXT NOT NULL, traduccion TEXT NOT NULL, contexto TEXT, vistas INTEGER DEFAULT 0,
            tipo TEXT CHECK(tipo IN ('palabra', 'frase')) NOT NULL, creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
            estado TEXT DEFAULT 'aprendizaje', intervalo INTEGER DEFAULT 0, factor_facilidad REAL DEFAULT 2.5,
            repeticiones INTEGER DEFAULT 0, proximo_repaso TEXT,
            FOREIGN KEY (idioma_id) REFERENCES idiomas(id), FOREIGN KEY (categoria_id) REFERENCES categorias(id)
        );
    `;
    await db_real.execute({ statements: queryCreacion });
}

window.onload = function() {
    inicializarBaseDatos();
};


// =========================================================================
// 2. MOTOR DEL ALGORITMO DE REPETICIÓN ESPACIADA (SRS)
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

    // Regla de automatización: si el intervalo supera 90 días, va al Storage
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
// 3. FUNCIÓN HÍBRIDA DE LECTURA (Selectores transparentes al usuario)
// =========================================================================
async function poblarSelectores() {
    const selectIdioma = document.getElementById('reg-idioma');
    const selectCategoria = document.getElementById('reg-categoria');

    if (!selectIdioma || !selectCategoria) return;

    // Limpiar opciones previas manteniendo el mensaje por defecto
    selectIdioma.innerHTML = '<option value="">Selecciona un idioma...</option>';
    selectCategoria.innerHTML = '<option value="">Selecciona una categoría...</option>';

    let listaIdiomas = [];
    let listaCategorias = [];

    // 1. COMPORTAMIENTO SI CORRE EN ANDROID (SQLite Real)
    if (esAndroid && db_real) {
        try {
            // Leer idiomas de la BD nativa
            const resIdiomas = await db_real.query({ statement: "SELECT * FROM idiomas ORDER BY nombre ASC;" });
            listaIdiomas = resIdiomas.values || [];

            // Leer categorías de la BD nativa
            const resCategorias = await db_real.query({ statement: "SELECT * FROM categorias ORDER BY nombre ASC;" });
            listaCategorias = resCategorias.values || [];
        } catch (error) {
            console.error("Error al leer datos nativos para los selectores:", error);
        }
    } 
    // 2. COMPORTAMIENTO SI CORRE EN LA PC (Arreglos Simulados)
    else {
        listaIdiomas = db_idiomas;
        listaCategorias = db_categorias;
    }

    // 3. RENDERIZADO VISUAL EN EL FORMULARIO (Mismo comportamiento para ambos entornos)
    listaIdiomas.forEach(i => {
        selectIdioma.innerHTML += `<option value="${i.id}">${i.nombre} (${i.simbolo})</option>`;
    });

    listaCategorias.forEach(c => {
        selectCategoria.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
    });

    console.log("¡Selectores del formulario actualizados con éxito!");
}

// Escuchador para Registrar un Idioma desde Configuración (Nativo + Seguro)
document.getElementById('form-config-idioma').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const nombre = document.getElementById('conf-idioma-nombre').value.trim();
    const simbolo = document.getElementById('conf-idioma-simbolo').value.trim();

    if (esAndroid && db_real) {
        const sqlInsert = `INSERT INTO idiomas (nombre, simbolo) VALUES (?, ?);`;
        try {
            await db_real.run({ statement: sqlInsert, values: [nombre, simbolo] });
            alert(`Idioma "${nombre}" agregado con éxito a SQLite.`);
            this.reset();
            
            // Retraso para dar tiempo a SQLite de indexar el archivo interno
            setTimeout(async () => {
                await poblarSelectores();
            }, 250);
        } catch (error) {
            console.error("Error al insertar idioma en SQLite móvil:", error);
            alert("Error: El símbolo o nombre de este idioma ya existe.");
        }
    } else {
        const existe = db_idiomas.some(i => i.simbolo.toLowerCase() === simbolo.toLowerCase());
        if (existe) { alert("Error [PC]: El idioma ya está simulado."); return; }
        db_idiomas.push({ id: db_idiomas.length + 1, nombre: nombre, simbolo: simbolo });
        await poblarSelectores();
        alert(`[PC] Idioma "${nombre}" agregado a la simulación.`);
        this.reset();
    }
});

// Escuchador para Registrar una Categoría desde Configuración (Nativo + Seguro)
document.getElementById('form-config-categoria').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const nombre = document.getElementById('conf-categoria-nombre').value.trim();

    if (esAndroid && db_real) {
        const sqlInsert = `INSERT INTO categorias (nombre) VALUES (?);`;
        try {
            await db_real.run({ statement: sqlInsert, values: [nombre] });
            alert(`Categoría "${nombre}" agregada con éxito a SQLite.`);
            this.reset();
            
            setTimeout(async () => {
                await poblarSelectores();
            }, 250);
        } catch (error) {
            console.error("Error al insertar categoría en SQLite móvil:", error);
            alert("Error: Esta categoría ya se encuentra registrada.");
        }
    } else {
        const existe = db_categorias.some(c => c.nombre.toLowerCase() === nombre.toLowerCase());
        if (existe) { alert("Error [PC]: La categoría ya está simulada."); return; }
        db_categorias.push({ id: db_categorias.length + 1, nombre: nombre });
        await poblarSelectores();
        alert(`[PC] Categoría "${nombre}" agregada a la simulación.`);
        this.reset();
    }
});


// Activa el modo edición cargando los datos en el formulario principal
function prepararEdicion(elemento) {
    idElementoEdicion = elemento.id; // Guardamos el ID que estamos editando

    // Rellenar el formulario con los datos actuales
    document.getElementById('reg-idioma').value = elemento.idioma_id;
    document.getElementById('reg-categoria').value = elemento.categoria_id;
    document.getElementById('reg-tipo').value = elemento.tipo;
    document.getElementById('reg-termino').value = elemento.termino;
    document.getElementById('reg-traduccion').value = elemento.traduccion;
    document.getElementById('reg-contexto').value = elemento.contexto || "";

    // Cambiar la estética del botón para avisar al usuario
    const btnGuardar = document.querySelector('#formulario-registro .btn-guardar');
    btnGuardar.innerText = "🔄 Actualizar Término";
    btnGuardar.style.backgroundColor = "#ff9800"; // Color naranja de edición

    // Llevar al usuario a la pestaña del formulario
    cambiarPantalla('pantalla-registro');
}

// Restablece el formulario a su estado original de creación
function limpiarModoEdicion() {
    idElementoEdicion = null;
    const btnGuardar = document.querySelector('#formulario-registro .btn-guardar');
    btnGuardar.innerText = "Guardar en mi Vocabulario";
    btnGuardar.style.backgroundColor = "var(--color-primario)";
    document.getElementById('formulario-registro').reset();
}

// =========================================================================
// 4. FLUJO DE LA SESIÓN DE REPASO (Híbrido + Interactividad SM-2)
// =========================================================================

// Carga la siguiente tarjeta pendiente de estudio programada para hoy o vencida
async function cargarSesionRepaso() {
    ocultarRespuesta();
    
    // Obtener la fecha de hoy local en formato YYYY-MM-DD
    const hoy = new Date().toISOString().split('T')[0];
    let pendientes = [];

    // 1. ESCENARIO EN ANDROID: Consulta relacional avanzada en SQLite Nativo
    if (esAndroid && db_real) {
        try {
            const sqlQuery = `
                SELECT e.*, i.nombre AS idioma_nombre, c.nombre AS categoria_nombre 
                FROM elementos e
                JOIN idiomas i ON e.idioma_id = i.id
                JOIN categorias c ON e.categoria_id = c.id
                WHERE e.proximo_repaso <= ? AND e.estado = 'aprendizaje'
                ORDER BY e.id ASC;
            `;
            const resultado = await db_real.query({ statement: sqlQuery, values: [hoy] });
            pendientes = resultado.values || [];
        } catch (error) {
            console.error("Error al cargar repasos desde SQLite móvil:", error);
        }
    } 
    // 2. ESCENARIO EN LA PC: Filtro síncrono sobre el inventario en memoria
    else {
        pendientes = db_elementos.filter(e => e.proximo_repaso <= hoy && e.estado === 'aprendizaje');
    }

    // --- RENDERIZADO VISUAL DE LA EVALUACIÓN ---
    const lblTipo = document.getElementById('repaso-tipo');
    const txtOrigen = document.getElementById('repaso-origen');
    const txtContexto = document.getElementById('repaso-contexto');
    const txtDestino = document.getElementById('repaso-destino');
    const btnMostrar = document.getElementById('btn-mostrar-respuesta');

    if (pendientes.length === 0) {
        if (lblTipo) lblTipo.innerText = "-";
        if (txtOrigen) txtOrigen.innerText = "¡Estás al día! No hay tarjetas pendientes para repasar hoy.";
        if (txtContexto) txtContexto.innerText = "";
        if (btnMostrar) btnMostrar.style.display = 'none';
        tarjetaActual = null;
        return;
    }

    if (btnMostrar) btnMostrar.style.display = 'block';
    
    // Extraemos la primera tarjeta de la fila de pendientes
    const registro = pendientes[0];
    
    // Mapeamos el objeto para homogeneizar la lectura de datos
    tarjetaActual = {
        id: registro.id,
        idioma_id: registro.idioma_id,
        categoria_id: registro.categoria_id,
        tipo: registro.tipo,
        termino: registro.termino,
        traduccion: registro.traduccion,
        contexto: registro.contexto,
        vistas: (registro.vistas || 0) + 1,
        intervalo: registro.intervalo || 0,
        factor_facilidad: registro.factor_facilidad || 2.5,
        repeticiones: registro.repeticiones || 0,
        idioma_nombre: registro.idioma_nombre || "Inglés Americano",
        idioma_simbolo: registro.simbolo || "en-US", // <-- AÑADE ESTA LÍNEA DE RESPALDO
        categoria_nombre: registro.categoria_nombre || "Viajes"
    };

    // Imprimir los datos limpios en la tarjeta web (ocultando los IDs)
    if (lblTipo) lblTipo.innerText = `${tarjetaActual.tipo.toUpperCase()} | ${tarjetaActual.idioma_nombre} | ${tarjetaActual.categoria_nombre}`;
    if (txtOrigen) txtOrigen.innerText = tarjetaActual.termino;
    if (txtContexto) txtContexto.innerText = tarjetaActual.contexto || "Sin contexto adicional registrado";
    if (txtDestino) txtDestino.innerText = tarjetaActual.traduccion;
}

// Ejecuta el algoritmo matemático SM-2 y actualiza los tiempos de la tarjeta
async function calificarTarjeta(calificacion) {
    if (!tarjetaActual) return;

    // Calcular las nuevas variables de memoria en base a la nota del usuario (1 al 4)
    const srs = calcularSRS(
        calificacion, 
        tarjetaActual.intervalo, 
        tarjetaActual.factor_facilidad, 
        tarjetaActual.repeticiones
    );

    // 1. ESCENARIO EN ANDROID: Persistencia nativa mediante UPDATE en SQLite
    if (esAndroid && db_real) {
        try {
            const sqlUpdate = `
                UPDATE elementos 
                SET intervalo = ?, factor_facilidad = ?, repeticiones = ?, estado = ?, proximo_repaso = ?, vistas = ?
                WHERE id = ?;
            `;
            await db_real.run({
                statement: sqlUpdate,
                values: [srs.intervalo, srs.factor_facilidad, srs.repeticiones, srs.estado, srs.proximo_repaso[0], tarjetaActual.vistas, tarjetaActual.id]
            });
        } catch (error) {
            console.error("Error al actualizar la tarjeta en SQLite:", error);
        }
    } 
    // 2. ESCENARIO EN LA PC: Persistencia en los arreglos de simulación
    else {
        const index = db_elementos.findIndex(e => e.id === tarjetaActual.id);
        if (index !== -1) {
            db_elementos[index].intervalo = srs.intervalo;
            db_elementos[index].factor_facilidad = srs.factor_facilidad;
            db_elementos[index].repeticiones = srs.repeticiones;
            db_elementos[index].estado = srs.estado;
            db_elementos[index].proximo_repaso = srs.proximo_repaso[0];
            db_elementos[index].vistas = tarjetaActual.vistas;
        }
    }

    // 3. LOGICA DE ENTRADA AL LOCALSTORAGE (Si el estado cambió a automatizada)
    if (srs.estado === 'automatizada') {
        let automatizadas = JSON.parse(localStorage.getItem('palabras_automatizadas')) || [];
        
        // Evitar registros duplicados en el almacenamiento local
        if (!automatizadas.some(item => item.id === tarjetaActual.id)) {
            automatizadas.push({
                id: tarjetaActual.id,
                termino: tarjetaActual.termino,
                traduccion: tarjetaActual.traduccion,
                contexto: tarjetaActual.contexto,
                idioma: tarjetaActual.idioma_nombre,
                categoria: tarjetaActual.categoria_nombre
            });
            localStorage.setItem('palabras_automatizadas', JSON.stringify(automatizadas));
        }
        alert(`¡Espectacular! Se logró la automatización de este término. Programado para repaso a largo plazo y archivado.`);
    }

    // Cargar inmediatamente la siguiente tarjeta que toque estudiar
    await cargarSesionRepaso();
}



// =========================================================================
// 5. MÓDULO DEL BUSCADOR DE PALABRAS AUTOMATIZADAS (Híbrido + Edición)
// =========================================================================
async function ejecutarBusqueda() {
    const textoBusqueda = document.getElementById('input-busqueda').value.toLowerCase().trim();
    const contenedorResultados = document.getElementById('lista-automatizadas');
    
    if (!contenedorResultados) return;
    contenedorResultados.innerHTML = "";

    let filtradas = [];

    // 1. CASO EN ANDROID: Consulta directa a SQLite Nativo (Filtro por Base de Datos)
    if (esAndroid && db_real) {
        try {
            // Consulta SQL avanzada que une las tablas para traer los nombres legibles de idioma y categoría
            const sqlQuery = `
                SELECT e.*, i.nombre AS idioma_nombre, c.nombre AS categoria_nombre 
                FROM elementos e
                JOIN idiomas i ON e.idioma_id = i.id
                JOIN categorias c ON e.categoria_id = c.id
                WHERE e.estado = 'automatizada' AND (
                    e.termino LIKE ? OR 
                    e.traduccion LIKE ? OR 
                    e.contexto LIKE ?
                )
                ORDER BY e.termino ASC;
            `;
            const patronBusqueda = `%${textoBusqueda}%`;
            const resultado = await db_real.query({
                statement: sqlQuery,
                values: [patronBusqueda, patronBusqueda, patronBusqueda]
            });
            filtradas = resultado.values || [];
        } catch (error) {
            console.error("Error al buscar automatizadas en SQLite:", error);
        }
    } 
    // 2. CASO EN LA PC: Filtro sobre LocalStorage (Simulación para pruebas)
    else {
        const automatizadasSimuladas = JSON.parse(localStorage.getItem('palabras_automatizadas')) || [];
        filtradas = automatizadasSimuladas.filter(item => 
            item.termino.toLowerCase().includes(textoBusqueda) ||
            item.traduccion.toLowerCase().includes(textoBusqueda) ||
            item.contexto.toLowerCase().includes(textoBusqueda)
        );
    }

    // --- RENDERIZADO EN PANTALLA ---
    if (filtradas.length === 0) {
        contenedorResultados.innerHTML = "<p style='color: #666; padding: 10px;'>No hay coincidencias en tu baúl automatizado.</p>";
        return;
    }

    filtradas.forEach(item => {
        // Normalizar nombres para que la simulación de PC y la BD de Android se lean igual
        const nombreIdioma = item.idioma_nombre || item.idioma || "Desconocido";
        const nombreCategoria = item.categoria_nombre || item.categoria || "General";

        // Crear la tarjeta visual con la información y el botón de edición
        const tarjetaHTML = `
            <div style="background: white; padding: 12px; margin-top: 10px; border-radius: 8px; border-left: 5px solid #4caf50; box-shadow: 0 2px 4px rgba(0,0,0,0.05); display: flex; justify-content: space-between; align-items: center;">
                <div style="flex: 1; padding-right: 10px;">
                    <strong style="font-size: 1.1rem; color: #333;">${item.termino}</strong> 
                    <span style="color: #666;">➔ ${item.traduccion}</span> <br>
                    <small style="color: #888; font-style: italic;">${item.contexto || 'Sin contexto'}</small> <br>
                    <span style="font-size: 0.75rem; background: #e0e0e0; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-top: 5px; font-weight: bold;">
                        ${nombreIdioma} | ${nombreCategoria}
                    </span>
                </div>
                <div>
                    <button class="btn-editar-item" data-id="${item.id}" style="background: #ff9800; color: white; border: none; padding: 8px 12px; border-radius: 5px; font-weight: bold; cursor: pointer; font-size: 0.9rem; margin-right: 5px;">✏️</button>
                    <button class="btn-eliminar-item" data-id="${item.id}" style="background: #f44336; color: white; border: none; padding: 8px 12px; border-radius: 5px; font-weight: bold; cursor: pointer; font-size: 0.9rem;">🗑️</button>
                </div>
        `;
        contenedorResultados.innerHTML += tarjetaHTML;
    });

    // Añadir escuchadores dinámicos a los botones de edición para evitar inyecciones de código extrañas
    document.querySelectorAll('.btn-editar-item').forEach(boton => {
        boton.addEventListener('click', function() {
            const idBuscar = parseInt(this.getAttribute('data-id'));
            const elementoAEditar = filtradas.find(e => e.id === idBuscar);
            if (elementoAEditar) {
                // Adaptamos temporalmente los campos del objeto para que correspondan con los selectores
                const datosNormalizados = {
                    id: elementoAEditar.id,
                    idioma_id: elementoAEditar.idioma_id || 1, // Respaldo para simulación de PC
                    categoria_id: elementoAEditar.categoria_id || 1,
                    tipo: elementoAEditar.tipo || 'palabra',
                    termino: elementoAEditar.termino,
                    traduccion: elementoAEditar.traduccion,
                    contexto: elementoAEditar.contexto
                };
                prepararEdicion(datosNormalizados);
            }
        });
    });
    // Al final de ejecutarBusqueda()
    document.querySelectorAll('.btn-eliminar-item').forEach(boton => {
        boton.addEventListener('click', function() {
            const idBuscar = parseInt(this.getAttribute('data-id'));
            eliminarElemento(idBuscar);
        });
    });
}


 // =========================================================================
// 6. CONTROLADOR DE NAVEGACIÓN GENERAL (SPA Híbrido)
// =========================================================================
function cambiarPantalla(idPantallaObjetivo) {
    const pantallas = document.querySelectorAll('.pantalla');
    pantallas.forEach(p => p.classList.add('oculta'));

    const botones = document.querySelectorAll('.btn-nav');
    botones.forEach(b => b.classList.remove('activo'));

    const pantallaDestino = document.getElementById(idPantallaObjetivo);
    if (pantallaDestino) {
        pantallaDestino.classList.remove('oculta');
    }

    // Activar visualmente el botón en la barra inferior
    const botonActivo = Array.from(botones).find(b => b.getAttribute('onclick').includes(idPantallaObjetivo));
    if (botonActivo) {
        botonActivo.classList.add('activo');
    }

    // --- ESCUCHADORES DINÁMICOS DE NAVEGACIÓN ---
    if (idPantallaObjetivo === 'pantalla-registro') {
        console.log("Abriendo registro: Actualizando selectores desde la base de datos...");
        poblarSelectores(); // <-- Corrección clave: lee la BD al abrir la pestaña
    }
    if (idPantallaObjetivo === 'pantalla-repaso') {
        console.log("Cargando sesión de repaso...");
        cargarSesionRepaso();
    }
    if (idPantallaObjetivo === 'pantalla-buscador') {
        console.log("Abriendo baúl de palabras automatizadas...");
        ejecutarBusqueda();
    }
    if (idPantallaObjetivo === 'pantalla-configuracion') {
        console.log("Abriendo ajustes: Actualizando estadísticas...");
        if (typeof actualizarEstadisticas === 'function') {
            actualizarEstadisticas();
        }
    }
}

 // =========================================================================
// 7. MÓDULO DE ESTADÍSTICAS E INDICADORES (Híbrido)
// =========================================================================
async function actualizarEstadisticas() {
    const txtAprendizaje = document.getElementById('est-aprendizaje');
    const txtAutomatizadas = document.getElementById('est-automatizadas');
    
    if (!txtAprendizaje || !txtAutomatizadas) return;

    let totalAprendizaje = 0;
    let totalAutomatizadas = 0;

    // 1. CASO EN ANDROID: Consultas COUNT directas a SQLite Nativo
    if (esAndroid && db_real) {
        try {
            // Contar registros en fase de aprendizaje
            const resAp = await db_real.query({ 
                statement: "SELECT COUNT(*) AS total FROM elementos WHERE estado = 'aprendizaje';" 
            });
            totalAprendizaje = resAp.values[0]?.total || 0;

            // Contar registros ya automatizados
            const resAu = await db_real.query({ 
                statement: "SELECT COUNT(*) AS total FROM elementos WHERE estado = 'automatizada';" 
            });
            totalAutomatizadas = resAu.values[0]?.total || 0;
        } catch (error) {
            console.error("Error al calcular estadísticas en SQLite móvil:", error);
        }
    } 
    // 2. CASO EN LA PC: Conteo sobre los almacenes locales en memoria
    else {
        totalAprendizaje = db_elementos.filter(e => e.estado === 'aprendizaje').length;
        
        // Contamos las que están en el LocalStorage simulado de la PC
        const simAutomatizadas = JSON.parse(localStorage.getItem('palabras_automatizadas')) || [];
        totalAutomatizadas = simAutomatizadas.length;
    }

    // 3. ACTUALIZAR INTERFAZ GRÁFICA
    txtAprendizaje.innerText = totalAprendizaje;
    txtAutomatizadas.innerText = totalAutomatizadas;
    console.log(`Estadísticas al día -> Aprendiendo: ${totalAprendizaje}, Dominadas: ${totalAutomatizadas}`);
}

// =========================================================================
// 8. ACCIÓN DE ELIMINACIÓN HÍBRIDA (SQLite y LocalStorage)
// =========================================================================
async function eliminarElemento(idEliminar) {
    const confirmar = confirm("¿Estás seguro de que deseas eliminar este término por completo de tu vocabulario?");
    if (!confirmar) return;

    // 1. ESCENARIO EN ANDROID: Eliminación física en la base de datos real
    if (esAndroid && db_real) {
        try {
            const sqlDelete = `DELETE FROM elementos WHERE id = ?;`;
            await db_real.run({
                statement: sqlDelete,
                values: [idEliminar]
            });
            alert("Término eliminado de forma permanente de tu SQLite móvil.");
        } catch (error) {
            console.error("Error al eliminar registro en SQLite:", error);
        }
    } 
    // 2. ESCENARIO EN LA PC: Limpieza del inventario de memoria y del LocalStorage
    else {
        // Remover del inventario de estudio en memoria
        db_elementos = db_elementos.filter(e => e.id !== idEliminar);

        // APLICACIÓN DE LA LÓGICA DE LOCALSTORAGE:
        // Extraemos el texto, lo convertimos a arreglo, filtramos y volvemos a guardar en texto
        let automatizadas = JSON.parse(localStorage.getItem('palabras_automatizadas')) || [];
        automatizadas = automatizadas.filter(item => item.id !== idEliminar);
        localStorage.setItem('palabras_automatizadas', JSON.stringify(automatizadas));
        
        alert("[PC] Término removido con éxito del almacenamiento local.");
    }

    // 3. REFRESCO INMEDIATO: Volver a renderizar la lista y actualizar los contadores
    await ejecutarBusqueda();
    if (typeof actualizarEstadisticas === 'function') {
        await actualizarEstadisticas();
    }
}

// =========================================================================
// 9. HERRAMIENTAS AUDITIVAS Y VISUALES (TTS Nativo + Pistas)
// =========================================================================

// Motor de Pronunciación de Texto a Voz (Nativo en PC y Android)
function escucharTermino() {
    if (!tarjetaActual || !tarjetaActual.termino) return;

    // Verificar si el motor de síntesis de voz está disponible en el equipo
    if ('speechSynthesis' in window) {
        // Detener cualquier audio previo que esté sonando para evitar superposiciones
        window.speechSynthesis.cancel();

        const enunciado = new SpeechSynthesisUtterance(tarjetaActual.termino);
        
        // Configurar el idioma de reproducción según el símbolo asignado (ej: 'en-US', 'fr-FR')
        // Si tienes símbolos extendidos, tomamos los primeros dos caracteres (ej: 'en')
        const codigoIdioma = tarjetaActual.idioma_simbolo || 'en';
        enunciado.lang = codigoIdioma;
        
        // Ajustes opcionales de velocidad (1.0 es velocidad normal)
        enunciado.rate = 0.9; 

        window.speechSynthesis.speak(enunciado);
    } else {
        alert("Lo siento, tu dispositivo o navegador no soporta la reproducción de audio nativa.");
    }
}

// Muestra el contexto de manera controlada como una pista de estudio
function mostrarPistaVisual() {
    const txtContexto = document.getElementById('repaso-contexto');
    if (!txtContexto || !tarjetaActual) return;

    // Si está oculto, lo revelamos quitando la clase de control
    if (txtContexto.classList.contains('oculta')) {
        txtContexto.classList.remove('oculta');
        console.log("Pista de contexto revelada al usuario.");
    } else {
        // Si el usuario vuelve a presionar, se oculta para dinámicas de estudio
        txtContexto.classList.add('oculta');
    }
}

// =========================================================================
// 10. CONTROLADORES VISUALES DE LA TARJETA (Doble Cara)
// =========================================================================
function mostrarRespuesta() {
    const dorso = document.getElementById('tarjeta-dorso');
    const btnMostrar = document.getElementById('btn-mostrar-respuesta');
    const grupoBotones = document.getElementById('botones-calificacion');

    if (dorso) dorso.classList.remove('oculta');
    if (btnMostrar) btnMostrar.classList.add('oculta');
    if (grupoBotones) grupoBotones.classList.remove('oculta');
}

function ocultarRespuesta() {
    const dorso = document.getElementById('tarjeta-dorso');
    const btnMostrar = document.getElementById('btn-mostrar-respuesta');
    const grupoBotones = document.getElementById('botones-calificacion');
    const txtContexto = document.getElementById('repaso-contexto');

    if (dorso) dorso.classList.add('oculta');
    if (btnMostrar) btnMostrar.classList.remove('oculta');
    if (grupoBotones) grupoBotones.classList.add('oculta');
    
    // Ocultamos también la pista visual para que la siguiente tarjeta inicie limpia
    if (txtContexto) txtContexto.classList.add('oculta');
}

   
/*
1. Asegúrate de que los archivos `index.html`, `css/estilos.css` y `js/app.js` estén guardados en la ruta `/home/ronaldpuerta/mi_idioma_app/www/`.
2. No necesitas servidores pesados. Abre el administrador de archivos de AntiX Linux, navega hasta la carpeta `www`, haz clic derecho sobre `index.html` y selecciona **"Abrir con" tu navegador web instalado**.
3. **Prueba los tres puntos clave:**
   * Ve a **Registrar**, verás que los idiomas y categorías aparecen limpios en los listados sin IDs numéricos. Agrega un término nuevo.
   * Ve a **Repasar**, la frase simulada "Book a flight" aparecerá inmediatamente porque su fecha configurada está vencida. Dale una calificación.
   * Si quieres forzar la prueba del buscador para ver cómo archiva las automatizadas, puedes cambiar temporalmente en la función `calcularSRS` la condición `if (nuevoIntervalo >= 90)` a `if (nuevoIntervalo >= 1)` y calificar una tarjeta con el botón "Fácil". Verás cómo se traslada inmediatamente a la pestaña "Automatizadas".

¿Pudiste abrir el archivo `index.html` en tu navegador y realizar las primeras pruebas de simulación? 

<FollowUp>
Si las simulaciones funcionan de forma fluida, avísame para enseñarte a:
* **Inicializar el entorno Node** en la carpeta raíz (`npm init`)
* Instalar y estructurar **Capacitor 6** para preparar la aplicación de cara al compilado móvil.
</FollowUp>    
    
*/    
    
    
    
    
    
    
    
