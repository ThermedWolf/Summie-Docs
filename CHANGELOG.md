# Summie - Changelog & Status

> Laatste update: augustus 2026  
> Legenda: [x] Gedaan · [ ] Nog te doen · [!] Aandachtspunt

---

## [x] Wat zat er in de v4.1.0 release

### Tekstboxen
- [x] **Randstijlen** - Vijf stijlen: geen rand, doorgetrokken, gestreept, gestippeld, dubbel. Elk met SVG-icoon. Randdikte apart instelbaar.
- [x] **Achtergrondkleur** - Kleurvlak, HEX-invoerveld en opacity-slider. Slider naar 0% = volledig transparant.
- [x] **Schaduw** - Vier niveaus: geen, klein, normaal, groot. Actieve keuze gemarkeerd in toolbar.
- [x] **Verwijderen zonder bevestiging** - Tekstbox en codeblok verwijderen vragen geen bevestiging meer.

### Inhoudsopgave
- [x] **Nieuw element** - Invoegbaar via Invoegen-tabblad. Drie stijlen: Klassiek, Summie, Word.
- [x] **Auto/handmatig bijwerken** - Automatisch bij elke documentwijziging; kan uitgeschakeld worden.
- [x] **Bewerken en verwijderen** - Potlood- en prullenbakknop bij hover.
- [x] **Navigatie** - Klikken op item scrollt soepel naar de bijbehorende kop.
- [x] **Titel aanpasbaar** - Via invoerveld in toolbar.
- [x] **Verschillende stijlen volledig uitgewerkt** - Summie-stijl en Word-stijl zijn volledig geimplementeerd.
- [x] **Auto create en manual** - Handmatige modus is volledig functioneel.

### Inhoud-zijbalk
- [x] **Inklapbare secties** - Chevron-icoon bij koppen met onderliggende subkoppen.
- [x] **Slimme standaardinstelling** - Alle secties dicht bij openen, behalve de huidige.
- [x] **Volgt het document** - Zijbalk past automatisch aan bij scrollen.
- [x] **Nauwkeurige positie-indicator** - Actieve kop volgt de scrollpositie exact.

### Alineatekens
- [x] **Nieuw Weergave-tabblad** - Tussen Invoegen en Wiskunde.
- [x] **Alineatekens tonen** - Via tabblad of Ctrl+Shift+8. Instelling wordt onthouden.

### Toolbar
- [x] **Horizontaal scrollen** - Muiswiel scrolt de toolbar horizontaal. Fade-rand bij overflow.
- [x] **Dropdowns gerepareerd** - Naar hogere DOM-laag verplaatst zodat ze niet afgeknipt worden.
- [x] **Vloeiendere tab-overgang** - Cross-fade van 200ms, zonder onbedoeld uitrekken.

### Bestand-zijbalk
- [x] **Sluit automatisch** - Na opslaan als .sumd, exporteren naar .docx, of laden van document.
- [x] **Juiste hoogte** - Positioneert direct onder de tabbladrij.

### Bestandsgrootte
- [x] **Weergave rechtsonderin** - Toont B, KB of MB. Automatisch bijgewerkt na opslag.
- [x] **Odometer-animatie** - Gewijzigde cijfers rollen in met animatie.

### Opgeslagen-indicator
- [x] **Betrouwbaardere detectie** - Vergelijkt volledige documentinhoud bij elke toetsaanslag en muisklik.
- [x] **Autosave slimmer** - Slaat alleen op bij daadwerkelijke wijzigingen.

### Enter vs. Shift+Enter
- [x] **Duidelijk verschil in regelafstand** - Enter = nieuwe alinea met ruimte. Shift+Enter = nieuwe regel zonder extra ruimte.

### Landing pagina
- [x] **Favorieten in recente documenten** - Favoriete documenten verschijnen nu ook in de recente lijst.
- [x] **Bestand niet gevonden - verbeterde pop-up** - Modal met "nieuw pad opgeven" of "verwijderen uit lijst".

### Begrippen
- [x] **Punten in begrippen** - Begrippen met een punt worden nu correct gehighlight.
- [x] **Code-injectie bescherming** - Invoer wordt gesaneerd.
- [x] **Scrollpositie behouden** - Document springt niet meer terug bij openen/sluiten begrippen-venster.

### Documenten beheren
- [x] **Onthouden tags verwijderen** - Verwijderknop bij elke tag-suggestie om hem permanent te verwijderen.

### Overige bugfixes
- [x] **Bestandsnaam wijzigen** - Hernoemen verwijdert het oude bestand en maakt het nieuwe correct aan.
- [x] **Opslaan naar verdwenen pad** - Pop-up met keuze: opnieuw aanmaken of nieuw pad kiezen.
- [x] **Lege koppen in zijbalk** - Lege kop-alinea verdwijnt uit zijbalk zodra cursor weggaat.
- [x] **DevTools sneltoets** - Ctrl+Shift+I opent de ontwikkelaarsconsole.

