# Talk Again

Tablero de comunicación para una persona que **perdió el habla tras un ictus** pero entiende lo que se le dice y puede responder con la cabeza, con la mano o con la mirada. Pensado para usarse en la cama del hospital o en casa, en una tablet o un teléfono, por la propia persona o con ayuda de un acompañante.

Es una página web sin servidor: no hay cuentas, no se envía nada a internet y funciona sin conexión una vez abierta. Todo lo que se dice queda guardado en el dispositivo para enseñárselo al personal sanitario.

## Qué hace

| Pantalla | Para qué sirve |
| --- | --- |
| **Sí / No** | Dos botones gigantes (SÍ verde, NO rojo) más «No sé», «Más o menos» y «Repite». El acompañante puede escribir la pregunta para que quede guardada junto con la respuesta. |
| **Frases** | Tablero de pictogramas por categorías: rápidas, necesidades, sentimientos, personas, actividades, preguntas y salud. Al tocar una frase la tablet la dice en voz alta. Las frases se pueden editar y añadir. |
| **Dolor** | Mapa del cuerpo (delante y detrás) para señalar dónde duele, escala de 0 a 10 con caras y frases sobre el tipo de dolor. |
| **Deletrear** | Teclado grande con predicción de palabras, tilde, y frases guardadas con un toque. Útil si la persona conserva la lectoescritura. |
| **Historial** | Todo lo dicho, con hora, agrupado por día. Se puede copiar para enviarlo al médico o al cambio de turno. |
| **AYUDA** | Botón siempre visible: suena una alarma, la pantalla parpadea y la voz dice «Necesito ayuda». |
| **Barrido** | Si la persona no puede tocar la pantalla: las opciones se iluminan una a una (por filas y luego dentro de la fila) y se elige tocando cualquier parte de la pantalla, con un pulsador Bluetooth, con las teclas Espacio/Intro o asintiendo frente a la cámara. |
| **Cámara (experimental)** | Detecta asentir (= Sí) y negar (= No) con la cámara frontal. Las imágenes se procesan en el dispositivo. |

Ajustes: voz en español y velocidad, tamaño del texto hasta «enorme», tema claro/oscuro, tiempo del barrido, sensibilidad de la cámara, personas importantes, editor de frases y copia de seguridad en texto.

## Probar ahora

1. **Sin instalar nada:** cuando GitHub Pages esté activado (ver abajo), la app vive en `https://jesubarba123.github.io/talk-again/`.
2. **En local:** descarga el repositorio y abre `index.html` en Chrome, Edge o Safari. O ejecuta `npm start` y entra en `http://localhost:8080`.
3. **Instalar en la tablet o el teléfono** (para que ocupe toda la pantalla y funcione sin internet):
   - Android / Chrome: menú ⋮ → **Añadir a pantalla de inicio** (o «Instalar aplicación»).
   - iPhone / iPad / Safari: botón Compartir → **Añadir a pantalla de inicio**.

Para que se oiga la voz, sube el volumen y toca cualquier botón una primera vez (los navegadores exigen un toque antes de reproducir sonido). En Android conviene tener instalada «Síntesis de voz de Google» con español; en iPhone/iPad, Ajustes → Accesibilidad → Contenido hablado → Voces → Español.

## Cómo usarlo con la persona

Lee la [guía para la familia](docs/GUIA-FAMILIA.md). Resumen:

- Primero acordad un **sí y un no claros** (asentir y negar, levantar la mano, mirar a la derecha…) y comprobadlos con preguntas obvias.
- Haced **una pregunta cerrada a la vez**, de lo general a lo concreto: «¿Necesitas algo?» → «¿Es dolor?» → «¿En la cabeza?». La pantalla **Dolor** acorta ese camino.
- Repetid en voz alta lo que entendisteis antes de actuar.
- La persona se cansa rápido. Sesiones cortas, y el **Historial** evita volver a preguntar lo mismo en cada turno.

## Barrido y pulsadores

Pulsa **▶ Barrido** en la barra superior. Las filas se iluminan una a una; al elegir una fila, se iluminan sus opciones. Para elegir:

- tocar en cualquier parte de la pantalla (configurable), o el botón **SELECCIONAR**;
- un pulsador de accesibilidad Bluetooth (la mayoría envía la tecla Espacio o Intro);
- teclado: Espacio/Intro elige, flechas avanzan o retroceden, Escape vuelve atrás;
- cámara: asentir elige, negar vuelve atrás.

Tras unas vueltas sin elegir (configurable) el barrido se detiene en espera para no cansar; cualquier toque, pulsación o gesto lo reanuda. El botón **Pausa** deja la pantalla en modo normal para que el acompañante toque directamente.

Las propias tablets también tienen barrido integrado y configurable con pulsadores: **Control por botón** en iPad/iPhone (Ajustes → Accesibilidad) y **Accesibilidad con interruptores** en Android. Funcionan sobre esta app como sobre cualquier otra.

