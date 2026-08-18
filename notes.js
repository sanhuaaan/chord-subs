// Cómo se escriben los doce sonidos. El mismo sonido admite más de un nombre
// (C# y Db son el mismo traste) y cuál es el correcto depende de para qué se
// escriba, así que aquí conviven las dos respuestas que da la app, separadas a
// propósito: tocar una no debe arrastrar a la otra.
//
// Hay una tercera, la que usa chords-db para indexar sus diagramas, y vive
// dentro de guitar.js porque no es una decisión nuestra sino de esa base de
// datos. Si algún día coinciden las tres es casualidad, no un motivo para
// fundirlas.

// Notas sueltas y fundamentales de acorde: en guitarra se leen con sostenidos
// (nadie llama Gb al segundo traste de la 6ª).
export const NOTES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

// Nombres de tonalidad: Db mayor (cinco bemoles) y no C# mayor (siete
// sostenidos). Es el nombre del tono el que decide cómo se escribe todo lo
// demás al transponer, así que esta tabla manda sobre la progresión entera.
export const KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

// Nombrar un sonido venga de donde venga (un croma, un MIDI, una resta que se
// ha ido por debajo de cero).
export const noteName = chroma => NOTES[((chroma % 12) + 12) % 12];
