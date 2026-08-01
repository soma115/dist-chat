# Distributed Chat & Voting

Rozproszona aplikacja mobilna P2P do czatowania i głosowania. Każdy klient to samodzielny węzeł sieci. Połączenia są bezpośrednie między urządzeniami dzięki WebRTC (data channel).

## Funkcje

- **Węzły P2P** – każde urządzenie jest pełnoprawnym węzłem.
- **Czat** – wiadomości rozchodzą się automatycznie po sieci (gossip) do wszystkich znajomych w grupie.
- **Głosowania** – tworzenie ankiet, oddawanie głosów, liczenie wyników lokalnie na każdym węźle.
- **Grupy** – grupa powstaje, gdy dwie osoby wzajemnie potwierdzą znajomość. Aplikacja buduje graf znajomości i pokazuje spójną składową (grupę) do której należysz.
- **UUID i QR** – każdy węzeł ma swój UUID. Można go skopiować, zeskanować z ekranu lub wpisać, aby wysłać prośbę o znajomość. SDP do połączenia WebRTC można wyświetlić/skanować jako kod QR.

## Szybki start

1. Wystaw pliki przez HTTPS (WebRTC wymaga bezpiecznego kontekstu na telefonie).
   Przykład z `npx local-web-server`:
   ```bash
   npx local-web-server --https --directory . --port 8080
   ```
   Lub wrzuć katalog na GitHub Pages / Netlify / Vercel.

2. Otwórz stronę na telefonie i dodaj do ekranu głównego (PWA).

3. Wpisz imię / nick, a następnie połącz się z innym węzłem:
   - osoba A klika **Stwórz zaproszenie** i przesyła kod SDP osobie B (np. przez komunikator);
   - osoba B klika **Akceptuj zaproszenie**, wkleja kod, a następnie przesyła swoją odpowiedź SDP z powrotem do A;
   - osoba A wkleja odpowiedź i klika **Sfinalizuj połączenie**.

4. Gdy połączenie jest gotowe, jedna osoba wysyła prośbę o dodanie do znajomych, druga akceptuje – wtedy tworzy się grupa. Wiadomości i głosowania rozchodzą się po całej grupie.

## Ograniczenia prototypu

- Sygnalizacja WebRTC (wymiana SDP) odbywa się ręcznie. Docelowo można zastąpić ją QR/NFC czy lokalnym wysyłaniem plików.
- Przejście przez NAT wymaga TURN; obecnie używany jest publiczny STUN.
- To demonstracja koncepcji, nie produkcyjna aplikacja.
