/* Talk Again — vocabulario por defecto (español).
   Cada categoría: id, nombre, emoji, clase de color (clave de Fitzgerald) e items.
   Item: e = emoji mostrado, t = texto en el botón, s = texto que se pronuncia (si falta, se usa t),
   urgent = resalta el borde en rojo. */
window.TA_DATA = {
  version: "0.1.0",

  categories: [
    {
      id: "rapidas", name: "Rápidas", emoji: "⚡", k: "k-social",
      items: [
        { e: "👍", t: "Sí" },
        { e: "👎", t: "No" },
        { e: "🤷", t: "No sé" },
        { e: "✋", t: "Espera", s: "Espera un momento, por favor" },
        { e: "🔁", t: "Otra vez", s: "Repite, por favor" },
        { e: "🙏", t: "Gracias" },
        { e: "🙂", t: "Estoy bien" },
        { e: "🆘", t: "Ayuda", s: "Necesito ayuda", urgent: true },
        { e: "👋", t: "Hola" },
        { e: "😘", t: "Te quiero" },
        { e: "🚪", t: "Quiero estar solo", s: "Quiero estar solo un rato" },
        { e: "💤", t: "Déjame descansar", s: "Déjame descansar, por favor" }
      ]
    },
    {
      id: "necesidades", name: "Necesidades", emoji: "🧴", k: "k-action",
      items: [
        { e: "💧", t: "Tengo sed", s: "Tengo sed, quiero agua" },
        { e: "🍽️", t: "Tengo hambre" },
        { e: "🚻", t: "Quiero ir al baño", urgent: true },
        { e: "🤕", t: "Tengo dolor", s: "Tengo dolor", urgent: true },
        { e: "🥶", t: "Tengo frío" },
        { e: "🥵", t: "Tengo calor" },
        { e: "😴", t: "Quiero dormir" },
        { e: "🔄", t: "Cambiar de posición", s: "Quiero cambiar de posición" },
        { e: "🪑", t: "Quiero sentarme" },
        { e: "🛏️", t: "Quiero acostarme" },
        { e: "💊", t: "Mi medicina", s: "Quiero mi medicina" },
        { e: "👓", t: "Mis gafas", s: "Necesito mis gafas" },
        { e: "🚿", t: "Quiero bañarme" },
        { e: "🪥", t: "Lavarme los dientes", s: "Quiero lavarme los dientes" },
        { e: "🤢", t: "Tengo náuseas", urgent: true },
        { e: "😵‍💫", t: "Estoy mareado" },
        { e: "😮‍💨", t: "No respiro bien", s: "No puedo respirar bien", urgent: true },
        { e: "🧻", t: "Limpiarme", s: "Necesito que me limpien" },
        { e: "🩹", t: "Me molesta algo", s: "Me molesta algo en el cuerpo" },
        { e: "🔇", t: "Menos ruido", s: "Hay mucho ruido, por favor bajen el volumen" },
        { e: "💡", t: "Luz", s: "Quiero cambiar la luz" },
        { e: "🪟", t: "Ventana", s: "Quiero abrir o cerrar la ventana" }
      ]
    },
    {
      id: "sentimientos", name: "Sentimientos", emoji: "💙", k: "k-feel",
      items: [
        { e: "🙂", t: "Estoy bien" },
        { e: "😢", t: "Estoy triste" },
        { e: "😠", t: "Estoy enojado" },
        { e: "😨", t: "Tengo miedo" },
        { e: "😤", t: "Estoy frustrado", s: "Estoy frustrado, no me entienden" },
        { e: "😩", t: "Estoy cansado" },
        { e: "😟", t: "Estoy preocupado" },
        { e: "🥱", t: "Estoy aburrido" },
        { e: "😌", t: "Estoy tranquilo" },
        { e: "😔", t: "Me siento solo" },
        { e: "🤗", t: "Quiero compañía" },
        { e: "❤️", t: "Te quiero mucho" },
        { e: "😂", t: "Me da risa", s: "Me da risa" },
        { e: "😕", t: "No entiendo" }
      ]
    },
    {
      id: "personas", name: "Personas", emoji: "👥", k: "k-people",
      items: [
        { e: "👩‍⚕️", t: "Enfermera", s: "Llama a la enfermera, por favor" },
        { e: "🩺", t: "Médico", s: "Quiero hablar con el médico" },
        { e: "🗣️", t: "Logopeda", s: "Quiero ver al logopeda o fonoaudiólogo" },
        { e: "👨‍👩‍👧", t: "Mi familia", s: "Quiero ver a mi familia" },
        { e: "📞", t: "Llamar a alguien", s: "Quiero llamar a alguien por teléfono" },
        { e: "❓", t: "¿Quién eres?", s: "¿Quién eres?" }
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
        { e: "🏠", t: "¿Cuándo vuelvo a casa?", s: "¿Cuándo vuelvo a casa?" },
        { e: "🩺", t: "¿Qué dijo el médico?" },
        { e: "👥", t: "¿Quién viene hoy?" },
        { e: "❓", t: "¿Qué me pasa?", s: "¿Qué me pasa? Explícamelo" },
        { e: "💊", t: "¿Qué medicina es?", s: "¿Qué medicina es esta y para qué sirve?" },
        { e: "📍", t: "¿Dónde estoy?" },
        { e: "⏳", t: "¿Cuánto falta?", s: "¿Cuánto tiempo falta?" },
        { e: "🗣️", t: "¿Voy a volver a hablar?", s: "¿Voy a volver a hablar?" }
      ]
    },
    {
      id: "salud", name: "Salud", emoji: "🏥", k: "k-health",
      items: [
        { e: "🛎️", t: "Llamen a la enfermera", s: "Llamen a la enfermera, por favor", urgent: true },
        { e: "💊", t: "Algo para el dolor", s: "Necesito algo para el dolor", urgent: true },
        { e: "🤒", t: "Tengo fiebre", s: "Creo que tengo fiebre" },
        { e: "💉", t: "Me duele la vía", s: "Me duele donde tengo la vía o la aguja" },
        { e: "🩹", t: "El vendaje", s: "Me molesta el vendaje" },
        { e: "😵", t: "Me siento peor", s: "Me siento peor que antes", urgent: true },
        { e: "😊", t: "Me siento mejor" },
        { e: "🤧", t: "Quiero sonarme", s: "Quiero sonarme la nariz" },
        { e: "👄", t: "Boca seca", s: "Tengo la boca seca" },
        { e: "🧠", t: "Me cuesta pensar", s: "Me cuesta pensar y concentrarme" },
        { e: "👁️", t: "Veo mal", s: "No veo bien" },
        { e: "👂", t: "No oigo bien" }
      ]
    }
  ],

  /* Frases rápidas del modo Dolor */
  painQuick: [
    { e: "🆕", t: "Es un dolor nuevo", s: "Es un dolor nuevo" },
    { e: "📈", t: "Está empeorando", s: "El dolor está empeorando" },
    { e: "📉", t: "Está mejorando", s: "El dolor está mejorando" },
    { e: "💊", t: "Quiero algo para el dolor", s: "Quiero algo para el dolor", urgent: true },
    { e: "⚡", t: "Es punzante", s: "El dolor es punzante, como pinchazos" },
    { e: "🔥", t: "Quema", s: "El dolor quema" },
    { e: "🪨", t: "Es una presión", s: "Siento presión u opresión" },
    { e: "⏱️", t: "Va y viene", s: "El dolor va y viene" }
  ],

  /* Caras y descripción para la escala 0–10 */
  painFaces: ["😀", "🙂", "🙂", "😐", "😐", "😣", "😣", "😖", "😖", "😭", "😭"],

  /* Partes del cuerpo. Coordenadas en un viewBox de 200×440.
     Las etiquetas izquierda/derecha se refieren al cuerpo de la persona, no a la pantalla. */
  body: {
    front: [
      { id: "cabeza", label: "Cabeza", say: "Me duele la cabeza", shape: "ellipse", cx: 100, cy: 44, rx: 32, ry: 38 },
      { id: "cuello", label: "Cuello", say: "Me duele el cuello o la garganta", shape: "rect", x: 80, y: 82, w: 40, h: 20, r: 7 },
      { id: "pecho", label: "Pecho", say: "Me duele el pecho", shape: "rect", x: 55, y: 102, w: 90, h: 66, r: 16 },
      { id: "estomago", label: "Estómago", say: "Me duele el estómago", shape: "rect", x: 60, y: 170, w: 80, h: 56, r: 12 },
      { id: "pelvis", label: "Bajo vientre", say: "Me duele el bajo vientre", shape: "rect", x: 60, y: 228, w: 80, h: 38, r: 12 },
      { id: "brazo_der", label: "Brazo der.", say: "Me duele el brazo derecho", shape: "rect", x: 16, y: 104, w: 34, h: 108, r: 15 },
      { id: "mano_der", label: "Mano der.", say: "Me duele la mano derecha", shape: "ellipse", cx: 33, cy: 232, rx: 17, ry: 18 },
      { id: "brazo_izq", label: "Brazo izq.", say: "Me duele el brazo izquierdo", shape: "rect", x: 150, y: 104, w: 34, h: 108, r: 15 },
      { id: "mano_izq", label: "Mano izq.", say: "Me duele la mano izquierda", shape: "ellipse", cx: 167, cy: 232, rx: 17, ry: 18 },
      { id: "pierna_der", label: "Pierna der.", say: "Me duele la pierna derecha", shape: "rect", x: 61, y: 268, w: 36, h: 122, r: 15 },
      { id: "pierna_izq", label: "Pierna izq.", say: "Me duele la pierna izquierda", shape: "rect", x: 103, y: 268, w: 36, h: 122, r: 15 },
      { id: "pie_der", label: "Pie der.", say: "Me duele el pie derecho", shape: "ellipse", cx: 79, cy: 410, rx: 21, ry: 15 },
      { id: "pie_izq", label: "Pie izq.", say: "Me duele el pie izquierdo", shape: "ellipse", cx: 121, cy: 410, rx: 21, ry: 15 }
    ],
    back: [
      { id: "nuca", label: "Nuca", say: "Me duele la nuca", shape: "ellipse", cx: 100, cy: 44, rx: 32, ry: 38 },
      { id: "cuello_atras", label: "Cuello", say: "Me duele el cuello por detrás", shape: "rect", x: 80, y: 82, w: 40, h: 20, r: 7 },
      { id: "espalda_alta", label: "Espalda alta", say: "Me duele la espalda, en la parte alta", shape: "rect", x: 55, y: 102, w: 90, h: 66, r: 16 },
      { id: "espalda_baja", label: "Espalda baja", say: "Me duele la espalda, en la parte baja", shape: "rect", x: 60, y: 170, w: 80, h: 56, r: 12 },
      { id: "gluteos", label: "Glúteos", say: "Me duelen los glúteos o el coxis", shape: "rect", x: 60, y: 228, w: 80, h: 38, r: 12 },
      { id: "brazo_izq_atras", label: "Brazo izq.", say: "Me duele el brazo izquierdo por detrás", shape: "rect", x: 16, y: 104, w: 34, h: 108, r: 15 },
      { id: "mano_izq_atras", label: "Mano izq.", say: "Me duele la mano izquierda", shape: "ellipse", cx: 33, cy: 232, rx: 17, ry: 18 },
      { id: "brazo_der_atras", label: "Brazo der.", say: "Me duele el brazo derecho por detrás", shape: "rect", x: 150, y: 104, w: 34, h: 108, r: 15 },
      { id: "mano_der_atras", label: "Mano der.", say: "Me duele la mano derecha", shape: "ellipse", cx: 167, cy: 232, rx: 17, ry: 18 },
      { id: "pierna_izq_atras", label: "Pierna izq.", say: "Me duele la pierna izquierda por detrás", shape: "rect", x: 61, y: 268, w: 36, h: 122, r: 15 },
      { id: "pierna_der_atras", label: "Pierna der.", say: "Me duele la pierna derecha por detrás", shape: "rect", x: 103, y: 268, w: 36, h: 122, r: 15 },
      { id: "talon_izq", label: "Talón izq.", say: "Me duele el talón izquierdo", shape: "ellipse", cx: 79, cy: 410, rx: 21, ry: 15 },
      { id: "talon_der", label: "Talón der.", say: "Me duele el talón derecho", shape: "ellipse", cx: 121, cy: 410, rx: 21, ry: 15 }
    ]
  },

  /* Filas del teclado. "´" pone tilde a la última vocal escrita. */
  keyboardRows: {
    abc: [
      ["A", "B", "C", "D", "E", "F", "G"],
      ["H", "I", "J", "K", "L", "M", "N"],
      ["Ñ", "O", "P", "Q", "R", "S", "T"],
      ["U", "V", "W", "X", "Y", "Z", "´"]
    ],
    frecuencia: [
      ["E", "A", "O", "S", "R", "N", "I"],
      ["D", "L", "C", "T", "U", "M", "P"],
      ["B", "G", "V", "Y", "Q", "H", "F"],
      ["Z", "J", "Ñ", "X", "K", "W", "´"]
    ]
  },

  /* Palabras frecuentes en español para la predicción (se amplían con lo que la persona escribe). */
  words: (
    "de la que el en y a los se del las un por con no una su para es al lo como más pero sus le ya o " +
    "este sí porque esta entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante " +
    "todos uno les ni contra otros ese eso ante ellos e esto mí antes algunos qué unos yo otro otras otra él " +
    "tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros mi mis tú te " +
    "ti tu tus ellas nosotras vosotros vosotras os mío mía míos mías tuyo tuya tuyos tuyas suyo suya suyos " +
    "suyas nuestro nuestra nuestros nuestras vuestro vuestra vuestros vuestras esos esas estoy estás está " +
    "estamos estáis están esté estés estemos estéis estén estaré estarás estará estaremos estaréis estarán " +
    "estaría estarías estaríamos estaríais estarían estaba estabas estábamos estabais estaban estuve " +
    "estuviste estuvo estuvimos estuvisteis estuvieron he has ha hemos habéis han haya hayas hayamos hayáis " +
    "hayan habré habrás habrá habremos habréis habrán habría habrías habríamos habríais habrían había habías " +
    "habíamos habíais habían soy eres es somos sois son sea seas seamos seáis sean seré serás será seremos " +
    "seréis serán sería serías seríamos seríais serían era eras éramos erais eran fui fuiste fue fuimos " +
    "fuisteis fueron tengo tienes tiene tenemos tenéis tienen tenga tengas tengamos tengáis tengan tendré " +
    "tendrás tendrá tendremos tendréis tendrán tendría tendrías tendríamos tendríais tendrían tenía tenías " +
    "teníamos teníais tenían tuve tuviste tuvo tuvimos tuvisteis tuvieron " +
    "quiero quieres quiere queremos necesito necesita puedo puedes puede podemos ayuda ayúdame favor gracias " +
    "hola adiós buenos días buenas tardes noches bien mal mejor peor mucho poco muy más menos ahora luego " +
    "después antes hoy mañana ayer tarde pronto siempre nunca aquí allí casa hospital cama baño agua comida " +
    "comer beber dormir descansar sentarme acostarme levantarme caminar mover brazo pierna mano pie cabeza " +
    "espalda pecho estómago garganta boca ojo ojos oído dolor duele dolor fuerte flojo medicina pastilla " +
    "médico doctor doctora enfermera enfermero familia esposa esposo marido mujer hijo hija hijos hermano " +
    "hermana madre padre mamá papá abuelo abuela nieto nieta amigo amiga vecino " +
    "frío calor sed hambre miedo triste alegre contento cansado nervioso tranquilo solo acompañado " +
    "televisión tele música radio teléfono llamar ventana luz puerta silla cama almohada manta sábana ropa " +
    "gafas lentes audífono dientes cepillo jabón toalla pañal orinar cagar vomitar toser respirar " +
    "sí no quizás tal vez claro vale bueno perdón lo siento por favor te quiero gracias " +
    "cuándo dónde cómo qué quién cuánto por qué " +
    "día semana mes año hora minuto rato tiempo noche " +
    "hablar decir escuchar ver mirar leer escribir pensar recordar olvidar entender saber " +
    "mañana tarde noche rápido despacio otra vez repite espera basta ya terminar seguir " +
    "cuidado despacio suave fuerte caliente frío sucio limpio mojado seco"
  ).split(/\s+/)
};
