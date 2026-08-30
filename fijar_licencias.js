const fs = require('fs');
const path = require('path');

// Directorio objetivo dentro de tu SDK local
const dirLicencias = path.join('/home/ronaldpuerta/android-sdk', 'licenses');

// Crear la carpeta si no existe
if (!fs.existsSync(dirLicencias)){
    fs.mkdirSync(dirLicencias, { recursive: true });
}

// Hashes oficiales requeridos por Google de forma binaria estricta
const hashLicencia = "24731d66a0dec8b4d36a8d18e458b002569f3d1b\n4782530a7d77b0b935574568b0c665a5fe7a5745\nd56f17341b56ce8de02d08a59cb4a5dfa9a629b";
const hashPreview = "84831b9409646a918e30573bab4c9c91346d8abd";

// Escribir los archivos asegurando codificación UTF-8 sin caracteres extraños de consola
fs.writeFileSync(path.join(dirLicencias, 'android-sdk-license'), hashLicencia, 'utf-8');
fs.writeFileSync(path.join(dirLicencias, 'android-sdk-preview-license'), hashPreview, 'utf-8');

console.log("✅ ¡Archivos de licencias generados con formato binario puro en el SDK!");