---

## [x] Wat is gedaan tijdens de v4.1.0 bugfix/update sessies

### Bug fixes & improvements
- [x] **Bestandsnaam in Windows Verkenner** - `.sumd` bestandstype-omschrijving gewijzigd van "Summie Summary Document" naar "Summie Document".
- [x] **"Opslaan als"-knoppen volledige breedte** - Dropdown-menu krijgt een vaste breedte.
- [x] **Autocomplete sluit bij cursor-verlaten** - Sluit bij klikken in de editor en bij navigatietoetsen.
- [x] **Bestand verwijderen van schijf vanuit landing pagina** - Native confirm vervangen door custom modal.
- [x] **Begrip-highlights niet opslaan in bestand** - Opslaan verwijdert highlight-spans uit de documentinhoud.
- [x] **Installer: "Vastpinnen aan taakbalk" verwijderd** - Nieuwe iconencache-refresh na installatie/reparatie.
- [x] **PDF-export en afdrukken gerepareerd** - Gebruikt de juiste IPC/print-dialogen, geen lege laatste pagina meer.
- [x] **Begrippen met punt worden niet gehighlight** - RegExp `lastIndex`-bug opgelost.
- [x] **Code-injectie bescherming begrippen** - HTML-escaping toegevoegd voor rendering.
- [x] **Nieuw begrip scrollt editor naar boven** - Cursorpositie wordt bewaard en hersteld.
- [x] **Naam wijzigen maakt nieuw bestand aan** - Bestaande entry wordt in-place bijgewerkt, geen dubbele entries meer.
- [x] **Bestand bestaat niet meer bij opslaan** - Pop-up met duidelijke keuzes.
- [x] **Landing: bestand niet gevonden** - Pop-up met duidelijke keuzes.
- [x] **Lege paragraaf in inhoud-tab** - Volledige stijl-reset in plaats van gedeeltelijke.
- [x] **Favorieten in recente documenten** - Favorieten die niet in de recents staan worden meegenomen.
- [x] **Enter/Shift+Enter regelafstand** - Regelafstand verlaagd en consistent gemaakt.
- [x] **Alle Electron pop-ups vervangen door custom modals** - Nieuwe `dialogs.js` module, focus wordt correct hersteld.
- [x] **Horizontaal scrollen context-tabs** - Lazy-geladen context-tab panels ondersteunen horizontaal scrollen.
- [x] **Installer icoon** - Apart bestand voor installeraanzicht.
- [x] **.sumd icoon-cache refresh** - Windows toont het nieuwe icoon direct na installatie.
- [x] **Tabslider en bestand-zijbalk timing** - Timing-probleem bij tab-wissel/sidebar openen opgelost.

### Tekstbox - volledig herzien
- [x] **Zwevend/in-tekst toggle werkt correct**
- [x] **Cursor altijd na in-tekst box**
- [x] **Ctrl+A selecteert alleen textbox-inhoud**
- [x] **Nieuwe textbox zonder schaduw**
- [x] **Word-stijl resize handles**
- [x] **Geen blauwe rand tijdens bewerken**
- [x] **Niet buiten documentmarges bij in-tekst**
- [x] **Niet buiten documentmarges bij zwevend**
- [x] **Placeholder-tekst correct**
- [x] **Hoekradius instelbaar**
- [x] **Opacity-slider en "In tekst"-tekst wrappen niet meer**

---

## [x] Latere features na v4.1.0

### Zoekvenster (Ctrl+F / Ctrl+H) - Zoeken & Vervangen
- [x] **Volledig nieuw, zwevend zoekpaneel** - VS Code-stijl paneel rechtsboven in het document.
- [x] **Ctrl+F / Ctrl+H** - Ctrl+F opent zoeken, Ctrl+H opent direct zoeken en vervangen.
- [x] **Zoekopties** - Hoofdlettergevoelig, heel woord en reguliere expressie.
- [x] **Navigatie** - Volgende/vorige match via knoppen, Enter en Shift+Enter.
- [x] **Vervangen** - Een voor een of alles tegelijk.
- [x] **Regex-foutafhandeling** - Duidelijke foutmelding bij ongeldige expressie.
- [x] **Highlights worden nooit opgeslagen** - Zoekmarkeringen worden voor opslaan verwijderd.
- [x] **Documentatiepagina** - Losse uitlegpagina voor zoeken/vervangen.

### Zoeken met aliassen
- [x] **Aliassen meenemen in zoekresultaten** - De begrippen-zijbalk zoekt ook in aliassen.

