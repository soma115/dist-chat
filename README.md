# Distributed Chat

Rozproszona aplikacja PWA do czatowania i głosowania. Każdy klient to węzeł P2P połączony bezpośrednio z innymi przez WebRTC.

## Funkcje

- **P2P** – każde urządzenie to węzeł sieci.
- **Czat** – wiadomości rozchodzą się automatycznie do członków grupy.
- **Głosowania** – tworzenie ankiet, głosowanie, liczenie wyników lokalnie.
- **Grupy** – grupa powstaje, gdy dwie osoby wzajemnie potwierdzą znajomość.
- **UUID** – każdy węzeł ma unikalny identyfikator do zapraszania znajomych.

## Uruchomienie

Wystaw pliki przez lokalny serwer HTTPS (np. GitHub Pages), otwórz stronę na telefonie i dodaj do ekranu głównego.

```bash
python -m http.server 8080
```

## Testy

```bash
npm install
npm run server &
npm test
```
