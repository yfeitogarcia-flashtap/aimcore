// Vektor de escritorio: una ventana y nada más.
//
// **No contiene el juego.** La ventana se declara en `tauri.conf.json` con la
// URL del despliegue, así que lo que se ejecuta aquí es literalmente «abre una
// ventana». Es a propósito: una copia empaquetada del juego sería una segunda
// fuente de verdad que hay que mantener al día, y lo que se quería era lo
// contrario —que la app vea siempre lo que ya está desplegado—.
//
// Lo único que hace de más es **la pantalla completa** (vuelta 97), que es lo
// único que una ventana nativa puede dar y una pestaña no: en un navegador F11 es
// del navegador y la API del documento **exige un gesto**, así que «arrancar así»
// es imposible ahí. Y ese es todo el reparto:
//
//   - **Quién decide es la página**, con su ajuste (`SETTINGS.pantallaCompleta`).
//     F11 lo alterna y el panel de opciones lo enseña; las dos cosas escriben el
//     mismo valor, que es lo que hace que «recordar la elección» no necesite un
//     segundo estado que cuadrar.
//   - **Y aquí se obedece y se copia.** La orden llega por IPC y, con ella, se
//     deja escrito en el directorio de configuración lo que había puesto. Hace
//     falta porque el arranque nativo ocurre **antes de que la página exista**:
//     no hay a quién preguntarle, así que se lee la copia. La verdad sigue siendo
//     el ajuste del juego; esto es una copia para el primer instante.
//
// `Ctrl+W` no se toca y no hace nada, que es el motivo por el que agacharse sale
// de fábrica en `Ctrl` **sólo aquí** (`src/keybinds.js`): no hay pestaña que
// cerrar.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;

use tauri::{Manager, WebviewWindow};

/// **La copia en frío de la elección**, junto a la configuración de la app y no
/// al lado del ejecutable: el portable se deja en cualquier carpeta —a veces sin
/// permiso de escritura— y ahí escribir es lo que convierte una preferencia en un
/// fallo al arrancar.
const FICHERO_DE_VENTANA: &str = "ventana.txt";

fn ruta_de_la_copia(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join(FICHERO_DE_VENTANA))
}

/// Lo que se leyó la última vez que la página lo dijo. Sin fichero —o con
/// cualquier cosa dentro— la ventana abre en su tamaño normal, que es el lado
/// seguro: una ventana que abre a pantalla completa sin que nadie lo haya pedido
/// se ve como un fallo.
fn queria_pantalla_completa(app: &tauri::AppHandle) -> bool {
    ruta_de_la_copia(app)
        .and_then(|ruta| fs::read_to_string(ruta).ok())
        .map(|texto| texto.trim() == "1")
        .unwrap_or(false)
}

fn recordar_pantalla_completa(app: &tauri::AppHandle, activa: bool) {
    let Some(ruta) = ruta_de_la_copia(app) else { return };
    if let Some(dir) = ruta.parent() {
        // La primera ejecución no tiene el directorio creado todavía.
        let _ = fs::create_dir_all(dir);
    }
    // Un fallo aquí no puede tirar nada: lo que se pierde es que la próxima vez
    // haya que pulsar F11, no la partida de hoy.
    let _ = fs::write(ruta, if activa { "1" } else { "0" });
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(ventana) = app.get_webview_window("main") {
                // **Se decide antes de mostrarla**, que es la razón por la que la
                // ventana nace invisible en `tauri.conf.json`: ponerla a pantalla
                // completa con la ventana ya en pantalla es un salto visible en
                // cada arranque, y un parpadeo al abrir se lee como un fallo.
                if queria_pantalla_completa(app.handle()) {
                    let _ = ventana.set_fullscreen(true);
                }
                // Y se muestra **siempre**, pase lo que pase con lo de arriba: una
                // ventana invisible por un error al leer un fichero es una app que
                // no abre.
                let _ = ventana.show();
                // El juego captura el ratón por su cuenta (pointer lock); lo
                // único que la ventana pone es el foco al abrir.
                let _ = ventana.set_focus();
            }
            Ok(())
        })
        .on_window_event(|ventana, evento| {
            if let tauri::WindowEvent::Focused(true) = evento {
                let _ = ventana.set_focus();
            }
        })
        .invoke_handler(tauri::generate_handler![pantalla_completa])
        .run(tauri::generate_context!())
        .expect("no se ha podido abrir la ventana de Vektor");
}

/// **Pone o quita la pantalla completa, y lo recuerda.**
///
/// Recibe el valor y no un «alterna», a propósito: quien lleva el estado es el
/// ajuste de la página, así que un alternar aquí sería un segundo estado con el
/// que el de allí puede discrepar —y el síntoma sería F11 dejando la ventana al
/// revés de lo que dice el panel de opciones—. El nombre de la orden está escrito
/// también en `src/config.js` (`ESCRITORIO.ordenPantallaCompleta`), que es la otra
/// punta de esta línea.
#[tauri::command]
fn pantalla_completa(ventana: WebviewWindow, activa: bool) {
    let _ = ventana.set_fullscreen(activa);
    recordar_pantalla_completa(ventana.app_handle(), activa);
}