### Afbeeldingen
- [x] **Contexttab "Afbeelding"** - Verschijnt automatisch zodra een afbeelding geselecteerd wordt.
- [x] **Grootte aanpassen** - Breedte/hoogte-invoervelden met aspect-ratio lock.
- [x] **Herstellen naar origineel** - Breedte en hoogte kunnen terug naar de uploadwaarden.
- [x] **Alt-tekst uit contexttab verwijderd** - Contexttab blijft gericht op opmaak en positionering.
- [x] **Verwijderen** - Afbeelding inclusief wrapper verwijderen.
- [x] **Selectie blijft actief** - Klikken in contexttab of na resize/drag deselecteert de afbeelding niet meer.
- [x] **Klik dan slepen** - Eerste klik selecteert; pas daarna kan de afbeelding versleept worden.
- [x] **Meerdere afbeeldingen** - Uploaden van een tweede afbeelding breekt de app niet meer.
- [x] **Positionering** - In tekst, voor tekst, achter tekst, rondom tekst, boven/onder tekst en zwevend.
- [x] **Altijd resizebaar** - Resize werkt in alle positioneringsmodi.
- [x] **Laagvolgorde** - Afbeeldingen kunnen naar voor- en achtergrond.

### Vormen
- [x] **Word-achtige vormen** - Rechthoek, afgeronde rechthoek, cirkel, ovaal, driehoek, ruit, lijn en pijl.
- [x] **Verplaatsen en resize** - Vormen kunnen geselecteerd, verplaatst en geschaald worden.
- [x] **Resize handles** - Handles sluiten strak aan op de vorm-wrapper.
- [x] **Shift-resize** - Oorspronkelijke verhouding blijft behouden bij Shift.
- [x] **Stijlen aanpassen** - Opvulling, lijnkleur en lijnstijl via contexttab.
- [x] **Opslaan en heropenen** - Vormen blijven verstelbaar na opnieuw openen.
- [x] **Laagvolgorde** - Vormen kunnen naar voor- en achtergrond.
- [x] **Document typen blijft werken** - Vormen verdwijnen niet meer wanneer je in het document typt.
- [x] **DOCX-export** - Vormen worden als native Word-tekenobjecten geexporteerd.

### Wachtwoord-beveiligde documenten
- [x] **Wachtwoord instellen/verwijderen** - Via de bestand-zijbalk.
- [x] **AES-encryptie** - Beveiligde documenten worden versleuteld opgeslagen.
- [x] **Live wachtwoordcontrole** - Bevestiging wordt live vergeleken; submit is uitgeschakeld bij mismatch.
- [x] **Custom dialogs** - Wachtwoord-flow gebruikt de Summie dialog-stijl.

### Paginering
- [x] **Word-stijl vaste A4-pagina's** - Document wordt verdeeld over vaste pagina's.
- [x] **Automatische pagina's bij overflow** - Nieuwe pagina's ontstaan wanneer tekst niet meer past.
- [x] **Ctrl+Enter pagina-einde** - Maakt een nieuwe pagina aan en verplaatst de cursor.
- [x] **Pagina-einde knop in Bewerken** - Zichtbaar wanneer paginering actief is.
- [x] **Ctrl+Enter zonder paginering** - Gedraagt zich als normale Enter.
- [x] **Pagina's blijven stabiel tijdens typen** - Bestaande pagina's worden hergebruikt zodat ze niet flikkeren.
- [x] **Rustigere scroll bij pagina-einde** - Nieuwe cursorregel komt comfortabel in beeld zonder grote sprong.
- [x] **Pagina-labels niet typebaar** - Labels blijven buiten de documenttekst.
- [x] **Placeholder en eerste typeregel uitgelijnd** - Eerste tekstregel verschuift niet meer na typen.

---

## [ ] Wat moet nog gedaan worden

Geen openstaande features uit deze changelog.

---

## [!] Let op bij de volgende build

- **`app/installer-icon.ico`** moet aanwezig blijven als apart bestand voor het installer-icoontje.
- **`dialogs.js`** moet in `app/js/core/` staan en meegekopieerd worden naar de build.
- **`state.js`** moet als eerste in de Core-sectie geladen blijven worden.
- **`find-replace.js`** en **`find-replace.css`** moeten meegekopieerd worden naar de build.
- **`image-controls.js`** moet meegekopieerd worden naar de build.
- **`shapes.js`** moet meegekopieerd worden naar de build.
- **`protection.js`** moet meegekopieerd worden naar de build.
- **`pagemanager.js`** bevat nu de Word-stijl paginering en moet geladen blijven voor sidebar, opslaan en export.

---

*Bijgewerkt op basis van de afgeronde features uit de latere sessies: afbeeldingen, vormen, wachtwoordbeveiliging en paginering.*
