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
//   - **El ajuste es de la página** (`SETTINGS.pantallaCompleta`): el panel de
//     opciones lo enseña y lo escribe, y la ventana obedece por IPC.
//   - **F11 es de la ventana** (vuelta 98). En la 97 lo escuchaba la página, y
//     eso lo colgaba de que la página supiera que está en la app —que es justo
//     lo que falló—. Aquí F11 funciona aunque la página no sepa nada: se pone o
//     se quita, se copia al fichero y **se le cuenta a la página**, que actualiza
//     su ajuste. Los dos lados escriben el mismo valor, así que siguen sin ser
//     dos estados.
//   - **Y se copia en frío.** El arranque nativo ocurre **antes de que la página
//     exista**: no hay a quién preguntarle, así que se lee la copia.
//
// Y una cosa más, que es la que faltaba en la 97: **la página tiene que poder
// saber que está aquí**. Se lo dicen dos señales, y las dos son nativas y no
// dependen del origen: el agente de usuario de `tauri.conf.json` y una marca que
// se inyecta en cada documento antes que ningún script suyo
// (`window.__VEKTOR_ESCRITORIO__`). Con una sola, un fallo de esa sola deja la
// app sin `Ctrl` y sin pantalla completa **sin un error en ninguna pantalla**.
//
// `Ctrl+W` no se toca y no hace nada, que es el motivo por el que agacharse sale
// de fábrica en `Ctrl` **sólo aquí** (`src/keybinds.js`): no hay pestaña que
// cerrar.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;

