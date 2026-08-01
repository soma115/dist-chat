Stwórz od zera rozproszoną aplikację (najlepiej jako PWA, działającą w przeglądarce) do czatowania i głosowania, w której nie ma żadnego centralnego serwera pośredniczącego w wymianie wiadomości — każde urządzenie użytkownika jest równorzędnym węzłem sieci, połączonym bezpośrednio z innymi węzłami.

Założenia i funkcje, jakie aplikacja powinna realizować:

- Każdy użytkownik/węzeł ma unikalny identyfikator, po którym inni mogą go rozpoznać i zaprosić do sieci.
- Użytkownicy mogą nawiązywać ze sobą bezpośrednie połączenia (peer-to-peer), bez pośrednictwa własnego backendu przechowującego dane aplikacji.
- Grupa (krąg znajomych) powstaje organicznie: gdy dwie osoby wzajemnie potwierdzą, że się znają/chcą być połączone, stają się „znajomymi”, a znajomi tworzą wspólną sieć/grupę — nawet jeśli nie wszyscy są połączeni ze sobą bezpośrednio, powinni móc dotrzeć do siebie za pośrednictwem wspólnych znajomych.
- W ramach takiej grupy użytkownicy mogą prowadzić czat — wiadomości powinny docierać do wszystkich członków grupy, również tych, z którymi nie ma się bezpośredniego połączenia.
- Użytkownicy mogą też tworzyć głosowania/ankiety w swojej grupie, głosować w nich i widzieć wyniki, liczone lokalnie na podstawie napływających głosów.
- Dane każdego użytkownika (tożsamość, znajomi, wiadomości, ankiety) powinny przetrwać zamknięcie i ponowne otwarcie aplikacji na tym samym urządzeniu.
- Aplikacja powinna dobrze działać na telefonie i dać się zainstalować/dodać do ekranu głównego jak natywna aplikacja.

Nie narzucaj konkretnych technologii, frameworków ani architektury — masz pełną swobodę w doborze sposobu implementacji, byle spełniał powyższe założenia w sposób prosty, niezawodny i łatwy w utrzymaniu. Zadbaj o to, żeby kluczowe scenariusze (nawiązywanie połączeń, zapraszanie znajomych, docieranie wiadomości i głosów do całej grupy niezależnie od tego, kto z kim jest bezpośrednio połączony) były przetestowane i rzeczywiście działały, a nie tylko wyglądały na działające w prostym scenariuszu dwóch urządzeń.
