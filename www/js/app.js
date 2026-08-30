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
// 4. FLUJO DE LA SESIÓN DE REPASO
// =========================================================================
function cargarSesionRepaso() {
    ocultarRespuesta();
    const hoy = new Date().toISOString().split('T')[0];
    
    // Filtrar elementos pendientes (cuya fecha sea menor o igual a hoy y estén en aprendizaje)
    const pendientes = db_elementos.filter(e => e.proximo_repaso <= hoy && e.estado === 'aprendizaje');

    if (pendientes.length === 0) {
        document.getElementById('repaso-tipo').innerText = "-";
        document.getElementById('repaso-origen').innerText = "¡Estás al día! No hay tarjetas pendientes.";
        document.getElementById('repaso-contexto').innerText = "";
        document.getElementById('btn-mostrar-respuesta').style.display = 'none';
        return;
    }

    document.getElementById('btn-mostrar-respuesta').style.display = 'block';
    tarjetaActual = pendientes[0]; // Tomamos la primera de la lista
    tarjetaActual.vistas++;

    // Mostrar datos legibles buscando sus nombres mediante sus IDs de forma transparente
    const idiomaObj = db_idiomas.find(i => i.id === tarjetaActual.idioma_id);
    const catObj = db_categorias.find(c => c.id === tarjetaActual.categoria_id);

    document.getElementById('repaso-tipo').innerText = `${tarjetaActual.tipo.toUpperCase()} | ${idiomaObj.nombre} | ${catObj.nombre}`;
    document.getElementById('repaso-origen').innerText = tarjetaActual.termino;
    document.getElementById('repaso-contexto').innerText = tarjetaActual.contexto || "Sin contexto adicional";
    document.getElementById('repaso-destino').innerText = tarjetaActual.traduccion;
}

function calificarTarjeta(calificacion) {
    // Ejecutar el algoritmo matemático
    const resultadoSRS = calcularSRS(
        calificacion, 
        tarjetaActual.intervalo, 
        tarjetaActual.factor_facilidad, 
        tarjetaActual.repeticiones
    );

    // Actualizar el elemento en nuestra simulación de base de datos
    tarjetaActual.intervalo = resultadoSRS.intervalo;
    tarjetaActual.factor_facilidad = resultadoSRS.factor_facilidad;
    tarjetaActual.repeticiones = resultadoSRS.repeticiones;
    tarjetaActual.proximo_repaso = resultadoSRS.proximo_repaso;
    tarjetaActual.estado = resultadoSRS.estado;

    // Verificar si se automatizó para mandarla al Storage exclusivo
    if (resultadoSRS.estado === 'automatizada') {
        let automatizadas = JSON.parse(localStorage.getItem('palabras_automatizadas')) || [];
        
        const idiomaObj = db_idiomas.find(i => i.id === tarjetaActual.idioma_id);
        const catObj = db_categorias.find(c => c.id === tarjetaActual.categoria_id);

        automatizadas.push({
            id: tarjetaActual.id,
            termino: tarjetaActual.termino,
            traduccion: tarjetaActual.traduccion,
            contexto: tarjetaActual.contexto,
            idioma: idiomaObj.nombre,
            categoria: catObj.nombre
        });
        localStorage.setItem('palabras_automatizadas', JSON.stringify(automatizadas));
        alert(`¡Espectacular! La frase se ha automatizado (Intervalo: ${resultadoSRS.intervalo} días) y se archivó.`);
    }

    // Recargar la pantalla para mostrar la siguiente tarjeta pendiente
    cargarSesionRepaso();
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
                    <!-- El botón convierte el objeto a JSON seguro para inyectarlo en la función de edición -->
                    <button class="btn-editar-item" data-id="${item.id}" style="background: #ff9800; color: white; border: none; padding: 8px 12px; border-radius: 5px; font-weight: bold; cursor: pointer; font-size: 0.9rem;">✏️</button>
                </div>
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

    // Acciones automáticas al abrir pestañas específicas
    if (idPantallaObjetivo === 'pantalla-repaso') {
        // Aquí llamaremos a la carga de tarjetas cuando la migremos
        console.log("Cargando sesión de repaso...");
    }
    if (idPantallaObjetivo === 'pantalla-buscador') {
        // Aquí llamaremos al buscador cuando lo migremos
        console.log("Abriendo baúl de palabras automatizadas...");
    }
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
    
    
    
    
    
    
    