## Cámara: asentir y negar

En Ajustes → Cámara activa «Detectar gestos de cabeza» y pulsa «Probar ahora». La primera vez el navegador pide permiso de cámara y descarga el modelo de detección (unos 10 MB, hace falta internet solo esa vez). Un recuadro pequeño muestra la cámara y el estado: «Buscando la cara…», «Cara detectada», «Asentir: SÍ».

- En **Sí / No**, asentir responde SÍ y negar responde NO.
- Con el **barrido** activo, asentir elige la opción iluminada y negar vuelve a la lista de filas.
- Ajusta la **sensibilidad** si no detecta gestos pequeños (sube) o detecta movimientos involuntarios (baja).

Es experimental: necesita buena luz, la cara de frente y la tablet estable (un soporte ayuda). No sustituye al pulsador cuando la fiabilidad importa, por ejemplo para decidir medicación. La detección usa [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) dentro del navegador; ninguna imagen sale del dispositivo.

## Publicar en GitHub Pages

El repositorio incluye el workflow `.github/workflows/pages.yml`. Una sola vez, en GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Cada cambio en `main` se publica en `https://jesubarba123.github.io/talk-again/`. (También funciona la opción clásica «Deploy from a branch» con la rama `main` y la carpeta raíz: no hay nada que compilar.)

## Desarrollo

Sin frameworks ni compilación. Archivos:

- `index.html`, `styles.css`: estructura y estilos (tokens de color, tema claro/oscuro, tamaños grandes).
- `data.js`: vocabulario por defecto en español, mapa del cuerpo, filas del teclado y palabras para la predicción.
- `app.js`: voz, barrido, pantallas, historial, ajustes y copia de seguridad.
- `nod-detector.js`: detección de asentir/negar con la cámara.
- `sw.js`, `manifest.webmanifest`, `icons/`: instalación y uso sin conexión.
- `tests/smoke.mjs`: prueba de humo con Playwright (recorre todas las pantallas, comprueba barrido, historial, ajustes y que no hay desbordamiento en móvil).

```bash
npm install          # solo para las pruebas (Playwright)
npm test             # ejecuta tests/smoke.mjs
npm start            # servidor local en http://localhost:8080
```

Los pictogramas son emojis del propio dispositivo, así no hay que descargar imágenes. Si queréis pictogramas más claros, una mejora natural es usar los de [ARASAAC](https://arasaac.org/) (gratuitos para uso no comercial).

## Apps ya existentes que merece la pena probar

Antes o además de esta app, conviene probar lo que ya existe; un logopeda o fonoaudiólogo puede ayudar a elegir según cómo esté la comprensión, la lectura y la movilidad de la persona.

- [**Cboard**](https://www.cboard.io/) — gratuita y de código abierto, en español, con pictogramas, para web, Android, iOS y Windows. Muy parecida en espíritu a Talk Again, con muchos más símbolos.
- [**Háblalo**](https://www.infobae.com/salud/2023/08/12/la-nueva-era-de-la-accesibilidad-como-funciona-la-plataforma-que-facilita-la-comunicacion-de-personas-con-discapacidades/) — app argentina gratuita (Android/iOS) que convierte texto en voz y voz en texto, funciona sin internet.
- [**Look to Speak**](https://androidcentral.com/google-look-to-speak-app-more-language-support) (Google, Android, gratuita) — se eligen frases moviendo los ojos a izquierda o derecha; disponible en español.
- **Live Speech** (iPhone/iPad, incluido en iOS): se escribe y el dispositivo lo dice en voz alta, también en llamadas. Ajustes → Accesibilidad → Habla en vivo.
- **Proloquo2Go**, **TD Snap**, **Grid** — apps profesionales de pago con español, mucho vocabulario y soporte de pulsadores y mirada; suelen recomendarlas los logopedas cuando la comunicación aumentativa va a ser de largo plazo.
- [**VerbalizAPP**](https://www.idipaz.es/ficheros/files/35_a%20VerbalizApp.pdf) — app de rehabilitación de la afasia desarrollada con el Hospital La Paz (Madrid), orientada a terapia más que a comunicación diaria.
- [**Yes or No**](https://github.com/akramhussein/yes-or-no) — proyecto abierto para iPad creado para una persona tras un ictus: solo Sí/No, pensado para usar con el Control por botón.

## Importante

Esta herramienta **no sustituye** la valoración de un **logopeda o fonoaudiólogo** ni del equipo de rehabilitación. Tras un ictus, el habla puede mejorar durante meses con terapia; la comunicación aumentativa sirve para comunicarse mientras tanto y reduce la frustración, no frena la recuperación. Pide al hospital una valoración de comunicación aumentativa lo antes posible.
