// Vektor de escritorio: una ventana y nada más.
//
// **No contiene el juego.** La ventana se declara en `tauri.conf.json` con la
// URL del despliegue, así que lo que se ejecuta aquí es literalmente «abre una
// ventana». Es a propósito: una copia empaquetada del juego sería una segunda
// fuente de verdad que hay que mantener al día, y lo que se quería era lo
// contrario —que la app vea siempre lo que ya está desplegado—.
//
// Lo único que se añade es cerrar con lo que la gente espera: F11 a pantalla
// completa. `Ctrl+W` **no se toca y no hace nada**, que es el motivo del
// encargo: aquí no hay pestaña que cerrar.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, WebviewWindow};

fn alternar_pantalla_completa(ventana: &WebviewWindow) {
    let completa = ventana.is_fullscreen().unwrap_or(false);
    let _ = ventana.set_fullscreen(!completa);
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(ventana) = app.get_webview_window("main") {
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

/// F11 desde la página, por si algún día el juego quiere ofrecerlo en su menú.
/// Hoy no lo llama nadie y está aquí porque es lo único que una ventana nativa
/// puede hacer y una pestaña no.
#[tauri::command]
fn pantalla_completa(ventana: WebviewWindow) {
    alternar_pantalla_completa(&ventana);
}