use tauri::{Manager, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

/// La ventana que declara `tauri.conf.json`. Se declara ahí con `create: false`
/// y se construye aquí, porque la marca de abajo sólo se puede poner desde Rust.
const VENTANA: &str = "main";

/// El nombre del aviso que recibe la página cuando F11 cambia la ventana. Está
/// escrito también en `src/escritorio.js`, que es la otra punta.
const AVISO_A_LA_PAGINA: &str = "vektor:pantalla-completa";

/// F11 sin modificadores.
fn atajo_de_pantalla_completa() -> Shortcut {
    Shortcut::new(None, Code::F11)
}

/// **ESC también es de la ventana** (vuelta 105). Si ESC llega a la página con
/// el ratón capturado, lo suelta el navegador, y Chrome trata esa salida como
/// del usuario: para volver exige un gesto, y ESC no lo es. Quedándose la tecla
/// aquí y contándoselo a la página, **la que suelta el ratón es la página**, y
/// entonces volver no pide gesto ni espera: ESC reanuda a la primera, siempre.
/// Con el ratón ya suelto, la página lo convierte en una pulsación normal, así
/// que los menús lo entienden igual que en un navegador (`src/game/captura.js`).
fn atajo_de_escape() -> Shortcut {
    Shortcut::new(None, Code::Escape)
}

/// El aviso de ESC. Escrito también en `src/game/captura.js`.
const AVISO_DE_ESCAPE: &str = "vektor:escape";

/// **La marca que la página lee para saber dónde está**, inyectada en cada
/// documento antes que ningún script suyo. Congelada, y con la versión dentro:
/// es también lo que enseña el panel de opciones, que es la forma de comprobar a
/// simple vista que la página se ha enterado.
fn marca_de_la_app(version: &str) -> String {
    format!(
        "Object.defineProperty(window, '__VEKTOR_ESCRITORIO__', {{ value: Object.freeze({{ version: {version:?} }}), enumerable: false }});"
    )
}

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

/// Pone o quita, recuerda y se lo cuenta a la página. El último paso es un
/// `eval` y no un evento de Tauri: el puente de eventos pasa por la capacidad,
/// que está atada al origen, y esto tiene que llegar aunque el dominio cambie.
fn alternar_desde_la_ventana(ventana: &WebviewWindow) {
    let activa = !ventana.is_fullscreen().unwrap_or(false);
    let _ = ventana.set_fullscreen(activa);
    recordar_pantalla_completa(ventana.app_handle(), activa);
    let _ = ventana.eval(format!(
        "window.dispatchEvent(new CustomEvent({AVISO_A_LA_PAGINA:?}, {{ detail: {activa} }}))"
    ));
}

/// **F11 sólo es de Vektor mientras Vektor tiene el foco.** El atajo es global
/// del sistema —es la única forma de que una ventana con una página remota vea
/// una tecla antes que la página—, así que se registra al ganar el foco y se
/// suelta al perderlo: F11 en el navegador de al lado tiene que seguir siendo
/// del navegador. Un fallo al registrarlo (otra app se ha quedado con F11) no
/// tira nada: la página sigue escuchando F11 como en la 97.
fn escuchar_f11(app: &tauri::AppHandle, escuchar: bool) {
    let atajos = app.global_shortcut();
    // Y ESC con la misma regla (vuelta 105): sólo con el foco, o ESC dejaría de
    // funcionar en el resto de programas mientras Vektor está abierto.
    for atajo in [atajo_de_pantalla_completa(), atajo_de_escape()] {
        let puesto = atajos.is_registered(atajo);
        if escuchar && !puesto {
            let _ = atajos.register(atajo);
        } else if !escuchar && puesto {
            let _ = atajos.unregister(atajo);
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, atajo, evento| {
                    if evento.state != ShortcutState::Pressed {
                        return;
                    }
                    let Some(ventana) = app.get_webview_window(VENTANA) else { return };
                    if *atajo == atajo_de_pantalla_completa() {
                        alternar_desde_la_ventana(&ventana);
                    } else if *atajo == atajo_de_escape() {
                        // Un `eval` y no un evento de Tauri, por lo mismo que F11:
                        // tiene que llegar aunque el dominio cambie.
                        let _ = ventana.eval(format!(
                            "window.dispatchEvent(new CustomEvent({AVISO_DE_ESCAPE:?}))"
                        ));
                    }
                })
                .build(),
        )
        .setup(|app| {
            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|ventana| ventana.label == VENTANA)
                .cloned()
                .expect("tauri.conf.json tiene que declarar la ventana principal");
            let version = app.package_info().version.to_string();
            let ventana = WebviewWindowBuilder::from_config(app.handle(), &config)?
                .initialization_script(marca_de_la_app(&version))
                .build()?;
            {
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
            escuchar_f11(app.handle(), true);
            Ok(())
        })
        .on_window_event(|ventana, evento| {
            if let tauri::WindowEvent::Focused(foco) = evento {
                escuchar_f11(ventana.app_handle(), *foco);
            }
        })
        .invoke_handler(tauri::generate_handler![pantalla_completa, salir])
        .run(tauri::generate_context!())
        .expect("no se ha podido abrir la ventana de Vektor");
}

/// **Pone o quita la pantalla completa, y lo recuerda.**
///
/// Recibe el valor y no un «alterna», a propósito: cuando la orden viene de la
/// página, quien lleva el estado es su ajuste, así que un alternar aquí sería un
/// segundo estado con el que el de allí puede discrepar. El único que alterna es
/// F11 (`alternar_desde_la_ventana`), y ése le cuenta el resultado a la página
/// para que su ajuste diga lo mismo. El nombre de la orden está escrito también
/// en `src/config.js` (`ESCRITORIO.ordenPantallaCompleta`), que es la otra punta
/// de esta línea.
#[tauri::command]
fn pantalla_completa(ventana: WebviewWindow, activa: bool) {
    let _ = ventana.set_fullscreen(activa);
    recordar_pantalla_completa(ventana.app_handle(), activa);
}

/// **Cierra la aplicación** (vuelta 99): el botón «Salir» de la pantalla de
/// inicio. Una página no puede cerrarse sola —un navegador ignora
/// `window.close()` en una pestaña que no abrió ella—, así que quien sale es el
/// proceso. El nombre está escrito también en `src/config.js`
/// (`ESCRITORIO.ordenSalir`). Si esta orden no llegara, la página pide a Tauri
/// que cierre la ventana (`core:window:allow-close`), y cerrar la única ventana
/// también termina la aplicación.
#[tauri::command]
fn salir(app: tauri::AppHandle) {
    app.exit(0);
}
