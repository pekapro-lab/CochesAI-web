# CochesAI · Carreras multijugador

Juego de carreras 3D para el navegador. Se juega **en el ordenador y en el móvil** (Android e iOS, con controles táctiles) y **con amigos mediante un código de sala**. No necesita instalar nada, ni cuentas, ni APIs de pago.

▶️ **Jugar:** https://pekapro-lab.github.io/CochesAI-web/

## Cómo se juega
- **Carrera rápida:** elige circuito, número de rivales (0–5) y dificultad (Fácil, Normal o Difícil).
- **Con amigos:** uno pulsa **Crear sala** y comparte el código de 5 letras. Los demás lo escriben y pulsan **Unirse**. El anfitrión elige el circuito y pulsa **Empezar carrera**. Los huecos libres, hasta 6 coches, se rellenan con rivales de IA.
- **Teclado:** WASD o flechas · Espacio freno de mano · C cámara · R recolocar · P/Esc pausa.
- **Móvil:** joystick para girar, ▲ acelerar, ▼ frenar o marcha atrás, freno de mano.

## Rivales con IA propia (sin Gemini ni otras APIs de pago)
Los rivales van controlados por código que se ejecuta en tu navegador:
- Siguen una línea ideal calculada para cada circuito y miran más lejos cuanto más rápido van.
- Frenan antes de las curvas según la velocidad máxima de cada tramo.
- Adelantan y esquivan a los demás coches.
- Tienen una "goma elástica" suave para que la carrera esté reñida.
- Hay 3 dificultades y 7 personalidades: Rayo, Tortuga Zen, Chispa, Bruma, Toro, Lince y Nube.

## Multijugador
Las partidas son entre navegadores (WebRTC con [PeerJS](https://peerjs.com/)), usando el servidor público y gratuito de PeerJS para encontrar la sala y el STUN público de Google. El anfitrión manda en la sala: decide la salida sincronizada, cuenta las vueltas, lleva la clasificación y mueve a los bots. Cada jugador envía la posición de su coche unas 20 veces por segundo, y los coches de los demás se muestran suavizados.

> Algunas redes móviles muy restrictivas pueden bloquear las conexiones directas entre jugadores. En ese caso, prueba con otra red Wi‑Fi.

## Desarrollo
```bash
npm install
npm run dev        # servidor local
npm run build      # genera dist/ (base /CochesAI-web/)
npm run test:all   # tests con Playwright: suelo, muros, vueltas, IA y multijugador
```
Tecnología: Vite, Three.js y cannon-es. El motor de conducción y los circuitos vienen de Peka-R.
El sitio se publica en GitHub Pages con el workflow `.github/workflows/pages.yml`.
