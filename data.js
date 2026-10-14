/* Talk Again — vocabulario por defecto (español neutro, pensado para Latinoamérica y España).
   Cada categoría: id, nombre, emoji, clase de color (clave de Fitzgerald) e items.
   Item: e = emoji mostrado, t = texto en el botón, s = texto que se pronuncia (si falta, se usa t),
   urgent = resalta el borde en rojo. "{o}" se convierte en "o" o "a" según el ajuste hombre/mujer.
   Lo que se dirige a otras personas va en "ustedes" (sirve para la familia y para el personal). */
window.TA_DATA = {
  version: "0.2.0",

  categories: [
    {
      id: "rapidas", name: "Rápidas", emoji: "⚡", k: "k-social",
      items: [
        { e: "👍", t: "Sí" },
        { e: "👎", t: "No" },
        { e: "🤷", t: "No sé" },
        { e: "🆘", t: "Ayuda", s: "Necesito ayuda", urgent: true },
        { e: "✋", t: "Espera", s: "Esperen un momento, por favor" },
        { e: "🔁", t: "Otra vez", s: "Repitan, por favor" },
        { e: "🐢", t: "Más despacio", s: "Más despacio, por favor" },
        { e: "✅", t: "Entendí", s: "Sí, entendí" },
        { e: "❓", t: "No entendí", s: "No entendí, ¿me lo explican otra vez?" },
        { e: "❌", t: "Eso no", s: "No, no es eso" },
        { e: "🙏", t: "Gracias" },
        { e: "🙂", t: "Estoy bien" },
        { e: "🤲", t: "Quédate conmigo", s: "Quédate conmigo un rato, por favor" },
        { e: "🚪", t: "Quiero estar sol{o}", s: "Quiero estar sol{o} un rato" },
        { e: "💤", t: "Déjenme descansar", s: "Déjenme descansar, por favor" },
        { e: "✍️", t: "Escríbanlo", s: "Escríbanlo, por favor, lo leo mejor" },
        { e: "🗣️", t: "Quiero intentar hablar", s: "Quiero intentar decirlo yo, denme tiempo" },
        { e: "👋", t: "Hola" },
        { e: "😘", t: "Te quiero" },
        { e: "🫶", t: "Gracias por venir", s: "Gracias por venir. Hasta mañana" }
      ]
    },
    {
      id: "necesidades", name: "Necesidades", emoji: "🧴", k: "k-action",
      items: [
        { e: "🤕", t: "Tengo dolor", urgent: true },
        { e: "😮‍💨", t: "No respiro bien", s: "No puedo respirar bien", urgent: true },
        { e: "🚻", t: "Quiero ir al baño", urgent: true },
        { e: "🚽", t: "Orinar", s: "Necesito orinar" },
        { e: "🚽", t: "Evacuar", s: "Necesito evacuar" },
        { e: "🤢", t: "Tengo náuseas", urgent: true },
        { e: "😵‍💫", t: "Estoy maread{o}" },
        { e: "💧", t: "Tengo sed" },
        { e: "🍽️", t: "Tengo hambre" },
        { e: "🙅", t: "Ya no quiero más", s: "Ya no quiero más, gracias" },
        { e: "🔄", t: "Cambiar de posición", s: "Quiero cambiar de posición" },
        { e: "🛏️", t: "Acomodarme", s: "Estoy incómod{o}, acomódenme la almohada o la cama, por favor" },
        { e: "💦", t: "Estoy mojad{o}", s: "Estoy mojad{o}, necesito que me cambien", urgent: true },
        { e: "🥶", t: "Tengo frío" },
        { e: "🥵", t: "Tengo calor" },
        { e: "😴", t: "Quiero dormir" },
        { e: "🪑", t: "Quiero sentarme" },
        { e: "🛌", t: "Quiero acostarme" },
        { e: "💊", t: "Mi medicina", s: "Quiero mi medicina" },
        { e: "👓", t: "Mis lentes", s: "Necesito mis lentes" },
        { e: "🧻", t: "Que me limpien", s: "Necesito que me limpien" },
        { e: "🚿", t: "Quiero bañarme" },
        { e: "🪥", t: "Lavarme los dientes", s: "Quiero lavarme los dientes" },
        { e: "🩹", t: "Me molesta algo", s: "Me molesta algo en el cuerpo" },
        { e: "🔇", t: "Menos ruido", s: "Hay mucho ruido, por favor bajen el volumen" },
        { e: "💡", t: "Luz", s: "Quiero más luz o menos luz, por favor" },
        { e: "🪟", t: "Ventana", s: "Quiero abrir o cerrar la ventana" }
      ]
    },
    {
      id: "sentimientos", name: "Sentimientos", emoji: "💙", k: "k-feel",
      items: [
        { e: "🙂", t: "Estoy bien" },
        { e: "😢", t: "Estoy triste" },
        { e: "😠", t: "Estoy enojad{o}" },
        { e: "😨", t: "Tengo miedo" },
        { e: "😰", t: "Estoy nervios{o}", s: "Estoy nervios{o}, ansios{o}" },
        { e: "😤", t: "Estoy frustrad{o}", s: "Estoy frustrad{o}, no me entienden" },
        { e: "😩", t: "Estoy cansad{o}" },
        { e: "😟", t: "Estoy preocupad{o}" },
        { e: "😳", t: "Me da vergüenza", s: "Me da vergüenza esta situación" },
        { e: "🥱", t: "Estoy aburrid{o}" },
        { e: "😌", t: "Estoy tranquil{o}" },
        { e: "😔", t: "Me siento sol{o}" },
        { e: "🤗", t: "Quiero compañía" },
        { e: "😊", t: "Me alegra verte", s: "Me alegra mucho verte" },
        { e: "😂", t: "Me hace reír" },
        { e: "🚶", t: "Ya pueden irse", s: "Ya pueden irse tranquilos, estoy cansad{o}" }
      ]
    },
    {
      id: "personas", name: "Personas", emoji: "👥", k: "k-people",
      items: [
        { e: "👩‍⚕️", t: "Enfermera", s: "Llamen a la enfermera, por favor" },
        { e: "🩺", t: "Médico", s: "Quiero hablar con el médico" },
        { e: "🗣️", t: "Fonoaudiólogo", s: "Quiero ver al fonoaudiólogo o logopeda" },
        { e: "🦵", t: "Kinesiólogo", s: "Quiero ver al kinesiólogo o fisioterapeuta" },
        { e: "👨‍👩‍👧", t: "Mi familia", s: "Quiero ver a mi familia" },
        { e: "📞", t: "Llamar a alguien", s: "Quiero llamar a alguien por teléfono" },
        { e: "❓", t: "¿Quién es usted?", s: "Perdón, ¿quién es usted?" }
      ]
    },
    {
      id: "actividades", name: "Actividades", emoji: "📺", k: "k-thing",
      items: [
        { e: "📺", t: "Ver la tele", s: "Quiero ver la televisión" },
        { e: "🎵", t: "Música", s: "Quiero escuchar música" },
        { e: "📻", t: "Radio", s: "Quiero escuchar la radio" },
        { e: "📖", t: "Que me lean", s: "Quiero que me lean algo" },
        { e: "📱", t: "Mi teléfono", s: "Quiero mi teléfono" },
        { e: "🌳", t: "Salir afuera", s: "Quiero salir afuera un rato" },
        { e: "🙏", t: "Rezar", s: "Quiero rezar" },
        { e: "🖼️", t: "Ver fotos", s: "Quiero ver fotos" },
        { e: "✍️", t: "Escribir", s: "Quiero intentar escribir" },
        { e: "🚶", t: "Caminar", s: "Quiero intentar caminar o moverme" },
        { e: "🧩", t: "Ejercicios", s: "Quiero hacer los ejercicios de rehabilitación" },
        { e: "🌙", t: "Apagar todo", s: "Quiero apagar todo y descansar" }
      ]
    },
    {
      id: "preguntas", name: "Preguntas", emoji: "❓", k: "k-question",
      items: [
        { e: "🕐", t: "¿Qué hora es?" },
        { e: "📅", t: "¿Qué día es hoy?" },
        { e: "🏠", t: "¿Cuándo vuelvo a casa?" },
        { e: "❓", t: "¿Qué me pasa?", s: "¿Qué me pasa? Explíquenmelo, por favor" },
        { e: "🩻", t: "¿Qué me van a hacer?", s: "¿Qué me van a hacer? Explíquenmelo antes, por favor" },
        { e: "⚠️", t: "¿Es grave?", s: "¿Es grave lo que tengo?" },
        { e: "🥤", t: "¿Puedo comer o beber?", s: "¿Puedo comer o beber algo?" },
        { e: "🩺", t: "¿Qué dijo el médico?" },
        { e: "👥", t: "¿Quién viene hoy?" },
        { e: "💊", t: "¿Qué medicina es?", s: "¿Qué medicina es esta y para qué sirve?" },
        { e: "📍", t: "¿Dónde estoy?" },
        { e: "⏳", t: "¿Cuánto falta?", s: "¿Cuánto tiempo falta?" },
        { e: "🗣️", t: "¿Voy a volver a hablar?" }
      ]
    },
    {
      id: "salud", name: "Salud", emoji: "🏥", k: "k-health",
      items: [
        { e: "🛎️", t: "Llamen a la enfermera", s: "Llamen a la enfermera, por favor", urgent: true },
        { e: "😵", t: "Me siento peor", s: "Me siento peor que antes", urgent: true },
        { e: "💊", t: "Algo para el dolor", s: "Necesito algo para el dolor", urgent: true },
        { e: "🫁", t: "Me atraganto", s: "Me atraganto al tragar, cuidado con la comida y el agua", urgent: true },
        { e: "⚠️", t: "Me voy a caer", s: "Me voy a caer, sujétenme", urgent: true },
        { e: "🤒", t: "Tengo fiebre", s: "Creo que tengo fiebre" },
        { e: "💉", t: "Me duele la vía", s: "Me duele donde tengo la vía o el suero" },
        { e: "🩹", t: "El vendaje", s: "Me molesta el vendaje" },
        { e: "🚽", t: "Estoy estreñid{o}", s: "Hace días que no evacúo, estoy estreñid{o}" },
        { e: "👄", t: "Boca seca", s: "Tengo la boca seca" },
        { e: "🤧", t: "Quiero sonarme", s: "Quiero sonarme la nariz" },
        { e: "🧠", t: "Me cuesta pensar", s: "Me cuesta pensar y concentrarme" },
        { e: "👁️", t: "Veo mal", s: "No veo bien" },
        { e: "👂", t: "No oigo bien" },
        { e: "😊", t: "Me siento mejor" }
      ]
    }
  ],

  /* Armar frase: comienzo + continuación (+ añadido). Las continuaciones más usadas suben solas. */
  builder: {
    starts: [
      { e: "🙋", t: "Quiero", next: ["agua", "comer", "ir al baño", "dormir", "sentarme", "acostarme", "ver la tele", "escuchar música", "salir un rato", "descansar", "mi teléfono", "que me lean", "hablar con el médico", "intentar hablar", "otra cosa"] },
      { e: "🙅", t: "No quiero", next: ["esto", "comer ahora", "más", "que me muevan", "visitas ahora", "la tele", "dormir todavía", "la medicina ahora", "estar sol{o}", "que me toquen", "seguir"] },
      { e: "🤲", t: "Tengo", next: ["sed", "hambre", "frío", "calor", "dolor", "miedo", "sueño", "náuseas", "ganas de ir al baño", "picazón", "ganas de toser", "una pregunta"] },
      { e: "🤕", t: "Me duele", next: ["la cabeza", "el pecho", "el estómago", "la espalda", "el hombro", "el brazo", "la pierna", "la garganta", "la boca", "todo el cuerpo", "donde está la vía", "al moverme"] },
      { e: "🆘", t: "Necesito", next: ["ayuda", "a la enfermera", "al médico", "mis lentes", "mi medicina", "cambiar de posición", "que me limpien", "que me acomoden la almohada", "aire", "silencio", "tiempo", "que me expliquen"] },
      { e: "👀", t: "Quiero ver a", people: true, next: ["mi familia", "el médico", "la enfermera", "mis amigos"] },
      { e: "📞", t: "Llamen a", people: true, next: ["la enfermera", "el médico", "mi familia"] },
      { e: "🙂", t: "Estoy", next: ["bien", "mal", "cansad{o}", "triste", "nervios{o}", "mejor", "peor", "cómod{o}", "incómod{o}", "aburrid{o}", "asustad{o}", "content{o}"] },
      { e: "❓", t: "¿Puedo", next: ["beber?", "comer?", "levantarme?", "dormir?", "ir al baño?", "ver la tele?", "salir?", "tener visitas?", "tomar algo para el dolor?", "irme a casa?"] },
      { e: "💬", t: "Quiero decir que", next: ["gracias", "te quiero", "lo siento", "no entiendo", "sí entiendo", "estoy de acuerdo", "no estoy de acuerdo", "ya está", "esperen", "no es eso", "más despacio"] }
    ],
    modifiers: ["ahora", "por favor", "más tarde", "un poco", "mucho", "otra vez", "despacio", "urgente"]
  },

  /* Frases rápidas del modo Dolor */
  painQuick: [
    { e: "🆕", t: "Es un dolor nuevo" },
    { e: "📈", t: "Está empeorando", s: "El dolor está empeorando" },
    { e: "📉", t: "Está mejorando", s: "El dolor está mejorando" },
    { e: "💊", t: "Quiero algo para el dolor", urgent: true },
    { e: "➖", t: "Es constante", s: "El dolor es constante, no se va" },
    { e: "⏱️", t: "Va y viene", s: "El dolor va y viene" },
    { e: "⚡", t: "Es punzante", s: "El dolor es punzante, como pinchazos" },
    { e: "🔥", t: "Quema", s: "El dolor quema" },
    { e: "🪨", t: "Es una presión", s: "Siento presión u opresión" }
  ],

  /* Caras y palabras para la escala 0–10 (los números con su palabra son lo que anota enfermería) */
  painFaces: ["😀", "🙂", "🙂", "😐", "😐", "😣", "😣", "😖", "😖", "😭", "😭"],
  painLabels: ["sin dolor", "muy leve", "leve", "leve", "moderado", "moderado", "moderado", "fuerte", "fuerte", "muy fuerte", "el peor posible"],

  /* Partes del cuerpo. Coordenadas en un viewBox de 200×440.
     Las etiquetas izquierda/derecha se refieren al cuerpo de la persona, no a la pantalla.
     label = texto en el dibujo; spoken = cómo se lee en el barrido; say = lo que dice al tocarla. */
  body: {
    front: [
      { id: "cabeza", label: "Cabeza", say: "Me duele la cabeza", shape: "ellipse", cx: 100, cy: 42, rx: 32, ry: 36 },
      { id: "cuello", label: "Cuello", spoken: "Cuello o garganta", say: "Me duele el cuello o la garganta", shape: "rect", x: 78, y: 80, w: 44, h: 24, r: 8 },
      { id: "hombro_der", label: "Hombro", spoken: "Hombro derecho", say: "Me duele el hombro derecho", shape: "ellipse", cx: 40, cy: 112, rx: 22, ry: 15 },
      { id: "hombro_izq", label: "Hombro", spoken: "Hombro izquierdo", say: "Me duele el hombro izquierdo", shape: "ellipse", cx: 160, cy: 112, rx: 22, ry: 15 },
      { id: "pecho", label: "Pecho", say: "Me duele el pecho", shape: "rect", x: 58, y: 106, w: 84, h: 62, r: 16 },
      { id: "estomago", label: "Estómago", say: "Me duele el estómago", shape: "rect", x: 60, y: 170, w: 80, h: 56, r: 12 },
      { id: "pelvis", label: "Bajo vientre", spoken: "Bajo vientre", say: "Me duele el bajo vientre", shape: "rect", x: 60, y: 228, w: 80, h: 38, r: 12 },
      { id: "brazo_der", label: "Brazo der.", spoken: "Brazo derecho", say: "Me duele el brazo derecho", shape: "rect", x: 16, y: 130, w: 36, h: 84, r: 15 },
      { id: "mano_der", label: "Mano der.", spoken: "Mano derecha", say: "Me duele la mano derecha", shape: "ellipse", cx: 34, cy: 234, rx: 18, ry: 19 },
      { id: "brazo_izq", label: "Brazo izq.", spoken: "Brazo izquierdo", say: "Me duele el brazo izquierdo", shape: "rect", x: 148, y: 130, w: 36, h: 84, r: 15 },
      { id: "mano_izq", label: "Mano izq.", spoken: "Mano izquierda", say: "Me duele la mano izquierda", shape: "ellipse", cx: 166, cy: 234, rx: 18, ry: 19 },
      { id: "pierna_der", label: "Pierna der.", spoken: "Pierna derecha", say: "Me duele la pierna derecha", shape: "rect", x: 59, y: 268, w: 38, h: 122, r: 15 },
      { id: "pierna_izq", label: "Pierna izq.", spoken: "Pierna izquierda", say: "Me duele la pierna izquierda", shape: "rect", x: 103, y: 268, w: 38, h: 122, r: 15 },
      { id: "pie_der", label: "Pie der.", spoken: "Pie derecho", say: "Me duele el pie derecho", shape: "ellipse", cx: 78, cy: 411, rx: 22, ry: 16 },
      { id: "pie_izq", label: "Pie izq.", spoken: "Pie izquierdo", say: "Me duele el pie izquierdo", shape: "ellipse", cx: 122, cy: 411, rx: 22, ry: 16 }
    ],
    back: [
      { id: "nuca", label: "Nuca", say: "Me duele la nuca", shape: "ellipse", cx: 100, cy: 42, rx: 32, ry: 36 },
      { id: "cuello_atras", label: "Cuello", spoken: "Cuello por detrás", say: "Me duele el cuello por detrás", shape: "rect", x: 78, y: 80, w: 44, h: 24, r: 8 },
      { id: "hombro_izq_atras", label: "Hombro", spoken: "Hombro izquierdo", say: "Me duele el hombro izquierdo por detrás", shape: "ellipse", cx: 40, cy: 112, rx: 22, ry: 15 },
      { id: "hombro_der_atras", label: "Hombro", spoken: "Hombro derecho", say: "Me duele el hombro derecho por detrás", shape: "ellipse", cx: 160, cy: 112, rx: 22, ry: 15 },
      { id: "espalda_alta", label: "Espalda alta", spoken: "Espalda alta", say: "Me duele la espalda, en la parte alta", shape: "rect", x: 58, y: 106, w: 84, h: 62, r: 16 },
      { id: "espalda_baja", label: "Espalda baja", spoken: "Espalda baja", say: "Me duele la espalda, en la parte baja", shape: "rect", x: 60, y: 170, w: 80, h: 56, r: 12 },
      { id: "gluteos", label: "Glúteos", say: "Me duelen los glúteos o el coxis", shape: "rect", x: 60, y: 228, w: 80, h: 38, r: 12 },
      { id: "brazo_izq_atras", label: "Brazo izq.", spoken: "Brazo izquierdo", say: "Me duele el brazo izquierdo por detrás", shape: "rect", x: 16, y: 130, w: 36, h: 84, r: 15 },
      { id: "mano_izq_atras", label: "Mano izq.", spoken: "Mano izquierda", say: "Me duele la mano izquierda", shape: "ellipse", cx: 34, cy: 234, rx: 18, ry: 19 },
      { id: "brazo_der_atras", label: "Brazo der.", spoken: "Brazo derecho", say: "Me duele el brazo derecho por detrás", shape: "rect", x: 148, y: 130, w: 36, h: 84, r: 15 },
      { id: "mano_der_atras", label: "Mano der.", spoken: "Mano derecha", say: "Me duele la mano derecha", shape: "ellipse", cx: 166, cy: 234, rx: 18, ry: 19 },
      { id: "pierna_izq_atras", label: "Pierna izq.", spoken: "Pierna izquierda", say: "Me duele la pierna izquierda por detrás", shape: "rect", x: 59, y: 268, w: 38, h: 122, r: 15 },
      { id: "pierna_der_atras", label: "Pierna der.", spoken: "Pierna derecha", say: "Me duele la pierna derecha por detrás", shape: "rect", x: 103, y: 268, w: 38, h: 122, r: 15 },
      { id: "talon_izq", label: "Talón izq.", spoken: "Talón izquierdo", say: "Me duele el talón izquierdo", shape: "ellipse", cx: 78, cy: 411, rx: 22, ry: 16 },
      { id: "talon_der", label: "Talón der.", spoken: "Talón derecho", say: "Me duele el talón derecho", shape: "ellipse", cx: 122, cy: 411, rx: 22, ry: 16 }
    ]
  },

  /* Letras del teclado en orden alfabético o por frecuencia. Las filas se arman según el ancho
     de la pantalla (7 letras en tablet, 5 en teléfono). "´" pone tilde a la última vocal escrita. */
  keyboardOrder: {
    abc: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "Ñ", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "´"],
    frecuencia: ["E", "A", "O", "S", "R", "N", "I", "D", "L", "C", "T", "U", "M", "P", "B", "G", "V", "Y", "Q", "H", "F", "Z", "J", "Ñ", "X", "K", "W", "´"]
  },

  /* Palabras frecuentes en español para la predicción (se amplían con lo que la persona escribe). */
  words: (
    "de la que el en y a los se del las un por con no una su para es al lo como más pero sus le ya o " +
    "este sí porque esta entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante " +
    "todos uno les ni contra otros ese eso ante ellos e esto mí antes algunos qué unos yo otro otras otra él " +
    "tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros mi mis tú te " +
    "ti tu tus ellas nosotras ustedes vos usted os mío mía míos mías tuyo tuya tuyos tuyas suyo suya suyos " +
    "suyas nuestro nuestra nuestros nuestras esos esas estoy estás está estamos están esté estés estemos estén " +
    "estaré estarás estará estaremos estarán estaría estarías estaríamos estarían estaba estabas estábamos estaban " +
    "estuve estuviste estuvo estuvimos estuvieron he has ha hemos han haya hayas hayamos hayan habré habrás " +
    "habrá habremos habrán habría habrías habríamos habrían había habías habíamos habían soy eres sos es somos " +
    "son sea seas seamos sean seré serás será seremos serán sería serías seríamos serían era eras éramos eran " +
    "fui fuiste fue fuimos fueron tengo tienes tenés tiene tenemos tienen tenga tengas tengamos tengan tendré " +
    "tendrás tendrá tendremos tendrán tendría tendrías tendríamos tendrían tenía tenías teníamos tenían tuve " +
    "tuviste tuvo tuvimos tuvieron " +
    "quiero quieres querés quiere queremos necesito necesita puedo puedes podés puede podemos ayuda ayúdame " +
    "ayudame favor gracias dale listo bueno okey hola adiós buenos días buenas tardes noches bien mal mejor peor " +
    "mucho poco muy más menos ahora luego después antes hoy mañana ayer tarde pronto siempre nunca aquí allí acá " +
    "casa hospital cama baño agua jugo comida comer beber dormir descansar sentarme acostarme levantarme caminar " +
    "mover brazo pierna mano pie cabeza hombro espalda pecho estómago garganta boca ojo ojos oído dolor duele " +
    "fuerte flojo medicina remedio pastilla médico doctor doctora enfermera enfermero kinesiólogo fonoaudióloga " +
    "familia esposa esposo marido mujer hijo hija hijos hermano hermana madre padre mamá papá abuelo abuela " +
    "nieto nieta amigo amiga vecino " +
    "frío calor sed hambre miedo triste alegre contento cansado nervioso tranquilo solo acompañado " +
    "televisión tele música radio teléfono celular llamar ventana luz puerta silla almohada manta frazada sábana " +
    "ropa lentes anteojos audífono dientes cepillo jabón toalla pañal orinar pis defecar vomitar toser respirar " +
    "quizás tal vez claro vale perdón lo siento te quiero " +
    "cuándo dónde cómo quién cuánto por qué " +
    "día semana mes año hora minuto rato tiempo noche " +
    "hablar decir escuchar ver mirar leer escribir pensar recordar olvidar entender saber " +
    "rápido despacio otra vez repite esperen basta terminar seguir " +
    "cuidado suave caliente sucio limpio mojado seco"
  ).split(/\s+/)
};
